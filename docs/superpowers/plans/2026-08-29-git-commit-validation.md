# Git Commit Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Initialize Git on the `master` branch and enforce Conventional Commits before every local commit.

**Architecture:** The root package owns Commitlint and Husky because commits apply to the entire monorepo. Commitlint reads the root ESM configuration; Husky's versioned `commit-msg` hook invokes the root binary with Git's commit-message file.

**Tech Stack:** Git, pnpm 10.34.5, Husky, `@commitlint/cli`, `@commitlint/config-conventional`.

**Spec:** `docs/superpowers/specs/2026-08-29-git-commit-validation-design.md`

## Global Constraints

- Initialize Git with `master` as the initial branch.
- Use Conventional Commits via `@commitlint/config-conventional`.
- Install packages only with pnpm and retain the generated lockfile changes.
- Validate the real CLI and installed Git hook with both accepting and rejecting cases.

---

### Task 1: Initialize Repository and Add Commitlint Dependencies

**Files:**

- Create: `.git/` (Git metadata, not versioned)
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: root `package.json` declares pnpm 10.34.5.
- Produces: a Git repository on branch `master` and root-level `commitlint` and `husky` executables available through `pnpm exec`.

- [ ] **Step 1: Verify Commitlint is not yet available**

Run: `pnpm exec commitlint --version`

Expected: non-zero exit because the executable is not installed.

- [ ] **Step 2: Initialize the repository on `master`**

Run: `git init --initial-branch=master`

Expected: Git reports an empty repository and `git branch --show-current` prints `master`.

- [ ] **Step 3: Declare the minimal root development dependencies**

Add `@commitlint/cli`, `@commitlint/config-conventional`, and `husky` to root `devDependencies`, then run `pnpm install` in an environment with npm registry access.

Expected: `package.json` and `pnpm-lock.yaml` contain the three packages and pnpm exits zero.

- [ ] **Step 4: Verify the CLI is now available**

Run: `pnpm exec commitlint --version`

Expected: Commitlint prints a version and exits zero.

### Task 2: Configure Conventional Commit Validation and the Git Hook

**Files:**

- Create: `commitlint.config.mjs`
- Create: `.husky/commit-msg`
- Modify: `package.json`

**Interfaces:**

- Consumes: `@commitlint/cli` and `@commitlint/config-conventional` installed at the root.
- Produces: `pnpm exec commitlint --edit <message-file>` validates Conventional Commits, and Git invokes it from `.husky/commit-msg`.

- [ ] **Step 1: Write a valid-message check before adding the configuration**

Run: `"feat: enforce commit messages" | pnpm exec commitlint --verbose`

Expected: non-zero exit because no Commitlint rules are configured yet.

- [ ] **Step 2: Add the minimal ESM configuration**

Create `commitlint.config.mjs`:

```js
export default {
  extends: ['@commitlint/config-conventional'],
};
```

- [ ] **Step 3: Verify the valid message is accepted**

Run: `"feat: enforce commit messages" | pnpm exec commitlint --verbose`

Expected: zero exit with no rule violations.

- [ ] **Step 4: Verify an invalid message is rejected**

Run: `"enforce commit messages" | pnpm exec commitlint --verbose`

Expected: non-zero exit and a `type-empty` rule violation.

- [ ] **Step 5: Install Husky and add the hook**

Add the root package script:

```json
"prepare": "husky"
```

Run: `pnpm exec husky`

Create `.husky/commit-msg`:

```sh
#!/usr/bin/env sh
pnpm exec commitlint --edit "$1"
```

- [ ] **Step 6: Verify Git executes the installed hook**

Write `enforce commit messages` to a temporary commit-message file, then run `git hook run commit-msg <message-file>`.

Expected: non-zero exit with Commitlint's `type-empty` violation.

### Task 3: Run Project and Tooling Verification

**Files:**

- Verify only: `package.json`, `pnpm-lock.yaml`, `commitlint.config.mjs`, `.husky/commit-msg`

**Interfaces:**

- Consumes: completed Git, Commitlint, and Husky setup.
- Produces: evidence that the configured validation and existing workspace checks remain functional.

- [ ] **Step 1: Inspect the Git hook path**

Run: `git config --get core.hooksPath`

Expected: a Husky-managed hooks directory under `.husky`.

- [ ] **Step 2: Run the repository check suite**

Run: `pnpm check`

Expected: Prettier, ESLint, and TypeScript checks exit zero.

- [ ] **Step 3: Inspect the final repository state**

Run: `git status --short --branch`

Expected: branch `master` and the intended uncommitted setup files only.
