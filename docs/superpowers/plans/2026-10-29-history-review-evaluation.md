# Interview History, Review and Live Evaluation

**Goal:** Deliver the agreed next iteration: paginated history, complete per-question review, resume an earlier interview, and a small reproducible real-model evaluation.

**Architecture:** Reuse persisted sessions, answers, cues and reports. Add bounded read-only API projections and shared Zod contracts; keep history browsing separate from the active training store. Continue an interview through an explicit session identifier. Evaluate synthetic candidate data through the real model gateway without creating business records.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Zod, Vue/Pinia, Vitest and the existing DeepSeek/LangGraph integration. No new dependencies or database reset.

**Approved scope:** The user accepted the previous recommendation to implement history plus per-question review and real-model acceptance. This plan is executed in the current conversation.

## Task 1: History API and contracts

- [x] Add failing tests for bounded pagination, local-user filtering, newest-first ordering, main-question progress, follow-up association, nullable cues, report projection and missing sessions.
- [x] Add shared request/response schemas in the contracts package, exported from `index.ts`.
- [x] Add `GET /api/interview-sessions?page=1&pageSize=10&status=active` and `GET /api/interview-sessions/:id/review` through the existing controller/service/repository.
- [x] Return only list metadata; review contains questions, answers, all feedback/evidence and the existing report, without resume text, JD or internal lease/hash fields.
- [x] Verify with `pnpm -F @interview-assistant/contracts build` and focused API Vitest tests.

The pagination regression starts with `expect(sessionHistoryQuerySchema.parse({})).toEqual({ page: 1, pageSize: 10 })`; the repository regression asserts `orderBy: [{ startedAt: 'desc' }, { id: 'desc' }]` and `where.plan.profile.userKey === 'local-user'`.

## Task 2: Desktop history, review and continuation

- [x] Add failing API/store/render regressions for loading, empty/error states, pagination/filter changes, stale request rejection and review content.
- [x] Add `/history` and `/history/:sessionId`, sidebar navigation, history cards and a read-only review with main/follow-up labels, answer text, complete evidence, nullable scores and seven-day plan.
- [x] Continue active/awaiting-finish sessions at `/training?sessionId=...`; explicitly selected sessions override recovery IDs and do not silently restore another interview on failure.
- [x] Preserve existing mutation/remount guards. Do not store sensitive review data in browser storage or overwrite active training state while browsing.
- [x] Run desktop tests/typecheck/build and inspect the rendered interface.

The continuation regression calls `store.activate('older-session')` with a different saved ID and expects `getInterviewSession('older-session')`; the view regression renders both an unanswered question and a follow-up with multiple evidence quotes.

## Task 3: Reproducible live evaluation

- [x] Add deterministic tests for an evaluation runner that records per-case success, elapsed time, usage and model identity and preserves failures in its result.
- [x] Add synthetic Chinese/English good/weak answers and a complete preparation/question/coaching/report scenario using existing workflows. Keep live requests opt-in and sequential with a bounded number of cases.
- [x] Add a command that loads server environment variables without printing secrets, saves JSON under ignored `.cache/evals/`, and reports failed checks separately from subjective quality requiring human review.
- [x] Run a real-model evaluation when a server key is configured; record the observed result or exact blocker. No real resume or business database writes.
- [x] Update README and record fresh test, lint, typecheck and build evidence. Review the diff before completion; do not commit/push automatically.

The runner test supplies a failing fake gateway and expects a failed case plus a completed result, rather than an unhandled exception or a false success.

## Verification Record

- 2026-10-31: `pnpm check`, `pnpm test` and `pnpm build` passed. The full suite reported 174 passing tests; four PostgreSQL integration tests and one live-model test were skipped because `AGENT_INTEGRATION_DATABASE_URL` was not configured and real-model tests are opt-in.
- 2026-10-29: `.cache/evals/2026-10-29T15-09-33.180Z.json` records a successful DeepSeek run with 7/7 probes and 8 model calls. Chinese strong/weak answers scored 4/1; English scored 5/2. Human review remains required.
- 2026-10-31: A local synthetic-data preview verified history filtering, page 2, and the report/question/follow-up review at desktop width with no horizontal overflow. The temporary preview config and server were removed afterward.
