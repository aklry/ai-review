# Desktop Recovery Refactor Report

Date: 2026-10-26

Scope: Task 4 of the approved LangChain Agent refactor. Shared backend/contracts are maintained by the parent agent. No commits or branch changes were made by this task.

## Changes

- `apps/desktop/src/renderer/src/stores/training.ts`: owns route activation/deactivation, analysis polling, refresh recovery and asynchronous preparation/interview/upload actions. Recursive polling schedules the next request only after the previous one settles. Recovery and polling share a serialized job-read gate. Request generations reject results after restart, unmount or job replacement.
- The store applies the server's `currentQuestionIndex`, `activeQuestionId` and session status. A null next question clears the active question and answer draft. Follow-ups preserve the main-question index and do not inflate the displayed question-plan count.
- Browser storage uses only `interview-assistant.training.v1` containing `jobId` and `sessionId`. Resume text, JD, answers, stories and reports are never persisted there. Refresh fetches the session first, fetches a completed report separately, or falls back to the saved job. Invalid/missing identifiers and unavailable storage are handled safely. An unavailable report does not discard its existing session.
- `apps/desktop/src/renderer/src/api/interview.ts`: describes the richer server session/answer state and recovery context.
- `apps/desktop/src/renderer/src/views/TrainingView.vue`: delegates asynchronous work to the store and activates/deactivates it with the component lifecycle. The answered-complete panel disables answer input/submission. Null total/dimension scores display `未测评`; unassessed dimensions have no score bar. Reports display their scoring version, defaulting historical reports to `legacy-v1`.
- `apps/desktop/src/renderer/src/stores/training.spec.ts`: 28 store behavior regressions with fake clocks and external API boundary fakes.
- `apps/desktop/src/renderer/src/views/TrainingView.spec.ts`: 2 rendered Vue/ElementPlus SSR regressions for final-answer controls and nullable score/version rendering.
- `apps/desktop/vitest.config.ts` and `apps/desktop/tsconfig.json`: enable Vue component compilation in the renderer tests and include the test configuration in type checking.

## Verification

| Command                                                                          | Observed result                                                                                                                                 |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial store regression run                                                     | 18 failures observed before implementation; missing lifecycle/actions were the expected failure cause.                                          |
| Report/mutation and rendered-view regressions                                    | 9 failures observed before fixes, including missing-report recovery, stale report overwrite and actual rendered terminal/null-score behavior.   |
| Transient-error regression                                                       | Failed with an obsolete `Network unavailable` banner after successful completion; fixed by applying the current job error state.                |
| Rapid-remount recovery regression                                                | Failed with two simultaneous job reads; fixed using the shared serialized job-read gate.                                                        |
| `pnpm -F @interview-assistant/desktop test`                                      | **Passed: 4 files, 39 tests, exit 0.** Final run after the serialized-read change: 240.41 seconds, tests themselves 439 ms.                     |
| `pnpm -F @interview-assistant/desktop typecheck`                                 | **Passed, exit 0**, after the final serialized-read change.                                                                                     |
| Targeted `pnpm exec prettier --check ...` and `git diff --check -- apps/desktop` | **Passed, exit 0.** Git printed only its existing LF-to-CRLF checkout notices.                                                                  |
| `pnpm -F @interview-assistant/desktop build`                                     | **Passed, exit 0**, after the final serialized-read change (1,685 renderer modules; main/preload/renderer output emitted).                      |
| `pnpm -F @interview-assistant/desktop lint`                                      | Initial run found two unused view refs after moving actions into the store. Those declarations were removed; the verification rerun is pending. |

## Limits

- Tests exercise the real Pinia store and real rendered Vue/ElementPlus components; HTTP calls are replaced at the external API boundary. No real PostgreSQL/DeepSeek or interactive Electron window was exercised in this frontend task.
- In-flight HTTP requests are not canceled. Their obsolete results cannot mutate current state, and a replacement job read waits for the previous read to settle. The HTTP client's existing timeout bounds that wait.
- Unsubmitted resume/JD/answer drafts remain memory-only. A server session reload clears the answer draft and restores the authoritative active question rather than recreating a browser-side answer history.
- Cold imports and project checks are unusually slow in this workspace. The pending lint rerun will be recorded when it exits; the 39-test suite, final typecheck and production build have completed successfully.
