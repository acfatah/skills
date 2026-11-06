---
name: release
description: "Release one package in another repo through a release PR: propose the next SemVer or CalVer version from Conventional Commits, commit it on `release/v<version>` and open a draft PR; after the merge, tag the merge commit and, if chosen, push the tag and create the GitHub Release. Load when the user says \"release\", \"cut a release\", \"bump the version\", \"tag a release\", or /release. Not for this skills repo's `vX.Y.Z` headings, and not for monorepos."
allowed-tools: Bash(bun ${CLAUDE_SKILL_DIR}/scripts/release.ts *)
---

# Release v1.0.0

Releases one package per run, in a repo other than a skills repo, through
a release PR. Every repo takes the same path, whether or not its default
branch requires PRs:

1. **Run 1, cut:** compute the next version, commit it on
   `release/v<version>`, and open a draft PR.
2. **The user merges** the PR.
3. **Run 2, tag:** the version file now holds a version with no tag, so
   the release is half done. Tag the release PR's merge commit, and push
   the tag if chosen.

No state is saved between runs: "version in the file, no tag yet" is how
run 2 knows where it is. There is no `CHANGELOG.md`; release notes go to
GitHub Releases.

## Requirements

- **Bun** runs the planner script.
- **`gh`, signed in** (`gh auth status`), for the PR, the merged-PR
  lookup and GitHub Releases. Without it, stop and say so.

## Commit rule

Picking a confirm option that names the commit or tag ("Commit v1.4.0 and
open a release PR", "Tag and push v1.4.0") is the explicit request that
the global "Writing Commit" rule asks for. So every such option names
exactly what runs; never shorten one to a vague label such as "Release".

## Planner script

Run it with its full path, from inside the target repo:

```bash
bun ${CLAUDE_SKILL_DIR}/scripts/release.ts plan [--version <v>] [--pre <id>] [--at <sha>] [--scheme semver|calver] [--file VERSION|package.json]
bun ${CLAUDE_SKILL_DIR}/scripts/release.ts write <version>
```

- **`plan` is read-only.** It prints one JSON object and writes nothing.
- **`write`** sets `VERSION` (creating it when missing) and nothing else.
  It refuses a project that keeps its version in `package.json`.
- **Fields:** `versionFile`, `versions`, `current`, `scheme`, `bumpp`,
  `changelogithub`, `lastTag`, `state`, `range`, `commits`, `level`,
  `proposed`, `reasons`, `warnings`, `errors`.
- **Version file:** `VERSION` or `package.json`'s `version`.
- **Scheme:** inferred from the version. A major of 2000-2999 with a minor
  of 1-12 is CalVer (`YYYY.M.MICRO`, no padding); anything else is SemVer.
  No version, or `0.0.0`, has no scheme yet.
- **SemVer level** from Conventional Commits since the last tag: `!` or a
  `BREAKING CHANGE:` footer is major, `feat` minor, `fix` and `perf`
  patch, anything else none. Below 1.0.0 a breaking change bumps minor.
  The first release is `0.1.0`.
- **CalVer:** MICRO + 1 within the same month, 0 in a new month.
- **Pre-releases,** only on request: `--pre rc` gives `1.3.0-rc.0`, then
  `rc.1`. Without `--pre`, a current pre-release releases its own version
  (`1.3.0-rc.1` to `1.3.0`).

**`state`:**

| State | Meaning | Route |
|---|---|---|
| `no-version` | No version file holds a version | Choose the scheme, then Run 1 |
| `untagged` | A version, but no `v*` tags | Untagged project |
| `fresh` | The version equals the last tag | Run 1 |
| `half-done` | The version is above the last tag and untagged | Run 2 |
| `behind` | Anything else, such as a version below the last tag | Stop with the error |

**Codes.** Each entry in `errors` stops the run: show its message. Each
`warnings` entry needs the action below.

| Code | Kind | Action |
|---|---|---|
| `versions-differ` | error | `VERSION` and `package.json` disagree: stop and ask which is right |
| `invalid-version` | error | Not a SemVer version: stop, or ask for another override |
| `scheme-switch` | error | The bump changes scheme: refuse; the scheme never changes |
| `not-greater` | error | Not above the current version: ask for another |
| `version-behind-tag` | error | State `behind`: stop |
| `both-files` | warning | Ask which file to use; rerun with `--file` |
| `scheme-unset` | warning | Ask the scheme question; rerun with `--scheme` |
| `nothing-releasable` | warning | Say so; the proposal is a patch, offered anyway |
| `commits-after-cut` | warning | Run 2: show it before the tag confirm |

## Start

1. **Check the repo is in scope.** Stop when it is:
   - **a skills repo,** whose versions are `vX.Y.Z` headings in
     `skills/*/SKILL.md`;
   - **a monorepo:** `package.json` has `workspaces`, or a
     `pnpm-workspace.yaml` exists.
2. **On the default branch, clean, up to date.** Find the default with
   `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`. Then
   `git branch --show-current` must match it, `git status --short` must be
   empty, and after `git fetch origin <default>`, `git rev-parse HEAD` must
   equal `git rev-parse origin/<default>`. Otherwise stop and say which
   check failed; never pull, stash or switch for the user.
3. **No open release PR.**
   `gh pr list --state open --json number,url,headRefName` with a
   `headRefName` starting `release/v` stops the run with its link: finish
   or close that one first.
4. **Run `plan`** and route by `state`. Show `errors` and stop if any.

## Choose the scheme

For `no-version`, or the `scheme-unset` warning.

- **No version file:** offer to create `VERSION`. A `package.json` without
  a `version` gets `VERSION` too.
- **`both-files`:** ask which file is the version source; pass `--file`
  from then on. The other file keeps its old version.
- **Scheme question:** **SemVer** (first release `0.1.0`) or **CalVer**
  (`<year>.<month>.0`). Say the choice is permanent: the skill refuses any
  later bump that switches scheme. Rerun `plan --scheme <answer>`.

## Run 1, cut

1. **Show the proposal:** current version, `proposed`, `level`, and
   `reasons`, one per line. For `nothing-releasable`, say there are only
   docs, chore, CI or test commits since the last tag, and that the patch
   is offered anyway.
2. **Overrides.** A version the user names, or one typed as **Other** in
   the confirm, is checked with `plan --version <v>` before it is used.
   Pre-release on request: `plan --pre <id>`.
3. **bumpp project** (`bumpp` is not null): stop here, before the
   confirm. Print the command for the user to run, with the exact version:

       ! bunx bumpp <v> --pr

   Say that bumpp then creates `release/v<v>`, commits, pushes and opens a
   PR (not a draft), and skips the tag; that the project's `bump.config.*`
   may change those defaults; and that run 2 still tags the merge. Never
   run bumpp.
4. **Confirm** with AskUserQuestion, two options:
   - **Commit v<v> and open a release PR**
   - **Cancel**
5. **Branch:** `git switch -c release/v<v>`.
6. **Write the version:**
   - **`VERSION`:** `bun ${CLAUDE_SKILL_DIR}/scripts/release.ts write <v>`
   - **`package.json`:** `bun pm version <v> --no-git-tag-version`. Always
     pass the exact version; `patch` breaks CalVer at a month boundary.
7. **Commit** the version file by path, with the subject
   `chore(release): v<v>`, per the `commit-messages` skill (a repo
   convention wins). The body lists the level and its reasons.
8. **Open the draft PR** per the `auto-pr` skill's "Opening a PR on
   request": summary `drafts/PR_SUMMARY-release_v<v>.md` via `pr-summary`,
   `git push -u origin release/v<v>`, then `gh pr create --draft --base
   <default>`.
9. **Switch back:** `git switch <default>`. Tell the user to merge the PR,
   then run `/release` again to tag it.

## Run 2, tag

For `half-done`: the version `<v>` is in the file but not tagged.

1. **Find the merge commit:**
   `gh pr list --state merged --head release/v<v> --json number,url,mergeCommit`.
   Take `mergeCommit.oid`, not the default branch's tip: a squash merge
   makes a new commit, and later merges may sit on top of it.
   - **None found** (a bumpp PR under another branch name, or a direct
     commit): ask which commit to tag. Offer the last commit that changed
     the version file, `git log -1 --format=%H -- <versionFile>`.
2. **Re-check:** `plan --at <merge sha>`. Show any `commits-after-cut`:
   commits merged after the cut call for a bigger bump than the file has.
3. **Confirm** with AskUserQuestion, three options:
   - **Tag and push v<v>**
   - **Tag only** (local; push later with `git push origin refs/tags/v<v>`)
   - **Cancel**

   Say before asking that a pushed tag may start CI that publishes a
   public GitHub Release.
4. **Tag:** `git tag -a v<v> -m v<v> <merge sha>`.
5. **Push the tag only,** on **Tag and push**:
   `git push origin refs/tags/v<v>`. A rejected push (such as a tag
   ruleset) is a stop: report it, and keep the local tag.
6. **Release notes,** only after a pushed tag:
   - **`changelogithub` set:** its workflow creates the Release; name the
     file and do nothing.
   - **Otherwise** ask: **Create GitHub Release v<v> with generated
     notes** or **Skip**. On yes:
     `gh release create v<v> --verify-tag --generate-notes`.
7. **Clean up:** suggest the `post-merge-cleanup` skill for
   `release/v<v>`.

## Untagged project

For `untagged`: a version, but no `v*` tags yet. Ask with
AskUserQuestion:

- **Tag and push v<current>:** tag `HEAD` of the default branch as is,
  then steps 4-6 of Run 2.
- **Tag v<current> only:** the same, without the push.
- **Cut a new version:** Run 1 with `proposed`.
- **Cancel**

## Never

- **Run bumpp.** Print its command instead.
- **Push the default branch,** or anything but the release branch and the
  one tag.
- **Force,** or skip hooks (`--no-verify`).
- **Delete or move a tag,** local or remote.
- **Switch scheme.**
- **Release an old line.** Only the tip of the default branch; patching an
  older release line is done by hand.
- **Write a `CHANGELOG.md`.**

## Gotchas

- **Confirm wording is load-bearing.** The commit rule above holds only
  while each option names its action.
- **"Tag and push" publishes.** A tag push can start CI that creates a
  public GitHub Release; undoing it means deleting the remote tag and the
  Release, which this skill never does.
- **Commits merged after the cut** ship in the release without having
  counted toward its version; `commits-after-cut` flags only a bigger
  level than the file has.
- **Half-done releases.** A merged release PR that was never tagged leaves
  the version and the tags disagreeing until run 2 tags it.
- **Tag rulesets** can reject the tag push even when the PR merged fine.
- **Tags sort wrongly as text** (`v2026.10.0` before `v2026.2.0`); the
  planner sorts by version.
- **`--generate-notes` lists merged PRs, not commits,** so repos that
  commit straight to the default branch get thin notes.
- **changelogithub in CI needs `fetch-depth: 0`** in its checkout step,
  or it sees no history.
- **bumpp's `--pr` force-pushes** when `release/v<v>` already has an open
  PR, and its PR is not a draft.
