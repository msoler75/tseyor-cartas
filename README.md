# Cartas Tseyor

Juego web de cartas inspirado en una lectura de tarot. Permite sacar hasta tres
cartas, una a una, y consultar el significado de cada posición de la tirada.

## Ejecutar la aplicación

No requiere instalación ni dependencias: es una aplicación estática hecha con
HTML, CSS y JavaScript.

1. Abre una terminal.
2. Entra en la carpeta del proyecto:

```bash
cd /home/pigmalion/projects/cartas-tseyor
```

3. Arranca el servidor en el puerto 9090:

```bash
python3 -m http.server 9090 --bind 127.0.0.1
```

4. Mantén esa terminal abierta y visita en el navegador:

[http://127.0.0.1:9090/](http://127.0.0.1:9090/)

Cuando el servidor está listo, la terminal muestra un mensaje similar a:

```text
Serving HTTP on 127.0.0.1 port 9090 ...
```

Para detenerlo, vuelve a esa terminal y pulsa `Ctrl+C`.

También puede abrirse `index.html` directamente, aunque se recomienda utilizar
el servidor local para reproducir el entorno normal de uso.

## Cómo jugar

1. Piensa en una pregunta o situación sobre la que quieras reflexionar.
2. Pulsa **Sacar carta**.
3. Elige una carta del abanico.
4. Lee su posición, significado y descripción.
5. Pulsa **Sacar otra carta** para continuar la tirada, hasta un máximo de tres.
6. Pulsa **Ver tirada** para revisar juntas todas las cartas obtenidas.
7. Pulsa **Nueva tirada** para comenzar de nuevo.

Las posiciones se interpretan en este orden:

1. Situación actual
2. Desafío
3. Consejo

## Controles

- Ratón o pantalla táctil: desplaza el abanico y pulsa una carta para elegirla.
- `←` y `→`: cambia la carta enfocada.
- `Inicio` y `Fin`: salta a la primera o última carta del abanico.
- `Enter` o `Espacio`: selecciona la carta enfocada.
- `Escape`: cierra el detalle de una carta o vuelve desde la revisión.

La aplicación respeta la preferencia del sistema
`prefers-reduced-motion`, reduciendo las animaciones cuando está activada.

## Modificar el mazo

Las cartas y los nombres de las posiciones se encuentran en
[`deck.js`](deck.js). Cada carta utiliza esta estructura:

```js
{
  id: "sol",
  title: "El Sol",
  keywords: "claridad, energía, confianza",
  meaning: "Interpretación breve de la carta.",
  description: "Descripción ampliada para la lectura.",
  image: ""
}
```

El campo `id` debe ser único. Actualmente `image` está reservado para futuras
ilustraciones; si se deja vacío, la carta muestra su número romano.

## Comprobaciones

Para validar la sintaxis, los datos del mazo y las transiciones de estado:

```bash
bash scripts/check.sh
```

La prueba principal también puede ejecutarse directamente:

```bash
node verify/smoke.mjs
```

### Logs de animación

La selección de una carta escribe una traza temporizada en la consola del
navegador. Para verla, abre las herramientas de desarrollo, entra en
**Console** y filtra por:

```text
Cartas motion
```

La traza incluye las fases `select`, `flip`, `flight` y `landing`, junto con
las medidas del documento y del carrusel para detectar overflow o scrollbars.
Puede desactivarse temporalmente desde la consola con:

```js
Cartas.motionDebug = false
```

## Archivos principales

- `index.html`: estructura base de la aplicación.
- `styles.css`: diseño, adaptación responsive y animaciones.
- `app.js`: estado, navegación y comportamiento del juego.
- `deck.js`: contenido editable de las cartas.
