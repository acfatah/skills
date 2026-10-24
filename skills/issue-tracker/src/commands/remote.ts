import { type Backend, openLocal } from "../backend.ts";
import { type Config, type RemoteDb, configPath, writeConfig } from "../config.ts";
import { Offline, UsageError, ValidationError, sentence } from "../errors.ts";
import type { DbName } from "../ids.ts";
import { getSync, refreshMirror } from "../mirror.ts";
import { replay } from "../outbox.ts";
import { dump, isEmpty, loadStmts, seqStmts } from "../rows.ts";
import { migrate } from "../schema.ts";

const DBS: DbName[] = ["issues", "security"];

export interface EnableOptions {
  issuesUrl?: string;
  tokenEnv?: string;
  securityUrl?: string;
  securityTokenEnv?: string;
  slug?: string;
}

// Moves a project onto Turso. Copies local rows up when the remote is empty,
// pulls when only the remote has rows (a second machine), refuses when both
// do.
export async function remoteEnable(b: Backend, o: EnableOptions): Promise<string[]> {
  if (!o.issuesUrl || !o.tokenEnv) {
    throw new UsageError("remote enable needs --issues-url and --token-env.");
  }
  if (o.securityUrl && !o.securityTokenEnv) {
    throw new UsageError("--security-url needs its own --security-token-env.");
  }
  if (o.securityUrl && o.securityTokenEnv === o.tokenEnv) {
    throw new ValidationError("The security database needs its own token, in a different env var (D5).");
  }
  const config: Config = structuredClone(b.config);
  let key = b.key;
  if (!key) {
    if (!o.slug) throw new ValidationError("This project has no origin remote. Pass --slug <name> to name it.");
    key = o.slug;
    config.dirs = { ...config.dirs, [b.loc.repoRoot ?? b.loc.dir]: o.slug };
  }
  if (config.projects?.[key]?.backend === "turso") {
    throw new ValidationError(`${key} already syncs to Turso. See remote status.`);
  }
  const targets: [DbName, RemoteDb][] = [["issues", { url: o.issuesUrl, tokenEnv: o.tokenEnv }]];
  if (o.securityUrl) targets.push(["security", { url: o.securityUrl, tokenEnv: o.securityTokenEnv }]);

  const lines: string[] = [];
  const opened = targets.map(([db, cfg]) => ({ db, cfg, remote: b.openRemote(db, cfg) }));
  const locals = [];
  try {
    const plans = [];
    for (const t of opened) {
      await t.remote.query("SELECT 1");
      await migrate(t.remote);
      const local = await openLocal(b.loc, t.db);
      locals.push(local);
      const [rd, ld] = [await dump(t.remote), await dump(local)];
      if (!isEmpty(rd) && !isEmpty(ld)) {
        throw new ValidationError(
          `Both the local and the Turso ${t.db} database have rows. Run export --out <file> first, then empty one side.`,
        );
      }
      plans.push({ ...t, local, ld, copy: isEmpty(rd) && !isEmpty(ld), empty: isEmpty(rd) && isEmpty(ld) });
    }
    for (const p of plans) {
      if (p.copy) {
        await p.remote.batch(loadStmts(p.ld));
        try {
          await p.remote.batch(seqStmts(p.ld));
        } catch {
          // Without the counter, a deleted top id may be reused; rare and harmless.
        }
        lines.push(`${p.db}: copied ${p.ld.issues.length} issues and ${p.ld.milestones.length} milestones to Turso.`);
      } else if (p.empty) {
        lines.push(`${p.db}: both sides are empty; nothing to copy.`);
      } else {
        lines.push(`${p.db}: pulled from Turso.`);
      }
      await refreshMirror(p.remote, p.local);
    }
  } finally {
    for (const t of opened) await t.remote.close();
    for (const l of locals) await l.close();
  }
  config.projects = {
    ...config.projects,
    [key]: {
      backend: "turso",
      issues: targets[0]![1],
      ...(targets[1] ? { security: targets[1][1] } : {}),
    },
  };
  writeConfig(config);
  if (!o.securityUrl) lines.push("security: stays local.");
  lines.push(`${key} now syncs to Turso. Config: ${configPath()}`);
  return lines;
}

export async function remoteDisable(b: Backend): Promise<string[]> {
  const project = b.project();
  if (!b.key || project?.backend !== "turso") throw new ValidationError("This project is already local.");
  const lines: string[] = [];
  for (const db of DBS) {
    const cfg = b.remoteFor(db);
    if (!cfg) continue;
    const remote = b.openRemote(db, cfg);
    const mirror = await openLocal(b.loc, db);
    const outbox = b.outboxFor(db);
    try {
      await migrate(remote);
      lines.push(...(await replay(remote, db, outbox, mirror)));
      await refreshMirror(remote, mirror);
      lines.push(`${db}: pulled a final copy from Turso.`);
    } catch (err) {
      if (err instanceof Offline) {
        throw new Offline(`${sentence(err.message)} remote disable needs Turso to send ${outbox.read().length} queued entries and pull a final copy.`);
      }
      throw err;
    } finally {
      await remote.close();
      await mirror.close();
    }
  }
  const config: Config = structuredClone(b.config);
  config.projects![b.key]!.backend = "local";
  writeConfig(config);
  lines.push(`${b.key} is local now. The Turso databases are untouched; delete them with the turso CLI if no longer needed.`);
  return lines;
}

export async function remoteStatus(b: Backend): Promise<Record<string, unknown>> {
  const project = b.project();
  const out: Record<string, unknown> = {
    project: b.key,
    backend: project?.backend ?? "local",
    dir: b.loc.dir,
  };
  for (const db of DBS) {
    const cfg = b.remoteFor(db);
    const store = await openLocal(b.loc, db);
    try {
      out[db] = cfg
        ? { url: cfg.url, synced_at: await getSync(store, "synced_at"), queued: b.outboxFor(db).read().length }
        : { backend: "local" };
    } finally {
      await store.close();
    }
  }
  return out;
}
