# Interview Assistant Monorepo Initialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Initialize a pnpm Turborepo for the interview assistant with Vue/Electron desktop, NestJS API, worker, shared contracts, agent-core scoring configuration, ESLint, Prettier, and local infrastructure without installing dependencies.

**Architecture:** A pnpm workspace owns independent apps and shared packages. Turborepo runs lint, typecheck, test, build, and format tasks from the root. Electron uses electron-vite with isolated main/preload/renderer entry points; NestJS owns HTTP/WebSocket boundaries; shared Zod contracts and scoring constants prevent drift between client and server.

**Tech Stack:** pnpm workspaces, Turborepo, TypeScript, Vue 3, Vite, Electron, electron-vite, NestJS, Zod, ESLint flat config, Prettier, PostgreSQL, Redis, MinIO.

---

### Task 1: Create workspace and repository tooling

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `eslint.config.mjs`
- Create: `prettier.config.mjs`
- Create: `.prettierignore`
- Create: `.editorconfig`
- Create: `.gitignore`

- [ ] Add root scripts for `dev`, `build`, `lint`, `typecheck`, `test`, `format`, and `format:check` using `turbo run`.
- [ ] Configure ESLint flat config for TypeScript, Vue, and import boundaries.
- [ ] Configure Prettier with 2-space indentation, single quotes, semicolons, trailing commas, and LF line endings.
- [ ] Configure Turbo task dependencies and persistent dev tasks.
- [ ] Keep all package versions in manifests only; do not run install commands.
- [ ] Validate JSON/YAML/config syntax with a Node script after creation.

### Task 2: Add shared configuration packages

**Files:**

- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/agent-core/package.json`
- Create: `packages/agent-core/tsconfig.json`
- Create: `packages/agent-core/src/index.ts`

- [ ] Define shared interview mode, competency, scoring, and API health schemas with Zod.
- [ ] Export the four confirmed scoring weights and the 120-question inventory blueprint.
- [ ] Export an agent-core helper that computes the weighted score from four dimension scores.
- [ ] Keep shared packages dependency-light and typecheckable in isolation.

### Task 3: Scaffold NestJS API and worker

**Files:**

- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/nest-cli.json`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/app.controller.ts`
- Create: `apps/api/src/app.service.ts`
- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/src/index.ts`

- [ ] Expose `GET /api/health` returning service name, status, and ISO timestamp.
- [ ] Configure NestJS CORS for the local Electron renderer and environment-based port.
- [ ] Add worker bootstrap that can later host BullMQ consumers without importing infrastructure at module load time.
- [ ] Add package scripts for dev, build, lint, typecheck, and test.

### Task 4: Scaffold Vue/Electron desktop

**Files:**

- Create: `apps/desktop/package.json`
- Create: `apps/desktop/electron.vite.config.ts`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/src/main/index.ts`
- Create: `apps/desktop/src/preload/index.ts`
- Create: `apps/desktop/src/renderer/index.html`
- Create: `apps/desktop/src/renderer/src/main.ts`
- Create: `apps/desktop/src/renderer/src/App.vue`
- Create: `apps/desktop/src/renderer/src/env.d.ts`
- Create: `apps/desktop/src/renderer/src/styles.css`

- [ ] Use electron-vite main/preload/renderer entry points.
- [ ] Enable `contextIsolation` and disable `nodeIntegration` in the BrowserWindow.
- [ ] Expose only a typed `desktopApi` health-check method through preload.
- [ ] Render an initial dashboard that identifies the four scoring dimensions and API status.
- [ ] Add local development and package build scripts without installing or invoking Electron.

### Task 5: Add local infrastructure and developer documentation

**Files:**

- Create: `infra/docker/docker-compose.yml`
- Create: `README.md`
- Create: `.env.example`

- [ ] Define PostgreSQL, Redis, and MinIO services with named volumes and health checks.
- [ ] Document the exact install command, development commands, environment variables, and the fact that dependencies were intentionally not installed.
- [ ] Document the monorepo layout and first health-check endpoint.

### Task 6: Verify initialization without dependency installation

- [ ] Run a read-only file inventory and inspect package scripts.
- [ ] Parse all JSON, YAML, and TypeScript-adjacent configuration files that do not require external modules.
- [ ] Confirm no `node_modules`, lockfile, build output, or generated dependency artifacts were created.
- [ ] Report any checks that could not run because dependencies are intentionally absent.
