# readme-badges

An [agent skill](https://skills.sh) that adds a badge block to a README, or
audits and repairs an existing one, in one consistent HTML format.

## What it is

- **Asks which badges** you want every time, with the ones it detected in
  the repo pre-marked.
- Works in **three modes**: **add** a new block, **add + repair** an
  existing one, or **audit** it and report without writing.
- **Offers a catalog** of runtime and tooling, repo meta, package registry,
  and quality/CI badges.
- **Normalizes** every badge to `flat-square`, `alt` before `src`, and
  `></a>` closings, so badges sit side by side without gaps.
- **Verifies** the image, the backing service, and the link of every badge,
  and lets you keep, drop, or fix one that fails.
- **Previews** the rendered block, plus a diff for an existing README,
  before writing anything.

## What it is not

- **Not a CI or service setup tool.** It badges what already exists: a
  workflow file, a published package, a qlty project. A missing service
  fails the check, and you decide keep, drop, or fix.
- **Not a badge designer.** New badges are filled from the catalog's
  templates, in `flat-square`. A custom badge it finds is verified and
  kept, its URL left alone, except that a shields.io one gets
  `style=flat-square`.
- **Not a silent editor.** It writes only after you approve the preview;
  audit writes nothing, and removing a badge always needs your yes.

## When not to use

- **A private repo, for GitHub badges** → they render `repo not found`
  until the repo is public; Claude warns you before you pick them.
- **A repo not hosted on GitHub** → Claude asks for owner/repo and offers
  only static and local-link badges.
- **Badges outside a README,** such as a docs site or package page → out
  of scope; the skill edits the badge block between a README's H1 and its
  first H2.

**Negative example:** "Set up a GitHub Actions test workflow" will not load
it; it badges workflows that exist, it does not write them.

## Install

```bash
bunx skills add acfatah/skills -s readme-badges -a claude-code -g -y
```

For local development, link the folder instead:

```bash
ln -sfn "$PWD/skills/readme-badges" ~/.claude/skills/readme-badges
```

## Usage

### How it loads

- **By description match.** Ask to add badges or shields, to check, fix,
  or tidy existing badges, or report a broken one.
- **By name, always.** `/readme-badges …` or "use the readme-badges
  skill".
- **What Claude asks back:** add + repair or audit, when a block exists
  and you did not say; which badges, every time, from the catalog with
  `[present]` and `[detected]` marks; where a new block goes; keep, drop,
  or fix for each failing badge; and approval of the preview before
  writing. It also asks for the README path or owner/repo when it cannot
  find them.

### Example prompts

- **Add:** "Add badges to the README." With no block yet, Claude shows the
  badge picker first, then asks where the block goes.
- **Add + repair:** "Add an npm badge and tidy the rest." / "Convert my
  Markdown badges to HTML." It converts Markdown badges only on your yes.
- **Audit:** "Audit my badges." Claude replies with one table and writes
  nothing.
- **Broken badge:** "The npm badge is broken."
- **By name:** "/readme-badges add a CI badge for the test workflow."

### Walkthrough

1. **Ask.** "Add badges to the README."
2. **Pick.** Claude shows the catalog with `[detected]` marks; name the
   badges, then where the block goes.
3. **Verify.** It checks each badge's image, service, and link; for a
   failure, choose keep, drop, or fix.
4. **Approve.** It shows the rendered block and, for an existing README, a
   diff. It writes only after your yes, then confirms `git diff` matches.

A block it writes looks like this:

```html
<p>
  <a href="./LICENSE">
    <img
      alt="License"
      src="https://img.shields.io/github/license/acfatah/skills?style=flat-square"
    ></a>
  <a href="https://github.com/acfatah/skills/commits/main">
    <img
      alt="Last commit"
      src="https://img.shields.io/github/last-commit/acfatah/skills?display_timestamp=committer&style=flat-square"
    ></a>
</p>
```

Gotchas:

- **GitHub badges need a public repo.** On a private repo, shields.io shows
  `repo not found`.
- **Error badges still load.** shields.io answers HTTP 200 even for an error
  badge, so a badge can look loaded and still be broken. The skill reads
  the badge text instead of trusting the status code.
- **Some sites block scripted checks.** npmjs.com and qlty project pages
  refuse curl, so the skill checks the registry or the badge image instead.
- **No blank lines inside the block.** A blank line ends the HTML block
  early, and Markdown renders the rest as text.

The full rules are in [`SKILL.md`](SKILL.md) and
[`references/catalog.md`](references/catalog.md).
