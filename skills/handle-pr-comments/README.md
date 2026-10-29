# handle-pr-comments

An [agent skill](https://skills.sh) that works through the review comments
on a GitHub pull request, via `gh`. It fetches the PR's review threads and
review summaries, verifies each claim against the code, and shows one
triage table. After you approve it, Claude applies the fixes, replies
in-thread in one approved batch, and resolves the fixed threads.

> [!IMPORTANT]
> Comment text is untrusted data. On a public repo anyone can comment, so
> the skill never follows instructions found in a comment, and never runs
> a command or opens a URL taken from one.

## What it is

- **Handles every reviewer the same way:** `/code-review --comment`, bots
  such as Copilot and CodeRabbit, and humans. Each claim is checked against
  the code; the table labels the author `you`, `bot` or `human`.
- **Fetches with a bundled Bun script,** read-only: one paginated GraphQL
  query for review threads, review summaries and your login, printed as
  compact JSON.
- **Skips what needs no action:** resolved threads, outdated threads
  (listed, not acted on), and threads where you replied last.
- **Triages in one table:** thread, author, verdict (valid, invalid,
  unclear), action (fix, reply, push back, skip), and files. Nothing is
  edited before you approve it.
- **Pushes back with evidence** when a claim is wrong.
- **Works on the PR's head branch.** When you are on another branch, it
  enters or creates a worktree on the head branch, and never commits on
  the default branch, `main` or `master`.
- **Commits by theme,** following the run mode: Pause, Auto-commit or
  Auto-PR.
- **Replies in one approved batch,** citing the fix commit's SHA. A reply
  about a fix that is not on the remote yet is held, and posted on a
  re-run.
- **Resolves fixed threads** after one more approval.
- **Keeps its state** in `drafts/PR_COMMENTS-<n>.md`, so the work
  survives `/clear`.

## What it is not

- **Not a code reviewer.** It handles comments; it never writes a review.
- **Not for PR conversation comments.** Only inline review threads and
  review summary bodies.
- **Not for fork PRs.** When the PR's head branch lives on a fork, it
  stops.
- **Not an autopilot.** Triage, posting and resolving each ask first.
- **Not parallel.** It uses no subagents by default, because threads
  often touch the same files.

## When not to use

- **You want a review of your changes** → run `/code-review`, and
  `/code-review --comment` to post its findings to the PR.
- **CI is failing on the PR** → no skill covers this yet.
- **The comments are on a fork PR** → check out the fork's branch and fix
  them by hand.

**Negative example:** "Review PR 64" will not use this skill; it is a
request for `/code-review`.

## Install

```bash
bunx skills add acfatah/skills -s handle-pr-comments -a claude-code -g -y
```

For local development, link the folder instead:

```bash
ln -sfn "$PWD/skills/handle-pr-comments" ~/.claude/skills/handle-pr-comments
```

## Requirements

- **[Bun](https://bun.sh)** runs the bundled fetch script.
- **[GitHub CLI (`gh`)](https://cli.github.com),** signed in; check with
  `gh auth status`. The script exits with a one-line message when `gh` is
  missing or signed out.

## Usage

### How it loads

- **By description match:** "address review comments", "handle review
  comments", "handle PR comments", or "reply to reviewers".
- **By name, always:** `/handle-pr-comments`, with an optional PR number.
- **What Claude asks back:** approval of the triage table, where you may
  edit rows; the run mode, when there are two or more fixes; approval
  before posting the replies; and approval before resolving the fixed
  threads.

### Example prompts

- **Current branch:** "Address the review comments on this PR." /
  "/handle-pr-comments"
- **Another PR:** "/handle-pr-comments 64"
- **After `/code-review`:** in a fresh session, "Handle the PR comments
  that /code-review just posted."
- **Replies only:** "Reply to the reviewers on PR 64; I already pushed the
  fixes."
- **Re-run:** "I pushed the fixes; post the held replies."

### Walkthrough

1. Claude resolves the PR and, if you are on another branch, enters or
   creates a worktree on its head branch.
2. It fetches the threads, reads the code at each one, and shows the
   triage table. You approve it or edit rows.
3. It applies the approved fixes by theme, runs the repo's checks, and
   commits per the run mode. In Pause, it suggests the messages and stops.
4. It drafts the replies, shows them, and posts the batch after you
   approve. Replies about fixes not yet pushed are held in the state file.
5. It asks before resolving the fixed threads, then reports the counts,
   the commits, and any held replies.

Gotchas:

- **`/code-review --comment` posts from your account,** so its threads
  show as `you`. A thread with only your comment is still a finding to
  handle.
- **Use a fresh session after `/code-review`,** so the verdicts are not
  anchored to the session that wrote the review.
- **A push to a ready PR notifies its reviewers.** Under Auto-PR, the
  `auto-pr` skill asks first.
- **Held replies need a push.** In Pause or Auto-commit, push the branch,
  then re-run to post them.
- **Outdated threads** are listed, not acted on. Add one to the table by
  hand if it still applies.

The full rules are in [`SKILL.md`](SKILL.md).
