#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Necesitás Node.js: https://nodejs.org (versión 20 o más)"
  echo "Instalalo y volvé a hacer doble clic en INICIAR.command"
  read -p "Presioná Enter para cerrar..."
  exit 1
fi
[ -d node_modules ] || npm install --no-audit --no-fund
echo ""
echo "Abriendo Posta en tu navegador..."
(sleep 2; open http://localhost:3000) &
npm start
