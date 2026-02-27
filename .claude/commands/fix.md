---
name: fix
description: Run linting and formatting checks, then spawn parallel agents to fix all issues
---

## Step 1: Run checks

```bash
npm run lint 2>&1 || true
npm run format:check 2>&1 || true
```

Collect all errors from both commands.

## Step 2: Spawn parallel agents

If there are errors, spawn agents in parallel using the Task tool (one per domain):

- **lint-fixer**: Give it the list of ESLint errors and files. It should fix them and run `npm run lint` to verify.
- **format-fixer**: Give it the list of Prettier errors and files. It should run `npm run format` to auto-fix, then `npm run format:check` to verify.

Use a SINGLE response with MULTIPLE Task tool calls to run agents in parallel.

## Step 3: Verify

After all agents complete, run both checks again to confirm zero errors:

```bash
npm run lint
npm run format:check
```
