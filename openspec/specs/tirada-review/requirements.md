# tirada-review Specification

## Purpose

Review mode for Cartas Tseyor: inspect the completed tirada (spread + per-card detail dialog), transition back to the draw flow, and reset instantly via "Nueva tirada" — memory-only, no confirmation, no persistence.

## Requirements

### Requirement: REVIEW-1 — Review spread

Review MUST render all drawn cards (1–3) in drawn order with their position labels from deck.js. "Ver tirada" MUST be enabled only when `drawn.length ≥ 1`. Review MUST NOT be reachable with an empty spread; if entered empty it MUST render a safe empty state, never a broken view.

#### Scenario: Spread renders

- GIVEN a tirada with 2 drawn cards
- WHEN the user activates "Ver tirada"
- THEN review shows both cards labeled "Situación actual" and "Desafío"

#### Scenario: Empty guard

- GIVEN `drawn.length = 0`
- WHEN review is rendered (e.g. direct render call)
- THEN an empty state renders with no spread and no crash

### Requirement: REVIEW-2 — Review detail dialog

Activating a spread card MUST open its detail as a modal `role="dialog"` (aria-modal) using the same detail renderer as reveal. Focus MUST move into the dialog on open; Escape MUST close it and return focus to the activating card.

#### Scenario: Open and close

- GIVEN the spread is visible and a card is focused
- WHEN the user presses Enter on the card
- THEN a dialog opens showing title, keywords, meaning, description, and position label; focus is inside and background is inert
- WHEN the user presses Escape
- THEN the dialog closes and focus returns to the card

### Requirement: REVIEW-3 — Dialog focus trap

While the dialog is open, keyboard focus MUST NOT leave it: Tab/Shift+Tab MUST cycle within the dialog, and background interactions MUST be blocked.

#### Scenario: Tab cycle

- GIVEN the dialog is open
- WHEN the user presses Tab past the last focusable element
- THEN focus cycles back inside the dialog, never into the background

### Requirement: REVIEW-4 — Return to draw flow

Exiting review MUST return to the draw flow resuming at the last reveal phase, with `drawn` and phase state unchanged by the round-trip. "Sacar otra carta" (when `drawn.length < 3`), "Tirada completa 3/3" (when = 3), and "Ver tirada" remain as before.

#### Scenario: Resume at last reveal

- GIVEN review is open with `drawn.length = 2`
- WHEN the user exits review via its back control
- THEN the app resumes at the reveal of the second drawn card, `drawn` unchanged

#### Scenario: Complete tirada return

- GIVEN review is open with `drawn.length = 3`
- WHEN the user exits review
- THEN the app resumes at the last reveal with "Tirada completa 3/3" and "Ver tirada" available, and no draw control

### Requirement: REVIEW-6 — Responsive review layout (mobile + desktop)

The review spread and its detail dialog MUST render correctly on both mobile and desktop. On mobile, spread cards stack/scroll vertically with ≥44px targets and safe-area breathing room; on desktop (≥ ~768px wide) the spread lays out in a wider row/arc with larger cards, and the detail dialog is proportionally sized (max width/height, centered, no overflow) while remaining an accessible modal. The dialog MUST be scrollable internally when its content exceeds the viewport height on small screens.

#### Scenario: Mobile review

- GIVEN a 390px-wide viewport in review spread with 3 cards
- WHEN the user scrolls the spread
- THEN all three cards are reachable and tappable; opening detail fills a scrollable dialog

#### Scenario: Desktop review

- GIVEN a 1440px-wide viewport in review spread
- WHEN the user opens a card detail
- THEN the dialog opens centered with capped width/height and no clipped content

### Requirement: REVIEW-5 — "Nueva tirada" instant reset

"Nueva tirada" MUST instantly reset state to `{ mode: "draw", phase: "home", drawn: [], selectedId: null }` with NO confirmation, from review or reveal phases, and MUST close any open dialog as part of the reset. Reload MUST always return to home — the app MUST NOT persist state anywhere.

#### Scenario: Reset from review

- GIVEN review is open with 3 drawn cards
- WHEN the user activates "Nueva tirada"
- THEN review closes, the spread clears, and home renders with `drawn.length = 0`; no confirmation appears

#### Scenario: Reset with dialog open

- GIVEN the review detail dialog is open
- WHEN "Nueva tirada" is activated
- THEN the dialog closes and home renders

#### Scenario: Reload

- GIVEN a tirada in progress
- WHEN the page is reloaded
- THEN home renders with an empty state