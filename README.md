# Skills

## Introduction

This repository contains my agent skills - modular capabilities that I use
to turn intentions into consistent, executable actions.

Unlike generic skill sets, these are opinionated and personalized. They
reflect my workflow preferences, design choices, and the way I approach 
problem‑solving.

## Skills

| Skill | Description |
|---|---|
| [windows-screenshots](skills/windows-screenshots) | Locate, list, and read Windows screenshots (Win+PrtScn, Snipping Tool) from WSL or native Windows shells. |

## Install

Pick interactively from the skills in this repository:

```bash
npx skills add acfatah/skills
```

Or install one directly, globally, for a specific agent:

```bash
npx skills add acfatah/skills -s windows-screenshots -a claude-code -g -y
```

List what is available without installing:

```bash
npx skills add acfatah/skills --list
```

Update installed skills:

```bash
npx skills update -g
```

## Layout

```
skills/
└── <skill-name>/
    ├── SKILL.md     required - frontmatter `name` must match the folder 
    |                name
    └── README.md    human-facing docs (SKILL.md is the agent-facing 
                     contract)
```

Each skill carries its own version in the H1 title of its `SKILL.md` (e.g. 
`# Windows Screenshots v1.0.0`).  Versions are per-skill and deliberately
kept in exactly one place, so a single repository tag never has to speak for
all of them.

## License

[MIT](LICENSE)
