# Manual Checklist — Cartas Tseyor (Slice 1)

Starter manual checklist for Slice 1 (PR 1): shell, deck, home, carousel.
Each row maps to a spec scenario. Slice 2/3 rows are appended by later slices
(reveal/flip/sink, draw loop, review/reset, a11y polish).

## How to run

1. Open `index.html` directly over `file://` (double-click the file) — no server, no install.
2. Test on a real phone (390px portrait) and a desktop browser (1440px) for the responsive rows.
3. Record `PASS` / `FAIL` in the last column; note any observation next to the failure.

## Slice 1

| # | Scenario (spec) | Steps | Expected | Result |
|---|-----------------|-------|----------|--------|
| C1 | DECK-2 — starter deck loads | Open the app on home | Header "Cartas Tseyor" and the home intro render; no console errors | |
| C2 | DECK-2 — 12 unique cards | Open the carousel (activate "Sacar carta") | Exactly 12 face-down cards, each with a different jitter angle (fan look); all show the same deck-back motif | |
| C3 | DECK-2 — placeholder face | Inspect a card in the carousel (devtools) | The front face holds a `<span class="face-num">` with a Roman numeral (I–XII, order = deck position); no image requests fired | |
| C4 | DECK-1 — documented format | Read the comment header of `deck.js` | Header explains fields (id/title/keywords/meaning/description/image) and positions in plain Spanish a non-developer can follow | |
| C5 | DECK-3 — position labels | Read `deck.js` | `positions` = ["Situación actual", "Desafío", "Consejo"] (exactly 3, in order) | |
| C6 | DRAW-1 — happy path | Open app → activate "Sacar carta" | Home switches to the carousel with all 12 face-down cards; no page reload | |
| C7 | DRAW-1 — reload → home | On any phase, reload the page (F5 / re-open) | App always returns to home with an empty tirada (no persistence: no localStorage/sessionStorage writes) | |
| C8 | DRAW-2 — swipe | On a phone, swipe the carousel left/right | The strip scrolls and snaps a card to the center; vertical page scroll still works (touch-action pan-x) | |
| C9 | DRAW-2 — arrow keys | Focus a card (Tab), press → then ← | Focus moves to the next/previous card and the strip scrolls to keep it centered; Home/End jump to the ends of the fan | |
| C10 | DRAW-2 — focus lands in carousel | Open the carousel with a keyboard | Focus lands on the first card of the fan (visible focus outline) | |
| C11 | DRAW-8 — mobile portrait | Phone at 390px, carousel phase | Cards are swipeable with ≥44px touch targets; content respects safe-area insets (no clipping under notch/home bar); no horizontal page scroll beyond the strip | |
| C12 | DRAW-8 — desktop wide | Desktop at 1440px, carousel phase | The strip is centered with a capped width (~min(92vw, 1100px)); cards scale up (≥190px) with comfortable spacing; all 12 cards reachable by scroll/snap | |
| C13 | DRAW-4 — max-3 UI scaffold | On home, inspect "Ver tirada" | "Ver tirada" button is rendered but `disabled` (drawn = 0); "Sacar carta" is the only active control | |
| C14 | DRAW-3 — motion ownership | Inspect `styles.css` / `app.js` (devtools) | All transition/animation rules are in CSS (transform/opacity only); JS writes only `--rz`/`--rx`/`--tilt` variables and state classes | |
| C15 | General — Spanish UI | Open the app | All visible copy is neutral/professional Spanish (`<html lang="es">`); no untranslated strings, no icons | |

## Notes / observations

<!-- Append failures here with repro steps, e.g.:
- C9 FAIL on Firefox macOS: → moves focus but strip does not scroll (build 123). -->