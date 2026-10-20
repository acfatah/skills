# issue-tracker

An [agent skill](https://skills.sh) that gives Claude Code one consistent
way to track issues while you work: bugs, ideas, feedback, and tasks it
notices along the way, or that you ask it to log. Issues live in a local
SQLite database that Claude reads and writes only through a bundled Bun CLI.

> [!IMPORTANT]
> Turso sync is opt-in, and it sends your issues, security findings
> included, to a third party. Turso's at-rest encryption protects its disks,
> not your data from the service itself. Security issues use their own
> database and token; never share or commit either token. Keep security
> findings from client or third-party code local only.

## What it is

- **Keeps issues in SQLite**, in `.claude/issues.sqlite3`, never committed.
  The CLI assigns ids, sets dates, and enforces the lifecycle, so the rules
  live in code instead of in Claude's memory.
- **Mentions side issues** in one line and logs them only when you agree,
  then returns to the task at hand.
- **Supports** types, priorities, labels, milestones, sub-issues, and
  dated notes.
- **Keeps security findings** in a separate database, with `S` ids such as
  `S0007`, that never becomes a public issue.
- **Syncs your own machines through Turso**, optionally, with an offline
  queue for new issues and notes.
- **Promotes an issue to GitHub** on request: the CLI builds the issue,
  Claude shows it, asks, and runs `gh`.
- **Imports v1 issues** from the old `.claude/issues/` Markdown folders,
  keeping every id.

## What it is not

- **Not a GitHub Issues client.** It never lists, imports, or syncs issues
  created on GitHub; those stay there.
- **Not a two-way sync with GitHub.** Promotion goes local → GitHub once;
  after that, GitHub owns the issue and the local record is closed.
- **Not a team tracker.** Turso sync is for your own machines; share with
  other people through GitHub.
- **Not a project manager.** Issues carry type, priority, labels,
  milestone and parent; there are no assignees or estimates.
- **Not an autopilot.** It proposes and you decide: side issues are logged
  only when you agree, triage runs only when asked, and it fixes nothing
  unless asked.

## When not to use

- **Your team already tracks work in GitHub Issues or another tracker** →
  file it there. This skill keeps issues for you, and promotes them one way.
- **A small step inside the current task** → it belongs in the task's own
  plan or checklist, not a new issue. Use `plans-and-roadmaps` for
  multi-step work.
- **Finding security bugs** → run the `webapp-security-audit` workflow or
  `/security-review`; this skill only records findings you already have.
- **No Bun on the machine, and you cannot install it** → the skill stops;
  there is no fallback.

**Negative example:** "List the open issues on GitHub" will not use this
skill; run `gh issue list`.

## Install

The skill needs [Bun](https://bun.sh). Claude checks `bun --version` and
offers the install command when it is missing:

```bash
curl -fsSL https://bun.sh/install | bash
```

Then install the skill:

```bash
bunx skills add acfatah/skills -s issue-tracker -a claude-code -g -y
```

For local development, link the folder instead:

```bash
ln -sfn "$PWD/skills/issue-tracker" ~/.claude/skills/issue-tracker
```

The CLI ships prebuilt in `scripts/issues.js`; there is nothing else to
install.

## Configuration

A local project needs no configuration. Two setups need a step from you.

- **Turso sync** (optional): create one database and token for issues, and
  optionally one for security findings, put the tokens in environment
  variables, then ask Claude to enable sync. The full steps, the config
  file, and how to revoke a leaked token are in
  [`references/setup.md`](references/setup.md):

  ```bash
  turso db create <project>-issues
  turso db tokens create <project>-issues --expiration never
  ```

- **Upgrading from v1:** ask Claude to import your issues. It runs
  `import --v1`, shows the counts per folder, and deletes the old
  `.claude/issues/` folder only after you agree.

## Usage

### How it loads

- **By description match.** Claude loads it when a request uses its verbs:
  log, capture, triage, start, block, close, reopen, promote, sub-issue,
  milestone, security finding, import v1 issues, export issues, sync
  issues.
- **By name, always.** `/issue-tracker …` or "use the issue-tracker skill".
- **For side issues, add a `CLAUDE.md` pointer.** Without one, Claude only
  mentions unrelated issues while the skill is already loaded:

  ```markdown
  ## Issues

  When you notice an issue unrelated to the current task, mention it in
  one line and offer to log it. To log, triage, or promote issues, load
  the `issue-tracker` skill.
  ```

- **What Claude asks back:** "Log it?" for a side issue; one proposal per
  issue during triage; which resolution when closing is unclear; agreement
  before closing or deleting an issue, anything on GitHub, enabling Turso,
  syncing security issues, or deleting the v1 folder; where to keep issues
  outside a git repo or in a bare repo.

### Example prompts

- **Log:** "Log this as an issue: login fails on an empty password." /
  "/issue-tracker log a feature idea: dark mode, low priority."
- **Triage:** "Triage issues." Claude proposes type, priority, duplicates
  and next step for each; you approve each one.
- **Work:** "Start issue 0007." / "0007 is blocked on the API key." /
  "Close 0007, it's done."
- **Plan:** "Split 0007 into sub-issues for validation and the error
  message." / "Create a milestone v1.0 due 2026-12-01 and add 0007 to it."
- **Security:** "Record a security finding: the API token is printed in
  debug logs." It goes to the security database as an `S` issue.
- **Ship:** "Promote 0007 to GitHub." Claude shows the issue it would
  create and asks before creating labels, the issue, or the Project item.
- **Maintain:** "Import my v1 issues." / "Export all issues to
  ~/backups/issues.jsonl." / "Sync issues."

### Walkthrough

1. While fixing something else, Claude mentions a side issue and asks
   "Log it?"
2. You agree, and it runs `new` with the path, line, and error. The issue
   starts in `triage`.
3. "Triage issues" proposes a type and priority; once you approve, it
   moves to `open`.
4. "Start 0007" moves it to `in-progress`.
5. When it is done, close it locally, or promote it to GitHub.

The CLI's output stays short:

```text
$ bun <base>/scripts/issues.js list
0007   open        bug      medium Login fails on empty password  (labels auth)
0012   triage      -        -      Flaky login test
```

Gotchas:

- **The offline queue is local.** On a Turso project, deleting or
  re-cloning a repo loses issues and notes queued offline. Ask Claude to
  flush first.
- **Provisional ids are temporary.** An issue logged offline shows as `P1`
  until Turso is reachable; never use it in a commit message or as a
  parent.
- **WSL and `/mnt/c`:** SQLite locking is unreliable on Windows drives in
  WSL. Keep repos in the Linux filesystem.
- **Tokens in cloud sandboxes** are readable by whatever runs there. Never
  put the security token in one.
- **Exports hold security findings.** Keep export files out of any repo.
- **GitHub Projects need an extra scope.** Run
  `gh auth refresh -s project` once before the first promotion.
- **Issue bodies are not hard-wrapped.** GitHub shows single newlines as
  line breaks, so Claude writes each paragraph of an issue body on one
  line.
- **Worktrees share one issue list.** Inside a git worktree, the CLI uses
  the main checkout's `.claude/`, so issues survive when the worktree is
  removed.
- **A `CLAUDE.md` can pick the directory.** Where no single repo fits, such
  as a workspace of worktrees over bare clones, name the issues directory in
  a `CLAUDE.md` that loads there. Claude passes it as `--dir`.

The full rules are in [`SKILL.md`](SKILL.md),
[`references/setup.md`](references/setup.md), and
[`references/github.md`](references/github.md).
