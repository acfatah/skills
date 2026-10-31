---
name: commit-messages
description: "Conventional Commits 1.0.0 format for commit messages and PR titles: type, optional scope, lowercase description, body, footers, breaking changes, and the attribution trailer. Load before writing or suggesting a commit message, a plan's or phase's commit message, a squash commit message, or a PR title, and before `auto-commit` commits. An explicit repo convention wins."
---

# Commit Messages v1.0.1

Write every suggested or committed message in the
[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
format. This skill owns only the format; when to commit and when to
suggest a message stay in `CLAUDE.md` and the `auto-commit` skill.

## Override first

An explicit repo rule wins over this skill:

- **Its `CLAUDE.md`,** or a `CONTRIBUTING` file, that states a commit
  convention.
- **A commitlint or commitizen config:** `commitlint.config.*`,
  `.commitlintrc*`, a `commitlint` key in `package.json`, `.czrc`, or a
  `config.commitizen` key in `package.json`.

- **Follow it fully,** and never mix it with this format.
- **Plain history is not a rule.** A repo whose old commits use another
  style still gets this format, unless one of the files above says
  otherwise.

## Format

    <type>[(scope)][!]: <description>

    [body]

    [footers]

A blank line separates the subject, the body and the footers. Example:

```
fix(auto-commit): stage renamed files by both paths

Staging only the new path left the deletion of the old one out of
the commit, so the next run saw it as the user's own change and
stopped.

Closes: #41
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

## Types

| Type | Use for |
|---|---|
| `feat` | A new behaviour or capability |
| `fix` | A bug fix: wrong behaviour made right |
| `docs` | Documentation only |
| `style` | Formatting, whitespace; no meaning changes |
| `refactor` | Restructure with the same behaviour |
| `perf` | The same behaviour, faster or smaller |
| `test` | Adding or fixing tests only |
| `build` | Build system, packaging, dependencies |
| `ci` | CI configuration and scripts |
| `chore` | Maintenance that fits no other type |
| `revert` | Reverting an earlier commit |

- **Pick by effect,** not by file type. A change in behaviour is `feat`
  or `fix`; a docs-only change is `docs`; a restructure that keeps the
  behaviour is `refactor`.
- **Instruction files count as behaviour.** A change to what Claude does,
  in a `SKILL.md`, a `CLAUDE.md` rule or a prompt, is `feat` or `fix`,
  not `docs`. A README that only describes them is `docs`.
- **Several effects:** use the type of the main one, or split the commit.

## Scope

- **Optional.** Use one when one part clearly owns the change, such as a
  skill, package or module name: `feat(auto-pr): …`.
- **A short noun,** lowercase, as the repo names that part.
- **Leave it out** for cross-cutting changes.

## Description

- **Imperative,** as in "add", "fix", "move"; not "added" or "adds".
- **Lowercase first letter.** Proper nouns and code keep their case:
  `fix: quote $HOME in GitHub Actions step`.
- **No trailing period.**
- **72 characters or less for the whole subject,** including the type,
  scope and `!` prefix.

## Body

- **Wrapped at 72** columns.
- **What changed and why.** The reader sees the diff; the body says what
  it does not show.
- **The rationale goes here,** not in long multiline inline comments
  above the changed code.
- **A diagram in the body is ASCII only;** see the `unicode-diagrams`
  skill.

## Breaking changes

- **Mark any incompatible change** with `!` before the colon and a
  footer: `BREAKING CHANGE: <what breaks, and what to do instead>`.
- **Versioned parts:** where the repo versions its parts, such as a
  `vX.Y.Z` in each `SKILL.md` H1, a breaking change is exactly one that
  needs a major bump.

## Footers

- **`Token: value` lines,** one per line, after the body. Tokens use `-`
  for spaces, such as `Co-Authored-By`; `BREAKING CHANGE` is the one
  exception.
- **Issue refs are GitHub issues only:** `Closes: #12`, `Refs: #12`.
  Never put local tracker ids, provisional `P` ids or security `S` ids in
  a commit.
- **The attribution trailer is the last line:** the one the harness
  specifies, such as `Co-Authored-By: Claude …`, unless the user or the
  repo says otherwise. Include it in messages written into plans too.

## Suggesting

- **Put the message in a fenced block,** so it can be copied verbatim.

## PR titles

- **Free-form by default.** A PR title follows the PR rules, not this
  format.
- **Squash-merge repos:** when the user or the repo says it squash-merges
  its PRs, the PR title becomes the commit subject, so write it in this
  format.
- **GitHub merge commits** keep their own `Merge pull request #n …`
  subject.

## Revert

    revert: <subject of the reverted commit>

    Refs: <sha>

## History

- **Never rewrite existing commits** to match this format. It applies
  from now on.

## Gotchas

- **The prefix counts toward 72.** `fix(post-merge-cleanup): ` is already
  25 characters. When the subject is tight, shorten the scope or drop it.
- **`docs` is not for `SKILL.md`.** A rule change there changes what
  Claude does, so it is `feat` or `fix`.
