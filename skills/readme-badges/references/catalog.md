# Badge catalog

Templates for the [`readme-badges`](../SKILL.md) skill. Every row was checked
against live shields.io and qlty endpoints.

## Placeholders

| Placeholder | Value |
|---|---|
| `<o>`, `<r>` | GitHub owner and repo, from the `origin` remote |
| `<branch>` | Default branch |
| `<pkg>` | Package name, URL-encoded: `@scope/name` → `%40scope%2Fname` |
| `<pkg-raw>` | Package name as written: `@scope/name` |
| `<wf>` | Workflow file name, e.g. `ci.yml` |
| `<license-file>` | The license file as named in the repo, e.g. `LICENSE`, `LICENSE.md` |

Append `style=flat-square` to every `img.shields.io` URL: `?style=flat-square`
when the URL has no query yet, `&style=flat-square` when it has one. The
templates below already include it. Leave third-party images (qlty) exactly
as served.

## Runtime and tooling

Static badges, one template:

```
https://img.shields.io/badge/<Label>-%23<hex>.svg?style=flat-square&logo=<slug>&logoColor=<logo-color>
```

| id | Label / alt | slug | hex | logo-color | href | Detect |
|---|---|---|---|---|---|---|
| bun | `Bun` | `bun` | `000000` | `white` | `https://bun.sh` | `bun.lock`, `bun.lockb`, `bunfig.toml`, `"packageManager": "bun@…"` |
| node | `Node.js` | `nodedotjs` | `5FA04E` | `white` | `https://nodejs.org` | `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `.nvmrc`, `engines.node` |
| deno | `Deno` | `deno` | `000000` | `white` | `https://deno.com` | `deno.json`, `deno.jsonc`, `deno.lock` |
| typescript | `TypeScript` | `typescript` | `3178C6` | `white` | `https://www.typescriptlang.org` | `tsconfig.json`, `typescript` in dependencies |
| javascript | `JavaScript` | `javascript` | `F7DF1E` | `black` | `https://developer.mozilla.org/en-US/docs/Web/JavaScript` | `package.json` with no TypeScript |
| vue | `Vue.js` | `vuedotjs` | `4FC08D` | `white` | `https://vuejs.org` | `vue` in dependencies |
| vite | `Vite` | `vite` | `9135FF` | `white` | `https://vite.dev` | `vite` in dependencies, `vite.config.*` |
| nuxt | `Nuxt` | `nuxt` | `00DC82` | `white` | `https://nuxt.com` | `nuxt` in dependencies, `nuxt.config.*` |

- Slugs and hex values come from simple-icons (`simpleicons.org`, data at
  `https://cdn.jsdelivr.net/npm/simple-icons@latest/data/simple-icons.json`).
  For a tool not listed, look it up there.
- Escape the label: `-` → `--`, `_` → `__`, space → `%20`.
- **Exists check:** none needed; the image check covers it. An unknown slug
  still returns 200 and simply drops the logo, so the image check must find
  `data:image` in the SVG.

## Repo meta

| id | Alt | src | href | Detect | Exists check |
|---|---|---|---|---|---|
| license | `License` | `https://img.shields.io/github/license/<o>/<r>?style=flat-square` | `./<license-file>` | `LICENSE*` file | the file exists; message is not `not specified` |
| last-commit | `Last commit` | `https://img.shields.io/github/last-commit/<o>/<r>?display_timestamp=committer&style=flat-square` | `https://github.com/<o>/<r>/commits/<branch>` | any GitHub repo | repo is public |
| stars | `GitHub stars` | `https://img.shields.io/github/stars/<o>/<r>?style=flat-square` | `https://github.com/<o>/<r>` | any GitHub repo | repo is public |
| issues | `Open issues` | `https://img.shields.io/github/issues/<o>/<r>?style=flat-square` | `https://github.com/<o>/<r>/issues` | issues enabled | `gh repo view --json hasIssuesEnabled` |
| release | `Latest release` | `https://img.shields.io/github/v/release/<o>/<r>?style=flat-square` | `https://github.com/<o>/<r>/releases/latest` | a GitHub release exists | `gh release list -L 1` is not empty |
| tag | `Latest tag` | `https://img.shields.io/github/v/tag/<o>/<r>?style=flat-square` | `https://github.com/<o>/<r>/tags` | tags but no releases | `git ls-remote --tags origin` is not empty |

- **No GitHub remote:** offer `license-static` instead of `license`:
  `https://img.shields.io/badge/license-<spdx>-blue.svg?style=flat-square`,
  with `<spdx>` read from the license file (e.g. `MIT`) and the same
  `./<license-file>` link. Drop every other row in this table.
- Every `github/*` badge needs a **public** repo. For a private repo shields
  answers `repo not found`; tell the user before they pick these.
- Link stars to the repo page: `/stargazers` answers 404 to logged-out
  visitors.

## Package registry

| id | Alt | src | href | Detect | Exists check |
|---|---|---|---|---|---|
| npm | `npm version` | `https://img.shields.io/npm/v/<pkg>?style=flat-square` | `https://www.npmjs.com/package/<pkg-raw>` | `package.json` with a `name` and no `"private": true` | `https://registry.npmjs.org/<pkg>` returns 200 |
| npm-downloads | `npm downloads` | `https://img.shields.io/npm/dm/<pkg>?style=flat-square` | `https://www.npmjs.com/package/<pkg-raw>` | as npm | as npm |
| bundle-size | `Bundle size` | `https://img.shields.io/bundlejs/size/<pkg>?style=flat-square` | `https://bundlejs.com/?q=<pkg>` | as npm, for browser libraries | as npm |
| jsr | `JSR` | `https://img.shields.io/jsr/v/<pkg-raw>?style=flat-square` | `https://jsr.io/<pkg-raw>` | `jsr.json`, or `deno.json` with `name` and `exports` | `https://jsr.io/<pkg-raw>/meta.json` returns 200 |

- Package name comes from `package.json` (npm) or `jsr.json` / `deno.json`
  (JSR).
- Use `bundlejs`, not `bundlephobia`: shields' bundlephobia badge is often
  `rate limited by upstream service`.
- `npmjs.com` answers 403 to curl (a bot wall). For npm links the exists
  check against the registry stands in for the link check.

## Quality and CI

| id | Alt | src | href | Detect | Exists check |
|---|---|---|---|---|---|
| qlty-maintainability | `Maintainability` | `https://qlty.sh/gh/<o>/projects/<r>/maintainability.svg` | `https://qlty.sh/gh/<o>/projects/<r>` | `.qlty/` directory, a qlty step in a workflow | the image returns 200 (404 when no project) |
| qlty-coverage | `Code coverage` | `https://qlty.sh/gh/<o>/projects/<r>/coverage.svg` | `https://qlty.sh/gh/<o>/projects/<r>` | as above, plus coverage upload | as above |
| actions | the workflow's `name:` | `https://img.shields.io/github/actions/workflow/status/<o>/<r>/<wf>?branch=<branch>&style=flat-square` | `https://github.com/<o>/<r>/actions/workflows/<wf>` | each file in `.github/workflows/`; offer one badge per workflow | the file exists; message is not `repo or workflow not found` |
| codecov | `Codecov` | `https://img.shields.io/codecov/c/github/<o>/<r>?style=flat-square` | `https://codecov.io/gh/<o>/<r>` | `codecov.yml`, a codecov action in a workflow | message is not `unknown` |

- The qlty project page redirects curl to a login page, so its link check
  passes on 200 regardless. The image check is the real test.
- `branch=<branch>` keeps the CI badge on the default branch, not the
  latest run of any branch.

## Block template

The canonical block. One `<a>` per badge, two-space indent, `alt` before
`src`, and `></a>` on the line after `src` so no whitespace sits between
the image and the closing tag (that whitespace renders as a gap):

```html
<p>
  <a href="https://bun.sh">
    <img
      alt="Bun"
      src="https://img.shields.io/badge/Bun-%23000000.svg?style=flat-square&logo=bun&logoColor=white"
    ></a>
  <a href="./LICENSE">
    <img
      alt="License"
      src="https://img.shields.io/github/license/acfatah/memory-cache?style=flat-square"
    ></a>
</p>
```

- No blank line inside the block: a blank line ends the HTML block in
  Markdown, and the rest renders as text.
- One blank line before and after the block.
