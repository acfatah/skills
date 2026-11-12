---
name: session-recap
description: One-line /recap-style summary, then a full recap of progress, changes since last active, and next step
argument-hint: [short | focus area]
disable-model-invocation: true
allowed-tools: Bash(git status:*), Bash(git log:*), Bash(git fetch:*), Bash(git diff:*), Bash(git rev-parse:*), Bash(git branch:*), Bash(git worktree list:*), Bash(git for-each-ref:*), Bash(test -e *), Bash(bun *issue-tracker/scripts/issues.js list *)
---

# Session Recap v1.3.0

Recap the current work. Arguments: "$ARGUMENTS"

## Arguments

- **Empty:** the recap line, then the full recap.
- **`short`:** the recap line only. Stop there.
- **Anything else:** a focus area, such as `tests` or `auth`. Give the
  recap line, then the full recap limited to that area.

## Read-only

The recap changes nothing.

- **Do not** edit or write files, commit, stage, merge, or rebase.
- **Do not** run tests or builds. Say they were skipped, and name the
  command to run them if one is obvious.
- **Skip** `session-sync`'s offer to write a handoff file. Mention it
  in one line under "Waiting on me" only when the user seems to be
  stopping.

## 1. Recap line

Start with one line in the style of the built-in `/recap`: one sentence
on what we are working toward and where it stands, then "Next step:"
and the single next action. Write it yourself from the conversation and
repo; do not run `/recap` or a nested `claude`.

## 2. Full recap

Check for a repo with `git rev-parse --is-inside-work-tree`.

**Inside a git repo:** load the `session-sync` skill and follow its
recap. Use the "Single session (resume)" steps, or the Sync step if a
sessions file names the current branch, but apply the Read-only rules
above to both: skip the tests and do not update the sessions file.
Its recap includes an Issues line when the `issue-tracker` skill and an
issues database are present. The line only runs `list`; a link it
suggests goes under "Waiting on me", never run.

**Outside a git repo:** recap from the conversation only, in the same
shape: Goal, Done, In progress, Drift, Waiting on me, Next step. Skip
the Issues line. State in one line that git checks were skipped because
this folder is not a repo. Check claims about files with reads where it is cheap.

## Sources

Use the conversation, if any, for the Goal, decisions, and open
questions, but check every claim against the repo. When the two
disagree, trust the repo and list the mismatch under "Drift".

When there is no plan, do not stop or ask for one. Infer the Goal from
the conversation first, then from the branch name, recent commit
messages, and uncommitted changes, and mark it as inferred. If the goal
is still unclear, list it under "Waiting on me".

## Footer

When the recap ends with a References section, put a line of exactly 75
`╌` characters (U+254C) on its own line, with a blank line before it and
the References heading on the very next line, with no blank line between
them. It marks where the recap ends and the footer starts. With no
References section, add no line.
