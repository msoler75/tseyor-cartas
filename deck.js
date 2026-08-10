/* ============================================================================
 * Cartas Tseyor — Mazo de cartas (deck.js)
 * ============================================================================
 * ESTE ES EL ÚNICO ARCHIVO QUE NECESITAS EDITAR PARA CAMBIAR LAS CARTAS.
 * No hace falta tocar index.html, styles.css ni app.js.
 *
 * CÓMO EDITAR
 * ----------
 * 1. Cada carta es un bloque entre llaves { ... } dentro de `cards`.
 * 2. Campos de cada carta:
 *      id          — nombre corto único (en minúsculas, sin espacios).
 *                    No repitas ids entre cartas.
 *      title       — el nombre de la carta, tal como se muestra.
 *      keywords    — 2 a 4 palabras clave, separadas por comas.
 *      meaning     — el significado breve (1 o 2 frases).
 *      description — la explicación completa (2 a 4 frases).
 *      image       — (opcional, reservado) ruta de una imagen futura.
 *                    Déjalo vacío ("") por ahora: se mostrará el número
 *                    grande en su lugar.
 * 3. Para AÑADIR una carta: copia un bloque y pega tras la última coma.
 * 4. Para QUITAR una carta: borra todo su bloque (y la coma anterior).
 * 5. Para REORDENAR: mueve los bloques; la numeración se ajusta sola.
 *    El número de la carta es su posición en la lista + 1.
 *
 * POSICIONES DE LA TIRADA
 * -----------------------
 * `positions` son las tres casillas de la tirada, en orden. Cada carta
 * sacada ocupa la siguiente posición; su significado lo da la posición,
 * no la carta. Puedes cambiar estas etiquetas si prefieres otras.
 *
 * NOTA: este archivo es un script de JavaScript normal y corriente.
 * Respeta las comas y las llaves; si algo se rompe, revisa que cada
 * bloque termine con `},` salvo el último.
 * ========================================================================== */

window.Cartas = window.Cartas || {};

window.Cartas.deck = {
  positions: ["Situación actual", "Desafío", "Consejo"],

  cards: [
    {
      id: "sol",
      title: "El Sol",
      keywords: "claridad, energía, vitalidad",
      meaning:
        "Te invita a confiar en lo que ya brilla: tu camino está iluminado y tus esfuerzos se ven.",
      description:
        "El Sol marca un momento de claridad y energía renovada. Lo que estaba oculto por fin se ve con nitidez, y la vitalidad vuelve a tu día a día. Es una carta de confianza: lo que has sembrado empieza a dar fruto. Acepta la luz sin reservas y compártela con quienes te rodean; tu presencia también ilumina.",
      image: ""
    },
    {
      id: "luna",
      title: "La Luna",
      keywords: "intuición, misterio, sueños",
      meaning:
        "Te invita a escuchar lo que no se dice: la respuesta ahora está en tu intuición, no en la razón.",
      description:
        "La Luna ilumina de otro modo: con matices, sombras y medias luces. Hay algo en tu situación que aún no está claro y conviene no forzar. En lugar de exigir certezas, observa lo que sientes al borde del sueño y de la memoria. Espera un poco antes de decidir; la imagen completa llegará por sí sola.",
      image: ""
    },
    {
      id: "estrella",
      title: "La Estrella",
      keywords: "esperanza, guía, serenidad",
      meaning:
        "Te recuerda que hay una salida visible: mantén la dirección y confía en el proceso.",
      description:
        "La Estrella es la carta de la esperanza serena. Después de la confusión llega un punto de orientación: una meta clara, un deseo concreto o una persona que te ayuda a ver mejor. No es promesa de triunfo inmediato, sino de rumbo verdadero. Cuida lo que te da calma y avanza un paso cada día.",
      image: ""
    },
    {
      id: "camino",
      title: "El Camino",
      keywords: "decisión, avance, elección",
      meaning:
        "Te señala que hay una decisión que tomar: elige la dirección y da el primer paso.",
      description:
        "El Camino habla de movimiento y de elección. Te encuentras ante una bifurcación, o ante la necesidad de salir de un lugar conocido hacia otro que intuyes mejor. No hay una ruta perfecta, pero sí una más coherente con tus valores. Decide con calma y, una vez elegida, camina sin mirar atrás.",
      image: ""
    },
    {
      id: "montana",
      title: "La Montaña",
      keywords: "esfuerzo, paciencia, meta",
      meaning:
        "Te recuerda que lo que pides requiere esfuerzo sostenido: la cumbre está lejos, pero es alcanzable.",
      description:
        "La Montaña representa el reto de largo aliento. Lo que tienes delante no es imposible, pero tampoco inmediato: exige preparación, ritmo y constancia. Evita la prisa y el desánimo a mitad de cuesta. Divide el ascenso en etapas y celebra cada pequeño avance. La vista desde arriba compensará el esfuerzo.",
      image: ""
    },
    {
      id: "rio",
      title: "El Río",
      keywords: "fluidez, cambio, emoción",
      meaning:
        "Te invita a soltar el control y dejarte llevar: lo que se resiste, fluye.",
      description:
        "El Río es el movimiento que no se detiene: emociones, cambios y oportunidades que pasan ante ti. Aferrarse a la orilla agota; remar en contra, más. Esta carta sugiere adaptarte al ritmo de las circunstancias y expresar lo que sientes con honestidad. Lo que hoy parece corriente, mañana será nuevo territorio.",
      image: ""
    },
    {
      id: "bosque",
      title: "El Bosque",
      keywords: "refugio, recursos, raíces",
      meaning:
        "Te habla de sostén: hay más recursos y protección a tu alrededor de los que crees.",
      description:
        "El Bosque es el lugar donde encontrar apoyo: personas, hábitos y recursos que ya están a tu alcance. A veces, en medio del problema, olvidamos cuánto tenemos. Esta carta te pide mirar tu red cercana y tus propias capacidades. No se avanza siempre a campo abierto; también se crece en la penumbra del bosque.",
      image: ""
    },
    {
      id: "semilla",
      title: "La Semilla",
      keywords: "inicio, paciencia, potencial",
      meaning:
        "Te recuerda que todo gran cambio empieza pequeño: planta hoy, recoge mañana.",
      description:
        "La Semilla anuncia un comienzo discreto con gran potencial. La idea, el proyecto o la relación están en su fase inicial y necesitan cuidados, no exigencias. Lo que hagas ahora —pequeño, constante y bien dirigido— determinará la cosecha. Confía en el proceso natural: lo sembrado a tiempo germina a su tiempo.",
      image: ""
    },
    {
      id: "mago",
      title: "El Mago",
      keywords: "recursos, destreza, voluntad",
      meaning:
        "Te dice que ya tienes lo necesario: es momento de actuar con intención y oficio.",
      description:
        "El Mago es la carta de la capacidad puesta en acción. Tienes a tu disposición las herramientas justas: conocimientos, contactos, talento o determinación. La diferencia ahora la marca la voluntad de usarlas con método. Propón, ejecuta y muestra resultados. Tu habilidad no es magia; es oficio, y está a tu favor.",
      image: ""
    },
    {
      id: "llave",
      title: "La Llave",
      keywords: "solución, acceso, revelación",
      meaning:
        "Te anuncia que la solución existe y está más cerca de lo que imaginas: solo falta girar.",
      description:
        "La Llave indica que el bloqueo tiene salida y que el acceso está al alcance. Puede ser una conversación pendiente, un recurso ignorado o una perspectiva nueva sobre lo que parecía cerrado. No busques una llave mágica: la que necesitas se forja con una decisión concreta. Gírala con firmeza y abre la puerta.",
      image: ""
    },
    {
      id: "espejo",
      title: "El Espejo",
      keywords: "reflexión, autoconocimiento, honestidad",
      meaning:
        "Te invita a mirarte con franqueza: lo que ves en tu situación también habla de ti.",
      description:
        "El Espejo devuelve una imagen que conviene observar sin filtros. La situación actual refleja creencias, hábitos o miedos que te acompañan y que quizá proyectas en los demás. Esta carta no juzga; propone honestidad. Reconoce tu parte sin culpa, porque solo lo reconocido puede transformarse. La mirada interna es el primer cambio real.",
      image: ""
    },
    {
      id: "vuelo",
      title: "El Vuelo",
      keywords: "libertad, perspectiva, impulso",
      meaning:
        "Te ofrece distancia y ligereza: mira desde arriba y atrévete a soltar el peso.",
      description:
        "El Vuelo eleva la perspectiva: lo que hoy parece enorme, visto desde cierta altura se vuelve parte de un paisaje mayor. Es momento de tomar aire, soltar cargas que no te pertenecen y confiar en el impulso que te pide ascender. La libertad no es huir; es elegir desde un punto de vista más amplio.",
      image: ""
    }
  ]
};