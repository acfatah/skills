# readme-badges

An [agent skill](https://skills.sh) that adds a badge block to a README, or
audits and repairs an existing one, in one consistent HTML format.

What it does:

- Asks which badges you want every time, with the ones it detected in the
  repo pre-marked.
- Works in three modes: **add** a new block, **add + repair** an existing
  one, or **audit** it and report without writing.
- Offers a catalog of runtime and tooling, repo meta, package registry, and
  quality/CI badges.
- Normalizes every badge to `flat-square`, `alt` before `src`, and `></a>`
  closings, so badges sit side by side without gaps.
- Verifies the image, the backing service, and the link of every badge, and
  lets you keep, drop, or fix one that fails.
- Previews the rendered block, plus a diff for an existing README, before
  writing anything.

## Install

```bash
bunx skills add acfatah/skills -s readme-badges -a claude-code -g -y
```

For local development, link the folder instead:

```bash
ln -sfn "$PWD/skills/readme-badges" ~/.claude/skills/readme-badges
```

## Usage

Just talk to Claude:

- "Add badges to the README."
- "Audit my badges."
- "The npm badge is broken."

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
