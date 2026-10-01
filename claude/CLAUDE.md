## Response & Output Style

Write every response as if the reader has ADHD, whoever they are; long
paragraphs are hard to follow. Optimize for scanning, not just brevity:

- Bottom line first: answer or result in the first line or two.
- Short chunks: paragraphs of 1–3 sentences; prefer bullets and
  headings over prose.
- Bold the key word or action in a bullet, so skimming works.
- Plain, complete sentences. No cryptic shorthand or dropped words
  that make me decode.
- Cut filler, recaps, and restating my question.
- Add tips/gotchas only when non-obvious and relevant, in their own
  short section at the end.

Keep chat output lines under about 80 characters: break long prose
lines, and indent continuation lines to match. Never break code blocks,
commands, tables, URLs, or file paths; let those run long so they
copy-paste correctly.

Before writing to `.scratch/` in a git repo, make sure it is ignored: unless
`git check-ignore -q .scratch/` succeeds, append `.scratch/` to
`git rev-parse --git-path info/exclude`, not the tracked `.gitignore`.

## Plan documents

These rules apply to the plan-mode plan file, any `.md` under a
`.claude/plans/` directory, and any `PLAN*.md` or `TODO.md` you are executing
against. Do not commit them unless asked.

### Plan file location

Never move or copy the plan-mode plan file. It stays at
`~/.claude/plans/<slug>.md`, which is the only path Claude Code knows; move
it and a later turn reports that no plan exists and offers to write a new
one. Instead, once a plan is approved, symlink it into the repository,
worktree, or sub-repo that the plan targets, under a name that means
something:

    mkdir -p <target>/.claude/plans
    ln -sfn ~/.claude/plans/<slug>.md \
      <target>/.claude/plans/<topic>.md

- Choose the target by which files the plan edits. A plan spanning several
  repos, or touching only workspace-level tooling, belongs at the workspace
  root instead.
- `<topic>` is the plan's subject in snake_case. The generated `<slug>` is
  random words (`atomic-toasting-oasis`) and carries no meaning, so do not
  transliterate it.
- `ln -sfn`, not `ln -sf`. Without `-n`, a rerun against an existing link
  that resolves to a directory nests a second link inside it.
- The link target must be absolute; the unquoted `~` form expands to one. A
  relative target breaks as soon as the link moves into a state directory
  (see Plan states below).
- The link is read-only by construction. Read, `cat`, and `grep` follow it,
  but Write and Edit refuse with `Refusing to write through symlink`. Always
  edit `~/.claude/plans/<slug>.md` and let the link show the change. Do not
  try to defeat this with a hard link: the first write replaces the inode
  and the two paths silently diverge.
- Git-ignore `.claude/plans/` by default; the symlinks inside are local
  pointers and never belong in a commit. Unless `git check-ignore -q
  <target>/.claude/plans/` already succeeds, append `.claude/plans/` to
  `git rev-parse --git-path info/exclude`, not the tracked `.gitignore`, so
  `git add -A` cannot sweep it into a commit. Use that command rather than a
  literal `.git/info/exclude` path: in a linked worktree `.git` is a file,
  and `info/exclude` is shared with the main checkout. Track it only when
  asked.
- Nothing travels with the branch. A reviewer, CI, or a fresh clone sees
  nothing. When a plan must outlive its worktree, copy the finished file
  out deliberately at that point; that copy is a record, not the plan.
- A project `CLAUDE.md` may pin the exact destination directory. Where one
  does, it wins over this section.

### Progress marking

A plan's name never encodes its state; the directory it sits in does. An
active plan sits at the top level of its directory, so starting a plan moves
and renames nothing.

When a step is finished *and verified*, edit the plan document and append a
completion stamp to that step's heading:

    ## ✅ Step 3. Wire up the loader (2026-07-28 09:47)

- Get the timestamp by running `date '+%Y-%m-%d %H:%M'`. Never write a time
  from memory — you have no clock, only today's date.
- Stamp on completion, not on start. Do not add ⏳ / 🚧 / in-progress markers;
  an unstamped heading already means "not done".
- One `date` call can stamp several steps finished in the same batch.
- For checklist items, use `- [x] ✅ Item (2026-07-28 09:47)`, matching the
  heading format.
- Never back-date a step you did not just finish. If a step was already done
  before this session, leave it alone.

### Plan states

State directories are siblings of the plan, inside the directory it
currently sits in: `.claude/plans/completed/`, `docs/completed/`, or
`./completed/` for a plan at the repository root.

| Directory | Meaning | When to move |
|---|---|---|
| top level | active | default; move back here on resume |
| `completed/` | every step stamped and verified | after the last completion stamp |
| `paused/` | started, deliberately on hold | when the user shelves it for now |
| `superseded/` | replaced by a newer plan | when the replacement is written |
| `archived/` | abandoned or obsolete, not replaced | when the user drops it |

    mkdir -p <dir>/completed && mv <dir>/<topic>.md <dir>/completed/

- **Keep the filename.** Use `git mv` if the file is tracked, so history
  follows it; else plain `mv`. Plans are usually untracked, and `git mv`
  fails on untracked files.
- **Move the symlink, never its target.** The plan-mode file stays in
  `~/.claude/plans/`. With an absolute target the moved link stays valid;
  check with `test -e`.
- **Completed means stamped.** Move to `completed/` only after the last step
  has its completion stamp; a plan with any unstamped heading is not done.
- **The user decides** `paused/`, `superseded/` and `archived/`. Move there
  only when asked.
- **Add a reason line** under the title when moving to `paused/`,
  `superseded/` or `archived/`, with the time from `date`:
  `> Paused 2026-09-30 14:02: waiting on the API key`. For `superseded/`,
  name the replacement's path, and link back from the new plan. Edit the
  real file, not the symlink.
- **Resume** a paused plan by moving it back to the top level. Nothing else
  changes.
- **Name collision:** if the destination already holds that name (common for
  a bare `PLAN.md`), append today's date: `PLAN-2026-09-30.md`.
- `TODO.md` never moves, whatever its state.
- Update any references to the old path in other documents.
- **Legacy names:** an untracked `PLAN_IN_PROGRESS-<topic>.md` or
  `PLAN_COMPLETED-<topic>.md` is migrated when found: strip the prefix, and
  move a completed one into `completed/` (bare `PLAN_COMPLETED.md` becomes
  `completed/PLAN.md`). Leave tracked ones alone.

### Line width

Hard-wrap new markdown documents at 80 columns. In an existing file, follow
that file's current style (e.g. one sentence per line, or no wrapping); a
repo's own convention or formatter config wins over this section.

- Wrap prose at the last word boundary at or before column 80.
- Do **not** wrap, even when over-width: fenced code blocks, table rows, URLs,
  and file paths. Let those overrun rather than breaking them.
- Never wrap YAML frontmatter, or files that need one entry per line, such as
  the memory index `MEMORY.md`.
- Indent continuation lines of a list item to the item's text column.
- Re-wrap the surrounding paragraph when an edit changes its length, but only
  in files that are already hard-wrapped.

### Commit message in plans

Every plan ends with a suggested commit message, either as a final
`## Commit message` section or inside the last step. Use a fenced block so it
can be copied verbatim.

- Draft it when writing the plan, from the intended changes.
- After execution, revise it to match what actually changed (check
  `git diff --stat`); a plan-time draft often drifts from the real diff.
- The message is a suggestion, not an instruction to commit. See Writing
  Commit below.

### Phased plans

A plan with phases gets one commit per phase:

    ## Phase 1. Extract loader interface
    ### ✅ Step 1.1 Add Loader type (2026-09-26 10:02)
    ### Step 1.2 Route callers through it
    ### Phase 1 commit message

- Headings: `## Phase N`, with `### Step N.M` under it. Stamp each step on
  completion. Stamp the phase heading only when all its steps are stamped.
- Each phase ends with its own `### Phase N commit message`. That replaces
  the single message at the end of the plan.
- Stop at every phase boundary. Show the phase's commit message and wait.
  Do not start the next phase until the user says so.
- Move the plan to `completed/` only when every phase is stamped.

Handle these cases:

- **Earlier phase left uncommitted.** When the plan starts, record the
  output of `git status --short` in the plan as its baseline. Before starting
  a phase, run it again. If it shows changes beyond the baseline, the
  previous phase was not committed. Stop and ask the user to either commit it
  now, or continue and combine the two phases. To combine, merge the
  messages into the later phase's section, with a body that lists both
  phases, and mark the earlier section `(merged into Phase N)`. The extra
  changes may instead be the user's unrelated edits, so ask; never assume
  which it is.
- **Phase too small for its own commit.** Mark the heading
  `(no separate commit)` when writing the plan, and omit its message
  section. The next phase's message covers both, and its body names each
  one. Do not stop at that phase's boundary.
- **Squash merge.** Only when the user asks, or the repository squash-merges
  its PRs, add a final `## Squash commit message` built from the phase
  messages. Otherwise leave it out.
- **Plan changes mid-way.** Never renumber phases or steps, because stamps
  and conversation refer to the numbers. Insert a new phase as `Phase 2a`.
  Keep a dropped phase and strike it through:
  `## ~~Phase 3. ...~~ (dropped: <reason>)`.

## Pull Request

When asked to suggest a PR, write the suggestion to
`.scratch/PR_SUMMARY-<task>.md`. It should include a PR title and a
comprehensive PR description, ending with the PR attribution line the
harness specifies, unless the user or the repo says otherwise. The file
should be untracked.

## Writing Commit

Never run `git commit` unless the user explicitly asks. The user reviews
changes first. Plan approval, "proceed", "go ahead", or bypass-permissions
mode are not requests to commit.

Always suggest a comprehensive commit message after every change set to
files in a git repository, so the user can decide whether to commit or
continue working. Skip it when nothing committable changed: files outside
any repo, or only ignored files such as `.scratch/`.

- Put the rationale in the commit message, not in long multiline inline
  comments above the changed code.
- Subject line imperative, ≤ 72 chars; body wrapped at 72, explaining what
  changed and why.
- Put the suggestion in a fenced block, so it can be copied verbatim.
- When executing a plan, also write the final message into that plan (see
  Commit message in plans above). For the plan-mode file, edit
  `~/.claude/plans/<slug>.md`, not the symlink.
- End every suggested message with the commit attribution trailer the
  harness specifies (e.g. `Co-Authored-By: Claude …`), including messages
  written into plans, unless the user or the repo says otherwise.


