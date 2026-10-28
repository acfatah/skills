---
name: lint-skills
description: Lint a skills repo with a bundled Bun script - skill names match their folders, cross-skill references and links point at skills that exist, READMEs and versions follow the repo rules, and, with --home, ~/.claude/skills links resolve. Load when the user says lint skills, check skill names or references, or before committing a new or changed skill in a skills repo.
allowed-tools: Bash(bun ${CLAUDE_SKILL_DIR}/scripts/lint.ts *)
---

# Lint Skills v1.0.0

Run the bundled linter on a skills repo, report what it finds, and offer
fixes. The script does the checking; this file says when to run it and
what to do with its output.

## Requirements

- **Bun.** Check with `bun --version` once per session. If it is missing,
  stop: say the skill needs Bun, and offer the install command from
  <https://bun.sh>. There is no fallback; never lint by hand instead.

## Run

```bash
bun ${CLAUDE_SKILL_DIR}/scripts/lint.ts [--home] [--root <path>]
```

- **`${CLAUDE_SKILL_DIR}`** is this skill's folder. Claude Code fills it
  in when it loads this file. If it shows up unfilled, use the "Base
  directory for this skill" path instead. Write the path out in full;
  never put it in a shell variable, or the `allowed-tools` grant does not
  match.
- **Run it from the repo.** The root is `--root`, else the git top level,
  else the current directory.
- **Add `--home`** when the user asks about installed skills, links or
  `~/.claude/skills`. Without it, nothing outside the repo is read.
- **Exit codes:** 0 no errors (warnings allowed), 1 errors found, 2 usage
  error or not a skills repo.

Every check, its severity and an example finding are in
[`references/checks.md`](references/checks.md). Read it when a finding's
meaning or a fix is unclear.

## Report

- **Group by file,** errors first, then warnings, each with its `path:line`
  so it is clickable.
- **Say the exit code** and the summary line, such as `2 errors, 1 warning`.
- **A clean run** gets one line: the summary and "no findings".
- **Warnings are advice.** Say so; they never block a commit.

## Offer fixes

Offer a fix for each clear finding, and edit only after the user agrees:

- **A typo** in a skill name, with exactly one close known name.
- **A missing README row** in the root Skills or Workflows table.
- **A missing `vX.Y.Z`** in a `SKILL.md` H1: propose `v1.0.0` for a new
  skill.
- **A missing README section,** or one out of order.
- **A name mismatch:** ask which side is right, the folder or `name:`.

Rules:

- **Never add to `BUILT_INS` or `EXTERNAL_SKILLS`** in the script on your
  own. An `unknown-command` warning may be a Claude Code built-in missing
  from the list; say so, and ask before adding it.
- **No guess, no fix.** For an unknown name with no close match, report
  it and ask what it should be.
- **Re-run** the linter after the fixes, and report the new summary.

## Exit 2

- **Not a skills repo:** say the folder has no `skills/` directory, and ask
  for the repo path to pass as `--root`.
- **Usage error:** fix the command and run it again.
