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
| [auto-pr](skills/auto-pr) | Opt-in Auto-PR mode on top of auto-commit: after a clean finish, push the branch to its upstream, creating `origin/<branch>` on the first push, and open or update a draft PR. |
| [issue-tracker](skills/issue-tracker) | Track issues as local files in `.claude/issues/`, with triage, milestones, sub-issues, and promotion to GitHub Issues and Projects. |
| [plans-and-roadmaps](skills/plans-and-roadmaps) | Rules for plan documents: file location, whether a plan runs in a worktree, which session plans, progress stamps, state directories, phased plans, and multi-session roadmaps. |
| [post-merge-cleanup](skills/post-merge-cleanup) | After a PR merges, remove its worktree, local branch and remote branch, after safety checks and one confirmation. |
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

## Tooling Choices

These skills are opinionated, and so is the tooling around them:

- **Package runner: [Bun](https://bun.sh).** Every command here uses
  `bunx`, not `npx`; install Bun first. `npx` should work as a drop-in,
  but it is not what I use or test with.
- **Agent: [Claude Code](https://claude.com/claude-code).** Install
  commands target it with `-a claude-code`, and some skills reference
  Claude Code paths such as `~/.claude/`.
- **Model: Claude Opus 5.5.** The skills are written and tested against
  it. Other agents and models may work, but are not tested.

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
worktree prompt, and pointers to the `plans-and-roadmaps`, `auto-commit`,
`auto-pr`, `issue-tracker` and `session-sync` skills. Claude Code loads it from
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
issues as local files, see the [`issue-tracker`](skills/issue-tracker)
skill.

## Status line

[`claude/statusline.sh`](claude/statusline.sh) is a Claude Code status
line script. It shows the Claude Code process id, the session id, and
how much of the context window is in use:

```
pid: 2159799 · session: <session_id> · context: 84k/1M (8%)
forked from session: <session_id>
```

Claude Code pipes JSON to the script on stdin. The session comes from
`session_id`, and the context numbers from `context_window.*`: tokens in
use, window size, and the percentage used. The JSON has no process id, so
the script walks up its parent processes with `ps` to the one named
`claude`. It requires [`jq`](https://jqlang.org).

The second line appears only in a session made with `/branch`. It names
the session the branch came from, read from the `forkedFrom.sessionId`
field that `/branch` writes into the new session's transcript.

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
- **Gotcha:** `forkedFrom` is an undocumented transcript field, checked
  against Claude Code 2.1.309. If a later version renames it, the second
  line silently stops showing.

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

## License

[MIT](LICENSE)
