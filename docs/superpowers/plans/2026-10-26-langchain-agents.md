# LangChain Agents Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for this tightly coupled refactor; use test-driven-development and verification-before-completion. Continue through all tasks without additional approval checkpoints.

**Goal:** 将文字面试重构为五个独立 Agent 与显式 LangGraph 工作流，修复题目推进和评分可信度，并持久化执行状态。

**Architecture:** contracts 提供可校验的输入输出；agent-core 提供五个 Agent、LangChain runnable 和 LangGraph 编排。API 注入 DeepSeek 模型网关、PostgreSQL checkpoint 和 Prisma 业务存储。由数据库串行化写操作，恢复时复用已提交结果。

**Tech Stack:** TypeScript、LangChainJS、LangGraph、NestJS、Prisma/PostgreSQL、Vue/Pinia、Vitest。

**Spec:** `docs/superpowers/specs/2026-10-26-langchain-agent-refactor-design.md`

## Global Constraints

- 保留现有 HTTP 路由和响应信封；报告可空分数是显式契约升级。
- 评分、游标、事务和幂等性必须由确定性代码执行。
- 五个 Agent：ProfileAgent、JobAgent、InterviewerAgent、CoachAgent、ReportAgent。
- PostgreSQL 为业务和执行状态持久层；不依赖内存 checkpoint 实现生产恢复。
- 每个主问题最多一次追问，追问不单独计分。
- 不覆盖已有用户改动，不执行重置数据库、推送或发布。
- 用户已授权继续；当前目录建独立 codex 分支，不另建 worktree 或反复请求确认。

## Execution Ledger

- Ruling: 后台恢复采用 API 启动与周期性扫描数据库租约，而非在本次同时引入 BullMQ worker；持久任务重试必须有上限并可回收过期租约。
- Ruling: 所有维度未完成测评时总分为 null；完整四维测评后按原权重计算总分。已有报告计分版本为 legacy-v1，新报告为 evidence-v2。
- Ruling: LangChain 模型适配保留已有 provider 的总预算与主备降级，禁用 SDK 自动重试；测试可注入 fake transport。

### Task 1: Contracts, scoring, and invalid output regressions

Files: `packages/contracts/src/index.ts`, `packages/agent-core/src/index.ts`, their tests.

- [x] Add failing tests: no cues yields null dimensions/total; missing model scores or evidence fail; seven plan days must be distinct.
- [x] Run `pnpm -F @interview-assistant/agent-core test` and observe expected failures.
- [x] Add structured profile, report narrative and nullable report contracts; remove fabricated score/evidence/report defaults.
- [x] Preserve valid alias normalization and existing weighted score behavior for fully assessed dimensions.
- [x] Run contract/core tests and build both shared packages.

### Task 2: Five independent agents and graph workflows

Files: `packages/agent-core/src/agents/*`, `workflows/*`, package exports; `apps/api/src/deepseek/*`.

- [x] Add failing behavior tests using fake models: correct task dispatch; invalid quotes rejected; one follow-up maximum; checkpoint resume skips finished nodes.
- [x] Implement AgentModelGateway and typed LangChain Runnable steps for all five agents.
- [x] Implement preparation, question generation, coaching/follow-up and report LangGraph flows; use deterministic validators and routing.
- [x] Integrate ChatDeepSeek with shared timeout/fallback budget and usage preservation, test injected transport.
- [x] Run agent/core/provider tests and typecheck.

### Task 3: Persisted session state and reliable execution

Files: `apps/api/prisma/*`, `apps/api/src/agents/*`, `apps/api/src/interview/*`.

- [x] Add regressions for follow-up then next base question, duplicate and concurrent answer, finished session, and report idempotency.
- [x] Add additive migration for parent question links, session version/active question, answer result cache, report version/nullable total and execution leases.
- [x] Implement atomic state transitions and conditional lease claims; repeated requests reuse committed results.
- [x] Make InterviewService call workflows; persist structured profile/cache input hash and real agent task usage.
- [x] Add PostgreSQL checkpointer and startup/periodic recovery of interrupted job analysis, with bounded attempts and safe shutdown.
- [x] Generate Prisma client; run repository, service and NestJS wiring tests.

### Task 4: UI recovery and report semantics

Files: `apps/desktop/src/renderer/src/views/TrainingView.vue`, `stores/training*`, `api/interview.ts`.

- [x] Add regression tests for resumed polling and the last-answer transition.
- [x] Move polling lifecycle into a tested store/controller, resume on returning to analysis.
- [x] Use server next-question/index state; stop accepting answers after final question and display 未测评 for null scores.
- [x] Persist only non-sensitive session/job identifiers for refresh recovery and re-fetch authoritative data.
- [x] Run desktop tests/typecheck.

### Task 5: Integration, documentation and final verification

Files: `README.md`, `.env.example`, plan/spec status; focused regression suites.

- [x] Update runtime/migration/configuration instructions, Agent boundaries and real verification limitations.
- [x] Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm exec turbo run test --force`, `pnpm build`.
- [x] Run PostgreSQL integration when reachable; use deterministic transport fixtures for model tests and separately record whether real DeepSeek was exercised.
- [x] Review full diff and verify no secret or generated artifact is tracked; record evidence and unresolved external prerequisites.

## Verification Snapshot — 2026-10-26

Historical dependency-blocked snapshot; superseded by the 2026-10-28 evidence below.

- User took ownership of dependency installation; no further package installation or dependency-link manipulation is authorized in this pass.
- Fresh focused backend run: 6 files / 39 tests passed, including CAS, lease cleanup, startup drain, idempotency, supplemental follow-up context, and real Prisma P2025-to-404 normalization. Shared contracts build passed.
- Desktop task: 4 files / 39 tests and final typecheck passed; production build passed once. See desktop-refactor-report.md for evidence.
- LangChain graph tests, native SDK tests, complete API typecheck/build and PostgreSQL integration remain unverified until dependencies are installed and shared packages are rebuilt. Do not treat implementation checkboxes as passing integration checks.
- Latest typechecks report missing @langchain packages, missing pdfjs-dist link and stale agent-core dist exports. The last full installer failed on Windows EPERM while renaming langsmith.
- Changed-file Prettier checks and git diff --check pass. The full format check reported pre-existing unrelated files; these are intentionally not rewritten by this refactor.
- The additive migration has been generated/reviewed; migrate status confirms it is the sole pending migration. It has not been applied to the working database.
- No real DeepSeek request, reset, deployment, commit or push has been performed.

- Fresh pnpm lint passed all 5 packages (exit 0). A later focused regression reproduced persisted followUpQuestion=null breaking subsequent answers/reports; cue-record.ts now normalizes database null to an omitted optional field, and all 39 focused tests pass.
- Remaining next actions after user dependency installation: build contracts and agent-core first, run graph/provider tests and full typecheck/test/build, run isolated PostgreSQL suite, then consider applying the reviewed additive migration.

## Verification Snapshot — 2026-10-28

- User completed dependency installation. No package installation or dependency-link manipulation was performed in this verification pass.
- Fixed actual installed-framework compatibility failures: LangGraph node/channel name collisions, the Zod 3 / LangChain interop type boundary with exactOptionalPropertyTypes, and PDF.js 6 cleanup through PDFDocumentLoadingTask.destroy(). The PDF regression failed before the cleanup fix and passed afterwards.
- Prisma client generation passed. Both shared packages built. Final `pnpm exec turbo run lint typecheck test build --force --concurrency=4` passed all 20 tasks across 5 packages, with 0 cached tasks and exit 0.
- First fresh `pnpm exec turbo run test --force`: all 5 package tasks succeeded; agent-core 23, API 70, desktop 39 tests passed (132 total). After review fixes, the final forced run passes agent-core 26, API 70 and desktop 42 tests (138 total). Database integration is explicitly opt-in and was run separately.
- Isolated real PostgreSQL suite: 4/4 tests passed, covering legacy follow-up migration, checkpoint restart with a new saver, concurrent lease claims/transaction rollback, and a complete native SDK fixture → graph → service → repository interview. The complete flow verifies answer/report idempotency, follow-up scoring exclusion, persisted nullable cue normalization, usage identity and a 64/100 deterministic report.
- Applied only `20261026000000_agent_workflows` with `prisma migrate deploy` after isolated migration validation; deploy exited 0. No database reset or business-record deletion was performed.
- Real NestJS startup/HTTP/shutdown smoke passed against the migrated database: `/api/health` returned HTTP 200 / code 0 / status ok, WorkflowRuntime initialized its PostgreSQL checkpointer, and app.close() completed. No processing jobs existed at startup; no model request was triggered.
- Independent review found two P2 defects and no P0/P1: session recovery racing an in-flight answer/report, and JSON-escaped history rejecting valid evidence. Added regressions failed before the fixes and passed afterwards. Same-session activation now awaits its mutation; evidence matching uses decoded fields without joining unrelated facts. Narrow independent re-review passed both fixes.
- The answer HTTP timeout is now 300 seconds, covering the default two sequential 120-second Agent budgets. Its request-adapter regression failed before the change and passes afterwards. A 60ms wall-clock-dependent provider regression was also converted to fake time, explicitly testing that fallback aborts at the shared deadline rather than at a fresh budget.
- Final full format check reports 26 pre-existing, unrelated formatting warnings after formatting the touched PDF parser. Changed-file Prettier and `git diff --check` pass. The refactor intentionally does not mass-format unrelated files.
- Changed-file audit found no key-like secret, merge conflict marker or tracked generated build artifact; neither `.env` nor `apps/api/.env` is tracked. All requested changes remain uncommitted on `codex/langchain-agents`.
- No live DeepSeek request, dependency installation, commit, push or deployment was performed. Fixture SDK integration validates request/response wiring, not real-model quality. MinIO, voice/OCR, authentication and user isolation remain separate product acceptance work.
