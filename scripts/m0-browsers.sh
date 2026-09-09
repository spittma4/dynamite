#!/usr/bin/env bash
# M0 gate harness: two isolated headless Chrome sessions, two seeded users, one factory.
# Logs each in, opens the play page, nudges player 1, screenshots both.
#
# Usage: FACTORY_ID=1 OUT=/tmp/m0 scripts/m0-browsers.sh
# Requires: chrome-devtools-axi on PATH, Herd serving https://dynamite.test,
#           game-server running on :2567, seeded users (F01 seeder).
set -euo pipefail

BASE="${BASE:-https://dynamite.test}"
FACTORY_ID="${FACTORY_ID:-1}"
OUT="${OUT:-/tmp/m0}"
mkdir -p "$OUT"

login() { # session email password
  local s="$1" email="$2" pass="$3"
  export CHROME_DEVTOOLS_AXI_SESSION="$s"
  chrome-devtools-axi open "$BASE/login" >/dev/null
  chrome-devtools-axi wait 800 >/dev/null
  chrome-devtools-axi eval "const f=document.querySelector('form'); f.querySelector('input[name=email]').value='$email'; f.querySelector('input[name=password]').value='$pass'; f.requestSubmit(); 'submitted'" >/dev/null
  chrome-devtools-axi wait 1500 >/dev/null
}

play() { # session
  export CHROME_DEVTOOLS_AXI_SESSION="$1"
  chrome-devtools-axi open "$BASE/play/$FACTORY_ID" >/dev/null
  chrome-devtools-axi wait 2500 >/dev/null
}

shot() { # session name
  export CHROME_DEVTOOLS_AXI_SESSION="$1"
  chrome-devtools-axi screenshot "$OUT/$2.png" | tail -1
}

login p1 sam@example.com password
login p2 priya@example.com password
play p1
play p2

# nudge player 1 east for ~1 s, then both screenshot
export CHROME_DEVTOOLS_AXI_SESSION=p1
for _ in 1 2 3 4 5 6 7 8; do chrome-devtools-axi press ArrowRight >/dev/null; done
chrome-devtools-axi wait 600 >/dev/null

shot p1 p1-after-move
shot p2 p2-sees-p1

# console errors, if any
for s in p1 p2; do
  export CHROME_DEVTOOLS_AXI_SESSION="$s"
  echo "--- console $s ---"; chrome-devtools-axi console 2>/dev/null | grep -iE "error|warn" | head -10 || true
done
echo "screenshots in $OUT"
