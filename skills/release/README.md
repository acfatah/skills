# release

An [agent skill](https://skills.sh) that releases one package in another
repo through a release PR. The first run proposes the next SemVer or
CalVer version from Conventional Commits, commits it on
`release/v<version>`, and opens a draft PR. After you merge it, a second
run tags the merge commit and, if you choose, pushes the tag and creates
the GitHub Release. Release notes go to GitHub Releases; there is no
`CHANGELOG.md`.

## What it is

- **One path for every repo.** Run 1 cuts the version on a release
  branch and opens a draft PR; run 2, after the merge, tags it. No state
  is saved: a version in the file with no tag tells run 2 where it is.
- **Reads `VERSION` or `package.json`.** With both, it asks which; when
  they differ, it stops; with neither, it offers to create `VERSION`.
- **Proposes the version** with a bundled, read-only Bun planner script,
  and shows its reasons. SemVer levels come from Conventional Commits
  since the last tag: `!` or `BREAKING CHANGE:` is major, `feat` minor,
  `fix` and `perf` patch. Below 1.0.0 a breaking change bumps minor, and
  the first release is `0.1.0`.
- **CalVer as `YYYY.M.MICRO`,** with no padding: MICRO goes up within a
  month and resets to 0 in a new month.
- **Locks the scheme.** It infers SemVer or CalVer from the version, asks
  once when there is none yet, and refuses any bump that would switch.
- **Takes overrides and pre-releases** on request, checked by the planner
  first.
- **Asks with options that name what runs:** **Commit v<v> and open a
  release PR** or **Cancel**; then **Tag and push v<v>**, **Tag only** or
  **Cancel**. Picking one is the explicit request to commit or tag.
- **Tags the release PR's merge commit,** not the default branch's tip,
  and warns when commits merged after the cut call for a bigger bump.
- **Hands off to bumpp.** In a bumpp project it prints the exact
  `bunx bumpp <v> --pr` command for you to run.
- **Leaves release notes to changelogithub** when a workflow uses it, and
  otherwise offers `gh release create --generate-notes`.

## What it is not

- **Not a bumpp runner.** It never runs bumpp.
- **Not a pusher of your default branch.** It pushes only the release
  branch and, when you pick it, the one tag. It never forces, moves or
  deletes a tag.
- **Not a changelog writer.** It writes no `CHANGELOG.md`.
- **Not a scheme switcher.** A scheme, once chosen, stays.

## When not to use

- **This skills repo, or any repo that versions skills as `vX.Y.Z`
  headings in `skills/*/SKILL.md`** → not covered; the skill stops.
- **A monorepo** (`workspaces` in `package.json`, or
  `pnpm-workspace.yaml`) → not covered; the skill stops.
- **Fixing an old release line** → do it by hand; the skill releases only
  the tip of the default branch.
- **Your default branch is behind, ahead or dirty** → sync or commit
  first; the skill stops and says which check failed.
- **A release PR is already open** (`release/v*`) → finish or close it
  first; the skill stops with its link.

**Negative example:** "Bump the version of the auto-pr skill" in this
skills repo does not use it; the skill stops in a skills repo.

## Install

```bash
bunx skills add acfatah/skills -s release -a claude-code -g -y
```

For local development, link the folder instead:

```bash
ln -sfn "$PWD/skills/release" ~/.claude/skills/release
```

## Requirements

- **[Bun](https://bun.sh)** runs the bundled planner script.
- **[GitHub CLI (`gh`)](https://cli.github.com),** signed in; check with
  `gh auth status`. The skill stops without it.

## Usage

### How it loads

- **By description match.** "release", "cut a release", "bump the
  version", "tag a release".
- **By name, always.** `/release` or "use the release skill".
- **What Claude asks back:** the scheme (SemVer or CalVer) for a project
  with no version yet, which file to use when both exist, and the
  confirm for each run. A project with a version but no tags gets **Tag
  and push v<current>**, **Tag v<current> only**, **Cut a new version**
  or **Cancel**. After a pushed tag without changelogithub, it asks
  whether to create the GitHub Release.

### Example prompts

- **Cut:** "Cut a release." Or `/release`.
- **Override:** "Release this as 2.0.0."
- **Pre-release:** "Cut a release candidate."
- **Tag after the merge:** "The release PR is merged, tag it."
- **First release:** "Bump the version, this project has never been
  released."
- **bumpp project:** "Release the next version"; Claude prints the
  `bunx bumpp` command for you to run.

### Walkthrough

1. **Run 1** on an up-to-date, clean `main`, last tag `v1.2.3`, with one
   `feat` and one `fix` since: Claude proposes `1.3.0` (minor, from the
   `feat`) and asks **Commit v1.3.0 and open a release PR**. It commits
   `chore(release): v1.3.0` on `release/v1.3.0`, opens a draft PR, and
   switches back to `main`.
2. **You merge** the PR.
3. **Run 2** sees `1.3.0` in the file with no tag. Claude finds the PR's
   merge commit and asks **Tag and push v1.3.0**, **Tag only** or
   **Cancel**. On **Tag and push**, it tags the merge commit and pushes
   the tag, then offers the GitHub Release unless changelogithub makes it,
   and suggests `post-merge-cleanup` for `release/v1.3.0`.

Gotchas are listed in [`SKILL.md`](SKILL.md#gotchas), with the full rules.
