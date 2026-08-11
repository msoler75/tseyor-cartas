# SDD Skill Registry

Index of skills resolvable for this project. Subagents receive exact paths and
read the full SKILL.md as the source of truth — this file is an index only.

- Project: cartas-tseyor
- Generated: 2026-08-11 (sdd-init)
- Scope rules: `sdd-*`, `_shared`, and `skill-registry` are intentionally excluded.

## User-level skills (`~/.config/opencode/skills/`)

| Skill | Trigger | Path | Scope |
| ----- | ------- | ---- | ----- |
| branch-pr | Create Gentle AI pull requests with issue-first checks. Trigger: creating, opening, or preparing PRs for review. | `~/.config/opencode/skills/branch-pr/SKILL.md` | user |
| chained-pr | Trigger: PRs over 400 lines, stacked PRs, review slices. Split oversized changes into chained PRs that protect review focus. | `~/.config/opencode/skills/chained-pr/SKILL.md` | user |
| cognitive-doc-design | Design docs that reduce cognitive load. Trigger: writing guides, READMEs, RFCs, onboarding, architecture, or review-facing docs. | `~/.config/opencode/skills/cognitive-doc-design/SKILL.md` | user |
| comment-writer | Write warm, direct collaboration comments. Trigger: PR feedback, issue replies, reviews, Slack messages, or GitHub comments. | `~/.config/opencode/skills/comment-writer/SKILL.md` | user |
| go-testing | Trigger: Go tests, go test coverage, Bubbletea teatest, golden files. Apply focused Go testing patterns. | `~/.config/opencode/skills/go-testing/SKILL.md` | user |
| issue-creation | Create Gentle AI issues with issue-first checks. Trigger: creating GitHub issues, bug reports, or feature requests. | `~/.config/opencode/skills/issue-creation/SKILL.md` | user |
| judgment-day | Trigger: judgment day, dual review, adversarial review, juzgar. Run blind dual review, fix confirmed issues, then re-judge. | `~/.config/opencode/skills/judgment-day/SKILL.md` | user |
| skill-creator | Trigger: new skills, agent instructions, documenting AI usage patterns. Create LLM-first skills with valid frontmatter. | `~/.config/opencode/skills/skill-creator/SKILL.md` | user |
| skill-improver | Trigger: improve skills, audit skills, refactor skills, skill quality. Audit and upgrade existing LLM-first skills. | `~/.config/opencode/skills/skill-improver/SKILL.md` | user |
| work-unit-commits | Plan commits as reviewable work units. Trigger: implementation, commit splitting, chained PRs, or keeping tests and docs with code. | `~/.config/opencode/skills/work-unit-commits/SKILL.md` | user |

## Project-level skills

None detected. `cartas-tseyor` is a brand-new empty repo; no project skill
directories exist yet. Re-scan after any `.agents/skills/` or similar is added.

## Additional skills resolvable in this agent environment

The following skills are resolvable via the `skill()` tool this session because
the agent runs from the sibling workspace `/home/dev_901/tseyor` (its
`.agents/skills/` directory). They are NOT part of this project's own layout;
verify availability before relying on them during apply:

- frontend-design, branding, copywriting, content-strategy, homepage-generator,
  image, landing-page-design, seo-audit, site-architecture, web-design-guidelines,
  web-design-reviewer — all under `/home/dev_901/tseyor/.agents/skills/<name>/SKILL.md`

## Convention files

- `~/.config/opencode/AGENTS.md` — user-level agent rules (persona, engram protocol, response-length contract). Applies to this session.
- `cartas-tseyor/AGENTS.md` — none present.