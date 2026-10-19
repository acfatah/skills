# auto-commit

An [agent skill](https://skills.sh) that lets Claude Code commit as it goes.
By default Claude never commits on its own: it finishes a change, suggests a
commit message, and waits. On multi-phase work that means one round trip per
phase just to say "commit it". This skill adds an opt-in **Auto-commit** mode
that removes those round trips.

## What it is

- **Asks once,** at plan approval or before a batch of changes: **Pause**
  (the default) or **Auto-commit**, plus **Auto-PR** when the
  [`auto-pr`](../auto-pr) skill is installed and its preconditions pass.
  Open questions about the plan go into the same prompt, so they are
  answered before the run starts.
- **Records the choice** as a `> Run mode:` line in the plan, so it survives
  a context clear. Without a plan, it lasts for the session only.
- **Checks the tree when a run starts.** If you have uncommitted changes,
  it lists them and asks: commit them first, stash them, or continue.
- **In Auto-commit, commits** each finished change with its suggested
  message, staging only the files that change touched, on a topic branch.
- **Never pushes by itself,** amends, forces, rebases, or skips hooks.
  Pushing and draft PRs come only with Auto-PR, via `auto-pr`.
- **Sorts gaps** into soft (default chosen and recorded), hard (task parked,
  dependents blocked) and unsafe (stop).
- **Ends every run with a report:** commits, the undo command, defaults
  chosen, and any blocking question.

## What it is not

- **Not a push or PR tool by itself.** It never pushes, opens PRs,
  amends, forces, rebases, deletes branches, or skips hooks; you push and
  open the PR, or choose Auto-PR and let [`auto-pr`](../auto-pr) do it.
  The only reset it runs is the soft undo of the run, on your request and
  after you confirm.
- **Not a standing setting.** The choice is never saved to memory; it lasts
  for one plan or one batch of changes, then Pause returns.
- **Not a session runner.** In a roadmap it commits the phase, writes the
  outcome, and stops; it never plans or starts the next phase.
- **Not a guess.** "Proceed", "go ahead" and bypass-permissions mode never
  turn it on; only your answer does.

## When not to use

- **You want to review each diff before it lands** → keep Pause, the
  default.
- **The working tree has your own uncommitted edits** → commit or stash
  them first; that is still the simplest path. Otherwise Claude reports
  them when the run starts and asks. Commits stage whole files by path, so
  if you continue, a task that touches one of those files stops the run.
- **The repo has no checks and the change is risky** → use Pause. Checks
  run only when they exist, so nothing catches a broken change before it
  is committed.
- **A single small task** → nothing to batch; Claude skips the question.

**Negative example:** "Fix this typo" will not ask about Auto-commit; a
single small task keeps the normal pause.

## Install

```bash
bunx skills add acfatah/skills -s auto-commit -a claude-code -g -y
```

For local development, link the folder instead:

```bash
ln -sfn "$PWD/skills/auto-commit" ~/.claude/skills/auto-commit
```

## Usage

### How it loads

- **As a side effect of planning or batching.** Claude loads it before
  approving or executing a plan, before a phased plan or roadmap phase, or
  when you ask for two or more distinct changes.
- **By trigger phrase that answers.** "auto-commit", "commit as you go"
  and "don't stop between phases" load it and choose Auto-commit; Claude
  does not ask.
- **By trigger phrase that only loads.** "unattended" and "run it all"
  load it, but Claude still asks "Pause or Auto-commit?".
- **Reliably, with a `CLAUDE.md` pointer.** Its two rules hold even when
  the skill does not load:

  ```markdown
  ## Auto-commit mode

  Before approving or executing a plan, or when the user asks for several
  distinct changes, load the `auto-commit` skill. Two rules hold even
  without it: Pause is the default, and only Auto-PR pushes, and only to
  the branch's upstream; see the `auto-pr` skill.
  ```

- **By name, always.** `/auto-commit …` or "use the auto-commit skill".
- **What Claude asks back:** "Pause or Auto-commit?" once, with any open
  questions about the plan in the same prompt; at a stop, the blocking
  question with its options and a recommendation.

### Example prompts

- **Choose up front:** "Implement both phases, commit as you go." That is
  the answer; Claude does not ask again. "Run it all" still gets the
  question.
- **Batch:** "Rename the config key, update the docs, and bump the
  version." Three distinct changes, so Claude asks "Pause or Auto-commit?"
  first.
- **Plan mode:** "Make this a two-phase plan." Claude asks "Pause or
  Auto-commit?" before approval and writes the answer as a `> Run mode:`
  line.
- **Roadmap phase:** "/auto-commit implement phase 3 of
  .claude/plans/<topic>/roadmap.md." It commits the phase, writes the
  outcome, and stops.
- **Undo:** "Undo the run." Claude shows `git reset --soft <base>` and the
  commits it drops, and runs it after you confirm; the changes stay staged.

### Walkthrough

1. **Plan the work.** In plan mode, ask for a two-phase change.
2. **Choose the mode.** Before approval, Claude asks "Pause or Auto-commit?"
   along with any open questions. Pick Auto-commit.
3. **Approve.** The plan gains
   `> Run mode: Auto-commit. Commit each phase …` under its title.
4. **Let it run.** Claude creates a topic branch, commits Phase 1, commits
   Phase 2, and reports both SHAs with `git reset --soft <base>` to undo.

Gotchas:

- **Nothing is pushed unless you choose Auto-PR.** Otherwise review the
  branch, then push or open a PR yourself.
- **Undo stops at the remote.** `git reset --soft` cannot undo commits
  that Auto-PR already pushed.
- **Your own edits stop the run.** Changes in the working tree that Claude
  did not make are treated as a hard gap, so editing files mid-run halts it.
- **A task that touches a file you had already edited stops the run.** If
  you continue with a dirty tree, Claude cannot commit that file without
  your edit, so it stops before that commit.
- **The choice does not stick.** It is never saved to memory; every new
  plan or session starts in Pause.
- **Roadmaps still stop per phase.** Auto-commit commits the phase and writes
  its outcome, but the next phase still needs a fresh session.
- **Pairs with `plans-and-roadmaps`.** That skill reads the run-mode line in
  phased plans; this one defines what the line allows.

The full rules are in [`SKILL.md`](SKILL.md).
