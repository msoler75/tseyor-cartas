# Design: Visual Card Draw (Cartas Tseyor)

## Technical Approach

Greenfield static site: four plain files (`index.html`, `styles.css`, `app.js`, `deck.js`), no build step, no framework, no external fetches. One immutable-ish state record drives a single declarative `render()`; CSS owns ALL motion (3D flip-elevate, staggered sink, snap, jitter vars, reduced-motion collapse); JS owns state transitions, jitter generation, passive scroll→tilt (rAF), keyboard, IntersectionObserver, and dialog focus trapping. `deck.js` is pure data (deck + positions), loaded before `app.js` so `app.js` can be written once and never touched when the user edits the deck. Map to specs: deck-config → `deck.js` + face renderer; card-draw → home/carousel/reveal phases + motion contract; tirada-review → spread + dialog + reset. Delivered as the 3 chained PR slices from the proposal (see Slice Mapping), each independently demoable/verifiable.

## Architecture Decisions

| # | Decision | Choice | Alternatives | Rationale |
|---|----------|--------|--------------|-----------|
| D1 | Namespace & loading | `window.Cartas`, plain `<script>` tags: `deck.js` then `app.js` at end of `<body>` | ES modules, bundler | `file://` fails ES modules (CORS); plain scripts keep ordering explicit, zero build |
| D2 | State shape | Single record `{ mode:"draw"\|"review", phase, drawn:[{cardId}], selectedId }` | Multiple stores, class OOP | One source of truth; `render()` is a pure function of it; trivially resettable |
| D3 | State transition core | Pure `transition(state, action)` function; DOM effects in thin handlers | Inline mutations everywhere | Table-testable in Node with a `window` shim; matches "JS owns state transitions" |
| D4 | Motion ownership | CSS transitions/classes only; JS never tweens (except tilt) | JS rAF tween loops | Compositor-friendly; reduced-motion is a pure CSS override; proposal constraint |
| D5 | Commit-before-animation | `SELECT` updates `drawn` + `selectedId` synchronously; phase advances to `reveal` only on flip completion | Animate first, commit later | DRAW-1 scenario; interrupted animation never loses the draw (no rollback) |
| D6 | Reveal advancement | `transitionend` on the flipped card-inner + a ~800ms `setTimeout` backstop; skip straight to reveal if `prefers-reduced-motion` | Rely on transitionend only | transitionend unreliable at 0-duration (reduced-motion) and on interruption |
| D7 | Sink cleanup | Sunk siblings removed from DOM on their `transitionend` (staggered), with one ~700ms backstop sweep | Leave them hidden | DRAW-3: removes interactivity; prevents stray tab stops |
| D8 | Jitter model | Per-card CSS custom props `--rz` / `--rx` on `.card`; regenerated per carousel session (each open) | Fixed classes per card | Fans look organic each draw; CSS owns application; JS owns generation (DRAW-3) |
| D9 | Tilt vs flip separation | RotateX/Z jitter + scroll-tilt rotateY on `.card`; flip rotateY on `.card-inner` | All on one element | A single transform would fight jitter vs. tilt vs. flip; layered wrappers avoid CSS var overwrites |
| D10 | Shared detail renderer | One `renderDetail(card, posLabel)` producing reveal panel AND dialog content | Two renderers | REVIEW-2 mandates "same detail renderer as reveal"; DRY by construction |
| D11 | Re-render strategy | `render()` swaps phase skeletons; in-flight motion applied imperatively via classes (no re-render mid-animation) | Full re-render on every state change | Preserves the flip/sink DOM during animation; state + DOM never diverge because transitions drive the next render |

## State Machine

State: `{ mode: "draw"|"review", phase: "home"|"carousel"|"reveal"|"spread", drawn: [{cardId}], selectedId }`. Invariants: `drawn.length ≤ 3`; `selectedId ∈ drawn` when set in draw mode; pool = `DECK.cards − drawn`. **Draw guard (DECK-2)**: `canDraw = drawn.length < 3 && pool.length > 0` — "Sacar otra carta" renders only when `canDraw`; a carousel is NEVER opened with an empty pool. **"Tirada completa" hint** renders when `drawn.length === 3 || pool.length === 0`, with copy depending on the trigger: `drawn.length === 3` → "Tirada completa 3/3"; `pool.length === 0` (undersized deck) → "Tirada completa — no quedan más cartas" (no hard-coded 3/3). Sub-state: `phase:"carousel" && selectedId ≠ null` = *revealing* (transient, animation in flight).

### Transition table

| # | From (mode/phase) | Trigger | Guard | Next state | DOM/Side effects |
|---|-------------------|---------|-------|-----------|------------------|
| T1 | any | `RELOAD` | — | `draw/home, drawn:[], selectedId:null` | fresh render; nothing persisted (REVIEW-5) |
| T2 | `draw/home` | "Sacar carta" | — | `draw/carousel` | build pool = deck − drawn; generate jitter; focus first card |
| T3 | `draw/carousel` | `SELECT(cardId)` | card not in drawn | `draw/carousel` (revealing) + `drawn += id`, `selectedId = id` **commit now** | add `.is-flipped` to card, `.is-sunk` to siblings; announce on flip end |
| T4 | `draw/carousel` (revealing) | `FLIP_END` (transitionend / backstop / reduced-motion shortcut) | — | `draw/reveal` | render reveal skeleton; raise+enlarge card; bind IntersectionObserver on detail; announce "… — Posición" (DRAW-7) |
| T5 | `draw/carousel` (revealing) | `SELECT(any)` / repeat activation | `selectedId ≠ null` | unchanged (no-op) | no duplicate, no new animation (DRAW-2 double-activation) |
| T6 | `draw/carousel` (revealing) | `SINK_END` (per card) | — | unchanged (DOM only) | remove sunk card from DOM |
| T7 | `draw/reveal` | "Sacar otra carta" | `canDraw` = `drawn.length < 3 && pool.length > 0` | `draw/carousel` | new pool (no repeats, DECK-4); fresh jitter; focus first card. If `drawn.length < 3` but `pool.length === 0` (DECK-2 undersized deck), the trigger does not exist: reveal instead renders the pool-exhausted "Tirada completa" hint |
| T8 | `draw/reveal` | "Ver tirada" | `drawn.length ≥ 1` | `review/spread`, `selectedId:null` | render spread; "Ver tirada" hidden when 0; if review is ever rendered empty (direct render call), the safe empty state shows instead (REVIEW-1 empty guard) |
| T9 | `review/spread` | `TAP(cardId)` | — | `review/spread` + `selectedId = cardId` | open dialog (shared renderer); trap focus; remember trigger for return |
| T10 | `review/spread` (dialog open) | Escape / "Cerrar" | — | `review/spread` + `selectedId:null` | close dialog; restore focus to activating card (REVIEW-2/3) |
| T11 | `review/spread` (no dialog) | Back control / Escape | — | `draw/reveal` + `selectedId = drawn[last]` | resume at last reveal; state round-trip unchanged (REVIEW-4) |
| T12 | `draw/reveal` or `review/*` (any) | "Nueva tirada" | — | `draw/home, drawn:[], selectedId:null` | close dialog if open (incl. from the dialog's own "Nueva tirada" footer action, REVIEW-5), drop focus trap, clear inert, instant reset, no confirmation |
| T13 | `draw/home` / `draw/carousel` / `draw/reveal` | Escape | — | unchanged (no-op) | DRAW-7: Escape only meaningful in review dialog |

Flow (happy path, 12-deck):

```
home ──Sacar carta──▶ carousel(12) ──SELECT──▶ [flip+sink 600ms] ──▶ reveal(1/3)
                                                        │
        ┌─────────── "Sacar otra carta"  ◀──────────────┘ (pool 11)
        ▼
carousel(11) ▶ reveal(2/3) ▶ carousel(10) ▶ reveal(3/3) ──"Tirada completa" hint──▶ Ver tirada
                                                                                        │
                  "Nueva tirada" ◀── draw/reveal ◀── Back/Esc ── review/spread ◀────────┘
```
Undersized deck (e.g. 2 cards): `reveal(2/2)` shows the pool-exhausted hint "Tirada completa — no quedan más cartas" (no 3/3), "Ver tirada" remains available, no empty carousel ever opens (DECK-2).       

## Rendering Strategy

- `render()` = pure skeleton swap per (mode, phase): builds `#app` inner DOM from `window.Cartas.deck` + state (home → carousel → reveal → spread) and the sibling `#dialog-root` overlay when the review dialog is open. No DOM diffing library; reconciliation is "replace phase container, keep shared chrome (live region, header)".
- **In-flight motion is imperative**: `SELECT` does NOT call `render()`; it adds `.is-flipped` (selected) / `.is-sunk` (siblings, `transition-delay: calc(var(--i) * 45ms)`). `FLIP_END` triggers `render()` → `draw/reveal`. Sunk removal is DOM-only (`T6`). This keeps the animating carousel DOM untouched until animation completes.
- **Jitter per session**: on each carousel open, JS writes `--rz` (±4–10° rotateZ) and `--rx` (±2–6° rotateX) onto each `.card` via inline style; CSS composes `transform: rotateX(var(--rx)) rotateZ(var(--rz)) rotateY(var(--tilt,0deg))`. Fresh values every session; tilt starts 0.
- **Sink cleanup**: siblings get `.is-sunk` (translateY + opacity, staggered 45ms); each removes itself on `transitionend`; one `setTimeout(~700ms)` backstop sweeps stragglers; reduced-motion: durations → ~0, backstop handles removal.
- **Dialog focus trap**: the dialog lives OUTSIDE `#app` — a sibling overlay (e.g. `#dialog-root`, a direct child of `<body>`, `position:fixed`) so `#app` can be inerred without inering the dialog. On open: save `document.activeElement`; set `#app.inert = true` (background inert, dialog stays live — REVIEW-3 trap unaffected); keydown handler cycles Tab/Shift+Tab through `dialog.querySelectorAll(focusableSel)`; on close remove trap, clear inert, `focus()` the saved trigger. Trap is the guaranteed mechanism; `inert` is enhancement. Because the dialog is a sibling of `#app`, it renders its own footer actions — "Cerrar" AND "Nueva tirada" — so REVIEW-5's "reset with dialog open" has a reachable path: activating "Nueva tirada" inside the dialog fires T12 (closes dialog, drops trap, clears inert, resets to home).
- **Scroll→tilt**: passive `scroll` listener on carousel (rAF-throttled) computes per-card `--tilt` from distance-to-center (rotateY ∝ offset); skipped entirely under reduced-motion.
- **Scroll-reveal detail**: one `IntersectionObserver` (threshold ~0.2) adds `.is-visible` to the detail panel once; observer disconnected after reveal (DRAW-5).
- **Review empty-spread safe render (REVIEW-1)**: `render()` is defensive — if it ever produces `mode:"review"` with `drawn.length === 0` (only reachable via a direct render call, since T8 requires `drawn.length ≥ 1`, and a fresh `mode:"review"` state is impossible through triggers), it renders a safe empty state: a short Spanish message ("Aún no has sacado cartas"), NO spread, NO dialog, NO crash; "Ver tirada" never renders in this state. Review is never reachable empty, but rendering empty never breaks.

## CSS 3D System

```
.carousel-item (snap unit)
  └─ button.card (focusable, preserve-3d? no → wrapper)   [jitter: --rx --rz, tilt: --tilt]
       └─ .card-inner (preserve-3d, transition: transform .6s ease)
            ├─ .face--back  (backface-visibility:hidden; the "deck back" pattern)
            └─ .face--front (backface-visibility:hidden; transform: rotateY(180deg); big number)
```

- Setup: `.carousel { perspective: 1400px; scroll-snap-type: x mandatory; }`; each `.card { perspective: 900px }` gives the flip depth on `.card-inner`; `.face--* { position:absolute; inset:0; backface-visibility:hidden; }`.
- **Flip-elevate**: `.is-flipped .card-inner { transform: translateY(-14%) scale(1.08) rotateY(180deg); }` — one compositor-friendly transform transition (~600ms ease-in-out; timings are design-time, apply may tune).
- **Carousel strip**: `display:flex; overflow-x:auto; touch-action:pan-x; scroll-snap-type:x mandatory;` each item `scroll-snap-align:center;` — snapped linear strip, not a JS carousel.
- **Sink**: `.is-sunk { transform: translateY(24%) scale(.92); opacity:0; transition: transform .45s ease-in var(--i*45ms), opacity .45s ease-in var(--i*45ms); }`.
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` forces `transition-duration:0.01ms` (or `none`) on all motion classes; JS `matchMedia` shortcut (D6) skips straight to reveal; tilt listener not attached.
- **will-change**: applied only while animating (`.is-flipped`, `.is-sunk`), removed on transitionend — never on idle cards.
- Reveal's enlarged card is a fresh standalone element (front face, no transition): `.reveal-card { width: min(72vw, 340px); }` static 3D pose, capped (DRAW-8).

## Responsive Layout System

- **Strategy**: mobile-first base; one desktop breakpoint `@media (min-width: 768px)` for draw flow and a `1024px` refinement for review spread row. No orientation dependency — `dvh` + `min()` keep layouts functional portrait or landscape (DRAW-8, REVIEW-6).
- **Sizing tokens**: card `width: clamp(140px, 38vw, 210px)` mobile / `clamp(190px, min(22vw, 30vh), 260px)` desktop; `aspect-ratio: 3/4.6`; gap `clamp(10px, 2.5vw, 24px)`.
- **Carousel**: mobile = full-bleed swipeable strip with `scroll-padding-inline: 50%` centering; desktop = `max-width: min(92vw, 1100px); margin-inline: auto; justify-content: center;` — centered, comfortable spacing.
- **Detail panel**: `max-width: 65ch; margin-inline: auto;` (line-length readability, DRAW-8); reveals below the centered capped card.
- **Dialog**: `width: min(92vw, 640px); max-height: min(85dvh, 85vh); overflow-y: auto;` — internally scrollable on small screens (REVIEW-6); centered via flex/grid overlay.
- **Safe area / viewport**: `height: 100vh; height: 100dvh;` (fallback order) on app shell; `padding: env(safe-area-inset-*)` on horizontal regions.
- **Touch + mouse coexistence**: all targets ≥44px; pointer-events default; hover only as enhancement (`@media (hover:hover)`); scroll-snap keeps swipe and trackpad consistent; focus-visible outlines for keyboard.

## Accessibility Wiring

| Element | Role/ARIA | Keyboard | Notes |
|---------|-----------|----------|-------|
| Carousel cards | `<button>` (implicit), `aria-label="Carta N"` | ←/→ move focus + `scrollIntoView({inline:'center'})`; Enter/Space select; Home/End (optional) | focus lands on first card when carousel opens (DRAW-2) |
| Reveal heading | `h2` `tabindex="-1"` (programmatic focus target) | — | moves SR context after flip |
| Live region | `aria-live="polite"` (empty div, persistent in shell) | — | announces reveal "El Sol — Situación actual" (DRAW-7) and the "Tirada completa" hint (either copy from the hint rule) |
| Review detail | `role="dialog"` `aria-modal="true"` `aria-labelledby` (title id); sibling overlay of `#app` (not a child), `#app.inert = true` while open | Escape / "Cerrar" close; Tab cycles inside (trap REVIEW-3); "Nueva tirada" in dialog footer reachable while open (REVIEW-5) | focus moves in on open, restores to trigger on close |
| Global | — | Escape = no-op in draw phases (DRAW-7); "Nueva tirada" enabled in reveal/review | all controls text-only buttons ≥44px, no icons |
| Focus visibility | `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }` | — | never removed via `outline:none` |
| Motion | `prefers-reduced-motion: reduce` media query collapses all motion (~instant) | — | JS also consults `matchMedia` for phase shortcuts (D6) |

## Data Flow

```
deck.js (data) ──window.Cartas.deck──▶ app.js init ──▶ state {mode,phase,drawn,selectedId}
                                                          │
        user event (click/key/scroll/IO) ──▶ transition(state, action) ──▶ new state
                                                          │
                          render() ──▶ #app skeleton  +  imperative motion classes
                                                          │
                                          CSS transitions/animation ──▶ transitionend ──▶ next transition
```

## File Structure & Load Order

| File | Action | Role | Est. size | Load order |
|------|--------|------|-----------|------------|
| `index.html` | Create | Shell: `<html lang="es">`, meta viewport, `#app` root, persistent aria-live region, `<link styles.css>` in head, `<script src="deck.js">` then `<script src="app.js">` at end of body | ~150–200 lines | 1 (defines structure) |
| `styles.css` | Create | ALL motion + layout: tokens, 3D card system, carousel/snap, jitter vars, flip/sink/reveal, detail panel, spread, dialog, responsive, reduced-motion, focus-visible | ~400–600 lines | 2 |
| `deck.js` | Create | Pure data: `window.Cartas.deck = { positions:[…3], cards:[…12] }`; Spanish comment header documenting the editable format (user-facing) | ~120–180 lines | 3 (before app.js) |
| `app.js` | Create | `window.Cartas`: init, pure `transition()`, `render()`, jitter gen, keyboard, tilt rAF, IO, dialog trap, aria announcements | ~300–450 lines | 4 |

**deck.js format (documented in its header, Spanish, non-developer oriented)**: `window.Cartas.deck.positions` = 3 label strings; `window.Cartas.deck.cards[]` entries: `id` (unique kebab-case), `title`, `keywords`, `meaning`, `description`, optional `image` (reserved, falsy → placeholder big number). Editing titles/meanings MUST never require touching other files (DECK-1 scenario).

## Deck Content Direction (apply authors full prose, Spanish)

Content model already fixed by DECK-1; direction for apply:

- **Structure**: 12 cards, ids `sol, luna, estrella, camino, montana, rio, bosque, semilla, mago, llave, espejo, vuelo`. Positions fixed `["Situación actual", "Desafío", "Consejo"]` (DECK-3).
- **Face**: large centered number = deck-array index + 1 (auto-renumbers if user reorders). Apply may use Roman numerals as a stylistic accent (frontend-design latitude) — keep it a `<span>` so future `image` swaps cleanly.
- **Tone**: neutral/professional Spanish, second-person direct address ("Te invita a…"), reflective and concrete — no esoteric jargon overload, no prescriptive fortune-telling; optimistic-rational.
- **Lengths**: keywords 2–4 comma-separated; meaning 1–2 sentences; description 2–4 sentences (~40–90 words). Vary rhythm across cards; no filler.

## Interfaces / Contracts

```js
// window.Cartas (set by deck.js then app.js)
Cartas.deck = { positions: ["Situación actual","Desafío","Consejo"],
                cards: [{ id:"sol", title:"El Sol", keywords:"…", meaning:"…",
                          description:"…", image:"" }] };
Cartas.state  = { mode, phase, drawn:[{cardId}], selectedId };
Cartas.transition(state, action) → newState;   // pure, table-driven
Cartas.render();                                // skeleton swap from Cartas.state
// CSS custom props (JS writes, CSS composes)
.card  { --rx; --rz; --tilt; }                  // jitter + scroll tilt
.carousel-item { --i; }                         // sink stagger index
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit (Node smoke) | `transition()` table (T1–T13: max-3, no-repeat, commit-before-animation, resume-at-last-reveal, instant reset, DECK-2 pool-exhaustion guard — T7 refuses when pool empty, hint renders for pool=0 even with `drawn.length < 3`); deck-format invariants: ≥1 card, unique ids, exactly 3 position labels, required fields present (`id`/`title`/`keywords`/`meaning`/`description`) | `verify/smoke.mjs` with `global.window` shim loading `deck.js` + exercising pure `transition()`; no browser needed. Smoke runs against the shipped 12-card deck AND a synthetic undersized deck (e.g. 2 cards) to prove DECK-2 |
| Manual (scripted checklist) | Full ritual loop, swipe/keys, flip/sink visuals on device, dialog trap, reduced-motion, reload→home, responsive 390px/1440px, Spanish copy | sdd-verify checklist mapped 1:1 to spec scenarios (DRAW-1..8, REVIEW-1..6, DECK-1..4) |
| E2E | None (file:// static; no infra) | manual only — documented in verify-report |

## Migration / Rollout

No migration. Rollout = 3 chained PR slices (stacked-to-main, proposal's delivery shape); each slice independently demoable and revertible (`git revert` per slice; greenfield). No persistence, flags, or data migration anywhere.

## Slice Mapping (chained PRs)

| Slice | Files touched | Design elements delivered | Verifiable by |
|-------|--------------|---------------------------|---------------|
| **1 — Shell + deck + home + carousel** | `index.html`, `deck.js`, `styles.css` (base+capsule), `app.js` (init, T1/T2, render home/carousel, jitter, tilt rAF, arrow keys, focus-first) | Docs D1/D2/D3 skeleton, D8/D9 jitter+tilt, carousel strip+snap CSS, max-3 guard UI scaffolding, "Ver tirada" placeholder (disabled while drawn=0) | home renders; carousel swipes/arrows; 12 unique cards; reload→home |
| **2 — Reveal + detail + draw loop** | `app.js` (T3–T7), `styles.css` (flip/sink/reveal/detail/responsive), minor `index.html` | D4/D5/D6/D7 motion contract, flip-elevate+sink, reveal skeleton, IO detail (65ch, DRAW-8), "Sacar otra carta", no-repeat pool, `canDraw` guard + "Tirada completa" hint (both copies: 3/3 and pool-exhausted, DECK-2) | full draw loop to 3/3; commit-before-animation; sunk removal; reduced-motion shortcut; undersized-deck scenario (hint on pool exhaustion, no empty carousel) |
| **3 — Review + reset + a11y polish** | `app.js` (T8–T13, dialog trap, announcements), `styles.css` (spread, dialog, desktop review, focus-visible, reduced-motion pass), `index.html` (live region wiring, `#dialog-root` sibling overlay) | D10 shared renderer, REVIEW-1..6 spread+dialog+trap+resume, `#dialog-root` sibling-of-`#app` placement (F2), "Nueva tirada" in dialog footer (F2), REVIEW-1 empty-spread safe render (F3), "Nueva tirada" T12, DRAW-7/REVIEW-5 announcements, final polish | review round-trip preserves state; trap holds; reset works with dialog open; empty-spread render safe; a11y checklist green |

## Component / Skill Loading Note

`apply` will implement with the `frontend-design` skill pre-loaded (sibling workspace `tseyor/.agents/skills/frontend-design`). The design above leaves aesthetic latitude on purpose: fonts (paired display+body, e.g. a characterful serif/slab display with a refined humanist body — implementer's choice, must avoid Inter/Roboto/generic-AI clichés per the skill), card-back pattern (geometric/linocut-style flat motif, no gradients-by-default), color tokens (dominant deep ink + muted paper + one sharp accent via CSS vars), jitter feel, and Roman-vs-Arabic face numerals. All structural, motion, state, and a11y contracts above are binding regardless of the chosen aesthetic.

## Open Questions

- None blocking. Design-time timings (600ms flip, 45ms stagger, jitter ±4–10°/±2–6°) and spread labels are already fixed by proposal/specs; apply may tune feel within spec contract.