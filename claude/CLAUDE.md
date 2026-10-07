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

This governs chat replies. Documents (PR descriptions, plans, docs) keep
the same scannable shape but are as complete as their purpose needs.

Keep chat output lines under about 80 characters: break long prose
lines, and indent continuation lines to match. Never break code blocks,
commands, tables, URLs, or file paths; let those run long so they
copy-paste correctly.

`drafts/` holds deliverables the user reads, such as PR summaries.
Temporary working files go in the harness scratchpad. Existing
`.scratch/` folders stay as they are. If the repo already tracks a
`drafts/` directory, ask before using it.

Before writing to `drafts/` in a git repo, make sure it is ignored: unless
`git check-ignore -q drafts/` succeeds, append `drafts/` to
`git rev-parse --git-path info/exclude`, not the tracked `.gitignore`.

## Plan documents

Before writing, executing, stamping, or moving any plan (plan-mode
file, `.claude/plans/*.md`, `PLAN*.md`, `TODO.md`), load the
`plans-and-roadmaps` skill. Two rules hold even without it: keep the
plan-mode file in `~/.claude/plans/`, and commit plans only when
asked.

## Line width

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
- Exception: PR and issue text (e.g. `PR_SUMMARY-*.md`) is not
  hard-wrapped; GitHub renders single newlines as line breaks.

## Pull Request

When asked to suggest a PR, write the suggestion to
`drafts/PR_SUMMARY-<task>.md`. It should include a PR title and a
comprehensive PR description, ending with the PR attribution line the
harness specifies, unless the user or the repo says otherwise. The file
should be untracked.

## Writing Commit

Never run `git commit` unless the user explicitly asks. The user reviews
changes first. Plan approval, "proceed", "go ahead", or bypass-permissions
mode are not requests to commit.

Always suggest a comprehensive commit message once a logical change to
files in a git repository is finished, so the user can decide whether to
commit or continue working. On later turns, re-post it only when the
earlier suggestion is out of date. Skip it when nothing committable
changed: files outside any repo, or only ignored files such as `drafts/`.

- Put the rationale in the commit message, not in long multiline inline
  comments above the changed code.
- Subject line imperative, ≤ 72 chars; body wrapped at 72, explaining what
  changed and why.
- Put the suggestion in a fenced block, so it can be copied verbatim.
- When executing a plan, also write the final message into that plan (see
  the `plans-and-roadmaps` skill). For the plan-mode file, edit
  `~/.claude/plans/<slug>.md`, not the symlink.
- End every suggested message with the commit attribution trailer the
  harness specifies (e.g. `Co-Authored-By: Claude …`), including messages
  written into plans, unless the user or the repo says otherwise.
