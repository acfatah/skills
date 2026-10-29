#!/usr/bin/env bun
// fetch-threads: print a PR's review threads and review summaries as compact
// JSON, for the handle-pr-comments skill. Read-only: it never posts.
// Run with Bun directly; no build step and no dependencies.

export type AuthorClass = "you" | "bot" | "human";
export type SkipReason = "resolved" | "outdated" | "awaiting-reviewer";

// ---------------------------------------------------------------- raw types

export interface RawAuthor {
  login: string;
  __typename: string;
}

export interface RawComment {
  databaseId: number;
  author: RawAuthor | null; // null for a deleted account
  body: string;
  diffHunk: string;
  createdAt: string;
  url: string;
}

export interface RawThread {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  path: string;
  line: number | null;
  originalLine: number | null;
  comments: { pageInfo: { hasNextPage: boolean }; nodes: RawComment[] };
}

export interface RawReview {
  id: string;
  state: string;
  body: string;
  url: string;
  submittedAt: string | null;
  author: RawAuthor | null;
}

interface Page<T> {
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  nodes: T[];
}

export interface RawPage {
  viewer: { login: string };
  repository: {
    pullRequest: {
      reviewThreads?: Page<RawThread>;
      reviews?: Page<RawReview>;
    } | null;
  };
}

// ---------------------------------------------------------------- shaped types

export interface Comment {
  id: number; // REST id, for the replies endpoint
  login: string;
  author: AuthorClass;
  body: string;
  createdAt: string;
  url: string;
  diffHunk?: string; // first comment only
}

export interface Thread {
  id: string; // GraphQL node id, for resolveReviewThread
  path: string;
  line: number | null;
  originalLine: number | null;
  login: string; // who opened the thread
  author: AuthorClass;
  bot: boolean;
  skip: SkipReason | null;
  truncated: boolean; // more than 100 comments; only the first 100 are here
  comments: Comment[];
}

export interface SkippedThread {
  id: string;
  path: string;
  line: number | null;
  login: string;
  url: string;
}

export interface Summary {
  id: string;
  state: string;
  login: string;
  author: AuthorClass;
  bot: boolean;
  body: string;
  url: string;
  submittedAt: string | null;
}

export interface PrInfo {
  number: number;
  url: string;
  headRefName: string;
  baseRefName: string;
  isCrossRepository: boolean;
  state: string;
  isDraft: boolean;
}

export interface Output {
  pr: PrInfo;
  viewer: string;
  threads: Thread[];
  summaries: Summary[];
  skipped: Record<SkipReason, SkippedThread[]>;
}

// ---------------------------------------------------------------- pure shaping

const GHOST = "ghost"; // GitHub's name for a deleted account

export function isBot(author: RawAuthor | null): boolean {
  if (!author) return false;
  return author.__typename === "Bot" || author.login.endsWith("[bot]");
}

export function classifyAuthor(author: RawAuthor | null, viewer: string): AuthorClass {
  if (isBot(author)) return "bot";
  if (author && author.login === viewer) return "you";
  return "human";
}

/**
 * Why a thread needs no action, or null when it does. A thread whose only
 * comment is the viewer's is a self-review, such as `/code-review --comment`,
 * so it is not awaiting anyone.
 */
export function skipReason(thread: RawThread, viewer: string): SkipReason | null {
  if (thread.isResolved) return "resolved";
  if (thread.isOutdated) return "outdated";
  const comments = thread.comments.nodes;
  const last = comments[comments.length - 1];
  if (comments.length > 1 && last?.author?.login === viewer) return "awaiting-reviewer";
  return null;
}

export function shapeThread(thread: RawThread, viewer: string): Thread {
  const nodes = thread.comments.nodes;
  const first = nodes[0]?.author ?? null;
  return {
    id: thread.id,
    path: thread.path,
    line: thread.line,
    originalLine: thread.originalLine,
    login: first?.login ?? GHOST,
    author: classifyAuthor(first, viewer),
    bot: isBot(first),
    skip: skipReason(thread, viewer),
    truncated: thread.comments.pageInfo.hasNextPage,
    comments: nodes.map((c, i) => {
      const out: Comment = {
        id: c.databaseId,
        login: c.author?.login ?? GHOST,
        author: classifyAuthor(c.author, viewer),
        body: c.body,
        createdAt: c.createdAt,
        url: c.url,
      };
      if (i === 0) out.diffHunk = c.diffHunk;
      return out;
    }),
  };
}

export function shapeSummaries(reviews: RawReview[], viewer: string): Summary[] {
  return reviews
    .filter((r) => r.body.trim() !== "")
    .map((r) => ({
      id: r.id,
      state: r.state,
      login: r.author?.login ?? GHOST,
      author: classifyAuthor(r.author, viewer),
      bot: isBot(r.author),
      body: r.body,
      url: r.url,
      submittedAt: r.submittedAt,
    }));
}

/** Split shaped threads into the ones to act on and the skipped ones. */
export function partition(threads: Thread[]): Pick<Output, "threads" | "skipped"> {
  const skipped: Output["skipped"] = { resolved: [], outdated: [], "awaiting-reviewer": [] };
  const active: Thread[] = [];
  for (const t of threads) {
    if (t.skip === null) {
      active.push(t);
      continue;
    }
    skipped[t.skip].push({ id: t.id, path: t.path, line: t.line ?? t.originalLine, login: t.login, url: t.comments[0]?.url ?? "" });
  }
  return { threads: active, skipped };
}

// ---------------------------------------------------------------- fetching

export const QUERY = `
query($owner: String!, $name: String!, $number: Int!,
      $threadsAfter: String, $reviewsAfter: String,
      $withThreads: Boolean!, $withReviews: Boolean!) {
  viewer { login }
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $threadsAfter) @include(if: $withThreads) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id isResolved isOutdated path line originalLine
          comments(first: 100) {
            pageInfo { hasNextPage }
            nodes {
              databaseId body diffHunk createdAt url
              author { login __typename }
            }
          }
        }
      }
      reviews(first: 100, after: $reviewsAfter) @include(if: $withReviews) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id state body url submittedAt
          author { login __typename }
        }
      }
    }
  }
}`;

/** Runs `gh` with the given arguments; returns stdout or throws a one-line Error. */
export type Gh = (args: string[]) => string;

export class FetchError extends Error {}

export function realGh(args: string[]): string {
  if (!Bun.which("gh")) throw new FetchError("gh not found; install the GitHub CLI: https://cli.github.com");
  const r = Bun.spawnSync(["gh", ...args], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) {
    const stderr = r.stderr.toString().trim();
    if (/gh auth login/.test(stderr)) throw new FetchError("gh is not signed in; run gh auth login");
    throw new FetchError(stderr.split("\n")[0] || `gh ${args[0]} failed`);
  }
  return r.stdout.toString();
}

/** Fetch every page of threads and reviews, then merge them. */
export function fetchAll(gh: Gh, owner: string, name: string, number: number): { viewer: string; threads: RawThread[]; reviews: RawReview[] } {
  const threads: RawThread[] = [];
  const reviews: RawReview[] = [];
  let viewer = "";
  let threadsAfter: string | null = null;
  let reviewsAfter: string | null = null;
  let withThreads = true;
  let withReviews = true;
  while (withThreads || withReviews) {
    const args = [
      "api", "graphql",
      "-f", `query=${QUERY}`,
      "-f", `owner=${owner}`,
      "-f", `name=${name}`,
      "-F", `number=${number}`,
      "-F", `withThreads=${withThreads}`,
      "-F", `withReviews=${withReviews}`,
    ];
    if (threadsAfter) args.push("-f", `threadsAfter=${threadsAfter}`);
    if (reviewsAfter) args.push("-f", `reviewsAfter=${reviewsAfter}`);
    const page = (JSON.parse(gh(args)) as { data: RawPage }).data;
    viewer = page.viewer.login;
    const pr = page.repository.pullRequest;
    if (!pr) throw new FetchError(`no PR #${number} in ${owner}/${name}`);
    if (withThreads && pr.reviewThreads) {
      threads.push(...pr.reviewThreads.nodes);
      withThreads = pr.reviewThreads.pageInfo.hasNextPage;
      threadsAfter = pr.reviewThreads.pageInfo.endCursor;
    } else withThreads = false;
    if (withReviews && pr.reviews) {
      reviews.push(...pr.reviews.nodes);
      withReviews = pr.reviews.pageInfo.hasNextPage;
      reviewsAfter = pr.reviews.pageInfo.endCursor;
    } else withReviews = false;
  }
  return { viewer, threads, reviews };
}

const PR_FIELDS = "number,url,headRefName,baseRefName,isCrossRepository,state,isDraft";

export function resolvePr(gh: Gh, arg?: string): PrInfo {
  const args = ["pr", "view", "--json", PR_FIELDS];
  if (arg) args.splice(2, 0, arg);
  try {
    return JSON.parse(gh(args)) as PrInfo;
  } catch (e) {
    if (e instanceof FetchError && /no pull requests? found/i.test(e.message)) {
      throw new FetchError("no PR for the current branch; pass a PR number");
    }
    throw e;
  }
}

/** owner/name from a PR URL such as https://github.com/o/r/pull/7. */
export function repoFromUrl(url: string): { owner: string; name: string } {
  const m = /^https?:\/\/[^/]+\/([^/]+)\/([^/]+)\/pull\/\d+/.exec(url);
  if (!m) throw new FetchError(`cannot read the repo from PR URL: ${url}`);
  return { owner: m[1], name: m[2] };
}

export function build(gh: Gh, arg?: string): Output {
  const pr = resolvePr(gh, arg);
  const { owner, name } = repoFromUrl(pr.url);
  const raw = fetchAll(gh, owner, name, pr.number);
  const shaped = raw.threads.map((t) => shapeThread(t, raw.viewer));
  return { pr, viewer: raw.viewer, ...partition(shaped), summaries: shapeSummaries(raw.reviews, raw.viewer) };
}

// ---------------------------------------------------------------- CLI

const USAGE = "usage: bun fetch-threads.ts [<pr-number>]";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function run(argv: string[], gh: Gh = realGh): RunResult {
  if (argv[0] === "-h" || argv[0] === "--help") return { code: 0, stdout: `${USAGE}\n`, stderr: "" };
  if (argv.length > 1 || (argv[0] !== undefined && !/^\d+$/.test(argv[0]))) {
    return { code: 1, stdout: "", stderr: `${USAGE}\n` };
  }
  try {
    return { code: 0, stdout: `${JSON.stringify(build(gh, argv[0]))}\n`, stderr: "" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { code: 1, stdout: "", stderr: `fetch-threads: ${msg}\n` };
  }
}

if (import.meta.main) {
  const r = run(process.argv.slice(2));
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  process.exit(r.code);
}
