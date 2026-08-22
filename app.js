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
  const collection = () => Cartas.collection || {};

  /** Obtiene el modo de lectura actual según el índice en el estado */
  function readingMode() {
    const col = collection();
    const modes = col.reading_modes || [];
    const idx = (Cartas.state && Cartas.state.readingMode) || 0;
    return modes[idx] || modes[0] || { name: "", labels: null, num_cards: -1, max_cards: 3 };
  }

  /** Devuelve las etiquetas de posición para el modo actual */
  function positionLabels() {
    const mode = readingMode();
    return mode.labels || deck().positions;
  }

  /** Número máximo de cartas según el modo actual */
  function maxCards() {
    const mode = readingMode();
    if (mode.num_cards > 0) return mode.num_cards;
    return mode.max_cards || 3;
  }

  function formatTitle(cardData, col) {
    return Cartas.cardRenderer.formatTitle(cardData, col);
  }

  /* --- Parámetros de diseño (design.md): jitter ±4–10° / ±2–6°, tilt ∝ offset --- */
  const JITTER_RZ_MIN = 2;
  const JITTER_RZ_MAX = 6;
  const JITTER_RX_MIN = 1;
  const JITTER_RX_MAX = 3;
  const TILT_MAX_DEG = 14; // rotateY máximo por distancia al centro

  /* El movimiento entre vistas queda bloqueado durante unos cientos de ms
     para evitar dobles activaciones y árboles DOM solapados. */
  let navigationLocked = false;
  let motionRunId = 0;
  let motionStartedAt = 0;

  // Los logs quedan activos por petición de diagnóstico. Pueden silenciarse
  // desde DevTools con: Cartas.motionDebug = false
  Cartas.motionDebug = Cartas.motionDebug !== false;

  function motionNow() {
    return typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();
  }

  function compactRect(node) {
    if (!node || typeof node.getBoundingClientRect !== "function") return null;
    const rect = node.getBoundingClientRect();
    return {
      x: Number(rect.x.toFixed(1)),
      y: Number(rect.y.toFixed(1)),
      width: Number(rect.width.toFixed(1)),
      height: Number(rect.height.toFixed(1))
    };
  }

  function motionLayout() {
    if (typeof document === "undefined") return {};
    const html = document.documentElement;
    const carousel = document.querySelector(".carousel");
    return {
      viewport: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        clientWidth: html.clientWidth,
        clientHeight: html.clientHeight
      },
      document: {
        scrollWidth: html.scrollWidth,
        scrollHeight: html.scrollHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        overflowsX: html.scrollWidth > html.clientWidth,
        overflowsY: html.scrollHeight > html.clientHeight
      },
      carousel: carousel
        ? {
            rect: compactRect(carousel),
            clientWidth: carousel.clientWidth,
            clientHeight: carousel.clientHeight,
            scrollWidth: carousel.scrollWidth,
            scrollHeight: carousel.scrollHeight,
            overflowX: window.getComputedStyle(carousel).overflowX,
            overflowY: window.getComputedStyle(carousel).overflowY,
            hasHorizontalScrollbar:
              /auto|scroll/.test(window.getComputedStyle(carousel).overflowX) &&
              carousel.scrollWidth > carousel.clientWidth,
            hasVerticalScrollbar:
              /auto|scroll/.test(window.getComputedStyle(carousel).overflowY) &&
              carousel.scrollHeight > carousel.clientHeight
          }
        : null
    };
  }

  function motionLog(phase, details) {
    if (!Cartas.motionDebug || typeof console === "undefined") return;
    const elapsed = motionStartedAt
      ? Number((motionNow() - motionStartedAt).toFixed(1))
      : 0;
    console.info(
      `[Cartas motion #${motionRunId} +${elapsed}ms] ${phase}`,
      { ...(details || {}), layout: motionLayout() }
    );
  }

  /* ========================================================================
   * Núcleo puro (sin DOM) — testeable en Node
   * ====================================================================== */

  /**
   * Estado inicial: home, sin cartas sacadas.
   * Invariantes: drawn.length ≤ 3; reload siempre vuelve aquí (sin
   * persistencia, DRAW-1/REVIEW-5).
   */
  function createInitialState() {
    return { mode: "draw", phase: "home", drawn: [], selectedId: null, readingMode: 0, question: "", poolOrder: null };
  }

  /**
   * Pool de la próxima tirada = mazo menos los ids ya sacados (DECK-4).
   * @param {{drawn: Array<{cardId: string}>}} state
   * @returns {Array<object>} cartas del mazo no incluidas en drawn
   */
  function poolFor(state) {
    const drawnIds = new Set((state.drawn || []).map((d) => d.cardId));
    const orderedIds = Array.isArray(state && state.poolOrder)
      ? state.poolOrder
      : deck().cards.map((card) => card.id);
    const byId = new Map(deck().cards.map((card) => [String(card.id), card]));
    const pool = orderedIds
      .map((id) => byId.get(String(id)))
      .filter((card) => card && !drawnIds.has(card.id));
    if (!Array.isArray(state && state.poolOrder)) {
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
    }
    return pool;
  }

  function buildCarouselPose(state) {
    const order = Array.isArray(state && state.poolOrder)
      ? state.poolOrder
      : deck().cards.map((card) => card.id);
    const pose = {};
    order.forEach(function (cardId) {
      const rz = (Math.random() < 0.5 ? -1 : 1) * randRange(JITTER_RZ_MIN, JITTER_RZ_MAX);
      const rx = (Math.random() < 0.5 ? -1 : 1) * randRange(JITTER_RX_MIN, JITTER_RX_MAX);
      pose[String(cardId)] = {
        rz: `${rz.toFixed(2)}deg`,
        rx: `${rx.toFixed(2)}deg`
      };
    });
    return pose;
  }

  function shuffledPoolOrder(state) {
    const drawnIds = new Set((state.drawn || []).map((d) => d.cardId));
    const pool = deck().cards
      .map((card) => card.id)
      .filter((id) => !drawnIds.has(id));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
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
    const max = maxCards();
    const canDraw = drawnCount < max && pool.length > 0;
    let hint = "";
    if (drawnCount >= max) {
      hint = max === 3 ? "Tirada completa 3/3" : `Tirada completa ${drawnCount}/${max}`;
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
        const poolOrder = shuffledPoolOrder(state);
        return {
          ...state,
          mode: "draw",
          phase: "carousel",
          poolOrder,
          carouselPose: buildCarouselPose({ ...state, poolOrder })
        };
      }

      case "SELECT": {
        // T3/T5: solo en draw/carousel, sin selección en curso y con la
        // carta disponible. Commit-before-animation (D5): drawn y selectedId
        // se actualizan ya; la animación es no bloqueante y sin rollback.
        if (state.mode !== "draw" || state.phase !== "carousel") return state;
        if (state.selectedId !== null) return state; // T5: ya revelando — no-op
        if ((state.drawn || []).length >= maxCards()) return state; // DRAW-4
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
        // T7: "Sacar otra carta" — desde draw/reveal o review/spread, con canDraw.
        if (state.mode === "review" && state.phase === "spread") {
          if (!getDrawGuard(state, poolFor(state)).canDraw) return state;
          return { ...state, mode: "draw", phase: "carousel", selectedId: null };
        }
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

      case "FOCUS_CARD": {
        // T9: tocar una carta del spread → draw/reveal (vista de carta ampliada)
        if (state.mode !== "review" || state.phase !== "spread") return state;
        const cardId = action.cardId;
        if (typeof cardId !== "string") return state;
        if (!state.drawn.some((d) => d.cardId === cardId)) return state;
        return {
          ...state,
          mode: "draw",
          phase: "reveal",
          selectedId: cardId
        };
      }

      case "REVIEW_BACK": {
        // T11: "Volver" — reanuda en el último reveal (REVIEW-4).
        if (state.mode !== "review" || state.phase !== "spread") return state;
        return resumeFromReview(state);
      }

      case "ESCAPE": {
        // En review → vuelve al último reveal; en draw → no-op
        if (state.mode !== "review" || state.phase !== "spread") return state;
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
   * Jitter por sesión de carousel (D8): valores frescos de --rz/--rx una vez
   * por tirada y reutilizados en cada re-render. JS genera, CSS compone
   * (rotateX(--rx) rotateZ(--rz) rotateY(--tilt)).
   */
  function applyJitter(card, pose) {
    if (pose) {
      card.style.setProperty("--rz", pose.rz);
      card.style.setProperty("--rx", pose.rx);
      return;
    }
    const rz = (Math.random() < 0.5 ? -1 : 1) * randRange(JITTER_RZ_MIN, JITTER_RZ_MAX);
    const rx = (Math.random() < 0.5 ? -1 : 1) * randRange(JITTER_RX_MIN, JITTER_RX_MAX);
    card.style.setProperty("--rz", `${rz.toFixed(2)}deg`);
    card.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
  }

  function carouselCards(carousel) {
    return Array.from(carousel.querySelectorAll(".card"));
  }

  function centeredCarouselIndex(carousel) {
    const cards = carouselCards(carousel);
    if (cards.length === 0) return -1;
    const rect = carousel.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    cards.forEach(function (card, index) {
      const cardRect = card.getBoundingClientRect();
      const cardCenter = cardRect.left + cardRect.width / 2;
      const distance = Math.abs(cardCenter - center);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  function scrollCarouselToIndex(carousel, index, behavior) {
    const cards = carouselCards(carousel);
    if (index < 0 || index >= cards.length) return;
    cards[index].scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: behavior || "smooth"
    });
  }

  function bindCarouselArrowHold(button, carousel, direction) {
    let repeatTimer = null;
    let started = false;

    const step = () => {
      const index = centeredCarouselIndex(carousel);
      const nextIndex = Math.max(0, Math.min(
        carouselCards(carousel).length - 1,
        index + direction
      ));
      if (nextIndex === index) return;
      scrollCarouselToIndex(carousel, nextIndex, "smooth");
    };

    const stop = () => {
      started = false;
      if (repeatTimer !== null) {
        window.clearInterval(repeatTimer);
        repeatTimer = null;
      }
    };

    button.addEventListener("pointerdown", function (event) {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      started = true;
      step();
      repeatTimer = window.setInterval(function () {
        if (!started) return;
        step();
      }, 140);
    });

    button.addEventListener("pointerup", stop);
    button.addEventListener("pointercancel", stop);
    button.addEventListener("pointerleave", stop);
    button.addEventListener("blur", stop);
    button.addEventListener("contextmenu", function (event) {
      event.preventDefault();
    });
  }

  function syncCarouselScrollState(carousel) {
    if (!Cartas.state) return;
    Cartas.state.carouselScrollLeft = carousel.scrollLeft;
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
        syncCarouselScrollState(carousel);
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
      const cards = carouselCards(carousel);
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
      scrollCarouselToIndex(carousel, target, "smooth");
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

  /** Fase home: instrucciones + selector de modo + "Sacar carta". */
  function renderHome(root) {
    const state = Cartas.state;
    const guard = getDrawGuard(state, poolFor(state));

    const section = el("section", "home");

    const intro = el(
      "p",
      "home-intro",
      ["Pregunta y saca tus cartas.", "¿Qué quieres saber?", "¿Cuál es tu pregunta?"][Math.floor(Math.random() * 3)]
    );
    section.appendChild(intro);

    // Mostrar labels del modo seleccionado
    const mode = readingMode();
    if (mode.labels) {
      const labelsEl = el("p", "home-labels");
      labelsEl.textContent = mode.labels.join(" · ");
      section.appendChild(labelsEl);
    }

    // Input de pregunta (opcional, se guardará en el estado)
    const questionWrap = el("div", "home-question");
    const questionInput = el("input", "home-question-input");
    questionInput.type = "text";
    questionInput.placeholder = "Escribe tu pregunta (opcional)";
    questionInput.value = state.question || "";
    questionInput.addEventListener("input", function () {
      Cartas.state = { ...Cartas.state, question: this.value };
    });
    questionWrap.appendChild(questionInput);
    section.appendChild(questionWrap);

    const actions = el("div", "home-actions");

    if (guard.canDraw) {
      const drawBtn = el("button", "btn btn--primary", "Sacar carta");
      drawBtn.type = "button";
      drawBtn.addEventListener("click", () =>
        transitionDispatch({ type: "DRAW_START" }, "forward")
      );
      actions.appendChild(drawBtn);
    } else {
      // Tope alcanzado (DRAW-4) o pool agotado (DECK-2): copia exacta del hint.
      const hint = el("p", "hint");
      hint.textContent = guard.hint;
      actions.appendChild(hint);
    }

    // T8: "Ver tirada"
    const isFreeMode = mode.labels === null;
    const canReview = isFreeMode
      ? state.drawn.length >= 1
      : state.drawn.length >= maxCards();
    if (canReview) {
      const reviewBtn = el("button", "btn btn--secondary", "Ver tirada");
      reviewBtn.type = "button";
      reviewBtn.addEventListener("click", () => dispatch({ type: "REVIEW_OPEN" }));
      actions.appendChild(reviewBtn);
    }

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
    const pose = state.carouselPose || {};

    const section = el("section", "carousel-section");
    section.appendChild(el("p", "carousel-caption", "Elige una carta"));

    // Defensivo (DECK-2): el carousel nunca se abre con pool vacío vía T2/T7,
    // pero render vacío no debe romper.
    if (pool.length === 0) {
      section.appendChild(el("p", "hint", "No quedan cartas por sacar."));
      setRoot(root, section);
      return;
    }

    const shell = el("div", "carousel-shell");
    const prevBtn = el("button", "carousel-arrow carousel-arrow--prev");
    prevBtn.type = "button";
    prevBtn.setAttribute("aria-label", "Desplazar cartas hacia la izquierda");
    prevBtn.innerHTML = LUCIDE_CHEVRON_LEFT;

    const carousel = el("div", "carousel");
    carousel.setAttribute("role", "group");
    carousel.setAttribute("aria-label", "Cartas disponibles");
    carousel.tabIndex = 0;

    const nextBtn = el("button", "carousel-arrow carousel-arrow--next");
    nextBtn.type = "button";
    nextBtn.setAttribute("aria-label", "Desplazar cartas hacia la derecha");
    nextBtn.innerHTML = LUCIDE_CHEVRON_RIGHT;

    pool.forEach((cardData, i) => {
      const number = deck().cards.indexOf(cardData) + 1; // cara = índice del mazo + 1 (DECK-2)
      const col = collection();
      const imgFolder = col.images_folder || "";

      const item = el("div", "carousel-item");
      item.style.setProperty("--i", String(i)); // para el sink escalonado (Slice 2)

      const card = el("button", "card");
      card.type = "button";
      card.setAttribute("aria-label", `Carta ${number}: ${cardData.title}`);
      card.dataset.cardId = cardData.id; // para el movimiento imperativo T3
      card.addEventListener("click", () => {
        void selectCard(cardData.id).catch((error) => {
          console.error("[Cartas motion] Error en selectCard", error);
        });
      });

      const inner = el("span", "card-inner");

      // Cara trasera y frontal generadas desde el helper compartido.
      inner.append(
        Cartas.ui.buildCardFace(cardData, col, { kind: "back" }),
        Cartas.ui.buildCardFace(cardData, col, { kind: "front" })
      );
      card.appendChild(inner);
      item.appendChild(card);
      carousel.appendChild(item);

      applyJitter(card, pose[cardData.id]);
    });

    prevBtn.addEventListener("click", function () {
      const index = centeredCarouselIndex(carousel);
      scrollCarouselToIndex(carousel, Math.max(0, index - 1));
      carousel.focus({ preventScroll: true });
    });

    nextBtn.addEventListener("click", function () {
      const index = centeredCarouselIndex(carousel);
      scrollCarouselToIndex(carousel, Math.min(pool.length - 1, index + 1));
      carousel.focus({ preventScroll: true });
    });

    bindCarouselArrowHold(prevBtn, carousel, -1);
    bindCarouselArrowHold(nextBtn, carousel, 1);

    shell.append(prevBtn, carousel, nextBtn);
    section.appendChild(shell);
    setRoot(root, section);

    bindCarouselKeys(carousel);
    bindTilt(carousel);

    window.requestAnimationFrame(function () {
      if (typeof state.carouselScrollLeft === "number") {
        carousel.scrollLeft = state.carouselScrollLeft;
      } else {
        const middleIndex = Math.floor(pool.length / 2);
        scrollCarouselToIndex(carousel, middleIndex, "auto");
      }
      syncCarouselScrollState(carousel);
    });
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
    const col = collection();
    const mode = readingMode();
    const hasLabels = mode.labels !== null;
    const kicker = hasLabels ? el("p", "reveal-kicker", `Posición · ${position || ""}`) : null;
    const title = el("h2", "reveal-title", formatTitle(card, col));
    const detail = el("div", "reveal-detail");

    // Extra meaning del modo de lectura (no colapsable, prominente)
    const extraMeaning = getExtraMeaning(card, position);
    if (extraMeaning) {
      const extraEl = el("div", "reveal-extra-meaning");
      extraEl.innerHTML = renderMarkdown(extraMeaning);
      detail.appendChild(extraEl);
    }

    // Texto de la carta (colapsable)
    if (card.meaning) {
      const wrap = el("div", "collapse-wrap");
      const inner = el("div", "reveal-card-text");
      inner.innerHTML = renderMarkdown(card.meaning);
      wrap.appendChild(inner);
      const key = "collapse-card-" + card.id;
      const toggle = createCollapseToggle(wrap, key, "descripción de " + formatTitle(card, col));
      detail.appendChild(toggle);
      detail.appendChild(wrap);
    }

    // Texto de la categoría (colapsable)
    const catKey = (card.category || "").toLowerCase();
    const categories = col.categories || [];
    const catObj = categories.find(function (c) {
      return (c.label || "").toLowerCase() === catKey;
    });
    if (catObj && catObj.meaning) {
      const wrap = el("div", "collapse-wrap");
      const inner = el("div", "reveal-category-text");
      inner.innerHTML = renderMarkdown(catObj.meaning);
      wrap.appendChild(inner);
      const key = "collapse-cat-" + catKey;
      const toggle = createCollapseToggle(wrap, key, "descripción de " + (catObj.label || catKey));
      detail.appendChild(toggle);
      detail.appendChild(wrap);
    }

    return { kicker, title, detail };
  }

  /**
   * Obtiene el extra meaning para una carta en una posición según el modo de lectura.
   * Estructura: reading_modes_extra[modo.nombre][cardId][posicionLabel]
   */
  function getExtraMeaning(card, position) {
    const col = collection();
    const mode = readingMode();
    const extra = col.reading_modes_extra || {};
    const modeExtra = extra[mode.name];
    if (!modeExtra) return null;
    const cardExtra = modeExtra[String(card.id)];
    if (!cardExtra) return null;
    return cardExtra[position] || null;
  }

  /** Chevron SVG para los botones de colapsar */
  const CHEVRON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  const LUCIDE_CHEVRON_LEFT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>';
  const LUCIDE_CHEVRON_RIGHT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';

  /**
   * Crea un botón toggle para una sección colapsable.
   * Siempre arranca colapsado para que cada carta nueva se muestre limpia.
   */
  function createCollapseToggle(wrap, _storageKey, label) {
    const btn = el("button", "collapse-toggle");
    btn.type = "button";

    wrap.classList.add("is-collapsed");
    btn.classList.add("is-collapsed");

    function updateBtn() {
      const collapsed = wrap.classList.contains("is-collapsed");
      btn.innerHTML = CHEVRON_SVG + "<span>" + (collapsed ? "Ver " + label : "Ocultar " + label) + "</span>";
    }
    updateBtn();

    btn.addEventListener("click", function () {
      const isCollapsed = wrap.classList.toggle("is-collapsed");
      wrap.classList.toggle("is-expanded", !isCollapsed);
      btn.classList.toggle("is-collapsed", isCollapsed);
      updateBtn();
    });

    return btn;
  }

  /** Convierte markdown básico a HTML: ##, ###, **, párrafos */
  function renderMarkdown(text) {
    return text
      .split("\n\n")
      .map(function (block) {
        block = block.trim();
        if (!block) return "";
        if (block.startsWith("### "))
          return "<h3>" + block.slice(4) + "</h3>";
        if (block.startsWith("## "))
          return "<h2>" + block.slice(3) + "</h2>";
        if (block.startsWith("# "))
          return "<h1>" + block.slice(2) + "</h1>";
        block = block.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
        return "<p>" + block.replace(/\n/g, "<br>") + "</p>";
      })
      .join("");
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
    const position = positionLabels()[posIndex] || ""; // labels del modo de lectura
    const { kicker, title, detail } = renderDetail(cardData, position); // D10

    const section = el("section", "reveal");

    if (kicker) section.appendChild(kicker);

    title.tabIndex = -1; // destino de foco programático tras el flip (DRAW-2)
    section.appendChild(title);

    const cardWrap = el("div", "reveal-card-wrap");
    const revealCard = el("div", "reveal-card");
    Cartas.ui.decorateCardFace(revealCard, cardData, collection(), { kind: "reveal" });

    cardWrap.appendChild(revealCard);
    section.appendChild(cardWrap);

    section.appendChild(detail);

    const actions = el("div", "reveal-actions");
    if (guard.canDraw) {
      const againBtn = el("button", "btn btn--primary", "Sacar otra carta");
      againBtn.type = "button";
      againBtn.addEventListener("click", () =>
        transitionDispatch({ type: "NEXT_DRAW" }, "forward")
      );
      actions.appendChild(againBtn);
    } else {
      // Tope 3/3 (DRAW-4) o pool agotado (DECK-2): copia exacta del hint.
      actions.appendChild(el("p", "hint", guard.hint));
    }
    // T8: "Ver tirada"
    const mode = readingMode();
    const isFreeMode = mode.labels === null;
    const canReview = isFreeMode
      ? state.drawn.length >= 1
      : state.drawn.length >= maxCards();
    if (canReview) {
      const reviewBtn = el("button", "btn btn--secondary", "Ver tirada");
      reviewBtn.type = "button";
      reviewBtn.addEventListener("click", () =>
        transitionDispatch({ type: "REVIEW_OPEN" }, "forward")
      );
      actions.appendChild(reviewBtn);
    }
    // T12 (Slice 3): "Nueva tirada" — reset instantáneo también desde reveal.
    const resetBtn = el("button", "btn btn--ghost", "Nueva tirada");
    resetBtn.type = "button";
    resetBtn.addEventListener("click", () =>
      transitionDispatch({ type: "RESET" }, "back")
    );
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

    // DRAW-5: el detalle se revela al entrar al viewport (IO);
    // se retrasa para que no aparezca durante el vuelo de la carta.
    if (prefersReducedMotion()) {
      detail.classList.add("is-visible");
    } else {
      window.setTimeout(() => observeDetail(detail), 800);
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
    const col = collection();
    const hasLabels = readingMode().labels !== null;

    state.drawn.forEach((d, i) => {
      const cardData = deck().cards.find((c) => c.id === d.cardId);
      if (!cardData) return; // defensivo: nunca debe ocurrir
      const position = positionLabels()[i] || ""; // etiqueta por índice del modo

      const li = el("li", "spread-item");
      li.style.setProperty("--i", String(i)); // entrada escalonada (CSS)
      const btn = el("button", "spread-card");
      btn.type = "button";
      btn.dataset.cardId = cardData.id; // para restaurar foco al cerrar (T10)
      btn.setAttribute("aria-label", `${position} · ${cardData.title}`);
      btn.addEventListener("click", () =>
        dispatch({ type: "FOCUS_CARD", cardId: cardData.id })
      );

      const face = el("span", "spread-face");
      Cartas.ui.decorateCardFace(face, cardData, col, { kind: "spread" });

      const caption = el("span", "spread-caption");
      if (hasLabels) {
        caption.appendChild(el("span", "spread-pos", position));
      }
      if (col.show_titles_in_review !== false) {
        caption.appendChild(el("span", "spread-title", cardData.title));
      }

      // Extra meaning del modo de lectura (más pequeño en spread)
      const extraMeaning = getExtraMeaning(cardData, position);
      if (extraMeaning) {
        const extraEl = el("p", "spread-extra-meaning", extraMeaning);
        caption.appendChild(extraEl);
      }

      btn.append(face, caption);
      li.appendChild(btn);
      list.appendChild(li);
    });
    section.appendChild(list);

    // T12: "Nueva tirada" resetea al instante desde la vista de spread.
    const actions = el("div", "spread-actions");
    const guard = getDrawGuard(state, poolFor(state));
    if (guard.canDraw) {
      const drawBtn = el("button", "btn btn--primary", "Sacar otra carta");
      drawBtn.type = "button";
      drawBtn.addEventListener("click", () =>
        transitionDispatch({ type: "NEXT_DRAW" }, "forward")
      );
      actions.appendChild(drawBtn);
    }
    const resetBtn = el("button", "btn btn--ghost", "Nueva tirada");
    resetBtn.type = "button";
    resetBtn.addEventListener("click", () =>
      transitionDispatch({ type: "RESET" }, "back")
    );
    actions.appendChild(resetBtn);
    section.appendChild(actions);

    // Botón compartir: siempre en libre, solo cuando completa en modos fijos
    const spreadMode = readingMode();
    const spreadIsFree = spreadMode.labels === null;
    const canShare = spreadIsFree || state.drawn.length >= maxCards();
    if (canShare) {
      const captureWrap = el("div", "spread-capture");
      const captureBtn = el("button", "btn btn--secondary", "Compartir tirada");
      captureBtn.type = "button";
      captureBtn.addEventListener("click", () => openCapturePanel());
      captureWrap.appendChild(captureBtn);
      section.appendChild(captureWrap);
    }

    setRoot(root, section);
  }

  /* -----------------------------------------------------------------------
   * Captura de tirada — render manual + compartir
   * --------------------------------------------------------------------- */

  function roundRectPath(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawTextBlock(ctx, text, x, y, maxWidth, lineHeight) {
    const words = String(text || "").split(/\s+/);
    const lines = [];
    let line = "";
    words.forEach(function (word) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    lines.forEach(function (ln, i) {
      ctx.fillText(ln, x, y + i * lineHeight);
    });
    return lines.length;
  }

  function wrapTextLines(ctx, text, maxWidth) {
    const words = String(text || "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const lines = [];
    let line = words[0];
    for (let i = 1; i < words.length; i += 1) {
      const candidate = line + " " + words[i];
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = words[i];
      }
    }
    lines.push(line);
    return lines;
  }

  function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
    const lines = wrapTextLines(ctx, text, maxWidth);
    lines.forEach(function (line, index) {
      ctx.fillText(line, x, y + index * lineHeight);
    });
    return lines;
  }

  function appBodyFontFamily() {
    if (typeof document === "undefined" || !document.body || !window.getComputedStyle) {
      return "sans-serif";
    }
    const family = window.getComputedStyle(document.body).fontFamily;
    return family || "sans-serif";
  }

  function measureCalloutHeight(ctx, text, maxWidth, font, lineHeight) {
    const prevFont = ctx.font;
    ctx.font = font;
    const lines = wrapTextLines(ctx, text, maxWidth);
    ctx.font = prevFont;
    return Math.max(1, lines.length) * lineHeight;
  }

  function drawMeaningText(ctx, text, x, y, width, theme) {
    const prev = {
      font: ctx.font,
      fillStyle: ctx.fillStyle,
      textAlign: ctx.textAlign,
      textBaseline: ctx.textBaseline
    };
    const lines = wrapTextLines(ctx, text, width);
    const blockHeight = Math.max(1, lines.length) * theme.lineHeight;
    const startY = y + blockHeight / 2 - ((lines.length - 1) * theme.lineHeight) / 2;

    ctx.save();
    ctx.fillStyle = theme.textColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = theme.font;
    lines.forEach(function (line, index) {
      ctx.fillText(line, x, startY + index * theme.lineHeight);
    });
    ctx.restore();

    ctx.font = prev.font;
    ctx.fillStyle = prev.fillStyle;
    ctx.textAlign = prev.textAlign;
    ctx.textBaseline = prev.textBaseline;
    return blockHeight;
  }

  async function buildShareCanvas() {
    const state = Cartas.state;
    const col = collection();
    const mode = readingMode();
    const drawn = state.drawn || [];
    const question = (state.question || "").trim();
    const now = new Date();
    const dateStr = now.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
    const margin = 56;
    const showLabels = mode.labels !== null;
    const isDesktopLayout = typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(min-width: 1024px)").matches;
    const cardGap = isDesktopLayout ? 40 : 24;
    const cardWidth = isDesktopLayout ? 360 : 280;
    const cardHeight = Math.round(cardWidth * (col.height || 1110) / (col.width || 764));
    const headerHeight = question ? 210 : 160;
    const footerHeight = 90;
    const canvas = document.createElement("canvas");
    const cardCount = drawn.length;
    const bodyFontFamily = appBodyFontFamily();
    const labelFont = `600 18px ${bodyFontFamily}`;
    const extraFont = `italic 18px ${bodyFontFamily}`;
    const meaningWidth = isDesktopLayout ? 300 : 240;
    const labelLineHeight = 24;
    const extraLineHeight = 24;
    const labelGap = 14;
    const extraGap = 10;
    const meaningTheme = {
      font: extraFont,
      lineHeight: extraLineHeight,
      textColor: "#6d6353"
    };

    const cardList = [];
    for (let idx = 0; idx < drawn.length; idx += 1) {
      const d = drawn[idx];
      const cardData = deck().cards.find(function (c) { return c.id === d.cardId; });
      if (!cardData) continue;
      const position = positionLabels()[idx] || "";
      const extraMeaning = showLabels ? getExtraMeaning(cardData, position) : null;
      cardList.push({ cardData, position, extraMeaning });
    }

    const rowWidth = margin * 2 + (cardCount * cardWidth) + Math.max(0, cardCount - 1) * cardGap;
    canvas.width = Math.max(860, rowWidth);
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (document.fonts && document.fonts.ready) await document.fonts.ready;

    ctx.font = labelFont;
    const cardMeta = cardList.map(function (item) {
      let extraHeight = 0;
      if (item.extraMeaning) {
        extraHeight = measureCalloutHeight(
          ctx,
          item.extraMeaning,
          meaningWidth,
          extraFont,
          meaningTheme.lineHeight
        );
      }
      const labelHeight = showLabels && item.position ? labelLineHeight : 0;
      const topCaption = labelHeight ? labelLineHeight + labelGap : 0;
      const bottomCaption = extraHeight ? extraGap + extraHeight : 0;
      return {
        ...item,
        labelHeight,
        extraHeight,
        topCaption,
        bottomCaption,
        blockHeight: topCaption + cardHeight + bottomCaption
      };
    });

    const baseY = margin + headerHeight - 20;
    const tallestBlock = cardMeta.reduce(function (max, item) {
      return Math.max(max, item.blockHeight);
    }, 0);
    const contentHeight = baseY + tallestBlock + footerHeight + margin;
    cardMeta.forEach(function (item) {
      item.y = baseY;
    });

    canvas.height = contentHeight;
    ctx.fillStyle = "#f2ead9";
    ctx.fillRect(0, 0, canvas.width, contentHeight);

    ctx.textAlign = "center";
    ctx.fillStyle = "#6d6353";
    ctx.font = `700 30px ${bodyFontFamily}`;
    ctx.fillText(col.deck || "Cartas Tseyor", canvas.width / 2, margin + 18);
    ctx.font = `400 18px ${bodyFontFamily}`;
    ctx.fillText(dateStr, canvas.width / 2, margin + 54);
    if (question) {
      ctx.fillStyle = "#26221c";
      ctx.font = `italic 24px ${bodyFontFamily}`;
      drawTextBlock(ctx, "« " + question + " »", canvas.width / 2, margin + 96, canvas.width - 140, 30);
    }

    for (let idx = 0; idx < cardMeta.length; idx++) {
      const item = cardMeta[idx];
      const x = Math.round((canvas.width - rowWidth) / 2) + margin + idx * (cardWidth + cardGap);
      const y = item.y;
      const renderedCard = await Cartas.cardRenderer.renderCard(item.cardData, col, { face: "front" });

      if (showLabels && item.position) {
        ctx.fillStyle = "#6d6353";
        ctx.font = labelFont;
        ctx.fillText(item.position.toUpperCase(), x + cardWidth / 2, y - 14);
      }

      ctx.save();
      ctx.shadowColor = "rgba(38, 34, 28, 0.25)";
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 10;
      roundRectPath(ctx, x, y, cardWidth, cardHeight, 18);
      ctx.fillStyle = "#e9dfc8";
      ctx.fill();
      ctx.restore();

      ctx.save();
      roundRectPath(ctx, x, y, cardWidth, cardHeight, 18);
      ctx.clip();
      ctx.drawImage(renderedCard, x, y, cardWidth, cardHeight);
      ctx.restore();

      if (item.extraMeaning) {
        const extraY = y + cardHeight + extraGap;
        drawMeaningText(
          ctx,
          item.extraMeaning,
          x + cardWidth / 2,
          extraY,
          meaningWidth,
          meaningTheme
        );
      }
    }

    ctx.fillStyle = "#6d6353";
    ctx.font = `400 18px ${bodyFontFamily}`;
    ctx.fillText(mode.name, canvas.width / 2, contentHeight - margin);
    return canvas;
  }

  /** Abre el panel de captura: construye zona limpia, captura y muestra opciones */
  async function openCapturePanel() {
    const state = Cartas.state;
    const col = collection();
    const mode = readingMode();

    // Pedir pregunta si está vacía
    let question = state.question || "";
    if (!question) {
      question = prompt("Escribe tu pregunta para la tirada:") || "";
      if (!question.trim()) return;
      Cartas.state = { ...Cartas.state, question };
    }

    // Fecha
    const now = new Date();
    const dateStr = now.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

    // Panel overlay
    const panel = el("div", "capture-panel");
    panel.appendChild(el("p", "capture-loading", "Generando imagen..."));
    document.body.appendChild(panel);
    try {
      const final = await buildShareCanvas();
      panel.innerHTML = "";

      const preview = el("div", "capture-preview");
      final.classList.add("capture-img");
      preview.appendChild(final);
      panel.appendChild(preview);

      const actions = el("div", "capture-actions");
      const shareText = (col.deck || "Cartas Tseyor") + " \u2014 " + mode.name + (question ? " \u2014 \u00ab" + question + "\u00bb" : "");

      const downloadBtn = el("button", "btn btn--primary", "Descargar imagen");
      downloadBtn.type = "button";
      downloadBtn.addEventListener("click", function () {
        const link = document.createElement("a");
        link.download = "tirada-cartas.png";
        link.href = final.toDataURL("image/png");
        link.click();
      });
      actions.appendChild(downloadBtn);

      const whatsappBtn = el("button", "btn btn--share share-whatsapp", "WhatsApp");
      whatsappBtn.type = "button";
      whatsappBtn.addEventListener("click", function () {
        final.toBlob(function (blob) {
          const file = new File([blob], "tirada.png", { type: "image/png" });
          if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], text: shareText });
          } else {
            window.open("https://wa.me/?text=" + encodeURIComponent(shareText), "_blank");
          }
        });
      });
      actions.appendChild(whatsappBtn);

      const fbBtn = el("button", "btn btn--share share-facebook", "Facebook");
      fbBtn.type = "button";
      fbBtn.addEventListener("click", function () {
        window.open("https://www.facebook.com/sharer/sharer.php?quote=" + encodeURIComponent(shareText), "_blank", "width=626,height=436");
      });
      actions.appendChild(fbBtn);

      const twitterBtn = el("button", "btn btn--share share-twitter", "X / Twitter");
      twitterBtn.type = "button";
      twitterBtn.addEventListener("click", function () {
        window.open("https://twitter.com/intent/tweet?text=" + encodeURIComponent(shareText), "_blank", "width=626,height=436");
      });
      actions.appendChild(twitterBtn);

      const copyBtn = el("button", "btn btn--share", "Copiar imagen");
      copyBtn.type = "button";
      copyBtn.addEventListener("click", function () {
        final.toBlob(function (blob) {
          if (navigator.clipboard && navigator.clipboard.write) {
            navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]).then(function () {
              copyBtn.textContent = "Copiada \u2713";
              setTimeout(function () { copyBtn.textContent = "Copiar imagen"; }, 2000);
            });
          }
        });
      });
      actions.appendChild(copyBtn);

      panel.appendChild(actions);

      const closeBtn = el("button", "capture-close", "\u00d7");
      closeBtn.type = "button";
      closeBtn.addEventListener("click", function () { panel.remove(); });
      panel.appendChild(closeBtn);
    } catch (err) {
      panel.innerHTML = "<p>Error al generar la imagen</p>";
      console.error(err);
      setTimeout(function () { panel.remove(); }, 2000);
    }
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
   * Transiciones entre vistas — View Transitions API + fallback CSS
   * ---------------------------------------------------------------------- */

  /** Limpia el estado visual compartido por las transiciones de navegación. */
  function finishNavigation(root) {
    navigationLocked = false;
    document.documentElement.removeAttribute("data-view-direction");
    document.body.classList.remove("is-view-changing");
    if (root) {
      root.removeAttribute("aria-busy");
      const section = root.firstElementChild;
      if (section) {
        section.classList.remove(
          "view-enter",
          "view-enter--forward",
          "view-enter--back"
        );
      }
    }
    motionLog("scene:enter-complete");
  }

  /**
   * Cambio de esqueleto con continuidad visual. En navegadores compatibles,
   * document.startViewTransition conserva snapshots del estado anterior y el
   * siguiente. El fallback espera la salida CSS, renderiza y reparte la nueva
   * vista con una entrada escalonada; no hay desapariciones instantáneas.
   */
  function transitionDispatch(action, direction) {
    if (navigationLocked) return false;
    if (prefersReducedMotion() || typeof document === "undefined") {
      return dispatch(action);
    }

    const root = document.getElementById("app");
    const oldSection = root && root.firstElementChild;
    if (!root || !oldSection) return dispatch(action);

    navigationLocked = true;
    root.setAttribute("aria-busy", "true");
    document.documentElement.dataset.viewDirection = direction;
    document.body.classList.add("is-view-changing");
    motionLog("scene:exit-start", { action: action.type, direction });

    if (typeof document.startViewTransition === "function") {
      const viewTransition = document.startViewTransition(() => {
        const changed = dispatch(action);
        window.scrollTo(0, 0);
        motionLog("scene:swap", { action: action.type, native: true });
        return changed;
      });
      viewTransition.finished
        .catch(() => {})
        .finally(() => finishNavigation(root));
      return true;
    }

    oldSection.classList.add("view-leave", `view-leave--${direction}`);
    window.setTimeout(() => {
      const changed = dispatch(action);
      // La salida ya es invisible: normalizamos el origen de la nueva escena
      // antes de su primer frame para que el clamp del scroll no sea visible.
      window.scrollTo(0, 0);
      motionLog("scene:swap", { action: action.type, native: false });
      const newSection = root.firstElementChild;
      if (!changed || !newSection) {
        oldSection.classList.remove("view-leave", `view-leave--${direction}`);
        finishNavigation(root);
        return;
      }

      newSection.classList.add("view-enter", `view-enter--${direction}`);
      const cleanup = () => {
        newSection.removeEventListener("animationend", onEnterEnd);
        finishNavigation(root);
      };
      const onEnterEnd = (event) => {
        // Las cartas y el caption tienen animaciones hijas que burbujean.
        // Solo la animación del propio esqueleto cierra la navegación.
        if (event.target === newSection) cleanup();
      };
      newSection.addEventListener("animationend", onEnterEnd);
      window.setTimeout(cleanup, 760);
    }, 240);
    return true;
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
  async function selectCard(cardId) {
    const prev = Cartas.state;
    const next = transition(prev, { type: "SELECT", cardId });
    if (next === prev) return; // T5: doble activación durante el reveal — no-op

    Cartas.state = next;

    motionRunId += 1;
    motionStartedAt = motionNow();
    motionLog("select:commit", { cardId });

    if (prefersReducedMotion()) {
      // DRAW-3: el estado avanza al instante, sin animación.
      dispatch({ type: "FLIP_END" });
      return;
    }

    const root = document.getElementById("app");
    if (!root) return;
    const selected = root.querySelector(`.card[data-card-id="${cardId}"]`);
    if (!selected) return;

    const cards = Array.from(root.querySelectorAll(".card"));
    const selectedIndex = cards.indexOf(selected);
    const detached = detachCardFromCarousel(selected);
    if (!detached) {
      dispatch({ type: "FLIP_END" });
      return;
    }

    const canvases = Array.from(selected.querySelectorAll(".card-canvas"));
    if (canvases.length) {
      try {
        await Promise.all(
          canvases.map((canvas) => (canvas.renderComplete ? canvas.renderComplete : Promise.resolve()))
        );
      } catch (error) {
        console.error("[Cartas motion] Espera de canvas falló antes del flip", error);
      }
    }

    bindFlipEnd(selected);
    // La lectura fuerza el estado inicial ya reparentado antes de activar la
    // clase; así el navegador interpola el giro en lugar de saltar al final.
    selected.getBoundingClientRect();
    selected.classList.add("is-flipped");
    motionLog("flip:start", {
      cardId,
      card: compactRect(selected),
      layer: compactRect(detached.layer),
      flight: compactRect(detached.flight)
    });

    const sunk = [];
    for (const card of cards) {
      if (card !== selected) {
        const distance = Math.abs(cards.indexOf(card) - selectedIndex);
        card.style.setProperty("--sink-delay", `${Math.min(distance * 18, 180)}ms`);
        card.classList.add("is-sunk");
        sunk.push(card);
      }
    }
    // El delay parte de la distancia a la elegida y queda acotado: todas las
    // cartas terminan antes de que acabe el giro, evitando cortar el sink.
    const sinkBackstop = 680;
    for (const card of sunk) bindSinkRemoval(card, sinkBackstop);
    motionLog("siblings:sink-start", { count: sunk.length });
  }

  /**
   * Saca la carta del árbol scrollable antes de moverla. El item queda como
   * placeholder de idéntico tamaño para que el abanico no se recalcule.
   */
  function detachCardFromCarousel(card) {
    const item = card.closest(".carousel-item");
    if (!item) return null;

    const visualRect = card.getBoundingClientRect();
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const left = visualRect.left + visualRect.width / 2 - width / 2;
    const top = visualRect.top + visualRect.height / 2 - height / 2;

    item.classList.add("carousel-item--placeholder");
    item.style.width = `${width}px`;
    item.style.height = `${height}px`;
    const section = item.closest(".carousel-section");
    if (section) section.classList.add("is-selecting");

    const layer = el("div", "selection-layer");
    layer.setAttribute("aria-hidden", "true");
    const flight = el("div", "card-flight");
    flight.style.left = `${left}px`;
    flight.style.top = `${top}px`;
    flight.style.width = `${width}px`;
    flight.style.height = `${height}px`;
    layer.appendChild(flight);
    document.body.appendChild(layer);

    card.classList.add("card--detached");
    flight.appendChild(card);
    motionLog("select:detached", {
      visualBefore: {
        x: Number(visualRect.x.toFixed(1)),
        y: Number(visualRect.y.toFixed(1)),
        width: Number(visualRect.width.toFixed(1)),
        height: Number(visualRect.height.toFixed(1))
      },
      flight: compactRect(flight),
      placeholder: compactRect(item)
    });
    return { layer, flight };
  }

  /**
   * T4: al terminar el transform del flip se enlaza la geometría de la carta
   * ya desacoplada con su hueco definitivo en el reveal.
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
      motionLog("flip:complete", { card: compactRect(card) });
      revealSelectedCard(card);
    };
    const onEnd = (event) => {
      if (event.target === inner && event.propertyName === "transform") finish();
    };
    inner.addEventListener("transitionend", onEnd);
    const timer = setTimeout(finish, 760); // backstop (D6)
  }

  /** Continúa el recorrido con el mismo nodo que se desacopló del carrusel. */
  function revealSelectedCard(card) {
    if (!card || prefersReducedMotion()) {
      dispatch({ type: "FLIP_END" });
      return;
    }

    flyCardToReveal(card);
  }

  /**
   * Shared element manual: renderiza el destino como hueco invisible, mueve
   * el wrapper fijo hasta allí y reintroduce la MISMA carta en el nuevo DOM.
   */
  function flyCardToReveal(card) {
    const flight = card.closest(".card-flight");
    const layer = card.closest(".selection-layer");
    if (!flight || !layer) {
      dispatch({ type: "FLIP_END" });
      return;
    }

    const sourceRect = flight.getBoundingClientRect();
    const sourceNumber = card.querySelector(".face--front .face-num");
    const sourceNumberSize = sourceNumber
      ? parseFloat(window.getComputedStyle(sourceNumber).fontSize)
      : 0;

    dispatch({ type: "FLIP_END" });
    window.scrollTo(0, 0);
    const reveal = document.querySelector(".reveal");
    const target = reveal && reveal.querySelector(".reveal-card");
    if (!reveal || !target) {
      layer.remove();
      return;
    }

    reveal.classList.add("is-card-arriving");
    const targetRect = target.getBoundingClientRect();
    const targetNumber = target.querySelector(".face-num");
    const targetNumberSize = targetNumber
      ? parseFloat(window.getComputedStyle(targetNumber).fontSize)
      : 0;
    const scaleX = targetRect.width / sourceRect.width;
    const numberScale =
      sourceNumberSize > 0 && targetNumberSize > 0
        ? targetNumberSize / (sourceNumberSize * scaleX)
        : 1;
    flight.style.setProperty("--flight-x", `${targetRect.left - sourceRect.left}px`);
    flight.style.setProperty("--flight-y", `${targetRect.top - sourceRect.top}px`);
    flight.style.setProperty("--flight-sx", String(scaleX));
    flight.style.setProperty("--flight-sy", String(targetRect.height / sourceRect.height));
    flight.style.setProperty("--flight-num-scale", String(numberScale));
    card.classList.add("is-settling");
    motionLog("flight:prepared", {
      source: compactRect(flight),
      target: compactRect(target),
      scaleX: Number(scaleX.toFixed(4)),
      scaleY: Number((targetRect.height / sourceRect.height).toFixed(4)),
      numberScale: Number(numberScale.toFixed(4))
    });

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        flight.classList.add("is-flying");
        reveal.classList.add("is-content-arriving");
        motionLog("flight:start", { card: compactRect(card) });
      });
    });

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      flight.removeEventListener("transitionend", onEnd);
      landSelectedCard(card, flight, layer, target, reveal, sourceNumber);
    };
    const onEnd = (event) => {
      if (event.target === flight && event.propertyName === "transform") finish();
    };
    flight.addEventListener("transitionend", onEnd);
    window.setTimeout(finish, 760);
  }

  /** Reintroduce la carta en el reveal sin fundido ni sustitución visual. */
  function landSelectedCard(card, flight, layer, target, reveal, sourceNumber) {
    motionLog("flight:complete", {
      flight: compactRect(flight),
      target: compactRect(target)
    });

    card.classList.add("reveal-card", "card--revealed");
    card.classList.remove("card--detached", "is-flipped", "is-settling");
    card.disabled = true;
    card.tabIndex = -1;
    card.removeAttribute("aria-label");
    card.setAttribute("aria-hidden", "true");
    if (sourceNumber) sourceNumber.style.removeProperty("font-size");

    target.replaceWith(card);
    flight.remove();
    layer.remove();
    reveal.classList.remove("is-card-arriving", "is-content-arriving");
    motionLog("landing:complete", { card: compactRect(card) });
  }

  /**
   * T6: cada carta hundida se retira del DOM al terminar su transitionend,
   * con un barrido backstop alineado al estirón máximo de la tanda (D7,
   * DRAW-3): `backstopMs` cubre la duración más el retardo acotado para no
   * retirar cartas a media animación. El estado no cambia; solo el DOM.
   * @param {HTMLElement} card carta hundida
   * @param {number} [backstopMs] milisegundos del barrido (default 700)
   */
  function bindSinkRemoval(card, backstopMs) {
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
    const timer = setTimeout(remove, backstopMs || 700); // barrido backstop (D7)
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
    renderHeaderModes();
  }

  /* ------------------------------------------------------------------------
   * Diálogo de revisión (REVIEW-2/3) — #dialog-root es HERMANO de #app
   * (hijo directo de <body>, position:fixed): con el diálogo abierto, #app
   * queda inert para que el fondo sea inerte pero el diálogo siga vivo.
   * ---------------------------------------------------------------------- */

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

    Cartas.state = next;
    render();

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
    } else if (next.mode === "draw" && next.phase === "reveal" && prev.mode === "review") {
      // FOCUS_CARD: foco en el título del reveal
      const title = document.querySelector(".reveal-title");
      if (title) title.focus({ preventScroll: true });
    }
    return true;
  }

  async function init() {
    // Carga la colección por defecto antes de renderizar
    if (Cartas.loadCollection && !Cartas.collection) {
      await Cartas.loadCollection();
    }
    // Aspect ratio de las cartas desde el JSON
    const col = collection();
    if (col.width && col.height) {
      document.documentElement.style.setProperty("--card-aspect", `${col.width} / ${col.height}`);
    }
    // Título de la deck en el header
    const deckTitle = document.getElementById("deck-title");
    if (deckTitle && col.deck) {
      deckTitle.textContent = col.deck;
    }
    // Selector de modo de tirada en el header
    renderHeaderModes();
    // Recarga → home (sin persistencia; DRAW-1, REVIEW-5).
    Cartas.state = createInitialState();
    render();
    bindGlobalKeys();

    // Dev toggle: muestra el frente de todas las cartas del carousel
    const devBtn = document.getElementById("dev-toggle");
    if (devBtn) {
      devBtn.addEventListener("click", () => {
        const on = document.body.classList.toggle("dev-show-front");
        devBtn.setAttribute("aria-pressed", String(on));
      });
    }
  }

  /** Renderiza el selector de modos de tirada en el header */
  function renderHeaderModes() {
    const col = collection();
    const modes = col.reading_modes || [];
    const wrap = document.getElementById("reading-modes");
    if (!wrap) return;
    wrap.innerHTML = "";
    if (modes.length <= 1) return;

    const canChange = !Cartas.state || Cartas.state.drawn.length === 0;
    const mode = readingMode();

    if (canChange) {
      const label = el("span", "reading-modes-label", "Tipo de tirada");
      wrap.appendChild(label);
      const btns = el("div", "reading-modes-btns");
      modes.forEach(function (m, i) {
        const btn = el("button", "reading-mode-btn");
        btn.type = "button";
        btn.textContent = m.name;
        if (i === (Cartas.state && Cartas.state.readingMode)) btn.classList.add("is-active");
        btn.addEventListener("click", function () {
          Cartas.state = { ...Cartas.state, readingMode: i };
          render();
          renderHeaderModes();
        });
        btns.appendChild(btn);
      });
      wrap.appendChild(btns);
    } else {
      const info = el("span", "reading-modes-label", "Tipo de tirada: " + mode.name);
      wrap.appendChild(info);
    }
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
