# GitHub

GitHub detail for the [`issue-tracker`](../SKILL.md) skill. Every write here
needs the user's agreement first.

A `CLAUDE.md` that declares the issues folder may also name the target
repository for each issue; follow it.

## Requirements

- `gh` is installed and logged in: `gh auth status`.
- GitHub Projects need the `project` scope: `gh auth refresh -s project`.
  This is interactive, so ask the user to run it as `! gh auth refresh -s
  project`.

## Promoting a local issue

Only when the user asks:

1. **Labels:** create any that are missing; see [Labels](#labels).
2. **Body:** write the issue body to a temp file **without its
   `## Sub-issues` section**. Local ids like `0008` mean nothing on GitHub;
   step 5 adds the real links.
3. **Issue:**

   ```bash
   gh issue create --title "<title>" --body-file <body.md> \
     --label "bug,priority:medium" --milestone "v1.0"
   ```

   Pass `--milestone` only when the repo milestone exists; see
   [Milestones](#milestones).
4. **Project:** add it to the `Issues` Project and set its Status; see
   [Projects](#projects).
5. **Sub-issues:** see [Sub-issues](#sub-issues).
   - If its `parent` is already on GitHub, link it under that parent.
   - Link each child already on GitHub under it. Children still local get
     linked when they are promoted.
6. **Local file:** set `github: <issue-url>`, `resolution: moved`, `closed`,
   and `updated`, then move it to `closed/`.

From then on, **GitHub is the source of truth** for that issue. The local
file keeps the history and the link.

## Milestones

Milestones belong to one repo. `gh` has no milestone subcommand, so use the
API:

```bash
gh api repos/{owner}/{repo}/milestones --jq '.[].title'   # list open ones
gh api repos/{owner}/{repo}/milestones -f title="v1.0" \
  -f description="First public release" -f due_on="2026-12-01T00:00:00Z"
```

Record the milestone URL in `MILESTONES.md`.

## Sub-issues

The API needs the child's internal id, not its number:

```bash
child_id=$(gh api repos/{owner}/{repo}/issues/<child-number> --jq .id)
gh api repos/{owner}/{repo}/issues/<parent-number>/sub_issues \
  -F sub_issue_id="$child_id"
```

## Closing

```bash
gh issue close <number> --reason completed                    # done
gh issue close <number> --reason "not planned"                # wont-fix, invalid
gh issue close <number> --duplicate-of <original-number-or-url>  # duplicate
```

Also add the matching default label: `wontfix`, `invalid`, or `duplicate`.

## Labels

Type and priority become labels, because GitHub Issue Types exist only for
organizations. Reuse GitHub's default labels where they fit; create the rest
with these colors, the same in every repo.

| Label             | For                     | Color    | Source  |
|-------------------|-------------------------|----------|---------|
| `bug`             | type `bug`              | default  | default |
| `enhancement`     | type `feature`          | default  | default |
| `documentation`   | type `docs`             | default  | default |
| `question`        | type `question`         | default  | default |
| `idea`            | type `idea`             | `C5DEF5` | new     |
| `feedback`        | type `feedback`         | `BFDADC` | new     |
| `task`            | type `task`             | `1D76DB` | new     |
| `chore`           | type `chore`            | `EDEDED` | new     |
| `refactor`        | type `refactor`         | `5319E7` | new     |
| `priority:high`   | priority `high`         | `B60205` | new     |
| `priority:medium` | priority `medium`       | `D93F0B` | new     |
| `priority:low`    | priority `low`          | `FBCA04` | new     |
| `duplicate`       | resolution `duplicate`  | default  | default |
| `wontfix`         | resolution `wont-fix`   | default  | default |
| `invalid`         | resolution `invalid`    | default  | default |

Create the new labels before the first promotion in a repo. `--force`
updates a label that already exists, so this block is safe to rerun:

```bash
gh label create idea            --color C5DEF5 --force
gh label create feedback        --color BFDADC --force
gh label create task            --color 1D76DB --force
gh label create chore           --color EDEDED --force
gh label create refactor        --color 5319E7 --force
gh label create priority:high   --color B60205 --force
gh label create priority:medium --color D93F0B --force
gh label create priority:low    --color FBCA04 --force
```

If a repo has deleted a default label, recreate it with
`gh label create <name> --force`.

## Projects

One **user-level Project titled `Issues`**, owned by `@me`, holds issues from
every repo. Its built-in Repository field shows where each comes from.

### Find the Project

Look up its number by title each time; it is never hardcoded:

```bash
gh project list --owner @me --format json \
  --jq '.projects[] | select(.title=="Issues") | .number'
```

Empty output means it doesn't exist yet: offer the setup below.

### Setup (once)

1. Make sure the `project` scope is present; see
   [Requirements](#requirements).
2. Create it: `gh project create --owner @me --title "Issues"`.
3. Ask the user to set the **Status** field options in the web UI to
   `Triage`, `Open`, `In progress`, `Blocked`, `Done`, and to turn on the
   built-in workflow "Item closed → Done".

### Add an issue

```bash
gh project item-add <number> --owner @me --url <issue-url> --format json
```

The output holds the item id needed to set fields.

### Set Status

Status changes need ids, so look them up first:

```bash
gh project view <number> --owner @me --format json --jq .id
gh project field-list <number> --owner @me --format json
gh project item-edit --id <item-id> --project-id <project-id> \
  --field-id <status-field-id> --single-select-option-id <option-id>
```

- New promoted issue: `Open`, or `Triage` if not yet triaged.
- Work starts: `In progress`. Waiting: `Blocked`.
- Closed issue: `Done`, set by the "Item closed → Done" workflow.

### One-way sync

Sync goes **local → GitHub only**. Once promoted, GitHub owns the issue and
the local file is a closed record with the link. Issues created directly on
GitHub stay there.

## Local to GitHub mapping

| Local                             | GitHub                                         |
|-----------------------------------|------------------------------------------------|
| `title`                           | Issue title                                    |
| Body                              | Issue body (`--body-file`)                     |
| Body `## Sub-issues` mirror       | Dropped; replaced by sub-issue links           |
| Body `## Steps` checklist         | Copied as a plain checklist                    |
| `type`                            | Label, see [Labels](#labels)                   |
| `priority: high`                  | Label `priority:high`                          |
| `labels`                          | Labels with the same names                     |
| `milestone`                       | Repo milestone with the same title             |
| `parent`                          | Sub-issue link to the parent                   |
| Folder `triage/`                  | Project Status `Triage`                        |
| Folder `open/`                    | Project Status `Open`                          |
| Folder `in-progress/`             | Project Status `In progress`                   |
| Folder `blocked/`                 | Project Status `Blocked`                       |
| `resolution: done`                | Closed as `completed`, Status `Done`           |
| `resolution: wont-fix`            | Closed as `not planned` + label `wontfix`      |
| `resolution: invalid`             | Closed as `not planned` + label `invalid`      |
| `resolution: duplicate`           | `--duplicate-of <original>` + label `duplicate` |
| `created`, `updated`              | Set by GitHub; not copied                      |
| `type: security`                  | Never an issue; private security advisory only |
