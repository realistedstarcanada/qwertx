#!/usr/bin/env bash
# OCR a scanned OGE PDF: render pages, strip table rules, run Tesseract in parallel, print the text (pages split by \f).
# Usage: scripts/ocr-pdf.sh file.pdf > file.txt
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
d="$(mktemp -d)"
trap 'rm -rf "$d"' EXIT
pdftoppm -r 300 -gray -png "$1" "$d/p"
ls "$d"/p-*.png | xargs -P "${OCR_JOBS:-4}" -n 4 python3 "$here/lib/unline.py"
ls "$d"/p-*.png | xargs -P "${OCR_JOBS:-4}" -I{} sh -c 'OMP_THREAD_LIMIT=1 tesseract "{}" "{}" --psm 6 -c preserve_interword_spaces=1 >/dev/null 2>&1 || true'
for f in $(ls "$d"/p-*.png | sort); do [ -f "$f.txt" ] && cat "$f.txt"; printf '\f'; done
