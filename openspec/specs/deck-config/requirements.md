# deck-config Specification

## Purpose

Defines the user-editable deck format for Cartas Tseyor: a plain JS data file (`deck.js`) with the card list and spread-position labels, loaded before `app.js` via plain `<script>` tags (no ES modules — `file://` must work). Editing the deck must never require touching application code.

## Requirements

### Requirement: DECK-1 — Documented deck format

`deck.js` MUST expose `window.Cartas.deck` containing `cards` (array) and `positions` (array of 3 label strings), and MUST be loadable over `file://` with zero external fetches. Each card entry MUST contain `id` (unique string), `title`, `keywords`, `meaning`, `description`, and MAY contain `image` (reserved field, falsy by default). Cards MUST be interpreted upright-only; the model MUST NOT define reversed meanings. The format MUST be documented in a comment header so a non-developer can edit titles/meanings.

#### Scenario: Edit without touching app code

- GIVEN a `deck.js` with 12 cards and 3 position labels
- WHEN the user changes only a card's `meaning`
- THEN the next reveal renders the new meaning; `index.html`, `styles.css`, `app.js` are untouched

#### Scenario: Reserved image field

- GIVEN a card entry without (or with falsy) `image`
- WHEN the card is revealed
- THEN the face renders its placeholder big number; no image request is made

### Requirement: DECK-2 — Starter deck and placeholder faces

The shipped deck MUST contain 10–18 cards (starter target: 12), each with unique `id` and hand-authored Spanish content. The card face MUST render a large centered number as the placeholder for future JPG art.

#### Scenario: Starter deck loads

- GIVEN the shipped `deck.js`
- WHEN a card is drawn
- THEN the face shows the placeholder number and the detail shows its Spanish title, keywords, meaning, and description

#### Scenario: Undersized deck

- GIVEN a deck with fewer cards than remaining draws in a tirada
- WHEN the pool is exhausted before 3 draws
- THEN further draws are blocked and the "Tirada completa" hint renders; no crash, no empty carousel

### Requirement: DECK-3 — Spread positions

The spread MUST use exactly `positions = ["Situación actual", "Desafío", "Consejo"]`, configurable in `deck.js`. A position's meaning MUST come from the drawn card's index, never from the card itself.

#### Scenario: Label derives from index

- GIVEN a tirada with two drawn cards
- WHEN the second card is rendered
- THEN its label is "Desafío" regardless of which card was drawn

#### Scenario: Position bound

- GIVEN 3 drawn cards
- WHEN rendering the spread
- THEN cards map to positions 0, 1, 2 in drawn order; no index exceeds 2 because `drawn.length ≤ 3`

### Requirement: DECK-4 — No-repeat pool logic

For every draw, the carousel pool MUST equal the deck minus the ids already in `drawn`. A drawn id MUST NOT reappear in a later carousel within the same tirada.

#### Scenario: Pool excludes drawn ids

- GIVEN `drawn` contains [sol, luna]
- WHEN the next carousel opens
- THEN it renders only the remaining cards; sol and luna are absent

#### Scenario: Single-remaining pool

- GIVEN 2 cards drawn from a 12-card deck
- WHEN the third carousel opens
- THEN it offers exactly 1 choice; selecting it completes the tirada at 3/3