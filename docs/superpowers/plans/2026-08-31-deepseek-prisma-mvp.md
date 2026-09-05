# DeepSeek Prisma MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable text interview MVP backed by PostgreSQL/Prisma persistence and real server-side DeepSeek model calls.

**Architecture:** The desktop renderer collects profile, JD, story, and interview answers, then calls NestJS REST endpoints under `/api`. The API stores all MVP entities with Prisma/PostgreSQL, uses shared Zod contracts for input/output validation, and calls a DeepSeek provider adapter for analysis, interview feedback, follow-up questions, and reports. `packages/agent-core` owns deterministic scoring weights, prompt builders, model-output parsing helpers, and report aggregation utilities so model prompts and schema validation stay testable outside NestJS.

**Tech Stack:** pnpm workspace, Turborepo, TypeScript, Zod, Vitest, NestJS 11, Prisma 7, PostgreSQL, Vue 3, Pinia, Vue Router, Element Plus, Electron.

**Spec:** `docs/interview-assistant-agent-solution.md`, plus approved user constraints from 2026-08-31: real DeepSeek integration is required, PostgreSQL/Prisma must be used directly, and in-memory storage is not acceptable for the MVP.

## Global Constraints

- DeepSeek API keys must only be read by `apps/api`; no key may appear in Electron main, preload, renderer, shared packages, Git-tracked example values, or logs.
- MVP storage uses PostgreSQL through Prisma models, not in-memory repositories.
- The MVP text loop must cover preparation analysis, session creation, answer submission, DeepSeek-backed coaching, follow-up/next question, session finish, persisted report, and 7-day plan display.
- Automatic tests must not call DeepSeek over the network; provider tests use injected fake HTTP clients.
- Scoring aggregation must keep the confirmed weights: Vue/React 10%, AI application 20%, system design 30%, project depth 40%.
- Unsupported paths remain out of scope: login, PDF/DOCX parsing, voice/ASR, WebSocket streaming, full 120-question content, production ACK/KMS deployment, and authorized-assist realtime subtitle mode.

---

### Task 1: Shared Contracts and Agent-Core Model Helpers

**Files:**

- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/agent-core/src/index.ts`
- Modify: `packages/agent-core/src/index.test.ts`

**Interfaces:**

- Produces: `profileInputSchema`, `jobAnalyzeInputSchema`, `interviewSessionCreateInputSchema`, `answerSubmitInputSchema`, `coachingCueSchema`, `evaluationReportSchema`, and their exported TypeScript types.
- Produces: `buildAnalysisPrompt(input)`, `buildCoachingPrompt(context)`, `buildReportPrompt(context)`, `parseModelJson(schema, content)`, `normalizeCompetencyScores(cues)`, and `calculateWeightedScore(scores)`.

- [ ] **Step 1: Write failing agent-core tests**

Add tests in `packages/agent-core/src/index.test.ts` for these behaviors:

```ts
it('normalizes average cue scores per competency before weighted aggregation', () => {
  const scores = normalizeCompetencyScores([
    {
      competency: 'project-depth',
      score: 5,
      strengths: [],
      gaps: [],
      nextAction: 'keep',
      evidence: [{ source: 'answer', quote: 'owned rollout' }],
    },
    {
      competency: 'project-depth',
      score: 3,
      strengths: [],
      gaps: [],
      nextAction: 'add metrics',
      evidence: [{ source: 'answer', quote: 'no metrics' }],
    },
    {
      competency: 'system-design',
      score: 4,
      strengths: [],
      gaps: [],
      nextAction: 'cover failures',
      evidence: [{ source: 'job_description', quote: 'scalable platform' }],
    },
  ]);

  expect(scores).toEqual({
    'vue-react': 3,
    'ai-application': 3,
    'system-design': 4,
    'project-depth': 4,
  });
  expect(calculateWeightedScore(scores)).toBe(74);
});

it('parses valid model JSON and rejects schema drift', () => {
  const parsed = parseModelJson(
    coachingCueSchema,
    JSON.stringify({
      competency: 'ai-application',
      score: 4,
      strengths: ['明确提到评估集'],
      gaps: ['补充成本监控'],
      nextAction: '用一次线上回归评测说明取舍',
      evidence: [{ source: 'answer', quote: '我们有离线评估集' }],
    }),
  );

  expect(parsed.score).toBe(4);
  expect(() => parseModelJson(coachingCueSchema, '{"score": 9}')).toThrow(/model output/);
});
```

- [ ] **Step 2: Run the focused failing tests**

Run: `pnpm --filter @interview-assistant/agent-core test`

Expected: FAIL because the new exported helpers and schemas do not exist.

- [ ] **Step 3: Implement contracts and agent-core helpers**

Extend `packages/contracts/src/index.ts` with Zod schemas for the MVP inputs and outputs. Extend `packages/agent-core/src/index.ts` with prompt builders that return plain strings and deterministic score aggregation helpers that default missing competency scores to `3`.

- [ ] **Step 4: Run focused tests until green**

Run: `pnpm --filter @interview-assistant/agent-core test`

Expected: PASS.

---

### Task 2: Prisma Schema and API Persistence Boundary

**Files:**

- Create: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/package.json`
- Create: `apps/api/src/prisma/prisma.service.ts`
- Create: `apps/api/src/interview/interview.repository.ts`
- Create: `apps/api/src/interview/interview.repository.spec.ts`

**Interfaces:**

- Produces Prisma models: `CandidateProfile`, `Job`, `Story`, `InterviewPlan`, `InterviewSession`, `InterviewQuestion`, `InterviewAnswer`, `CoachingCue`, `EvaluationReport`, `UsageLedger`.
- Produces repository methods: `createPreparation(input)`, `createSession(input)`, `saveAnswerFeedback(input)`, `finishSession(input)`, `getSession(sessionId)`, `getReport(sessionId)`.

- [ ] **Step 1: Write failing repository tests**

Create `apps/api/src/interview/interview.repository.spec.ts` with a mocked Prisma client object. Assert that `createSession` stores plan/session/question records and `saveAnswerFeedback` persists answer plus coaching cue evidence as JSON.

- [ ] **Step 2: Run the focused failing tests**

Run: `pnpm --filter @interview-assistant/api test -- interview.repository.spec.ts`

Expected: FAIL because Prisma service, schema, and repository do not exist.

- [ ] **Step 3: Add Prisma model schema and scripts**

Add `apps/api/prisma/schema.prisma` configured for PostgreSQL with `DATABASE_URL`. Add API scripts: `prisma:generate`, `prisma:migrate`, and `prisma:studio`.

- [ ] **Step 4: Implement Prisma service and repository**

Use `@nestjs/common` lifecycle hooks in `PrismaService`. Store flexible model outputs in Prisma `Json` fields and keep all external DTO conversion in the repository.

- [ ] **Step 5: Run focused tests until green**

Run: `pnpm --filter @interview-assistant/api test -- interview.repository.spec.ts`

Expected: PASS.

---

### Task 3: DeepSeek Provider Adapter

**Files:**

- Create: `apps/api/src/deepseek/deepseek.provider.ts`
- Create: `apps/api/src/deepseek/deepseek.provider.spec.ts`

**Interfaces:**

- Produces: `DeepSeekProvider.generateJson<T>(request): Promise<{ data: T; usage: ModelUsage; model: string; degraded: boolean }>`.
- Consumes: injected `fetch`-compatible transport for tests and global `fetch` at runtime.

- [ ] **Step 1: Write failing provider tests**

Create tests for successful JSON parsing, primary-to-fallback retry on primary failure, missing API key rejection, and invalid schema rejection.

- [ ] **Step 2: Run focused failing tests**

Run: `pnpm --filter @interview-assistant/api test -- deepseek.provider.spec.ts`

Expected: FAIL because the provider does not exist.

- [ ] **Step 3: Implement provider**

Call `${baseUrl}/chat/completions` using OpenAI-compatible DeepSeek chat payloads with `response_format: { type: 'json_object' }`. Never log prompts or API keys. Validate returned JSON through the supplied Zod schema. Retry once with fallback model when the primary request fails or returns invalid output.

- [ ] **Step 4: Run focused tests until green**

Run: `pnpm --filter @interview-assistant/api test -- deepseek.provider.spec.ts`

Expected: PASS.

---

### Task 4: Interview API Vertical Slice

**Files:**

- Create: `apps/api/src/interview/interview.service.ts`
- Create: `apps/api/src/interview/interview.controller.ts`
- Create: `apps/api/src/interview/interview.module.ts`
- Create: `apps/api/src/interview/interview.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `.env.example`

**Interfaces:**

- Produces endpoints: `POST /api/profiles`, `POST /api/jobs/analyze`, `POST /api/stories`, `POST /api/interview-sessions`, `POST /api/interview-sessions/:id/answers`, `POST /api/interview-sessions/:id/finish`, `GET /api/interview-sessions/:id`, `GET /api/reports/:sessionId`.

- [ ] **Step 1: Write failing service tests**

Mock repository and provider. Assert `analyzeJob` persists DeepSeek analysis, `submitAnswer` persists the answer and feedback, and `finishSession` persists a report with weighted score calculated from coaching cues.

- [ ] **Step 2: Run focused failing tests**

Run: `pnpm --filter @interview-assistant/api test -- interview.service.spec.ts`

Expected: FAIL because service/module/controller do not exist.

- [ ] **Step 3: Implement service and controller**

The service builds prompts with `agent-core`, calls `DeepSeekProvider`, stores outputs through the repository, and records token usage when usage metadata exists. The controller validates bodies with shared Zod schemas before handing them to the service.

- [ ] **Step 4: Run focused tests until green**

Run: `pnpm --filter @interview-assistant/api test -- interview.service.spec.ts`

Expected: PASS.

---

### Task 5: Desktop Text MVP Flow

**Files:**

- Create: `apps/desktop/src/renderer/src/api/interview.ts`
- Modify: `apps/desktop/src/renderer/src/views/TrainingView.vue`
- Modify: `apps/desktop/src/renderer/src/styles.css`

**Interfaces:**

- Consumes the API endpoints from Task 4 through the existing Axios envelope client.
- Produces a single-screen text workflow: preparation inputs, analysis result, session question, answer submission, coaching feedback, report, and 7-day plan.

- [ ] **Step 1: Add API client functions**

Create typed functions: `createProfile`, `analyzeJob`, `createStory`, `createInterviewSession`, `submitAnswer`, `finishInterviewSession`, `getInterviewSession`, and `getReport`.

- [ ] **Step 2: Replace the placeholder training view**

Use Element Plus form controls already present in the app. Keep the interface dense and work-focused: two-column setup on desktop, single-column on mobile, stable question/feedback/report panels, and visible model/degradation state.

- [ ] **Step 3: Run desktop typecheck**

Run: `pnpm --filter @interview-assistant/desktop typecheck`

Expected: PASS after API types and view bindings are correct.

---

### Task 6: Final Verification and Documentation Update

**Files:**

- Modify: `README.md`

**Interfaces:**

- Documents the DeepSeek and Prisma MVP setup commands.

- [ ] **Step 1: Update README**

Document `pnpm --filter @interview-assistant/api prisma:generate`, `pnpm --filter @interview-assistant/api prisma:migrate`, required `DEEPSEEK_API_KEY`, and the local flow for starting PostgreSQL then API/desktop.

- [ ] **Step 2: Run complete verification**

Run: `pnpm test`, `pnpm typecheck`, and `pnpm build`.

- [ ] **Step 3: Inspect git diff**

Run: `git status --short` and `git diff --stat`.

- [ ] **Step 4: Report evidence**

Report exactly which commands passed or failed, any dependency/network/environment blockers, and the files changed.
