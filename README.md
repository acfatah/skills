# Skills

<p>
  <a href="./LICENSE">
    <img
      alt="License"
      src="https://img.shields.io/github/license/acfatah/skills?style=flat-square"
    ></a>
  <a href="https://github.com/acfatah/skills/commits/main">
    <img
      alt="Last commit"
      src="https://img.shields.io/github/last-commit/acfatah/skills?display_timestamp=committer&style=flat-square"
    ></a>
</p>

## Introduction

This repository contains my agent skills - modular capabilities that I use
to turn intentions into consistent, executable actions.

Unlike generic skill sets, these are opinionated and personalized. They
reflect my workflow preferences, design choices, and the way I approach 
problem‑solving.

## Skills

| Skill | Description |
|---|---|
| [auto-commit](skills/auto-commit) | Opt-in Auto-commit mode: commit each finished change or phase with its message and continue, stopping on gaps. Pushes only in Auto-PR mode, via auto-pr. |
| [auto-pr](skills/auto-pr) | Opt-in Auto-PR mode on top of auto-commit: after a clean finish, push the branch to its upstream, creating `origin/<branch>` on the first push, and open or update a draft PR against the recorded base. Asks before pushing to a PR that is ready for review or overwriting an edited PR title or body. |
| [issue-tracker](skills/issue-tracker) | Track issues in local SQLite through a bundled Bun CLI, with triage, milestones, sub-issues, optional Turso sync between your machines, and promotion to GitHub Issues and Projects. |
| [plans-and-roadmaps](skills/plans-and-roadmaps) | Rules for plan documents: file location, whether a plan runs in a worktree, which session plans, progress stamps, state directories, phased plans, and multi-session roadmaps. |
| [post-merge-cleanup](skills/post-merge-cleanup) | After a PR merges, remove its worktree, local branch and remote branch, and its fork sub-branches, after safety checks and one confirmation (or none with `--yes`), and name any database the worktree leaves behind. |
| [pr-summary](skills/pr-summary) | Write or update a PR suggestion in `drafts/PR_SUMMARY-<task>.md`: a title, a description of every commit on the branch, and the attribution line, in an untracked file. Never pushes or runs `gh`; auto-pr uses it for the PR body. |
| [readme-badges](skills/readme-badges) | Add, audit, or repair a README's badge block: shields.io and qlty badges in one HTML format, each verified before writing. |
| [session-sync](skills/session-sync) | Keep several Claude sessions on one branch or PR in sync: forks on sub-branches, a shared sessions file, a sync step before acting, and a repo-checked recap after a break. |
| [windows-screenshots](skills/windows-screenshots) | Locate, list, and read Windows screenshots (Win+PrtScn, Snipping Tool) from WSL or native Windows shells. |

Each skill loads when your request matches its description, and naming
it (`/<skill-name>` or "use the <skill-name> skill") always loads it.
`plans-and-roadmaps` and `auto-commit` load from an activity, such as
plan mode, rather than by name. Each skill's README has example prompts
under Usage.

## Workflows

Claude Code workflow scripts: multi-agent orchestrations run with the
Workflow tool, not skills.

| Workflow | Description |
|---|---|
| [webapp-security-audit](workflows/webapp-security-audit) | Full-stack web app security audit: recon, one finder per vulnerability class, adversarial verification, attack-chain synthesis. Its README includes the audit playbook. |

The skills CLI does not install workflows. Each workflow is a single
file that you download into `~/.claude/workflows/`; its README has the
command.

## Requirements

These skills are opinionated, and so is the tooling around them.

- **Agent: [Claude Code](https://claude.com/claude-code).** The skills
  are written with Claude and for Claude. Install commands target it with
  `-a claude-code`, and some skills reference Claude Code paths such as
  `~/.claude/`.
- **Model: Claude Opus 5.5.** The skills are written and tested against
  it. Other providers and models may behave differently, or not work at
  all.
- **Package runner: [Bun](https://bun.sh).** Every command here uses
  `bunx`, not `npx`; install Bun first. `npx` should work as a drop-in,
  but it is not what I use or test with.

Other software, by skill:

| Software | Needed by | Notes |
|---|---|---|
| [git](https://git-scm.com) | auto-commit, auto-pr, plans-and-roadmaps, post-merge-cleanup, pr-summary, session-sync, readme-badges, webapp-security-audit | |
| [Bun](https://bun.sh) | issue-tracker | Runs its bundled CLI; the skill stops without it |
| [GitHub CLI (`gh`)](https://cli.github.com), logged in | auto-pr, post-merge-cleanup, issue-tracker (promotion) | Check with `gh auth status`. readme-badges and plans-and-roadmaps use it when present |
| GitHub account | auto-pr, post-merge-cleanup, issue-tracker (promotion) | For PRs, remote branches and GitHub Issues |
| [`jq`](https://jqlang.org) | status line | plans-and-roadmaps falls back to reading files without it |
| curl | readme-badges | Checks each badge image and link |
| [Turso CLI](https://docs.turso.tech/cli) and account | issue-tracker | Optional, only for sync between your machines |
| Windows or WSL | windows-screenshots | Plus the `SCREENSHOTS` variable; see its README |

- **Gotcha:** promoting issues to a GitHub Project needs an extra scope:
  run `gh auth refresh -s project` once.
- **Gotcha:** the status line script needs bash and `tac`, which macOS
  lacks.
- **Gotcha:** some settings and commands need a recent Claude Code:
  `timeFormat` needs v2.1.257, and `/doctor prompt-audit` v2.1.283.

## Install

Pick interactively from the skills in this repository:

```bash
bunx skills add acfatah/skills
```

Or install one directly, globally, for a specific agent:

```bash
bunx skills add acfatah/skills -s windows-screenshots -a claude-code -g -y
```

List what is available without installing:

```bash
bunx skills add acfatah/skills --list
```

Update installed skills:

```bash
bunx skills update -g
```

## Layout

```
CLAUDE.md            rules for Claude when working in this repo
claude/
├── CLAUDE.md        global Claude Code instructions (see below)
└── statusline.sh    status line script (see below)
workflows/
└── <name>/
    ├── <name>.js    Claude Code workflow script; symlink this file
    └── README.md    install, usage, and background
skills/
└── <skill-name>/
    ├── SKILL.md     required - frontmatter `name` must match the folder 
    |                name
    └── README.md    human-facing docs (SKILL.md is the agent-facing 
                     contract)
```

Every skill and workflow `README.md` uses the same sections: What it
is, What it is not, When not to use, Install, and Usage (Run, for a
workflow) with example prompts.

## Versioning

Versioning here is deliberately the simplest thing that works: each
skill carries its own `vX.Y.Z` in the H1 title of its `SKILL.md` (e.g.
`# Windows Screenshots v1.0.0`), and bumping a version means editing
that one number. Nothing else to update.

Versions are per-skill and kept in exactly one place, so a single
repository tag never has to speak for all of them.

There is no CHANGELOG. The commit history is the change history - a
version bump rides in the same commit as the change that caused it, so
the log for a skill's folder reads as its release notes:

```bash
git log --oneline -- skills/windows-screenshots
```

Workflows follow the same single-place rule. A workflow's version is
the `VERSION` constant in its `.js` file, the one file users install.

## Claude Code instructions

[`claude/CLAUDE.md`](claude/CLAUDE.md) holds my global instructions for
Claude Code: response style, line width, PR and commit conventions, a
worktree prompt and one-off worktree rule, and pointers to the
`plans-and-roadmaps`, `auto-commit`, `auto-pr`, `pr-summary`,
`issue-tracker` and `session-sync` skills. Claude Code loads it from
`~/.claude/CLAUDE.md`, so link it there:

```bash
ln -sfn "$PWD/claude/CLAUDE.md" ~/.claude/CLAUDE.md
```

This replaces any existing `~/.claude/CLAUDE.md`, so back that up first.

For plan documents, phased plans and the roadmap workflow, see the
[`plans-and-roadmaps`](skills/plans-and-roadmaps) skill. To let Claude
commit each finished change or phase instead of waiting, see the
[`auto-commit`](skills/auto-commit) skill; to also push and open a draft
PR at the end, see [`auto-pr`](skills/auto-pr). For logging and triaging
issues in a local database, see the [`issue-tracker`](skills/issue-tracker)
skill.

## Status line

[`claude/statusline.sh`](claude/statusline.sh) is a Claude Code status
line script. It shows the Claude Code process id, the session id, and
how much of the context window is in use:

```
pid: 2159799 · session: <session_id> · context: 84k/1M (8%)
branched from: <session_id>
```

Claude Code pipes JSON to the script on stdin. The session comes from
`session_id`, and the context numbers from `context_window.*`: tokens in
use, window size, and the percentage used. The JSON has no process id, so
the script walks up its parent processes with `ps` to the one named
`claude`. It requires [`jq`](https://jqlang.org).

The second line appears only in a branched or forked session, and names
the session it came from. Its label tells the two apart, because the
other session behaves differently:

- **`branched from:`** after `/branch`. You switched away from the original
  session, which stopped there; `/resume <id>` returns to it.
- **`forked from:`** in a background fork (⑂). The original runs in parallel
  and may still be changing the same files.

The script reads the id from the transcript at `transcript_path`:

- **`/branch`:** the `forkedFrom.sessionId` field on the copied messages.
- **Background fork (⑂):** the `session_id` of the last copied message,
  but only when the transcript has the `<fork-source>` notice. `/clear`
  also copies messages from another session, so the notice keeps it from
  showing a false line.

Link it into `~/.claude/` the same way as `CLAUDE.md`, then enable it with
the `statusLine` setting under Recommended settings:

```bash
ln -sfn "$PWD/claude/statusline.sh" ~/.claude/statusline.sh
```

This replaces any existing `~/.claude/statusline.sh`, so back that up
first.

- **Gotcha:** the numbers come from the last API response, so they can
  trail `/context` a little.
- **Gotcha:** the process id shows `?` when no parent process is named
  `claude`, such as when you run the script by hand.
- **Gotcha:** `forkedFrom`, `session_id` and the `<fork-source>` notice
  are undocumented transcript details, checked against Claude Code
  2.1.309. If a later version changes them, the second line silently
  stops showing.
- **Gotcha:** for a fork of a fork, the second line can name the
  grandparent if the parent wrote nothing before it was forked.
- **Gotcha:** the background-fork check uses `tac`, which macOS lacks.

## Recommended settings

Apply these by hand in `~/.claude/settings.json`. Add each key inside the
existing top-level object; do not paste a second `{}` block.

```json
{
  "showClearContextOnPlanAccept": true,
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline.sh"
  },
  "timeFormat": "%Y-%m-%d %H:%M %Z"
}
```

- **`showClearContextOnPlanAccept`:** shows the option to clear the
  context when you accept a plan, so work starts fresh from the plan file
  alone. The `plans-and-roadmaps` and `auto-commit` skills write their
  stop and run-mode lines into the plan so they survive that clear.
- **`statusLine`:** runs the [status line](#status-line) script above.
- **`timeFormat`** (optional): a strftime pattern for the time after
  "done" in the turn duration line, such as
  `done 2026-10-21 14:16 +08`. Needs Claude Code v2.1.257 or later;
  `/config` offers only the presets.
- **`worktree.baseRef`** (optional, not in the block above): `fresh`
  (the default) or `head`, the base of Claude Code's built-in
  `EnterWorktree name=`. `plans-and-roadmaps` reads it to order its
  worktree options and to decide when to use the built-in tool.
- **`worktree.symlinkDirectories`** (optional, not in the block above):
  directories Claude Code symlinks into the worktrees it creates.
  `plans-and-roadmaps` reads it on its `git worktree add` route and makes
  the same links itself.

## Troubleshooting

Claude Code has built-in checks for skills. Run them after installing,
after a Claude Code or model update, or when a skill misbehaves.

### Check your setup

- **`/doctor`:** checks the install, settings, extensions and
  `CLAUDE.md`, and proposes fixes.
- **`/doctor prompt-audit`:** checks `CLAUDE.md`, skills and other
  config for outdated or conflicting instructions. Needs v2.1.283.
- **`/skill-doctor`:** shows each skill's context cost and usage, and
  lists skills that were never invoked. Needs v2.1.252 and feature-flag
  fetching.

### A skill doesn't load

- **`/skills`:** lists installed skills; press `t` to sort by tokens.
- **`/context`:** shows what is in the context window, skills included.
- **`claude plugin validate <dir>`:** reports frontmatter errors that
  stop a skill from matching its description.
- **`claude --debug`** or **`/debug`:** writes a debug log to
  `~/.claude/debug/`.
- **Name it:** `/<skill-name>` always loads a skill, which tells a
  description mismatch apart from a broken skill.

### Behavior drift

A skill can behave differently after a model or Claude Code update, with
no change to its files. Re-run `/doctor prompt-audit` after each update,
and try the skill's example prompts from its README.

- **Gotcha:** `claude plugin validate ~/.claude/skills` skips symlinked
  skills without reading them. Validate the repo's `skills/` folder, or
  each real path, instead.
- **Gotcha:** `/claude-api prompt-audit` is a different command; it
  reviews prompts in your code, not your skills.

## License

[MIT](LICENSE)
