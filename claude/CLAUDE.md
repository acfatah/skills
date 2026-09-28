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

These rules apply to the plan-mode plan file, and to any `PLAN*.md` / `TODO.md`
you are executing against. Do not commit them unless asked.

### Plan file location

Never move or copy the plan-mode plan file. It stays at
`~/.claude/plans/<slug>.md`, which is the only path Claude Code knows; move
it and a later turn reports that no plan exists and offers to write a new
one. Instead, once a plan is approved, symlink it into the repository,
worktree, or sub-repo that the plan targets, under a name that means
something:

    mkdir -p <target>/.claude/plans
    ln -sfn ~/.claude/plans/<slug>.md \
      <target>/.claude/plans/PLAN_IN_PROGRESS-<topic>.md

- Choose the target by which files the plan edits. A plan spanning several
  repos, or touching only workspace-level tooling, belongs at the workspace
  root instead.
- `<topic>` is the plan's subject in snake_case. The generated `<slug>` is
  random words (`atomic-toasting-oasis`) and carries no meaning, so do not
  transliterate it.
- `ln -sfn`, not `ln -sf`. Without `-n`, a rerun against an existing link
  that resolves to a directory nests a second link inside it.
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

When a plan starts, rename it to mark it in progress: `PLAN-*.md` 
becomes `PLAN_IN_PROGRESS-*.md`, and a bare `PLAN.md` becomes 
`PLAN_IN_PROGRESS.md`. Keep the rest of the name unchanged.

    PLAN-loader_rewrite.md  ->  PLAN_IN_PROGRESS-loader_rewrite.md
    PLAN.md                 ->  PLAN_IN_PROGRESS.md

Use `git mv` if the file is tracked, else plain `mv`. Plans are usually
untracked (see above), and `git mv` fails on untracked files.

The plan-mode plan file needs no rename at start: its symlink is created
already carrying the `PLAN_IN_PROGRESS-` prefix.

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

### Completing a plan

When every step in a plan file is finished and verified, rename it to mark it
complete: `PLAN_IN_PROGRESS-*.md` becomes `PLAN_COMPLETED-*.md`, and a bare
`PLAN_IN_PROGRESS.md` becomes `PLAN_COMPLETED.md`. Keep the rest of the name
unchanged.

    PLAN_IN_PROGRESS-loader_rewrite.md  ->  PLAN_COMPLETED-loader_rewrite.md
    PLAN_IN_PROGRESS.md                 ->  PLAN_COMPLETED.md

- Rename only after the last step has its completion stamp; a plan with any
  unstamped heading is not done.
- `TODO.md` is never renamed; it keeps its name whatever its state.
- For the plan-mode plan file, rename the symlink and leave its target
  alone. `git mv` does not apply there, the link is untracked.
- Use `git mv` if the file is tracked, so history follows it; else plain `mv`.
- Update any references to the old filename in other documents.

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
- Rename the plan to `PLAN_COMPLETED` only when every phase is stamped.

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

Always suggest a comprehensive commit message after every change set, so the
user can decide whether to commit or continue working.

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


