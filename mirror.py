"""Copia en GitHub Pages los feeds del catálogo de SonorBooks que Spotify no acepta en su dominio original.

Spotify for Creators rechaza «hosting domain is not supported» para srv1644251.hstgr.cloud, workers.dev, r2.dev y
(desde el 23/11/2026) feeds.sonorbooks.com. Acepta el feed en sonorbooks.github.io con el audio y las portadas en el
VPS (prueba T10 del 16/11). Este script descarga cada feed del VPS, cambia solo la URL del propio feed (atom:self) a
GitHub Pages y deja el audio y las portadas en srv1644251.hstgr.cloud.

Para añadir un país o volúmenes: editar PAISES y volver a lanzar el workflow (o hacer push).
"""
import re
import sys
import time
import urllib.request
from pathlib import Path

PAGES = "https://sonorbooks.github.io/podcast-feeds"
ORIGEN = "https://feeds.sonorbooks.com"
MEDIA = "https://srv1644251.hstgr.cloud"

# código de carpeta en Pages -> (prefijo en el VPS, número de volúmenes)
PAISES = {
    "it": ("sonorbooks-catalogo-it", 8),
    "de": ("sonorbooks-catalogo-de", 25),
}


def get(url: str) -> str:
    last = None
    for intento in range(6):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "SonorBooks-podcast-feeds/1.0"})
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.read().decode("utf-8")
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(10 * (intento + 1))
    raise RuntimeError(f"{url}: {last}")


# Brasil (26/11/2026): los feeds ya salen con su URL de Pages en atom:self y el audio y las portadas en el R2 de la
# cuenta de Cloudflare de Brasil (brasil@sonorbooks.com, bucket sonorbooks-catalogo-br). Se copian tal cual.
BR_MEDIA = "https://pub-f98c7ebaa8294cd7bcc0d4d7b3b7a16c.r2.dev"


def mirror_br() -> int:
    import json
    try:
        info = json.loads(get(f"{BR_MEDIA}/rss/feeds.json"))
    except Exception as exc:  # noqa: BLE001  (aún no publicado: no se copia nada)
        print(f"br: sin feeds.json ({exc})", flush=True)
        return 0
    carpeta = Path("site") / "br"
    carpeta.mkdir(parents=True, exist_ok=True)
    total = 0
    for f in info["feeds"]:
        xml = get(f"{BR_MEDIA}/rss/{f['file']}")
        assert f'<atom:link href="{PAGES}/br/{f["file"]}" rel="self"' in xml, f"br {f['file']}: atom:self no es Pages"
        items = xml.count("<item>")
        assert items == f["episodes"], f"br {f['file']}: {items} episodios, {f['episodes']} esperados"
        (carpeta / f["file"]).write_text(xml, encoding="utf-8")
        total += items
        print(f"br/{f['file']}: {items} episodios", flush=True)
    return total


def main() -> int:
    total = mirror_br()
    for cc, (prefijo, vols) in PAISES.items():
        carpeta = Path("site") / cc
        carpeta.mkdir(parents=True, exist_ok=True)
        for n in range(1, vols + 1):
            nombre = f"feed-{n:02d}.xml"
            xml = get(f"{ORIGEN}/{prefijo}/rss-spotify/{nombre}")
            xml = re.sub(r'<atom:link href="[^"]+" rel="self"',
                         f'<atom:link href="{PAGES}/{cc}/{nombre}" rel="self"', xml, count=1)
            # audio y portadas: siempre en el VPS (lo que Spotify aceptó en T10)
            xml = xml.replace(f"{ORIGEN}/{prefijo}/", f"{MEDIA}/{prefijo}/")
            items = xml.count("<item>")
            assert items > 0, f"{cc} {nombre}: sin episodios"
            assert "feeds.sonorbooks.com" not in xml and "workers.dev" not in xml, f"{cc} {nombre}: dominio bloqueado"
            (carpeta / nombre).write_text(xml, encoding="utf-8")
            total += items
            print(f"{cc}/{nombre}: {items} episodios", flush=True)
    print(f"total: {total} episodios")
    return 0


if __name__ == "__main__":
    sys.exit(main())
