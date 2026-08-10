/**
 * Fixture: mini deck (2 cards) — synthetic undersized deck used by the smoke
 * suite to prove deck-format invariants hold on any deck shape, including one
 * far below the shipped size (DECK-2).
 *
 * Same data shape as deck.js: { positions: [3 strings], cards: [...] }.
 * Not loaded by the app — verify-only.
 */
export const miniDeck = {
  positions: ["Situación actual", "Desafío", "Consejo"],
  cards: [
    {
      id: "sol",
      title: "El Sol",
      keywords: "claridad, energía",
      meaning: "Te invita a confiar en lo que ya brilla.",
      description:
        "El Sol marca un momento de claridad y energía renovada. Lo que estaba oculto por fin se ve con nitidez. Acepta la luz sin reservas y compártela con quienes te rodean.",
      image: ""
    },
    {
      id: "luna",
      title: "La Luna",
      keywords: "intuición, misterio",
      meaning: "Te invita a escuchar lo que no se dice.",
      description:
        "La Luna ilumina de otro modo: con matices y sombras. Hay algo en tu situación que aún no está claro y conviene no forzar. Observa lo que sientes y espera antes de decidir.",
      image: ""
    }
  ]
};
