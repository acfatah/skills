# commit-messages

An [agent skill](https://skills.sh) that gives Claude Code one format for
the commit messages it suggests or commits:
[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/),
with the Angular type set. It also decides when a PR title uses that
format. Your repo's own convention always wins.

## What it is

- **Writes subjects as** `<type>[(scope)][!]: <description>`, with an
  imperative, lowercase description and no trailing period, in 72
  characters or less including the prefix.
- **Uses 11 types,** picked by the change's effect:
  `feat fix docs style refactor perf test build ci chore revert`. A rule
  change in a `SKILL.md` or `CLAUDE.md` counts as behaviour, so it is
  `feat` or `fix`.
- **Adds a scope** only when one part, such as a skill, clearly owns the
  change.
- **Wraps the body at 72,** and puts what changed and why there, not in
  long inline comments.
- **Marks breaking changes** with `!` and a `BREAKING CHANGE:` footer;
  where the repo versions its parts, exactly when the change needs a
  major bump.
- **Writes footers** as `Token: value` lines: GitHub issue refs such as
  `Closes: #12`, and the attribution trailer as the last line.
- **Suggests the message in a fenced block,** so it copies verbatim.

## What it is not

- **Not a committer.** It owns only the format; when to commit and when
  to suggest a message stay in `CLAUDE.md` and
  [`auto-commit`](../auto-commit).
- **Not a history rewriter.** Existing commits stay as they are; the
  format applies from now on.
- **Not a PR title rule by default.** PR titles stay free-form unless you
  or the repo say it squash-merges.
- **Not a local issue linker.** Local tracker ids, `P` ids and `S` ids
  never go into a commit; only GitHub issue refs do.

## When not to use

- **The repo states its own convention** in its `CLAUDE.md`, a
  `CONTRIBUTING` file, or a commitlint or commitizen config → that
  convention wins, in full, and this format is not mixed in.
- **You want to know whether to commit** → see the Writing Commit section
  of `CLAUDE.md`, or [`auto-commit`](../auto-commit) for commits as you
  go.

**Negative example:** in a repo whose `CONTRIBUTING` file asks for
`[module] Sentence case subject`, Claude writes that, not
`feat(module): …`. Old history in another style does not count as a
rule; only an explicit one does.

## Install

```bash
bunx skills add acfatah/skills -s commit-messages -a claude-code -g -y
```

For local development, link the folder instead:

```bash
ln -sfn "$PWD/skills/commit-messages" ~/.claude/skills/commit-messages
```

## Usage

### How it loads

- **By description match.** Before Claude writes or suggests a commit
  message, a plan's or phase's commit message, a squash commit message,
  or a PR title, and before `auto-commit` commits.
- **Reliably, with a `CLAUDE.md` pointer** in your Writing Commit
  section:

  ```markdown
  Before writing or suggesting a commit message, load the
  `commit-messages` skill. One rule holds even without it: an explicit
  repo convention wins.
  ```

- **By name, always.** `/commit-messages` or "use the commit-messages
  skill".
- **What Claude asks back:** nothing, as a rule.

### Example prompts

- **Suggest:** "Suggest a commit message for these changes."
- **Breaking change:** "Write the commit message; this renames the
  config key, so it breaks old setups."
- **Issue ref:** "Commit message for the fix, it closes #41."
- **Squash merge:** "This repo squash-merges; suggest the PR title."
- **Revert:** "Suggest a message that reverts `a1b2c3d`."
- **Check:** `/commit-messages is this subject right? "Added retry."`

Gotchas:

- **The prefix counts toward 72.** `fix(post-merge-cleanup): ` is already
  25 characters; Claude shortens or drops the scope when the subject is
  tight.
- **`docs` is not for `SKILL.md`.** A rule change there changes what
  Claude does, so it is `feat` or `fix`.
- **Plain history is not a rule.** A repo with sentence-case history still
  gets this format, unless it states its own convention.

The full rules are in [`SKILL.md`](SKILL.md).
