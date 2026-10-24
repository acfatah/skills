import { join } from "node:path";
import { type Config, type ProjectConfig, type RemoteDb, readConfig, resolveToken } from "./config.ts";
import { CliError, Offline, sentence } from "./errors.ts";
import type { DbName } from "./ids.ts";
import { FILES, type Location, prepareFile } from "./location.ts";
import { getSync, refreshMirror, resolvePid, setSync } from "./mirror.ts";
import { Outbox, replay } from "./outbox.ts";
import { projectKey } from "./project.ts";
import { migrate } from "./schema.ts";
import { LocalStore } from "./store/local.ts";
import { TursoStore } from "./store/turso.ts";
import type { Store } from "./store/types.ts";

export function dbFile(db: DbName): string {
  return db === "security" ? FILES.security : FILES.issues;
}

export async function openLocal(loc: Location, db: DbName): Promise<LocalStore> {
  const store = new LocalStore(prepareFile(loc, dbFile(db)));
  await migrate(store);
  return store;
}

export interface RunCtx {
  // Maps a provisional id to its real one, once it has been replayed.
  pid: (pid: number) => Promise<number>;
}

export interface QueueCtx {
  mirror: LocalStore;
  outbox: Outbox;
  nextPid: () => Promise<number>;
}

export interface RunOpts<T> {
  // A write fails offline unless it can queue (new and note only, D7).
  write?: boolean;
  queue?: (q: QueueCtx) => Promise<T>;
  // A read of something only the outbox knows, such as show P1.
  offlineRead?: (q: QueueCtx) => Promise<T>;
}

export class Backend {
  readonly config: Config;
  readonly key: string | null;
  // Databases read from the mirror in this command, with their synced_at.
  readonly offline = new Map<DbName, string>();

  constructor(
    readonly loc: Location,
    readonly log: (msg: string) => void = () => {},
    config?: Config,
  ) {
    this.config = config ?? readConfig(log);
    this.key = projectKey(loc.repoRoot, loc.dir, this.config);
  }

  project(): ProjectConfig | undefined {
    return this.key ? this.config.projects?.[this.key] : undefined;
  }

  remoteFor(db: DbName): RemoteDb | null {
    const p = this.project();
    return p?.backend === "turso" ? (p[db] ?? null) : null;
  }

  outboxFor(db: DbName): Outbox {
    return new Outbox(join(this.loc.dir, db === "security" ? FILES.securityOutbox : FILES.issuesOutbox));
  }

  openRemote(db: DbName, remote: RemoteDb): TursoStore {
    const timeout = Number(process.env.ISSUE_TRACKER_TIMEOUT_MS) || 5000;
    return new TursoStore(remote.url, resolveToken(remote, db), timeout);
  }

  private queueCtx(mirror: LocalStore, outbox: Outbox): QueueCtx {
    return {
      mirror,
      outbox,
      nextPid: async () => {
        const next = Number((await getSync(mirror, "next_pid")) ?? "1");
        await setSync(mirror, "next_pid", String(next + 1));
        return next;
      },
    };
  }

  async run<T>(db: DbName, fn: (store: Store, rt: RunCtx) => Promise<T>, opts: RunOpts<T> = {}): Promise<T> {
    const remoteCfg = this.remoteFor(db);
    if (!remoteCfg) {
      const store = await openLocal(this.loc, db);
      const rt: RunCtx = {
        pid: async () => {
          throw new CliError("Provisional ids exist only on Turso projects.");
        },
      };
      try {
        return await fn(store, rt);
      } finally {
        await store.close();
      }
    }

    const mirror = await openLocal(this.loc, db);
    const outbox = this.outboxFor(db);
    const remote = this.openRemote(db, remoteCfg);
    const rt: RunCtx = { pid: (pid) => resolvePid(mirror, db, pid) };
    let done = false;
    let result: T | undefined;
    try {
      await migrate(remote);
      await this.flushWith(db, remote, mirror, outbox);
      result = await fn(remote, rt);
      done = true;
      await refreshMirror(remote, mirror);
      return result;
    } catch (err) {
      if (!(err instanceof Offline)) throw err;
      if (done) {
        this.log(`warning: the change reached Turso, but the local mirror was not refreshed (${err.message}).`);
        return result as T;
      }
      const q = this.queueCtx(mirror, outbox);
      if (opts.queue) return await opts.queue(q);
      if (opts.write) {
        throw new Offline(
          `${sentence(err.message)} Only new issues and notes queue offline; retry this when Turso is reachable.`,
        );
      }
      this.offline.set(db, (await getSync(mirror, "synced_at")) ?? "never");
      if (opts.offlineRead) return await opts.offlineRead(q);
      return await fn(mirror, rt);
    } finally {
      await remote.close();
      await mirror.close();
    }
  }

  private async flushWith(db: DbName, remote: Store, mirror: LocalStore, outbox: Outbox): Promise<void> {
    if (outbox.read().length === 0) return;
    for (const line of await replay(remote, db, outbox, mirror)) this.log(line);
  }
}
