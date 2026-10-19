# Production Runbook

How the vet agent is built, deployed, verified, rolled back, backed up and kept secure. Pipeline files: `.github/workflows/{ci,cd,deploy,production}.yml`; VM stack: `docker-compose.deploy.yml`.

## How it fits together

| Event | Workflow | Result |
|---|---|---|
| Pull request to `main` | `ci.yml` | `test` (unit tests) and `docker` (`npm run test:docker`, builds the image and runs it) |
| Push to `main` | `cd.yml` | CI, then publish `ghcr.io/<owner>/<repo>` tagged `sha-<short>` and `latest`, then deploy that `sha-` tag to **staging** |
| Push of a `v*` tag | `cd.yml` | CI, then publish `1.2.3` and `1.2` tags. No deploy. |
| Manual run | `production.yml` | Deploy a chosen, already-published tag to **production**, after reviewer approval |

Publishing authenticates with the built-in `GITHUB_TOKEN` (`packages: write` on the publish job only). There is no registry secret to create or rotate. The image name is derived from the repository and lower-cased automatically.

Staging and production run the identical `deploy.yml`. Until `DEPLOY_HOST` is set on an environment, its deploy job logs a notice (“Deploy skipped”) and succeeds, so CD stays green before infrastructure exists.

## One-time repository setup

1. **Environments** (Settings → Environments): create `staging` and `production`. On `production`, enable **Required reviewers** (and optionally restrict deployment branches).
2. **Per environment**, set exactly these (values differ between staging and production):

   | Kind | Name | Value |
   |---|---|---|
   | Secret | `DEPLOY_SSH_KEY` | Private key of a dedicated deploy key pair (e.g. `ssh-keygen -t ed25519 -f deploy_key -N ''`) |
   | Secret | `DEPLOY_KNOWN_HOSTS` | The VM's pinned host key line(s): `ssh-keyscan -t ed25519 <host>` run from a trusted network, checked against the fingerprint printed on the VM (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`) |
   | Variable | `DEPLOY_HOST` | VM hostname or IP. Leave unset to keep the environment a no-op. |
   | Variable | `DEPLOY_USER` | SSH user on the VM (must be able to run `docker`) |
   | Variable | `APP_URL` | URL the smoke test calls, e.g. `https://clinic.internal` (no trailing slash) |

   `OPENROUTER_API_KEY` is **not** a GitHub secret. It lives only in the VM's `.env` (below) and is never baked into the image.
3. **Packages**: the image is private by default. Deploys work as-is: the deploy job logs the VM in to ghcr.io with its short-lived job token for the pull, then logs out. If the package is linked to a different repository, grant this repository read access under the package's settings.
4. **Branch protection** on `main` (Settings → Branches): require status checks to pass, selecting **`test`** and **`docker`** (these are the job names as GitHub displays them for PRs; they only appear in the picker after CI has run once). Require branches to be up to date and block direct pushes.

## VM bootstrap (once per environment)

Requirements: Linux, Docker Engine with the Compose plugin v2, and an SSH user in the `docker` group.

```bash
mkdir -p ~/vet-agent && cd ~/vet-agent
install -m 600 /dev/null .env
$EDITOR .env
```

Minimum `.env` (see `.env.example` for every option):

```
OPENROUTER_API_KEY=<key>
ALLOWED_HOSTS=clinic.internal          # hostname(s) clients and the smoke test use
```

Add the deploy public key to the SSH user's `~/.ssh/authorized_keys`.

**Network exposure.** The app has no login. The compose file publishes it on `127.0.0.1:3000` only, so it is unreachable from the network until you put an **authenticating reverse proxy** on the VM (TLS plus basic auth, SSO, or an IP allowlist) that forwards to `127.0.0.1:3000`. Never publish port 3000 on `0.0.0.0`. Exposing patient data to the public internet is unsupported (see README, security section).

**Host allowlist.** The app rejects requests whose `Host` header is not loopback, `HOST`, or listed in `ALLOWED_HOSTS` (403 “Host not allowed”). The hostname in `APP_URL` must therefore be in `ALLOWED_HOSTS`, and the proxy must forward that host name (preserve the `Host` header).

The first pipeline run copies `docker-compose.deploy.yml` into `~/vet-agent` and starts the stack as compose project `vet-agent`; the data volume is `vet-agent_vet-memory`.

## Deploy to production

1. Pick the image: a `sha-<short>` tag already running on staging, or a release tag's semver image. Release `v1.2.3` is published as `1.2.3` (and `1.2`); the `v` is dropped.
2. Actions → **Deploy production** → **Run workflow** → enter the tag.
3. A required reviewer approves the `production` deployment.
4. The job checks the tag exists in ghcr.io, pulls it on the VM, records the running tag in `~/vet-agent/.previous-tag`, runs `docker compose up -d --wait`, then smoke-tests `$APP_URL/health` (5 retries, 5 s apart).
5. If the switch or smoke test fails, the job restores the tag in `.previous-tag`, fails the run, and opens a GitHub issue titled “Deploy failed: <env> <tag>” with the run link and rollback outcome. With no recorded previous tag (first ever deploy) there is nothing to restore; the failed container stays up and the issue says so.

Deploys to one environment never overlap; a second queues behind the first.

## Verify

```bash
curl -fsS https://<APP_URL host>/health            # {"status":"ok"}
cd ~/vet-agent
docker compose -f docker-compose.deploy.yml ps     # app: running (healthy)
docker inspect --format '{{.Config.Image}}' $(docker compose -f docker-compose.deploy.yml ps -q app)
docker compose -f docker-compose.deploy.yml logs --tail 50 app
```

Expected startup log line (ISO-timestamped): `Vet clinic agent front end running at http://0.0.0.0:3000`. Logs go to stdout/stderr (`docker logs`).

## Roll back

**Via the pipeline (preferred):** run **Deploy production** again with an older published tag. This reuses the same checks and audit trail.

**Manually on the VM** (the previous image is still cached there):

```bash
cd ~/vet-agent
cat .previous-tag
export IMAGE_REPO=<owner>/<repo>               # lower-case
IMAGE_TAG=$(cat .previous-tag) docker compose -f docker-compose.deploy.yml up -d --wait
```

If the image was pruned, log in with `docker login ghcr.io` (a PAT with `read:packages`) first. Rolling back does not undo data changes; use the data recovery steps below if records were affected.

## Backup and restore of `agent-home/memory`

Patient and visit data (`patients.json`, `visits.json`) and the app's own `backups/` directory live in the named volume `vet-agent_vet-memory`. Backups contain patient data: store and transfer them accordingly.

The app already snapshots the data on every change and hourly (`BACKUP_INTERVAL_MS`), keeps the newest `BACKUP_MAX_SNAPSHOTS` (100), and takes a final snapshot on shutdown. Those snapshots are inside the same volume, so they do **not** protect against losing the volume. Take volume-level copies too.

**Volume backup** (safe while running; for a guaranteed-consistent copy stop the app first):

```bash
docker run --rm -v vet-agent_vet-memory:/data:ro -v "$PWD":/backup alpine \
  tar czf /backup/vet-memory-$(date +%F).tgz -C /data .
```

**Volume restore** (replaces current contents):

```bash
cd ~/vet-agent
export IMAGE_REPO=<owner>/<repo> IMAGE_TAG=<current tag>
docker compose -f docker-compose.deploy.yml stop app
docker run --rm -v vet-agent_vet-memory:/data -v "$PWD":/backup alpine \
  sh -c 'rm -rf /data/* /data/.[!.]* 2>/dev/null; tar xzf /backup/vet-memory-<date>.tgz -C /data && chown -R 1000:1000 /data'
docker compose -f docker-compose.deploy.yml up -d --wait
```

(1000 is the image's `node` user.)

**Built-in point-in-time recovery** (`scripts/restore.js`, the same as `npm run restore`; admin-only, not exposed over HTTP). Listing is read-only and safe while running:

```bash
docker compose -f docker-compose.deploy.yml exec app node scripts/restore.js list-snapshots
docker compose -f docker-compose.deploy.yml exec app node scripts/restore.js list-changes
```

Restoring or reverting changes data, so **stop the app first** and run in a one-off container against the same volume:

```bash
docker compose -f docker-compose.deploy.yml stop app
docker compose -f docker-compose.deploy.yml run --rm --no-deps app node scripts/restore.js restore <snapshot-id>
docker compose -f docker-compose.deploy.yml run --rm --no-deps app node scripts/restore.js revert <change-id>   # add --force to override the changed-since check
docker compose -f docker-compose.deploy.yml up -d --wait
```

Each restore or revert saves the previous state as a new snapshot first, so it can itself be undone. Compose needs `IMAGE_REPO` and `IMAGE_TAG` exported as above.

## Secret rotation

- **`OPENROUTER_API_KEY`**: edit `~/vet-agent/.env` on the VM, then `docker compose -f docker-compose.deploy.yml up -d --force-recreate` (with `IMAGE_REPO` and `IMAGE_TAG` set; `.env` is only read at container creation). Revoke the old key at the provider. No GitHub change is needed.
- **SSH deploy key**: generate a new pair, append the new public key to `authorized_keys`, update the `DEPLOY_SSH_KEY` environment secret, run a staging deploy to confirm, then remove the old public key.
- **`DEPLOY_KNOWN_HOSTS`**: update the environment secret after any VM rebuild or host-key change, re-verifying the fingerprint out of band. Deploys refuse unknown or changed host keys by design.
- **Registry credentials**: none stored; the job token expires with each run.

## Shutdown behaviour

On SIGTERM the app stops accepting connections, lets in-flight requests finish, takes a final snapshot and exits. `SHUTDOWN_TIMEOUT_MS` (10 s) forces exit if that stalls; Compose waits `stop_grace_period` (15 s) before SIGKILL, so the app's own limit always fires first. Expected logs: `shutdown: received SIGTERM, closing server` then `shutdown: complete`.

## Constraints

- **Single replica.** State is JSON files on one named volume, written atomically but with no cross-process locking. Never run two app containers on the same volume or scale the service.
- **Image size.** About 566 MB against a 650 MB budget, enforced by `npm run test:docker`. The original 200 MB target was dropped as unachievable with the `node:24-slim` base plus the app's production dependencies.
- Downtime during a deploy is the container restart (a few seconds); `up -d --wait` returns once the healthcheck passes.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Deploy job succeeds but logs “Deploy skipped” | `DEPLOY_HOST` is unset on that environment |
| `Host key verification failed` | `DEPLOY_KNOWN_HOSTS` missing, wrong, or the VM's host key changed; re-pin it |
| `Permission denied (publickey)` | `DEPLOY_SSH_KEY` does not match `authorized_keys` for `DEPLOY_USER` |
| “Verify image exists” fails | Tag mistyped or not published; check the package page. Release `v1.2.3` is tag `1.2.3` |
| `pull access denied` / `unauthorized` on the VM | Package access not granted to this repository (see setup step 3) |
| Compose: `env file .../.env not found` | `.env` not created on the VM |
| Smoke test gets 403 | `APP_URL` hostname missing from `ALLOWED_HOSTS` in the VM's `.env` |
| Smoke test gets 503 / connection refused | App unhealthy: `docker compose ... logs app`; a corrupt `patients.json` or `visits.json` fails `/health` |
| Container restarts at start | Startup check failed (public bind needs `ALLOW_PUBLIC_BIND`, set by the compose file) or invalid `.env`; read the logs |
| Chat replies fail with auth errors | `OPENROUTER_API_KEY` missing or revoked in `.env` |
| Rollback step says nothing to roll back | First deploy, or `.previous-tag` was deleted; deploy a known-good tag |
