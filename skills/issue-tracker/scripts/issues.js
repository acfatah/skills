// @bun
// src/cli.ts
import { readFileSync as readFileSync5 } from "fs";
import { join as join5 } from "path";
import { parseArgs } from "util";

// src/backend.ts
import { join as join3 } from "path";

// src/config.ts
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";

// src/errors.ts
function sentence(message) {
  return /[.?!]$/.test(message.trim()) ? message.trim() : `${message.trim()}.`;
}

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

class Offline extends CliError {
  constructor(message = "Turso is unreachable") {
    super(message, 2);
  }
}

class AuthError extends CliError {
  constructor(message) {
    super(`${message}. Check the token; if it leaked, revoke it with ` + "`turso db tokens invalidate <db>` and issue a new one.");
  }
}

class LocationError extends CliError {
  constructor(message) {
    super(message, 3);
  }
}

// src/config.ts
function configPath() {
  if (process.env.XDG_CONFIG_HOME) {
    return join(process.env.XDG_CONFIG_HOME, "issue-tracker", "config.json");
  }
  if (process.platform === "win32" && process.env.APPDATA) {
    return join(process.env.APPDATA, "issue-tracker", "config.json");
  }
  return join(homedir(), ".config", "issue-tracker", "config.json");
}
function readConfig(warn = () => {}) {
  const path = configPath();
  if (!existsSync(path))
    return {};
  if (process.platform !== "win32" && (statSync(path).mode & 63) !== 0) {
    warn(`warning: ${path} is readable by other users and may hold tokens. Run: chmod 600 ${path}`);
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new CliError(`Cannot read ${path}: ${err.message}`);
  }
}
function writeConfig(config) {
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true, mode: 448 });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(config, null, 2)}
`, { mode: 384 });
  chmodSync(tmp, 384);
  renameSync(tmp, path);
}
function resolveToken(db, which) {
  if (db.token)
    return db.token;
  if (db.tokenEnv) {
    const token = process.env[db.tokenEnv];
    if (!token) {
      throw new CliError(`The ${which} token is read from $${db.tokenEnv}, which is not set.`);
    }
    return token;
  }
  throw new CliError(`No token configured for the ${which} database. Set token or tokenEnv in ${configPath()}.`);
}

// src/location.ts
import { appendFileSync, existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync as readFileSync2 } from "fs";
import { dirname as dirname2, isAbsolute, join as join2, relative, resolve, sep } from "path";
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
  while (!existsSync2(p) && dirname2(p) !== p)
    p = dirname2(p);
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
  return { dir: join2(root, ".claude"), repoRoot: root };
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
  mkdirSync2(dirname2(exclude), { recursive: true });
  const current = existsSync2(exclude) ? readFileSync2(exclude, "utf8") : "";
  const lead = current && !current.endsWith(`
`) ? `
` : "";
  appendFileSync(exclude, `${lead}${prefix}issues*
`);
}
function prepareFile(loc, name) {
  const path = join2(loc.dir, name);
  if (!existsSync2(path)) {
    mkdirSync2(loc.dir, { recursive: true });
    ensureIgnored(loc);
  }
  return path;
}

// src/rows.ts
var ISSUE_COLS = [
  "id",
  "client_id",
  "title",
  "type",
  "status",
  "priority",
  "milestone",
  "parent",
  "github",
  "resolution",
  "created",
  "updated",
  "closed",
  "body"
];
var MILESTONE_COLS = ["name", "goal", "due", "state", "github"];
var NOTE_COLS = ["id", "client_id", "issue_id", "date", "text"];
async function dump(store) {
  const [milestones, issues, labels, notes, seq] = await store.batch([
    { sql: `SELECT ${MILESTONE_COLS.join(", ")} FROM milestones ORDER BY name` },
    { sql: `SELECT ${ISSUE_COLS.join(", ")} FROM issues ORDER BY id` },
    { sql: "SELECT issue_id, label FROM labels ORDER BY issue_id, label" },
    { sql: `SELECT ${NOTE_COLS.join(", ")} FROM notes ORDER BY id` },
    { sql: "SELECT name, seq FROM sqlite_sequence WHERE name IN ('issues', 'notes')" }
  ]);
  return {
    milestones,
    issues,
    labels,
    notes,
    seq
  };
}
function isEmpty(d) {
  return d.milestones.length + d.issues.length === 0;
}
function insert(table, cols, row) {
  return {
    sql: `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
    args: cols.map((c) => row[c] ?? null)
  };
}
function parentsFirst(issues) {
  const byId = new Map(issues.map((i) => [i.id, i]));
  const done = new Set;
  const out = [];
  const visit = (i, depth) => {
    if (done.has(i.id) || depth > issues.length)
      return;
    const parent = i.parent === null ? undefined : byId.get(i.parent);
    if (parent)
      visit(parent, depth + 1);
    if (!done.has(i.id)) {
      done.add(i.id);
      out.push(i);
    }
  };
  for (const i of issues)
    visit(i, 0);
  return out;
}
function clearStmts() {
  return ["labels", "notes", "issues", "milestones"].map((t) => ({ sql: `DELETE FROM ${t}` }));
}
function loadStmts(d) {
  return [
    ...d.milestones.map((m) => insert("milestones", MILESTONE_COLS, m)),
    ...parentsFirst(d.issues).map((i) => insert("issues", ISSUE_COLS, i)),
    ...d.labels.map((l) => insert("labels", ["issue_id", "label"], l)),
    ...d.notes.map((n) => insert("notes", NOTE_COLS, n))
  ];
}
function seqStmts(d) {
  return d.seq.flatMap((s) => [
    { sql: "DELETE FROM sqlite_sequence WHERE name = ?", args: [s.name] },
    { sql: "INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)", args: [s.name, s.seq] }
  ]);
}

// src/mirror.ts
async function ensureSync(mirror) {
  await mirror.exec("CREATE TABLE IF NOT EXISTS sync (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
}
async function getSync(mirror, key) {
  await ensureSync(mirror);
  const [row] = await mirror.query("SELECT value FROM sync WHERE key = ?", [key]);
  return row?.value ?? null;
}
async function setSync(mirror, key, value) {
  await ensureSync(mirror);
  await mirror.exec("INSERT INTO sync (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", [key, value]);
}
function now() {
  const d = new Date;
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
async function refreshMirror(remote, mirror) {
  const d = await dump(remote);
  await ensureSync(mirror);
  await mirror.batch([
    ...clearStmts(),
    ...loadStmts(d),
    ...seqStmts(d),
    {
      sql: "INSERT INTO sync (key, value) VALUES ('synced_at', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      args: [now()]
    }
  ]);
}
async function resolvePid(mirror, db, pid) {
  const map = JSON.parse(await getSync(mirror, "pid_map") ?? "{}");
  const id = map[String(pid)];
  if (id === undefined) {
    throw new CliError(`Provisional id ${db === "security" ? "S" : ""}P${pid} is unknown or not replayed yet.`);
  }
  return id;
}

// src/outbox.ts
import { appendFileSync as appendFileSync2, existsSync as existsSync3, readFileSync as readFileSync3, renameSync as renameSync2, writeFileSync as writeFileSync2 } from "fs";

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
function formatPid(db, pid) {
  return `${db === "security" ? "S" : ""}P${pid}`;
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
function likePattern(text) {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
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
  if (f.query) {
    where.push("(title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\')");
    const pattern = likePattern(f.query);
    args.push(pattern, pattern);
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

// src/outbox.ts
class Outbox {
  path;
  constructor(path) {
    this.path = path;
  }
  read() {
    if (!existsSync3(this.path))
      return [];
    return readFileSync3(this.path, "utf8").split(`
`).filter((line) => line.trim()).map((line) => JSON.parse(line));
  }
  append(entry) {
    appendFileSync2(this.path, `${JSON.stringify(entry)}
`, { mode: 384 });
  }
  write(entries) {
    const tmp = `${this.path}.tmp-${process.pid}`;
    writeFileSync2(tmp, entries.map((e) => `${JSON.stringify(e)}
`).join(""), { mode: 384 });
    renameSync2(tmp, this.path);
  }
}
async function replay(remote, db, outbox, mirror, hooks = {}) {
  const lines = [];
  let entries = outbox.read();
  while (entries.length > 0) {
    const entry = entries[0];
    const map = JSON.parse(await getSync(mirror, "pid_map") ?? "{}");
    try {
      if (entry.kind === "new") {
        const { id } = await createIssue(remote, db, entry.issue, { clientId: entry.client_id, date: entry.date });
        hooks.afterCommit?.(entry);
        map[String(entry.pid)] = id;
        await setSync(mirror, "pid_map", JSON.stringify(map));
        lines.push(`${formatPid(db, entry.pid)} \u2192 ${formatId(db, id)}`);
      } else {
        const id = "id" in entry.target ? entry.target.id : map[String(entry.target.pid)];
        if (id === undefined) {
          throw new CliError(`it names ${formatPid(db, entry.target.pid)}, which was never queued`);
        }
        await addNote(remote, db, id, entry.text, { clientId: entry.client_id, date: entry.date });
        hooks.afterCommit?.(entry);
        lines.push(`Sent a queued note on ${formatId(db, id)}.`);
      }
    } catch (err) {
      if (err instanceof Offline)
        throw err;
      const what = entry.kind === "new" ? formatPid(db, entry.pid) : "a queued note";
      throw new CliError(`Could not replay ${what} from ${outbox.path}: ${err.message}. It stays queued.`);
    }
    entries = entries.slice(1);
    outbox.write(entries);
  }
  return lines;
}

// src/project.ts
function normalizeRemote(url) {
  let u = url.trim();
  const scp = /^(?:[^@/]+@)?([^:/]+):(?!\/)(.+)$/.exec(u);
  let host;
  let path;
  if (scp && !/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) {
    host = scp[1];
    path = scp[2];
  } else {
    const m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?([^/:]*)(?::\d+)?(\/.*)?$/i.exec(u);
    if (!m)
      return u.replace(/\.git$/, "").replace(/\/+$/, "");
    host = m[1];
    path = m[2] ?? "";
  }
  path = path.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\.git$/, "");
  return host ? `${host.toLowerCase()}/${path}` : path;
}
function projectKey(repoRoot, dir, config) {
  if (repoRoot) {
    const origin = git(["remote", "get-url", "origin"], repoRoot);
    if (origin.ok && origin.out)
      return normalizeRemote(origin.out);
  }
  for (const path of [dir, repoRoot]) {
    if (path && config.dirs?.[path])
      return config.dirs[path];
  }
  return null;
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

// node_modules/@tursodatabase/serverless/dist/index.js
var AsyncLock = class {
  constructor() {
    this.locked = false;
    this.queue = [];
  }
  async acquire() {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }
  release() {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }
};
var DatabaseError = class _DatabaseError extends Error {
  constructor(message, code, rawCode, cause) {
    super(message);
    this.name = "DatabaseError";
    this.code = code;
    this.rawCode = rawCode;
    this.cause = cause;
    Object.setPrototypeOf(this, _DatabaseError.prototype);
  }
};
var TimeoutError = class _TimeoutError extends DatabaseError {
  constructor(message = "Query timed out", cause) {
    super(message, "TIMEOUT", undefined, cause);
    this.name = "TimeoutError";
    Object.setPrototypeOf(this, _TimeoutError.prototype);
  }
};
function toBase64(uint8) {
  return Buffer.from(uint8.buffer, uint8.byteOffset, uint8.byteLength).toString("base64");
}
function encodeValue(value) {
  if (value === null || value === undefined) {
    return { type: "null" };
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Only finite numbers (not Infinity or NaN) can be passed as arguments");
    }
    if (Number.isSafeInteger(value)) {
      return { type: "integer", value: value.toString() };
    }
    return { type: "float", value };
  }
  if (typeof value === "bigint") {
    if (value < -(1n << 63n) || value > (1n << 63n) - 1n) {
      throw new Error("BigInt value is outside SQLite's signed 64-bit integer range");
    }
    return { type: "integer", value: value.toString() };
  }
  if (typeof value === "boolean") {
    return { type: "integer", value: value ? "1" : "0" };
  }
  if (typeof value === "string") {
    return { type: "text", value };
  }
  if (value instanceof ArrayBuffer) {
    return { type: "blob", base64: toBase64(new Uint8Array(value)) };
  }
  if (value instanceof Uint8Array) {
    return { type: "blob", base64: toBase64(value) };
  }
  return { type: "text", value: String(value) };
}
function decodeValue(value, safeIntegers = false) {
  switch (value.type) {
    case "null":
      return null;
    case "integer":
      if (safeIntegers) {
        return BigInt(value.value);
      }
      return parseInt(value.value, 10);
    case "float":
      return value.value;
    case "text":
      return value.value;
    case "blob":
      if (value.base64 !== undefined && value.base64 !== null) {
        let b64 = value.base64;
        while (b64.length % 4 !== 0) {
          b64 += "=";
        }
        const binaryString = atob(b64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0;i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return Buffer.from(bytes);
      }
      return Buffer.alloc(0);
    default:
      return null;
  }
}
var ENCRYPTION_KEY_HEADER = "x-turso-encryption-key";
function buildHeaders(ctx) {
  const headers = {
    "Content-Type": "application/json"
  };
  if (ctx.authToken) {
    headers["Authorization"] = `Bearer ${ctx.authToken}`;
  }
  if (ctx.remoteEncryptionKey) {
    headers[ENCRYPTION_KEY_HEADER] = ctx.remoteEncryptionKey;
  }
  for (const [name, value] of Object.entries(ctx.requestHeaders ?? {})) {
    if (name.toLowerCase() === "host") {
      throw new DatabaseError("overwriting the 'Host' header is not supported");
    }
    headers[name] = value;
  }
  return headers;
}
function buildFetchOptions(ctx, body, signal) {
  return {
    method: "POST",
    headers: buildHeaders(ctx),
    body,
    signal
  };
}
function wrapAbortError(error) {
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    throw new TimeoutError("Query timed out");
  }
  throw error;
}
async function executeCursor(ctx, request, signal) {
  let response;
  try {
    response = await fetch(`${ctx.url}/v3/cursor`, buildFetchOptions(ctx, JSON.stringify(request), signal));
  } catch (error) {
    wrapAbortError(error);
  }
  if (!response.ok) {
    let errorMessage = `HTTP error! status: ${response.status}`;
    try {
      const errorBody = await response.text();
      const errorData = JSON.parse(errorBody);
      if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch {}
    throw new DatabaseError(errorMessage);
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new DatabaseError("No response body");
  }
  const decoder = new TextDecoder;
  let buffer = "";
  let cursorResponse;
  try {
    while (!cursorResponse) {
      const { done, value } = await reader.read();
      if (done)
        break;
      buffer += decoder.decode(value, { stream: true });
      const newlineIndex = buffer.indexOf(`
`);
      if (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          cursorResponse = JSON.parse(line);
          break;
        }
      }
    }
  } catch (error) {
    reader.releaseLock();
    wrapAbortError(error);
  }
  if (!cursorResponse) {
    reader.releaseLock();
    throw new DatabaseError("No cursor response received");
  }
  async function* parseEntries() {
    try {
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf(`
`)) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          yield JSON.parse(line);
        }
      }
      while (true) {
        let readResult;
        try {
          readResult = await reader.read();
        } catch (error) {
          wrapAbortError(error);
        }
        if (readResult.done)
          break;
        buffer += decoder.decode(readResult.value, { stream: true });
        while ((newlineIndex = buffer.indexOf(`
`)) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (line) {
            yield JSON.parse(line);
          }
        }
      }
      if (buffer.trim()) {
        yield JSON.parse(buffer.trim());
      }
    } finally {
      reader.releaseLock();
    }
  }
  return { response: cursorResponse, entries: parseEntries() };
}
async function executePipeline(ctx, request, signal) {
  let response;
  try {
    response = await fetch(`${ctx.url}/v3/pipeline`, buildFetchOptions(ctx, JSON.stringify(request), signal));
  } catch (error) {
    wrapAbortError(error);
  }
  if (!response.ok) {
    throw new DatabaseError(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}
function normalizeArgs(args) {
  if (args === undefined)
    return [];
  if (Array.isArray(args))
    return args;
  if (args !== null && typeof args === "object" && args.constructor === Object) {
    return args;
  }
  return [args];
}
function isQueryOptions(value) {
  return value != null && typeof value === "object" && !Array.isArray(value) && (Object.prototype.hasOwnProperty.call(value, "queryTimeout") || Object.prototype.hasOwnProperty.call(value, "requestHeaders"));
}
function splitBindParameters(bindParameters) {
  if (bindParameters.length === 0) {
    return { params: undefined, queryOptions: undefined };
  }
  if (isQueryOptions(bindParameters[bindParameters.length - 1])) {
    if (bindParameters.length === 1) {
      return { params: undefined, queryOptions: bindParameters[0] };
    }
    return {
      params: bindParameters.length === 2 ? bindParameters[0] : bindParameters.slice(0, -1),
      queryOptions: bindParameters[bindParameters.length - 1]
    };
  }
  return {
    params: bindParameters.length === 1 ? bindParameters[0] : bindParameters,
    queryOptions: undefined
  };
}
function encodeSqlArgs(args = []) {
  let positionalArgs = [];
  let namedArgs = [];
  if (Array.isArray(args)) {
    positionalArgs = args.map(encodeValue);
  } else {
    const keys = Object.keys(args);
    const isNumericKeys = keys.length > 0 && keys.every((key) => /^\d+$/.test(key));
    if (isNumericKeys) {
      const sortedKeys = keys.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
      const maxIndex = parseInt(sortedKeys[sortedKeys.length - 1], 10);
      positionalArgs = new Array(maxIndex);
      for (const key of sortedKeys) {
        const index = parseInt(key, 10) - 1;
        positionalArgs[index] = encodeValue(args[key]);
      }
      for (let i = 0;i < positionalArgs.length; i++) {
        if (positionalArgs[i] === undefined) {
          positionalArgs[i] = { type: "null" };
        }
      }
    } else {
      namedArgs = Object.entries(args).map(([name, value]) => ({
        name,
        value: encodeValue(value)
      }));
    }
  }
  return { args: positionalArgs, namedArgs };
}
var TRANSACTION_CONTROL_KEYWORDS = /* @__PURE__ */ new Set([
  "BEGIN",
  "COMMIT",
  "END",
  "ROLLBACK",
  "SAVEPOINT",
  "RELEASE"
]);
function normalizeBatchMode(mode) {
  switch (String(mode).toLowerCase()) {
    case "write":
      return "IMMEDIATE";
    case "read":
    case "deferred":
      return "DEFERRED";
    case "immediate":
      return "IMMEDIATE";
    case "exclusive":
      return "EXCLUSIVE";
    case "concurrent":
      return "CONCURRENT";
    default:
      return String(mode).toUpperCase();
  }
}
function firstSqlKeyword(sql) {
  let offset = 0;
  while (offset < sql.length) {
    if (/\s/.test(sql[offset]) || sql[offset] === ";") {
      offset++;
      continue;
    }
    if (sql.startsWith("--", offset)) {
      const newline = sql.indexOf(`
`, offset + 2);
      if (newline < 0)
        return;
      offset = newline + 1;
      continue;
    }
    if (sql.startsWith("/*", offset)) {
      const end = sql.indexOf("*/", offset + 2);
      if (end < 0)
        return;
      offset = end + 2;
      continue;
    }
    break;
  }
  return /^[A-Za-z]+/.exec(sql.slice(offset))?.[0].toUpperCase();
}
function batchInputError(index, message) {
  const error = new DatabaseError(`batch statement ${index} failed: ${message}`);
  error.batchIndex = index;
  error.batchResults = [];
  return error;
}
function normalizeUrl(url) {
  return url.replace(/^(libsql|turso):\/\//, "https://").replace(/\/+$/, "");
}
function isValidIdentifier(str) {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(str);
}
var Session = class _Session {
  constructor(config) {
    this.baton = null;
    this.autocommit = true;
    for (const name of Object.keys(config.requestHeaders ?? {})) {
      if (name.toLowerCase() === "host") {
        throw new DatabaseError("overwriting the 'Host' header is not supported");
      }
    }
    this.config = config;
    this.baseUrl = normalizeUrl(config.url);
  }
  httpContext(queryOptions) {
    let requestHeaders = this.config.requestHeaders;
    if (queryOptions?.requestHeaders) {
      requestHeaders = { ...requestHeaders, ...queryOptions.requestHeaders };
    }
    return {
      url: this.baseUrl,
      authToken: this.config.authToken,
      remoteEncryptionKey: this.config.remoteEncryptionKey,
      requestHeaders
    };
  }
  get inTransaction() {
    return !this.autocommit;
  }
  updateAutocommit(response) {
    if (!response.results) {
      return;
    }
    for (const result of response.results) {
      if (result.type === "ok" && result.response?.type === "get_autocommit" && typeof result.response.is_autocommit === "boolean") {
        this.autocommit = result.response.is_autocommit;
        return;
      }
    }
  }
  createAbortSignal(queryOptions) {
    const timeout = queryOptions?.queryTimeout ?? this.config.defaultQueryTimeout;
    if (timeout != null && timeout > 0) {
      return AbortSignal.timeout(timeout);
    }
    return;
  }
  async describe(sql, queryOptions) {
    const request = {
      baton: this.baton,
      requests: [
        { type: "describe", sql },
        { type: "get_autocommit" }
      ]
    };
    let response;
    try {
      response = await executePipeline(this.httpContext(queryOptions), request, this.createAbortSignal(queryOptions));
    } catch (e) {
      this.baton = null;
      this.autocommit = true;
      throw e;
    }
    this.baton = response.baton;
    if (response.base_url) {
      this.baseUrl = normalizeUrl(response.base_url);
    }
    this.updateAutocommit(response);
    if (response.results && response.results[0]) {
      const result = response.results[0];
      if (result.type === "error") {
        throw new DatabaseError(result.error?.message || "Describe execution failed", result.error?.code);
      }
      if (result.response?.type === "describe" && result.response.result) {
        return result.response.result;
      }
    }
    throw new DatabaseError("Unexpected describe response");
  }
  async execute(sql, args = [], safeIntegers = false, queryOptions) {
    const { response, entries } = await this.executeRaw(sql, args, queryOptions);
    const result = await this.processCursorEntries(entries, safeIntegers);
    return result;
  }
  static autocommitProbeStep() {
    return {
      stmt: { sql: "SELECT 1", args: [], named_args: [], want_rows: false },
      condition: { type: "is_autocommit" }
    };
  }
  async* trackAutocommit(entries, probeIdx, queryOptions) {
    let sawProbe = false;
    let unreliable = false;
    let completed = false;
    try {
      for await (const entry of entries) {
        if (entry.type === "step_begin" && entry.step === probeIdx) {
          sawProbe = true;
          continue;
        }
        if (sawProbe && (entry.type === "row" || entry.type === "step_end")) {
          continue;
        }
        if (entry.type === "error" || entry.type === "step_error" && entry.step === probeIdx) {
          unreliable = true;
          if (entry.type === "step_error") {
            continue;
          }
        }
        yield entry;
      }
      completed = true;
    } finally {
      if (completed && !unreliable) {
        this.autocommit = sawProbe;
      } else {
        await this.refreshAutocommit(queryOptions);
      }
    }
  }
  async executeRaw(sql, args = [], queryOptions) {
    const encodedArgs = encodeSqlArgs(args);
    const request = {
      baton: this.baton,
      batch: {
        steps: [{
          stmt: {
            sql,
            args: encodedArgs.args,
            named_args: encodedArgs.namedArgs,
            want_rows: true
          }
        }, _Session.autocommitProbeStep()]
      }
    };
    let result;
    try {
      result = await executeCursor(this.httpContext(queryOptions), request, this.createAbortSignal(queryOptions));
    } catch (e) {
      this.baton = null;
      this.autocommit = true;
      throw e;
    }
    const { response, entries } = result;
    this.baton = response.baton;
    if (response.base_url) {
      this.baseUrl = normalizeUrl(response.base_url);
    }
    return { response, entries: this.trackAutocommit(entries, 1, queryOptions) };
  }
  async refreshAutocommit(queryOptions) {
    const request = {
      baton: this.baton,
      requests: [{ type: "get_autocommit" }]
    };
    let response;
    try {
      response = await executePipeline(this.httpContext(), request, this.createAbortSignal(queryOptions));
    } catch {
      this.baton = null;
      this.autocommit = true;
      return;
    }
    this.baton = response.baton;
    if (response.base_url) {
      this.baseUrl = normalizeUrl(response.base_url);
    }
    this.updateAutocommit(response);
  }
  async processCursorEntries(entries, safeIntegers = false) {
    let columns = [];
    let columnTypes = [];
    let rows = [];
    let rowsAffected = 0;
    let lastInsertRowid;
    for await (const entry of entries) {
      switch (entry.type) {
        case "step_begin":
          if (entry.cols) {
            columns = entry.cols.map((col) => col.name);
            columnTypes = entry.cols.map((col) => col.decltype || "");
          }
          break;
        case "row":
          if (entry.row) {
            const decodedRow = entry.row.map((value) => decodeValue(value, safeIntegers));
            const rowObject = this.createRowObject(decodedRow, columns);
            rows.push(rowObject);
          }
          break;
        case "step_end":
          if (entry.affected_row_count !== undefined) {
            rowsAffected = entry.affected_row_count;
          }
          if (entry.last_insert_rowid !== undefined && entry.last_insert_rowid !== null) {
            lastInsertRowid = typeof entry.last_insert_rowid === "number" ? entry.last_insert_rowid : parseInt(entry.last_insert_rowid, 10);
          }
          break;
        case "step_error":
        case "error":
          throw new DatabaseError(entry.error?.message || "SQL execution failed", entry.error?.code);
      }
    }
    return {
      columns,
      columnTypes,
      rows,
      rowsAffected,
      lastInsertRowid
    };
  }
  createRowObject(values, columns) {
    const row = [...values];
    columns.forEach((column, index) => {
      if (column && isValidIdentifier(column) && !Object.prototype.hasOwnProperty.call(row, column)) {
        Object.defineProperty(row, column, {
          value: values[index],
          enumerable: false,
          writable: false,
          configurable: true
        });
      }
    });
    return row;
  }
  createObjectRow(values, columns) {
    const row = {};
    columns.forEach((column, index) => {
      row[column] = values[index];
    });
    return row;
  }
  async batch(statements, mode, queryOptions, safeIntegers = false, raw = false) {
    const userSteps = statements.map((statement, index) => {
      if (typeof statement === "string") {
        return {
          stmt: { sql: statement, args: [], named_args: [], want_rows: true }
        };
      }
      let encodedArgs;
      try {
        encodedArgs = encodeSqlArgs(statement.args ?? []);
      } catch (e) {
        throw batchInputError(index, e?.message ?? String(e));
      }
      return {
        stmt: {
          sql: statement.sql,
          args: encodedArgs.args,
          named_args: encodedArgs.namedArgs,
          want_rows: true
        }
      };
    });
    if (mode !== undefined) {
      for (let index = 0;index < statements.length; index++) {
        const statement = statements[index];
        const sql = typeof statement === "string" ? statement : statement.sql;
        const keyword = firstSqlKeyword(sql);
        if (keyword !== undefined && TRANSACTION_CONTROL_KEYWORDS.has(keyword)) {
          throw batchInputError(index, `${keyword} is not allowed in an atomic batch`);
        }
      }
    }
    let steps;
    let firstUserStepIdx = 0;
    let beginIdx = -1;
    let commitIdx = -1;
    let rollbackIdx = -1;
    if (mode === undefined) {
      steps = userSteps.map((step, i) => i === 0 ? step : { ...step, condition: { type: "ok", step: i - 1 } });
    } else {
      beginIdx = 0;
      firstUserStepIdx = 1;
      const lastUserStepIdx = userSteps.length;
      commitIdx = lastUserStepIdx + 1;
      rollbackIdx = commitIdx + 1;
      steps = [
        { stmt: { sql: `BEGIN ${normalizeBatchMode(mode)}`, args: [], named_args: [], want_rows: false } },
        ...userSteps.map((step, i) => ({
          ...step,
          condition: { type: "ok", step: i === 0 ? beginIdx : firstUserStepIdx + i - 1 }
        })),
        {
          stmt: { sql: "COMMIT", args: [], named_args: [], want_rows: false },
          condition: { type: "ok", step: lastUserStepIdx }
        },
        {
          stmt: { sql: "ROLLBACK", args: [], named_args: [], want_rows: false },
          condition: {
            type: "and",
            conds: [
              { type: "ok", step: beginIdx },
              { type: "not", cond: { type: "ok", step: commitIdx } }
            ]
          }
        }
      ];
    }
    const request = {
      baton: this.baton,
      requests: [
        { type: "batch", batch: { steps } },
        { type: "get_autocommit" }
      ]
    };
    let response;
    try {
      response = await executePipeline(this.httpContext(queryOptions), request, this.createAbortSignal(queryOptions));
    } catch (e) {
      this.baton = null;
      this.autocommit = true;
      throw e;
    }
    this.baton = response.baton;
    if (response.base_url) {
      this.baseUrl = normalizeUrl(response.base_url);
    }
    this.updateAutocommit(response);
    const first = response.results?.[0];
    if (!first) {
      throw new DatabaseError("missing batch result in pipeline response");
    }
    if (first.type === "error") {
      throw new DatabaseError(first.error?.message || "Batch execution failed", first.error?.code);
    }
    if (first.response?.type !== "batch") {
      throw new DatabaseError(`expected batch result in pipeline response, got ${first.response?.type}`);
    }
    const batchResult = first.response.result;
    const stepResults = batchResult?.step_results;
    const stepErrors = batchResult?.step_errors;
    if (!Array.isArray(stepResults) || !Array.isArray(stepErrors) || stepResults.length !== steps.length || stepErrors.length !== steps.length) {
      throw new DatabaseError("batch response does not have one result and one error per step");
    }
    const results = statements.map((_, i) => {
      const stepResult = stepResults[firstUserStepIdx + i];
      return stepResult ? this.decodeBatchStepResult(stepResult, safeIntegers, raw) : null;
    });
    const rollbackError = rollbackIdx >= 0 ? stepErrors[rollbackIdx] : null;
    const throwStepError = (error, batchIndex) => {
      const e = new DatabaseError(error?.message || "Batch execution failed", error?.code);
      if (batchIndex !== undefined) {
        e.batchIndex = batchIndex;
      }
      e.batchResults = results;
      if (rollbackError) {
        e.rollbackError = new DatabaseError(rollbackError.message || "Batch rollback failed", rollbackError.code);
      }
      throw e;
    };
    if (beginIdx >= 0 && stepErrors[beginIdx]) {
      throwStepError(stepErrors[beginIdx]);
    }
    for (let i = 0;i < userSteps.length; i++) {
      const stepError = stepErrors[firstUserStepIdx + i];
      if (stepError) {
        throwStepError(stepError, i);
      }
    }
    if (commitIdx >= 0 && stepErrors[commitIdx]) {
      throwStepError(stepErrors[commitIdx]);
    }
    if (rollbackError) {
      const error = new DatabaseError(rollbackError.message || "Batch rollback failed", rollbackError.code);
      error.batchResults = results;
      throw error;
    }
    if (results.some((result) => result === null)) {
      throw new DatabaseError("batch response is missing statement results");
    }
    return results;
  }
  decodeBatchStepResult(stepResult, safeIntegers, raw) {
    const columns = (stepResult.cols ?? []).map((col) => col.name ?? "");
    const columnTypes = (stepResult.cols ?? []).map((col) => col.decltype || "");
    const rows = (stepResult.rows ?? []).map((row) => {
      const decoded = row.map((value) => decodeValue(value, safeIntegers));
      return raw ? decoded : this.createObjectRow(decoded, columns);
    });
    let lastInsertRowid;
    if (stepResult.last_insert_rowid !== undefined && stepResult.last_insert_rowid !== null) {
      lastInsertRowid = typeof stepResult.last_insert_rowid === "number" ? stepResult.last_insert_rowid : parseInt(stepResult.last_insert_rowid, 10);
    }
    const resultSet = {
      columns,
      columnTypes,
      rows,
      rowsAffected: columns.length > 0 ? 0 : stepResult.affected_row_count ?? 0,
      rowsRead: stepResult.rows_read,
      rowsWritten: stepResult.rows_written,
      queryDurationMs: stepResult.query_duration_ms
    };
    if (lastInsertRowid !== undefined) {
      resultSet.lastInsertRowid = lastInsertRowid;
    }
    return resultSet;
  }
  async sequence(sql, queryOptions) {
    const request = {
      baton: this.baton,
      requests: [
        { type: "sequence", sql },
        { type: "get_autocommit" }
      ]
    };
    let seqResponse;
    try {
      seqResponse = await executePipeline(this.httpContext(queryOptions), request, this.createAbortSignal(queryOptions));
    } catch (e) {
      this.baton = null;
      this.autocommit = true;
      throw e;
    }
    this.baton = seqResponse.baton;
    if (seqResponse.base_url) {
      this.baseUrl = normalizeUrl(seqResponse.base_url);
    }
    this.updateAutocommit(seqResponse);
    if (seqResponse.results && seqResponse.results[0]) {
      const result = seqResponse.results[0];
      if (result.type === "error") {
        throw new DatabaseError(result.error?.message || "Sequence execution failed", result.error?.code);
      }
    }
  }
  async close() {
    if (this.baton) {
      try {
        const request = {
          baton: this.baton,
          requests: [{
            type: "close"
          }]
        };
        await executePipeline(this.httpContext(), request);
      } catch {}
    }
    this.baton = null;
    this.baseUrl = "";
    this.autocommit = true;
  }
};
function createExpandedRow(row, columns) {
  const expanded = {};
  columns.forEach((column, index) => {
    expanded[column] = row[index];
  });
  return expanded;
}
var Statement = class _Statement {
  constructor(sessionConfig, sql, columns) {
    this.presentationMode = "expanded";
    this.safeIntegerMode = false;
    this.session = new Session(sessionConfig);
    this.sql = sql;
    this.columnMetadata = columns || [];
  }
  static fromSession(session, sql, columns, execLock) {
    const stmt = Object.create(_Statement.prototype);
    stmt.session = session;
    stmt.sql = sql;
    stmt.columnMetadata = columns || [];
    stmt.presentationMode = "expanded";
    stmt.safeIntegerMode = false;
    stmt.execLock = execLock;
    return stmt;
  }
  get reader() {
    return this.columnMetadata.length > 0;
  }
  raw(raw) {
    this.presentationMode = raw === false ? "expanded" : "raw";
    return this;
  }
  pluck(pluck) {
    this.presentationMode = pluck === false ? "expanded" : "pluck";
    return this;
  }
  safeIntegers(toggle) {
    this.safeIntegerMode = toggle === false ? false : true;
    return this;
  }
  columns() {
    return this.columnMetadata.map((col) => ({
      name: col.name,
      type: col.decltype
    }));
  }
  async withLock(fn) {
    if (!this.execLock) {
      return await fn();
    }
    await this.execLock.acquire();
    try {
      return await fn();
    } finally {
      this.execLock.release();
    }
  }
  async run(args, queryOptions) {
    return await this.withLock(async () => {
      const normalizedArgs = normalizeArgs(args);
      const result = await this.session.execute(this.sql, normalizedArgs, this.safeIntegerMode, queryOptions);
      return { changes: result.rowsAffected, lastInsertRowid: result.lastInsertRowid };
    });
  }
  async get(args, queryOptions) {
    return await this.withLock(async () => {
      const normalizedArgs = normalizeArgs(args);
      const result = await this.session.execute(this.sql, normalizedArgs, this.safeIntegerMode, queryOptions);
      const row = result.rows[0];
      if (!row) {
        return;
      }
      if (this.presentationMode === "pluck") {
        return row[0];
      }
      if (this.presentationMode === "raw") {
        return [...row];
      }
      return createExpandedRow(row, result.columns);
    });
  }
  async all(args, queryOptions) {
    return await this.withLock(async () => {
      const normalizedArgs = normalizeArgs(args);
      const result = await this.session.execute(this.sql, normalizedArgs, this.safeIntegerMode, queryOptions);
      if (this.presentationMode === "pluck") {
        return result.rows.map((row) => row[0]);
      }
      if (this.presentationMode === "raw") {
        return result.rows.map((row) => [...row]);
      }
      return result.rows.map((row) => createExpandedRow(row, result.columns));
    });
  }
  async* iterate(args, queryOptions) {
    if (this.execLock) {
      const rows = await this.all(args, queryOptions);
      for (const row of rows) {
        yield row;
      }
      return;
    }
    const normalizedArgs = normalizeArgs(args);
    const { entries } = await this.session.executeRaw(this.sql, normalizedArgs, queryOptions);
    let columns = [];
    for await (const entry of entries) {
      switch (entry.type) {
        case "step_begin":
          if (entry.cols) {
            columns = entry.cols.map((col) => col.name);
          }
          break;
        case "row":
          if (entry.row) {
            const decodedRow = entry.row.map((value) => decodeValue(value, this.safeIntegerMode));
            if (this.presentationMode === "pluck") {
              yield decodedRow[0];
            } else if (this.presentationMode === "raw") {
              yield decodedRow;
            } else {
              yield createExpandedRow(decodedRow, columns);
            }
          }
          break;
        case "step_error":
        case "error":
          throw new DatabaseError(entry.error?.message || "SQL execution failed");
      }
    }
  }
};
function normalizeBatchOptions(options) {
  if (options != null && typeof options === "object") {
    return {
      mode: options.mode,
      raw: options.raw === true
    };
  }
  return {
    mode: options,
    raw: false
  };
}
function toResultSet(result) {
  const resultSet = {
    columns: result.columns ?? [],
    columnTypes: result.columnTypes ?? [],
    rows: result.rows ?? [],
    rowsAffected: result.rowsAffected ?? 0,
    rowsRead: result.rowsRead,
    rowsWritten: result.rowsWritten,
    queryDurationMs: result.queryDurationMs
  };
  if (result.lastInsertRowid !== undefined) {
    resultSet.lastInsertRowid = result.lastInsertRowid;
  }
  return resultSet;
}
function shapeBatchError(error) {
  if (error instanceof DatabaseError && Array.isArray(error.batchResults)) {
    error.batchResults = error.batchResults.map((result) => result === null ? null : toResultSet(result));
  }
  return error;
}
var Connection = class {
  constructor(config) {
    this.isOpen = true;
    this.defaultSafeIntegerMode = false;
    this.execLock = new AsyncLock;
    if (!config.url) {
      throw new Error("invalid config: url is required");
    }
    this.config = config;
    this.session = new Session(config);
    Object.defineProperty(this, "inTransaction", {
      get: () => this.session.inTransaction,
      enumerable: true
    });
  }
  get inTransaction() {
    return this.session.inTransaction;
  }
  async prepare(sql) {
    if (!this.isOpen) {
      throw new TypeError("The database connection is not open");
    }
    await this.execLock.acquire();
    let description;
    try {
      description = await this.session.describe(sql);
    } finally {
      this.execLock.release();
    }
    const stmt = Statement.fromSession(this.session, sql, description.cols, this.execLock);
    if (this.defaultSafeIntegerMode) {
      stmt.safeIntegers(true);
    }
    return stmt;
  }
  async run(sql, ...bindParameters) {
    if (!this.isOpen)
      throw new TypeError("The database connection is not open");
    const { params, queryOptions } = splitBindParameters(bindParameters);
    await this.execLock.acquire();
    try {
      const result = await this.session.execute(sql, normalizeArgs(params), this.defaultSafeIntegerMode, queryOptions);
      return { changes: result.rowsAffected, lastInsertRowid: result.lastInsertRowid };
    } finally {
      this.execLock.release();
    }
  }
  async get(sql, ...bindParameters) {
    if (!this.isOpen)
      throw new TypeError("The database connection is not open");
    const { params, queryOptions } = splitBindParameters(bindParameters);
    await this.execLock.acquire();
    try {
      const result = await this.session.execute(sql, normalizeArgs(params), this.defaultSafeIntegerMode, queryOptions);
      const row = result.rows[0];
      if (!row)
        return;
      return createExpandedRow(row, result.columns);
    } finally {
      this.execLock.release();
    }
  }
  async all(sql, ...bindParameters) {
    if (!this.isOpen)
      throw new TypeError("The database connection is not open");
    const { params, queryOptions } = splitBindParameters(bindParameters);
    await this.execLock.acquire();
    try {
      const result = await this.session.execute(sql, normalizeArgs(params), this.defaultSafeIntegerMode, queryOptions);
      return result.rows.map((row) => createExpandedRow(row, result.columns));
    } finally {
      this.execLock.release();
    }
  }
  async* iterate(sql, ...bindParameters) {
    for (const row of await this.all(sql, ...bindParameters))
      yield row;
  }
  async exec(sql, queryOptions) {
    if (!this.isOpen) {
      throw new TypeError("The database connection is not open");
    }
    await this.execLock.acquire();
    try {
      return await this.session.sequence(sql, queryOptions);
    } finally {
      this.execLock.release();
    }
  }
  async batch(statements, options, queryOptions) {
    if (!Array.isArray(statements)) {
      throw new TypeError("Expected first argument to be an array of statements");
    }
    if (!this.isOpen) {
      throw new TypeError("The database connection is not open");
    }
    await this.execLock.acquire();
    try {
      const { mode, raw } = normalizeBatchOptions(options);
      const effectiveMode = this.session.inTransaction ? undefined : mode;
      const results = await this.session.batch(statements, effectiveMode, queryOptions, this.defaultSafeIntegerMode, raw);
      return results.map((result) => toResultSet(result));
    } catch (error) {
      throw shapeBatchError(error);
    } finally {
      this.execLock.release();
    }
  }
  async pragma(pragma, queryOptions) {
    if (!this.isOpen) {
      throw new TypeError("The database connection is not open");
    }
    await this.execLock.acquire();
    try {
      const sql = `PRAGMA ${pragma}`;
      return await this.session.execute(sql, [], false, queryOptions);
    } finally {
      this.execLock.release();
    }
  }
  defaultSafeIntegers(toggle) {
    this.defaultSafeIntegerMode = toggle === false ? false : true;
  }
  transaction(fn) {
    if (typeof fn !== "function") {
      throw new TypeError("Expected first argument to be a function");
    }
    const db = this;
    const wrapTxn = (mode) => {
      return async (...bindParameters) => {
        await db.exec("BEGIN " + mode);
        try {
          const result = await fn(...bindParameters);
          await db.exec("COMMIT");
          return result;
        } catch (err) {
          await db.exec("ROLLBACK");
          throw err;
        }
      };
    };
    const properties = {
      default: { value: wrapTxn("") },
      deferred: { value: wrapTxn("DEFERRED") },
      concurrent: { value: wrapTxn("CONCURRENT") },
      immediate: { value: wrapTxn("IMMEDIATE") },
      exclusive: { value: wrapTxn("EXCLUSIVE") },
      database: { value: this, enumerable: true }
    };
    Object.defineProperties(properties.default.value, properties);
    Object.defineProperties(properties.deferred.value, properties);
    Object.defineProperties(properties.concurrent.value, properties);
    Object.defineProperties(properties.immediate.value, properties);
    Object.defineProperties(properties.exclusive.value, properties);
    return properties.default.value;
  }
  transactionAsync(fn) {
    if (typeof fn !== "function") {
      throw new TypeError("Expected first argument to be a function");
    }
    if (fn.length === 0) {
      throw new TypeError("transactionAsync() callbacks receive a Transaction handle as their first argument and must declare it: db.transactionAsync(async (tx, ...args) => { await tx.run(...) }).");
    }
    const db = this;
    const wrapTxn = (mode) => {
      return async (...bindParameters) => {
        if (!db.isOpen) {
          throw new TypeError("The database connection is not open");
        }
        const session = new Session(db.config);
        const txn = new Transaction(session, db.defaultSafeIntegerMode);
        try {
          await txn.exec("BEGIN " + mode);
          try {
            const result = await fn(txn, ...bindParameters);
            await txn.exec("COMMIT");
            return result;
          } catch (err) {
            try {
              await txn.exec("ROLLBACK");
            } catch {}
            throw err;
          }
        } finally {
          txn.finish();
          await session.close();
        }
      };
    };
    const properties = {
      default: { value: wrapTxn("") },
      deferred: { value: wrapTxn("DEFERRED") },
      concurrent: { value: wrapTxn("CONCURRENT") },
      immediate: { value: wrapTxn("IMMEDIATE") },
      exclusive: { value: wrapTxn("EXCLUSIVE") },
      database: { value: this, enumerable: true }
    };
    Object.defineProperties(properties.default.value, properties);
    Object.defineProperties(properties.deferred.value, properties);
    Object.defineProperties(properties.concurrent.value, properties);
    Object.defineProperties(properties.immediate.value, properties);
    Object.defineProperties(properties.exclusive.value, properties);
    return properties.default.value;
  }
  async close() {
    this.isOpen = false;
    await this.session.close();
  }
  async reconnect() {
    try {
      if (this.isOpen) {
        await this.close();
      }
    } finally {
      this.session = new Session(this.config);
      this.isOpen = true;
    }
  }
};
var Transaction = class {
  constructor(session, defaultSafeIntegerMode) {
    this.active = true;
    this.session = session;
    this.defaultSafeIntegerMode = defaultSafeIntegerMode;
    const lock = new AsyncLock;
    this.gate = {
      acquire: async () => {
        this.assertActive();
        await lock.acquire();
      },
      release: () => {
        lock.release();
      }
    };
  }
  async withGate(fn) {
    await this.gate.acquire();
    try {
      return await fn();
    } finally {
      this.gate.release();
    }
  }
  get open() {
    return this.active;
  }
  assertActive() {
    if (!this.active) {
      throw new TypeError("The transaction has already completed");
    }
  }
  finish() {
    this.active = false;
  }
  async prepare(sql) {
    const description = await this.withGate(() => this.session.describe(sql));
    const stmt = Statement.fromSession(this.session, sql, description.cols, this.gate);
    if (this.defaultSafeIntegerMode) {
      stmt.safeIntegers(true);
    }
    return stmt;
  }
  async run(sql, ...bindParameters) {
    const { params, queryOptions } = splitBindParameters(bindParameters);
    return await this.withGate(async () => {
      const result = await this.session.execute(sql, normalizeArgs(params), this.defaultSafeIntegerMode, queryOptions);
      return { changes: result.rowsAffected, lastInsertRowid: result.lastInsertRowid };
    });
  }
  async get(sql, ...bindParameters) {
    const { params, queryOptions } = splitBindParameters(bindParameters);
    return await this.withGate(async () => {
      const result = await this.session.execute(sql, normalizeArgs(params), this.defaultSafeIntegerMode, queryOptions);
      const row = result.rows[0];
      if (!row)
        return;
      return createExpandedRow(row, result.columns);
    });
  }
  async all(sql, ...bindParameters) {
    const { params, queryOptions } = splitBindParameters(bindParameters);
    return await this.withGate(async () => {
      const result = await this.session.execute(sql, normalizeArgs(params), this.defaultSafeIntegerMode, queryOptions);
      return result.rows.map((row) => createExpandedRow(row, result.columns));
    });
  }
  async* iterate(sql, ...bindParameters) {
    for (const row of await this.all(sql, ...bindParameters))
      yield row;
  }
  async execute(sql, args, queryOptions) {
    return await this.withGate(() => this.session.execute(sql, args || [], this.defaultSafeIntegerMode, queryOptions));
  }
  async exec(sql, queryOptions) {
    return await this.withGate(() => this.session.sequence(sql, queryOptions));
  }
  async batch(statements, options, queryOptions) {
    if (!Array.isArray(statements)) {
      throw new TypeError("Expected first argument to be an array of statements");
    }
    const { raw } = normalizeBatchOptions(options);
    return await this.withGate(async () => {
      try {
        const results = await this.session.batch(statements, undefined, queryOptions, this.defaultSafeIntegerMode, raw);
        return results.map((result) => toResultSet(result));
      } catch (error) {
        throw shapeBatchError(error);
      }
    });
  }
};
function connect(config) {
  return new Connection(config);
}

// src/store/turso.ts
function toNumber(v) {
  if (typeof v === "bigint" && v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= BigInt(Number.MIN_SAFE_INTEGER)) {
    return Number(v);
  }
  return v;
}
function toRows(r) {
  return r.rows.map((values) => Object.fromEntries(r.columns.map((c, i) => [c, toNumber(values[i])])));
}
function classify(err, url) {
  if (err instanceof TimeoutError)
    return new Offline(`Turso did not answer in time (${url})`);
  if (err instanceof DatabaseError) {
    const status = /HTTP error! status: (\d+)/.exec(err.message);
    if (status) {
      const code = Number(status[1]);
      if (code === 401 || code === 403)
        return new AuthError(`Turso refused the token for ${url} (HTTP ${code})`);
      if (code === 429 || code >= 500)
        return new Offline(`Turso is unavailable (HTTP ${code}, ${url})`);
      return new CliError(`Turso request failed (HTTP ${code}, ${url})`);
    }
    return new CliError(err.message);
  }
  return new Offline(`Turso is unreachable (${url}): ${err?.message ?? err}`);
}

class TursoStore {
  url;
  kind = "turso";
  conn;
  constructor(url, authToken, timeoutMs = 5000) {
    this.url = url;
    this.conn = connect({ url, authToken, defaultQueryTimeout: timeoutMs });
  }
  async send(stmts, atomic) {
    const batch = stmts.map((s) => ({ sql: s.sql, args: s.args ?? [] }));
    try {
      const results = await this.conn.batch(batch, { mode: atomic ? "write" : undefined, raw: true });
      return results.map(toRows);
    } catch (err) {
      throw classify(err, this.url);
    }
  }
  async query(sql, args = []) {
    const [rows] = await this.send([{ sql, args }], false);
    return rows ?? [];
  }
  async exec(sql, args = []) {
    await this.send([{ sql, args }], false);
  }
  async batch(stmts) {
    return this.send(stmts, true);
  }
  async close() {
    try {
      await this.conn.close();
    } catch {}
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
  log;
  config;
  key;
  offline = new Map;
  constructor(loc, log = () => {}, config) {
    this.loc = loc;
    this.log = log;
    this.config = config ?? readConfig(log);
    this.key = projectKey(loc.repoRoot, loc.dir, this.config);
  }
  project() {
    return this.key ? this.config.projects?.[this.key] : undefined;
  }
  remoteFor(db) {
    const p = this.project();
    return p?.backend === "turso" ? p[db] ?? null : null;
  }
  outboxFor(db) {
    return new Outbox(join3(this.loc.dir, db === "security" ? FILES.securityOutbox : FILES.issuesOutbox));
  }
  openRemote(db, remote) {
    const timeout = Number(process.env.ISSUE_TRACKER_TIMEOUT_MS) || 5000;
    return new TursoStore(remote.url, resolveToken(remote, db), timeout);
  }
  queueCtx(mirror, outbox) {
    return {
      mirror,
      outbox,
      nextPid: async () => {
        const next = Number(await getSync(mirror, "next_pid") ?? "1");
        await setSync(mirror, "next_pid", String(next + 1));
        return next;
      }
    };
  }
  async run(db, fn, opts = {}) {
    const remoteCfg = this.remoteFor(db);
    if (!remoteCfg) {
      const store = await openLocal(this.loc, db);
      const rt = {
        pid: async () => {
          throw new CliError("Provisional ids exist only on Turso projects.");
        }
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
    const rt = { pid: (pid) => resolvePid(mirror, db, pid) };
    let done = false;
    let result;
    try {
      await migrate(remote);
      await this.flushWith(db, remote, mirror, outbox);
      result = await fn(remote, rt);
      done = true;
      await refreshMirror(remote, mirror);
      return result;
    } catch (err) {
      if (!(err instanceof Offline))
        throw err;
      if (done) {
        this.log(`warning: the change reached Turso, but the local mirror was not refreshed (${err.message}).`);
        return result;
      }
      const q = this.queueCtx(mirror, outbox);
      if (opts.queue)
        return await opts.queue(q);
      if (opts.write) {
        throw new Offline(`${sentence(err.message)} Only new issues and notes queue offline; retry this when Turso is reachable.`);
      }
      this.offline.set(db, await getSync(mirror, "synced_at") ?? "never");
      if (opts.offlineRead)
        return await opts.offlineRead(q);
      return await fn(mirror, rt);
    } finally {
      await remote.close();
      await mirror.close();
    }
  }
  async flushWith(db, remote, mirror, outbox) {
    if (outbox.read().length === 0)
      return;
    for (const line of await replay(remote, db, outbox, mirror))
      this.log(line);
  }
}

// src/commands/check.ts
async function checkDb(store, db, milestones) {
  const problems = [];
  try {
    const [integrity] = await store.query("PRAGMA integrity_check");
    if (integrity && integrity.integrity_check !== "ok") {
      problems.push(`${db} database: integrity_check says ${integrity.integrity_check}`);
    }
    for (const fk of await store.query("PRAGMA foreign_key_check")) {
      problems.push(`${db} database: foreign key broken in ${fk.table} row ${fk.rowid}`);
    }
  } catch (err) {
    if (store.kind === "local" || err instanceof Offline)
      throw err;
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

// src/commands/offline.ts
async function queueNew(q, db, input, opts) {
  if (!input.title.trim())
    throw new ValidationError("A title is required.");
  if (input.type)
    checkType(input.type);
  if (input.priority)
    checkPriority(input.priority);
  if (input.parent && !await findIssue(q.mirror, input.parent)) {
    throw new ValidationError(`No issue ${formatId(db, input.parent)} in the local mirror.`);
  }
  if (input.milestone) {
    const rows = await q.mirror.query("SELECT name FROM milestones WHERE name = ?", [input.milestone]);
    if (db === "security" || rows.length === 0)
      throw new ValidationError(`No milestone "${input.milestone}".`);
  }
  const pid = await q.nextPid();
  q.outbox.append({ kind: "new", client_id: opts.clientId, pid, date: opts.date, issue: input });
  return { id: formatPid(db, pid), status: "queued" };
}
async function queueNote(q, db, ref, text, opts) {
  if (!text.trim())
    throw new ValidationError("The note is empty.");
  let target;
  if (ref.pid !== undefined) {
    const map = JSON.parse(await getSync(q.mirror, "pid_map") ?? "{}");
    const mapped = map[String(ref.pid)];
    const queued = q.outbox.read().some((e) => e.kind === "new" && e.pid === ref.pid);
    if (mapped !== undefined)
      target = { id: mapped };
    else if (queued)
      target = { pid: ref.pid };
    else
      throw new ValidationError(`No queued issue ${formatPid(db, ref.pid)}.`);
  } else {
    if (!await findIssue(q.mirror, ref.id)) {
      throw new ValidationError(`No issue ${formatId(db, ref.id)} in the local mirror.`);
    }
    target = { id: ref.id };
  }
  q.outbox.append({ kind: "note", client_id: opts.clientId, date: opts.date, target, text: text.trim() });
  return "id" in target ? formatId(db, target.id) : formatPid(db, target.pid);
}
function queuedIssues(db, outbox) {
  const entries = outbox.read();
  const notesFor = (pid) => entries.filter((e) => e.kind === "note" && ("pid" in e.target) && e.target.pid === pid).map((e) => ({ date: e.date, text: e.text }));
  return entries.filter((e) => e.kind === "new").map((e) => ({
    shownId: formatPid(db, e.pid),
    notes: notesFor(e.pid),
    issue: {
      id: 0,
      client_id: e.client_id,
      title: e.issue.title.trim(),
      type: e.issue.type || (db === "security" ? "security" : null),
      status: "queued",
      priority: e.issue.priority || null,
      milestone: e.issue.milestone || null,
      parent: e.issue.parent ?? null,
      github: null,
      resolution: null,
      created: e.date,
      updated: e.date,
      closed: null,
      body: e.issue.body ?? "",
      labels: e.issue.labels ?? []
    }
  }));
}
function matches(i, f) {
  return (!f.type || i.type === f.type) && (!f.milestone || i.milestone === f.milestone) && (!f.label || i.labels.includes(f.label)) && (f.parent === undefined || i.parent === f.parent) && (!f.query || [i.title, i.body].some((t) => t.toLowerCase().includes(f.query.toLowerCase())));
}
function queuedNotesOn(outbox, id) {
  return outbox.read().filter((e) => e.kind === "note" && ("id" in e.target) && e.target.id === id).map((e) => ({ date: e.date, text: e.text }));
}

// src/commands/remote.ts
var DBS = ["issues", "security"];
async function remoteEnable(b, o) {
  if (!o.issuesUrl || !o.tokenEnv) {
    throw new UsageError("remote enable needs --issues-url and --token-env.");
  }
  if (o.securityUrl && !o.securityTokenEnv) {
    throw new UsageError("--security-url needs its own --security-token-env.");
  }
  if (o.securityUrl && o.securityTokenEnv === o.tokenEnv) {
    throw new ValidationError("The security database needs its own token, in a different env var (D5).");
  }
  const config = structuredClone(b.config);
  let key = b.key;
  if (!key) {
    if (!o.slug)
      throw new ValidationError("This project has no origin remote. Pass --slug <name> to name it.");
    key = o.slug;
    config.dirs = { ...config.dirs, [b.loc.repoRoot ?? b.loc.dir]: o.slug };
  }
  if (config.projects?.[key]?.backend === "turso") {
    throw new ValidationError(`${key} already syncs to Turso. See remote status.`);
  }
  const targets = [["issues", { url: o.issuesUrl, tokenEnv: o.tokenEnv }]];
  if (o.securityUrl)
    targets.push(["security", { url: o.securityUrl, tokenEnv: o.securityTokenEnv }]);
  const lines = [];
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
        throw new ValidationError(`Both the local and the Turso ${t.db} database have rows. Run export --out <file> first, then empty one side.`);
      }
      plans.push({ ...t, local, ld, copy: isEmpty(rd) && !isEmpty(ld), empty: isEmpty(rd) && isEmpty(ld) });
    }
    for (const p of plans) {
      if (p.copy) {
        await p.remote.batch(loadStmts(p.ld));
        try {
          await p.remote.batch(seqStmts(p.ld));
        } catch {}
        lines.push(`${p.db}: copied ${p.ld.issues.length} issues and ${p.ld.milestones.length} milestones to Turso.`);
      } else if (p.empty) {
        lines.push(`${p.db}: both sides are empty; nothing to copy.`);
      } else {
        lines.push(`${p.db}: pulled from Turso.`);
      }
      await refreshMirror(p.remote, p.local);
    }
  } finally {
    for (const t of opened)
      await t.remote.close();
    for (const l of locals)
      await l.close();
  }
  config.projects = {
    ...config.projects,
    [key]: {
      backend: "turso",
      issues: targets[0][1],
      ...targets[1] ? { security: targets[1][1] } : {}
    }
  };
  writeConfig(config);
  if (!o.securityUrl)
    lines.push("security: stays local.");
  lines.push(`${key} now syncs to Turso. Config: ${configPath()}`);
  return lines;
}
async function remoteDisable(b) {
  const project = b.project();
  if (!b.key || project?.backend !== "turso")
    throw new ValidationError("This project is already local.");
  const lines = [];
  for (const db of DBS) {
    const cfg = b.remoteFor(db);
    if (!cfg)
      continue;
    const remote = b.openRemote(db, cfg);
    const mirror = await openLocal(b.loc, db);
    const outbox = b.outboxFor(db);
    try {
      await migrate(remote);
      lines.push(...await replay(remote, db, outbox, mirror));
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
  const config = structuredClone(b.config);
  config.projects[b.key].backend = "local";
  writeConfig(config);
  lines.push(`${b.key} is local now. The Turso databases are untouched; delete them with the turso CLI if no longer needed.`);
  return lines;
}
async function remoteStatus(b) {
  const project = b.project();
  const out = {
    project: b.key,
    backend: project?.backend ?? "local",
    dir: b.loc.dir
  };
  for (const db of DBS) {
    const cfg = b.remoteFor(db);
    const store = await openLocal(b.loc, db);
    try {
      out[db] = cfg ? { url: cfg.url, synced_at: await getSync(store, "synced_at"), queued: b.outboxFor(db).read().length } : { backend: "local" };
    } finally {
      await store.close();
    }
  }
  return out;
}

// src/exporter.ts
import { chmodSync as chmodSync2, writeFileSync as writeFileSync3 } from "fs";
import { dirname as dirname3, resolve as resolve2 } from "path";
var DBS2 = ["issues", "security"];
async function exportAll(b, out, warn) {
  const lines = [
    { record: "meta", schema: LATEST_VERSION, project: b.key, exported_at: new Date().toISOString() }
  ];
  const counts = {};
  for (const db of DBS2) {
    const d = await b.run(db, dump);
    const labels = new Map;
    for (const l of d.labels)
      labels.set(l.issue_id, [...labels.get(l.issue_id) ?? [], l.label]);
    for (const m of d.milestones)
      lines.push({ record: "milestone", db, ...m });
    for (const i of d.issues)
      lines.push({ record: "issue", db, ...i, labels: labels.get(i.id) ?? [] });
    for (const { id: _, issue_id, ...n } of d.notes)
      lines.push({ record: "note", db, issue: issue_id, ...n });
    for (const s of d.seq)
      lines.push({ record: "sequence", db, ...s });
    counts[db] = d.issues.length;
  }
  const path = resolve2(out);
  writeFileSync3(path, lines.map((l) => `${JSON.stringify(l)}
`).join(""), { mode: 384 });
  chmodSync2(path, 384);
  warn(`warning: ${path} holds every issue, security findings included. Keep it private.`);
  const top = git(["rev-parse", "--show-toplevel"], dirname3(path));
  if (top.ok && !git(["check-ignore", "-q", path], top.out).ok) {
    warn(`warning: ${path} is inside the git repo ${top.out} and not ignored; do not commit it.`);
  }
  return counts;
}
function parseExport(text) {
  const dumps = {
    issues: { milestones: [], issues: [], labels: [], notes: [], seq: [] },
    security: { milestones: [], issues: [], labels: [], notes: [], seq: [] }
  };
  let meta = false;
  text.split(`
`).forEach((line, n) => {
    if (!line.trim())
      return;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      throw new ValidationError(`Line ${n + 1} is not JSON.`);
    }
    const { record, db, ...rest } = rec;
    if (record === "meta") {
      meta = true;
      if (Number(rest.schema) > LATEST_VERSION) {
        throw new CliError(`The export has schema version ${rest.schema}; update the issue-tracker skill.`);
      }
      return;
    }
    const d = dumps[db];
    if (!d)
      throw new ValidationError(`Line ${n + 1}: unknown db "${db}".`);
    if (record === "milestone")
      d.milestones.push(rest);
    else if (record === "issue") {
      const { labels, ...row } = rest;
      d.issues.push(row);
      for (const label of labels ?? [])
        d.labels.push({ issue_id: row.id, label });
    } else if (record === "note") {
      const { issue, ...note } = rest;
      d.notes.push({ id: null, issue_id: issue, ...note });
    } else if (record === "sequence")
      d.seq.push(rest);
    else
      throw new ValidationError(`Line ${n + 1}: unknown record "${record}".`);
  });
  if (!meta)
    throw new ValidationError("Not an issue-tracker export: no meta record.");
  return dumps;
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
  return `- ${n.date}: ${n.text.replace(/\n/g, `
  `)}`;
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

// src/importer.ts
import { existsSync as existsSync4, readFileSync as readFileSync4, readdirSync, rmSync, rmdirSync, statSync as statSync2 } from "fs";
import { join as join4 } from "path";
var V1_FOLDERS = ["triage", "open", "in-progress", "blocked", "closed", "security"];
function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m)
    throw new ValidationError("no frontmatter");
  const fields = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv)
      continue;
    let value = kv[2].trim();
    if (/^\[.*\]$/.test(value)) {
      fields[kv[1]] = value.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
      continue;
    }
    value = value.replace(/^["'](.*)["']$/, "$1");
    fields[kv[1]] = value === "" || value === "~" || value === "null" ? null : value;
  }
  return { fields, body: text.slice(m[0].length) };
}
function findSection(lines, heading) {
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start < 0)
    return null;
  let end = start + 1;
  while (end < lines.length && !/^## /.test(lines[end]))
    end++;
  return { start, end };
}
function cut(lines, s) {
  const out = [...lines.slice(0, s.start), ...lines.slice(s.end)];
  return out.join(`
`).replace(/\n{3,}/g, `

`).split(`
`);
}
var NOTE_RE = /^- (\d{4}-\d{2}-\d{2}): (.*)$/;
function splitBody(body) {
  let lines = body.split(/\r?\n/);
  const sub = findSection(lines, "## Sub-issues");
  if (sub)
    lines = cut(lines, sub);
  const notes = [];
  const sec = findSection(lines, "## Notes");
  if (sec) {
    const items = lines.slice(sec.start + 1, sec.end);
    let clean = true;
    for (const line of items) {
      const m = NOTE_RE.exec(line);
      if (m)
        notes.push({ date: m[1], text: m[2].trim() });
      else if (/^\s{2,}\S/.test(line) && notes.length)
        notes[notes.length - 1].text += `
${line.trim()}`;
      else if (line.trim())
        clean = false;
    }
    if (clean && notes.length)
      lines = cut(lines, sec);
    else
      notes.length = 0;
  }
  return { body: `${lines.join(`
`).trim()}
`.replace(/^\n$/, ""), notes };
}
function parseMilestones(text) {
  const out = [];
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    const h = /^## (.+)$/.exec(line);
    if (h) {
      cur = { name: h[1].trim(), goal: null, due: null, state: "open", github: null };
      out.push(cur);
      continue;
    }
    const f = /^- \*\*(Goal|Due|State|GitHub):\*\*\s*(.*)$/.exec(line);
    if (!cur || !f)
      continue;
    const value = f[2].trim();
    const real = value && !/^<.*>$/.test(value) ? value : null;
    if (f[1] === "Goal")
      cur.goal = real;
    if (f[1] === "Due")
      cur.due = real;
    if (f[1] === "GitHub")
      cur.github = real;
    if (f[1] === "State")
      cur.state = value === "closed" ? "closed" : "open";
  }
  return out;
}
var str = (v) => typeof v === "string" ? v : null;
function readV1(path) {
  if (!existsSync4(path) || !statSync2(path).isDirectory()) {
    throw new UsageError(`No v1 issues folder at ${path}.`);
  }
  const tree = { path, issues: [], milestones: [], counts: {}, problems: [], warnings: [] };
  for (const folder of V1_FOLDERS) {
    const dir = join4(path, folder);
    if (!existsSync4(dir))
      continue;
    const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
    tree.counts[folder] = files.length;
    for (const file of files) {
      const rel = `${folder}/${file}`;
      try {
        const { fields, body } = parseFrontmatter(readFileSync4(join4(dir, file), "utf8"));
        const idText = str(fields.id) ?? /^(\d+)-/.exec(file)?.[1] ?? null;
        if (!idText || !/^\d+$/.test(idText))
          throw new ValidationError("no numeric id");
        const status = folder === "security" ? str(fields.status) ?? "triage" : folder;
        if (!STATUSES.includes(status))
          throw new ValidationError(`unknown status "${status}"`);
        const split = splitBody(body);
        const db = folder === "security" ? "security" : "issues";
        const today = str(fields.created) ?? "1970-01-01";
        const row = {
          id: Number(idText),
          client_id: null,
          title: str(fields.title),
          type: db === "security" ? "security" : str(fields.type),
          status,
          priority: str(fields.priority),
          milestone: str(fields.milestone),
          parent: str(fields.parent) ? Number(str(fields.parent)) : null,
          github: str(fields.github),
          resolution: str(fields.resolution),
          created: today,
          updated: str(fields.updated) ?? today,
          closed: str(fields.closed),
          body: split.body
        };
        if (!row.title)
          throw new ValidationError("no title");
        if (row.type === null && status !== "triage")
          throw new ValidationError(`no type while ${status}`);
        if (status === "closed" && !row.resolution)
          throw new ValidationError("closed without a resolution");
        if (status !== "closed" && row.resolution) {
          tree.warnings.push(`${rel}: resolution ${row.resolution} dropped, since it is ${status}`);
          row.resolution = null;
        }
        if (status === "closed" && !row.closed)
          row.closed = row.updated;
        if (status !== "closed")
          row.closed = null;
        for (const f of ["created", "updated", "closed"]) {
          if (row[f] !== null && !DATE_RE.test(String(row[f])))
            throw new ValidationError(`${f} is not YYYY-MM-DD`);
        }
        if (db === "security" && row.milestone) {
          split.notes.push({ date: String(row.updated), text: `v1 milestone: ${row.milestone}` });
          tree.warnings.push(`${rel}: security issues take no milestone; kept as a note`);
          row.milestone = null;
        }
        const labels = Array.isArray(fields.labels) ? fields.labels : [];
        tree.issues.push({ file: rel, folder, db, row, labels, notes: split.notes });
      } catch (err) {
        tree.problems.push(`${rel}: ${err.message}`);
      }
    }
  }
  const ms = join4(path, "MILESTONES.md");
  if (existsSync4(ms))
    tree.milestones = parseMilestones(readFileSync4(ms, "utf8"));
  const seen = new Map;
  for (const i of tree.issues) {
    const key = `${i.db}:${i.row.id}`;
    if (seen.has(key))
      tree.problems.push(`${i.file}: id ${i.row.id} also used by ${seen.get(key)}`);
    seen.set(key, i.file);
  }
  for (const i of tree.issues) {
    const p = i.row.parent;
    if (p !== null && !seen.has(`${i.db}:${p}`)) {
      i.notes.push({ date: String(i.row.updated), text: `v1 parent: ${formatId(i.db, p)}` });
      tree.warnings.push(`${i.file}: parent ${p} not found in the same database; kept as a note`);
      i.row.parent = null;
    }
    const m = i.row.milestone;
    if (m && !tree.milestones.some((x) => x.name === m)) {
      tree.milestones.push({ name: m, goal: null, due: null, state: "open", github: null });
      tree.warnings.push(`${i.file}: milestone ${m} is not in MILESTONES.md; created it`);
    }
  }
  return tree;
}
function toDumps(tree) {
  const make = (db) => {
    const issues = tree.issues.filter((i) => i.db === db);
    return {
      milestones: db === "issues" ? tree.milestones.map((m) => ({ ...m })) : [],
      issues: issues.map((i) => i.row),
      labels: issues.flatMap((i) => i.labels.map((label) => ({ issue_id: i.row.id, label }))),
      notes: issues.flatMap((i) => i.notes.map((n) => ({ id: null, client_id: null, issue_id: i.row.id, ...n }))),
      seq: []
    };
  };
  return { issues: make("issues"), security: make("security") };
}
async function conflicts(store, d) {
  const out = [];
  const ids = new Set((await store.query("SELECT id FROM issues")).map((r) => r.id));
  for (const i of d.issues)
    if (ids.has(i.id))
      out.push(`id ${i.id}`);
  const names = new Set((await store.query("SELECT name FROM milestones")).map((r) => r.name));
  for (const m of d.milestones)
    if (names.has(m.name))
      out.push(`milestone ${m.name}`);
  return out;
}
async function writeDumps(b, dumps) {
  for (const db of ["issues", "security"]) {
    const d = dumps[db];
    if (d.issues.length + d.milestones.length === 0)
      continue;
    await b.run(db, async (s) => {
      const clash = await conflicts(s, d);
      if (clash.length) {
        throw new ValidationError(`The ${db} database already has ${clash.slice(0, 5).join(", ")}${clash.length > 5 ? ", \u2026" : ""}. Import only into an empty project.`);
      }
      await s.batch([...loadStmts(d), ...seqStmts(d)]);
    }, { write: true });
  }
}
async function countRows(b, tree) {
  const rows = { issues: new Map, security: new Map };
  for (const db of ["issues", "security"]) {
    const found = await b.run(db, (s) => s.query("SELECT id, status FROM issues"));
    for (const r of found)
      rows[db].set(r.id, r.status);
  }
  return Object.entries(tree.counts).map(([folder, files]) => ({
    folder,
    files,
    rows: tree.issues.filter((i) => i.folder === folder && rows[i.db].get(i.row.id) === i.row.status).length
  }));
}
function deleteV1(tree) {
  for (const folder of V1_FOLDERS)
    rmSync(join4(tree.path, folder), { recursive: true, force: true });
  rmSync(join4(tree.path, "MILESTONES.md"), { force: true });
  try {
    rmdirSync(tree.path);
  } catch {}
}
function assertClean(tree) {
  if (tree.problems.length) {
    throw new CliError(`Fix these v1 files first; nothing was imported:
${tree.problems.map((p) => `  ${p}`).join(`
`)}`);
  }
}

// src/promote.ts
var LABELS = [
  { label: "bug", for: "type bug", color: null },
  { label: "enhancement", for: "type feature", color: null },
  { label: "documentation", for: "type docs", color: null },
  { label: "question", for: "type question", color: null },
  { label: "idea", for: "type idea", color: "C5DEF5" },
  { label: "feedback", for: "type feedback", color: "BFDADC" },
  { label: "task", for: "type task", color: "1D76DB" },
  { label: "chore", for: "type chore", color: "EDEDED" },
  { label: "refactor", for: "type refactor", color: "5319E7" },
  { label: "priority:high", for: "priority high", color: "B60205" },
  { label: "priority:medium", for: "priority medium", color: "D93F0B" },
  { label: "priority:low", for: "priority low", color: "FBCA04" },
  { label: "duplicate", for: "resolution duplicate", color: null },
  { label: "wontfix", for: "resolution wont-fix", color: null },
  { label: "invalid", for: "resolution invalid", color: null }
];
var PROJECT_STATUS = {
  triage: "Triage",
  open: "Open",
  "in-progress": "In progress",
  blocked: "Blocked",
  closed: "Done"
};
var labelFor = (what) => LABELS.find((l) => l.for === what);
var ADVISORY = "Security issues never become GitHub issues. Use a private security advisory: " + "repo Security tab \u2192 Advisories \u2192 New draft security advisory.";
async function promote(store, id) {
  const issue = await loadIssue(store, "issues", id);
  const shown = formatId("issues", id);
  if (issue.status === "closed") {
    throw new ValidationError(`${shown} is closed (${issue.resolution}${issue.github ? `, ${issue.github}` : ""}); there is nothing to promote.`);
  }
  const notes = await store.query("SELECT date, text FROM notes WHERE issue_id = ? ORDER BY id", [id]);
  let body = issue.body.trimEnd();
  if (notes.length) {
    const lines = notes.map((n) => `- ${n.date}: ${n.text.replace(/\n/g, `
  `)}`);
    body = `${body ? `${body}

` : ""}## Notes
${lines.join(`
`)}`;
  }
  const specs = [
    issue.type ? labelFor(`type ${issue.type}`) : undefined,
    issue.priority ? labelFor(`priority ${issue.priority}`) : undefined
  ].filter((s) => Boolean(s));
  const labels = [...new Set([...specs.map((s) => s.label), ...issue.labels])];
  const create = [
    ...specs.filter((s) => s.color).map((s) => ({ name: s.label, color: s.color })),
    ...issue.labels.filter((l) => !LABELS.some((s) => s.label === l)).map((name) => ({ name, color: null }))
  ];
  let milestoneGithub = null;
  if (issue.milestone) {
    const [m] = await store.query("SELECT github FROM milestones WHERE name = ?", [
      issue.milestone
    ]);
    milestoneGithub = m?.github ?? null;
  }
  const parent = issue.parent === null ? null : await findIssue(store, issue.parent);
  const children = await store.query("SELECT github FROM issues WHERE parent = ? AND github IS NOT NULL ORDER BY id", [id]);
  return {
    id: shown,
    title: issue.title,
    body: body ? `${body}
` : "",
    labels,
    milestone: issue.milestone,
    milestone_github: milestoneGithub,
    project_status: PROJECT_STATUS[issue.status],
    create_labels: create,
    parent_github: parent?.github ?? null,
    children_github: children.map((c) => c.github),
    then: `close ${shown} --resolution moved --github <issue-url>`
  };
}
function promotionText(p) {
  const out = [
    `Promote ${p.id} to GitHub (dry run; nothing was created).`,
    `Title: ${p.title}`,
    `Labels: ${p.labels.join(", ") || "none"}`,
    `Milestone: ${p.milestone ? `${p.milestone} (${p.milestone_github ?? "not on GitHub yet; create it first"})` : "none"}`,
    `Project Status: ${p.project_status}`
  ];
  if (p.create_labels.length) {
    out.push("Labels that may need creating:");
    for (const l of p.create_labels) {
      out.push(`  gh label create ${l.name}${l.color ? ` --color ${l.color}` : ""} --force`);
    }
  }
  if (p.parent_github)
    out.push(`Parent on GitHub: ${p.parent_github}`);
  if (p.children_github.length)
    out.push(`Children on GitHub: ${p.children_github.join(", ")}`);
  out.push("Body:", "-----", p.body.trimEnd(), "-----", `Then record the link: ${p.then}`);
  return out.join(`
`);
}

// src/cli.ts
var VERSION = "2.1.0";
var str2 = (v, k) => v[k];
var json = { json: { type: "boolean" } };
async function readBody(v) {
  const file = str2(v, "body-file");
  if (file !== undefined && str2(v, "body") !== undefined) {
    throw new UsageError("Pass --body or --body-file, not both.");
  }
  if (file === "-")
    return Bun.stdin.text();
  if (file !== undefined)
    return Bun.file(file).text();
  return str2(v, "body");
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
      const title = str2(v, "title");
      if (!title)
        throw new UsageError("new needs --title.");
      const parentText = str2(v, "parent");
      const db = str2(v, "type") === "security" || /^S/i.test(parentText ?? "") ? "security" : "issues";
      const parent = parentText ? parseLocalRef(db, parentText) : null;
      const input = {
        title,
        type: str2(v, "type"),
        priority: str2(v, "priority"),
        parent,
        labels: splitList(str2(v, "label")),
        milestone: str2(v, "milestone"),
        body: await readBody(v)
      };
      const opts = { clientId: crypto.randomUUID(), date: today() };
      const made = await ctx.backend().run(db, async (s) => {
        const r = await createIssue(s, db, input, opts);
        return { id: formatId(db, r.id), status: r.status };
      }, { write: true, queue: (q) => queueNew(q, db, input, opts) });
      print(ctx, v, made, () => made.status === "queued" ? `Queued ${made.id} (offline): ${title.trim()}. It gets a real id once Turso is reachable.` : `Created ${made.id} (${made.status}): ${title.trim()}`);
    }
  },
  list: {
    usage: [
      "list [--status <s,s>|all] [--type <type>] [--milestone <name>] [--label <label>]",
      "    [--parent <id>] [--query <text>] [--security] [--json]"
    ],
    options: {
      status: { type: "string" },
      type: { type: "string" },
      milestone: { type: "string" },
      label: { type: "string" },
      parent: { type: "string" },
      query: { type: "string" },
      security: { type: "boolean" },
      ...json
    },
    async run(ctx, v) {
      const parentText = str2(v, "parent");
      const db = v.security || str2(v, "type") === "security" || /^S/i.test(parentText ?? "") ? "security" : "issues";
      const statusText = str2(v, "status");
      const statuses = statusText === "all" ? [...STATUSES] : statusText ? splitList(statusText).map(checkStatus) : OPEN_STATUSES;
      const filters = {
        statuses,
        type: str2(v, "type"),
        milestone: str2(v, "milestone"),
        label: str2(v, "label"),
        parent: parentText ? parseLocalRef(db, parentText) : undefined,
        query: str2(v, "query")
      };
      const b = ctx.backend();
      const issues = await b.run(db, (s) => listIssues(s, filters));
      const queued = b.offline.has(db) ? queuedIssues(db, b.outboxFor(db)).filter((q) => matches(q.issue, filters)) : [];
      const lines = [
        ...issues.map((i) => issueLine(db, i)),
        ...queued.map((q) => issueLine(db, q.issue, q.shownId))
      ];
      print(ctx, v, [...issues.map((i) => issueJson(db, i)), ...queued.map((q) => issueJson(db, q.issue, q.shownId))], () => lines.length ? lines.join(`
`) : "No matching issues.");
    }
  },
  show: {
    usage: ["show <id> [--json]"],
    options: { ...json },
    async run(ctx, v, pos) {
      const ref = parseId(onePos(pos, "id"));
      const db = ref.db;
      const b = ctx.backend();
      const d = await b.run(db, async (s, rt) => {
        const detail = await showIssue(s, db, ref.id ?? await rt.pid(ref.pid));
        return { ...detail, shownId: undefined };
      }, {
        offlineRead: async (q) => {
          if (ref.id !== undefined) {
            const detail = await showIssue(q.mirror, db, ref.id);
            return { ...detail, notes: [...detail.notes, ...queuedNotesOn(q.outbox, ref.id)], shownId: undefined };
          }
          const hit = queuedIssues(db, q.outbox).find((x) => x.shownId === `${db === "security" ? "S" : ""}P${ref.pid}`);
          if (!hit)
            throw new UsageError(`No queued issue ${onePos(pos, "id")}.`);
          return { issue: hit.issue, notes: hit.notes, children: [], shownId: hit.shownId };
        }
      });
      print(ctx, v, {
        ...issueJson(db, d.issue, d.shownId),
        notes: d.notes.map(({ date, text }) => ({ date, text })),
        children: d.children.map((c) => ({ ...c, id: formatId(db, c.id) }))
      }, () => detailText(db, d, d.shownId));
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
      const changes = { title: str2(v, "title"), body: await readBody(v), set };
      await ctx.backend().run(db, (s) => editIssue(s, db, id, changes, today()), { write: true });
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
      const from = await ctx.backend().run(db, (s) => moveIssue(s, db, id, to, str2(v, "note"), today()), { write: true });
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
      const resolution = str2(v, "resolution");
      if (!resolution)
        throw new UsageError("close needs --resolution.");
      const dup = str2(v, "dup-of");
      const opts = {
        resolution,
        dupOf: dup ? parseLocalRef(db, dup) : undefined,
        github: str2(v, "github"),
        note: str2(v, "note"),
        keepChildren: Boolean(v["keep-children"])
      };
      await ctx.backend().run(db, (s) => closeIssue(s, db, id, opts, today()), { write: true });
      ctx.out(`Closed ${formatId(db, id)} (${resolution}).`);
    }
  },
  reopen: {
    usage: ["reopen <id> --note <why>"],
    options: { note: { type: "string" } },
    async run(ctx, v, pos) {
      const { db, id } = parseRealId(onePos(pos, "id"));
      const status = await ctx.backend().run(db, (s) => reopenIssue(s, db, id, str2(v, "note"), today()), { write: true });
      ctx.out(`Reopened ${formatId(db, id)} (${status}).`);
    }
  },
  note: {
    usage: ['note <id> "text"'],
    options: {},
    async run(ctx, _v, pos) {
      if (pos.length < 2)
        throw new UsageError('note needs <id> and "text".');
      const ref = parseId(pos[0]);
      const db = ref.db;
      const text = pos.slice(1).join(" ");
      const opts = { clientId: crypto.randomUUID(), date: today() };
      const shown = await ctx.backend().run(db, async (s, rt) => {
        const id = ref.id ?? await rt.pid(ref.pid);
        await addNote(s, db, id, text, opts);
        return formatId(db, id);
      }, { write: true, queue: async (q) => `${await queueNote(q, db, ref, text, opts)} (queued offline)` });
      ctx.out(`Noted on ${shown}.`);
    }
  },
  delete: {
    usage: ["delete <id>"],
    options: {},
    async run(ctx, _v, pos) {
      const { db, id } = parseRealId(onePos(pos, "id"));
      await ctx.backend().run(db, (s) => deleteIssue(s, db, id), { write: true });
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
      const fields = { goal: str2(v, "goal"), due: str2(v, "due"), github: str2(v, "github") };
      const b = ctx.backend();
      if (action === "list") {
        const all = await b.run("issues", listMilestones);
        print(ctx, v, all, () => all.length ? all.map(milestoneLine).join(`
`) : "No milestones.");
        return;
      }
      const name = onePos(rest, "milestone name");
      if (action === "add")
        await b.run("issues", (s) => addMilestone(s, name, fields), { write: true });
      else if (action === "edit")
        await b.run("issues", (s) => editMilestone(s, name, fields), { write: true });
      else if (action === "close")
        await b.run("issues", (s) => closeMilestone(s, name), { write: true });
      else
        throw new UsageError("milestone needs add, list, edit, or close.");
      ctx.out(`Milestone ${name}: ${action === "add" ? "added" : action === "edit" ? "updated" : "closed"}.`);
    }
  },
  promote: {
    usage: ["promote <id> --dry-run [--json]"],
    options: { "dry-run": { type: "boolean" }, ...json },
    async run(ctx, v, pos) {
      const { db, id } = parseRealId(onePos(pos, "id"));
      if (db === "security")
        throw new ValidationError(ADVISORY);
      if (!v["dry-run"]) {
        throw new UsageError("The CLI never runs gh. Pass --dry-run, show the result, ask, then run gh yourself.");
      }
      const p = await ctx.backend().run(db, (s) => promote(s, id));
      print(ctx, v, p, () => promotionText(p));
    }
  },
  flush: {
    usage: ["flush"],
    options: {},
    async run(ctx) {
      const b = ctx.backend();
      const dbs = ["issues", "security"].filter((db) => b.remoteFor(db));
      if (dbs.length === 0) {
        ctx.out("Nothing to flush: this project is local.");
        return;
      }
      for (const db of dbs) {
        try {
          await b.run(db, async () => {}, { write: true });
        } catch (err) {
          if (!(err instanceof Offline))
            throw err;
          const n = b.outboxFor(db).read().length;
          throw new Offline(`Turso is unreachable; ${n} ${db} entries stay queued in ${b.outboxFor(db).path}.`);
        }
      }
      ctx.out("Outbox empty; mirror refreshed.");
    }
  },
  remote: {
    usage: [
      "remote enable --issues-url <libsql://\u2026> --token-env <VAR>",
      "    [--security-url <libsql://\u2026> --security-token-env <VAR>] [--slug <name>]",
      "remote disable",
      "remote status [--json]"
    ],
    options: {
      "issues-url": { type: "string" },
      "token-env": { type: "string" },
      "security-url": { type: "string" },
      "security-token-env": { type: "string" },
      slug: { type: "string" },
      ...json
    },
    async run(ctx, v, pos) {
      const b = ctx.backend();
      const [action] = pos;
      if (action === "enable") {
        const lines = await remoteEnable(b, {
          issuesUrl: str2(v, "issues-url"),
          tokenEnv: str2(v, "token-env"),
          securityUrl: str2(v, "security-url"),
          securityTokenEnv: str2(v, "security-token-env"),
          slug: str2(v, "slug")
        });
        ctx.out(lines.join(`
`));
      } else if (action === "disable") {
        ctx.out((await remoteDisable(b)).join(`
`));
      } else if (action === "status") {
        const st = await remoteStatus(b);
        print(ctx, v, st, () => Object.entries(st).map(([k, val]) => `${k}: ${typeof val === "object" && val ? Object.entries(val).map(([a, x]) => `${a} ${x ?? "never"}`).join(", ") : val ?? "none"}`).join(`
`));
      } else {
        throw new UsageError("remote needs enable, disable, or status.");
      }
    }
  },
  export: {
    usage: ["export --out <file.jsonl>"],
    options: { out: { type: "string" } },
    async run(ctx, v) {
      const out = str2(v, "out");
      if (!out)
        throw new UsageError("export needs --out <file.jsonl>; there is no default location.");
      const counts = await exportAll(ctx.backend(), out, ctx.err);
      ctx.out(`Exported ${counts.issues} issues and ${counts.security} security issues to ${out}.`);
    }
  },
  import: {
    usage: ["import --from <file.jsonl>", "import --v1 [<path>] [--delete-old]"],
    options: { from: { type: "string" }, v1: { type: "boolean" }, "delete-old": { type: "boolean" } },
    async run(ctx, v, pos) {
      const b = ctx.backend();
      const from = str2(v, "from");
      if (from) {
        if (v.v1)
          throw new UsageError("Pass --from or --v1, not both.");
        const dumps = parseExport(readFileSync5(from, "utf8"));
        await writeDumps(b, dumps);
        ctx.out(`Imported ${dumps.issues.issues.length} issues and ${dumps.security.issues.length} security issues.`);
        return;
      }
      if (!v.v1)
        throw new UsageError("import needs --from <file.jsonl> or --v1.");
      const path = pos[0] ?? (ctx.dir ? b.loc.dir : join5(b.loc.dir, "issues"));
      const tree = readV1(path);
      assertClean(tree);
      if (!v["delete-old"]) {
        await writeDumps(b, toDumps(tree));
        for (const w of tree.warnings)
          ctx.err(`warning: ${w}`);
      }
      const counts = await countRows(b, tree);
      const lines = counts.map((c) => `${c.folder}/: ${c.files} files, ${c.rows} rows`);
      lines.push(`MILESTONES.md: ${tree.milestones.length} milestones`);
      if (counts.some((c) => c.files !== c.rows)) {
        throw new ValidationError(`Counts do not match; the v1 folder stays:
${lines.join(`
`)}`);
      }
      if (v["delete-old"]) {
        deleteV1(tree);
        ctx.out(`${lines.join(`
`)}
Counts match. Deleted the v1 files in ${path}.`);
        return;
      }
      const again = ["import", "--v1", ...pos[0] ? [pos[0]] : [], "--delete-old"].join(" ");
      ctx.out(`${lines.join(`
`)}
Counts match. The v1 folder is untouched. After the user agrees, delete it with: ${again}`);
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
    backend: () => backend ??= new Backend(resolveLocation({ cwd, dir }), (m) => ctx.err(m))
  };
  const code = await verb.run(ctx, parsed.values, parsed.positionals) ?? 0;
  for (const [db, since] of backend?.offline ?? []) {
    ctx.err(`offline; ${db} as of ${since}`);
  }
  return code;
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
