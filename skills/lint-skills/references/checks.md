# Checks

Every check that `scripts/lint.ts` runs, with its severity and an example
finding line. Errors set exit code 1; warnings never change the exit code.

## Output

One line per finding, errors first, then warnings, then a summary:

```
path:line  [code]  message
N errors, M warnings
```

- **No line number** for a finding about a folder or a symlink, such as
  `workflows/flow  [workflow-files]  no flow.js`.
- **Paths** are relative to the repo root, except `--home` findings, which
  show `~/.claude/skills/<name>`.

| Exit | Meaning                                                   |
|------|-----------------------------------------------------------|
| 0    | No errors. Warnings may be listed.                        |
| 1    | At least one error.                                       |
| 2    | Usage error, or no `skills/` folder at the root.          |

## Root and scanned files

- **Root:** `--root <path>`, else `git rev-parse --show-toplevel` from the
  current directory, else the current directory.
- **Skills:** each `skills/<folder>/` that holds a `SKILL.md`. Folders
  without one are ignored.
- **Workflows:** each folder under `workflows/`.
- **Scanned for references:** `skills/*/SKILL.md`, `skills/*/README.md`,
  `skills/*/references/**/*.md`, `workflows/*/README.md`,
  `claude/CLAUDE.md`, and the root `README.md` and `CLAUDE.md`. Never
  `drafts/`, `.claude/` or `node_modules/`.

## Known names

A reference is fine when it names one of these:

- **Repo skills:** each skill's folder name and its frontmatter `name`.
- **Built-ins:** Claude Code commands and bundled skills, from the
  `BUILT_INS` list in the script, such as `clear`, `branch`, `doctor`,
  `code-review` and `skill-doctor`.
- **External skills:** third-party skills the repo refers to but does not
  ship, from the `EXTERNAL_SKILLS` list, such as `agent-browser`.
- **Workflows:** folder names under `workflows/`, for `/<name>` only.
- **With `--home`:** every entry in `~/.claude/skills/`.

## Skill checks (errors)

| Code            | Rule                                                        |
|-----------------|-------------------------------------------------------------|
| `frontmatter`   | `SKILL.md` has frontmatter with `name` and `description`    |
| `name-mismatch` | Frontmatter `name` equals the folder name                   |
| `name-rules`    | Only `a-z`, `0-9` and `-`; at most 64 characters; no `claude` or `anthropic` |
| `skill-readme`  | `README.md` exists next to `SKILL.md`                       |
| `skill-version` | The `SKILL.md` H1 ends in `vX.Y.Z`                          |
| `skill-row`     | The root README `## Skills` section links `skills/<folder>` |

```
skills/alpha/SKILL.md:1  [frontmatter]  frontmatter has no description
skills/alpha/SKILL.md:2  [name-mismatch]  name "alfa" does not match folder "alpha"
skills/claude-helper/SKILL.md:2  [name-rules]  name "claude-helper" contains "claude" or "anthropic"
skills/beta/SKILL.md:1  [skill-readme]  no README.md in skills/beta
skills/beta/SKILL.md:6  [skill-version]  H1 does not end in vX.Y.Z
README.md:25  [skill-row]  Skills table has no row linking skills/beta
```

- **Name rules** check the frontmatter `name`, or the folder name when the
  frontmatter has none.
- **Frontmatter** is read line by line: `name:` and `description:` must
  each sit on one line, quoted or not.

## Workflow checks (errors)

| Code               | Rule                                                     |
|--------------------|----------------------------------------------------------|
| `workflow-files`   | `workflows/<n>/` has `<n>.js` and `README.md`            |
| `workflow-version` | `<n>.js` defines a `VERSION` constant                    |
| `workflow-row`     | The root README `## Workflows` section links `workflows/<n>` |

```
workflows/flow  [workflow-files]  no flow.js
workflows/flow/flow.js:1  [workflow-version]  no VERSION constant
README.md:46  [workflow-row]  Workflows table has no row linking workflows/flow
```

## Reference checks

| Code              | Sev   | Rule                                                 |
|-------------------|-------|------------------------------------------------------|
| `unknown-skill`   | error | `` `x` skill `` names a known skill                  |
| `unknown-skill`   | error | A hyphenated `x-y skill` in a description names a known skill |
| `broken-link`     | error | A Markdown link into `skills/` or `workflows/` resolves |
| `unknown-command` | warn  | `/<name>` names a known skill, workflow or built-in  |

```
skills/alpha/SKILL.md:8  [unknown-skill]  `betta` skill is not a known skill
skills/beta/SKILL.md:3  [unknown-skill]  "alpha-one skill" in the description is not a known skill
skills/beta/README.md:3  [broken-link]  link target ../gone does not exist
skills/alpha/SKILL.md:8  [unknown-command]  /alpah is not a known skill or built-in command
```

- **`` `x` skill ``** also matches when a line break falls between the
  name and `skill`, as in hard-wrapped prose.
- **Description prose** checks only hyphenated names, so "the skill" and
  "this skill" never match. Common hyphenated words such as `built-in`
  and `third-party` are skipped too.
- **Links** are resolved from the file's folder. Only targets inside
  `skills/` or `workflows/` are checked; URLs, anchors and absolute paths
  are not.
- **`/<name>`** matches only at the start of a line or after a space, `(` or
  backtick, and not when followed by `/`, `:` or `.` plus a letter. So
  `/mnt/c`, `/dev/null` and `/etc.d` never match, while "run /doctor."
  at the end of a sentence does.

## README sections (warnings)

| Code              | Rule                                                     |
|-------------------|----------------------------------------------------------|
| `readme-sections` | `## What it is`, `## What it is not`, `## When not to use`, `## Install`, `## Usage` (`## Run` for a workflow), in that order |

```
skills/beta/README.md:1  [readme-sections]  no "## Usage" section
skills/beta/README.md:3  [readme-sections]  "## Install" comes before "## When not to use"
```

- **Other sections** may sit between or after them, such as
  `## Configuration` next to `## Install`.
- **Headings match exactly,** at level 2.

## Home checks (`--home` only)

| Code             | Sev   | Rule                                                  |
|------------------|-------|-------------------------------------------------------|
| `broken-symlink` | error | Every link in `~/.claude/skills/` resolves            |
| `unlinked-skill` | warn  | Every repo skill has an entry in `~/.claude/skills/`  |

```
~/.claude/skills/gone  [broken-symlink]  link does not resolve
~/.claude/skills/beta  [unlinked-skill]  skills/beta is not installed
```

- **Off by default.** Without `--home`, nothing outside the repo is read.
- **Non-link entries** such as `.trash/` and `synced/` are not checked for
  links; dot entries are ignored entirely.
- **`unlinked-skill`** checks only that an entry with the folder's name
  exists, not where it points.
- **`LINT_SKILLS_HOME`** replaces `~/.claude/skills` as the folder to check;
  the tests use it to stay off the real one.

## Never matched

- **Fenced code blocks,** with ```` ``` ```` or `~~~`.
- **Placeholders** such as `` `<name>` skill `` and `/<skill-name>`.
- **Plugin forms** such as `` `plugin:skill` `` and `/plugin:skill`.
- **Paths** that start with `/` and go on with `/`, such as `/mnt/c`.
- **Links inside inline code,** such as `` `[![alt](src)](href)` ``.
- **Double-backtick code spans,** which quote a pattern literally, such as
  ```` `` `alpha` skill `` ````.
- **One-word names in description prose,** such as "the alpha skill"
  without backticks. Quote them as `` `alpha` skill `` to have them
  checked.
