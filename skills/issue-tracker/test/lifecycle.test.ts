import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { closeIssue, createIssue, moveIssue, reopenIssue } from "../src/commands/issues.ts";
import type { Status } from "../src/model.ts";
import { migrate } from "../src/schema.ts";
import { LocalStore } from "../src/store/local.ts";
import { tempDir } from "./helpers.ts";

// Every (from, to) pair, and whether the lifecycle allows it.
const TABLE: [Status, Status, boolean][] = [];
const ALLOWED: Record<Status, Status[]> = {
  triage: ["open", "closed"],
  open: ["in-progress", "closed"],
  "in-progress": ["blocked", "closed", "open"],
  blocked: ["open", "in-progress"],
  closed: ["open"],
};
const ALL: Status[] = ["triage", "open", "in-progress", "blocked", "closed"];
for (const from of ALL) for (const to of ALL) if (from !== to) TABLE.push([from, to, ALLOWED[from].includes(to)]);

const DATE = "2026-10-20";

// Puts a fresh issue into `status` by direct SQL.
async function issueIn(store: LocalStore, status: Status): Promise<number> {
  const { id } = await createIssue(store, "issues", { title: status, type: "bug" }, { clientId: crypto.randomUUID(), date: DATE });
  const closed = status === "closed";
  await store.exec("UPDATE issues SET status = ?, resolution = ?, closed = ? WHERE id = ?", [
    status,
    closed ? "done" : null,
    closed ? DATE : null,
    id,
  ]);
  return id;
}

async function attempt(store: LocalStore, id: number, to: Status): Promise<void> {
  if (to === "closed") return closeIssue(store, "issues", id, { resolution: "done" }, DATE);
  const [row] = await store.query<{ status: Status }>("SELECT status FROM issues WHERE id = ?", [id]);
  if (row!.status === "closed") {
    if (to !== "open") throw new Error("reopen only goes to open");
    await reopenIssue(store, "issues", id, "why", DATE);
    return;
  }
  await moveIssue(store, "issues", id, to, "note", DATE);
}

describe("lifecycle", async () => {
  const store = new LocalStore(join(tempDir(), "issues.sqlite3"));
  await migrate(store);
  for (const [from, to, allowed] of TABLE) {
    test(`${from} → ${to}: ${allowed ? "allowed" : "refused"}`, async () => {
      const id = await issueIn(store, from);
      if (allowed) {
        await attempt(store, id, to);
        const [row] = await store.query<{ status: string; updated: string }>("SELECT status, updated FROM issues WHERE id = ?", [id]);
        expect(row!.status).toBe(to);
      } else {
        await expect(attempt(store, id, to)).rejects.toThrow();
      }
    });
  }

  test("blocked needs a note", async () => {
    const id = await issueIn(store, "in-progress");
    await expect(moveIssue(store, "issues", id, "blocked", undefined, DATE)).rejects.toThrow(/--note/);
  });

  test("an issue without a type cannot leave triage", async () => {
    const { id } = await createIssue(store, "issues", { title: "untyped" }, { clientId: crypto.randomUUID(), date: DATE });
    await expect(moveIssue(store, "issues", id, "open", undefined, DATE)).rejects.toThrow(/needs a type/);
  });
});
