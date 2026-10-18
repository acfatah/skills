---
name: auto-commit
description: "Opt-in Auto-commit mode: ask once, then commit each finished logical change with its suggested message and continue, stopping on gaps or failures. Load before approving or executing a plan, before a phased plan or roadmap phase, when the user asks for two or more distinct changes, or when the user says \"auto-commit\", \"unattended\", \"run it all\", \"commit as you go\", or \"don't stop between phases\"."
---

# Auto-commit v1.1.0

By default Claude never commits unless asked: it finishes a logical change,
suggests a commit message, and waits. That is **Pause** mode. **Auto-commit**
mode is the opt-in alternative: Claude commits each finished logical change
with its suggested message and moves on, and stops only when it hits a gap or
a failure.

## When to ask

Ask once, at a natural decision point:

- **At plan approval.** In plan mode, ask with AskUserQuestion before calling
  ExitPlanMode, so the answer can go into the plan.
- **Before executing a phased plan** that does not record a run mode yet.
- **When the user asks for two or more distinct changes** in one request.

A single small task skips the question and keeps the normal pause. If the
user already said "auto-commit", "commit as you go" or similar, that is the
answer; do not ask again.

## The question

Offer exactly two options, Pause first:

- **Pause** (default): stop after each logical change or phase, show the
  commit message, and wait.
- **Auto-commit**: commit each change with its message and continue; stop on
  any gap.

**Pre-flight.** Put every open question about the plan in the same
AskUserQuestion call, so gaps are answered before the run starts instead of
halting it later.

## Recording the choice

- **In a plan,** write the choice as a line under the title, below any stop
  line the plan already has:

      > Run mode: Auto-commit. Commit each phase with its message and continue; stop on any gap. See the auto-commit skill.

  The line survives a "clear context" approval, which starts work from the
  plan alone. Write `> Run mode: Pause.` when the user picks Pause, or leave
  the line out; a plan without one runs in Pause.
- **Without a plan,** the choice lasts for this session only.
- **Never save it to memory.** Each plan or session asks again.
- **Never infer it.** Bypass-permissions mode, "proceed" and "go ahead" are
  not a choice of Auto-commit.

## What it authorizes

- **`git commit`** once per finished logical change or phase, using its
  suggested message, attribution trailer included.
- **Stage by explicit path,** only the files changed for that task. Never
  `git add -A`, `git add .` or `git commit -a`.
- **Branch off the default branch.** If the run starts on the default
  branch, create a topic branch first and say its name. Committing to an
  existing topic branch is fine.

## What it never authorizes

Push, amend, force, `--no-verify`, reset, rebase, branch deletion, or
anything else outward-facing or hard to undo. Those still need an explicit
request, as in Pause mode.

## Starting a run

- **Record the baseline.** Run `git status --short` and record its output,
  together with the base SHA that the undo command uses.
- **Report a dirty tree.** If the output is not empty, list the files and
  ask once: commit them first, stash them, or continue.
- **On continue, remember the dirty files.** Staging by path takes whole
  files, so a task that edits one of them is a hard gap before its commit.

## Before each commit

- **Run the repo's checks** (tests, lint, type check) when they exist.
  Failing checks are an unsafe gap.
- **Compare `git status --short` with the baseline** recorded when the run
  started (see Starting a run). Changes outside the files this task
  touched are a hard gap: they may be the user's own edits.

## Gaps

Sort every question or surprise into one of three kinds:

- **Soft:** cheap to reverse, and nothing later builds on it (a name, a
  wording, a minor default). Pick a sensible default, say so in the commit
  body, and list it in the final report.
- **Hard:** later tasks depend on the answer. Leave the task uncommitted.
  In the plan, mark its heading `Blocked: <question>` and each dependent
  task `Blocked by <task>`. Continue with independent tasks only if the
  blocked task left no edits in the working tree; otherwise stop.
- **Unsafe:** the next step is destructive or outward-facing, or checks or
  hooks fail. Stop.

When unsure whether a gap is soft or hard, treat it as hard.

## Stop or finish report

Whenever the run stops or ends, report:

- **Commits:** short SHA and subject of each.
- **Undo:** `git reset --soft <base>`, with the real SHA the run started
  from. It drops the run's commits and keeps their changes staged.
- **Defaults chosen** for soft gaps.
- **Blocking question,** if any, with its options and a recommendation.

## Scope

Auto-commit ends when the plan or the requested batch of changes ends. The
next request is back in Pause unless the user chooses Auto-commit again.

## Roadmaps

Auto-commit never crosses sessions. In a roadmap phase it only replaces "stop
and wait" with "commit the phase, write the outcome, then stop". Never plan
or start the next phase; the user starts every session.
