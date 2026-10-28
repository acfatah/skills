# Working in this repository

Rules for this repo only. My global instructions are in
`claude/CLAUDE.md`, linked into `~/.claude/`.

## New or changed skill

- **Folder:** `skills/<name>/` with `SKILL.md` and `README.md`; the
  frontmatter `name` must match the folder name.
- **Version:** `vX.Y.Z` in the `SKILL.md` H1. Bump it in the same
  commit as the change; there is no CHANGELOG.
- **Root README:** add or update its row in the Skills table.
- **Lint:** run `bun skills/lint-skills/scripts/lint.ts` before
  suggesting the commit, and fix its errors.

## New or changed workflow

- **Folder:** `workflows/<name>/` with `<name>.js` and `README.md`.
- **Version:** the `VERSION` constant in the `.js` file.
- **Root README:** add or update its row in the Workflows table.

## README sections

Every skill and workflow `README.md` uses these sections, in order:

1. **Intro** paragraph under the H1.
2. **What it is**, **What it is not**, **When not to use**: situation →
   what to use instead, then a bold **Negative example:** paragraph.
3. **Install**. Setup or cost sections, such as Configuration, sit next
   to it.
4. **Usage** (**Run** for a workflow): How it loads, Example prompts, an
   optional Walkthrough, then a `Gotchas:` list (or a pointer to where
   they live) and a link to `SKILL.md` or the `.js` file.

- **How it loads:** description match, naming it (`/<name>`) always
  works, and what Claude asks back.
- **Example prompts:** 4-8, grouped by task, one `/<name>` form.
- **Sources:** every claim comes from `SKILL.md`, `references/` or the
  `.js` file. If they are silent, the README is silent; offer any gap as
  an issue.
- **Style:** wrap prose at 80 and bold the key word in each bullet. Never
  wrap code, tables, URLs or paths, and keep inline code on one line.
- **Examples:** `skills/issue-tracker/README.md`, and
  `workflows/webapp-security-audit/README.md` for a workflow.
