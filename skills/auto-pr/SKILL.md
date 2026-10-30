---
name: auto-pr
description: "Opt-in Auto-PR run mode: commit each change as Auto-commit does, then push the branch to its upstream and open or update a draft PR after a clean finish. Also covers a one-off request to push and open a PR for finished work. Load when the user picks Auto-PR in the auto-commit run-mode question, when a plan's run-mode line says Auto-PR, or when the user says \"auto-PR\", \"open a PR when done\", \"open a PR\", \"create a PR\", or \"push and open a PR\". Depends on the auto-commit skill for the commit loop."
---

# Auto-PR v1.7.0

## What it adds to Auto-commit

Auto-PR is Auto-commit plus one step at the end. Everything in the
`auto-commit` skill still applies: the question, the baseline, staging by
path, checks before each commit, gaps, and the report. This skill adds only
the push and the draft PR, once, after a run that finishes cleanly. Without
`auto-commit` loaded, load it first; without it installed, Auto-PR is not
available. The push is outward-facing: it can trigger CI, deploys and
webhooks, even for a draft PR.

There is no push-only mode: every clean finish opens or updates a PR, or
asks first (step 3 of Finishing a run). To push without a PR, use
Auto-commit and push by hand.

A one-off "open a PR" request outside a run follows Opening a PR on
request instead; it does not need `auto-commit`.

## Preconditions

Offer Auto-PR only when all of these pass. Otherwise hide the option and
say in one line which check failed.

- **Has an upstream, or can create one.** One of the two paths below
  passes. On a protected branch, see On a protected branch below.
- **The remote is `gh`'s repo.** The upstream's remote (from `@{u}`, or
  `origin` when there is none) names the same host, owner and repo as
  `gh repo view --json url -q .url`. Compare `git remote get-url <remote>`
  with it, allowing for SSH and HTTPS forms and a trailing `.git`. Fork
  setups, where the branch lives on a fork but `gh` resolves the parent,
  fail this check; the one-line reason says so.
- **The base exists.** The base (see Recording the choice) is on `origin`:
  `git ls-remote --exit-code --heads origin <base>` finds it, and it is
  not the branch the run commits to.
- **`gh` is signed in.** `gh auth status` succeeds.

**Existing upstream.**
`git rev-parse --abbrev-ref --symbolic-full-name @{u}` succeeds, and the
upstream is not a protected branch (see the `auto-commit` skill's
Protected branches). A topic branch tracking `origin/main` fails this
check.

- **Fix for an upstream on a protected branch.** A branch created from
  `origin/<protected>` without `--no-track` tracks it. Offer, in the
  run-mode question, to run `git branch --unset-upstream` first, so the
  branch takes the no-upstream path below. Label it
  `Auto-PR (unsets origin/<protected> upstream, creates origin/<branch> at finish)`.
  Run it only when the user picks that option; never unset it silently.

**No upstream.** `@{u}` does not resolve, and all of these pass. The first
push at a clean finish then creates the upstream.

- **`origin` exists.** The repo check above compares it with `gh`'s repo.
- **The name is free on the remote:**
  `git ls-remote --exit-code --heads origin <branch>` finds nothing (exit
  code 2).
- **The target name is the local branch name.** Never rename it.

On this path, the option label says what happens:
`Auto-PR (creates origin/<branch> at finish)`. A fresh
`git worktree add -b <branch>` branch has no upstream, so it takes this
path. So does a `worktree-<name>` branch from the built-in
`EnterWorktree name=`, which branches from `origin/<default>` without
tracking it.

**On a protected branch.** Offer Auto-PR instead of hiding it: the run
never commits there, so it always lands on a fresh topic branch with no
upstream. Check the no-upstream path against that branch, not the
current one:

- **Which branch:** the worktree branch, when the same prompt offers a
  worktree, else the `<type>/<topic>` name that `auto-commit` fixes for
  its branch-off. One option covers both answers, since the worktree and
  run-mode questions are answered at once, so check that each name the
  answers could produce is free on the remote.
- **The set:** the `auto-commit` skill's Protected branches.
- **Label:** `Auto-PR (branches off <b>, creates origin/<branch> at finish)`,
  with `<b>` the current branch and `<branch>` the one the run commits
  to. If the user picks the worktree, the worktree branch is the one
  recorded and pushed.

**Ready PR.** When these checks pass, also run the PR lookup from step 3 of
Finishing a run. If the branch's open PR is ready for review, offer two
Auto-PR options instead of one, so the finish need not ask:

- `Auto-PR (PR #n is ready: push and replace title and body)`
- `Auto-PR (PR #n is ready: push, keep title and body)`

Keep any upstream wording in both labels.

## Recording the choice

In a plan, write the choice under the title, below any stop line. It
records three things, in this order: the upstream from `@{u}`, the PR
base, and the summary file.

    > Run mode: Auto-PR (upstream: origin/<branch>; base: <base>; summary: drafts/PR_SUMMARY-<task>.md). Commit each phase, then push and open or update a draft PR after a clean finish; stop on any gap. See the auto-pr skill.

On the no-upstream path, the upstream adds a `to create` marker:

    > Run mode: Auto-PR (upstream: origin/<branch>, to create; base: <base>; summary: drafts/PR_SUMMARY-<task>.md). Commit each phase, then push and open or update a draft PR after a clean finish; stop on any gap. See the auto-pr skill.

For a ready PR, the line also records the answer, after the summary, e.g.
`(upstream: origin/<branch>; base: main; summary: drafts/PR_SUMMARY-<task>.md; ready PR #n: replace)`
or `(…; ready PR #n: keep)`.

- **The upstream is recorded** so a fresh session can check the branch
  before pushing.
- **`base`** is the repo's default branch, unless the user or the plan
  names another. Claude never guesses a stacked base. It must pass the
  base check in Preconditions.
- **`summary`** names the PR summary file, so a fresh session updates the
  same one. `<task>` is the plan's topic: the name of its
  `.claude/plans/<topic>.md` link. A roadmap uses its `<topic>`, as in
  Roadmaps. Without a plan, Claude picks a snake_case topic.
- **The ready-PR answer is recorded** so the finish does not ask again.
  It holds only for that PR while it is still ready; if the PR's state
  changed (now a draft, closed, or a different PR), step 3 of Finishing a
  run decides afresh.
- **Drop the marker after the first push.** Once the push that creates the
  upstream succeeds, edit the line to remove `, to create`: in the plan,
  and in the roadmap's Decisions for a roadmap. Later sessions and phases
  then see an ordinary upstream.
- **Without a plan,** the choice lasts for this session only, as in
  Auto-commit. When the user picks Auto-PR, state in chat the upstream
  (existing, or to create), the base and the summary file, on every path.
  That statement is the record for the re-check and for step 4. State a
  ready-PR answer in chat the same way.
- **Never save it to memory, never infer it.** Choosing Auto-PR is the
  explicit request to push and open the PR; nothing else is.

## What it authorizes

Everything Auto-commit authorizes, plus, once per clean finish:

- **Push `HEAD` to its recorded upstream,** with the remote and branch
  taken from `@{u}`: `git push <remote> HEAD:<branch>`.
- **Create the recorded upstream once,** on the no-upstream path only, at
  the first clean finish: `git push -u origin HEAD:<branch>`.
- **Create a draft PR** against the recorded base with
  `gh pr create --draft --base <base>`, or **update the open PR's title
  and body** for the branch with `gh pr edit --title --body-file`. Edit
  only an open PR from the same repo, as step 3 of Finishing a run finds
  it.
- **Push to a ready PR, and keep or replace its title and body,** only
  with the user's answer: at the run-mode question or at the finish.
- **Write or update the recorded summary file,** per the `pr-summary`
  skill.

## What it never authorizes

- **Force:** `--force`, `--force-with-lease`, or any rewrite of pushed
  history.
- **Skipping hooks:** `--no-verify`.
- **Other branches:** pushing anything but `HEAD`, or to anything but the
  recorded upstream.
- **Other new remote branches:** creating any remote branch but the
  recorded one, pushing to a name that already exists on the remote but
  is not the tracked upstream, or creating one on a remote other than
  `origin`.
- **PR state changes:** marking ready, merging, closing (except the undo
  below), requesting reviewers, adding labels, or changing the base.
- **Deleting the remote branch.**
- **A second PR** for a branch that already has an open one.

A rejected push is an unsafe gap: stop and report it.

## Finishing a run

1. **Clean-finish test.** Every phase or change is committed, checks
   passed, and no hard or unsafe gap is open. A run that stops pushes
   nothing; its commits stay local, as in Auto-commit.
2. **Re-check the upstream.** Run the preconditions again. If `@{u}`
   differs from the recorded upstream, from the run-mode line, or the chat
   statement without a plan, that is a hard gap: stop before pushing. For
   a `to create` record:
   - **Remote branch still absent and `@{u}` unset:** proceed; step 5
     creates it with `-u`.
   - **`@{u}` now set to exactly `origin/<branch>`** (the user pushed it):
     treat it as an existing upstream and push normally. Drop the marker
     as after a first push.
   - **Remote branch exists but `@{u}` is unset, or `@{u}` points anywhere
     else:** hard gap; stop before pushing.
3. **Find the PR,** before writing anything:
   `gh pr list --head <branch> --state open --json number,url,isDraft,title,body,baseRefName,isCrossRepository`.
   Drop rows with `isCrossRepository` true: those are fork PRs whose
   branch has the same name.
   - **None:** continue; step 6 creates the PR.
   - **One draft, PR unchanged:** continue; step 6 updates it.
   - **One draft, PR edited:** ask the question below, in its draft
     variant.
   - **One ready for review:** use the run-mode line's answer if it
     recorded this PR as ready (see Recording the choice); otherwise ask.
   - **Several, or a `gh` error:** unsafe gap; stop with nothing pushed.

   **Base mismatch:** if the open PR's `baseRefName` differs from the
   recorded base, never change it; go on, and note it in the report.
4. **Write the PR summary.** Load the `pr-summary` skill and write or
   update the recorded summary file with it; never pick a new name. It
   holds an H1 title and a description covering every commit of the
   branch, ending with the PR attribution line. On **Push, keep title and
   body**, still write the file, but do not send it in step 6.
5. **Push** `HEAD` to the upstream, unless the answer was **Don't push**.
   On a `to create` line, run `git push -u origin HEAD:<branch>`, then
   drop the marker.
6. **Open or update:**
   - **No PR:**
     `gh pr create --draft --base <base> --title "<title>" --body-file drafts/PR_SUMMARY-<task>.md`.
   - **Title and body to replace:**
     `gh pr edit <n> --title "<title>" --body-file drafts/PR_SUMMARY-<task>.md`.
   - **Push, keep title and body:** leave the PR as it is.

   A failure here is an unsafe gap, since the push already happened:
   stop and report **Pushed, no PR** or **Pushed, PR not updated**, with
   the `gh` error. Never retry `gh pr create` without `--draft`.

**PR unchanged** means the summary file, as it was before step 4
rewrote it, matches the PR on both counts: its H1 text equals the PR's
title, and its content equals the PR's body. Compare after normalizing
CRLF to LF and stripping trailing whitespace. A missing file counts as
edited: there is nothing to compare against.

**The question.** Ask it before the push, because the push alone notifies
a ready PR's reviewers:

- **Ready PR:** "PR #n is ready for review. Pushing will notify its
  reviewers. What should I do?"
- **Draft PR, edited:** "PR #n's title or body was edited on GitHub
  since the last summary. What should I do?"

Options, in this order:

- **Push and replace title and body:** push, then
  `gh pr edit --title --body-file`.
- **Push, keep title and body:** push, and leave the PR's title and body
  as they are.
- **Don't push** (default, also when the question is dismissed): push
  nothing; the commits stay local.

At most one question at the finish, and only for a ready PR or an edited
title or body. The draft PR is the safety valve only while the PR is a draft:
nothing is merged or sent for review until the user does it.

## Opening a PR on request

- **Trigger:** an explicit user request to open, or push and open, a PR
  for the current branch, outside an Auto-PR run. The request authorizes
  this one push and PR only. It does not start Auto-PR or Auto-commit, and
  is never saved or inferred.
- **Preconditions:** run the Preconditions section. On a failure, say
  which check failed and stop, with nothing pushed. For an upstream on a
  protected branch, ask before `git branch --unset-upstream`, as there.
- **On a protected branch,** stop: no run branches off, so On a protected
  branch does not apply. Suggest a topic branch first.
- **Uncommitted changes:** if `git status --short` shows any, say so in
  one line. Never commit them; a commit needs its own request. Ask whether
  to go on with the committed work only.
- **Base:** the default branch, unless the user names another.
- **Summary file:** reuse an existing `drafts/PR_SUMMARY-<task>.md` for
  this branch's work, else pick a snake_case topic, as Recording the
  choice says.
- **Steps:** follow Finishing a run, steps 3 to 6, with the request in
  place of the recorded run-mode line: find the PR, write the summary with
  `pr-summary`, push (`-u` on the no-upstream path), then create or edit.
  The ready-PR and edited-draft question applies unchanged.
- **Draft or ready:** `--draft`, unless the request explicitly asks for a
  ready PR ("open a ready PR", "not a draft"). Never run `gh pr ready` on
  an existing PR.
- **Never:** everything in What it never authorizes still applies: no
  force, no skipped hooks, no second PR, no other branches.
- **Report:** the PR lines of Stop or finish report.

## Stop or finish report

Report everything Auto-commit reports, plus:

- **PR:** its URL, whether it was opened, updated, or pushed with its
  title and body kept, and `created origin/<branch>` when this push
  created the upstream.
- **Base mismatch,** when the open PR's base differs from the recorded
  base: both names. The base was left as it is.
- **Nothing pushed (user chose),** when the answer was **Don't push**.
- **Pushed, no PR** or **Pushed, PR not updated,** when step 6 failed
  after the push, with the `gh` error.
- **Undo:** close the PR with `gh pr close <n>`. Pushed commits stay
  pushed; `git reset --soft <base>` does not undo them, and rewriting the
  remote needs its own explicit request. A created remote branch stays
  too; deleting it (`git push origin --delete <branch>`) needs its own
  explicit request.
- **Nothing pushed,** when the run stopped, with the reason.
- **Next step,** after a PR was opened or updated: once reviews arrive,
  the `handle-pr-comments` skill works through the review comments.

## Roadmaps

- **One PR per roadmap.** The roadmap keeps one topic branch for all
  phases. The first phase that finishes cleanly pushes and opens the
  draft PR. Later phases push and update `PR_SUMMARY-<roadmap>.md` and
  the PR's title and body.
- **Exception:** a roadmap that says its phases merge on their own may use
  one branch and one PR per phase.
- **Each session still stops.** Finishing phase N under Auto-PR: commit,
  write the outcome, push and open or update the PR, then stop. Never plan
  or start the next phase.
