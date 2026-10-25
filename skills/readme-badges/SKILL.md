---
name: readme-badges
description: Add, audit, or repair the badge block in a README (shields.io, qlty, CI status). Load when the user asks to add badges or shields to a README, to check, fix, or tidy existing badges, or reports a broken badge.
---

# README Badges v1.1.1

Add a badge block to a README, or audit and repair an existing one. The user
picks every badge; you detect, propose, verify, and preview. Templates and
detection hints live in [`references/catalog.md`](references/catalog.md):
read it before step 4.

## Modes

| Mode | When | Writes |
|---|---|---|
| **Add** | No badge block exists | New block |
| **Add + repair** | A block exists; the user wants changes | The existing block, in place |
| **Audit** | A block exists; the user wants a report | Nothing |

## Workflow

### 1. Gather facts

Find the README (`README.md` at the repo root, else ask), then collect:

- **owner/repo** from `git remote get-url origin`. Handles both
  `git@github.com:<o>/<r>.git` and `https://github.com/<o>/<r>(.git)`. If
  there is no `origin`, or it is not GitHub, ask for a GitHub owner/repo
  and say why: the repo may have a GitHub mirror.
  - **Given one:** use it as `<o>/<r>` and offer the GitHub badges too.
  - **Declined or none:** skip every row that uses `<o>/<r>`; offer only
    static, local-link, and package registry badges (npm, npm-downloads,
    bundle-size, jsr). See the catalog.
- **Visibility and default branch:** `gh repo view <o>/<r> --json
  defaultBranchRef,visibility`. Without `gh`, use
  `git symbolic-ref --short refs/remotes/origin/HEAD` and strip `origin/`.
- **Manifests:** `package.json` (`name`, `private`, dependencies,
  `packageManager`, `engines`), `jsr.json`, `deno.json`.
- **Signals:** the license file and its SPDX id, lockfiles, `tsconfig.json`,
  framework configs, every file in `.github/workflows/` with its `name:`,
  `.qlty/`, `codecov.yml`.

Done when each catalog row's detect column is answered yes or no.

### 2. Find an existing block

Look between the H1 and the first H2 for either form:

- a `<p>` (or `<div>`) holding `<a><img></a>` pairs;
- consecutive lines of Markdown badges, `[![alt](src)](href)`.

Parse each badge into id (matched against the catalog by `src`), alt, src,
and href. A badge matching no catalog row is **custom**: verify and keep it,
and leave its URL alone. One exception: the Style repair rule applies to a
custom `img.shields.io` badge too, and changes only its `style=` parameter.

### 3. Choose the mode

No block means Add. With a block, ask: add + repair, or audit only. A
request that already names the mode ("audit my badges") answers this.

### 4. Ask for picks and placement

Show the catalog grouped by category, in chat, marking each item:

- `[present]` already in the block;
- `[detected]` its detect hint matched;
- nothing, otherwise.

Ask which badges to add (and, in add + repair, which to remove). Ask every
time, even when detection looks complete. Then ask where a new block goes:
directly under the H1, after the intro paragraph, or a spot the user names.
An existing block stays where it is.

Done when the user has named the badge set and, for a new block, the place.

### 5. Fill and verify

Fill each template from the facts in step 1. Then run three checks on every
badge in the final set, existing ones included:

1. **Image.** `curl -sL -o img.svg -w '%{http_code}' "<src>"` must give
   200. For shields.io, a 200 can still be an error badge. Read the message
   from `aria-label="…"` or `<title>`, else the `<text>` nodes, and fail it
   on `not found`, `invalid`, `inaccessible`, `rate limited`, `unknown`,
   `no releases`, or `not specified`. A badge with a `logo=` must contain
   `data:image`; without it the slug was wrong and the logo silently
   dropped.
2. **Service.** The catalog's exists check for that row: the package is
   published, the qlty project exists, the workflow file exists.
3. **Link.** `curl -sIL -o /dev/null -w '%{http_code}' "<href>"`, retrying
   with GET (`-o /dev/null` without `-I`) on 403, 405, or 404. A local
   `./path` must exist in the repo. The catalog lists hosts that block curl
   and what stands in for them.

Mark each failing badge with its check and the reason (the shields message,
the status code). The user decides for each: **keep**, **drop**, or
**fix** (you propose the fix, then re-verify).

Done when every badge passes or has a user decision.

### 6. Render, preview, write

- Render the block exactly as the catalog's block template.
- **Order** for a new block: runtime and tooling → license → registry and
  version (npm, downloads, bundle size, JSR, release, tag) → last commit,
  stars, issues → quality and CI. In an existing block keep the user's
  order and insert new badges at their default-order slot; offer a reorder
  as a proposed fix.
- Show the rendered block in a fenced `html` block. For an existing README,
  also show a unified diff of the README.
- Write only after the user approves. After writing, run `git diff` on the
  README and confirm it matches the preview.

## Repair rules

Apply these in add + repair; in audit, report each as an issue.

- **Style:** every `img.shields.io` src carries `style=flat-square`;
  replace any other `style=` value. This covers custom shields.io badges
  too: change only the `style=` parameter and leave the rest of the URL
  alone. Third-party images stay as served.
- **Markup:** `alt` before `src`; two-space indent; `></a>` on its own line,
  four spaces in, right after `src`; no blank lines inside the block.
- **Facts:** fix a wrong owner, repo, branch, workflow file, or package
  name to match step 1.
- **Alt text:** keep the user's alt. Report an empty alt as an issue; report
  a vague one (`GitHub` on a license badge) as an optional fix.
- **Markdown badges:** offer conversion to the HTML block; convert only on
  a yes.
- **Dead service:** flag it with the failing check. Removing a badge always
  needs the user's yes, whatever its state.

## Audit report

Reply with one table, then stop:

| Badge | Status | Issue | Proposed fix |
|---|---|---|---|
| npm version | ⚠️ | no `style=flat-square` | append `?style=flat-square` |
| Maintainability | ⚠️ | `src` before `alt` | swap attributes |

Status is ✅ (all checks pass, markup clean), ⚠️ (markup or style issue),
or ❌ (a verification check failed). List one row per issue; a clean badge
gets a single ✅ row. Offer to apply the fixes in add + repair mode.
