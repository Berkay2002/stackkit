---
name: ship
description: Use when user asks an agent to autonomously ship a feature, fix, or build task end-to-end with no human approval checkpoints, especially "ship", "ship it", "run the full pipeline", "do the whole workflow", "build this end to end", or AFK requests.
---

# Ship

## Overview

One-shot autonomous development pipeline. Chains existing process skills in the right order, in parallel where possible, and runs to a working end-to-end result **without stopping for the user**. User is AFK; **reviewer approval IS user approval**. There is no human gate.

**Violating the letter of these overrides is violating the spirit.** Do not rationalize around them.

## Non-Negotiable Overrides

These override default behavior of every sub-skill, including git-worktree, commit, and review-cadence defaults.

| Rule | Meaning |
|------|---------|
| **No approval wait** | Never pause for user approval of spec or plan. Reviewer approval is the go signal. |
| **No worktrees ever** | Never create or suggest a git worktree. Skip `using-git-worktrees`. |
| **No feature branch** | Stay on the current branch until user explicitly says to branch. |
| **AFK default -> no commits** | Leave changes in the working tree; do not `git commit`. Exception: if user explicitly says they are not AFK or "you may commit", commit per milestone and bake commit messages into the plan. |
| **Review per milestone** | Code/spec review runs after each completed milestone/chunk, never after every individual task. |
| **Run until done** | Continue until the whole plan is complete. Stop only for a true hard blocker: ADR conflict, missing undecidable decision, or destructive operation. |
| **E2E defines done** | Done means whole plan implemented and a live end-to-end path passes, not just unit tests plus typecheck. |

## Skill Dependencies

This pipeline prefers:
- `obra/superpowers`: `brainstorming`, `writing-plans`, `requesting-code-review`, `receiving-code-review`, `subagent-driven-development`, `test-driven-development`, `verification-before-completion`.
- `mattpocock/skills`: `tdd`, `grill-me`, `grill-with-docs`.

Before step 1, verify required skills are available. If exact skills are missing but equivalent planning, TDD, review, or subagent capability exists in the harness, use the equivalent and continue. If no viable equivalent exists, read [references/dependencies.md](references/dependencies.md). Ask once before installing. Missing skills are a hard blocker only when available tools cannot execute the pipeline.

## Pipeline

Run in order. `||` marks work that can run in parallel.

1. **Discover and harden design**: two moves, both required.
   - **Diverge**: use `superpowers:brainstorming` to open up intent, requirements, and options before committing to a direction.
   - **Converge**: grill the chosen direction to stress-test it and resolve every decision branch. Use `grill-with-docs` when design touches the domain model (`CONTEXT.md`, `docs/adr/` in this repo); otherwise use `grill-me`.
   Do not write the spec until the design survives grilling.
2. **Goal gate**: lock in the stopping condition before unattended work starts. Write one completion contract with every value resolved: real feature name, real test/build commands, real E2E validation step, stopping cap, and commit rule. Success criteria must be demonstrated by visible output.

   Contract shape:
   ```text
   Ship <feature> end-to-end via the ship pipeline: full implementation plan executed; every milestone passed code review; <test command> and <typecheck/build command> exit 0 with output shown; a live end-to-end run of <real path> is shown PASSING; no git commits (AFK). Stop after <N> turns/checkpoints if unmet.
   ```

   If user said they are **not** AFK, replace "no git commits" with "commit per milestone with messages."

   Harness handling:
   - **Claude Code or Codex with `/goal` support**: ask the user to start with this prompt before going AFK:
     ```text
     /goal <fully resolved contract>
     ```
     Then run `/ship <same feature request>` or invoke this skill. If already inside a ship run and you cannot create the goal yourself, do not stop just to get a pasted `/goal`; enforce the contract yourself.
   - **Kiro or other harness without `/goal`**: ask the user to start with this prompt before going AFK:
     ```text
     Ship <feature> end-to-end. Treat this as the durable stopping condition: <fully resolved contract>. Do not wait for user approval after reviewer approval. Continue until the contract passes or a hard blocker is reached.
     ```
     Then self-drive the contract as an explicit checklist using whatever task/todo mechanism exists.
   - **Already unattended**: choose the best available enforcement path and continue. Missing goal support is not a reason to hand back.
3. **Write spec** from the hardened design.
4. **Spec review || plan drafting**: launch `superpowers:requesting-code-review` on the spec while drafting the implementation plan with `superpowers:writing-plans`.
5. **Revise**: apply spec-review feedback (`superpowers:receiving-code-review`) to both spec and plan.
6. **Dual review ||**: request review on spec and plan in parallel. Reviewer approval is the green light; do not wait for user approval.
7. **Implement**: use `superpowers:subagent-driven-development` to drive plan tasks. Each task uses `superpowers:test-driven-development` as the enforced spine: write test, watch it fail, minimal green, refactor. Use project `tdd` as the design layer for behavior choice, interface quality, domain vocabulary, ADR alignment, and refactor targets. Skip any project-skill "get user approval" step.
8. **Milestone review**: after each milestone/chunk, not each task, request review on spec plus code; revise per feedback.
9. **Finish**: run `superpowers:verification-before-completion`, then run the live E2E path. A passing E2E is done. Report failures and skips faithfully.

## Red Flags

- "I'll just commit this milestone so it's saved" -> no commits by default.
- "A worktree/branch would keep this clean" -> no worktrees ever; no branch until told.
- "Let me check with the user before implementing the plan" -> reviewer approval is approval.
- "Unit tests + typecheck pass, so it's done" -> not done; run real E2E path.
- "I'll review after this task" -> review per milestone, not per task.
- "I'll stop here and hand back ambiguity" -> decide, document the assumption, keep going unless hard blocker.
- Goal prompt contains `<feature>`, `<N>`, or unresolved placeholders -> fill every value first.
- Harness has no `/goal` -> self-drive checklist.

## Notes

- Spec and plan are quality/traceability artifacts, not gates.
- Run sub-skill reviews with subagents so main context survives the full pipeline.
