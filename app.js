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
 * Slice 3: T8–T13 — "Ver tirada" (spread con etiquetas de posición), diálogo
 * de detalle compartido (D10, #dialog-root hermano de #app + inert + trampa
 * de foco), "Volver" que reanuda en el último reveal (REVIEW-4), "Nueva
 * tirada" con reset instantáneo (REVIEW-5), Escape según contexto (T13 no-op
 * en draw), anuncios aria-live del diálogo y pulido responsive.
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
   * T11: salida de review hacia el draw — reanuda en el reveal de la ÚLTIMA
   * carta sacada (REVIEW-4). El estado de la tirada no cambia en el viaje de
   * ida y vuelta: solo mode/phase/selectedId; drawn queda intacto.
   * @param {{mode: string, phase: string, drawn: Array<{cardId: string}>}} state
   * @returns {object} mismo estado en draw/reveal, selectedId = última carta
   */
  function resumeFromReview(state) {
    const drawn = state.drawn || [];
    if (drawn.length === 0) return state; // defensivo (REVIEW-1 nunca llega vacío)
    return {
      ...state,
      mode: "draw",
      phase: "reveal",
      selectedId: drawn[drawn.length - 1].cardId
    };
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
   *  - T8  REVIEW_OPEN → review/spread si drawn >= 1 (REVIEW-1)
   *  - T9  REVIEW_TAP  → review/spread + selectedId (abre el diálogo)
   *  - T10 REVIEW_CLOSE → review/spread + selectedId null (cierra el diálogo)
   *  - T11 REVIEW_BACK  → draw/reveal reanudando en la última carta (REVIEW-4)
   *  - ESCAPE → T10 si hay diálogo, T11 si no, no-op en draw (T13, DRAW-7)
   *  - T12 RESET        → draw/home fresco (REVIEW-5, sin confirmación)
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

      case "REVIEW_OPEN": {
        // T8: "Ver tirada" — desde draw (home o reveal, ambos renderizan el
        // botón) con drawn.length >= 1 (REVIEW-1): review nunca se abre con
        // spread vacío.
        if (state.mode !== "draw") return state;
        if (state.phase !== "home" && state.phase !== "reveal") return state;
        if ((state.drawn || []).length < 1) return state;
        return { ...state, mode: "review", phase: "spread", selectedId: null };
      }

      case "REVIEW_TAP": {
        // T9: tocar una carta del spread abre su detalle (REVIEW-2). Solo sin
        // diálogo abierto y con cartas de la tirada actual.
        if (state.mode !== "review" || state.phase !== "spread") return state;
        if (state.selectedId !== null) return state; // ya abierto — no-op
        const cardId = action.cardId;
        if (typeof cardId !== "string") return state;
        if (!state.drawn.some((d) => d.cardId === cardId)) return state;
        return { ...state, selectedId: cardId };
      }

      case "REVIEW_CLOSE": {
        // T10: "Cerrar" — solo con el diálogo abierto; el spread queda igual
        // (REVIEW-2/3).
        if (state.mode !== "review" || state.phase !== "spread") return state;
        if (state.selectedId === null) return state;
        return { ...state, selectedId: null };
      }

      case "REVIEW_BACK": {
        // T11: "Volver" sin diálogo — reanuda en el último reveal (REVIEW-4).
        if (state.mode !== "review" || state.phase !== "spread") return state;
        if (state.selectedId !== null) return state; // con diálogo: cerrar antes
        return resumeFromReview(state);
      }

      case "ESCAPE": {
        // T10/T11/T13: Escape cierra el diálogo si está abierto; sin diálogo
        // vuelve al último reveal; en fases de draw es no-op (DRAW-7).
        if (state.mode !== "review" || state.phase !== "spread") return state;
        if (state.selectedId !== null) return { ...state, selectedId: null };
        return resumeFromReview(state);
      }

      case "RESET":
        // T12: "Nueva tirada" — reset instantáneo sin confirmación (REVIEW-5);
        // cierra el diálogo (selectedId null) como parte del reset.
        return createInitialState();

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
   * nativa → click → selectCard (T3, Slice 2).
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
   * Render (D11) — esqueleto por (mode, phase) + movimiento imperativo T3
   * ====================================================================== */

  /**
   * Reemplaza el contenido de #app por un esqueleto nuevo. Fallback seguro
   * para navegadores sin Element.replaceChildren (R4-W3): textContent="" +
   * append hacen lo mismo sin hard-crash.
   */
  function setRoot(root, section) {
    if (typeof root.replaceChildren === "function") {
      root.replaceChildren(section);
    } else {
      root.textContent = "";
      root.appendChild(section);
    }
  }

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

    // T8 (Slice 3): "Ver tirada" habilitado solo con drawn.length >= 1
    // (REVIEW-1). En home normal (drawn = 0) permanece deshabilitado.
    const reviewBtn = el("button", "btn btn--secondary", "Ver tirada");
    reviewBtn.type = "button";
    reviewBtn.disabled = state.drawn.length === 0;
    reviewBtn.addEventListener("click", () => dispatch({ type: "REVIEW_OPEN" }));
    actions.appendChild(reviewBtn);

    section.appendChild(actions);
    setRoot(root, section);
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

    // Defensivo (DECK-2): el carousel nunca se abre con pool vacío vía T2/T7,
    // pero render vacío no debe romper.
    if (pool.length === 0) {
      section.appendChild(el("p", "hint", "No quedan cartas por sacar."));
      setRoot(root, section);
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
      card.dataset.cardId = cardData.id; // para el movimiento imperativo T3
      card.addEventListener("click", () => selectCard(cardData.id));

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
    setRoot(root, section);

    bindCarouselKeys(carousel);
    bindTilt(carousel);
  }

  /**
   * D10: renderer COMPARTIDO del detalle — el mismo contenido (kicker de
   * posición, título, keywords, meaning, description) sirve al panel del
   * reveal y al diálogo de revisión (REVIEW-2). Cada llamador decide dónde
   * inserta cada nodo y si el detalle se revela por scroll (.is-visible) o
   * queda visible al instante.
   * @param {{title: string, keywords: string, meaning: string, description: string}} card
   * @param {string} position etiqueta de posición (DECK-3)
   * @returns {{kicker: HTMLElement, title: HTMLElement, detail: HTMLElement}}
   */
  function renderDetail(card, position) {
    const kicker = el("p", "reveal-kicker", `Posición · ${position || ""}`);
    const title = el("h2", "reveal-title", card.title);
    const detail = el("div", "reveal-detail");
    detail.appendChild(el("p", "reveal-keywords", card.keywords));
    detail.appendChild(el("p", "reveal-meaning", card.meaning));
    detail.appendChild(el("p", "reveal-description", card.description));
    return { kicker, title, detail };
  }

  /**
   * Fase reveal (T4, DRAW-5/8): carta agrandada estática + panel de detalle
   * revelado por scroll (IO) + acciones ("Sacar otra carta" / hint / "Ver
   * tirada" / "Nueva tirada"). El foco aterriza en el h2, destino programático.
   */
  function renderReveal(root) {
    const state = Cartas.state;
    const guard = getDrawGuard(state, poolFor(state));
    const cardData = deck().cards.find((c) => c.id === state.selectedId);
    if (!cardData) {
      // Defensivo: selección desconocida no debe romper el render.
      renderHome(root);
      return;
    }

    const posIndex = state.drawn.findIndex((d) => d.cardId === state.selectedId);
    const position = deck().positions[posIndex] || ""; // DECK-3: la etiqueta la da el índice
    const { kicker, title, detail } = renderDetail(cardData, position); // D10

    const section = el("section", "reveal");

    section.appendChild(kicker);

    title.tabIndex = -1; // destino de foco programático tras el flip (DRAW-2)
    section.appendChild(title);

    const cardWrap = el("div", "reveal-card-wrap");
    const revealCard = el("div", "reveal-card");
    revealCard.appendChild(
      el("span", "face-num", roman(deck().cards.indexOf(cardData) + 1))
    );
    cardWrap.appendChild(revealCard);
    section.appendChild(cardWrap);

    section.appendChild(detail);

    const actions = el("div", "reveal-actions");
    if (guard.canDraw) {
      const againBtn = el("button", "btn btn--primary", "Sacar otra carta");
      againBtn.type = "button";
      againBtn.addEventListener("click", () => dispatch({ type: "NEXT_DRAW" }));
      actions.appendChild(againBtn);
    } else {
      // Tope 3/3 (DRAW-4) o pool agotado (DECK-2): copia exacta del hint.
      actions.appendChild(el("p", "hint", guard.hint));
    }
    // T8 (Slice 3): "Ver tirada" habilitado con drawn >= 1 (siempre en reveal).
    const reviewBtn = el("button", "btn btn--secondary", "Ver tirada");
    reviewBtn.type = "button";
    reviewBtn.disabled = state.drawn.length === 0;
    reviewBtn.addEventListener("click", () => dispatch({ type: "REVIEW_OPEN" }));
    actions.appendChild(reviewBtn);
    // T12 (Slice 3): "Nueva tirada" — reset instantáneo también desde reveal.
    const resetBtn = el("button", "btn btn--ghost", "Nueva tirada");
    resetBtn.type = "button";
    resetBtn.addEventListener("click", () => dispatch({ type: "RESET" }));
    actions.appendChild(resetBtn);

    section.appendChild(actions);
    setRoot(root, section);

    // Anuncio aria-live (DRAW-7): título + posición; el hint cuando toca.
    announce(`${cardData.title} — ${position}`);
    if (!guard.canDraw) {
      window.setTimeout(() => announce(guard.hint), 500);
    }

    // DRAW-2: el h2 recibe el foco sin saltar el scroll del viewport.
    title.focus({ preventScroll: true });

    // DRAW-5: el detalle se revela al entrar al viewport (IO); con
    // reduced-motion queda visible al instante (DRAW-3).
    if (prefersReducedMotion()) {
      detail.classList.add("is-visible");
    } else {
      observeDetail(detail);
    }
  }

  /**
   * Fase spread (T8, REVIEW-1): todas las cartas sacadas, EN ORDEN, cada una
   * con su etiqueta de posición (DECK-3). El render es defensivo: si se
   * llamara con drawn vacío (solo posible por llamada directa, T8 lo impide),
   * muestra el estado seguro — mensaje breve, sin spread, sin diálogo, sin
   * crash (REVIEW-1).
   */
  function renderSpread(root) {
    const state = Cartas.state;
    const section = el("section", "spread");

    // REVIEW-1: guarda de spread vacío — nunca una vista rota.
    if ((state.drawn || []).length === 0) {
      section.appendChild(el("p", "hint", "Aún no has sacado cartas"));
      setRoot(root, section);
      return;
    }

    section.appendChild(el("p", "spread-kicker", "Tu tirada"));

    const list = el("ol", "spread-list");
    state.drawn.forEach((d, i) => {
      const cardData = deck().cards.find((c) => c.id === d.cardId);
      if (!cardData) return; // defensivo: nunca debe ocurrir
      const position = deck().positions[i] || ""; // DECK-3: etiqueta por índice
      const number = deck().cards.indexOf(cardData) + 1;

      const li = el("li", "spread-item");
      const btn = el("button", "spread-card");
      btn.type = "button";
      btn.dataset.cardId = cardData.id; // para restaurar foco al cerrar (T10)
      btn.setAttribute("aria-label", `${position} · ${cardData.title}`);
      btn.addEventListener("click", () =>
        dispatch({ type: "REVIEW_TAP", cardId: cardData.id })
      );

      const face = el("span", "spread-face");
      face.appendChild(el("span", "face-num", roman(number)));
      const caption = el("span", "spread-caption");
      caption.appendChild(el("span", "spread-pos", position));
      caption.appendChild(el("span", "spread-title", cardData.title));

      btn.append(face, caption);
      li.appendChild(btn);
      list.appendChild(li);
    });
    section.appendChild(list);

    // T11: "Volver" reanuda en el último reveal (REVIEW-4). "Nueva tirada"
    // (T12) se añade en el Slice 3 completo junto al diálogo.
    const actions = el("div", "spread-actions");
    const backBtn = el("button", "btn btn--secondary", "Volver");
    backBtn.type = "button";
    backBtn.addEventListener("click", () => dispatch({ type: "REVIEW_BACK" }));
    actions.appendChild(backBtn);
    section.appendChild(actions);

    setRoot(root, section);
  }

  /**
   * IntersectionObserver del detalle (DRAW-5): añade .is-visible una vez y
   * se desconecta. El scroll del carousel/reveal se lee de forma pasiva.
   */
  function observeDetail(panel) {
    if (typeof IntersectionObserver === "undefined") {
      panel.classList.add("is-visible");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            panel.classList.add("is-visible");
            io.disconnect();
          }
        }
      },
      { threshold: 0.2 }
    );
    io.observe(panel);
  }

  /** Región aria-live persistente (DRAW-7), fuera de #app. */
  function announce(text) {
    if (typeof document === "undefined" || !text) return;
    const live = document.getElementById("live");
    if (!live) return;
    live.textContent = "";
    // Reanuncia incluso si la copia es idéntica a la anterior.
    window.setTimeout(() => {
      live.textContent = text;
    }, 30);
  }

  /** Foco en la primera carta del abanico (DRAW-2) — carousel recién abierto. */
  function focusFirstCard() {
    const root = document.getElementById("app");
    if (!root) return;
    const first = root.querySelector(".card");
    if (first) first.focus();
  }

  /* ------------------------------------------------------------------------
   * Selección T3 — movimiento imperativo (D11: sin re-render en vuelo)
   * ---------------------------------------------------------------------- */

  /**
   * Selección de una carta: la transición pura T3 confirma el commit
   * (drawn + selectedId) ANTES de tocar el DOM (D5, DRAW-1). Tras el commit
   * se aplican .is-flipped (elegida) y .is-sunk (hermanas), sin render().
   * Con prefers-reduced-motion se salta directo al reveal (D6/DRAW-3).
   */
  function selectCard(cardId) {
    const prev = Cartas.state;
    const next = transition(prev, { type: "SELECT", cardId });
    if (next === prev) return; // T5: doble activación durante el reveal — no-op

    Cartas.state = next;

    if (prefersReducedMotion()) {
      // DRAW-3: el estado avanza al instante, sin animación.
      dispatch({ type: "FLIP_END" });
      return;
    }

    const root = document.getElementById("app");
    if (!root) return;
    const selected = root.querySelector(`.card[data-card-id="${cardId}"]`);
    if (!selected) return;

    selected.classList.add("is-flipped");
    bindFlipEnd(selected);

    for (const card of root.querySelectorAll(".card")) {
      if (card !== selected) {
        card.classList.add("is-sunk");
        bindSinkRemoval(card);
      }
    }
  }

  /**
   * T4: al terminar el transform del flip (transitionend) o por backstop
   * (~800ms) se despacha FLIP_END → el render pasa a reveal. El atajo de
   * reduced-motion hace este camino instantáneo desde selectCard.
   */
  function bindFlipEnd(card) {
    const inner = card.querySelector(".card-inner");
    if (!inner) return;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      inner.removeEventListener("transitionend", onEnd);
      clearTimeout(timer);
      dispatch({ type: "FLIP_END" });
    };
    const onEnd = (event) => {
      if (event.propertyName === "transform") finish();
    };
    inner.addEventListener("transitionend", onEnd);
    const timer = setTimeout(finish, 800); // backstop (D6)
  }

  /**
   * T6: cada carta hundida se retira del DOM al terminar su transitionend,
   * con un barrido backstop (~700ms) para las rezagadas (D7, DRAW-3). El
   * estado no cambia; solo el DOM.
   */
  function bindSinkRemoval(card) {
    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      card.removeEventListener("transitionend", onEnd);
      clearTimeout(timer);
      if (card.isConnected) card.remove();
    };
    const onEnd = (event) => {
      if (event.propertyName === "transform" || event.propertyName === "opacity") {
        remove();
      }
    };
    card.addEventListener("transitionend", onEnd);
    const timer = setTimeout(remove, 700); // barrido backstop (D7)
  }

  /**
   * Render declarativo: reemplaza el esqueleto de #app según (mode, phase).
   * El foco del carousel NO se decide aquí: se deriva de la transición real
   * en dispatch() comparando el estado anterior con el nuevo (R2-W1).
   */
  function render() {
    const state = Cartas.state;
    const root = document.getElementById("app");
    if (!root) return;

    if (state.mode === "draw" && state.phase === "carousel") {
      renderCarousel(root);
    } else if (state.mode === "draw" && state.phase === "reveal") {
      renderReveal(root);
    } else if (state.mode === "review" && state.phase === "spread") {
      renderSpread(root);
    } else {
      // home (y cualquier estado inesperado → home seguro)
      renderHome(root);
    }
  }

  /* ------------------------------------------------------------------------
   * Diálogo de revisión (REVIEW-2/3) — #dialog-root es HERMANO de #app
   * (hijo directo de <body>, position:fixed): con el diálogo abierto, #app
   * queda inert para que el fondo sea inerte pero el diálogo siga vivo.
   * ---------------------------------------------------------------------- */

  /** Vacía un contenedor (fallback seguro sin Element.replaceChildren). */
  function clearNode(node) {
    if (typeof node.replaceChildren === "function") {
      node.replaceChildren();
    } else {
      node.textContent = "";
    }
  }

  /** REVIEW-2: inerta / des-inerta #app (propiedad + atributo, R4-safe). */
  function setInert(on) {
    const app = document.getElementById("app");
    if (!app) return;
    if (on) {
      app.setAttribute("inert", "");
      app.inert = true;
    } else {
      app.removeAttribute("inert");
      app.inert = false;
    }
  }

  /**
   * T9: abre el diálogo con el detalle compartido (D10). Pone #app inert
   * (REVIEW-2) y mueve el foco DENTRO del diálogo (botón "Cerrar").
   */
  function openDialog(cardId) {
    const root = document.getElementById("dialog-root");
    const state = Cartas.state;
    const card = deck().cards.find((c) => c.id === cardId);
    if (!card || !root) return;

    const posIndex = state.drawn.findIndex((d) => d.cardId === cardId);
    const position = deck().positions[posIndex] || "";
    const { kicker, title, detail } = renderDetail(card, position); // D10

    title.id = "dialog-title";
    title.tabIndex = -1;
    detail.classList.add("is-visible"); // dentro del diálogo siempre visible

    const dialog = el("div", "dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "dialog-title");

    const face = el("span", "dialog-face");
    face.appendChild(el("span", "face-num", roman(deck().cards.indexOf(card) + 1)));

    const actions = el("div", "dialog-actions");
    const closeBtn = el("button", "btn btn--secondary", "Cerrar");
    closeBtn.type = "button";
    closeBtn.addEventListener("click", () => dispatch({ type: "REVIEW_CLOSE" }));
    actions.appendChild(closeBtn);

    dialog.append(kicker, title, face, detail, actions);
    clearNode(root);
    root.appendChild(dialog);

    setInert(true); // REVIEW-2: fondo inerte; el diálogo (hermano) sigue vivo
    closeBtn.focus(); // REVIEW-2: el foco entra al diálogo

    // CSS es dueño del movimiento: la clase is-open dispara el fundido/entrada.
    window.requestAnimationFrame(() => root.classList.add("is-open"));
  }

  /**
   * T10: cierra el diálogo, quita inert y devuelve el foco a la carta que lo
   * abrió (REVIEW-2/3). El spread se re-renderizó con selectedId null, así
   * que la carta activadora se busca por su data-card-id.
   */
  function closeDialogFocus(cardId) {
    const root = document.getElementById("dialog-root");
    if (!root) return;
    root.classList.remove("is-open");
    // Limpieza tras el fundido de salida (CSS dueño del movimiento; con
    // reduced-motion las transiciones son instantáneas y apenas se nota).
    window.setTimeout(() => {
      if (!root.classList.contains("is-open") && root.firstChild) {
        clearNode(root);
      }
    }, 240);
    setInert(false);
    if (cardId) {
      const card = document.querySelector(`.spread-card[data-card-id="${cardId}"]`);
      if (card) card.focus(); // REVIEW-2: foco de vuelta a la carta activadora
    }
  }

  /** Foco en la primera carta del spread al entrar en review (T8). */
  function focusFirstSpreadCard() {
    const root = document.getElementById("app");
    if (!root) return;
    const first = root.querySelector(".spread-card");
    if (first) first.focus();
  }

  /** Foco en la acción principal del home tras "Nueva tirada" (T12). */
  function focusHomePrimary() {
    const root = document.getElementById("app");
    if (!root) return;
    const actions = root.querySelector(".home-actions");
    if (!actions) return;
    const btn =
      actions.querySelector("button:not(:disabled)") ||
      actions.querySelector("button");
    if (btn) btn.focus();
  }

  /**
   * Escape (DRAW-7, REVIEW-2/3): con el diálogo abierto lo cierra (T10); en
   * review sin diálogo vuelve al último reveal (T11); en fases de draw no hace
   * nada (T13). Un único handler global, sin preventDefault fuera de review.
   */
  function bindGlobalKeys() {
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const s = Cartas.state;
      if (s.mode === "review" && s.phase === "spread") {
        event.preventDefault();
        dispatch({ type: "ESCAPE" });
      }
      // T13: en fases de draw, Escape es no-op (nada, ni preventDefault).
    });
  }

  /**
   * Despacha una acción: transición pura → render. Devuelve true si el
   * estado cambió (útil para flujos imperativos). R2-W1: el foco se deriva de
   * la transición real comparando prev/next; el diálogo (hermano de #app) se
   * sincroniza de forma imperativa (T9 abrir / T10 cerrar).
   */
  function dispatch(action) {
    const prev = Cartas.state;
    const next = transition(prev, action);
    if (next === prev) return false;

    const prevDialog =
      prev.mode === "review" && prev.phase === "spread" && prev.selectedId !== null;
    const nextDialog =
      next.mode === "review" && next.phase === "spread" && next.selectedId !== null;

    Cartas.state = next;
    render();

    // Diálogo de revisión: hermano de #app, vida imperativa (REVIEW-2).
    if (nextDialog && !prevDialog) {
      openDialog(next.selectedId);
    } else if (!nextDialog && prevDialog) {
      closeDialogFocus(prev.selectedId);
    }

    // Foco derivado del cambio real (R2-W1): solo cuando cambió el esqueleto.
    if (next.mode === "draw" && next.phase === "carousel" && prev.phase !== "carousel") {
      focusFirstCard();
    } else if (
      next.mode === "review" &&
      next.phase === "spread" &&
      prev.phase !== "spread"
    ) {
      focusFirstSpreadCard();
    } else if (next.mode === "draw" && next.phase === "home" && prev.phase !== "home") {
      focusHomePrimary();
    }
    return true;
  }

  function init() {
    // Recarga → home (sin persistencia; DRAW-1, REVIEW-5).
    Cartas.state = createInitialState();
    setInert(false); // defensivo: ningún estado previo deja #app inert
    render();
    bindGlobalKeys();
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