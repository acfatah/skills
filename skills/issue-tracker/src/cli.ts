import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type ParseArgsConfig, parseArgs } from "node:util";
import { Backend } from "./backend.ts";
import { checkDb } from "./commands/check.ts";
import {
  addNote,
  closeIssue,
  createIssue,
  deleteIssue,
  editIssue,
  listIssues,
  moveIssue,
  parseLocalRef,
  reopenIssue,
  showIssue,
} from "./commands/issues.ts";
import { addMilestone, closeMilestone, editMilestone, listMilestones } from "./commands/milestones.ts";
import { matches, queueNew, queueNote, queuedIssues, queuedNotesOn } from "./commands/offline.ts";
import { remoteDisable, remoteEnable, remoteStatus } from "./commands/remote.ts";
import { CliError, Offline, UsageError, ValidationError } from "./errors.ts";
import { exportAll, parseExport } from "./exporter.ts";
import { detailText, issueJson, issueLine, milestoneLine } from "./format.ts";
import { type DbName, formatId, parseId, parseRealId } from "./ids.ts";
import { assertClean, countRows, deleteV1, readV1, toDumps, writeDumps } from "./importer.ts";
import { resolveLocation } from "./location.ts";
import { OPEN_STATUSES, type Status, checkStatus, splitList, today } from "./model.ts";
import { STATUSES } from "./schema.ts";

export const VERSION = "2.0.0";

type Options = NonNullable<ParseArgsConfig["options"]>;
type Values = Record<string, string | boolean | string[] | undefined>;

export interface Ctx {
  cwd: string;
  dir?: string;
  out: (text: string) => void;
  err: (text: string) => void;
  backend: () => Backend;
}

interface Verb {
  usage: string[];
  options: Options;
  run: (ctx: Ctx, v: Values, pos: string[]) => Promise<number | void>;
}

const str = (v: Values, k: string) => v[k] as string | undefined;
const json = { json: { type: "boolean" } } as const;

async function readBody(v: Values): Promise<string | undefined> {
  const file = str(v, "body-file");
  if (file !== undefined && str(v, "body") !== undefined) {
    throw new UsageError("Pass --body or --body-file, not both.");
  }
  if (file === "-") return Bun.stdin.text();
  if (file !== undefined) return Bun.file(file).text();
  return str(v, "body");
}

function onePos(pos: string[], what: string): string {
  if (pos.length !== 1) throw new UsageError(`Expected one ${what}.`);
  return pos[0]!;
}

function print(ctx: Ctx, v: Values, data: unknown, text: () => string): void {
  ctx.out(v.json ? JSON.stringify(data, null, 2) : text());
}

const body = { body: { type: "string" }, "body-file": { type: "string" } } as const;

export const VERBS: Record<string, Verb> = {
  new: {
    usage: [
      "new --title <text> [--type <type>] [--priority low|medium|high] [--parent <id>]",
      "    [--label a,b] [--milestone <name>] [--body <text> | --body-file <path|->]",
    ],
    options: {
      title: { type: "string" },
      type: { type: "string" },
      priority: { type: "string" },
      parent: { type: "string" },
      label: { type: "string" },
      milestone: { type: "string" },
      ...body,
      ...json,
    },
    async run(ctx, v) {
      const title = str(v, "title");
      if (!title) throw new UsageError("new needs --title.");
      const parentText = str(v, "parent");
      const db: DbName =
        str(v, "type") === "security" || /^S/i.test(parentText ?? "") ? "security" : "issues";
      const parent = parentText ? parseLocalRef(db, parentText) : null;
      const input = {
        title,
        type: str(v, "type"),
        priority: str(v, "priority"),
        parent,
        labels: splitList(str(v, "label")),
        milestone: str(v, "milestone"),
        body: await readBody(v),
      };
      const opts = { clientId: crypto.randomUUID(), date: today() };
      const made = await ctx.backend().run(
        db,
        async (s) => {
          const r = await createIssue(s, db, input, opts);
          return { id: formatId(db, r.id), status: r.status as string };
        },
        { write: true, queue: (q) => queueNew(q, db, input, opts) },
      );
      print(ctx, v, made, () =>
        made.status === "queued"
          ? `Queued ${made.id} (offline): ${title.trim()}. It gets a real id once Turso is reachable.`
          : `Created ${made.id} (${made.status}): ${title.trim()}`,
      );
    },
  },

  list: {
    usage: [
      "list [--status <s,s>|all] [--type <type>] [--milestone <name>] [--label <label>]",
      "    [--parent <id>] [--security] [--json]",
    ],
    options: {
      status: { type: "string" },
      type: { type: "string" },
      milestone: { type: "string" },
      label: { type: "string" },
      parent: { type: "string" },
      security: { type: "boolean" },
      ...json,
    },
    async run(ctx, v) {
      const parentText = str(v, "parent");
      const db: DbName =
        v.security || str(v, "type") === "security" || /^S/i.test(parentText ?? "") ? "security" : "issues";
      const statusText = str(v, "status");
      const statuses: Status[] =
        statusText === "all" ? [...STATUSES] : statusText ? splitList(statusText).map(checkStatus) : OPEN_STATUSES;
      const filters = {
        statuses,
        type: str(v, "type"),
        milestone: str(v, "milestone"),
        label: str(v, "label"),
        parent: parentText ? parseLocalRef(db, parentText) : undefined,
      };
      const b = ctx.backend();
      const issues = await b.run(db, (s) => listIssues(s, filters));
      const queued = b.offline.has(db) ? queuedIssues(db, b.outboxFor(db)).filter((q) => matches(q.issue, filters)) : [];
      const lines = [
        ...issues.map((i) => issueLine(db, i)),
        ...queued.map((q) => issueLine(db, q.issue, q.shownId)),
      ];
      print(
        ctx,
        v,
        [...issues.map((i) => issueJson(db, i)), ...queued.map((q) => issueJson(db, q.issue, q.shownId))],
        () => (lines.length ? lines.join("\n") : "No matching issues."),
      );
    },
  },

  show: {
    usage: ["show <id> [--json]"],
    options: { ...json },
    async run(ctx, v, pos) {
      const ref = parseId(onePos(pos, "id"));
      const db = ref.db;
      const b = ctx.backend();
      const d = await b.run(
        db,
        async (s, rt) => {
          const detail = await showIssue(s, db, ref.id ?? (await rt.pid(ref.pid!)));
          return { ...detail, shownId: undefined as string | undefined };
        },
        {
          offlineRead: async (q) => {
            if (ref.id !== undefined) {
              const detail = await showIssue(q.mirror, db, ref.id);
              return { ...detail, notes: [...detail.notes, ...queuedNotesOn(q.outbox, ref.id)] as typeof detail.notes, shownId: undefined };
            }
            const hit = queuedIssues(db, q.outbox).find((x) => x.shownId === `${db === "security" ? "S" : ""}P${ref.pid}`);
            if (!hit) throw new UsageError(`No queued issue ${onePos(pos, "id")}.`);
            return { issue: hit.issue, notes: hit.notes as never, children: [], shownId: hit.shownId };
          },
        },
      );
      print(
        ctx,
        v,
        {
          ...issueJson(db, d.issue, d.shownId),
          notes: d.notes.map(({ date, text }) => ({ date, text })),
          children: d.children.map((c) => ({ ...c, id: formatId(db, c.id) })),
        },
        () => detailText(db, d, d.shownId),
      );
    },
  },

  edit: {
    usage: ["edit <id> [--set key=value ...] [--title <text>] [--body <text> | --body-file <path|->]"],
    options: { set: { type: "string", multiple: true }, title: { type: "string" }, ...body },
    async run(ctx, v, pos) {
      const { db, id } = parseRealId(onePos(pos, "id"));
      const set: Record<string, string> = {};
      for (const pair of (v.set as string[] | undefined) ?? []) {
        const eq = pair.indexOf("=");
        if (eq < 1) throw new UsageError(`--set needs key=value; got "${pair}".`);
        set[pair.slice(0, eq).trim()] = pair.slice(eq + 1);
      }
      const changes = { title: str(v, "title"), body: await readBody(v), set };
      await ctx.backend().run(db, (s) => editIssue(s, db, id, changes, today()), { write: true });
      ctx.out(`Updated ${formatId(db, id)}.`);
    },
  },

  move: {
    usage: ["move <id> <triage|open|in-progress|blocked> [--note <text>]"],
    options: { note: { type: "string" } },
    async run(ctx, v, pos) {
      if (pos.length !== 2) throw new UsageError("move needs <id> and a status.");
      const { db, id } = parseRealId(pos[0]!);
      const to = checkStatus(pos[1]!);
      const from = await ctx.backend().run(db, (s) => moveIssue(s, db, id, to, str(v, "note"), today()), { write: true });
      ctx.out(`Moved ${formatId(db, id)}: ${from} → ${to}.`);
    },
  },

  close: {
    usage: [
      "close <id> --resolution done|duplicate|wont-fix|invalid|moved [--dup-of <id>]",
      "    [--github <url>] [--note <text>] [--keep-children]",
    ],
    options: {
      resolution: { type: "string" },
      "dup-of": { type: "string" },
      github: { type: "string" },
      note: { type: "string" },
      "keep-children": { type: "boolean" },
    },
    async run(ctx, v, pos) {
      const { db, id } = parseRealId(onePos(pos, "id"));
      const resolution = str(v, "resolution");
      if (!resolution) throw new UsageError("close needs --resolution.");
      const dup = str(v, "dup-of");
      const opts = {
        resolution,
        dupOf: dup ? parseLocalRef(db, dup) : undefined,
        github: str(v, "github"),
        note: str(v, "note"),
        keepChildren: Boolean(v["keep-children"]),
      };
      await ctx.backend().run(db, (s) => closeIssue(s, db, id, opts, today()), { write: true });
      ctx.out(`Closed ${formatId(db, id)} (${resolution}).`);
    },
  },

  reopen: {
    usage: ["reopen <id> --note <why>"],
    options: { note: { type: "string" } },
    async run(ctx, v, pos) {
      const { db, id } = parseRealId(onePos(pos, "id"));
      const status = await ctx.backend().run(db, (s) => reopenIssue(s, db, id, str(v, "note"), today()), { write: true });
      ctx.out(`Reopened ${formatId(db, id)} (${status}).`);
    },
  },

  note: {
    usage: ['note <id> "text"'],
    options: {},
    async run(ctx, _v, pos) {
      if (pos.length < 2) throw new UsageError('note needs <id> and "text".');
      const ref = parseId(pos[0]!);
      const db = ref.db;
      const text = pos.slice(1).join(" ");
      const opts = { clientId: crypto.randomUUID(), date: today() };
      const shown = await ctx.backend().run(
        db,
        async (s, rt) => {
          const id = ref.id ?? (await rt.pid(ref.pid!));
          await addNote(s, db, id, text, opts);
          return formatId(db, id);
        },
        { write: true, queue: async (q) => `${await queueNote(q, db, ref, text, opts)} (queued offline)` },
      );
      ctx.out(`Noted on ${shown}.`);
    },
  },

  delete: {
    usage: ["delete <id>"],
    options: {},
    async run(ctx, _v, pos) {
      const { db, id } = parseRealId(onePos(pos, "id"));
      await ctx.backend().run(db, (s) => deleteIssue(s, db, id), { write: true });
      ctx.out(`Deleted ${formatId(db, id)}.`);
    },
  },

  milestone: {
    usage: [
      "milestone add <name> [--goal <text>] [--due YYYY-MM-DD] [--github <url>]",
      "milestone list [--json]",
      "milestone edit <name> [--goal <text>] [--due YYYY-MM-DD] [--github <url>]",
      "milestone close <name>",
    ],
    options: { goal: { type: "string" }, due: { type: "string" }, github: { type: "string" }, ...json },
    async run(ctx, v, pos) {
      const [action, ...rest] = pos;
      const fields = { goal: str(v, "goal"), due: str(v, "due"), github: str(v, "github") };
      const b = ctx.backend();
      if (action === "list") {
        const all = await b.run("issues", listMilestones);
        print(ctx, v, all, () => (all.length ? all.map(milestoneLine).join("\n") : "No milestones."));
        return;
      }
      const name = onePos(rest, "milestone name");
      if (action === "add") await b.run("issues", (s) => addMilestone(s, name, fields), { write: true });
      else if (action === "edit") await b.run("issues", (s) => editMilestone(s, name, fields), { write: true });
      else if (action === "close") await b.run("issues", (s) => closeMilestone(s, name), { write: true });
      else throw new UsageError("milestone needs add, list, edit, or close.");
      ctx.out(`Milestone ${name}: ${action === "add" ? "added" : action === "edit" ? "updated" : "closed"}.`);
    },
  },

  flush: {
    usage: ["flush"],
    options: {},
    async run(ctx) {
      const b = ctx.backend();
      const dbs = (["issues", "security"] as DbName[]).filter((db) => b.remoteFor(db));
      if (dbs.length === 0) {
        ctx.out("Nothing to flush: this project is local.");
        return;
      }
      for (const db of dbs) {
        try {
          await b.run(db, async () => {}, { write: true });
        } catch (err) {
          if (!(err instanceof Offline)) throw err;
          const n = b.outboxFor(db).read().length;
          throw new Offline(`Turso is unreachable; ${n} ${db} entries stay queued in ${b.outboxFor(db).path}.`);
        }
      }
      ctx.out("Outbox empty; mirror refreshed.");
    },
  },

  remote: {
    usage: [
      "remote enable --issues-url <libsql://…> --token-env <VAR>",
      "    [--security-url <libsql://…> --security-token-env <VAR>] [--slug <name>]",
      "remote disable",
      "remote status [--json]",
    ],
    options: {
      "issues-url": { type: "string" },
      "token-env": { type: "string" },
      "security-url": { type: "string" },
      "security-token-env": { type: "string" },
      slug: { type: "string" },
      ...json,
    },
    async run(ctx, v, pos) {
      const b = ctx.backend();
      const [action] = pos;
      if (action === "enable") {
        const lines = await remoteEnable(b, {
          issuesUrl: str(v, "issues-url"),
          tokenEnv: str(v, "token-env"),
          securityUrl: str(v, "security-url"),
          securityTokenEnv: str(v, "security-token-env"),
          slug: str(v, "slug"),
        });
        ctx.out(lines.join("\n"));
      } else if (action === "disable") {
        ctx.out((await remoteDisable(b)).join("\n"));
      } else if (action === "status") {
        const st = await remoteStatus(b);
        print(ctx, v, st, () =>
          Object.entries(st)
            .map(([k, val]) => `${k}: ${typeof val === "object" && val ? Object.entries(val).map(([a, x]) => `${a} ${x ?? "never"}`).join(", ") : (val ?? "none")}`)
            .join("\n"),
        );
      } else {
        throw new UsageError("remote needs enable, disable, or status.");
      }
    },
  },

  export: {
    usage: ["export --out <file.jsonl>"],
    options: { out: { type: "string" } },
    async run(ctx, v) {
      const out = str(v, "out");
      if (!out) throw new UsageError("export needs --out <file.jsonl>; there is no default location.");
      const counts = await exportAll(ctx.backend(), out, ctx.err);
      ctx.out(`Exported ${counts.issues} issues and ${counts.security} security issues to ${out}.`);
    },
  },

  import: {
    usage: ["import --from <file.jsonl>", "import --v1 [<path>] [--delete-old]"],
    options: { from: { type: "string" }, v1: { type: "boolean" }, "delete-old": { type: "boolean" } },
    async run(ctx, v, pos) {
      const b = ctx.backend();
      const from = str(v, "from");
      if (from) {
        if (v.v1) throw new UsageError("Pass --from or --v1, not both.");
        const dumps = parseExport(readFileSync(from, "utf8"));
        await writeDumps(b, dumps);
        ctx.out(`Imported ${dumps.issues.issues.length} issues and ${dumps.security.issues.length} security issues.`);
        return;
      }
      if (!v.v1) throw new UsageError("import needs --from <file.jsonl> or --v1.");
      // A declared folder held the v1 layout itself; otherwise it was .claude/issues/.
      const path = pos[0] ?? (ctx.dir ? b.loc.dir : join(b.loc.dir, "issues"));
      const tree = readV1(path);
      assertClean(tree);
      if (!v["delete-old"]) {
        await writeDumps(b, toDumps(tree));
        for (const w of tree.warnings) ctx.err(`warning: ${w}`);
      }
      const counts = await countRows(b, tree);
      const lines = counts.map((c) => `${c.folder}/: ${c.files} files, ${c.rows} rows`);
      lines.push(`MILESTONES.md: ${tree.milestones.length} milestones`);
      if (counts.some((c) => c.files !== c.rows)) {
        throw new ValidationError(`Counts do not match; the v1 folder stays:\n${lines.join("\n")}`);
      }
      if (v["delete-old"]) {
        deleteV1(tree);
        ctx.out(`${lines.join("\n")}\nCounts match. Deleted the v1 files in ${path}.`);
        return;
      }
      const again = ["import", "--v1", ...(pos[0] ? [pos[0]] : []), "--delete-old"].join(" ");
      ctx.out(`${lines.join("\n")}\nCounts match. The v1 folder is untouched. After the user agrees, delete it with: ${again}`);
    },
  },

  check: {
    usage: ["check"],
    options: {},
    async run(ctx) {
      const b = ctx.backend();
      const names = await b.run("issues", (s) => s.query<{ name: string }>("SELECT name FROM milestones"));
      const milestones = new Set(names.map((m) => m.name));
      const problems = [
        ...(await b.run("issues", (s) => checkDb(s, "issues", milestones))),
        ...(await b.run("security", (s) => checkDb(s, "security", milestones))),
      ];
      if (problems.length === 0) {
        ctx.out("No problems found.");
        return 0;
      }
      ctx.out(problems.join("\n"));
      return 1;
    },
  },
};

export function helpText(): string {
  const verbs = Object.values(VERBS)
    .flatMap((verb) => verb.usage)
    .map((line) => `  ${line}`)
    .join("\n");
  return `issues ${VERSION}: issue tracking in SQLite

Usage: bun scripts/issues.js [--dir <path>] <verb> [options]

Verbs:
${verbs}

Ids: 7, 0007, S0007 (security), P1 (provisional, offline).

Global options:
  --dir <path>   Keep the issues files in <path> instead of <root>/.claude/
  --help         Show this help
  --version      Show the CLI version

Exit codes: 0 ok, 1 usage or validation, 2 offline, 3 location needs a decision.
`;
}

// Pulls --dir out of argv wherever it appears.
function takeDir(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--dir") {
      const value = args[i + 1];
      if (!value) throw new UsageError("--dir needs a path.");
      args.splice(i, 2);
      return value;
    }
    if (a.startsWith("--dir=")) {
      args.splice(i, 1);
      return a.slice("--dir=".length);
    }
  }
  return undefined;
}

export async function main(argv: string[], io: Partial<Ctx> = {}): Promise<number> {
  const args = [...argv];
  const out = io.out ?? ((t: string) => process.stdout.write(t.endsWith("\n") ? t : `${t}\n`));
  if (args.length === 0 || args[0] === "--help" || args[0] === "help") {
    out(helpText());
    return 0;
  }
  if (args[0] === "--version") {
    out(VERSION);
    return 0;
  }
  const dir = takeDir(args);
  const [name, ...rest] = args;
  const verb = name ? VERBS[name] : undefined;
  if (!verb) throw new UsageError(`Unknown verb: ${name}. Run --help.`);
  if (rest.includes("--help")) {
    out(verb.usage.join("\n"));
    return 0;
  }
  let parsed;
  try {
    parsed = parseArgs({ args: rest, options: verb.options, allowPositionals: true, strict: true });
  } catch (err) {
    throw new UsageError(`${(err as Error).message}\nUsage: ${verb.usage.join("\n")}`);
  }
  const cwd = io.cwd ?? process.cwd();
  let backend: Backend | undefined;
  const ctx: Ctx = {
    cwd,
    dir,
    out,
    err: io.err ?? ((t: string) => process.stderr.write(t.endsWith("\n") ? t : `${t}\n`)),
    backend: () => (backend ??= new Backend(resolveLocation({ cwd, dir }), (m) => ctx.err(m))),
  };
  const code = (await verb.run(ctx, parsed.values as Values, parsed.positionals)) ?? 0;
  for (const [db, since] of backend?.offline ?? []) {
    ctx.err(`offline; ${db} as of ${since}`);
  }
  return code;
}

if (import.meta.main) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      if (err instanceof CliError) {
        process.stderr.write(`error: ${err.message}\n`);
        process.exit(err.exitCode);
      }
      process.stderr.write(`error: ${err?.stack ?? err}\n`);
      process.exit(1);
    },
  );
}
