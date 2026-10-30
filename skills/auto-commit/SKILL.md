---
name: auto-commit
description: "Opt-in Auto-commit mode: ask once, then commit each finished logical change with its suggested message and continue, stopping on gaps or failures. Load before approving or executing a plan, before a phased plan or roadmap phase, when the user asks for two or more distinct changes, or when the user says \"auto-commit\", \"unattended\", \"run it all\", \"commit as you go\", or \"don't stop between phases\"."
---

# Auto-commit v1.5.0

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

A single small task skips the question and keeps the normal pause. Some
trigger phrases answer the question, and some only load this skill:

- **Answers:** "auto-commit", "commit as you go", "don't stop between
  phases". Do not ask again.
- **Load only:** "unattended", "run it all". Still ask.

## The question

Offer the options in this order, Pause first:

- **Pause** (default): stop after each logical change or phase, show the
  commit message, and wait.
- **Auto-commit**: commit each change with its message and continue; stop on
  any gap.
- **Auto-PR**: Auto-commit, then push the branch and open or update a draft
  PR after a clean finish. Offer it only when the `auto-pr` skill is
  installed and its preconditions pass. Otherwise offer the first two and
  say in one line why Auto-PR is hidden.

**Hand-off.** When the user picks Auto-PR, or a plan's run-mode line says
Auto-PR, load the `auto-pr` skill. Its rules add to this one.

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
- **Branch off a protected branch.** If the run starts on a protected
  branch (see Protected branches), create `<type>/<topic>` before the
  first commit and say its name. The name is fixed when the run-mode
  question is asked, so `auto-pr` can check it on the remote. Committing
  to an existing topic branch is fine.

## Protected branches

The one definition other skills point to:

- **Protected:** the repo's default branch, `main`, and `master`. Find
  the default with
  `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`, or
  `git symbolic-ref --short refs/remotes/origin/HEAD` without the
  `origin/`. Other names, such as `dev`, are not protected.
- **Check:** compare `git branch --show-current` with that set.

## What it never authorizes

Push, opening or updating a PR, amend, force, `--no-verify`, reset (except
the undo below), rebase, branch deletion, or anything else outward-facing or
hard to undo. Those still need an explicit request, as in Pause mode. The
exception is push and draft PRs under Auto-PR; see the `auto-pr` skill.

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
- **Check the message.** Confirm it follows the `commit-messages` skill,
  or the repo's explicit convention, and fix it if not. Point to that
  skill; never copy its format here.
- **Run the repo's commitlint** when the repo has a commitlint config
  (`commitlint.config.*`, `.commitlintrc*`, or a `commitlint` key in
  `package.json`) and `node_modules/.bin/commitlint` exists: pipe the
  message to it. Its config wins over the `commit-messages` skill.
  - **Local binary only.** Never run a bare `npx commitlint`: it can
    download and run code.
  - **On failure,** rewrite the message from its errors and rerun once. A
    second failure is a hard gap: stop and ask.
- **Pause mode runs neither** check; it only suggests the message.

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
  from. It drops the run's commits and keeps their changes staged. After
  an Auto-PR push, it no longer reaches them; see the `auto-pr` skill.
- **Defaults chosen** for soft gaps.
- **Blocking question,** if any, with its options and a recommendation.

## Undoing the run

- **"Undo the run"** (or similar) is the explicit request for the soft
  reset.
- **Show, then confirm.** Show `git reset --soft <base>` with the real SHA
  and the commits it drops. Run it only after the user confirms.
- **Never `--hard`.** The changes stay staged. Throwing them away needs its
  own explicit request.
- **Only from the run's last commit.** If anything moved the branch since
  the run (new commits, a push), stop and ask.
- **Pushed commits are out of reach.** `git reset --soft` cannot undo
  commits that Auto-PR already pushed. Stop and ask, as for any moved
  branch.

## Scope

Auto-commit ends when the plan or the requested batch of changes ends. The
next request is back in Pause unless the user chooses Auto-commit again.

## Roadmaps

Auto-commit never crosses sessions. In a roadmap phase it only replaces "stop
and wait" with "commit the phase, write the outcome, then stop". Never plan
or start the next phase; the user starts every session.
