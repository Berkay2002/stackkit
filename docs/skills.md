# AI Skills

Stackkit resolves AI skills from selected modules.

Trust levels:

- `official`: vendor, framework, or platform-owned source.
- `curated`: allowlisted community source.
- `local`: Stackkit-generated project guidance.
- `unresolved`: wanted but not installed or not trusted.

Codex-compatible skills install to `.agents/skills` by default. Claude Code skills install to `.claude/skills` only when selected.

Skill installation uses `npx -y skills add ... --agent <agent> -y --copy`. Failed installs warn, continue, and are recorded in `.stackkit/project.json` and `skills-lock.json`.
