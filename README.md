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
| [auto-commit](skills/auto-commit) | Opt-in Auto-commit mode: commit each finished change or phase with its message and continue, stopping on gaps. Never pushes. |
| [issue-tracker](skills/issue-tracker) | Track issues as local files in `.claude/issues/`, with triage, milestones, sub-issues, and promotion to GitHub Issues and Projects. |
| [plans-and-roadmaps](skills/plans-and-roadmaps) | Rules for plan documents: file location, progress stamps, state directories, phased plans, and multi-session roadmaps. |
| [readme-badges](skills/readme-badges) | Add, audit, or repair a README's badge block: shields.io and qlty badges in one HTML format, each verified before writing. |
| [windows-screenshots](skills/windows-screenshots) | Locate, list, and read Windows screenshots (Win+PrtScn, Snipping Tool) from WSL or native Windows shells. |

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
claude/
└── CLAUDE.md        global Claude Code instructions (see below)
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
Claude Code: response style, line width, PR and commit conventions, and
pointers to the `plans-and-roadmaps`, `auto-commit` and `issue-tracker`
skills. Claude Code loads it from `~/.claude/CLAUDE.md`, so link it there:

```bash
ln -sfn "$PWD/claude/CLAUDE.md" ~/.claude/CLAUDE.md
```

This replaces any existing `~/.claude/CLAUDE.md`, so back that up first.

For plan documents, phased plans and the roadmap workflow, see the
[`plans-and-roadmaps`](skills/plans-and-roadmaps) skill. To let Claude
commit each finished change or phase instead of waiting, see the
[`auto-commit`](skills/auto-commit) skill. For logging and triaging
issues as local files, see the [`issue-tracker`](skills/issue-tracker)
skill.

## License

[MIT](LICENSE)
