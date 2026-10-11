# issue-tracker

An [agent skill](https://skills.sh) that gives Claude Code one consistent
way to track issues while you work: bugs, ideas, feedback, and tasks it
notices along the way, or that you ask it to log.

What it does:

- Keeps issues as local Markdown files in `.claude/issues/`, one per issue,
  git-ignored by default.
- Uses the folder as the status: `triage/`, `open/`, `in-progress/`,
  `blocked/`, `closed/`.
- Mentions side issues in one line and logs them only when you agree, then
  returns to the task at hand.
- Supports types, priorities, milestones, and sub-issues.
- Keeps security findings in a private folder that never becomes a public
  issue.
- Promotes an issue to GitHub on request, with labels, milestone,
  sub-issue links, and a user-level `Issues` Project.

## Install

```bash
bunx skills add acfatah/skills -s issue-tracker -a claude-code -g -y
```

For local development, link the folder instead:

```bash
ln -sfn "$PWD/skills/issue-tracker" ~/.claude/skills/issue-tracker
```

## Usage

Just talk to Claude:

- "Log this as an issue."
- "Triage issues."
- "Start issue 0007." / "Close 0007, it's done."
- "Promote 0007 to GitHub."

A repo using it looks like this:

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
- **Sync is one-way.** Once promoted, an issue lives on GitHub; the local
  file is a closed record with the link.

The full rules are in [`SKILL.md`](SKILL.md) and
[`references/github.md`](references/github.md).
