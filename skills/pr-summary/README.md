# pr-summary

An [agent skill](https://skills.sh) that writes a PR suggestion to
`drafts/PR_SUMMARY-<task>.md`: a PR title, a full description of every
commit on the branch, and the attribution line. You read it and paste it,
or `auto-pr` sends it as the draft PR's body. It never talks to GitHub.

## What it is

- **Writes one draft file** per task, `drafts/PR_SUMMARY-<task>.md`, named
  after the plan or roadmap topic, or a snake_case topic it picks.
- **Updates in place.** An existing file for the same task is updated,
  never renamed; under `auto-pr` it uses the recorded name.
- **Keeps the file untracked.** It makes sure `drafts/` is ignored through
  `info/exclude` first, and never `git add`s the file.
- **Reads the branch:** `git log` and `git diff --stat` against the base
  (the default branch unless you name one), plus any linked plan or issue
  ids.
- **Covers every commit:** what changed and why, notable decisions, how it
  was verified, and follow-ups.
- **Writes for GitHub:** an imperative H1 title under about 72 characters,
  no hard wrapping, and the PR attribution line at the end.
- **Follows your repo's PR template** or rules when there is one.

## What it is not

- **Not a PR opener.** It never runs `gh`, pushes or commits.
- **Not a snapshot of your working tree.** Uncommitted changes are left
  out unless you say otherwise.

## When not to use

- **You want the PR opened or updated on GitHub** → ask for it explicitly,
  or pick Auto-PR in the run-mode question (see
  [`auto-pr`](../auto-pr)).
- **The work is not committed yet** → commit first; the skill describes
  only what is committed unless you say otherwise.

**Negative example:** "Push this and open a PR" is not this skill's job.
It never pushes or runs `gh`; that needs Auto-PR or its own explicit
request.

## Install

```bash
bunx skills add acfatah/skills -s pr-summary -a claude-code -g -y
```

For local development, link the folder instead:

```bash
ln -sfn "$PWD/skills/pr-summary" ~/.claude/skills/pr-summary
```

## Usage

### How it loads

- **By description match.** "Suggest a PR", "write a PR summary", "draft
  the PR description".
- **From `auto-pr`.** At a clean finish, `auto-pr` loads it to write the
  recorded summary file.
- **By name, always.** `/pr-summary` or "use the pr-summary skill".
- **What Claude asks back:** nothing, as a rule. It asks only when the
  repo already tracks a `drafts/` directory.

### Example prompts

- **Suggest a PR:** "Suggest a PR for this branch."
- **Write the description:** "Write a PR summary for the login work."
- **Other base:** "Draft the PR description against `dev`."
- **Refresh:** "Update the PR summary, I added two commits."
- **Include local edits:** "Write the PR summary, and include my
  uncommitted changes."
- **By name:** `/pr-summary`

Gotchas:

- **Uncommitted changes are left out** unless you say otherwise; Claude
  says so in one line.
- **A repo PR template wins.** Its sections replace the default ones.
- **Security issues appear by id only,** never described.
- **No hard wrapping is on purpose.** GitHub renders single newlines as
  line breaks, so each paragraph sits on one line.

The full rules are in [`SKILL.md`](SKILL.md).
