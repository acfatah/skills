# Setup

Setup detail for the [`issue-tracker`](../SKILL.md) skill: local files,
Turso sync, and what to watch for. Claude never creates Turso databases or
tokens; the user does.

## Local files

Every project keeps its issues under `<root>/.claude/`, or in the directory
a `CLAUDE.md` declares:

```text
.claude/
├── issues.sqlite3                  # local store; full mirror on Turso projects
├── issues.outbox.jsonl             # offline queue
├── issues-security.sqlite3
└── issues-security.outbox.jsonl
```

- **Never committed.** On first use the CLI adds `.claude/issues*` to
  `info/exclude`, not to the tracked `.gitignore`.
- **One root per repo.** In a linked worktree the files live in the main
  checkout, so they survive when the worktree is removed.

## Privacy

Turso sync is opt-in per project. Before enabling it, know that:

- **Issues leave the machine.** Enabling Turso sends issues, security
  findings included, to a third party.
- **At-rest encryption is not secrecy.** Turso's encryption protects its
  disks, not your data from the service itself.
- **Security issues get their own database and token.** Never share or
  commit either token.
- **Client or third-party code:** keep its security findings local only.

## Turso

One project uses two databases, each with its own token, so a leaked token
exposes one project's issues and never its security findings. The security
database is optional; without it, security issues stay local.

1. **Install the Turso CLI and log in:** see https://docs.turso.tech/cli.
2. **Create the databases:**

   ```bash
   turso db create <project>-issues
   turso db create <project>-security
   ```

3. **Get their URLs:** `turso db show <db> --url` prints a `libsql://` URL.
4. **Create one token per database:**

   ```bash
   turso db tokens create <project>-issues --expiration never
   turso db tokens create <project>-security --expiration never
   ```

5. **Store each token in an environment variable** on every machine, for
   example in `~/.bashrc`:

   ```bash
   export DEMO_ISSUES_TOKEN="<token>"
   export DEMO_SECURITY_TOKEN="<token>"
   ```

6. **Enable it for the project,** from inside the repo:

   ```bash
   bun <skill directory>/scripts/issues.js remote enable \
     --issues-url libsql://<project>-issues-<org>.turso.io --token-env DEMO_ISSUES_TOKEN \
     --security-url libsql://<project>-security-<org>.turso.io --security-token-env DEMO_SECURITY_TOKEN
   ```

   An empty remote gets the local rows, ids kept. On a second machine with
   no local rows, the same command pulls them. When both sides have rows it
   refuses; run `export --out <file>` first.

7. **Check it:** `remote status` shows the backend, the project key, the
   last sync, and queued entries.

To go back to local only, run `remote disable`. It sends queued entries,
pulls a final copy, and leaves the Turso databases untouched.

### Revoking a token

If a machine or a token leaks, revoke every token for that database and
issue a new one:

```bash
turso db tokens invalidate <db>
turso db tokens create <db> --expiration never
```

## Configuration

The CLI keeps a user-level config at
`$XDG_CONFIG_HOME/issue-tracker/config.json`, by default
`~/.config/issue-tracker/config.json`, or `%APPDATA%\issue-tracker\config.json`
on Windows. `remote enable` writes it with mode `0600`, and the CLI warns
when others can read it.

```json
{
  "projects": {
    "github.com/acfatah/skills": {
      "backend": "turso",
      "issues":   { "url": "libsql://…", "tokenEnv": "SKILLS_ISSUES_TOKEN" },
      "security": { "url": "libsql://…", "tokenEnv": "SKILLS_SECURITY_TOKEN" }
    }
  },
  "dirs": { "/abs/path/no-remote-repo": "my-slug" }
}
```

- **Project key:** the `origin` URL without scheme, user, or `.git`, such as
  `github.com/acfatah/skills`. It is the same on every machine.
- **No origin remote:** `remote enable --slug <name>` records a slug for the
  checkout under `dirs`.
- **Tokens:** `tokenEnv` names an environment variable; `token` holds the
  token itself. Never put either in a repo or a `CLAUDE.md`.
- **Local projects** need no entry at all.

## Gotchas

- **The outbox is local.** Deleting or re-cloning a repo loses issues and
  notes still queued offline. Run `flush` first.
- **Provisional ids are temporary.** `P1` becomes a real id on replay;
  never use it in a commit message, a PR, or `--parent`.
- **WSL and `/mnt/c`:** SQLite file locking is unreliable on the Windows
  drives mounted in WSL. Keep repos in the Linux filesystem, such as
  `~/projects`.
- **Cloud sandboxes:** a token in a sandbox's environment is readable by
  whatever runs there. Never put the security token in one.
- **Exports hold everything.** `export --out` writes security findings
  too, with mode `0600`. Keep the file out of any repo.
