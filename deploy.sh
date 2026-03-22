#!/usr/bin/env bash
set -euo pipefail

echo "==> Building contracts…"
forge build

echo "==> Building & deploying app to GitHub Pages…"
cd app
npm install
npm run deploy

echo "==> Done. Site will be live at:"
echo "    https://01-quantum.github.io/qone-eth-bridge/"
