# Feature: Dockerize Application and CI/CD Pipeline

**Feature ID:** DEVOPS-001  
**Status:** Proposed  
**Priority:** P1  
**Owner:** Platform / DevOps Engineering  
**Stakeholders:** Engineering, Security, Clinic Operations, Product

---

## 1. Feature Overview

### Problem Statement

The Vet Agent Build application currently runs directly on a developer workstation via `npm start` or `node server.js`. There is no containerized runtime, no reproducible build artifact, and no automated CI/CD pipeline. This makes local development environment-dependent, complicates deployment, increases the risk of "works on my machine" failures, and blocks secure, repeatable releases to staging or production environments.

### Goal

Containerize the application with Docker and establish a CI/CD pipeline that builds, tests, and publishes the container image automatically. The pipeline should support local development, staging validation, and production deployment with minimal manual steps and clear rollback capability.

### Acceptance Criteria

1. A production-ready `Dockerfile` builds a minimal, secure image for the Node.js application.
2. `docker-compose.yml` enables one-command local development with hot reload.
3. A CI workflow runs lint/tests, builds the image, and publishes it to a container registry on every relevant change.
4. A CD workflow deploys the published image to a staging environment on merge to `main`.
5. Production deployment is documented and can be triggered manually or via release tag.
6. Sensitive configuration (API keys, registry credentials) is handled via secrets, not committed to the repository.
7. Persistent data (`agent-home/memory/`) lives outside the container via a volume.
8. Health checks and graceful shutdown are implemented in the container.
9. Documentation covers local development, debugging, and production runbooks.

---

## 2. User Stories

### Epic: DEVOPS-001 — Docker & CI/CD

---

### Story 1: Create a production-ready Dockerfile

**As a** platform engineer  
**I want** a Dockerfile that builds a secure, minimal image  
**So that** the application can run consistently anywhere.

**Acceptance criteria:**
- Uses an official Node.js LTS base image.
- Runs as a non-root user.
- Uses multi-stage build or minimal production dependencies to keep image small.
- Copies only necessary files (`.dockerignore` in place).
- Exposes the application port.
- Sets correct `WORKDIR`, `USER`, and `CMD`.
- Image builds successfully with `docker build -t vet-agent-build .`.

**Priority:** P0  
**Estimated effort:** Small

---

### Story 2: Add Docker Compose for local development

**As a** developer  
**I want** a `docker-compose.yml` that starts the app with one command  
**So that** I can develop without installing Node.js locally.

**Acceptance criteria:**
- `docker compose up` starts the app on the expected port.
- Source code is mounted for hot reload in development mode.
- Environment variables are loaded from `.env`.
- A named volume persists `agent-home/memory/` across container restarts.
- A health check is configured in Compose.
- README is updated with `docker compose` instructions.

**Priority:** P0  
**Estimated effort:** Small

---

### Story 3: Implement container health checks and graceful shutdown

**As a** platform engineer  
**I want** the container to report health and shut down gracefully  
**So that** orchestrators can manage it reliably.

**Acceptance criteria:**
- Dockerfile includes a `HEALTHCHECK` instruction or the app exposes a `/health` endpoint.
- The application handles `SIGTERM`/`SIGINT` to close the HTTP server and flush data.
- Health endpoint returns 200 when the app and data store are ready.
- Graceful shutdown timeout is documented.

**Priority:** P1  
**Estimated effort:** Small

---

### Story 4: Set up CI workflow — lint, test, and image build

**As a** developer  
**I want** CI to run on every pull request  
**So that** broken changes cannot merge.

**Acceptance criteria:**
- GitHub Actions workflow triggers on `pull_request` to `main`.
- Steps include: checkout, setup Node, install dependencies, lint, test, build Docker image.
- The Docker image build is tested but not pushed for PRs.
- Workflow runs in under 10 minutes for typical changes.
- Failures block merge via branch protection.

**Priority:** P0  
**Estimated effort:** Medium

---

### Story 5: Set up CD workflow — publish image to registry

**As a** platform engineer  
**I want** successful `main` builds to publish a container image automatically  
**So that** every merged change is deployable.

**Acceptance criteria:**
- GitHub Actions workflow triggers on `push` to `main`.
- Image is tagged with the short commit SHA and `latest`.
- Image is pushed to a container registry (GitHub Container Registry or clinic registry).
- Registry credentials are stored in GitHub Secrets.
- Release tags (`v*`) produce semantically tagged images.

**Priority:** P0  
**Estimated effort:** Medium

---

### Story 6: Set up staging deployment

**As a** platform engineer  
**I want** every merge to `main` to deploy to a staging environment  
**So that** changes can be validated before production.

**Acceptance criteria:**
- A staging deployment job runs after the image is published.
- Deployment uses the published image tag, not a local build.
- Staging environment variables and secrets are stored separately from production.
- A smoke test verifies the staging deployment is reachable.
- Deployment failures trigger a notification.

**Priority:** P1  
**Estimated effort:** Medium

---

### Story 7: Configure secrets and environment management

**As a** security engineer  
**I want** sensitive values to be injected at runtime  
**So that** credentials are never committed or baked into images.

**Acceptance criteria:**
- `.env.example` documents all required environment variables.
- `.dockerignore` excludes `.env` files.
- GitHub Secrets are used for registry credentials and deployment keys.
- Production API keys (e.g., `OPENROUTER_API_KEY`) are passed at runtime, not build time.
- Documentation describes how to rotate secrets.

**Priority:** P0  
**Estimated effort:** Small

---

### Story 8: Optimize image size and build cache

**As a** platform engineer  
**I want** the Docker image to be small and quick to build  
**So that** CI minutes and registry storage costs are minimized.

**Acceptance criteria:**
- `.dockerignore` excludes `node_modules`, `.git`, `.pi`, `docs`, and other unnecessary files.
- `npm ci` is used instead of `npm install` in the build.
- Dependency layer is cached separately from source code layer.
- Final image size is tracked and reviewed (target: < 200 MB uncompressed).

**Priority:** P2  
**Estimated effort:** Small

---

### Story 9: Add production deployment runbook

**As a** operations engineer  
**I want** documented steps for production deployment  
**So that** releases are predictable and reversible.

**Acceptance criteria:**
- Runbook covers: how to trigger a production deployment, how to verify it, and how to roll back.
- Production deployment is triggered manually or by a release tag, not automatically on every merge.
- Backup and restore procedure for `agent-home/memory/` is documented.
- Rollback uses a previously published image tag.

**Priority:** P1  
**Estimated effort:** Small

---

### Story 10: Add observability hooks for containers

**As a** platform engineer  
**I want** logs and basic metrics to be accessible from the container  **So that** issues can be diagnosed without shell access.

**Acceptance criteria:**
- Application logs are written to stdout/stderr (no log files trapped inside the container).
- Log format is consistent and timestamped.
- Optional: expose a `/ready` or `/metrics` endpoint for orchestrators.
- Documentation describes how to view logs with `docker logs`.

**Priority:** P2  
**Estimated effort:** Small

---

## 3. Dependencies

- Selection of container registry (GitHub Container Registry, AWS ECR, Docker Hub, or clinic private registry).
- Selection of deployment target (single VM, Kubernetes, ECS, etc.).
- Access to GitHub repository settings for secrets and branch protection.
- Decision on production database strategy (currently JSON files; may need migration plan).

---

## 4. Risks and Open Questions

| Risk | Mitigation |
|---|---|
| JSON-file data store is not suited for containerized/multi-replica deployments. | Document single-replica constraint; plan future migration to a real database. |
| Hot reload in Docker may behave differently than native Node.js watch. | Test `node --watch` inside the container or document `docker compose` reload behavior. |
| Large `node_modules` or native dependencies may slow builds. | Use `.dockerignore`, layer caching, and consider a smaller base image. |
| Secrets may be accidentally baked into images. | Build with `--build-arg` only for non-secret values; pass secrets at runtime. |
| Health check endpoint does not exist yet. | Implement `/health` as part of this feature. |

---

## 5. Definition of Done

- All P0 and P1 stories are implemented and merged to `main`.
- CI passes on every PR and blocks merges that fail.
- A published image exists in the registry for the latest `main` commit.
- Staging environment is reachable and smoke tests pass.
- Production runbook is reviewed and approved by operations.
- Documentation is updated with local development and deployment instructions.
