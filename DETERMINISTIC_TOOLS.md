# DETERMINISTIC_TOOLS.md — Cartas Tseyor

Deterministic tooling inventory for the `cartas-tseyor` project (static vanilla
frontend: HTML + CSS 3D animations + JavaScript; no framework, no database, no
build step).

**Purpose:** classify every verification/quality capability so an agent never
falls back to probabilistic guessing when a deterministic tool already exists.
Run `./scripts/check.sh full` before declaring work done.

**Classification legend:**

- **A — Exists and is used:** deterministic tool in place and exercised.
- **B — Exists but underused:** tool present, but not wired into the standard gate.
- **C — Missing:** gap; a deterministic tool should exist here (mature/standard first).
- **D — Custom script:** project-owned script that fills a gap; acceptable when
  no mature tool fits (zero-dependency design).
- **E — Still probabilistic:** deliberately left to the LLM (no good deterministic fit).

---

## 1. Syntax validation

| Tool | Class | Status | Command |
| ---- | ----- | ------ | ------- |
| `node --check` (Node v22) | A | Green | `node --check app.js deck.js verify/smoke.mjs verify/mini-deck.mjs` |
| `bash -n` | A | Green | `bash -n deploy-caddy.sh scripts/check.sh` |
| PyYAML (`python3 -c yaml.safe_load`) | A | Green | validates `openspec/config.yaml` |
| `caddy validate` (v2.11.4) | A | Green | `caddy validate --config Caddyfile.new --adapter caddyfile` |
| `shellcheck` | C | Missing | not installed; `bash -n` is the current ceiling |

## 2. Runtime behavior

| Tool | Class | Status | Command |
| ---- | ----- | ------ | ------- |
| `verify/smoke.mjs` (89 checks) | A | Green | `node verify/smoke.mjs` |
| `verify/mini-deck.mjs` fixture | A | Green | used by smoke.mjs (DECK-2 path) |
| `verify/checklist.md` (manual device pass) | B | Underused | manual rows pending (C8–C12, C17–C19, C23–C25, C29–C32, C38–C39, C41–C42, C45) |

## 3. Project guardrail

| Tool | Class | Status | Command |
| ---- | ----- | ------ | ------- |
| `scripts/check.sh` | D | Green | `./scripts/check.sh fast` / `full` (wraps 1+2+YAML+Caddyfile+deck data) |

## 4. Static analysis / style

| Tool | Class | Status | Notes |
| ---- | ----- | ------ | ----- |
| ESLint | C | Missing | no config, no package.json by design |
| Prettier | C | Missing | no formatter installed |
| html-validate | C | Missing | not installed |
| stylelint | C | Missing | not installed |

## 5. Build / bundling / type checking

| Tool | Class | Status | Notes |
| ---- | ----- | ------ | ----- |
| esbuild / vite / webpack | E | N/A | no build step by design (static files served as-is) |
| TypeScript / `tsc` | E | N/A | vanilla JS by design; no type-checking gate |

## 6. Deploy

| Tool | Class | Status | Command |
| ---- | ----- | ------ | ------- |
| `deploy-caddy.sh` | D | Green | `sudo /home/dev_901/cartas-tseyor/deploy-caddy.sh` (backup + validate + install + reload) |
| live smoke (`curl -I https://164.68.107.151.sslip.io/cartas-tseyor/`) | B | Underused | not part of check.sh; manual post-deploy |

## 7. Agent-level guardrails

| Tool | Class | Status | Notes |
| ---- | ----- | ------ | ----- |
| Global `~/.config/opencode/AGENTS.md` rule | D | Green | deterministic-check rule added (see rule text) |
| `.atl/skill-registry.md` | A | Green | SDD skill index for sub-agents |

---

## Commands cheat-sheet

```bash
./scripts/check.sh fast   # syntax + smoke (seconds, daily)
./scripts/check.sh full   # fast + YAML + Caddyfile + deck data (pre-PR)
node verify/smoke.mjs     # 89-check suite (raw)
sudo ./deploy-caddy.sh    # deploy to Caddy (root-only path)
```

## Explicitly still probabilistic (E) — accepted

- Visual/UX judgment: CSS 3D feel, responsive layout, dialog UX (manual device pass in `verify/checklist.md`).
- Content quality of the 12 Spanish card texts (human/LLM editorial judgment).
- Business-level review of requirements/scope (SDD proposal/spec phases).

## Future improvements (not implemented now — conservative by design)

1. Install `shellcheck` and wire into `check.sh full` (mature, standard).
2. Add `html-validate` for `index.html` (mature, standard; would add a dev dependency).
3. Add a curl-based live-health step to `check.sh full` (needs a running Caddy endpoint or flag).
4. Consider a `package.json` with npm scripts if a build step ever appears — currently avoided to preserve zero-dependency design.
