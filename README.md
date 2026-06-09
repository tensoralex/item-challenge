# Item Challenge — My Submission

My solution for the College Board exam item management take-home exercise. I implemented all six API endpoints, a DynamoDB single-table storage layer, optimistic locking, version audit trail, AWS CDK infrastructure, and a full local development workflow.

## What I built

| Area | Scope |
|------|-------|
| **API** | 6/6 endpoints — create, read, update, list (GSI1), version checkpoint, audit |
| **Storage** | DynamoDB single-table (`ExamItems`) with `TransactWriteItems`, GSI1 `INCLUDE` projection |
| **Concurrency** | Optimistic locking via `If-Match` header and `ConditionExpression` on `version` |
| **Validation** | Zod `.strict()` schemas — server-owned fields cannot be forged |
| **Infrastructure** | AWS CDK — 6 per-endpoint Lambdas, HTTP API v2, least-privilege IAM |
| **Testing** | Unit, DynamoDB integration, HTTP e2e, CDK assertion tests |
| **Local dev** | DynamoDB Local bootstrap scripts, `demo.sh` panel walkthrough |

**Deferred (documented in [ARCHITECTURE.md](ARCHITECTURE.md)):** GSI2 global recency, authentication/KMS, DLQ, DynamoDB Streams audit pipeline.

![AWS Architecture](img/architecture.svg)

## Quick start for reviewers

Prerequisites: Node 22+, pnpm, npm (used only for the `infrastructure/` CDK project), AWS CLI v2, Java 17+ (Docker optional via `DDB_RUNTIME=docker`).

```bash
# 1. Bootstrap: deps, DynamoDB Local, table, .env, CDK deps
bash local_setup/run_local_infra.sh up

# 2. Run the API (DynamoDB Local backend)
pnpm dev                     # http://localhost:3000 — Ctrl+C when done

# 3. Tests and lint (from repository root)
pnpm test                    # unit/integration tests (e2e excluded)
pnpm test:e2e                # HTTP e2e tests (needs DynamoDB Local up)
cd infrastructure && npm test && cd ..   # CDK assertion tests
pnpm lint && pnpm format:check           # ESLint 9 + Prettier

# 4. Infrastructure synth (no deploy)
pnpm synth                                       # dev (default)
cd infrastructure && npx cdk synth -c env=prod && cd ..

# 5. Inspect local table health + invariants
pnpm db:inspect              # or: bash local_setup/run_local_infra.sh inspect

# 6. Panel demo (live API walkthrough — 12 steps)
bash demo.sh                # API narrative + db:inspect
bash demo.sh --full         # demo + all test suites + dev/prod synth

# 7. Teardown
bash local_setup/run_local_infra.sh down
```

See [GETTING_STARTED.md](GETTING_STARTED.md) for curl examples.

## Panel demo

For the interview walkthrough, I included a scripted narrative that starts DynamoDB + API if needed:

```bash
pnpm demo              # or: bash demo.sh
pnpm demo -- --full    # demo + pnpm test + pnpm test:e2e + CDK tests + synth
```

The 12-step script demonstrates: create → read → optimistic-lock update → 409 stale write → validation errors → malformed `If-Match` → list by subject (summaries, no content) → version checkpoint → audit trail → malformed id → 404 → `db:inspect` invariants.

## Documentation map

| Document | Purpose |
|----------|---------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | My design decisions — data model, trade-offs, scalability, security posture |
| [EXERCISE_DOCUMENTATION.md](EXERCISE_DOCUMENTATION.md) | Deep dive — module layout, storage mechanics, testing, implementation journal |
| [local_setup/LOCAL_SETUP.md](local_setup/LOCAL_SETUP.md) | Local environment bootstrap and lifecycle |
| [GETTING_STARTED.md](GETTING_STARTED.md) | Original starter instructions — kept unchanged |
| [GLOSSARY.md](GLOSSARY.md) | Key terms; Version definition updated to match implementation |

## How I prioritized

The exercise suggests focusing on 2–3 endpoints done well. I chose to implement all six because the storage primitives (transactions, optimistic locking, audit invariants) were the hard part — once those were solid, list and version-checkpoint endpoints were thin handler additions on the same layer.

**Tier 1 (fully hardened):** create, get, update, audit — correctness guarantees everything else depends on.

**Tier 2 (deliberately minimal):** list and version-checkpoint — prove the single-table access patterns end-to-end without committing to index shapes or checkpoint workflow rules before the real query patterns are known. See [Implementation depth — hardened core vs deliberately minimal](ARCHITECTURE.md#implementation-depth--hardened-core-vs-deliberately-minimal) in `ARCHITECTURE.md` for the full rationale.

I deferred auth, GSI2, and DLQ rather than shipping partial implementations of those concerns.

---

## Original assignment brief (unchanged)

Welcome! This is a take-home coding assignment for a software engineering position. In this challenge, you'll be building a simplified version of an exam item management API with cloud infrastructure.

Once you're ready to get started, read through [GETTING_STARTED.md](GETTING_STARTED.md).

## Your Task (1-3 hours)

**Please do not spend more than 3 hours on this. It is not expected for your solution to be perfectly polished and we want to be respectful of your time.**

Build a simplified exam item management system that demonstrates your ability to design scalable, secure APIs with proper cloud infrastructure.

### 1. API Implementation (TypeScript + Node.js)

Create API endpoints for managing exam items:

```
POST   /api/items              - Create a new exam item
GET    /api/items/:id          - Retrieve an item
PUT    /api/items/:id          - Update an item
GET    /api/items              - List items (with pagination)
POST   /api/items/:id/versions - Create a new version of an item
GET    /api/items/:id/audit    - Get audit trail for an item
```

**Goals:**

- Write handlers designed for AWS Lambda (serverless architecture)
- Implement proper error handling and validation
- Use appropriate HTTP status codes for responses
- Focus on 2-3 endpoints working well rather than all 6 partially done

**Note:** A local development server is provided for testing. Your handlers should be written with Lambda deployment in mind, but you'll test them locally.

### 2. Infrastructure as Code

Define the cloud infrastructure needed to deploy this system using **either** AWS CDK **or** Terraform (your choice).

**Goals:**

- Use AWS CDK (TypeScript preferred) **OR** Terraform
- Define resources: Lambda functions, API Gateway, DynamoDB (optional), IAM roles, CloudWatch logs
- Include comments explaining your design choices
- Define environment-specific configurations
- You do **not** need to actually deploy - just provide valid infrastructure code

**Validation:**

- For CDK: Run `cdk synth` to validate
- For Terraform: Run `terraform plan` to validate

### 3. Data Modeling

Design storage for exam items with this structure:

```ts
{
  id: string,
  subject: string,           // e.g., "AP Biology", "AP Calculus"
  itemType: string,          // "multiple-choice", "free-response", "essay"
  difficulty: number,        // 1-5
  content: {
    question: string,
    options?: string[],      // For multiple choice
    correctAnswer: string,
    explanation: string
  },
  metadata: {
    author: string,
    created: timestamp,
    lastModified: timestamp,
    version: number,
    status: string,          // "draft", "review", "approved", "archived"
    tags: string[]
  },
  securityLevel: string      // "standard", "secure", "highly-secure"
}
```

**Goals:**

- Support versioning (keep history of changes)
- Design appropriate DynamoDB keys and indexes (documented in ARCHITECTURE.md)
- Implement basic CRUD operations

**Note:** An in-memory storage implementation is provided for local testing. You can optionally implement DynamoDB storage if you want to go the extra mile.

### 4. Architectural Decision Document

Include a brief `ARCHITECTURE.md` file (template provided) covering:

- Data model design and DynamoDB schema
- Infrastructure choices and rationale
- Scalability & performance considerations
- Security approach
- Trade-offs and future improvements

## Project Setup

See [GETTING_STARTED.md](GETTING_STARTED.md) for detailed setup instructions.

**Quick start:**

```bash
pnpm install
pnpm dev
```

## What We're Evaluating

- **Code Quality:** Clean, readable, maintainable code
- **AWS Knowledge:** Proper use of Lambda, API Gateway, DynamoDB, IAM, CloudWatch
- **Infrastructure as Code:** Well-structured CDK/Terraform with best practices
- **NoSQL Design:** Appropriate key design and access patterns
- **Testing:** Well-structured tests with good coverage of core functionality (optional but encouraged)
- **Prioritization:** How you approach the time constraint

## Submission

Please fork this repository and submit your completed solution by sharing your forked repo link with your recruiter.

### Include the following in your submission:

- Instructions on how to run your solution locally  
- Include a brief `ARCHITECTURE.md` describing your system's structure and key components  
Good luck! We're excited to see your solution.

> See also the [Glossary](./GLOSSARY.md) for definitions of key terms used in this challenge.
