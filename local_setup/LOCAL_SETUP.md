# Local Setup — Exam Item Management Exercise

This folder contains scripts to bootstrap a **local development environment** for the College Board take-home exercise: a simplified exam item management API backed by **DynamoDB Local**.

No AWS account or cloud deployment is required. The scripts install project dependencies, start DynamoDB Local, and create the `ExamItems` table used by the API storage layer.

Official exercise repository: [item-challenge](https://github.com/ascott1/item-challenge)

DynamoDB Local documentation: [AWS DynamoDB Local](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html)

---

## Prerequisites

| Tool | Required | Notes |
|------|----------|-------|
| **Node.js 22+** | Yes | Local tooling; CDK Lambdas use `NODEJS_22_X` at deploy time |
| **npm** | Yes (for CDK) | Installs `infrastructure/` deps; CDK CLI via `npx cdk` |
| **AWS CLI v2** | Yes | Used to create the local DynamoDB table |
| **Java 17+** | Yes (default runtime) | Runs DynamoDB Local jar (`DDB_RUNTIME=jar`, default) |
| **curl** | First jar download | Downloads the DynamoDB Local archive when not cached |
| **Docker** | Optional | Only when `DDB_RUNTIME=docker` (opt-in, not the tested default) |

System packages (Node, AWS CLI, Java) are **not installed automatically**. Missing tools are reported with install guidance.

## Tested environment

The default docker-less setup (`DDB_RUNTIME=jar`) was developed and verified on:

| Component | Version |
|-----------|---------|
| OS | macOS 26.5 (Apple Silicon, arm64) |
| Node.js | v25.2.0 (22+ required) |
| pnpm | 11.5.2 |
| Java | OpenJDK 21 (17+ required) |
| AWS CLI | 2.31.x |

Docker is supported as an opt-in alternative (`DDB_RUNTIME=docker`) but was not the primary development path.

---

## Quick start

From the **repository root**, use the lifecycle script to bootstrap everything in one step:

```bash
bash local_setup/run_local_infra.sh up
```

This runs the full setup (`setup_all.sh`), starts DynamoDB Local, creates the `ExamItems` table, and copies `local_setup/.env.example` to `.env` if `.env` does not already exist.

Then start the API:

```bash
# DynamoDB Local (default) — loads .env when present
pnpm dev

# In-memory backend (zero-config, unit-test parity)
pnpm dev:memory
```

The storage factory defaults to DynamoDB. `pnpm dev` uses `--env-file-if-exists=.env` for endpoint/table settings. Set `USE_DYNAMODB=false` (as `dev:memory` does) to use the in-memory backend for fast local iteration without DynamoDB.

The development server runs at `http://localhost:3000` (see [GETTING_STARTED.md](../GETTING_STARTED.md)).

For the interview panel walkthrough, use the scripted demo (idempotent — safe to run multiple times):

```bash
bash demo.sh           # 12-step API narrative + db:inspect
bash demo.sh --full    # demo + all test suites + dev/prod synth
```

`demo.sh` ensures DynamoDB Local is up, probes the API with `OPTIONS /api/items` (expects `204`), starts its own server on port 3000 only when nothing is listening, and retries once on connection failure. If you already run `pnpm dev`, demo leaves that server alone. Use `PORT=3001 bash demo.sh` if another process owns port 3000.

**Idempotent `up`:** `05_create_local_table.sh` skips creation when the table exists with GSI1 `INCLUDE` projection; if an older table used `ALL`, `up` auto-recreates the table. Check projection with `bash local_setup/run_local_infra.sh status`.

---

## One-command lifecycle

[`run_local_infra.sh`](run_local_infra.sh) is the recommended entry point for day-to-day local infrastructure:

| Command | Action |
|---------|--------|
| `bash local_setup/run_local_infra.sh up` | Full bootstrap + copy `.env` if missing (default) |
| `bash local_setup/run_local_infra.sh down` | Stop DynamoDB Local |
| `bash local_setup/run_local_infra.sh restart` | Stop, start DynamoDB Local, ensure table exists |
| `bash local_setup/run_local_infra.sh reset` | Drop and recreate `ExamItems` (clean slate) |
| `bash local_setup/run_local_infra.sh status` | Report endpoint, PID, table, and `.env` state |
| `bash local_setup/run_local_infra.sh inspect` | Scan table and verify content invariants (`pnpm db:inspect`) |
| `bash local_setup/run_local_infra.sh cdk` | Install CDK deps and run `cdk synth` (no deploy) |
| `bash local_setup/run_local_infra.sh synth` | Alias for `cdk` |

If DynamoDB Local was started earlier but the process was killed, run `up` or `restart` to recover on demand (no background watchdog required).

---

## What the bootstrap does

```text
setup_all.sh
  ├── 01_check_prerequisites.sh   Verify Node, AWS CLI, Java (Docker if DDB_RUNTIME=docker)
  ├── 02_setup_node_pnpm.sh       Enable pnpm (corepack, or npm fallback)
  ├── 03_install_project_deps.sh  pnpm install (project dependencies)
  ├── 04_start_dynamodb_local.sh  Start DynamoDB Local on port 8000
  ├── 05_create_local_table.sh    Create ExamItems table (idempotent; self-heals GSI projection drift)
  └── 06_setup_cdk.sh             npm install in infrastructure/ + verify npx cdk (non-fatal)
```

Step 06 is **non-fatal** during `up` — if npm is offline, local DynamoDB setup still completes. Retry CDK later with `bash local_setup/run_local_infra.sh cdk` or `pnpm synth`.

---

## Script reference

| Script | Purpose |
|--------|---------|
| [`run_local_infra.sh`](run_local_infra.sh) | Lifecycle wrapper — `up`, `down`, `restart`, `reset`, `status` |
| [`setup_all.sh`](setup_all.sh) | Umbrella script — runs all steps below in order |
| [`01_check_prerequisites.sh`](01_check_prerequisites.sh) | Detect required tools; exit with install hints if anything critical is missing |
| [`02_setup_node_pnpm.sh`](02_setup_node_pnpm.sh) | Enable pnpm via corepack, or npm if corepack is absent |
| [`03_install_project_deps.sh`](03_install_project_deps.sh) | Run `pnpm install` at the repository root |
| [`04_start_dynamodb_local.sh`](04_start_dynamodb_local.sh) | Start DynamoDB Local (Java jar default; Docker opt-in via `DDB_RUNTIME=docker`) |
| [`05_create_local_table.sh`](05_create_local_table.sh) | Create the `ExamItems` DynamoDB table if it does not exist (`--reset` to drop and recreate) |
| [`06_setup_cdk.sh`](06_setup_cdk.sh) | `npm install` in `infrastructure/`; verify local CDK CLI (`npx cdk`) |
| [`stop_dynamodb_local.sh`](stop_dynamodb_local.sh) | Stop DynamoDB Local (container or jar process) |
| [`../scripts/inspect_local_db.ts`](../scripts/inspect_local_db.ts) | Table health + content invariant checker (`pnpm db:inspect`) |

Shared helpers live in [`lib/common.sh`](lib/common.sh).

---

## DynamoDB Local: runtime selection

Runtime is selected via `DDB_RUNTIME` (default: `jar`).

```bash
# Default — Java jar (tested on macOS)
bash local_setup/run_local_infra.sh up

# Opt-in — Docker (requires Docker + Compose)
DDB_RUNTIME=docker bash local_setup/run_local_infra.sh up
```

### Path A — Java jar (default, tested)

Script `04` with `DDB_RUNTIME=jar` (the default):

1. Downloads the official DynamoDB Local archive into `local_setup/.dynamodb-local/` (gitignored) on first run
2. Starts the jar in the background on port **8000** with `-sharedDb`
3. Records the process ID in `local_setup/dynamodb-local.pid`

Logs are written to `local_setup/dynamodb-local.log`. Table data **persists** across jar process restarts.

### Path B — Docker (opt-in)

Script `04` with `DDB_RUNTIME=docker`:

```bash
docker compose -f local_setup/docker-compose.yml up -d
```

Configuration: [`docker-compose.yml`](docker-compose.yml) uses the `amazon/dynamodb-local` image on port **8000** with `-sharedDb -inMemory`. Data is **wiped** on container restart; table creation (`05_create_local_table.sh`) is idempotent so `up`/`restart` recovers.

**Recovery:** If the jar or container was stopped after a previous session, re-run `bash local_setup/run_local_infra.sh up`, `... restart`, or `04_start_dynamodb_local.sh` directly. Script `04` detects a stale PID file, logs recovery, and launches a new instance.

---

## DynamoDB table schema

Script `05` creates a **single-table design** for exam items:

| Attribute | Role |
|-----------|------|
| `PK` | Partition key (e.g. `ITEM#<id>`) |
| `SK` | Sort key (e.g. `METADATA`, `VERSION#<n>`) |
| `GSI1PK` | GSI partition key (e.g. `SUBJECT#<subject>`) |
| `GSI1SK` | GSI sort key (e.g. `<status>#<created>`) |

**Access patterns supported by this schema:**

- **Get current item** — `GetItem(PK=ITEM#id, SK=METADATA)`
- **Audit / version history** — `Query(PK=ITEM#id, SK begins_with VERSION#)`
- **List by subject** (future) — `Query` on GSI1

Table name defaults to `ExamItems` (override with `DYNAMODB_TABLE_NAME`).

Billing mode: `PAY_PER_REQUEST` (on-demand), matching the intended production configuration.

---

## Environment variables

Copy [`local_setup/.env.example`](.env.example) to `.env` at the repository root:

```bash
USE_DYNAMODB=true
DYNAMODB_ENDPOINT=http://localhost:8000
DYNAMODB_TABLE_NAME=ExamItems
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=local
AWS_SECRET_ACCESS_KEY=local
```

DynamoDB Local does not validate AWS credentials; dummy values are sufficient.

These variables are loaded by `pnpm dev` when `.env` exists (`tsx --env-file-if-exists=.env`). `DYNAMODB_ENDPOINT` is required for local DynamoDB. `USE_DYNAMODB=true` is optional (DynamoDB is already the default); use `USE_DYNAMODB=false` only for in-memory mode.

---

## AWS CDK (synth only)

Infrastructure is defined under [`infrastructure/`](../infrastructure/). The exercise requires a valid CloudFormation template, not a deploy.

```bash
# Recommended (ensures deps, then synths dev template)
bash local_setup/run_local_infra.sh cdk

# Prod template (extra args pass through)
bash local_setup/run_local_infra.sh cdk -c env=prod

# Or from repository root
pnpm synth
cd infrastructure && npx cdk synth -c env=prod
```

Environment-specific defaults live in `infrastructure/lib/config.ts` (`dev` default, `prod` via `-c env=prod`). CDK is a **local devDependency** in `infrastructure/` — use `npx cdk`, not a global install. Output: `infrastructure/cdk.out/`.

---

## Running individual steps

You can run scripts independently (from any directory):

```bash
bash local_setup/01_check_prerequisites.sh
bash local_setup/04_start_dynamodb_local.sh
bash local_setup/05_create_local_table.sh
bash local_setup/06_setup_cdk.sh
```

---

## Teardown

Stop DynamoDB Local:

```bash
bash local_setup/run_local_infra.sh down
```

Or directly:

```bash
bash local_setup/stop_dynamodb_local.sh
```

To remove downloaded jar artifacts:

```bash
rm -rf local_setup/.dynamodb-local
```

---

## Troubleshooting

### Port 8000 already in use

Another process or a previous DynamoDB Local instance may be bound to port 8000.

```bash
bash local_setup/stop_dynamodb_local.sh
```

Or set a different port before starting:

```bash
export DYNAMODB_PORT=8001
export DYNAMODB_ENDPOINT=http://localhost:8001
bash local_setup/04_start_dynamodb_local.sh
```

### `aws: command not found`

Install AWS CLI v2: [Installing the AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)

### Java not found (default runtime)

The default jar runtime requires Java 17+:

```bash
# macOS (Homebrew)
brew install openjdk@21
```

Re-run `bash local_setup/setup_all.sh` after installing Java.

Alternatively, if you have Docker and prefer not to install Java:

```bash
DDB_RUNTIME=docker bash local_setup/run_local_infra.sh up
```

### Docker not found (opt-in runtime)

If you set `DDB_RUNTIME=docker` but Docker is not installed, either install Docker or use the default jar runtime:

```bash
bash local_setup/run_local_infra.sh up   # DDB_RUNTIME=jar is the default
```

### DynamoDB Local was killed or stopped

If you previously started DynamoDB Local but the process is no longer running:

```bash
bash local_setup/run_local_infra.sh status
bash local_setup/run_local_infra.sh restart
```

Or recover via the start script alone:

```bash
bash local_setup/04_start_dynamodb_local.sh
```

Script `04` detects a stale PID and restarts the instance automatically.

### Table creation fails with "Unable to connect"

Ensure DynamoDB Local is running:

```bash
bash local_setup/run_local_infra.sh up
# or
bash local_setup/04_start_dynamodb_local.sh
aws dynamodb list-tables --endpoint-url http://localhost:8000
```

### corepack not found (Homebrew Node)

Homebrew's Node.js formula does not include `corepack`. Script `02` automatically falls back to `npm install -g pnpm` when `corepack` is unavailable. No manual action is required unless the fallback also fails.

### pnpm not found after setup

Re-run:

```bash
bash local_setup/02_setup_node_pnpm.sh
```

If `corepack` is missing, the script installs pnpm globally via npm. Ensure `npm` is on your PATH (it ships with Node.js).

---

## Files not committed

The following are generated locally and listed in [`local_setup/.gitignore`](.gitignore):

- `local_setup/.dynamodb-local/` — downloaded DynamoDB Local jar
- `local_setup/dynamodb-local.pid` — jar process ID
- `local_setup/dynamodb-local.log` — jar stdout/stderr
- `local_setup/.runtime-mode` — `docker` or `jar` (used by stop script)
