# auto-commit

An [agent skill](https://skills.sh) that lets Claude Code commit as it goes.
By default Claude never commits on its own: it finishes a change, suggests a
commit message, and waits. On multi-phase work that means one round trip per
phase just to say "commit it". This skill adds an opt-in **Auto-commit** mode
that removes those round trips.

What it does:

- Asks once, at plan approval or before a batch of changes: **Pause** (the
  default) or **Auto-commit**. Open questions about the plan go into the same
  prompt, so they are answered before the run starts.
- Records the choice as a `> Run mode:` line in the plan, so it survives a
  context clear. Without a plan, it lasts for the session only.
- In Auto-commit, commits each finished change with its suggested message,
  staging only the files that change touched, on a topic branch.
- Never pushes, amends, forces, rebases, or skips hooks.
- Sorts gaps into soft (default chosen and recorded), hard (task parked,
  dependents blocked) and unsafe (stop).
- Ends every run with a report: commits, the undo command, defaults chosen,
  and any blocking question.

## Install

```bash
bunx skills add acfatah/skills -s auto-commit -a claude-code -g -y
```

For local development, link the folder instead:

```bash
ln -sfn "$PWD/skills/auto-commit" ~/.claude/skills/auto-commit
```

## Example

1. **Plan the work.** In plan mode, ask for a two-phase change.
2. **Choose the mode.** Before approval, Claude asks "Pause or Auto-commit?"
   along with any open questions. Pick Auto-commit.
3. **Approve.** The plan gains
   `> Run mode: Auto-commit. Commit each phase …` under its title.
4. **Let it run.** Claude creates a topic branch, commits Phase 1, commits
   Phase 2, and reports both SHAs with `git reset --soft <base>` to undo.

Gotchas:

- **Nothing is pushed.** Review the branch, then push or open a PR yourself.
- **Your own edits stop the run.** Changes in the working tree that Claude
  did not make are treated as a hard gap, so editing files mid-run halts it.
- **The choice does not stick.** It is never saved to memory; every new
  plan or session starts in Pause.
- **Roadmaps still stop per phase.** Auto-commit commits the phase and writes
  its outcome, but the next phase still needs a fresh session.
- **Pairs with `plans-and-roadmaps`.** That skill reads the run-mode line in
  phased plans; this one defines what the line allows.

The full rules are in [`SKILL.md`](SKILL.md).
