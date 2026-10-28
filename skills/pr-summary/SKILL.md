---
name: pr-summary
description: Write or update a PR summary draft, `drafts/PR_SUMMARY-<task>.md`: a PR title, a full description, and the attribution line. Load when the user asks to suggest a PR, write a PR summary or description, or when `auto-pr` writes its summary file. Not for pushing, or for opening or editing a PR on GitHub.
---

# PR Summary v1.0.0

Write a PR suggestion to a draft file the user reads and pastes, or that
`auto-pr` sends as the PR body. This skill only writes the file; it never
talks to GitHub.

## File

- **Path:** `drafts/PR_SUMMARY-<task>.md`.
- **`<task>`** is the plan topic (the name of its `.claude/plans/<topic>.md`
  link), the roadmap topic, or a snake_case topic you choose when there is
  no plan.
- **Update, never rename.** An existing file for the same task gets
  updated in place. Under `auto-pr`, use the name its run-mode line or chat
  statement recorded.
- **Ignore `drafts/` first.** In a git repo, unless
  `git check-ignore -q drafts/` succeeds, append `drafts/` to
  `git rev-parse --git-path info/exclude`, not the tracked `.gitignore`.
  If the repo already tracks a `drafts/` directory, ask before using it.
- **Never `git add` the file.** It stays untracked.

## Gather

1. **Base:** the repo's default branch, unless the user, the plan or the
   `auto-pr` record names another.
2. **Commits:** `git log --oneline <base>..HEAD`.
3. **Files:** `git diff --stat <base>...HEAD`.
4. **Links:** any plan, roadmap or issue ids the work refers to.

- **Uncommitted changes:** if `git status --short` shows any, say so in
  one line, and describe only what is committed unless the user says
  otherwise.
- **Read the commits,** not only their subjects, when a subject does not
  say why the change was made.

## Format

- **H1 is the PR title:** imperative, under about 72 characters.
- **Description** covers every commit of the branch, not just the last
  one:
  - what changed, and why;
  - notable decisions, and options weighed and dropped;
  - how it was verified;
  - follow-ups left for later.
- **Issue ids** as plain references, such as `Refs: 0058`. Name a security
  issue by its id only; never describe it.
- **Ends with the PR attribution line** the harness gives, unless the user
  or the repo says otherwise.
- **No hard wrapping.** One line per paragraph or bullet: GitHub renders a
  single newline as a line break.

## Overrides

These win over the default sections above:

- **A repo PR template:** `.github/pull_request_template.md`, its
  variants (`.github/PULL_REQUEST_TEMPLATE.md`, `docs/`, the repo root, or
  a `PULL_REQUEST_TEMPLATE/` directory). Fill its sections instead.
- **A rule from the user or the repo,** such as a title prefix or a
  required checklist.

## Never

- **Run `gh`, push, or commit.** Opening or updating a PR needs its own
  explicit request, or Auto-PR (see the `auto-pr` skill).

## Report

Reply with the file path and the PR title, on one line each.
