---
name: issue-tracker
description: Issue tracking in a local SQLite database through a bundled Bun CLI, with optional Turso sync between your own machines and GitHub as a second step. Load when logging or capturing an issue (bug, idea, feedback, task), triaging issues, starting, blocking, closing, or reopening one, managing sub-issues or milestones, recording a security finding, promoting an issue to GitHub Issues or a GitHub Project, importing v1 issues, exporting issues, or syncing issues.
---

# Issue Tracker v2.0.0

Track issues while you work: every issue starts in a local database, and
moves to GitHub only when it must be shared. Capture fast, triage later, and
keep the user in control: you propose, the user decides.

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

## Requirements

- **Bun.** Check with `bun --version` once per session. If it is missing,
  stop: say the skill needs Bun, and offer the install command. There is no
  fallback; never edit the database or write issue files by hand.
  - Linux, macOS, WSL: `curl -fsSL https://bun.sh/install | bash`
  - Windows PowerShell: `powershell -c "irm bun.sh/install.ps1 | iex"`

## Running the CLI

Every read and write goes through the bundled CLI:

```bash
bun ${CLAUDE_SKILL_DIR}/scripts/issues.js <verb> [options]
```

- **`${CLAUDE_SKILL_DIR}`** is this skill's folder. Claude Code fills it in
  when it loads this file. If it shows up unfilled, use the "Base directory
  for this skill" path instead. `<skill directory>` in the reference files
  means the same folder.
- **Run it from the project,** anywhere inside the repo. The CLI finds the
  issues root itself: the top folder, or the main checkout from a linked
  worktree. It also adds `.claude/issues*` to `info/exclude` on first use.
- **Long bodies** go through stdin: `--body-file -` with a quoted heredoc.
- **`--json`** gives structured output for `list`, `show`, `new`, `promote`,
  `milestone list`, and `remote status`.
- **`--help`** lists every verb and option; `<verb> --help` shows one.

### Location

- **Declared directory wins.** If a loaded `CLAUDE.md` names an issues
  directory, pass it on every call: `--dir <path>`.
- **Follow its conventions,** such as repository labels or GitHub targets.
- **Exit code 3** means the CLI cannot pick a location: a bare repository,
  or no git repo at all. Ask the user where to keep the issues, then pass
  `--dir <path>`.

### Exit codes

| Code | Meaning                       | Do                                      |
|------|-------------------------------|-----------------------------------------|
| 0    | Done                          | Continue.                               |
| 1    | Usage or validation error     | Read the message; fix the command or ask. |
| 2    | Offline on a Turso project    | See [Offline](#offline).                |
| 3    | Location needs a decision     | Ask the user, then pass `--dir`.        |

## Verbs

Ids are accepted as `7`, `0007`, or `S0007`, and printed zero-padded.

| Verb        | Example                                                              |
|-------------|----------------------------------------------------------------------|
| `new`       | `new --title "Login fails on empty password" --type bug --body-file -` |
| `list`      | `list --status open,in-progress --label auth`                        |
| `show`      | `show 0007`                                                          |
| `edit`      | `edit 7 --set priority=high --set milestone=v1.0`                    |
| `move`      | `move 7 blocked --note "waits for the API key"`                      |
| `close`     | `close 7 --resolution duplicate --dup-of 3`                          |
| `reopen`    | `reopen 7 --note "regressed in 1.2"`                                 |
| `note`      | `note 7 "Also fails on Safari"`                                      |
| `delete`    | `delete 7`                                                           |
| `milestone` | `milestone add v1.0 --due 2026-12-01 --goal "First release"`         |
| `check`     | `check`                                                              |
| `promote`   | `promote 7 --dry-run`                                                |
| `export`    | `export --out ~/backups/issues.jsonl`                                |
| `import`    | `import --v1`                                                        |
| `remote`    | `remote status`                                                      |
| `flush`     | `flush`                                                              |

- **`list`** shows the four open statuses by default; `--status all` adds
  closed ones. `--security` lists security issues.
- **`edit --set`** takes `type`, `priority`, `milestone`, `parent`,
  `github`, and `labels` (comma-separated); an empty value clears it.
- **`milestone`** takes `add`, `list`, `edit`, and `close`. `close` refuses
  while open issues name the milestone.

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
| `security` | A possible vulnerability. Always in the security database.      |

### Body

Use the sections that apply and drop the rest. Bugs usually need the first
five. Write each paragraph on one line; do not hard-wrap. Promotion sends
the body to GitHub as-is, and GitHub shows single newlines as line breaks.
Dated notes go through `note`, not the body.

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

## Suggested fix
<Optional. Proposed approach.>

## Steps
- [ ] <Small step that doesn't need its own issue.>

## Acceptance criteria
- [ ] <How we know it is done.>
```

## Lifecycle

| Status        | Meaning                                    | Moves to                    |
|---------------|--------------------------------------------|-----------------------------|
| `triage`      | Captured, not reviewed.                    | `open`, `closed`            |
| `open`        | Accepted, waiting for work.                | `in-progress`, `closed`     |
| `in-progress` | Being worked on.                           | `blocked`, `closed`, `open` |
| `blocked`     | Waiting on something; `--note` says what.  | `open`, `in-progress`       |
| `closed`      | Finished or dropped. Has a resolution.     | `open` (reopen)             |

The CLI enforces this table, sets the dates, and adds the notes for
duplicates and reopens. Resolutions: `done`, `duplicate`, `wont-fix`,
`invalid`, `moved`.

### Capture

When you notice an issue **unrelated to the current task**:

1. **Mention it in one line**, e.g. "Possible issue: X in `src/a.ts:42`.
   Log it?"
2. **Log it only if the user agrees,** with `new`. Put in what you know
   right now: exact path and line, error text, how you found it. A later
   session won't have that context.
3. **Return to the current task.** Fix the side issue only when asked.

When the user asks you to log an issue, of any type, log it directly. Pass
`--type` and `--priority` when the user states them, and leave them out
otherwise.

- **Scrub secrets** (tokens, passwords, keys) from captured output before
  saving it. Issues may leave the machine through Turso or GitHub.
- **Subagents don't write issues.** A subagent reports the issue in its
  result; the main agent mentions or logs it as above.

### Triage

Triage runs **on request only**, e.g. "triage issues". Run
`list --status triage`, and for each issue propose:

- **Type** and **priority**, keeping any the user already set.
- **Duplicates** among the issues that are not closed.
- **Next step:** accept with `move <id> open`, close with a resolution, or
  ask a `question` first.
- **Milestone**, if one fits.

The user approves, edits, or rejects each proposal. Then apply it with
`edit` and `move`.

### Working

- **Starting work:** `move <id> in-progress` yourself.
- **Blocked:** `move <id> blocked --note "<what it waits for>"`.
- **Done:** propose closing with a resolution, and close once the user
  confirms. A user's own "close 0007" is that confirmation; ask which
  resolution when it is unclear.
- **Parent with open children:** `close` refuses and lists them. Ask
  whether to close, re-parent, or keep them; pass `--keep-children` only
  to keep them open.

### Sub-issues

- **`--parent <id>`** links a child; `show` lists a parent's children.
- **A new child of an accepted parent** starts `open` with the parent's
  milestone and priority, so it needs a `--type`. Propose one.
- **Small steps go in `## Steps`** in the body, as checklist items, not as
  sub-issues.

### Ask first

These need the user's explicit agreement every time:

- Creating anything on GitHub: issue, label, milestone, Project item.
- Closing an issue.
- Deleting an issue (`delete`).
- Enabling Turso for a project (`remote enable`).
- Syncing security issues to Turso (`--security-url`).
- Deleting the v1 folder (`import --v1 --delete-old`).

## Turso sync

Optional, per project, for the user's own machines only. The user sets up
the databases and tokens; see [`references/setup.md`](references/setup.md).
Then `remote enable` copies the local rows up (or pulls them on a second
machine), and every command works against Turso with the local file as a
mirror.

- **`remote status`** shows the backend, the project key, when the mirror
  was last synced, and queued entries.
- **`remote disable`** sends queued entries, pulls a final copy, and goes
  back to local.
- **Tokens** live in the user's config or in environment variables, never
  in the repo, a `CLAUDE.md`, an issue, or a command line.
- **Auth errors** (a refused token) are reported, never queued.

### Offline

- **Reads** come from the mirror, with an `offline; issues as of …` line.
- **`new` and `note` queue** in an outbox, and new issues get a
  provisional id such as `P1`. The next online command, or `flush`, sends
  them and prints `P1 → 0012`.
- **Every other write exits 2.** Tell the user it waits until Turso is
  reachable; do not retry in a loop.
- **Never put a `P` id** in a commit message, a PR, or `--parent`. Use the
  real id once it is replayed.
- **Run `flush` before deleting or re-cloning a repo.** The outbox lives in
  the repo's `.claude/` folder and is lost with it.

## Security issues

- **Their own database,** with its own ids shown as `S0007`. Create them
  with `--type security`; the CLI routes `S…` ids for every verb.
- **They stay private.** Mention them by id only in commit messages, PR
  descriptions, and public issues until fixed.
- **They take no milestone,** and their parent must be another `S` issue.
- **On GitHub, they become a private security advisory**, never an issue:
  repo **Security** tab → **Advisories** → **New draft security advisory**.
- **Client or third-party code:** keep its findings local, even on a Turso
  project; do not add `--security-url` there.
- **Never store** real secrets or working exploit payloads in an issue.

## Upgrading from v1

If `<root>/.claude/issues/` (or a declared directory) holds v1 Markdown
folders such as `triage/` or `closed/`, offer to import them:

1. **`import --v1`** writes every issue with its id (security issues become
   `S` ids), turns `MILESTONES.md` into milestones, and reports counts per
   folder. It leaves the old folder in place.
2. **Show the counts** and ask whether to delete the old folder.
3. **`import --v1 --delete-old`** re-checks the counts and deletes it.

## Backup

`export --out <file.jsonl>` writes every issue, security findings
included, to one file that `import --from <file.jsonl>` restores into an
empty project. Run it only when the user asks, and keep the file out of
any repo.

## GitHub

GitHub is the second step, for issues that must be shared or tracked with
others, and only on the user's request:

1. **`promote <id> --dry-run`** prints the title, body, labels, milestone,
   and Project Status. The CLI never runs `gh`.
2. **Show it and ask.**
3. **Run `gh` yourself**, creating any missing labels or milestone after
   asking.
4. **`close <id> --resolution moved --github <url>`** records the link.

Before any `gh` command for issues, labels, milestones, sub-issues, or
Projects, read [`references/github.md`](references/github.md).
