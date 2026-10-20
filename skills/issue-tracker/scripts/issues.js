// @bun
// src/cli.ts
import { parseArgs } from "util";

// src/location.ts
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "path";

// src/errors.ts
class CliError extends Error {
  exitCode;
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
    this.name = new.target.name;
  }
}

class UsageError extends CliError {
}

class ValidationError extends CliError {
}
class LocationError extends CliError {
  constructor(message) {
    super(message, 3);
  }
}

// src/location.ts
var FILES = {
  issues: "issues.sqlite3",
  security: "issues-security.sqlite3",
  issuesOutbox: "issues.outbox.jsonl",
  securityOutbox: "issues-security.outbox.jsonl"
};
function git(args, cwd) {
  const proc = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  return { ok: proc.exitCode === 0, out: proc.stdout.toString().trim() };
}
function nearestExisting(path) {
  let p = path;
  while (!existsSync(p) && dirname(p) !== p)
    p = dirname(p);
  return p;
}
function resolveLocation(opts) {
  if (opts.dir) {
    const dir = resolve(opts.cwd, opts.dir);
    const top = git(["rev-parse", "--show-toplevel"], nearestExisting(dir));
    return { dir, repoRoot: top.ok && top.out ? top.out : null };
  }
  const gitDir = git(["rev-parse", "--absolute-git-dir"], opts.cwd);
  if (!gitDir.ok) {
    throw new LocationError("Not inside a git repository. Pass --dir <path>.");
  }
  if (git(["rev-parse", "--is-bare-repository"], opts.cwd).out === "true") {
    throw new LocationError("This is a bare repository with no main checkout. Pass --dir <path>.");
  }
  const common = git(["rev-parse", "--path-format=absolute", "--git-common-dir"], opts.cwd);
  let root;
  if (resolve(gitDir.out) !== resolve(common.out)) {
    const lines = git(["worktree", "list", "--porcelain"], opts.cwd).out.split(`
`);
    if (lines[1] === "bare") {
      throw new LocationError("This worktree belongs to a bare repository with no main checkout. Pass --dir <path>.");
    }
    root = (lines[0] ?? "").replace(/^worktree /, "");
  } else {
    root = git(["rev-parse", "--show-toplevel"], opts.cwd).out;
  }
  return { dir: join(root, ".claude"), repoRoot: root };
}
function ensureIgnored(loc) {
  if (!loc.repoRoot)
    return;
  const rel = relative(loc.repoRoot, loc.dir);
  if (rel.startsWith("..") || isAbsolute(rel))
    return;
  const prefix = rel ? rel.split(sep).join("/") + "/" : "";
  if (git(["check-ignore", "-q", `${prefix}${FILES.issues}`], loc.repoRoot).ok)
    return;
  const exclude = resolve(loc.repoRoot, git(["rev-parse", "--path-format=absolute", "--git-path", "info/exclude"], loc.repoRoot).out);
  mkdirSync(dirname(exclude), { recursive: true });
  const current = existsSync(exclude) ? readFileSync(exclude, "utf8") : "";
  const lead = current && !current.endsWith(`
`) ? `
` : "";
  appendFileSync(exclude, `${lead}${prefix}issues*
`);
}
function prepareFile(loc, name) {
  const path = join(loc.dir, name);
  if (!existsSync(path)) {
    mkdirSync(loc.dir, { recursive: true });
    ensureIgnored(loc);
  }
  return path;
}

// src/schema.ts
var TYPES = [
  "bug",
  "feature",
  "idea",
  "feedback",
  "task",
  "chore",
  "docs",
  "refactor",
  "question",
  "security"
];
var STATUSES = ["triage", "open", "in-progress", "blocked", "closed"];
var PRIORITIES = ["low", "medium", "high"];
var RESOLUTIONS = ["done", "duplicate", "wont-fix", "invalid", "moved"];
var list = (values) => values.map((v) => `'${v}'`).join(",");
var MIGRATIONS = [
  [
    `CREATE TABLE milestones (
      name   TEXT PRIMARY KEY,
      goal   TEXT,
      due    TEXT,
      state  TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','closed')),
      github TEXT
    )`,
    `CREATE TABLE issues (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id  TEXT UNIQUE,
      title      TEXT NOT NULL CHECK (title <> ''),
      type       TEXT CHECK (type IN (${list(TYPES)})),
      status     TEXT NOT NULL CHECK (status IN (${list(STATUSES)})),
      priority   TEXT CHECK (priority IN (${list(PRIORITIES)})),
      milestone  TEXT REFERENCES milestones(name),
      parent     INTEGER REFERENCES issues(id),
      github     TEXT,
      resolution TEXT CHECK (resolution IN (${list(RESOLUTIONS)})),
      created    TEXT NOT NULL,
      updated    TEXT NOT NULL,
      closed     TEXT,
      body       TEXT NOT NULL DEFAULT '',
      CHECK ((status = 'closed') = (resolution IS NOT NULL)),
      CHECK ((status = 'closed') = (closed IS NOT NULL)),
      CHECK (type IS NOT NULL OR status = 'triage')
    )`,
    "CREATE INDEX issues_status ON issues(status)",
    "CREATE INDEX issues_parent ON issues(parent)",
    `CREATE TABLE labels (
      issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
      label    TEXT NOT NULL,
      PRIMARY KEY (issue_id, label)
    )`,
    `CREATE TABLE notes (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id TEXT UNIQUE,
      issue_id  INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
      date      TEXT NOT NULL,
      text      TEXT NOT NULL
    )`,
    "CREATE INDEX notes_issue ON notes(issue_id)"
  ]
];
var LATEST_VERSION = MIGRATIONS.length;
async function getVersion(store) {
  if (store.kind === "local") {
    const [row] = await store.query("PRAGMA user_version");
    return row?.user_version ?? 0;
  }
  try {
    const [row] = await store.query("SELECT value FROM meta WHERE key = 'schema_version'");
    return row ? Number(row.value) : 0;
  } catch (err) {
    if (/no such table/i.test(String(err)))
      return 0;
    throw err;
  }
}
function setVersion(store, version) {
  if (store.kind === "local")
    return [{ sql: `PRAGMA user_version = ${version}` }];
  return [
    { sql: "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)" },
    {
      sql: "INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      args: [String(version)]
    }
  ];
}
async function migrate(store) {
  let version = await getVersion(store);
  if (version > LATEST_VERSION) {
    throw new CliError(`This database has schema version ${version}, but this CLI only knows ` + `up to ${LATEST_VERSION}. Update the issue-tracker skill.`);
  }
  while (version < LATEST_VERSION) {
    const next = version + 1;
    const stmts = MIGRATIONS[version].map((sql) => ({ sql }));
    try {
      await store.batch([...stmts, ...setVersion(store, next)]);
    } catch (err) {
      if (await getVersion(store) < next)
        throw err;
    }
    version = await getVersion(store);
  }
}

// src/store/local.ts
import { Database } from "bun:sqlite";

class LocalStore {
  path;
  kind = "local";
  db;
  constructor(path) {
    this.path = path;
    this.db = new Database(path, { create: true });
    this.db.run("PRAGMA busy_timeout = 5000");
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run("PRAGMA foreign_keys = ON");
  }
  async query(sql, args = []) {
    return this.db.prepare(sql).all(...args);
  }
  async exec(sql, args = []) {
    this.db.prepare(sql).run(...args);
  }
  async batch(stmts) {
    const run = this.db.transaction(() => stmts.map((s) => this.db.prepare(s.sql).all(...s.args ?? [])));
    return run.immediate();
  }
  async close() {
    this.db.close();
  }
}

// src/backend.ts
function dbFile(db) {
  return db === "security" ? FILES.security : FILES.issues;
}
async function openLocal(loc, db) {
  const store = new LocalStore(prepareFile(loc, dbFile(db)));
  await migrate(store);
  return store;
}

class Backend {
  loc;
  constructor(loc) {
    this.loc = loc;
  }
  async run(db, fn) {
    const store = await openLocal(this.loc, db);
    try {
      return await fn(store);
    } finally {
      await store.close();
    }
  }
}

// src/ids.ts
function parseId(text) {
  const m = /^(S)?(P)?0*(\d+)$/i.exec(text.trim());
  if (!m || Number(m[3]) === 0) {
    throw new UsageError(`Not an issue id: ${text}. Use 7, 0007, S0007, or P1.`);
  }
  const db = m[1] ? "security" : "issues";
  return m[2] ? { db, pid: Number(m[3]) } : { db, id: Number(m[3]) };
}
function parseRealId(text) {
  const ref = parseId(text);
  if (ref.id === undefined) {
    throw new UsageError(`${text} is a provisional id; it gets a real id once Turso is reachable. Run flush first.`);
  }
  return { db: ref.db, id: ref.id };
}
function formatId(db, id) {
  return `${db === "security" ? "S" : ""}${String(id).padStart(4, "0")}`;
}

// src/model.ts
var OPEN_STATUSES = ["triage", "open", "in-progress", "blocked"];
var ACCEPTED_STATUSES = ["open", "in-progress", "blocked"];
var TRANSITIONS = {
  triage: ["open", "closed"],
  open: ["in-progress", "closed"],
  "in-progress": ["blocked", "closed", "open"],
  blocked: ["open", "in-progress"],
  closed: ["open"]
};
function canMove(from, to) {
  return TRANSITIONS[from].includes(to);
}
function oneOf(field, values, value) {
  if (!values.includes(value)) {
    throw new ValidationError(`${field} must be one of ${values.join(", ")}; got "${value}".`);
  }
  return value;
}
var checkType = (v) => oneOf("type", TYPES, v);
var checkStatus = (v) => oneOf("status", STATUSES, v);
var checkPriority = (v) => oneOf("priority", PRIORITIES, v);
var checkResolution = (v) => oneOf("resolution", RESOLUTIONS, v);
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function checkDate(field, value) {
  if (!DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ValidationError(`${field} must be a YYYY-MM-DD date; got "${value}".`);
  }
  return value;
}
function splitList(value) {
  if (!value)
    return [];
  return [...new Set(value.split(",").map((s) => s.trim()).filter(Boolean))];
}
function today() {
  const pinned = process.env.ISSUE_TRACKER_TODAY;
  if (pinned)
    return pinned;
  const d = new Date;
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// src/commands/check.ts
async function checkDb(store, db, milestones) {
  const problems = [];
  const [integrity] = await store.query("PRAGMA integrity_check");
  if (integrity && integrity.integrity_check !== "ok") {
    problems.push(`${db} database: integrity_check says ${integrity.integrity_check}`);
  }
  for (const fk of await store.query("PRAGMA foreign_key_check")) {
    problems.push(`${db} database: foreign key broken in ${fk.table} row ${fk.rowid}`);
  }
  const rows = await store.query("SELECT id, title, type, status, priority, milestone, parent, resolution, created, updated, closed FROM issues ORDER BY id");
  const byId = new Map(rows.map((r) => [r.id, r]));
  const has = (values, v) => values.includes(v);
  for (const r of rows) {
    const id = formatId(db, r.id);
    const bad = (msg) => problems.push(`${id}: ${msg}`);
    if (!r.title || typeof r.title !== "string" || !r.title.trim())
      bad("empty title");
    if (!has(STATUSES, r.status))
      bad(`unknown status "${r.status}"`);
    if (r.type !== null && !has(TYPES, r.type))
      bad(`unknown type "${r.type}"`);
    if (r.type === null && r.status !== "triage")
      bad(`no type while ${r.status}`);
    if (db === "security" && r.type !== null && r.type !== "security")
      bad(`type ${r.type} in the security database`);
    if (db === "issues" && r.type === "security")
      bad("type security outside the security database");
    if (r.priority !== null && !has(PRIORITIES, r.priority))
      bad(`unknown priority "${r.priority}"`);
    if (r.resolution !== null && !has(RESOLUTIONS, r.resolution))
      bad(`unknown resolution "${r.resolution}"`);
    if (r.status === "closed" !== (r.resolution !== null))
      bad("closed and resolution disagree");
    if (r.status === "closed" !== (r.closed !== null))
      bad("closed status and closed date disagree");
    for (const field of ["created", "updated", "closed"]) {
      if (r[field] !== null && !DATE_RE.test(String(r[field])))
        bad(`${field} is not YYYY-MM-DD`);
    }
    if (r.milestone !== null) {
      if (db === "security")
        bad("security issues do not take a milestone");
      else if (!milestones.has(r.milestone))
        bad(`unknown milestone "${r.milestone}"`);
    }
    if (r.parent !== null) {
      const seen = new Set([r.id]);
      let p = byId.get(r.parent);
      if (!p)
        bad(`parent ${formatId(db, r.parent)} does not exist`);
      while (p) {
        if (seen.has(p.id)) {
          bad("parent chain loops");
          break;
        }
        seen.add(p.id);
        p = p.parent === null ? undefined : byId.get(p.parent);
      }
    }
  }
  return problems;
}

// src/commands/issues.ts
var COLUMNS = "id, client_id, title, type, status, priority, milestone, parent, github, resolution, created, updated, closed, body";
async function withLabels(store, rows) {
  if (rows.length === 0)
    return [];
  const labels = await store.query("SELECT issue_id, label FROM labels ORDER BY label");
  const byIssue = new Map;
  for (const l of labels) {
    byIssue.set(l.issue_id, [...byIssue.get(l.issue_id) ?? [], l.label]);
  }
  return rows.map((r) => ({ ...r, labels: byIssue.get(r.id) ?? [] }));
}
async function findIssue(store, id) {
  const rows = await store.query(`SELECT ${COLUMNS} FROM issues WHERE id = ?`, [id]);
  const [issue] = await withLabels(store, rows);
  return issue ?? null;
}
async function loadIssue(store, db, id) {
  const issue = await findIssue(store, id);
  if (!issue)
    throw new ValidationError(`No issue ${formatId(db, id)}.`);
  return issue;
}
async function checkMilestone(store, db, name) {
  if (db === "security") {
    throw new ValidationError("Security issues do not take a milestone.");
  }
  const rows = await store.query("SELECT name FROM milestones WHERE name = ?", [name]);
  if (rows.length === 0) {
    throw new ValidationError(`No milestone "${name}". Add it with: milestone add "${name}"`);
  }
}
function checkTypeFor(db, type) {
  checkType(type);
  if (db === "security" && type !== "security") {
    throw new ValidationError("Issues in the security database always have type security.");
  }
  if (db === "issues" && type === "security") {
    throw new ValidationError("A security issue lives in its own database. Create it with new --type security, then delete this one.");
  }
  return type;
}
async function checkParent(store, db, child, parent) {
  const p = await loadIssue(store, db, parent);
  let cursor = p;
  while (cursor && child !== null) {
    if (cursor.id === child) {
      throw new ValidationError(`${formatId(db, parent)} cannot be a parent of its own ancestor.`);
    }
    cursor = cursor.parent === null ? null : await findIssue(store, cursor.parent);
  }
  return p;
}
async function createIssue(store, db, input, opts) {
  const title = input.title.trim();
  if (!title)
    throw new ValidationError("A title is required.");
  let type = input.type || (db === "security" ? "security" : null);
  if (type)
    checkTypeFor(db, type);
  let priority = input.priority || null;
  if (priority)
    checkPriority(priority);
  let milestone = input.milestone || null;
  let status = "triage";
  if (input.parent) {
    const parent = await checkParent(store, db, null, input.parent);
    if (ACCEPTED_STATUSES.includes(parent.status)) {
      if (!type) {
        throw new ValidationError(`${formatId(db, parent.id)} is accepted, so its new child starts open and needs a --type.`);
      }
      status = "open";
      milestone ??= db === "security" ? null : parent.milestone;
      priority ??= parent.priority;
    }
  }
  if (milestone)
    await checkMilestone(store, db, milestone);
  const stmts = [
    {
      sql: `INSERT INTO issues (client_id, title, type, status, priority, milestone, parent, created, updated, body)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (client_id) DO NOTHING`,
      args: [
        opts.clientId,
        title,
        type,
        status,
        priority,
        milestone,
        input.parent ?? null,
        opts.date,
        opts.date,
        input.body ?? ""
      ]
    },
    ...(input.labels ?? []).map((label) => ({
      sql: "INSERT OR IGNORE INTO labels (issue_id, label) SELECT id, ? FROM issues WHERE client_id = ?",
      args: [label, opts.clientId]
    })),
    { sql: "SELECT id, status FROM issues WHERE client_id = ?", args: [opts.clientId] }
  ];
  const results = await store.batch(stmts);
  const row = results[results.length - 1][0];
  return { id: row.id, status: row.status };
}
async function listIssues(store, f) {
  const where = [];
  const args = [];
  if (f.statuses?.length) {
    where.push(`status IN (${f.statuses.map(() => "?").join(",")})`);
    args.push(...f.statuses);
  }
  if (f.type) {
    where.push("type = ?");
    args.push(f.type);
  }
  if (f.milestone) {
    where.push("milestone = ?");
    args.push(f.milestone);
  }
  if (f.parent !== undefined) {
    where.push("parent = ?");
    args.push(f.parent);
  }
  if (f.label) {
    where.push("id IN (SELECT issue_id FROM labels WHERE label = ?)");
    args.push(f.label);
  }
  const sql = `SELECT ${COLUMNS} FROM issues${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY id`;
  return withLabels(store, await store.query(sql, args));
}
async function showIssue(store, db, id) {
  const issue = await loadIssue(store, db, id);
  const notes = await store.query("SELECT id, client_id, issue_id, date, text FROM notes WHERE issue_id = ? ORDER BY id", [id]);
  const children = await store.query("SELECT id, title, status FROM issues WHERE parent = ? ORDER BY id", [id]);
  return { issue, notes, children };
}
function noteStmt(issueId, date, text, clientId = null) {
  return {
    sql: "INSERT INTO notes (client_id, issue_id, date, text) VALUES (?, ?, ?, ?) ON CONFLICT (client_id) DO NOTHING",
    args: [clientId, issueId, date, text]
  };
}
var EDITABLE = ["type", "priority", "milestone", "parent", "github", "labels"];
async function editIssue(store, db, id, changes, date) {
  const issue = await loadIssue(store, db, id);
  const cols = {};
  const stmts = [];
  if (changes.title !== undefined) {
    if (!changes.title.trim())
      throw new ValidationError("The title cannot be empty.");
    cols.title = changes.title.trim();
  }
  if (changes.body !== undefined)
    cols.body = changes.body;
  for (const [key, raw] of Object.entries(changes.set)) {
    const value = raw.trim();
    switch (key) {
      case "type":
        if (!value && issue.status !== "triage") {
          throw new ValidationError("type is required outside triage.");
        }
        cols.type = value ? checkTypeFor(db, value) : null;
        break;
      case "priority":
        cols.priority = value ? checkPriority(value) : null;
        break;
      case "milestone":
        if (value)
          await checkMilestone(store, db, value);
        cols.milestone = value || null;
        break;
      case "parent": {
        if (!value) {
          cols.parent = null;
          break;
        }
        const ref = parseLocalRef(db, value);
        if (ref === id)
          throw new ValidationError("An issue cannot be its own parent.");
        await checkParent(store, db, id, ref);
        cols.parent = ref;
        break;
      }
      case "github":
        cols.github = value || null;
        break;
      case "labels":
        stmts.push({ sql: "DELETE FROM labels WHERE issue_id = ?", args: [id] });
        for (const label of splitList(value)) {
          stmts.push({ sql: "INSERT INTO labels (issue_id, label) VALUES (?, ?)", args: [id, label] });
        }
        break;
      default:
        throw new UsageError(`Cannot --set ${key}. Editable: ${EDITABLE.join(", ")}. Use move, close, or reopen for status.`);
    }
  }
  if (Object.keys(cols).length === 0 && stmts.length === 0) {
    throw new UsageError("Nothing to change. Pass --title, --body-file, or --set key=value.");
  }
  cols.updated = date;
  const keys = Object.keys(cols);
  stmts.unshift({
    sql: `UPDATE issues SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`,
    args: [...keys.map((k) => cols[k]), id]
  });
  await store.batch(stmts);
}
function parseLocalRef(db, text) {
  const m = /^(S)?(P)?0*(\d+)$/i.exec(text.trim());
  if (!m)
    throw new UsageError(`Not an issue id: ${text}.`);
  if (m[2]) {
    throw new UsageError(`${text} is a provisional id. A parent needs a real id; run flush first.`);
  }
  const refDb = m[1] ? "security" : "issues";
  if (refDb !== db) {
    throw new ValidationError(db === "security" ? "A security issue's parent must be another security issue (S\u2026)." : "A security issue (S\u2026) cannot be the parent of a regular issue.");
  }
  return Number(m[3]);
}
async function moveIssue(store, db, id, to, note, date) {
  if (to === "closed")
    throw new UsageError("Use close <id> --resolution \u2026 to close an issue.");
  const issue = await loadIssue(store, db, id);
  const label = formatId(db, id);
  if (issue.status === to)
    throw new ValidationError(`${label} is already ${to}.`);
  if (issue.status === "closed")
    throw new ValidationError(`${label} is closed. Use reopen.`);
  if (!canMove(issue.status, to)) {
    throw new ValidationError(`Cannot move ${label} from ${issue.status} to ${to}. Allowed: ${TRANSITIONS[issue.status].join(", ")}.`);
  }
  if (to !== "triage" && !issue.type) {
    throw new ValidationError(`${label} needs a type before it leaves triage: edit ${label} --set type=\u2026`);
  }
  if (to === "blocked" && !note?.trim()) {
    throw new UsageError("A blocked issue needs --note saying what it waits for.");
  }
  const stmts = [
    { sql: "UPDATE issues SET status = ?, updated = ? WHERE id = ?", args: [to, date, id] }
  ];
  if (note?.trim())
    stmts.push(noteStmt(id, date, note.trim()));
  await store.batch(stmts);
  return issue.status;
}
async function closeIssue(store, db, id, opts, date) {
  const resolution = checkResolution(opts.resolution);
  const issue = await loadIssue(store, db, id);
  const label = formatId(db, id);
  if (issue.status === "closed")
    throw new ValidationError(`${label} is already closed.`);
  if (!canMove(issue.status, "closed")) {
    throw new ValidationError(`Cannot close ${label} while it is ${issue.status}. Allowed: ${TRANSITIONS[issue.status].join(", ")}.`);
  }
  const notes = [];
  if (resolution === "duplicate") {
    if (opts.dupOf === undefined)
      throw new UsageError("A duplicate needs --dup-of <id>.");
    if (opts.dupOf === id)
      throw new ValidationError("An issue cannot duplicate itself.");
    await loadIssue(store, db, opts.dupOf);
    notes.push(`Duplicate of ${formatId(db, opts.dupOf)}.`);
  } else if (opts.dupOf !== undefined) {
    throw new UsageError("--dup-of goes with --resolution duplicate.");
  }
  if (resolution === "moved") {
    if (!opts.github)
      throw new UsageError("Resolution moved needs --github <url>.");
    notes.push(`Moved to ${opts.github}.`);
  }
  if (opts.note?.trim())
    notes.push(opts.note.trim());
  const open = await store.query("SELECT id, title FROM issues WHERE parent = ? AND status <> 'closed' ORDER BY id", [id]);
  if (open.length > 0 && !opts.keepChildren) {
    const list = open.map((c) => `  ${formatId(db, c.id)} ${c.title}`).join(`
`);
    throw new ValidationError(`${label} has open children:
${list}
Close or re-parent them first, or pass --keep-children to leave them open.`);
  }
  await store.batch([
    {
      sql: "UPDATE issues SET status = 'closed', resolution = ?, closed = ?, updated = ?, github = COALESCE(?, github) WHERE id = ?",
      args: [resolution, date, date, opts.github ?? null, id]
    },
    ...notes.map((n) => noteStmt(id, date, n))
  ]);
}
async function reopenIssue(store, db, id, note, date) {
  if (!note?.trim())
    throw new UsageError("Reopening needs --note saying why.");
  const issue = await loadIssue(store, db, id);
  if (issue.status !== "closed") {
    throw new ValidationError(`${formatId(db, id)} is not closed; it is ${issue.status}.`);
  }
  const status = issue.type ? "open" : "triage";
  await store.batch([
    {
      sql: "UPDATE issues SET status = ?, resolution = NULL, closed = NULL, updated = ? WHERE id = ?",
      args: [status, date, id]
    },
    noteStmt(id, date, note.trim())
  ]);
  return status;
}
async function addNote(store, db, id, text, opts) {
  if (!text.trim())
    throw new UsageError("The note is empty.");
  await loadIssue(store, db, id);
  await store.batch([
    noteStmt(id, opts.date, text.trim(), opts.clientId),
    { sql: "UPDATE issues SET updated = ? WHERE id = ?", args: [opts.date, id] }
  ]);
}
async function deleteIssue(store, db, id) {
  await loadIssue(store, db, id);
  const children = await store.query("SELECT id FROM issues WHERE parent = ?", [id]);
  if (children.length > 0) {
    throw new ValidationError(`${formatId(db, id)} has children (${children.map((c) => formatId(db, c.id)).join(", ")}). Re-parent or delete them first.`);
  }
  await store.exec("DELETE FROM issues WHERE id = ?", [id]);
}

// src/commands/milestones.ts
async function load(store, name) {
  const [row] = await store.query("SELECT name, goal, due, state, github FROM milestones WHERE name = ?", [name]);
  if (!row)
    throw new ValidationError(`No milestone "${name}".`);
  return row;
}
async function addMilestone(store, name, f) {
  if (!name.trim())
    throw new UsageError("A milestone needs a name.");
  if (f.due)
    checkDate("due", f.due);
  const existing = await store.query("SELECT name FROM milestones WHERE name = ?", [name]);
  if (existing.length > 0)
    throw new ValidationError(`Milestone "${name}" already exists.`);
  await store.exec("INSERT INTO milestones (name, goal, due, github) VALUES (?, ?, ?, ?)", [
    name,
    f.goal || null,
    f.due || null,
    f.github || null
  ]);
}
async function editMilestone(store, name, f) {
  await load(store, name);
  const cols = {};
  if (f.goal !== undefined)
    cols.goal = f.goal || null;
  if (f.due !== undefined)
    cols.due = f.due ? checkDate("due", f.due) : null;
  if (f.github !== undefined)
    cols.github = f.github || null;
  const keys = Object.keys(cols);
  if (keys.length === 0)
    throw new UsageError("Nothing to change. Pass --goal, --due, or --github.");
  await store.exec(`UPDATE milestones SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE name = ?`, [
    ...keys.map((k) => cols[k]),
    name
  ]);
}
async function closeMilestone(store, name) {
  const m = await load(store, name);
  if (m.state === "closed")
    throw new ValidationError(`Milestone "${name}" is already closed.`);
  const open = await store.query("SELECT id, title FROM issues WHERE milestone = ? AND status <> 'closed' ORDER BY id", [name]);
  if (open.length > 0) {
    const list = open.map((i) => `  ${formatId("issues", i.id)} ${i.title}`).join(`
`);
    throw new ValidationError(`Milestone "${name}" still has open issues:
${list}
Close them or move them to another milestone first.`);
  }
  await store.exec("UPDATE milestones SET state = 'closed' WHERE name = ?", [name]);
}
async function listMilestones(store) {
  const rows = await store.query("SELECT name, goal, due, state, github FROM milestones ORDER BY state DESC, due IS NULL, due, name");
  const counts = await store.query("SELECT milestone, status, COUNT(*) AS n FROM issues WHERE milestone IS NOT NULL GROUP BY milestone, status");
  return rows.map((m) => ({
    ...m,
    counts: Object.fromEntries(counts.filter((c) => c.milestone === m.name).map((c) => [c.status, c.n]))
  }));
}

// src/format.ts
function issueJson(db, issue, shownId) {
  const { client_id: _, ...rest } = issue;
  return {
    ...rest,
    id: shownId ?? formatId(db, issue.id),
    parent: issue.parent === null ? null : formatId(db, issue.parent)
  };
}
function issueLine(db, issue, shownId) {
  const extras = [];
  if (issue.milestone)
    extras.push(`milestone ${issue.milestone}`);
  if (issue.parent !== null)
    extras.push(`parent ${formatId(db, issue.parent)}`);
  if (issue.labels.length)
    extras.push(`labels ${issue.labels.join(",")}`);
  if (issue.resolution)
    extras.push(`resolution ${issue.resolution}`);
  const head = [
    (shownId ?? formatId(db, issue.id)).padEnd(6),
    issue.status.padEnd(11),
    (issue.type ?? "-").padEnd(8),
    (issue.priority ?? "-").padEnd(6),
    issue.title
  ].join(" ");
  return extras.length ? `${head}  (${extras.join("; ")})` : head;
}
function noteLine(n) {
  return `- ${n.date}: ${n.text}`;
}
function detailText(db, d, shownId) {
  const i = d.issue;
  const field = (k, v) => v ? `${k}: ${v}` : null;
  const meta = [
    field("status", i.status),
    field("type", i.type),
    field("priority", i.priority),
    field("milestone", i.milestone),
    field("parent", i.parent === null ? null : formatId(db, i.parent)),
    field("labels", i.labels.join(", ")),
    field("created", i.created),
    field("updated", i.updated),
    field("resolution", i.resolution),
    field("closed", i.closed),
    field("github", i.github)
  ].filter(Boolean);
  const out = [`${shownId ?? formatId(db, i.id)} ${i.title}`, meta.join("  ")];
  if (i.body.trim())
    out.push("", i.body.trimEnd());
  if (d.notes.length)
    out.push("", "Notes:", ...d.notes.map(noteLine));
  if (d.children.length) {
    out.push("", "Children:", ...d.children.map((c) => `- ${formatId(db, c.id)} [${c.status}] ${c.title}`));
  }
  return out.join(`
`);
}
function milestoneLine(m) {
  const total = Object.values(m.counts).reduce((a, b) => a + b, 0);
  const closed = m.counts.closed ?? 0;
  const parts = [`${m.name} [${m.state}]`];
  if (m.due)
    parts.push(`due ${m.due}`);
  parts.push(`${closed}/${total} closed`);
  if (m.goal)
    parts.push(`goal: ${m.goal}`);
  if (m.github)
    parts.push(m.github);
  return parts.join("  ");
}

// src/cli.ts
var VERSION = "2.0.0";
var str = (v, k) => v[k];
var json = { json: { type: "boolean" } };
async function readBody(v) {
  const file = str(v, "body-file");
  if (file !== undefined && str(v, "body") !== undefined) {
    throw new UsageError("Pass --body or --body-file, not both.");
  }
  if (file === "-")
    return Bun.stdin.text();
  if (file !== undefined)
    return Bun.file(file).text();
  return str(v, "body");
}
function onePos(pos, what) {
  if (pos.length !== 1)
    throw new UsageError(`Expected one ${what}.`);
  return pos[0];
}
function print(ctx, v, data, text) {
  ctx.out(v.json ? JSON.stringify(data, null, 2) : text());
}
var body = { body: { type: "string" }, "body-file": { type: "string" } };
var VERBS = {
  new: {
    usage: [
      "new --title <text> [--type <type>] [--priority low|medium|high] [--parent <id>]",
      "    [--label a,b] [--milestone <name>] [--body <text> | --body-file <path|->]"
    ],
    options: {
      title: { type: "string" },
      type: { type: "string" },
      priority: { type: "string" },
      parent: { type: "string" },
      label: { type: "string" },
      milestone: { type: "string" },
      ...body,
      ...json
    },
    async run(ctx, v) {
      const title = str(v, "title");
      if (!title)
        throw new UsageError("new needs --title.");
      const parentText = str(v, "parent");
      const db = str(v, "type") === "security" || /^S/i.test(parentText ?? "") ? "security" : "issues";
      const parent = parentText ? parseLocalRef(db, parentText) : null;
      const input = {
        title,
        type: str(v, "type"),
        priority: str(v, "priority"),
        parent,
        labels: splitList(str(v, "label")),
        milestone: str(v, "milestone"),
        body: await readBody(v)
      };
      const made = await ctx.backend().run(db, (s) => createIssue(s, db, input, { clientId: crypto.randomUUID(), date: today() }));
      const id = formatId(db, made.id);
      print(ctx, v, { id, status: made.status }, () => `Created ${id} (${made.status}): ${title.trim()}`);
    }
  },
  list: {
    usage: [
      "list [--status <s,s>|all] [--type <type>] [--milestone <name>] [--label <label>]",
      "    [--parent <id>] [--security] [--json]"
    ],
    options: {
      status: { type: "string" },
      type: { type: "string" },
      milestone: { type: "string" },
      label: { type: "string" },
      parent: { type: "string" },
      security: { type: "boolean" },
      ...json
    },
    async run(ctx, v) {
      const parentText = str(v, "parent");
      const db = v.security || str(v, "type") === "security" || /^S/i.test(parentText ?? "") ? "security" : "issues";
      const statusText = str(v, "status");
      const statuses = statusText === "all" ? [...STATUSES] : statusText ? splitList(statusText).map(checkStatus) : OPEN_STATUSES;
      const issues = await ctx.backend().run(db, (s) => listIssues(s, {
        statuses,
        type: str(v, "type"),
        milestone: str(v, "milestone"),
        label: str(v, "label"),
        parent: parentText ? parseLocalRef(db, parentText) : undefined
      }));
      print(ctx, v, issues.map((i) => issueJson(db, i)), () => issues.length ? issues.map((i) => issueLine(db, i)).join(`
`) : "No matching issues.");
    }
  },
  show: {
    usage: ["show <id> [--json]"],
    options: { ...json },
    async run(ctx, v, pos) {
      const { db, id } = parseRealId(onePos(pos, "id"));
      const d = await ctx.backend().run(db, (s) => showIssue(s, db, id));
      print(ctx, v, {
        ...issueJson(db, d.issue),
        notes: d.notes.map(({ date, text }) => ({ date, text })),
        children: d.children.map((c) => ({ ...c, id: formatId(db, c.id) }))
      }, () => detailText(db, d));
    }
  },
  edit: {
    usage: ["edit <id> [--set key=value ...] [--title <text>] [--body <text> | --body-file <path|->]"],
    options: { set: { type: "string", multiple: true }, title: { type: "string" }, ...body },
    async run(ctx, v, pos) {
      const { db, id } = parseRealId(onePos(pos, "id"));
      const set = {};
      for (const pair of v.set ?? []) {
        const eq = pair.indexOf("=");
        if (eq < 1)
          throw new UsageError(`--set needs key=value; got "${pair}".`);
        set[pair.slice(0, eq).trim()] = pair.slice(eq + 1);
      }
      const changes = { title: str(v, "title"), body: await readBody(v), set };
      await ctx.backend().run(db, (s) => editIssue(s, db, id, changes, today()));
      ctx.out(`Updated ${formatId(db, id)}.`);
    }
  },
  move: {
    usage: ["move <id> <triage|open|in-progress|blocked> [--note <text>]"],
    options: { note: { type: "string" } },
    async run(ctx, v, pos) {
      if (pos.length !== 2)
        throw new UsageError("move needs <id> and a status.");
      const { db, id } = parseRealId(pos[0]);
      const to = checkStatus(pos[1]);
      const from = await ctx.backend().run(db, (s) => moveIssue(s, db, id, to, str(v, "note"), today()));
      ctx.out(`Moved ${formatId(db, id)}: ${from} \u2192 ${to}.`);
    }
  },
  close: {
    usage: [
      "close <id> --resolution done|duplicate|wont-fix|invalid|moved [--dup-of <id>]",
      "    [--github <url>] [--note <text>] [--keep-children]"
    ],
    options: {
      resolution: { type: "string" },
      "dup-of": { type: "string" },
      github: { type: "string" },
      note: { type: "string" },
      "keep-children": { type: "boolean" }
    },
    async run(ctx, v, pos) {
      const { db, id } = parseRealId(onePos(pos, "id"));
      const resolution = str(v, "resolution");
      if (!resolution)
        throw new UsageError("close needs --resolution.");
      const dup = str(v, "dup-of");
      const opts = {
        resolution,
        dupOf: dup ? parseLocalRef(db, dup) : undefined,
        github: str(v, "github"),
        note: str(v, "note"),
        keepChildren: Boolean(v["keep-children"])
      };
      await ctx.backend().run(db, (s) => closeIssue(s, db, id, opts, today()));
      ctx.out(`Closed ${formatId(db, id)} (${resolution}).`);
    }
  },
  reopen: {
    usage: ["reopen <id> --note <why>"],
    options: { note: { type: "string" } },
    async run(ctx, v, pos) {
      const { db, id } = parseRealId(onePos(pos, "id"));
      const status = await ctx.backend().run(db, (s) => reopenIssue(s, db, id, str(v, "note"), today()));
      ctx.out(`Reopened ${formatId(db, id)} (${status}).`);
    }
  },
  note: {
    usage: ['note <id> "text"'],
    options: {},
    async run(ctx, _v, pos) {
      if (pos.length < 2)
        throw new UsageError('note needs <id> and "text".');
      const { db, id } = parseRealId(pos[0]);
      const text = pos.slice(1).join(" ");
      await ctx.backend().run(db, (s) => addNote(s, db, id, text, { clientId: crypto.randomUUID(), date: today() }));
      ctx.out(`Noted on ${formatId(db, id)}.`);
    }
  },
  delete: {
    usage: ["delete <id>"],
    options: {},
    async run(ctx, _v, pos) {
      const { db, id } = parseRealId(onePos(pos, "id"));
      await ctx.backend().run(db, (s) => deleteIssue(s, db, id));
      ctx.out(`Deleted ${formatId(db, id)}.`);
    }
  },
  milestone: {
    usage: [
      "milestone add <name> [--goal <text>] [--due YYYY-MM-DD] [--github <url>]",
      "milestone list [--json]",
      "milestone edit <name> [--goal <text>] [--due YYYY-MM-DD] [--github <url>]",
      "milestone close <name>"
    ],
    options: { goal: { type: "string" }, due: { type: "string" }, github: { type: "string" }, ...json },
    async run(ctx, v, pos) {
      const [action, ...rest] = pos;
      const fields = { goal: str(v, "goal"), due: str(v, "due"), github: str(v, "github") };
      const b = ctx.backend();
      if (action === "list") {
        const all = await b.run("issues", listMilestones);
        print(ctx, v, all, () => all.length ? all.map(milestoneLine).join(`
`) : "No milestones.");
        return;
      }
      const name = onePos(rest, "milestone name");
      if (action === "add")
        await b.run("issues", (s) => addMilestone(s, name, fields));
      else if (action === "edit")
        await b.run("issues", (s) => editMilestone(s, name, fields));
      else if (action === "close")
        await b.run("issues", (s) => closeMilestone(s, name));
      else
        throw new UsageError("milestone needs add, list, edit, or close.");
      ctx.out(`Milestone ${name}: ${action === "add" ? "added" : action === "edit" ? "updated" : "closed"}.`);
    }
  },
  check: {
    usage: ["check"],
    options: {},
    async run(ctx) {
      const b = ctx.backend();
      const names = await b.run("issues", (s) => s.query("SELECT name FROM milestones"));
      const milestones = new Set(names.map((m) => m.name));
      const problems = [
        ...await b.run("issues", (s) => checkDb(s, "issues", milestones)),
        ...await b.run("security", (s) => checkDb(s, "security", milestones))
      ];
      if (problems.length === 0) {
        ctx.out("No problems found.");
        return 0;
      }
      ctx.out(problems.join(`
`));
      return 1;
    }
  }
};
function helpText() {
  const verbs = Object.values(VERBS).flatMap((verb) => verb.usage).map((line) => `  ${line}`).join(`
`);
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
function takeDir(args) {
  for (let i = 0;i < args.length; i++) {
    const a = args[i];
    if (a === "--dir") {
      const value = args[i + 1];
      if (!value)
        throw new UsageError("--dir needs a path.");
      args.splice(i, 2);
      return value;
    }
    if (a.startsWith("--dir=")) {
      args.splice(i, 1);
      return a.slice("--dir=".length);
    }
  }
  return;
}
async function main(argv, io = {}) {
  const args = [...argv];
  const out = io.out ?? ((t) => process.stdout.write(t.endsWith(`
`) ? t : `${t}
`));
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
  if (!verb)
    throw new UsageError(`Unknown verb: ${name}. Run --help.`);
  if (rest.includes("--help")) {
    out(verb.usage.join(`
`));
    return 0;
  }
  let parsed;
  try {
    parsed = parseArgs({ args: rest, options: verb.options, allowPositionals: true, strict: true });
  } catch (err) {
    throw new UsageError(`${err.message}
Usage: ${verb.usage.join(`
`)}`);
  }
  const cwd = io.cwd ?? process.cwd();
  let backend;
  const ctx = {
    cwd,
    dir,
    out,
    err: io.err ?? ((t) => process.stderr.write(t.endsWith(`
`) ? t : `${t}
`)),
    backend: () => backend ??= new Backend(resolveLocation({ cwd, dir }))
  };
  return await verb.run(ctx, parsed.values, parsed.positionals) ?? 0;
}
if (import.meta.main) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => {
    if (err instanceof CliError) {
      process.stderr.write(`error: ${err.message}
`);
      process.exit(err.exitCode);
    }
    process.stderr.write(`error: ${err?.stack ?? err}
`);
    process.exit(1);
  });
}
export {
  VERBS,
  VERSION,
  helpText,
  main
};
