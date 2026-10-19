# post-merge-cleanup

An [agent skill](https://skills.sh) that cleans up after a merged PR. It
removes the PR's worktree, then its local branch, then its remote branch,
for one branch per run. It checks first that nothing can be lost, shows one
summary, and asks once.

## What it is

- **Resolves one branch** from a branch name, a PR number, a worktree path,
  or nothing (the current worktree's branch).
- **Checks before asking:** the PR is merged, the local tip equals the
  merged PR head, the worktree is clean, it is not the default branch or
  the main worktree, and no symlinks point into the worktree. Any failure
  stops the run.
- **Works after squash and rebase merges.** It compares the tip with the
  merged PR head instead of relying on `git branch -d`.
- **Shows one summary** (PR, worktree, local and remote branch, ignored
  files that will be deleted, warnings) and asks once.
- **Runs in order:** `git worktree remove`, `git branch -D`,
  `git push origin --delete`, `git fetch --prune origin`. Parts that are
  already gone are reported and skipped.
- **Reports how to undo** each part, with the real SHA.

## What it is not

- **Not a sweep.** It never cleans up all merged branches; one run, one
  branch.
- **Not a force tool.** It never uses `--force`, and never `rm -rf`s a
  worktree that `git worktree remove` refuses.
- **Not a standing approval.** Your "Clean up" covers one run; the next run
  asks again, even for the same branch.
- **Not for code cleanup.** Tidying code, files or imports is a different
  request.

## When not to use

- **The PR is not merged yet,** or there is no PR → not covered; the skill
  stops at its first check.
- **The branch has commits after the merge** → not covered; the skill
  stops and shows both SHAs.
- **You want every merged branch gone at once** → not covered; run it once
  per branch.
- **`gh` is missing or not logged in** → the skill stops, because it cannot
  check the merge.

**Negative example:** "Clean up this function" does not load it; "cleanup"
and "housekeeping" load it only next to PR, branch, merged, or worktree
context.

## Install

```bash
bunx skills add acfatah/skills -s post-merge-cleanup -a claude-code -g -y
```

For local development, link the folder instead:

```bash
ln -sfn "$PWD/skills/post-merge-cleanup" ~/.claude/skills/post-merge-cleanup
```

## Usage

### How it loads

- **By description match.** "PR merged", "clean up the branch", "remove
  the worktree", "delete the merged branch".
- **"cleanup" and "housekeeping" only in context.** Next to PR, branch,
  merged, or worktree they load it; alone they do not.
- **By name, always.** `/post-merge-cleanup …` or "use the
  post-merge-cleanup skill".
- **What Claude asks back:** one summary with **Clean up** or **Cancel**.
  For a detached worktree, it asks which branch is meant.

### Example prompts

- **Current worktree:** "PR merged, clean up." Run from inside the
  worktree; Claude warns that the session's directory will disappear.
- **By branch:** "Delete the merged branch `feat/login-form`."
- **By PR number:** "/post-merge-cleanup 42"
- **By worktree path:** "Remove the worktree at
  `~/code/app-login-form`, the PR is merged."
- **Housekeeping:** "Housekeeping for the merged `fix/typo` branch."

Gotchas:

- **Ignored files are deleted.** `git worktree remove` deletes ignored
  files such as `drafts/`, `.env` or `.claude/plans/` without a word. The
  summary lists them before you confirm.
- **Symlinks into the worktree stop the run.** A link in `~/.claude` or
  the main checkout that points into the worktree (for example a skill
  linked for testing) must be repointed or removed first.
- **The session directory can vanish.** Run from inside the worktree, and
  the session's working directory is gone afterwards.
- **A branch checked out in the main checkout** is switched to the default
  branch first, and that checkout must be clean.
- **Undo restores branches, not ignored files.** The report gives
  `git branch <b> <sha>` and `git push origin <sha>:refs/heads/<b>`, but
  deleted ignored files do not come back.

The full rules are in [`SKILL.md`](SKILL.md).
