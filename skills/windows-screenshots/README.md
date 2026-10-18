# windows-screenshots

An [agent skill](https://skills.sh) that teaches AI coding agents where to find
your Windows screenshots (Win+PrtScn, Snipping Tool) and how to search them
sensibly - from WSL or native Windows shells (Git Bash, PowerShell, cmd).

## What it is

- **Locates** the screenshots folder via the `SCREENSHOTS` environment
  variable, with auto-detection guidance when unset.
- **Scopes searches** to today's screenshots by default - "look at my
  screenshot" almost never means one from three years ago.
- **Picks the "latest"** screenshot by filename timestamp within the modern
  `Screenshot YYYY-MM-DD HHMMSS.png` pattern, avoiding traps from OneDrive
  mtime churn, legacy `Screenshot_YYYYMMDD_*` names, and hand-renamed files.
- **Reads screenshots visually** (agents with an image-capable Read tool)
  instead of just listing filenames.
- **Knows the sharp edges:** `desktop.ini` noise, OneDrive sync lag,
  non-standard capture tool naming.

## What it is not

- **Not a screen-capture tool.** It finds and reads captures already in your
  Screenshots folder, taken with Win+PrtScn or Snipping Tool.
- **Not for macOS or Linux screenshots.** Off Windows, with no `/mnt/c`,
  Claude says the skill targets Windows screenshots and asks for a path.
- **Not a history search by default.** It looks only at today's captures
  unless you name a date or a range, or ask for all or the latest ever.

## When not to use

- **No Windows host and no `SCREENSHOTS`** → give Claude the image's path
  directly.
- **An image saved somewhere else,** such as Downloads → give Claude the
  path; the skill only looks in the `SCREENSHOTS` folder.
- **An image you can paste or attach** → paste it into the chat; no folder
  search is needed.

**Negative example:** "Take a screenshot of this page" should not load it; it
reads captures you already took, it does not take new ones.

## Install

```bash
bunx skills add acfatah/skills -s windows-screenshots
```

Or directly for a specific agent, globally:

```bash
bunx skills add acfatah/skills -s windows-screenshots -a claude-code -g -y
```

## Configuration

The skill requires the `SCREENSHOTS` environment variable to point at your
Windows screenshots folder.

WSL - add to `~/.profile` (not below the interactive guard in `.bashrc`, or
non-interactive agent shells will not see it):

```bash
echo 'export SCREENSHOTS="/mnt/c/Users/<winuser>/OneDrive/Pictures/Screenshots"' >> ~/.profile
```

Native Windows - one command covers Git Bash, PowerShell, and cmd (new
sessions):

```cmd
setx SCREENSHOTS "C:\Users\<user>\OneDrive\Pictures\Screenshots"
```

Git Bash note: the `setx` value arrives in Windows form (`C:\...`) with
backslashes, which break bash wildcard matching. The skill normalizes it with
`cygpath -u` before use, yielding the `/c/Users/...` form Git Bash reports
natively.

Tip: if you are unsure of the real folder name, check both
`OneDrive\Pictures\Screenshots` and `Pictures\Screenshots` - Windows redirects
Pictures into OneDrive when Known Folder Backup is on, and sync conflicts can
leave a `Screenshots 1` folder behind. File Explorer may display a localized
alias, so verify the on-disk name with `dir` or `ls`.

## Usage

### How it loads

- **By description match.** Mention a screenshot you took, or ask to find,
  view, compare, or attach one. "Screen capture", "snip", and "the image I
  just captured" work too.
- **By name, always.** `/windows-screenshots …` or "use the
  windows-screenshots skill".
- **What Claude asks back:** which one you meant, with the 5 newest shown,
  when none were taken today; which folder to use when `SCREENSHOTS` is unset
  and detection finds none or several; a path, off Windows.

### Example prompts

- **Look:** "Look at my screenshot." / "The screenshot I just took shows the
  error; what's wrong?" Claude reads the image, not just its name.
- **Latest:** "Check the latest screenshot." Newest means by filename
  timestamp, not modification time.
- **List:** "List today's screenshots."
- **Other dates:** "Find that capture from yesterday." Naming a date widens
  the default today scope.
- **Compare:** "Compare my last two snips."
- **By name:** "/windows-screenshots list every screenshot from 2026-10-01."

### Walkthrough

First use, with `SCREENSHOTS` unset:

1. **Ask.** "Look at my screenshot."
2. **Locate.** Claude checks the OneDrive and Pictures Screenshots folders,
   OneDrive first. With one match it uses it; otherwise it shows what it
   found and asks which.
3. **Read.** It filters today's captures by filename and reads the one you
   mean as an image.
4. **Persist.** It tells you how to keep the folder, with the `~/.profile` or
   `setx` command shown under Configuration.

Gotchas: `desktop.ini` noise, other capture tools' file names, and OneDrive
sync lag are covered in [SKILL.md → Gotchas](SKILL.md#gotchas).

The full rules are in [`SKILL.md`](SKILL.md).

## Versioning

The version lives in exactly one place: the H1 title of [SKILL.md](SKILL.md)
(e.g. `# Windows Screenshots v1.0.0`). Keeping it to a single location is
deliberate - a second copy (README, a tag, a metadata field) would drift out
of sync. The frontmatter `name:` is never versioned; it is the install
identity.

Bump rules (semver-ish):

- patch - wording, gotcha, or example tweaks with no behavior change
- minor - new commands, sections, or platform coverage
- major - a change to the config or behavior contract (e.g. renaming the
  `SCREENSHOTS` env var)

Release flow: edit the H1 version in the same commit as the change,
`git push`, then consumers refresh with `bunx skills update -g` (or
`bunx skills update -g`).

## License

[MIT](../../LICENSE)
