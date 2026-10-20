#!/usr/bin/env bash
# OCR a scanned OGE PDF: render pages, strip table rules, run Tesseract in parallel, print the text (pages split by \f).
# Usage: scripts/ocr-pdf.sh file.pdf > file.txt
# Optional env: OCR_FIRST / OCR_LAST (page range), OCR_DPI (default 300), OCR_PSM (default 6), OCR_JOBS (default 4).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
d="$(mktemp -d)"
trap 'rm -rf "$d"' EXIT
range=()
[ -n "${OCR_FIRST:-}" ] && range+=(-f "$OCR_FIRST")
[ -n "${OCR_LAST:-}" ] && range+=(-l "$OCR_LAST")
pdftoppm -r "${OCR_DPI:-300}" -gray -png "${range[@]}" "$1" "$d/p"
ls "$d"/p-*.png | xargs -P "${OCR_JOBS:-4}" -n 4 python3 "$here/lib/unline.py"
export OCR_PSM="${OCR_PSM:-6}"
ls "$d"/p-*.png | xargs -P "${OCR_JOBS:-4}" -I{} sh -c 'OMP_THREAD_LIMIT=1 tesseract "{}" "{}" --psm "$OCR_PSM" -c preserve_interword_spaces=1 >/dev/null 2>&1 || true'
for f in $(ls "$d"/p-*.png | sort); do [ -f "$f.txt" ] && cat "$f.txt"; printf '\f'; done
