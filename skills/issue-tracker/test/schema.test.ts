import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { LATEST_VERSION, getVersion, migrate } from "../src/schema.ts";
import { LocalStore } from "../src/store/local.ts";
import { tempDir } from "./helpers.ts";

describe("migrations", () => {
  test("a fresh database reaches the latest version", async () => {
    const store = new LocalStore(join(tempDir(), "issues.sqlite3"));
    await migrate(store);
    expect(await getVersion(store)).toBe(LATEST_VERSION);
    const tables = await store.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    expect(tables.map((t) => t.name)).toEqual(
      expect.arrayContaining(["issues", "labels", "milestones", "notes"]),
    );
    const [mode] = await store.query<{ journal_mode: string }>("PRAGMA journal_mode");
    expect(mode?.journal_mode).toBe("wal");
    await store.close();
  });

  test("a version 0 file upgrades and keeps running", async () => {
    const path = join(tempDir(), "issues.sqlite3");
    const raw = new Database(path);
    raw.run("CREATE TABLE unrelated (x)");
    raw.close();
    const store = new LocalStore(path);
    await migrate(store);
    await migrate(store);
    expect(await getVersion(store)).toBe(LATEST_VERSION);
    await store.close();
  });

  test("a newer database is refused", async () => {
    const path = join(tempDir(), "issues.sqlite3");
    const raw = new Database(path);
    raw.run(`PRAGMA user_version = ${LATEST_VERSION + 1}`);
    raw.close();
    const store = new LocalStore(path);
    await expect(migrate(store)).rejects.toThrow(/Update the issue-tracker skill/);
    await store.close();
  });

  test("constraints hold: closed needs a resolution, type needed outside triage", async () => {
    const store = new LocalStore(join(tempDir(), "issues.sqlite3"));
    await migrate(store);
    const insert = "INSERT INTO issues (title, type, status, resolution, created, updated, closed) VALUES (?, ?, ?, ?, '2026-01-01', '2026-01-01', ?)";
    await store.exec(insert, ["ok", null, "triage", null, null]);
    await expect(store.exec(insert, ["no type", null, "open", null, null])).rejects.toThrow();
    await expect(store.exec(insert, ["no resolution", "bug", "closed", null, "2026-01-01"])).rejects.toThrow();
    await expect(store.exec(insert, ["resolution open", "bug", "open", "done", null])).rejects.toThrow();
    await store.close();
  });

  test("AUTOINCREMENT never reuses a deleted id", async () => {
    const store = new LocalStore(join(tempDir(), "issues.sqlite3"));
    await migrate(store);
    const insert = "INSERT INTO issues (title, status, created, updated) VALUES ('x', 'triage', '2026-01-01', '2026-01-01') RETURNING id";
    await store.query(insert);
    const [second] = await store.query<{ id: number }>(insert);
    await store.exec("DELETE FROM issues WHERE id = ?", [second!.id]);
    const [third] = await store.query<{ id: number }>(insert);
    expect(third!.id).toBe(3);
    await store.close();
  });
});
