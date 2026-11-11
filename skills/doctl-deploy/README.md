# doctl-deploy

An [agent skill](https://skills.sh) that provisions a DigitalOcean Droplet
with `doctl` and deploys a git repo to it. The first run imports your SSH
key, creates the Droplet, a cloud firewall and an optional reserved IP,
and bootstraps a systemd service. Every run then pulls the branch, builds,
restarts the service and checks its health. Each command that creates,
changes or costs money is confirmed one at a time, unless you type
`--yes`, and every run ends with a detailed log of what ran.

## What it is

- **Provision and deploy** one Droplet per app: SSH key, Droplet,
  firewall applied by tag, optional reserved IP, cloud-init and a
  one-time bootstrap, then git pull, build, restart and health check.
- **Confirms each mutating command,** showing the exact command, what it
  changes and its monthly cost, with **Run**, **Skip this step** or
  **Stop**. Read-only commands run without asking.
- **`--yes` skips the prompts,** for that run only, and only when you type
  it. It still asks before a `git push`, a deploy-key upload, a context
  switch, or a rollback.
- **Ends with an action log:** every mutating command in order, with its
  result (IDs, IPs, commits), skipped or failed status and time, plus the
  resources now billing and the rollback command.
- **Pins the `doctl` context** with `--context` on every command, and
  never runs `doctl auth switch`.
- **Rolls back** to the previous commit when the health check fails, after
  asking.
- **Keeps settings in `.do/droplet.yaml`,** which Claude writes with you on
  the first run. It holds no secrets.

## What it is not

- **Not a deleter.** It prints `doctl … delete` commands for you to run;
  it never runs them.
- **Not a token handler.** You sign in with `doctl auth init`; the skill
  never asks for or passes a token.
- **Not App Platform, Kubernetes or Container Registry.** It covers
  Droplets only.
- **Not a server manager.** Resize, snapshots, backups, volumes, DNS and
  load balancers are not covered.

## When not to use

- **An App Platform app or a `.do/app.yaml` spec** → use `doctl apps` by
  hand; this skill is Droplets only.
- **Removing a Droplet** → run the `doctl compute droplet delete` command
  yourself; the skill prints it but won't run it.
- **Docker images or prebuilt artifacts** → not covered; the skill deploys
  by git pull and builds on the Droplet.
- **Several Droplets behind one tag** → not covered; the skill stops when
  a tag matches more than one.

**Negative example:** "Delete my staging droplet" should not run anything;
Claude prints the delete command and stops.

## Install

```bash
bunx skills add acfatah/skills -s doctl-deploy -a claude-code -g -y
```

For local development, link the folder instead:

```bash
ln -sfn "$PWD/skills/doctl-deploy" ~/.claude/skills/doctl-deploy
```

## Requirements

- **[`doctl`](https://docs.digitalocean.com/reference/doctl/) 2.x,**
  signed in. Run `doctl auth init` yourself; check with
  `doctl account get`.
- **An SSH key pair,** such as `~/.ssh/id_ed25519`.
- **A git remote** the Droplet can read. For a private repo, the skill
  offers a deploy key, agent forwarding, or HTTPS for a public repo.
- **[GitHub CLI (`gh`)](https://cli.github.com),** only to add a deploy
  key.

## Cost

Droplets bill from the moment they are created, even when powered off.
The skill shows each size's monthly price before creating it, and totals
what is billing in the final report. Reserved IPs are free while
assigned.

## Usage

### How it loads

- **By description match.** "Deploy to DigitalOcean", "deploy to my
  droplet", "create a droplet", "provision a droplet", or naming `doctl`.
- **By name, always.** `/doctl-deploy`, with `--yes` to skip prompts.
- **What Claude asks back:** the config values on the first run (name,
  region, size, repo, build and start commands, health URL); which
  context when you have several; how the Droplet reads a private repo;
  whether to push unpushed commits; and Run, Skip or Stop for each
  mutating command.

### Example prompts

- **First deploy:** "Deploy this app to a new DigitalOcean droplet in
  sgp1."
- **Redeploy:** "Deploy the latest main to my droplet."
- **No prompts:** "/doctl-deploy --yes"
- **Rollback:** "The deploy broke the site, roll back the droplet."
- **Sizing:** "Create a droplet for this app, cheapest size that fits."
- **Other account:** "Deploy using my work doctl context."

### Walkthrough

1. **Ask.** "Deploy this app to DigitalOcean." Claude checks
   `doctl account get`, then writes `.do/droplet.yaml` with you.
2. **Provision.** No Droplet has the tag, so Claude shows the context
   line, then asks before each step: import key, create the Droplet
   (with its price), create the firewall, run the bootstrap.
3. **Deploy.** Claude records the Droplet's commit, then asks before
   fetch, build and restart. The health check runs without asking.
4. **Report.** A one-line result, the action log table, what is now
   billing, and the rollback command.

Gotchas: billing on powered-off Droplets, `--wait` returning before SSH
is ready, aging image slugs, and host keys on a reused reserved IP are
covered in [`SKILL.md` → Gotchas](SKILL.md#gotchas), with the full rules.
