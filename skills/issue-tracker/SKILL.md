---
name: issue-tracker
description: Issue tracking in local .claude/issues/ files, with GitHub as a second step. Load when logging or capturing an issue (bug, idea, feedback, task), triaging issues, starting, blocking, closing, or reopening one, managing sub-issues or milestones, recording a security finding, or promoting an issue to GitHub Issues or a GitHub Project.
---

# Issue Tracker v1.0.0

Track issues while you work: every issue starts as a local file, and moves
to GitHub only when it must be shared. Capture fast, triage later, and keep
the user in control: you propose, the user decides.

## Vocabulary

| Term      | Meaning                                                          |
|-----------|------------------------------------------------------------------|
| Issue     | One problem, idea, or piece of work. An issue as soon as noticed. |
| Ticket    | The record of an issue in a tracker. Say "issue" instead.        |
| Sub-issue | An issue that is part of a larger parent issue.                  |
| Milestone | A goal or release that a set of issues must reach.               |
| Triage    | Reviewing new issues and deciding their type, priority, next step. |
| Project   | A GitHub tracking space that holds issues from many repos and adds fields like Status. Viewed as a board, table, or roadmap. |
| Board     | A kanban view of a Project, with one column per Status. A view only; it holds no data of its own. |
| Checklist | `- [ ]` items in an issue body, used for acceptance criteria and small steps. Plain text, not linked issues. |
| Priority  | How urgent an issue is: `low`, `medium`, or `high`.              |

## Location

Issues live in `.claude/issues/` under the **issues root**. Find the root
once per session, and use its absolute path for every read, write, move,
and search:

```bash
if [ "$(git rev-parse --absolute-git-dir)" != "$(git rev-parse --path-format=absolute --git-common-dir)" ]; then
  git worktree list --porcelain | sed -n '1s/^worktree //p'
else
  git rev-parse --show-toplevel
fi
```

- **Normal checkout or submodule:** the root is its top folder.
- **Linked worktree** (`EnterWorktree`, or a subagent run with
  `isolation: "worktree"`): the root is the main checkout. Never create
  `.claude/issues/` inside the worktree. Ignored files are not checked out
  there, and the harness can delete an unchanged-looking worktree, issues
  and all. Writing outside the worktree may show a permission prompt;
  that is expected.
- **Tracked issues in a worktree:** if the project tracks its issues, tell
  the user the issue goes to the main checkout, not this branch.
- **Bare repo:** if the first entry of `git worktree list --porcelain` is
  followed by a `bare` line, there is no main checkout. Ask the user where
  to put the issues.
- **Outside a git repo,** ask the user where to put them before creating
  anything.

```
.claude/issues/
├── MILESTONES.md
├── triage/        # captured, not yet reviewed
├── open/          # accepted, waiting for work
├── in-progress/   # being worked on
├── blocked/       # waiting on something else
├── closed/        # finished, dropped, or moved to GitHub
└── security/      # private; see "Security issues"
```

- **The folder is the status.** Move a file between folders to change its
  status. Only files in `security/` carry a `status` field.
- Create each folder when its first issue needs it.

### Gitignore

- **Ignore by default.** On first use, run
  `git -C <root> check-ignore -q .claude/issues/`. If it fails, append
  `.claude/issues/` to `git rev-parse --git-path info/exclude`, leaving the
  tracked `.gitignore` untouched. Issues hold paths, error output, and rough
  notes that must not leak into a public repo.
- **Tracking is opt-in per project**, on the user's request: remove that
  exclude rule and exclude only `.claude/issues/security/` instead.
- **`security/` stays ignored** in every project.

## Issue files

### Naming

`NNNN-short-slug.md`, e.g. `0007-login-fails-on-empty-password.md`.

- `NNNN` is a zero-padded counter. **Next number** = the highest number in
  any folder, including `closed/` and `security/`, plus 1. Numbers are never
  reused.
- The slug is 2–5 lowercase words from the title, joined with hyphens.

### Frontmatter

```yaml
---
id: 0007
title: Login fails on empty password
type: bug
priority: medium
labels: []
milestone:
parent:
created: 2026-10-09
updated: 2026-10-09
github:
resolution:
closed:
---
```

| Field        | Required | Values                                                   |
|--------------|----------|----------------------------------------------------------|
| `id`         | yes      | Same number as the file name.                            |
| `title`      | yes      | Short, specific, no trailing period.                     |
| `type`       | yes      | See [Types](#types). May stay empty in `triage/`.        |
| `priority`   | no       | `low`, `medium`, `high`. Set during triage.              |
| `labels`     | no       | Free-form list, e.g. `[auth, ui]`.                       |
| `milestone`  | no       | A milestone name from `MILESTONES.md`.                   |
| `parent`     | no       | `id` of the parent issue, for sub-issues.                |
| `created`    | yes      | `YYYY-MM-DD`, set once.                                  |
| `updated`    | yes      | `YYYY-MM-DD`, set on every change, including moves.      |
| `github`     | no       | Issue URL, once promoted to GitHub.                      |
| `resolution` | closed   | `done`, `duplicate`, `wont-fix`, `invalid`, `moved`.     |
| `closed`     | closed   | `YYYY-MM-DD` the issue was closed.                       |

Keep every field in every file; leave unused ones empty, so all files share
one shape. Get dates from `date +%F`.

### Types

| Type       | Use for                                                         |
|------------|-----------------------------------------------------------------|
| `bug`      | Something behaves wrongly.                                      |
| `feature`  | A new capability or enhancement.                                |
| `idea`     | An unvalidated thought; may become a feature later.             |
| `feedback` | Feedback received from a user or reviewer.                      |
| `task`     | Planned work that is not a problem.                             |
| `chore`    | Maintenance: dependencies, tooling, cleanup.                    |
| `docs`     | Documentation that is missing, wrong, or unclear.               |
| `refactor` | Code that works but should be restructured, with no behavior change. |
| `question` | Something unclear that needs an answer before work can start.   |
| `security` | A possible vulnerability. Always stored in `security/`.         |

### Body

Use the sections that apply and drop the rest. Bugs usually need the first
five.

```markdown
## Summary
<One or two sentences: what this issue is about.>

## What happens
<Actual behavior.>

## Expected
<Correct behavior.>

## Where
<file:line, URL, or component.>

## How to reproduce
1. <Step>
2. <Step>

## Suggested fix
<Optional. Proposed approach.>

## Steps
- [ ] <Small step that doesn't need its own issue.>

## Acceptance criteria
- [ ] <How we know it is done.>

## Notes
- 2026-10-09: <Dated note added while working on it.>
```

## Sub-issues

A sub-issue is its own issue file, linked to its parent. A checklist item is
only text in a body. Keep the two apart.

- **`parent` is the source of truth.** A child sets `parent: <id>` in its
  frontmatter; that field alone decides its parent.
- **The parent mirrors its children** in a `## Sub-issues` section, so
  reading the parent shows them:

  ```markdown
  ## Sub-issues
  - [ ] 0008 Validate password field
  - [x] 0009 Show error message
  ```

- **The mirror lists only issue files**, one id and title per line. Ticked
  means the child is closed.
- **On conflict, the `parent` fields win.** Rebuild the mirror from the
  issues whose `parent` matches.
- **Update the mirror** in the same step that creates, closes, reopens,
  re-parents, or retitles a child. A mirror edit is a change to the parent,
  so it updates the parent's `updated`.
- **Placement:** the section sits after `## Steps`, and exists only while
  the parent has children.
- **A new child of an accepted parent starts in `open/`**, with the
  parent's `milestone` and `priority`. Propose its `type`.
- **Small steps go in `## Steps`**, as plain checklist items with no file of
  their own.
- **The mirror stays local.** Promotion strips it; see
  [`references/github.md`](references/github.md).

## Lifecycle

| Status        | Meaning                                    | Moves to                    |
|---------------|--------------------------------------------|-----------------------------|
| `triage`      | Captured, not reviewed.                    | `open`, `closed`            |
| `open`        | Accepted, waiting for work.                | `in-progress`, `closed`     |
| `in-progress` | Being worked on.                           | `blocked`, `closed`, `open` |
| `blocked`     | Waiting on something; say what in Notes.   | `open`, `in-progress`       |
| `closed`      | Finished or dropped. Has a `resolution`.   | `open` (reopen)             |

Every change to an issue, including a move, updates `updated`.

### Capture

When you notice an issue **unrelated to the current task**:

1. **Mention it in one line**, e.g. "Possible issue: X in `src/a.ts:42`.
   Log it?"
2. **Log it only if the user agrees.** Create the file in `triage/` with
   what you know right now: exact path and line, error text, how you found
   it. A later session won't have that context.
3. **Return to the current task.** Fix the side issue only when asked.

When the user asks you to log an issue, of any type, log it in `triage/`
directly. Fill `type` and `priority` when the user states them, and leave
them empty otherwise.

### Triage

Triage runs **on request only**, e.g. "triage issues". For each file in
`triage/`, propose:

- **Type** and **priority**, keeping any the user already set.
- **Duplicates** among the issues that are not closed.
- **Next step:** accept to `open/`, close with a resolution, or ask a
  `question` first.
- **Milestone**, if one fits.

The user approves, edits, or rejects each proposal. Then update the
frontmatter and move the files.

### Working

- **Starting work:** move the file from `open/` to `in-progress/` yourself.
- **Blocked:** move it to `blocked/` and add a Notes line naming what it
  waits for.
- **Done:** propose closing with a resolution, and close once the user
  confirms. A user's own "close 0007" is that confirmation; ask which
  resolution when it is unclear.
- **Parent with open children:** before closing it, list the open children
  and ask whether to close, re-parent, or keep them.

### Closing and reopening

- **Close:** set `resolution`, `closed`, and `updated`, then move the file
  to `closed/`.
- **Duplicate:** also add a Notes line naming the original issue id.
- **Reopen:** move the file to `open/`, clear `resolution` and `closed`, and
  add a Notes line saying why.

### Ask first

These need the user's explicit agreement every time:

- Creating anything on GitHub: issue, label, milestone, Project item.
- Closing an issue.
- Deleting an issue file.
- Changing the gitignore policy away from the default.

## Milestones

A milestone is a goal or release that groups issues, e.g. `v1.0` or `beta`.
Issues name it in their `milestone` field. `.claude/issues/MILESTONES.md`
defines each one:

```markdown
# Milestones

## v1.0
- **Goal:** First public release with login and dashboard.
- **Due:** 2026-12-01
- **State:** open
- **GitHub:** <milestone URL, once created>
```

- **State** is `open` or `closed`. Close a milestone once all its issues are
  closed or moved to another milestone.
- **Progress:** list the issues whose `milestone` matches, grouped by
  folder.

## Security issues

- **Store them in `.claude/issues/security/` only**, as a flat folder. Each
  file carries a `status:` field (`triage`, `open`, `in-progress`,
  `blocked`, `closed`) in place of a status folder.
- **They share the id counter** with all other issues.
- **They stay private.** Mention them by id only in commit messages, PR
  descriptions, and public issues until fixed.
- **On GitHub, they become a private security advisory**, never an issue:
  repo **Security** tab → **Advisories** → **New draft security advisory**.

## GitHub

GitHub is the second step, for issues that must be shared or tracked with
others, and only on the user's request. Before any `gh` command for issues,
labels, milestones, sub-issues, or Projects, read
[`references/github.md`](references/github.md).
