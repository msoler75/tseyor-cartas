/* ============================================================================
 * Cartas Tseyor — app.js
 * ============================================================================
 * Núcleo de la aplicación: estado, transiciones y renderizado.
 * Cargar SIEMPRE después de deck.js (usa window.Cartas.deck).
 *
 * Principios (ver design.md):
 *  - JS es dueño del estado; CSS es dueño de TODO el movimiento.
 *  - transition(state, action) es pura y aislada del DOM: se puede probar
 *    en Node con un simple shim de `window` (verify/smoke.mjs).
 *  - render() reemplaza el esqueleto de #app según (mode, phase).
 *
 * Slice 1: T1 (RELOAD) y T2 ("Sacar carta" → carousel), render home/carousel,
 * jitter (--rz/--rx), tilt por scroll (rAF pasivo), teclado ←/→ + foco en la
 * primera carta, "Ver tirada" deshabilitado y scaffolding del tope de 3.
 * Slice 2: T3–T7 (selección con commit-before-animation, flip/sink, reveal,
 * "Sacar otra carta" con pool sin repetición), getDrawGuard (tope 3 y hint de
 * pool agotado), reveal con detalle por scroll y atajo de reduced-motion.
 * (Revisión T8–T13 llega en el Slice 3.)
 * ========================================================================== */

(function () {
  "use strict";

  const Cartas = (window.Cartas = window.Cartas || {});
  const deck = () => Cartas.deck || { positions: [], cards: [] };

  /* --- Parámetros de diseño (design.md): jitter ±4–10° / ±2–6°, tilt ∝ offset --- */
  const JITTER_RZ_MIN = 4;
  const JITTER_RZ_MAX = 10;
  const JITTER_RX_MIN = 2;
  const JITTER_RX_MAX = 6;
  const TILT_MAX_DEG = 14; // rotateY máximo por distancia al centro

  /* ========================================================================
   * Núcleo puro (sin DOM) — testeable en Node
   * ====================================================================== */

  /**
   * Estado inicial: home, sin cartas sacadas.
   * Invariantes: drawn.length ≤ 3; reload siempre vuelve aquí (sin
   * persistencia, DRAW-1/REVIEW-5).
   */
  function createInitialState() {
    return { mode: "draw", phase: "home", drawn: [], selectedId: null };
  }

  /**
   * Pool de la próxima tirada = mazo menos los ids ya sacados (DECK-4).
   * @param {{drawn: Array<{cardId: string}>}} state
   * @returns {Array<object>} cartas del mazo no incluidas en drawn
   */
  function poolFor(state) {
    const drawnIds = new Set((state.drawn || []).map((d) => d.cardId));
    return deck().cards.filter((c) => !drawnIds.has(c.id));
  }

  /**
   * Guard de tirada + hint (DECK-2, DRAW-4) — puro y testeable (R3-W1).
   * `canDraw` = quedan tiradas Y hay cartas en el pool. La copia exacta del
   * hint depende del disparador:
   *  - drawn.length === 3            → "Tirada completa 3/3"
   *  - pool vacío (mazo pequeño)     → "Tirada completa — no quedan más cartas"
   *    (sin 3/3 fijo, DECK-2); no se abre jamás un carousel con pool vacío.
   * @param {{drawn: Array<{cardId: string}>}} state
   * @param {Array<object>} pool pool ya calculado (deck − drawn)
   * @returns {{canDraw: boolean, hint: string}}
   */
  function getDrawGuard(state, pool) {
    const drawnCount = (state.drawn || []).length;
    const canDraw = drawnCount < 3 && pool.length > 0;
    let hint = "";
    if (drawnCount >= 3) {
      hint = "Tirada completa 3/3";
    } else if (pool.length === 0) {
      hint = "Tirada completa — no quedan más cartas";
    }
    return { canDraw, hint };
  }

  /**
   * Transición pura de estado (D3). Devuelve SIEMPRE un estado:
   *  - T1  RELOAD     → draw/home fresco (cualquier estado previo)
   *  - T2  DRAW_START → draw/carousel (solo desde draw/home y con canDraw;
   *                      guard de estado R3-W2: nunca un carousel vacío ni
   *                      una 4ª tirada)
   *  - T3  SELECT     → commit-before-animation (D5): drawn += id y
   *                      selectedId = id SIN cambiar de fase; el DOM anima
   *                      de forma imperativa
   *  - T4  FLIP_END   → draw/reveal (solo si hay selección en curso)
   *  - T5  SELECT repetido durante el reveal → no-op (mismo estado)
   *  - T6  SINK_END   → no-op de estado (solo limpieza de DOM)
   *  - T7  NEXT_DRAW  → draw/carousel desde draw/reveal solo con canDraw
   *  - cualquier otra acción o guard fallido → mismo estado (no-op)
   */
  function transition(state, action) {
    if (!action || typeof action.type !== "string") return state;

    switch (action.type) {
      case "RELOAD":
        return createInitialState();

      case "DRAW_START": {
        // T2: solo desde draw/home y con guard (R3-W2): un carousel nunca se
        // abre con pool vacío ni con drawn.length >= 3 (DECK-2, DRAW-4).
        if (state.mode !== "draw" || state.phase !== "home") return state;
        if (!getDrawGuard(state, poolFor(state)).canDraw) return state;
        return { ...state, mode: "draw", phase: "carousel" };
      }

      case "SELECT": {
        // T3/T5: solo en draw/carousel, sin selección en curso y con la
        // carta disponible. Commit-before-animation (D5): drawn y selectedId
        // se actualizan ya; la animación es no bloqueante y sin rollback.
        if (state.mode !== "draw" || state.phase !== "carousel") return state;
        if (state.selectedId !== null) return state; // T5: ya revelando — no-op
        if ((state.drawn || []).length >= 3) return state; // invariante DRAW-4
        const cardId = action.cardId;
        if (typeof cardId !== "string") return state;
        if (state.drawn.some((d) => d.cardId === cardId)) return state; // sin repetir
        return {
          ...state,
          drawn: [...state.drawn, { cardId }],
          selectedId: cardId
        };
      }

      case "FLIP_END": {
        // T4: el flip terminó (transitionend / backstop / atajo reduced-motion).
        if (state.mode !== "draw" || state.phase !== "carousel") return state;
        if (state.selectedId === null) return state;
        return { ...state, phase: "reveal" };
      }

      case "SINK_END":
        // T6: solo limpieza de DOM; el estado no cambia.
        return state;

      case "NEXT_DRAW": {
        // T7: "Sacar otra carta" — solo desde draw/reveal y con canDraw
        // (R3-W2): nunca abrir un carousel con pool vacío o una 4ª tirada.
        if (state.mode !== "draw" || state.phase !== "reveal") return state;
        if (!getDrawGuard(state, poolFor(state)).canDraw) return state;
        return { ...state, phase: "carousel", selectedId: null };
      }

      default:
        return state;
    }
  }

  /* ========================================================================
   * Utilidades de render (solo navegador — llamadas bajo init())
   * ====================================================================== */

  function prefersReducedMotion() {
    return !!(
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  /** Número grande de la carta: numeral romano (placeholder del arte futuro). */
  function roman(n) {
    const table = [
      [10, "X"],
      [9, "IX"],
      [5, "V"],
      [4, "IV"],
      [1, "I"]
    ];
    let out = "";
    for (const [value, glyph] of table) {
      while (n >= value) {
        out += glyph;
        n -= value;
      }
    }
    return out;
  }

  /** Crea un elemento; `text` opcional se asigna como textContent. */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function randRange(min, max) {
    return min + Math.random() * (max - min);
  }

  /**
   * Jitter por sesión de carousel (D8): valores frescos de --rz/--rx en cada
   * apertura. JS genera, CSS compone (rotateX(--rx) rotateZ(--rz) rotateY(--tilt)).
   */
  function applyJitter(card) {
    const rz = (Math.random() < 0.5 ? -1 : 1) * randRange(JITTER_RZ_MIN, JITTER_RZ_MAX);
    const rx = (Math.random() < 0.5 ? -1 : 1) * randRange(JITTER_RX_MIN, JITTER_RX_MAX);
    card.style.setProperty("--rz", `${rz.toFixed(2)}deg`);
    card.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
  }

  /**
   * Scroll → tilt (D9): listener pasivo, throttled por rAF; cada carta obtiene
   * --tilt (rotateY) proporcional a su distancia al centro. Se omite por
   * completo con prefers-reduced-motion: reduce.
   */
  function bindTilt(carousel) {
    if (prefersReducedMotion()) return;
    let ticking = false;

    const compute = () => {
      ticking = false;
      const rect = carousel.getBoundingClientRect();
      if (rect.width === 0) return;
      const center = rect.left + rect.width / 2;
      const half = rect.width / 2;
      for (const item of carousel.querySelectorAll(".carousel-item")) {
        const itemRect = item.getBoundingClientRect();
        const itemCenter = itemRect.left + itemRect.width / 2;
        const ratio = Math.max(-1, Math.min(1, (itemCenter - center) / half));
        const tilt = ratio * TILT_MAX_DEG;
        const card = item.querySelector(".card");
        if (card) card.style.setProperty("--tilt", `${tilt.toFixed(2)}deg`);
      }
    };

    carousel.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(compute);
      },
      { passive: true }
    );
  }

  /**
   * Teclado del carousel (DRAW-2): ←/→ mueven el foco y centran la carta;
   * Inicio/Fin saltan a los extremos. Enter/Space activan el botón de forma
   * nativa; la selección (T3) se cablea en el Slice 2.
   */
  function bindCarouselKeys(carousel) {
    carousel.addEventListener("keydown", (event) => {
      const cards = Array.from(carousel.querySelectorAll(".card"));
      if (cards.length === 0) return;
      const index = cards.indexOf(document.activeElement);
      let target = -1;

      if (event.key === "ArrowRight") target = index + 1;
      else if (event.key === "ArrowLeft") target = index - 1;
      else if (event.key === "Home") target = 0;
      else if (event.key === "End") target = cards.length - 1;
      else return; // Enter/Space: comportamiento nativo del <button>

      if (target < 0 || target >= cards.length) return;
      event.preventDefault();
      cards[target].focus();
      cards[target].scrollIntoView({ inline: "center", block: "nearest" });
    });
  }

  /* ========================================================================
   * Render (D11) — esqueleto por (mode, phase)
   * ====================================================================== */

  let lastPhase = null;

  /** Fase home: instrucciones + "Sacar carta" (+ "Ver tirada" placeholder). */
  function renderHome(root) {
    const state = Cartas.state;
    const guard = getDrawGuard(state, poolFor(state)); // R3-W1: del núcleo puro

    const section = el("section", "home");

    const intro = el(
      "p",
      "home-intro",
      "Tómate un momento de calma, formula tu pregunta en silencio y, cuando llegue el momento, saca hasta tres cartas, una a la vez. Cada carta ocupa una posición con su propio significado: situación actual, desafío y consejo."
    );
    section.appendChild(intro);

    const actions = el("div", "home-actions");

    if (guard.canDraw) {
      const drawBtn = el("button", "btn btn--primary", "Sacar carta");
      drawBtn.type = "button";
      drawBtn.addEventListener("click", () => dispatch({ type: "DRAW_START" }));
      actions.appendChild(drawBtn);
    } else {
      // Tope alcanzado (DRAW-4) o pool agotado (DECK-2): copia exacta del hint.
      const hint = el("p", "hint");
      hint.textContent = guard.hint;
      actions.appendChild(hint);
    }

    // Placeholder del Slice 1: habilitado recién cuando drawn.length ≥ 1
    // (T8, Slice 3). Disabled mientras tanto (DRAW-4 scaffolding).
    const reviewBtn = el("button", "btn btn--secondary", "Ver tirada");
    reviewBtn.type = "button";
    reviewBtn.disabled = drawnCount === 0;
    reviewBtn.addEventListener("click", () => {
      /* T8 se cablea en el Slice 3. */
    });
    actions.appendChild(reviewBtn);

    section.appendChild(actions);
    root.replaceChildren(section);
  }

  /**
   * Fase carousel: abanico de cartas boca abajo con jitter fresco por sesión,
   * tira con scroll-snap, teclado y tilt (D8/D9, DRAW-2).
   */
  function renderCarousel(root) {
    const state = Cartas.state;
    const pool = poolFor(state);

    const section = el("section", "carousel-section");
    section.appendChild(el("p", "carousel-caption", "Elige una carta"));

    // Defensivo (DECK-2): el carousel nunca se abre con pool vacío vía T2,
    // pero render vacío no debe romper.
    if (pool.length === 0) {
      section.appendChild(el("p", "hint", "No quedan cartas por sacar."));
      root.replaceChildren(section);
      return;
    }

    const carousel = el("div", "carousel");
    carousel.setAttribute("role", "group");
    carousel.setAttribute("aria-label", "Cartas disponibles");

    pool.forEach((cardData, i) => {
      const number = deck().cards.indexOf(cardData) + 1; // cara = índice del mazo + 1 (DECK-2)

      const item = el("div", "carousel-item");
      item.style.setProperty("--i", String(i)); // para el sink escalonado (Slice 2)

      const card = el("button", "card");
      card.type = "button";
      card.setAttribute("aria-label", `Carta ${number}`);

      const inner = el("span", "card-inner");
      const back = el("span", "face face--back");
      back.setAttribute("aria-hidden", "true");
      const front = el("span", "face face--front");
      front.setAttribute("aria-hidden", "true");
      front.appendChild(el("span", "face-num", roman(number)));

      inner.append(back, front);
      card.appendChild(inner);
      item.appendChild(card);
      carousel.appendChild(item);

      applyJitter(card);
    });

    section.appendChild(carousel);
    root.replaceChildren(section);

    bindCarouselKeys(carousel);
    bindTilt(carousel);
  }

  /**
   * Render declarativo: reemplaza el esqueleto de #app según (mode, phase).
   * El foco aterriza en la primera carta cuando el carousel se abre (DRAW-2).
   */
  function render() {
    const state = Cartas.state;
    const root = document.getElementById("app");
    if (!root) return;

    if (state.mode === "draw" && state.phase === "carousel") {
      renderCarousel(root);
      if (lastPhase !== "carousel") {
        const first = root.querySelector(".card");
        if (first) first.focus();
      }
    } else {
      // home (y cualquier estado inesperado → home seguro)
      renderHome(root);
    }

    lastPhase = state.phase;
  }

  function dispatch(action) {
    const next = transition(Cartas.state, action);
    if (next !== Cartas.state) {
      Cartas.state = next;
      render();
    }
  }

  function init() {
    // Recarga → home (sin persistencia; DRAW-1, REVIEW-5).
    Cartas.state = createInitialState();
    render();
  }

  /* ==== API pública (contrato de design.md) ==== */
  Cartas.createInitialState = createInitialState;
  Cartas.poolFor = poolFor;
  Cartas.getDrawGuard = getDrawGuard;
  Cartas.transition = transition;
  Cartas.render = render;
  Cartas.state = createInitialState();

  /* ==== Arranque solo en navegador (el smoke de Node no tiene document) ==== */
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})();