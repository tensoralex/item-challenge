# Getting Started

> **Note:** This is the original starter document, kept unchanged for reference. Parts of it no longer reflect my implemented solution (DynamoDB is now the default backend, `example.ts` was replaced by `src/handlers/items.ts`). For the current setup and run instructions, see [README.md](README.md) and [local_setup/LOCAL_SETUP.md](local_setup/LOCAL_SETUP.md); for design decisions, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Prerequisites

- [Node 22+](https://nodejs.org)
- [pnpm](https://pnpm.io/installation)
- Optional: AWS CDK **or** Terraform (only if you choose to implement Infrastructure as Code)
- Optional: AWS CLI (for validating IaC locally — not required for this challenge)

## Quick Start

1. **Install dependencies:**

   ```bash
   pnpm install
   ```

2. **Start the development server:**

   ```bash
   pnpm dev
   ```

   The server will start at `http://localhost:3000` with hot reload enabled.

3. **Test the example endpoints:**

   ```bash
   # Create an item
   curl -X POST http://localhost:3000/api/items \
     -H "Content-Type: application/json" \
     -d '{
       "subject": "AP Biology",
       "itemType": "multiple-choice",
       "difficulty": 3,
       "content": {
         "question": "What is photosynthesis?",
         "options": ["A", "B", "C", "D"],
         "correctAnswer": "A",
         "explanation": "Photosynthesis is..."
       },
       "metadata": {
         "author": "test-author",
         "status": "draft",
         "tags": ["biology", "photosynthesis"]
       },
       "securityLevel": "standard"
     }'

   # Get an item (replace {id} with actual ID from create response)
   curl http://localhost:3000/api/items/{id}
   ```

## Project Structure

```
src/
├── handlers/         # API endpoint handlers
│   └── example.ts    # Example handlers (GET, POST) - use as template
├── storage/          # Storage implementations
│   ├── interface.ts  # Storage interface contract
│   ├── memory.ts     # In-memory storage (default, already working)
│   ├── dynamodb.ts   # DynamoDB storage (optional, for reference)
│   └── index.ts      # Storage factory (auto-selects based on env vars)
├── types/            # TypeScript type definitions
│   └── item.ts       # ExamItem types and interfaces
└── server.ts         # Local development HTTP server
```

## Understanding the Architecture

### Local Development vs Lambda Deployment

**Local Development (what you're doing now):**

- The `src/server.ts` file runs a simple HTTP server
- Handlers are invoked directly as functions
- In-memory storage is used by default
- Hot reload with `pnpm dev`

**Lambda Deployment (what you're designing for):**

- Handlers would be deployed as individual Lambda functions
- API Gateway would route requests to Lambda
- DynamoDB would provide persistent storage
- You'll define this infrastructure using CDK or Terraform

**Your Task:** Write handlers that work locally but are designed with Lambda deployment in mind. Think about:

- Event handling and response formats
- Stateless design (no reliance on server memory between requests)
- Environment variable configuration
- Error handling for production environments

## Your Implementation Tasks

### 1. Implement API Endpoints

Create handlers in `src/handlers/` for the required endpoints:

**Recommended Priority (pick 2-3 to implement well):**

- [ ] `POST /api/items` - Create a new exam item
- [ ] `GET /api/items/:id` - Retrieve an item by ID
- [ ] `PUT /api/items/:id` - Update an item
- [ ] `GET /api/items` - List items with pagination
- [ ] `POST /api/items/:id/versions` - Create a new version of an item
- [ ] `GET /api/items/:id/audit` - Get audit trail for an item

**Steps:**

1. Create handler functions in `src/handlers/` (use `example.ts` as a template)
2. Add routes in `src/server.ts` to wire up your handlers
3. Add validation using Zod (already installed)
4. Test locally with curl or your preferred HTTP client

**Example handler structure:**

```typescript
export async function yourHandler(params: any) {
  try {
    // Validate input
    // Call storage layer
    // Return success response
    return {
      statusCode: 200,
      body: {
        /* your data */
      },
    };
  } catch (error) {
    // Handle errors appropriately
    return {
      statusCode: 500,
      body: { error: "message" },
    };
  }
}
```

### 2. Define Infrastructure as Code

Choose **either** CDK **or** Terraform and create infrastructure definitions.

#### Option A: AWS CDK (TypeScript)

1. **Install CDK (if needed):**

   ```bash
   npm install -g aws-cdk
   ```

2. **Create infrastructure directory:**

   ```bash
   mkdir infrastructure
   cd infrastructure
   cdk init app --language typescript
   ```

3. **Define resources in your CDK stack:**

   - Lambda functions (one per endpoint or shared)
   - API Gateway REST API
   - DynamoDB table (design the schema)
   - IAM roles and policies
   - CloudWatch log groups

4. **Validate your infrastructure:**
   ```bash
   cd infrastructure
   cdk synth
   ```

#### Option B: Terraform

1. **Create Terraform files:**

   ```bash
   mkdir terraform
   cd terraform
   # Create main.tf, variables.tf, outputs.tf
   ```

2. **Define resources:**

   - AWS Lambda functions
   - API Gateway
   - DynamoDB table
   - IAM roles and policies
   - CloudWatch logs

3. **Validate your infrastructure:**
   ```bash
   cd terraform
   terraform init
   terraform plan
   ```

**Note:** You do NOT need to actually deploy. Just provide valid, well-commented infrastructure code.

### 3. Data Modeling

**Already Provided:**

- Type definitions in `src/types/item.ts`
- In-memory storage in `src/storage/memory.ts` (fully functional)
- Storage interface in `src/storage/interface.ts`

**Your Tasks:**

- Design a DynamoDB table schema (partition key, sort key, GSIs)
- Document your design in `ARCHITECTURE.md`
- **Optional:** Implement the DynamoDB storage layer in `src/storage/dynamodb.ts`

**To use DynamoDB storage (optional):**

```bash
# Set environment variable
export USE_DYNAMODB=true
export DYNAMODB_TABLE_NAME=ExamItems
# For local DynamoDB: export DYNAMODB_ENDPOINT=http://localhost:8000

pnpm dev
```

### 4. Write Tests (Recommended)

While tests are not required, including them demonstrates good engineering practices and gives you confidence in your implementation. See `src/__tests__/example.test.ts` for a working example.

**To run tests:**

```bash
pnpm test        # Run once
pnpm test:watch  # Run in watch mode
pnpm test:ui     # Run with UI
```

**Note:** Given the time constraint, prioritize working code and a few well-written tests for core functionality.

### 5. Documentation

Fill out `ARCHITECTURE.md` with:

- **Data Model Design:** DynamoDB table schema, key design, GSI strategy
- **Infrastructure Choices:** Why you chose specific services and configurations
- **Scalability:** How your design scales, potential bottlenecks
- **Security:** Authentication, authorization, encryption, IAM policies
- **Trade-offs:** What you prioritized and what you'd add with more time

## Available Scripts

- `pnpm dev` - Start development server with hot reload
- `pnpm build` - Compile TypeScript to JavaScript
- `pnpm start` - Run compiled JavaScript (after build)
- `pnpm test` - Run tests once (after installing vitest)
- `pnpm test:watch` - Run tests in watch mode
- `pnpm test:ui` - Run tests with interactive UI

## FAQ

**Q: Should I implement all 6 endpoints?**
A: No - we recommend focusing on 2-3 endpoints that work well. Quality over quantity.

**Q: Do I need to use DynamoDB?**
A: The in-memory storage is already set up for you. You should design a DynamoDB schema and explain it in `ARCHITECTURE.md`, but implementing the actual DynamoDB storage layer is optional.

**Q: Should my handlers be actual Lambda functions?**
A: Write them as regular functions that could be deployed as Lambda handlers. The local dev server will invoke them for testing. Think about how they'd be structured for Lambda deployment (event handling, responses, etc.).

**Q: Can I use additional npm packages?**
A: Yes! Use whatever makes sense. Document significant choices.

**Q: Should I actually deploy this to AWS?**
A: No! We just want to see valid infrastructure code. Running `cdk synth` or `terraform plan` is sufficient.

**Q: The scope seems large for 3 hours. What should I prioritize?**
A: This is intentional - we want to see how you prioritize. We recommend:

- 2-3 core API endpoints fully working
- Thoughtful data model design
- Complete infrastructure definition
- Good documentation of trade-offs in ARCHITECTURE.md

**Q: How do I add a new route?**
A: Edit `src/server.ts` and add a new condition in the request handler that matches your URL pattern and calls your handler function.

**Q: Do I need to implement all the storage interface methods?**
A: Only implement what you need for your chosen endpoints. The interface shows what's possible, not what's required.

**Q: Should I write tests?**
A: Tests are optional but encouraged. A few well-written tests for your core endpoints demonstrate good engineering practices. However, given the time constraint, prioritize working code and documentation first. If you have time, add tests for your main functionality rather than trying to achieve 100% coverage.

**Q: How do I know if my infrastructure code is valid?**
A: Run `cdk synth` (for CDK) or `terraform plan` (for Terraform) - they should complete without errors.

## Need Help?

- Check the example code in `src/handlers/example.ts`
- Review the storage interface in `src/storage/interface.ts`
- Look at the types in `src/types/item.ts`
- Refer to the README.md for overall requirements
