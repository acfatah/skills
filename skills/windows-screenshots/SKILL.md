---
name: windows-screenshots
description: Locate, list, and read the user's Windows screenshots (Win+PrtScn, Snipping Tool) from WSL or native Windows shells; the folder location comes from the SCREENSHOTS environment variable. Use whenever the user mentions a screenshot they took or wants one found, viewed, compared, or attached - "look at my screenshot", "check the latest screenshot", "list today's screenshots", "the screenshot I just took", "find that capture from yesterday" - even if they say "screen capture", "snip", or "the image I just captured" instead of "screenshot".
---

# Windows Screenshots v1.0.0

Windows screenshots (Win+PrtScn, Snipping Tool) save to the user's Screenshots folder, usually OneDrive-managed. This skill locates and reads them from WSL or native Windows.

## Location (required config)

The `SCREENSHOTS` environment variable holds the folder path. Reference it in the form native to your shell:

| Shell | Variable | Path shape |
|---|---|---|
| bash (WSL) | `"$SCREENSHOTS"` | `/mnt/c/Users/<winuser>/OneDrive/Pictures/Screenshots` |
| bash (Git Bash) | `"$(cygpath -u "$SCREENSHOTS")"` | `/c/Users/<user>/OneDrive/Pictures/Screenshots` |
| PowerShell | `$env:SCREENSHOTS` | `C:\Users\<user>\OneDrive\Pictures\Screenshots` |
| cmd | `%SCREENSHOTS%` | same as PowerShell |

Detect the environment first: WSL if `$WSL_DISTRO_NAME` is set or `/proc/version` mentions microsoft; Git Bash if `$OSTYPE` is `msys` or `cygwin`; otherwise you are in a native Windows shell. On non-Windows platforms without `/mnt/c`, tell the user this skill targets Windows screenshots and ask for a path if they have one.

Git Bash gotcha: a value set via `setx` arrives in Windows form (`C:\Users\...`), and bash's glob engine treats backslashes as escape characters - wildcard commands silently match nothing. In WSL the variable comes from `~/.profile` already POSIX-form. So in any bash shell, resolve the folder once and use `$SHOTS` from then on (`cygpath` ships with Git Bash):

```bash
SHOTS="$SCREENSHOTS"
[[ "$OSTYPE" == msys* || "$OSTYPE" == cygwin* ]] && SHOTS="$(cygpath -u "$SCREENSHOTS")"
```

## Setup: SCREENSHOTS unset or folder missing

Do not give up - auto-detect candidates, checking OneDrive first (Windows commonly redirects Pictures there):

```bash
# WSL
ls -d /mnt/c/Users/*/OneDrive/Pictures/Screenshots* /mnt/c/Users/*/Pictures/Screenshots* 2>/dev/null
# Git Bash
ls -d "$OneDrive/Pictures/Screenshots"* "$USERPROFILE/Pictures/Screenshots"* 2>/dev/null
```

```powershell
Get-Item "$env:OneDrive\Pictures\Screenshots*", "$env:USERPROFILE\Pictures\Screenshots*" -ErrorAction SilentlyContinue
```

Exactly one match: use it for the current request, then tell the user how to persist it. Zero or multiple matches: show what you found and ask which path to use.

Persisting:

- WSL: `echo 'export SCREENSHOTS="<path>"' >> ~/.profile` - use `~/.profile`, not `~/.bashrc`: exports below the interactive guard in `.bashrc` never reach non-interactive agent shells.
- Native Windows (covers Git Bash, PowerShell, and cmd at once; applies to new sessions): `setx SCREENSHOTS "C:\Users\<user>\OneDrive\Pictures\Screenshots"`

## Default scope: today only

The folder holds years of captures. When the user asks about "my screenshot" they almost always mean one taken today, so limit results to today's date unless they name a different date, a range, or ask for "all" or "the latest ever".

Files are named `Screenshot YYYY-MM-DD HHMMSS.png`, so filtering by filename is reliable even when OneDrive sync perturbs modification times:

```bash
ls -t "$SHOTS"/"Screenshot $(date +%Y-%m-%d)"*.png 2>/dev/null
```

```powershell
Get-ChildItem "$env:SCREENSHOTS" -Filter "Screenshot $(Get-Date -Format yyyy-MM-dd)*.png" | Sort-Object Name -Descending
```

From cmd, delegate to PowerShell (`powershell -NoProfile -Command "..."`) - cmd has no usable date formatting or globbing.

If nothing matches today, do not stop there: say no screenshots were taken today, show the 5 newest overall, and ask which one they meant.

```bash
ls -t "$SHOTS"/*.png | head -5
```

```powershell
Get-ChildItem "$env:SCREENSHOTS" -Filter *.png | Sort-Object LastWriteTime -Descending | Select-Object -First 5
```

## Picking the "latest" screenshot

"Latest" means newest by filename timestamp, not by modification time - OneDrive sync events can touch mtimes out of order. But never lexicographically sort the whole folder: it may also hold legacy `Screenshot_YYYYMMDD_*.png` names and hand-renamed files, and underscore sorts after space in ASCII, so old files float to the top of a plain reverse sort. Sort within the modern pattern instead - its ISO date makes a plain sort chronological:

```bash
ls "$SHOTS"/"Screenshot "2*.png | sort -r | head -1
```

```powershell
Get-ChildItem "$env:SCREENSHOTS" -Filter "Screenshot 2*.png" | Sort-Object Name -Descending | Select-Object -First 1
```

## Reading a screenshot

The Read tool renders `.png` files visually. When the user wants you to look at a screenshot (describe it, debug from it, compare it), Read the file directly instead of only listing it. Pass the path in the form native to your environment - the resolved `$SHOTS` (bash) or `$env:SCREENSHOTS` (PowerShell/cmd) already is.

## Gotchas

- Ignore `desktop.ini` - hidden Windows folder metadata that appears in listings and sorts near the top after syncs.
- Snipping Tool or third-party tools may use other name patterns; if the name filter finds nothing but the user insists a capture exists, widen the search: bash `find "$SHOTS" -newermt today \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' \)`, PowerShell `Get-ChildItem "$env:SCREENSHOTS" | Where-Object LastWriteTime -gt (Get-Date).Date`.
- A screenshot taken on another device may lag behind OneDrive sync by a minute or two; if the user says "I just took it" and it is missing, wait briefly and retry once before concluding it does not exist.
