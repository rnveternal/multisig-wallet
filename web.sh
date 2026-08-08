#!/usr/bin/env bash
# macOS/Linux equivalent of web.bat
set -e

echo "============================================"
echo "  MultiSig Wallet - Local Web Coordinator"
echo "============================================"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "[!] Node.js tidak ditemukan."
  echo "    Install dulu dari https://nodejs.org/en/download (LTS), lalu jalankan ulang script ini."
  exit 1
fi

echo "[OK] Node.js terdeteksi: $(node --version)"
cd "$(dirname "$0")/web"

if [ ! -d node_modules ]; then
  echo "[*] Menginstall dependencies..."
  npm install
else
  echo "[OK] Dependencies sudah terinstall."
fi

echo
echo "[*] Menjalankan server lokal di http://localhost:5173 ..."
npm run dev
