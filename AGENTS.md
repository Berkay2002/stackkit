# AGENTS.md

## Task Completion Requirements

## Project Snapshot

Proposing sweeping changes that improve long-term maintainability is encouraged.

## Core Priorities

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures (session restarts, reconnects, partial streams).

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

## Package Roles

## Autonomous build runs (the `ship` workflow)

When a build is driven end-to-end with no human gate (the `ship` skill — user AFK), these overrides hold for that run:

- **Reviewer approval is the only gate.** Never block on the human to approve a spec or plan; proceed the moment reviewers approve.
- **No git worktrees, ever.** No feature branch until explicitly told to make one.
- **AFK is not default → you may commits.**
- **Review per milestone, not per task** — code/spec review runs after each chunk, never after every individual task (too slow/costly).
- **Done = whole plan implemented *and* a live end-to-end test passes** — not unit tests + typecheck alone.
- Pipeline: (brainstorm to diverge → grill to converge) → spec → (spec review ∥ plan draft) → revise → (spec ∥ plan review) → implement (subagent-driven + TDD) → milestone review → E2E. Invoke with `/ship`.

## Reference Repos

