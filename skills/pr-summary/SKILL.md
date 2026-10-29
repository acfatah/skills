---
name: pr-summary
description: Write or update a PR summary draft, `drafts/PR_SUMMARY-<task>.md`: a PR title, a comprehensive description for reviewers, and the attribution line. Load when the user asks to suggest a PR, write a PR summary or description, or when `auto-pr` writes its summary file. Not for pushing, or for opening or editing a PR on GitHub.
---

# PR Summary v1.2.1

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

## Reader

- **A reviewer with no session context,** not the user. They see only the
  PR, so the summary must stand on its own.
- **The chat response style does not apply:** no brevity rules, no 1–3
  sentence paragraphs, no cutting recaps.
- **Complete over brief.** Keep the context and recaps a reviewer needs;
  full paragraphs are fine. Headings stay for navigation.

## Format

- **H1 is the PR title:** imperative, under about 72 characters. Follow
  the `commit-messages` skill: free-form unless the user or the repo says
  it squash-merges, and then a Conventional Commits subject.
- **Description** covers every commit of the branch, not just the last
  one:
  - context and motivation;
  - behavior before and after, quoting replaced rules or APIs when
    short;
  - what changed, per area;
  - notable decisions, and options weighed and dropped;
  - risks and rollout notes;
  - review focus: what to check closely;
  - how it was verified;
  - follow-ups left for later.

  Give each its own heading where it has content; drop empty ones.
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

- **Run `gh`, push, or commit.** Opening or updating a PR goes through
  the `auto-pr` skill: its run mode, or its "Opening a PR on request"
  section.

## Report

Reply with the file path and the PR title, on one line each.
