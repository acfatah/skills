import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Gh,
  type RawPage,
  type RawThread,
  FetchError,
  build,
  classifyAuthor,
  run,
  shapeSummaries,
  shapeThread,
  skipReason,
} from "../scripts/fetch-threads.ts";

const FIXTURES = join(import.meta.dir, "fixtures");
const fixture = (name: string): string => readFileSync(join(FIXTURES, name), "utf8");
const page = (name: string): RawPage => (JSON.parse(fixture(name)) as { data: RawPage }).data;

const VIEWER = "me";
const allThreads: RawThread[] = [
  ...page("page1.json").repository.pullRequest!.reviewThreads!.nodes,
  ...page("page2.json").repository.pullRequest!.reviewThreads!.nodes,
];
const thread = (id: string): RawThread => allThreads.find((t) => t.id === id)!;

/** A fake `gh` that serves the PR view, then the GraphQL pages in order. */
function fakeGh(): { gh: Gh; calls: string[][] } {
  const pages = [fixture("page1.json"), fixture("page2.json")];
  const calls: string[][] = [];
  const gh: Gh = (args) => {
    calls.push(args);
    if (args[0] === "pr") return fixture("pr.json");
    const next = pages.shift();
    if (!next) throw new Error("unexpected extra page request");
    return next;
  };
  return { gh, calls };
}

describe("classifyAuthor", () => {
  test("the viewer is you", () => {
    expect(classifyAuthor({ login: "me", __typename: "User" }, VIEWER)).toBe("you");
  });
  test("a Bot typename is a bot", () => {
    expect(classifyAuthor({ login: "copilot-pull-request-reviewer", __typename: "Bot" }, VIEWER)).toBe("bot");
  });
  test("a [bot] login is a bot", () => {
    expect(classifyAuthor({ login: "coderabbitai[bot]", __typename: "User" }, VIEWER)).toBe("bot");
  });
  test("anyone else is human, a deleted account too", () => {
    expect(classifyAuthor({ login: "alice", __typename: "User" }, VIEWER)).toBe("human");
    expect(classifyAuthor(null, VIEWER)).toBe("human");
  });
});

describe("skipReason", () => {
  test("resolved", () => expect(skipReason(thread("PRRT_resolved"), VIEWER)).toBe("resolved"));
  test("outdated", () => expect(skipReason(thread("PRRT_outdated"), VIEWER)).toBe("outdated"));
  test("last comment by the viewer", () => {
    expect(skipReason(thread("PRRT_answered"), VIEWER)).toBe("awaiting-reviewer");
  });
  test("a human replied after you: not skipped", () => {
    expect(skipReason(thread("PRRT_human"), VIEWER)).toBeNull();
  });
  test("your own single comment, such as /code-review: not skipped", () => {
    expect(skipReason(thread("PRRT_self"), VIEWER)).toBeNull();
  });
});

describe("shapeThread", () => {
  test("keeps diffHunk on the first comment only", () => {
    const t = shapeThread(thread("PRRT_human"), VIEWER);
    expect(t.comments[0].diffHunk).toContain("@@");
    expect(t.comments.slice(1).every((c) => !("diffHunk" in c))).toBe(true);
  });
  test("labels the thread by its first author", () => {
    const t = shapeThread(thread("PRRT_bot"), VIEWER);
    expect(t).toMatchObject({ login: "copilot-pull-request-reviewer", author: "bot", bot: true, skip: null });
    expect(t.comments[0].id).toBe(301);
  });
});

describe("shapeSummaries", () => {
  test("drops empty review bodies", () => {
    const s = shapeSummaries(page("page1.json").repository.pullRequest!.reviews!.nodes, VIEWER);
    expect(s.map((r) => r.id)).toEqual(["PRR_1"]);
    expect(s[0]).toMatchObject({ author: "human", state: "CHANGES_REQUESTED" });
  });
});

describe("build", () => {
  test("merges two pages and stops asking for finished connections", () => {
    const { gh, calls } = fakeGh();
    const out = build(gh);
    const graphql = calls.filter((c) => c[0] === "api");
    expect(graphql).toHaveLength(2);
    expect(graphql[1]).toContain("threadsAfter=T1");
    expect(graphql[1]).toContain("withReviews=false");
    expect(out.viewer).toBe("me");
    expect(out.pr.number).toBe(7);
    expect(out.threads.map((t) => t.id)).toEqual(["PRRT_human", "PRRT_bot", "PRRT_self"]);
    expect(out.skipped.resolved.map((t) => t.id)).toEqual(["PRRT_resolved"]);
    expect(out.skipped.outdated[0]).toMatchObject({ id: "PRRT_outdated", line: 9 });
    expect(out.skipped["awaiting-reviewer"].map((t) => t.id)).toEqual(["PRRT_answered"]);
    expect(out.summaries).toHaveLength(1);
  });
  test("passes a PR number to gh pr view", () => {
    const { gh, calls } = fakeGh();
    build(gh, "7");
    expect(calls[0].slice(0, 3)).toEqual(["pr", "view", "7"]);
  });
});

describe("run", () => {
  test("rejects a non-number argument", () => {
    expect(run(["abc"], fakeGh().gh).code).toBe(1);
  });
  test("no PR for the branch: one-line message, exit 1", () => {
    const gh: Gh = () => {
      throw new FetchError("no pull requests found for branch \"x\"");
    };
    const r = run([], gh);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe("fetch-threads: no PR for the current branch; pass a PR number\n");
  });
  test("prints one line of JSON", () => {
    const r = run([], fakeGh().gh);
    expect(r.code).toBe(0);
    expect(r.stdout.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(r.stdout).threads).toHaveLength(3);
  });
});
