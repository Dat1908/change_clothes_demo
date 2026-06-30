#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  AI Outfit Studio — Setup & Run Script
# ─────────────────────────────────────────────────────────────
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"

echo "🔧 Cài đặt dependencies Python..."
cd "$BACKEND_DIR"

# Create virtual env if not exists
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
  echo "✅ Tạo virtual env tại backend/.venv"
fi

source .venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt

echo ""
echo "✅ Cài đặt xong!"
echo ""
echo "🚀 Khởi động API server tại http://localhost:8000 ..."
echo "📺 Mở frontend tại  http://localhost:8000/app"
echo ""

cd "$BACKEND_DIR"
python main.py
