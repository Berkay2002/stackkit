# Ship Skill Dependencies

Read this only when a ship run is blocked because required process skills are missing and no harness-equivalent capability exists.

## Required Capabilities

The pipeline needs these capabilities, not necessarily these exact skill names:

| Capability | Preferred skill |
|------------|-----------------|
| Divergent design exploration | `superpowers:brainstorming` |
| Spec/plan writing | `superpowers:writing-plans` |
| Independent review | `superpowers:requesting-code-review` |
| Review feedback handling | `superpowers:receiving-code-review` |
| Subagent task execution | `superpowers:subagent-driven-development` |
| Enforced test-first implementation | `superpowers:test-driven-development` |
| Completion verification | `superpowers:verification-before-completion` |
| Domain-aware TDD | `tdd` |
| Design grilling | `grill-me` or `grill-with-docs` |

## Install Guidance

Ask once before installing. Install only what is missing. Use non-interactive commands when user approves.

For both Claude Code and Codex:

```bash
npx --yes skills add obra/superpowers  -a claude-code -s '*' -y
npx --yes skills add obra/superpowers  -a codex       -s '*' -y
npx --yes skills add mattpocock/skills -a claude-code -s '*' -y
npx --yes skills add mattpocock/skills -a codex       -s '*' -y
```

If the user wants to install manually:

```bash
npx skills add mattpocock/skills -a claude-code
npx skills add obra/superpowers  -a claude-code
npx skills add mattpocock/skills -a codex
npx skills add obra/superpowers  -a codex
```

After installation, re-invoke the ship skill. If installation is declined and no equivalent capability exists, stop with the missing capability list.
