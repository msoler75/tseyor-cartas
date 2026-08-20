#!/bin/bash
# Deploy Caddy config para servir la app cartas-tseyor en /cartas-tseyor
# Uso: sudo ./deploy-caddy.sh
#
# Lo que hace:
#   1. Valida que exista la app y el Caddyfile nuevo
#   2. Valida el Caddyfile con `caddy validate`
#   3. Hace backup del Caddyfile actual (con timestamp)
#   4. Instala el Caddyfile nuevo
#   5. Recarga Caddy sin cortar el servicio

set -euo pipefail

CADDYFILE="/etc/caddy/Caddyfile"
CADDYFILE_NEW="/home/dev_901/cartas-tseyor/Caddyfile.new"
APP_DIR="/home/dev_901/cartas-tseyor"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="${CADDYFILE}.bak.${STAMP}"

# --- Pre-checks ------------------------------------------------------------
if [ ! -f "$CADDYFILE_NEW" ]; then
	echo "ERROR: no existe $CADDYFILE_NEW"
	echo "       regeneralo con el contenido actualizado (o copia el vigente)."
	exit 1
fi

if [ ! -f "$APP_DIR/index.html" ]; then
	echo "ERROR: no se encuentra la app en $APP_DIR (falta index.html)."
	exit 1
fi

# --- 1. Validar config ------------------------------------------------------
echo "==> Validando configuracion"
if ! caddy validate --config "$CADDYFILE_NEW" 2>&1; then
	echo "ERROR: configuracion invalida. No se aplica nada."
	exit 1
fi

# --- 2. Backup --------------------------------------------------------------
echo "==> Backup de la config actual"
cp -a "$CADDYFILE" "$BACKUP"
echo "    Backup: $BACKUP"

# --- 3. Instalar ------------------------------------------------------------
echo "==> Instalando nueva config"
cp "$CADDYFILE_NEW" "$CADDYFILE"

# --- 4. Recargar ------------------------------------------------------------
echo "==> Recargando Caddy"
caddy reload --config "$CADDYFILE"

echo "OK: Caddy recargado."
echo "    App disponible en: https://164.68.107.151.sslip.io/cartas-tseyor/"
echo "    Backup previo: $BACKUP"
