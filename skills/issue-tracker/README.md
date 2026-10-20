# issue-tracker

An [agent skill](https://skills.sh) that gives Claude Code one consistent
way to track issues while you work: bugs, ideas, feedback, and tasks it
notices along the way, or that you ask it to log.

## What it is

- **Keeps issues as local Markdown files** in `.claude/issues/`, one per
  issue, git-ignored by default.
- **Uses the folder as the status:** `triage/`, `open/`, `in-progress/`,
  `blocked/`, `closed/`.
- **Mentions side issues** in one line and logs them only when you agree,
  then returns to the task at hand.
- **Supports** types, priorities, milestones, and sub-issues.
- **Keeps security findings** in a private folder that never becomes a
  public issue.
- **Promotes an issue to GitHub** on request, with labels, milestone,
  sub-issue links, and a user-level `Issues` Project.

## What it is not

- **Not a GitHub Issues client.** It never lists, imports, or syncs issues
  created on GitHub; those stay there.
- **Not a two-way sync.** Promotion goes local → GitHub once; after that,
  GitHub owns the issue and the local file is a closed record.
- **Not a project manager.** Issues carry type, priority, labels,
  milestone and parent; there are no assignees or estimates.
- **Not an autopilot.** It proposes and you decide: side issues are logged
  only when you agree, triage runs only when asked, and it fixes nothing
  unless asked.

## When not to use

- **Your team already tracks work in GitHub Issues or another tracker** →
  file it there. This skill only writes local files and promotes them one
  way.
- **A small step inside the current task** → it belongs in the task's own
  plan or checklist, not a new issue. Use `plans-and-roadmaps` for
  multi-step work.
- **Finding security bugs** → run the `webapp-security-audit` workflow or
  `/security-review`; this skill only records findings you already have.

**Negative example:** "List the open issues on GitHub" will not use this
skill; run `gh issue list`.

## Install

```bash
bunx skills add acfatah/skills -s issue-tracker -a claude-code -g -y
```

For local development, link the folder instead:

```bash
ln -sfn "$PWD/skills/issue-tracker" ~/.claude/skills/issue-tracker
```

## Usage

### How it loads

- **By description match.** Claude loads it when a request uses its verbs:
  log, capture, triage, start, block, close, reopen, promote, sub-issue,
  milestone, security finding.
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
  before anything on GitHub; where to put issues outside a git repo or in
  a bare repo.

### Example prompts

- **Log:** "Log this as an issue: login fails on an empty password." /
  "/issue-tracker log a feature idea: dark mode, low priority."
- **Triage:** "Triage issues." Claude proposes type, priority, duplicates
  and next step for each; you approve each one.
- **Work:** "Start issue 0007." / "0007 is blocked on the API key." /
  "Close 0007, it's done."
- **Plan:** "Split 0007 into sub-issues for validation and the error
  message." / "Create a milestone v1.0 due 2026-12-01 and add 0007 to
  it."
- **Security:** "Record a security finding: the API token is printed in
  debug logs." It stays in the private `security/` folder.
- **Ship:** "Promote 0007 to GitHub." Claude asks before creating labels,
  the issue, or the Project item.

### Walkthrough

1. While fixing something else, Claude mentions a side issue and asks
   "Log it?"
2. You agree, and it lands in `triage/` with the path, line, and error.
3. "Triage issues" proposes a type and priority; once you approve, it
   moves to `open/`.
4. "Start 0007" moves it to `in-progress/`.
5. When it is done, close it locally, or promote it to GitHub.

The result looks like this:

```
.claude/issues/
├── MILESTONES.md
├── triage/0012-flaky-login-test.md
├── open/0007-login-fails-on-empty-password.md
├── closed/0003-update-readme.md
└── security/0009-token-in-logs.md
```

Gotchas:

- **GitHub Projects need an extra scope.** Run
  `gh auth refresh -s project` once before the first promotion.
- **Claude asks before anything leaves your machine.** Creating GitHub
  issues, labels, milestones, or Project items, and closing or deleting
  issues, always need your agreement.
- **Issue bodies are not hard-wrapped.** GitHub shows single newlines as
  line breaks, so Claude writes each paragraph of an issue on one line.
- **Sync is one-way.** Once promoted, an issue lives on GitHub; the local
  file is a closed record with the link.
- **Worktrees share one issue list.** Inside a git worktree, Claude logs
  issues in the main checkout's `.claude/issues/`, so they survive when
  the worktree is removed.
- **A `CLAUDE.md` can pick the folder.** Where no single repo fits, such
  as a workspace of worktrees over bare clones, name the issues folder in
  a `CLAUDE.md` that loads there. Claude uses it as-is, with no questions.

The full rules are in [`SKILL.md`](SKILL.md) and
[`references/github.md`](references/github.md).
