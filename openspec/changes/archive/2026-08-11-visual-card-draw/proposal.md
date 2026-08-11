# Proposal: Visual Card Draw (Cartas Tseyor)

## Title

Static, Spanish-language tarot-like card-drawing app: draw up to 3 upright cards from a fanned carousel of face-down cards with a CSS-3D flip-elevate reveal, a scroll-revealed meaning panel, a review mode for the current tirada, and an instant reset — memory-only, no backend, no build step.

## Intent (Why / problem)

The user wants a calm, ritual-like card tool ("Cartas Tseyor") that runs anywhere: double-click `index.html`, no install, no server, no framework. It must feel tactile (irregular fanned cards, raise-and-flip reveal) yet stay accessible (keyboard, `prefers-reduced-motion`) and trivially editable (deck data in a documented config file; real JPG art will come later). v1 is the complete interactive loop, fully in Spanish.

## Scope

### In Scope
- Home phase: brief instructions + "Sacar carta".
- Carousel: face-down cards with per-draw random rotation jitter; scroll-snap swipe (mobile-first) and arrow-key browsing.
- Selection: chosen card rises & flips (pure CSS 3D ~600ms); remaining cards sink with staggered delay.
- Reveal: chosen card enlarges; scrolling reveals the detail panel below (IntersectionObserver).
- Max-3 guard: no 4th draw ("Sacar carta" hidden → "Tirada completa 3/3" hint).
- Repeat-draw loop: "Sacar otra carta" opens the next carousel; pool excludes already-drawn ids.
- Review-tirada state: view all drawn cards with position labels; tap → shared detail renderer; back/Escape returns.
- "Nueva tirada": instant reset, no confirmation (destructive by design).
- Text-only controls (no icons).
- Spanish UI (`<html lang="es">`, all copy Spanish).
- Responsive both ways: mobile-first (safe-area insets, 100dvh/100vh fallback, touch-action pan-x, ≥44px targets) AND a deliberate desktop layout (clamp()/min() sizing, max reading width for the detail panel, carousel/review spread that scales gracefully on wide screens) — looks good and stays usable on both.
- Accessibility floor: keyboard (arrows/Enter/Escape, focus-visible), `aria-live` reveal announcements, `role="dialog"` review detail, `prefers-reduced-motion: reduce` instant-mode.

### Out of Scope
- Persistence of any kind (no localStorage, no backend; reload → home). Explicitly removes resume/load-sanitize concerns from the exploration.
- Reversed cards / reversed meanings.
- Icons.
- Real JPG card art (future, via reserved `image` field per card).
- Multi-tirada history.
- Framework, build step, bundler, dependencies.

## Capabilities

> Contract with sdd-spec. `openspec/specs/` is empty (greenfield) — all capabilities are New.

### New Capabilities
- `deck-config`: documented configurable deck format (`deck.js`), starter deck of ~12 cards with placeholder big-number faces, `image` field reserved, spread positions, no-repeat pool logic.
- `card-draw`: home/carousel/reveal phases, jitter + snap + flip-elevate + sink animations, reveal detail panel, max-3 guard, "Sacar otra carta" loop, keyboard/reduced-motion behavior of the draw flow.
- `tirada-review`: review mode (spread + detail), transitions to/from draw flow, "Nueva tirada" instant reset.

### Modified Capabilities
- None (empty `openspec/specs/`).

## Approach

Single `window.Cartas` namespace; plain `<script>` tags loading `deck.js` then `app.js` (NOT ES modules — `file://` CORS). One state object drives a declarative render: `{ mode: "draw"|"review", phase, drawn: [{cardId}], selectedId }`; `drawn.length` ≤ 3, position meanings derived from array index. CSS owns ALL motion (3D flip, snap, stagger, reduced-motion variants); JS owns state transitions, jitter generation, passive scroll→tilt binding, keyboard, intersection observation. Zero external fetches; system font stack.

## Key Decisions + Rationale

1. **Upright-only** (user) — rotation jitter supplies the visual irregularity; halves authoring cost; model stays extensible for future reversed text.
2. **No repeats within a tirada** (user) — carousel pool = `DECK − drawn`; 12→3 never empties the pool.
3. **Configurable deck** (user) — clearly documented `deck.js`; user edits titles/meanings now, swaps in JPGs later.
4. **Card face = big number only** (user) — placeholder for future art; model keeps a per-card `image` reference field.
5. **Instant reset, no confirmation** (user) — deliberate destructive-by-design choice.
6. **No persistence** (user) — all state in session memory; reload → home.
7. **Deck size ~12** (judgment, band 10–18) — enough variety to feel real; small enough for hand-authored quality Spanish text; extension is free (array length).
8. **Spread positions** (proposed, needs confirm): fixed labels 0=“Situación actual”, 1=“Desafío”, 2=“Consejo” — meaning belongs to the position, not the card.
9. **Plain scripts, no ES modules** (judgment) — modules fail under `file://`; single namespace keeps ordering explicit.

## Assumptions

- Starter deck archetypes from exploration (El Sol, La Luna, La Estrella, El Camino, La Montaña, El Río, El Bosque, La Semilla, El Mago, La Llave, El Espejo, El Vuelo) are provisional; titles/keywords/meanings/descriptions hand-authored during apply.
- Animation timings (flip ~600ms, sink stagger 45ms, ease-in-out) and jitter ranges (±4–10° rotateZ, ±2–6° rotateX) are design-time values.
- `file://` is a supported usage mode.
- Home is re-entered only when `drawn.length === 0`; mid-ritual flow is reveal → carousel (no home pass between draws).
- "Ver tirada" control is enabled when `drawn.length ≥ 1`.
- All Spanish copy authored by the implementer (neutral/professional Spanish).

## Open Questions

1. Confirm spread labels (Situación actual / Desafío / Consejo) — proposed above, not yet user-confirmed.
2. Returning from review to draw: resume at last reveal vs. jump straight to next carousel (recommend last reveal).
3. Confirm starter archetype list/tone; otherwise any 12-card list works.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `index.html` | New | App shell, Spanish UI, script tags (deck.js, app.js) |
| `styles.css` | New | CSS 3D transforms, carousel/snap, jitter, sink, reduced-motion |
| `app.js` | New | State machine, render, jitter, keyboard, IO, transitions |
| `deck.js` | New | Configurable deck data + spread positions (user-editable) |
| `openspec/` | Modified | Change artifacts (specs/design/tasks/verify to follow) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| CSS-3D performance on low-end mobile | Med | Compositor-only transforms/opacity; ≤ ~12 live cards; sunk cards removed on transitionend; `will-change` only on animating elements |
| `file://` strictness (later JPGs) | Low | Plain scripts already safe; images are local files, no CORS fetches |
| Keyboard/reduced-motion untested on real devices | Med | Dedicated a11y pass in slice 3; manual device verification |
| No test infrastructure | High | Apply phase establishes minimal verification tooling before verify |

## Rollback Plan

Greenfield static site: revert = `git revert` of the change's commits (or delete `index.html`, `styles.css`, `app.js`, `deck.js`). Each chained PR slice is independently revertible. No data migration, no backend, no persistence to unwind.

## Dependencies

- None external. Zero network requests; system font stack.
- Skill loading for design/apply: `frontend-design` (available in sibling workspace, per skill registry).

## Success Criteria

- [ ] Full ritual loop works: draw up to 3 unique cards (no repeats), flip-elevate reveal, scroll-revealed detail, review all drawn, instant reset.
- [ ] Carousel browsable by swipe and arrow keys; Enter/Space selects; Escape closes review detail.
- [ ] `prefers-reduced-motion: reduce` renders all states functional with no animation.
- [ ] Editing `deck.js` changes deck content without touching app code (documented format).
- [ ] Reloading the page returns to home (no persistence).
- [ ] All UI text in Spanish; contrast and tap targets meet the stated floor.

## Suggested Delivery Shape

Single SDD change (the app is one interlocked state machine — slicing into separate changes would land non-usable half-products). Forecast ~1,000–1,400 lines total (`index.html` ~150–200, `styles.css` ~400–600, `app.js` ~300–450, `deck.js` ~120–180) — exceeds the 400-line review budget. **Delivery: 3 chained PR slices (stacked-to-main strategy, already chosen)**:

1. **Slice 1 — Shell + deck + home + carousel**: `index.html` skeleton, `deck.js` (12 cards + positions), home phase, carousel with jitter/tilt/snap + keyboard, max-3 guard in UI. "Ver tirada" placeholder.
2. **Slice 2 — Reveal + detail + draw loop**: flip-elevate + staggered sink, reveal phase, scroll-revealed detail panel, "Sacar otra carta" loop, no-repeat pool enforcement. (Persistence removed vs. exploration.)
3. **Slice 3 — Review + reset + a11y polish**: review/spread + detail, "Nueva tirada" instant reset, keyboard/aria/reduced-motion pass, final visual polish.

Each slice independently demoable and verifiable.