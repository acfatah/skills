import { CliError } from "./errors.ts";
import type { Stmt, Store } from "./store/types.ts";

export const TYPES = [
  "bug",
  "feature",
  "idea",
  "feedback",
  "task",
  "chore",
  "docs",
  "refactor",
  "question",
  "security",
] as const;
export const STATUSES = ["triage", "open", "in-progress", "blocked", "closed"] as const;
export const PRIORITIES = ["low", "medium", "high"] as const;
export const RESOLUTIONS = ["done", "duplicate", "wont-fix", "invalid", "moved"] as const;

const list = (values: readonly string[]) => values.map((v) => `'${v}'`).join(",");

// Migration N brings a database from version N-1 to N. Never edit a
// migration that has shipped; append a new one.
export const MIGRATIONS: string[][] = [
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
    "CREATE INDEX notes_issue ON notes(issue_id)",
  ],
];

export const LATEST_VERSION = MIGRATIONS.length;

// Local files keep the version in PRAGMA user_version; Turso keeps it in a
// meta table (D8).
export async function getVersion(store: Store): Promise<number> {
  if (store.kind === "local") {
    const [row] = await store.query<{ user_version: number }>("PRAGMA user_version");
    return row?.user_version ?? 0;
  }
  try {
    const [row] = await store.query<{ value: string }>(
      "SELECT value FROM meta WHERE key = 'schema_version'",
    );
    return row ? Number(row.value) : 0;
  } catch (err) {
    if (/no such table/i.test(String(err))) return 0;
    throw err;
  }
}

function setVersion(store: Store, version: number): Stmt[] {
  if (store.kind === "local") return [{ sql: `PRAGMA user_version = ${version}` }];
  return [
    { sql: "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)" },
    {
      sql: "INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      args: [String(version)],
    },
  ];
}

// Brings the database to LATEST_VERSION, one transaction per migration.
export async function migrate(store: Store): Promise<void> {
  let version = await getVersion(store);
  if (version > LATEST_VERSION) {
    throw new CliError(
      `This database has schema version ${version}, but this CLI only knows ` +
        `up to ${LATEST_VERSION}. Update the issue-tracker skill.`,
    );
  }
  while (version < LATEST_VERSION) {
    const next = version + 1;
    const stmts = MIGRATIONS[version]!.map((sql) => ({ sql }));
    try {
      await store.batch([...stmts, ...setVersion(store, next)]);
    } catch (err) {
      // Another process may have run the same migration first.
      if ((await getVersion(store)) < next) throw err;
    }
    version = await getVersion(store);
  }
}
