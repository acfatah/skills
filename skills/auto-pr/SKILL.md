---
name: auto-pr
description: "Opt-in Auto-PR run mode: commit each change as Auto-commit does, then push the branch to its upstream and open or update a draft PR after a clean finish. Load when the user picks Auto-PR in the auto-commit run-mode question, when a plan's run-mode line says Auto-PR, or when the user says \"auto-PR\", \"open a PR when done\", or \"push and open a PR\". Depends on the auto-commit skill for the commit loop."
---

# Auto-PR v1.2.0

## What it adds to Auto-commit

Auto-PR is Auto-commit plus one step at the end. Everything in the
`auto-commit` skill still applies: the question, the baseline, staging by
path, checks before each commit, gaps, and the report. This skill adds only
the push and the draft PR, once, after a run that finishes cleanly. Without
`auto-commit` loaded, load it first; without it installed, Auto-PR is not
available. The push is outward-facing: it can trigger CI, deploys and
webhooks, even for a draft PR.

## Preconditions

Offer Auto-PR only when all of these pass. Otherwise hide the option and
say in one line which check failed.

- **Not the default branch.** The current branch is not the repo's default
  branch (`gh repo view --json defaultBranchRef -q .defaultBranchRef.name`,
  or `git symbolic-ref --short refs/remotes/origin/HEAD`).
- **Has an upstream, or can create one.** One of the two paths below
  passes.
- **`gh` is signed in.** `gh auth status` succeeds.

**Existing upstream.**
`git rev-parse --abbrev-ref --symbolic-full-name @{u}` succeeds, and the
upstream is not the default branch either. A topic branch tracking
`origin/main` fails this check.

- **Fix for an upstream on the default branch.** A branch created from
  `origin/<default>` without `--no-track` tracks it. Offer, in the
  run-mode question, to run `git branch --unset-upstream` first, so the
  branch takes the no-upstream path below. Label it
  `Auto-PR (unsets origin/<default> upstream, creates origin/<branch> at finish)`.
  Run it only when the user picks that option; never unset it silently.

**No upstream.** `@{u}` does not resolve, and all of these pass. The first
push at a clean finish then creates the upstream.

- **`origin` exists** and is the repo `gh` resolves to: the URL from
  `gh repo view --json url -q .url` and `git remote get-url origin` name
  the same host, owner and repo, allowing for SSH and HTTPS forms and a
  trailing `.git`.
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

**Ready PR.** When these checks pass, also run the PR lookup from step 3 of
Finishing a run. If the branch's open PR is ready for review, offer two
Auto-PR options instead of one, so the finish need not ask:

- `Auto-PR (PR #n is ready: push and replace its body)`
- `Auto-PR (PR #n is ready: push, keep its body)`

Keep any upstream wording in both labels.

## Recording the choice

In a plan, write the choice under the title, below any stop line, with the
upstream from `@{u}`:

    > Run mode: Auto-PR (upstream: origin/<branch>). Commit each phase, then push and open or update a draft PR after a clean finish; stop on any gap. See the auto-pr skill.

On the no-upstream path, the line adds a `to create` marker:

    > Run mode: Auto-PR (upstream: origin/<branch>, to create). Commit each phase, then push and open or update a draft PR after a clean finish; stop on any gap. See the auto-pr skill.

For a ready PR, the line also records the answer, e.g.
`(upstream: origin/<branch>; ready PR #n: replace body)` or
`(…; ready PR #n: keep body)`.

- **The upstream is recorded** so a fresh session can check the branch
  before pushing.
- **The ready-PR answer is recorded** so the finish does not ask again.
  It holds only for that PR while it is still ready; if the PR's state
  changed (now a draft, closed, or a different PR), step 3 of Finishing a
  run decides afresh.
- **Drop the marker after the first push.** Once the push that creates the
  upstream succeeds, edit the line to remove `, to create`: in the plan,
  and in the roadmap's Decisions for a roadmap. Later sessions and phases
  then see an ordinary upstream.
- **Without a plan,** the choice lasts for this session only, as in
  Auto-commit. On the no-upstream path, state the upstream to be created
  in chat when the user picks Auto-PR; that statement is the record for
  the re-check. State a ready-PR answer in chat the same way.
- **Never save it to memory, never infer it.** Choosing Auto-PR is the
  explicit request to push and open the PR; nothing else is.

## What it authorizes

Everything Auto-commit authorizes, plus, once per clean finish:

- **Push `HEAD` to its recorded upstream,** with the remote and branch
  taken from `@{u}`: `git push <remote> HEAD:<branch>`.
- **Create the recorded upstream once,** on the no-upstream path only, at
  the first clean finish: `git push -u origin HEAD:<branch>`.
- **Create a draft PR** with `gh pr create --draft`, or **update the open
  PR's body** for the branch with `gh pr edit --body-file`. Edit only an
  open PR from the same repo, as step 3 of Finishing a run finds it.
- **Push to a ready PR, and keep or replace its body,** only with the
  user's answer: at the run-mode question or at the finish.
- **Write or update `drafts/PR_SUMMARY-<task>.md`,** per the PR rules in
  `CLAUDE.md`.

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
  below), requesting reviewers, or adding labels.
- **Deleting the remote branch.**
- **A second PR** for a branch that already has an open one.

A rejected push is an unsafe gap: stop and report it.

## Finishing a run

1. **Clean-finish test.** Every phase or change is committed, checks
   passed, and no hard or unsafe gap is open. A run that stops pushes
   nothing; its commits stay local, as in Auto-commit.
2. **Re-check the upstream.** Run the preconditions again. If `@{u}`
   differs from the upstream in the run-mode line, that is a hard gap:
   stop before pushing. For a `to create` line:
   - **Remote branch still absent and `@{u}` unset:** proceed; step 5
     creates it with `-u`.
   - **`@{u}` now set to exactly `origin/<branch>`** (the user pushed it):
     treat it as an existing upstream and push normally. Drop the marker
     as after a first push.
   - **Remote branch exists but `@{u}` is unset, or `@{u}` points anywhere
     else:** hard gap; stop before pushing.
3. **Find the PR,** before writing anything:
   `gh pr list --head <branch> --state open --json number,url,isDraft,body,isCrossRepository`.
   Drop rows with `isCrossRepository` true: those are fork PRs whose
   branch has the same name.
   - **None:** continue; step 6 creates the PR.
   - **One draft, body unchanged:** continue; step 6 updates it.
   - **One draft, body edited:** ask the question below, in its draft
     variant.
   - **One ready for review:** use the run-mode line's answer if it
     recorded this PR as ready (see Recording the choice); otherwise ask.
   - **Several, or a `gh` error:** unsafe gap; stop with nothing pushed.
4. **Write the PR body.** Make sure `drafts/` is ignored first (see
   `CLAUDE.md`), then write or update `drafts/PR_SUMMARY-<task>.md`: a
   title and a description covering every commit of the branch, ending
   with the PR attribution line. On **Push, keep the body**, still write
   the file, but do not send it in step 6.
5. **Push** `HEAD` to the upstream, unless the answer was **Don't push**.
   On a `to create` line, run `git push -u origin HEAD:<branch>`, then
   drop the marker.
6. **Open or update:**
   - **No PR:**
     `gh pr create --draft --title "<title>" --body-file drafts/PR_SUMMARY-<task>.md`.
   - **Body to replace:**
     `gh pr edit <n> --body-file drafts/PR_SUMMARY-<task>.md`.
   - **Push, keep the body:** leave the PR as it is.

   A failure here is an unsafe gap, since the push already happened:
   stop and report **Pushed, no PR** or **Pushed, PR not updated**, with
   the `gh` error. Never retry `gh pr create` without `--draft`.

**Body unchanged** means the PR's body equals the content
`drafts/PR_SUMMARY-<task>.md` had before step 4 rewrote it, after
normalizing CRLF to LF and stripping trailing whitespace. A missing file
counts as edited: there is nothing to compare against.

**The question.** Ask it before the push, because the push alone notifies
a ready PR's reviewers:

- **Ready PR:** "PR #n is ready for review. Pushing will notify its
  reviewers. What should I do?"
- **Draft PR, body edited:** "PR #n's body was edited on GitHub since the
  last summary. What should I do?"

Options, in this order:

- **Push and replace the body:** push, then `gh pr edit --body-file`.
- **Push, keep the body:** push, and leave the PR's body as it is.
- **Don't push** (default, also when the question is dismissed): push
  nothing; the commits stay local.

At most one question at the finish, and only for a ready PR or an edited
body. The draft PR is the safety valve only while the PR is a draft:
nothing is merged or sent for review until the user does it.

## Stop or finish report

Report everything Auto-commit reports, plus:

- **PR:** its URL, whether it was opened, updated, or pushed with its
  body kept, and `created origin/<branch>` when this push created the
  upstream.
- **Nothing pushed (user chose),** when the answer was **Don't push**.
- **Pushed, no PR** or **Pushed, PR not updated,** when step 6 failed
  after the push, with the `gh` error.
- **Undo:** close the PR with `gh pr close <n>`. Pushed commits stay
  pushed; `git reset --soft <base>` does not undo them, and rewriting the
  remote needs its own explicit request. A created remote branch stays
  too; deleting it (`git push origin --delete <branch>`) needs its own
  explicit request.
- **Nothing pushed,** when the run stopped, with the reason.

## Roadmaps

- **One PR per roadmap.** The roadmap keeps one topic branch for all
  phases. The first phase that finishes cleanly pushes and opens the
  draft PR. Later phases push and update `PR_SUMMARY-<roadmap>.md` and
  the PR body.
- **Exception:** a roadmap that says its phases merge on their own may use
  one branch and one PR per phase.
- **Each session still stops.** Finishing phase N under Auto-PR: commit,
  write the outcome, push and open or update the PR, then stop. Never plan
  or start the next phase.
