#!/bin/sh
# Baixa as fotos do cardápio antigo (anota.ai) para public/img durante o build no Vercel.
# Depois do primeiro deploy, as fotos ficam no próprio site; se o download falhar, o site usa ilustrações.
set -u
BASE="https://client-assets.anota.ai/produtos/64910b89d089ca0012ea6a1d"
OUT="public/img"
mkdir -p "$OUT"
get() { # nome id
  [ -s "$OUT/$1.jpg" ] && return 0
  curl -fsSL -o "$OUT/$1.jpg" "$BASE/-$2blob_600" || curl -fsSL -o "$OUT/$1.jpg" "$BASE/-$2blob" || rm -f "$OUT/$1.jpg"
}
get pizza-media 1759472350468
get pizza-grande 1759472350576
get pizza-grande-3 1759472588106
get coca-1l 1734119310550
get coca-zero-1l 1734119297154
get guarana-1l 1759464901402
[ -s "$OUT/logo.png" ] || curl -fsSL -o "$OUT/logo.png" "https://client-assets.anota.ai/establishment-logos/64910b89d089ca0012ea6a1d1789648890176blob" || rm -f "$OUT/logo.png"
ls -la "$OUT"
exit 0
