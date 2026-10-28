# lint-skills

An [agent skill](https://skills.sh) that lints a skills repo with a bundled
Bun script. A stale skill name fails silently: Claude just never finds the
skill. This linter catches that drift, plus the repo rules around each
skill, and reports every finding as `path:line  [code]  message`.

## What it is

- **Checks names:** each `SKILL.md` has frontmatter with `name` and
  `description`, the `name` matches the folder, and it follows the name
  rules (`a-z`, `0-9` and `-`, at most 64 characters, no `claude` or
  `anthropic`).
- **Checks cross-references:** `` `name` skill `` mentions, hyphenated
  names before "skill" in descriptions, and Markdown links into `skills/`
  or `workflows/` all point at something that exists.
- **Checks repo rules:** each skill has a `README.md`, a `vX.Y.Z` at the
  end of its `SKILL.md` H1, and a row in the root README Skills table;
  each workflow has its `.js` file, a `VERSION` constant, a `README.md`
  and a Workflows row.
- **Warns, without failing,** about `/<name>` mentions that match no known
  skill, workflow or built-in, and about README sections that are missing
  or out of order.
- **Checks your install** with `--home`: every link in `~/.claude/skills/`
  resolves, and each repo skill has an entry there.
- **Offers fixes** for clear findings, and edits only after you agree.

## What it is not

- **Not a skill runner.** It never loads or runs a skill, and never calls
  Claude; it reads files.
- **Not `claude plugin validate`.** It reads only the single-line `name:`
  and `description:` fields, not full frontmatter validity.

## When not to use

- **You want to know if a skill's frontmatter is valid** → run
  `claude plugin validate skills/`.
- **You want a skill's context cost or usage** → run `/skill-doctor`.
- **The folder is not a skills repo** (no `skills/` folder) → the linter
  exits 2; point it at the repo with `--root`.

**Negative example:** "Why doesn't my skill trigger on 'deploy'?" is not a
lint question. The linter checks that names and references exist, not
whether a description matches a prompt.

## Install

Requires [Bun](https://bun.sh); the skill stops without it.

```bash
bunx skills add acfatah/skills -s lint-skills -a claude-code -g -y
```

For local development, link the folder instead:

```bash
ln -sfn "$PWD/skills/lint-skills" ~/.claude/skills/lint-skills
```

## Usage

### How it loads

- **By description match.** "Lint the skills", "check skill names",
  "check the cross-references".
- **Before a skill commit.** In a skills repo, Claude loads it before
  committing a new or changed skill.
- **By name, always.** `/lint-skills` or "use the lint-skills skill".
- **What Claude asks back:** whether to apply each fix it offers, and the
  repo path when the current folder is not a skills repo.

### Example prompts

- **Lint the repo:** "Lint the skills."
- **Names only:** "Check that every skill name matches its folder."
- **References:** "Do all the cross-skill references still point at real
  skills?"
- **Installed skills:** "Check my installed skills for broken links."
- **Another repo:** "Lint the skills in `~/work/team-skills`."
- **By name:** `/lint-skills --home`

### Walkthrough

A run goes through four stages:

```
+-----------+   +-------------+   +------------+   +-----------------+
| 1. Root   |-->| 2. Known    |-->| 3. Checks  |-->| 4. Report       |
| --root or |   | names       |   | each file  |   | errors first,   |
| git top   |   | repo skills |   | returns    |   | then warnings,  |
| level     |   | + built-ins |   | findings   |   | summary, exit   |
+-----------+   +-------------+   +------------+   +-----------------+
```

1. **Root.** `--root`, else the git top level, else the current folder.
   Without a `skills/` folder there, it exits 2.
2. **Known names.** Every skill's folder and `name:`, a built-in list of
   Claude Code commands and bundled skills, a short list of external
   skills the repo refers to (such as `agent-browser`), workflow names for
   `/<name>`, and, with `--home`, every entry in `~/.claude/skills/`.
3. **Checks.** Each group reads its files and returns findings:

   | Group          | Example finding |
   |----------------|-----------------|
   | Skills         | `skills/alpha/SKILL.md:2  [name-mismatch]  name "alfa" does not match folder "alpha"` |
   | Workflows      | `workflows/flow/flow.js:1  [workflow-version]  no VERSION constant` |
   | References     | `` skills/alpha/SKILL.md:8  [unknown-skill]  `betta` skill is not a known skill `` |
   | Links          | `skills/beta/README.md:3  [broken-link]  link target ../gone does not exist` |
   | README order   | `skills/beta/README.md:1  [readme-sections]  no "## Usage" section` |
   | Home (`--home`) | `~/.claude/skills/gone  [broken-symlink]  link does not resolve` |

4. **Report.** Errors first, then warnings, then a summary line.

A full run with one error and one warning:

```
$ bun skills/lint-skills/scripts/lint.ts
skills/alpha/SKILL.md:8  [unknown-skill]  `zzz` skill is not a known skill
skills/alpha/SKILL.md:8  [unknown-command]  /zzz is not a known skill or built-in command
1 error, 1 warning
$ echo $?
1
```

**Errors vs warnings.** Errors are things that break a skill or a repo
rule, and they set exit code 1. Warnings are likely, not certain,
problems: a `/<name>` may be a built-in the list lacks. They never change
the exit code, which stays 0 with warnings alone.

Gotchas:

- **Home checks need `--home`.** A plain run never reads
  `~/.claude/skills/`, so broken links there go unreported.
- **One-word names in description prose are not checked.** "the alpha
  skill" passes; write `` `alpha` skill `` to have it checked.
- **`/<name>` warnings may be built-ins** missing from the script's list.
  Claude asks before adding one.
- **Fenced code and double-backtick spans are skipped,** so a pattern
  quoted there is never reported.

Every check, with its severity and example output, is in
[`references/checks.md`](references/checks.md). The full rules are in
[`SKILL.md`](SKILL.md).
