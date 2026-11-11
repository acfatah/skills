# session-recap

An [agent skill](https://skills.sh) that recaps the current work on demand.
Run `/session-recap` and Claude prints a one-line summary in the style of
the built-in `/recap`, then a full recap: Goal, Done, In progress, Drift,
Waiting on me, Next step. It is read-only, and inside a git repo it checks
its claims against the repo through the `session-sync` recap.

## What it is

- **Starts with a recap line:** one sentence on what you are working toward
  and where it stands, then "Next step:" and the single next action. Claude
  writes it itself; it never runs `/recap` or a nested `claude`.
- **Then a full recap** in a fixed shape: Goal, Done, In progress, Drift,
  Waiting on me, Next step.
- **Read-only.** It never edits or writes files, commits, stages, merges,
  or rebases.
- **Inside a git repo,** it loads [`session-sync`](../session-sync) and
  follows its recap: the "Single session (resume)" steps, or the Sync step
  when a sessions file names the current branch. It skips the tests and
  never updates the sessions file.
- **Names the session's issues** on an Issues line, when the
  [`issue-tracker`](../issue-tracker) skill and an issues database are
  present. It only runs the tracker's `list`; a link it suggests goes under
  "Waiting on me".
- **Outside a git repo,** it recaps from the conversation only, in the same
  shape, without the Issues line, and says in one line that git checks
  were skipped. It checks
  claims about files with reads where that is cheap.
- **Trusts the repo over the conversation.** It uses the conversation for
  the Goal, decisions and open questions, but checks every claim against
  the repo, and lists any mismatch under "Drift".
- **Works without a plan.** It infers the Goal from the conversation, then
  from the branch name, recent commit messages and uncommitted changes,
  and marks it as inferred. If the goal is still unclear, it goes under
  "Waiting on me".
- **Separates the footer:** when the recap ends with a References section,
  a 75-character `─` line sits above it.

## What it is not

- **Not a way to sync sessions.** Forks, the sessions file and merging back
  belong to [`session-sync`](../session-sync).
- **Not a handoff writer.** It skips `session-sync`'s offer to write a
  handoff file, and only mentions it under "Waiting on me" when you seem
  to be stopping.
- **Not a test or build runner.** It says tests and builds were skipped,
  and names the command to run them when one is obvious.

## When not to use

- **Several sessions on one branch, or a fork to merge back** → use
  [`session-sync`](../session-sync), which also writes the sessions file.
- **You want the handoff file written** → ask `session-sync`; this skill
  only mentions it.
- **You need to know whether the tests pass** → run them; the recap skips
  them on purpose.

**Negative example:** "Sync with the other sessions" does not use this
skill; it needs `session-sync`, which updates the sessions file this skill
never writes.

## Install

```bash
bunx skills add acfatah/skills -s session-recap -a claude-code -g -y
```

For local development, link the folder instead:

```bash
ln -sfn "$PWD/skills/session-recap" ~/.claude/skills/session-recap
```

Inside a git repo, the full recap also needs
[`session-sync`](../session-sync) installed. The Issues line also needs
[`issue-tracker`](../issue-tracker); without it, the line is skipped.

## Usage

### How it loads

- **By name only.** Model invocation is disabled, so Claude never loads it
  from a description match. Type `/session-recap`, with an optional
  argument.
- **Arguments:** empty for the recap line and the full recap, `short` for
  the recap line only, or anything else as a focus area, such as `tests`
  or `auth`.
- **What Claude asks back:** nothing. When there is no plan, it does not
  stop or ask for one.

### Example prompts

- **Full recap:** `/session-recap`
- **Quick check:** `/session-recap short`
- **Focus on one area:** `/session-recap tests` / `/session-recap auth`
- **Back from a break:** `/session-recap` in the resumed session, before
  asking for the next change.

Gotchas:

- **The full recap needs `session-sync` inside a git repo.** The skill
  loads it and follows its recap steps, so install both.
- **Tests and builds are skipped on purpose.** "Done" reflects the repo
  and the conversation, not a test run; run the named command yourself.
- **A focus area limits only the full recap.** The recap line comes first
  as usual.
- **Only some commands are pre-approved,** the ones in `allowed-tools`:
  the git commands `status`, `log`, `fetch`, `diff`, `rev-parse`,
  `branch`, `worktree list` and `for-each-ref`, plus `test -e` and the
  issue tracker's `list`.

The full rules are in [`SKILL.md`](SKILL.md).
