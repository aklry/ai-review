# Git Commit Validation Design

## Goal

Initialize this repository with `master` as its default branch and reject commit messages that do not follow Conventional Commits.

## Design

The root workspace will use `@commitlint/cli` with `@commitlint/config-conventional` in an ESM `commitlint.config.mjs` file. Husky will install a versioned `commit-msg` hook through the root package's `prepare` script. The hook will pass Git's commit message file to `pnpm exec commitlint --edit` and return its exit code, preventing invalid commits.

## Validation

The implementation will prove that a valid Conventional Commit is accepted, an invalid message is rejected, and the installed Git hook invokes the same validation. Existing workspace checks will also run to ensure the tooling change did not disturb the monorepo.
