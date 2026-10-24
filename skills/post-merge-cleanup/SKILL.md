---
name: post-merge-cleanup
description: "Clean up after a merged PR: remove its worktree, then its local branch, then its remote branch, after safety checks and one confirmation. Load when the user says \"PR merged\", \"clean up the branch\", \"remove the worktree\", \"delete the merged branch\", or /post-merge-cleanup. \"cleanup\" and \"housekeeping\" load it only next to PR, branch, merged, or worktree context, never alone. Not for code cleanup."
---

# Post-merge Cleanup v1.1.0

After a PR merges, the same three things are left behind: its worktree, its
local branch, and its remote branch. This skill removes them, in that order,
for **one branch per run**. It checks first that nothing can be lost, shows
one summary, asks once, then runs every step.

It never sweeps all merged branches. One run, one branch.

## Resolve the target

The input is one of:

- **a branch name;**
- **a PR number:** take its `headRefName` from
  `gh pr view <n> --json headRefName`;
- **a worktree path:** take the branch from its `branch refs/heads/<b>` line
  in `git worktree list --porcelain`;
- **nothing:** the branch of the current worktree
  (`git branch --show-current`).

A worktree made with the built-in `EnterWorktree name=<n>` has the branch
`worktree-<n>`, with any `/` in `<n>` turned into `+`. That name is
expected; resolve it like any other.

Then gather, for that branch `<b>`:

- **Worktrees:** `git worktree list --porcelain`. The entry whose `branch`
  line is `refs/heads/<b>` is the branch's worktree `<wt>`, if any.
- **Main checkout:** the first entry in that list, `<main>`.
- **Default branch:**
  `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`.
- **Local branch tip:** `git rev-parse --verify -q refs/heads/<b>`. Empty
  means the local branch is already gone.
- **Remote branch:** `git ls-remote --heads origin <b>`. Empty means it is
  already gone.

A detached worktree has no branch line. If the input resolves to one, stop
and ask which branch is meant.

If the worktree, the local branch, and the remote branch are all gone, say
so and stop: there is nothing to clean up.

## Safety checks

Run every check before asking anything. Any failure stops the run; report
which check failed and why. Do not offer a way around it.

- **PR merged.**

      gh pr list --head <b> --state merged --json number,url,mergedAt,headRefOid

  Stop if the list is empty, or if `gh` is missing or not logged in. Never
  fall back to `git branch --merged`: it misses squash and rebase merges.
  If more than one PR merged from `<b>`, use the newest `mergedAt`.
- **Nothing unpushed.** The local branch tip must equal the PR's
  `headRefOid`. If the local branch is gone, check the remote branch tip
  from `ls-remote` instead. A different SHA means commits landed after the
  merge; stop and show both SHAs. This replaces `git branch -d`, which
  refuses after a squash or rebase merge.
- **Worktree clean.** `git -C <wt> status --porcelain` must be empty. Then
  list the ignored files with
  `git -C <wt> status --porcelain --ignored`, such as `drafts/`, `.env` or
  `.claude/plans/`. `git worktree remove` deletes them without a word, so
  they go in the summary.
- **Never the default branch, never the main worktree.** Stop if `<b>` is
  the default branch, or if `<wt>` is `<main>`.
- **Incoming symlinks.** Find symlinks that resolve into `<wt>`:

      find ~/.claude <main> -path ~/.claude/projects -prune -o -type l -print 2>/dev/null |
        while read -r l; do
          case "$(readlink -f "$l")" in "<wt>"|"<wt>"/*) echo "$l";; esac
        done

  Skip links inside `<wt>` itself. Stop and list every link you find; the
  user repoints or removes them, then runs the skill again. Removing the
  worktree would leave them dangling.
- **Session inside the worktree.** If the session's working directory is
  inside `<wt>`, the session leaves it first (see Execute), and every
  command runs as `git -C <main> …`. Say so in the summary.
- **Branch checked out in the main checkout.** When `<b>` is checked out in
  `<main>` rather than in its own worktree, there is no worktree to remove.
  Instead, the summary adds a first step that switches `<main>` to the
  default branch. `git -C <main> status --porcelain` must be empty for
  that; if not, stop.

## Summary and one confirmation

Ask with AskUserQuestion, one question, options **Clean up** and
**Cancel**. The question shows:

- **PR:** number, link, and when it merged;
- **Worktree:** the path, or "none";
- **Local branch:** `<b>` and its tip SHA, or "already gone";
- **Remote branch:** `origin/<b>`, or "already gone";
- **Ignored files** that will be deleted with the worktree, or "none";
- **Warnings:** that the session leaves `<wt>` first, or the switch of
  `<main>` to the default branch.

One "Clean up" runs every step below. The approval covers this run only:
never remember it, and ask again on the next run, even for the same branch.

## Execute

**Leave the worktree first.** Only when the session is inside `<wt>`,
call `ExitWorktree` with `action: "keep"` before any step. It returns the
session to its launch directory, for worktrees entered with `name=` and
`path=` alike, so the session does not sit in a deleted directory.

- **Never `action: "remove"`.** It deletes the branch without the
  merged-tip check above.
- **No active worktree session** (the session was launched inside
  `<wt>`): continue with `git -C <main> …`, and say in the report that
  the session's directory is gone, so the user should restart it from
  `<main>`.

Then run in this order, each as `git -C <main> …`. If a step fails, stop
there and report what was done and what was not.

0. **Only when `<b>` is checked out in `<main>`:**
   `git -C <main> switch <default>`.
1. **Remove the worktree:** `git worktree remove <wt>`. Never add
   `--force`. If the directory is already gone, run `git worktree prune`
   instead. If `git worktree remove` refuses, stop and show its message.
2. **Delete the local branch:** `git branch -D <b>`. `-D` is safe here:
   the tip was checked against the merged PR head. Skip it if the local
   branch is already gone.
3. **Delete the remote branch:** `git push origin --delete <b>`. If
   `ls-remote` showed it already gone, skip the push, say so and continue.
   The push exits non-zero with `remote ref does not exist` when someone
   deleted it since; treat that as already gone, not as a failure.
4. **Prune remote-tracking refs:** `git fetch --prune origin`.

## Report

List what was removed and what was already gone, then how to undo each
part, with the real SHA:

- **Local branch:** `git branch <b> <sha>`
- **Remote branch:** `git push origin <sha>:refs/heads/<b>`
- **Worktree:** `git worktree add <wt> <b>`, after restoring the local
  branch. The ignored files listed in the summary do not come back.

## Never

- **`--force`** on any command, including `git worktree remove`.
- **`rm -rf`** the worktree directory when `git worktree remove` refuses.
- **Touch other branches,** or sweep all merged branches in one run.
- **Run any step before the confirmation,** or skip a failed check.
- **Remember the confirmation** for a later run.
