"""Portada del pódcast «Audiolibri gratis in italiano», con el mismo diseño que «Audiolibros gratis en español»
(papel crema con grano, Anton en negro y rojo, pegatina redonda, barras de ecualizador).

Uso: python crear_portada.py <carpeta_fuentes> <carpeta_salida> [es|it|nl|pl|se|fi|dk]
Salida: podcast-cover-audiolibri-gratis.jpg (1400x1400), logo-audiolibri-gratis-1024.png, -2048.png
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

TEXTS = {
    "es": {"header": "PODCAST  ·  AUDIOLIBROS COMPLETOS", "lines": ["AUDIOLIBROS", "GRATIS*", "EN ESPAÑOL"],
           "sticker": "AUDIOLIBROS COMPLETOS · ", "left": "*SE APLICAN TÉRMINOS Y CONDICIONES",
           "right": "EL ENLACE, EN CADA EPISODIO", "name": "audiolibros-gratis"},
    "it": {"header": "PODCAST  ·  AUDIOLIBRI COMPLETI", "lines": ["AUDIOLIBRI", "GRATIS*", "IN ITALIANO"],
           "sticker": "AUDIOLIBRI COMPLETI · ", "left": "*SI APPLICANO TERMINI E CONDIZIONI",
           "right": "IL LINK, IN OGNI EPISODIO", "name": "audiolibri-gratis"},
    "nl": {"header": "PODCAST  ·  VOLLEDIGE LUISTERBOEKEN", "lines": ["LUISTERBOEKEN", "GRATIS*", "IN HET", "NEDERLANDS"],
           "sticker": "VOLLEDIGE LUISTERBOEKEN · ", "left": "*VOORWAARDEN VAN TOEPASSING",
           "right": "DE LINK, IN ELKE AFLEVERING", "name": "luisterboeken-gratis",
           "size": 210, "tops": [262, 466, 670, 874], "sticker_center": (1150, 782)},
    "pl": {"header": "PODCAST  ·  PEŁNE AUDIOBOOKI", "lines": ["AUDIOBOOKI", "GRATIS*", "PO POLSKU"], "sticker": "PEŁNE AUDIOBOOKI · ",
           "left": "*OBOWIĄZUJĄ WARUNKI", "right": "LINK W KAŻDYM ODCINKU", "name": "audiobooki-gratis",
           "size": 240, "tops": [290, 545, 800], "sticker_center": (1189.5, 648)},
    "se": {"header": "PODCAST  ·  HELA LJUDBÖCKER", "lines": ["LJUDBÖCKER", "GRATIS*", "PÅ SVENSKA"], "sticker": "HELA LJUDBÖCKER · ",
           "left": "*VILLKOR GÄLLER", "right": "LÄNKEN FINNS I VARJE AVSNITT", "name": "ljudbocker-gratis",
           "size": 240, "tops": [280, 520, 830], "sticker_center": (1189.5, 655)},
    "fi": {"header": "PODCAST  ·  KOKONAISET ÄÄNIKIRJAT", "lines": ["ÄÄNIKIRJAT", "ILMAISEKSI*", "SUOMEKSI"], "sticker": "KOKONAISET ÄÄNIKIRJAT · ",
           "left": "*EHDOT PÄTEVÄT", "right": "LINKKI JOKAISESSA JAKSOSSA", "name": "aanikirjat-ilmaiseksi",
           "size": 240, "tops": [290, 545, 800], "sticker_center": (1189.5, 903)},
    "dk": {"header": "PODCAST  ·  HELE LYDBØGER", "lines": ["LYDBØGER", "GRATIS*", "PÅ DANSK"], "sticker": "HELE LYDBØGER · ",
           "left": "*BETINGELSER GÆLDER", "right": "LINKET FINDES I HVER EPISODE", "name": "lydboger-gratis",
           "size": 240, "tops": [280, 520, 830], "sticker_center": (1189.5, 623)},
    "no": {"header": "PODCAST  ·  HELE LYDBØKER", "lines": ["LYDBØKER", "GRATIS*", "PÅ NORSK"], "sticker": "HELE LYDBØKER · ",
           "left": "*VILKÅR GJELDER", "right": "LENKEN FINNER DU I HVER EPISODE", "name": "lydboker-gratis",
           "size": 240, "tops": [280, 520, 830], "sticker_center": (1189.5, 623)},
    "us": {"header": "PODCAST  ·  FULL AUDIOBOOKS", "lines": ["AUDIOBOOKS", "FREE*", "IN ENGLISH"], "sticker": "FULL AUDIOBOOKS · ",
           "left": "*TERMS APPLY", "right": "THE LINK IS IN EVERY EPISODE", "name": "free-audiobooks",
           "size": 240, "tops": [290, 545, 800], "sticker_center": (1189.5, 648)},
    "de": {"header": "PODCAST  ·  GANZE HÖRBÜCHER", "lines": ["HÖRBÜCHER", "GRATIS*", "AUF DEUTSCH"], "sticker": "GANZE HÖRBÜCHER · ",
           "left": "*ES GELTEN BEDINGUNGEN", "right": "DER LINK IN JEDER FOLGE", "name": "hoerbuecher-gratis",
           "size": 240, "tops": [280, 520, 830], "sticker_center": (1189.5, 655)},
    "br": {"header": "PODCAST  ·  AUDIOLIVROS COMPLETOS", "lines": ["AUDIOLIVROS", "GRÁTIS*", "EM PORTUGUÊS"], "sticker": "AUDIOLIVROS COMPLETOS · ",
           "left": "*SUJEITO A TERMOS E CONDIÇÕES", "right": "O LINK ESTÁ EM CADA EPISÓDIO", "name": "audiolivros-gratis",
           "size": 210, "tops": [280, 515, 805], "sticker_center": (1189.5, 598)},
}

PAPER = (222, 218, 209)
INK = (24, 22, 20)
RED = (212, 59, 46)
CREAM = (238, 234, 225)
BAR_HEIGHTS = [32, 62, 96, 92, 78, 60, 48, 90, 116, 94, 86, 48, 52, 76, 94, 120, 86, 40, 74, 86, 100, 102, 72, 40, 88, 86, 112, 96, 56, 48, 86, 88]

K = 2                      # se dibuja a 2800 px y se reduce: bordes más limpios
W = 1400 * K


def s(v: float) -> int:
    return int(round(v * K))


def tracked(draw, xy, text, font, fill, tracking=0.0):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += font.getlength(ch) + tracking
    return x


def tracked_width(text, font, tracking=0.0):
    return sum(font.getlength(ch) for ch in text) + tracking * (len(text) - 1)


def cap_top_offset(font):
    return font.getbbox("H")[1]


def build(fonts: Path, lang: str) -> Image.Image:
    t = TEXTS[lang]
    anton = lambda size: ImageFont.truetype(str(fonts / "Anton-Regular.ttf"), s(size))  # noqa: E731
    semi = ImageFont.truetype(str(fonts / "Poppins-SemiBold.ttf"), s(33))
    med = ImageFont.truetype(str(fonts / "Poppins-Medium.ttf"), s(29.5))

    rng = np.random.default_rng(27)
    base = np.empty((W, W, 3), dtype=np.float32)
    base[...] = PAPER
    grain = rng.normal(0, 2.4, (W, W, 1)).astype(np.float32)
    img = Image.fromarray(np.clip(base + grain, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)

    # cabecera y filete superior
    tracked(d, (s(98), s(102) - cap_top_offset(semi)), t["header"], semi, INK, tracking=s(0.6))
    d.rectangle([s(96), s(149), s(1304), s(152)], fill=INK)

    # título: misma altura de mayúscula que la versión española (233 px), líneas cada 262 px
    size = t.get("size", 268)
    k = size / 268
    big = anton(size)
    tops = t.get("tops", [299, 561, 823])
    colors = [RED if line.endswith("*") else INK for line in t["lines"]]
    for line, top, color in zip(t["lines"], tops, colors):
        word = line.rstrip("*")
        x0 = s(94) - big.getbbox(word)[0]
        d.text((x0, s(top) - cap_top_offset(big)), word, font=big, fill=color)
        if line.endswith("*"):                     # asterisco volado, más pequeño, como en la portada española
            star = anton(108 * k)
            bx = star.getbbox("*")
            sx = x0 + big.getbbox(word)[2] + s(24 * k) - bx[0]
            d.text((sx, s(top + 11 * k) - bx[1]), "*", font=star, fill=color)

    # ecualizador
    for i, h in enumerate(BAR_HEIGHTS):
        x0 = 96 + 38 * i
        d.rounded_rectangle([s(x0), s(1147 - h / 2), s(x0 + 22), s(1147 + h / 2)], radius=s(11), fill=INK)

    # filete inferior y pie
    d.rectangle([s(96), s(1255), s(1304), s(1258)], fill=INK)
    y_foot = s(1286) - cap_top_offset(med)
    tracked(d, (s(98), y_foot), t["left"], med, INK, tracking=0)
    rw = tracked_width(t["right"], med, tracking=0)
    tracked(d, (s(1302) - rw, y_foot), t["right"], med, INK, tracking=0)

    # pegatina: círculo rojo con texto circular y botón de play
    scx, scy = t.get("sticker_center", (1189.5, 731.5))
    cx, cy, r = s(scx), s(scy), s(155)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=RED)
    sticker_font = anton(37)
    text = t["sticker"]
    radius = r - s(38)
    spacing = s(3.2)
    total = sum(sticker_font.getlength(ch) for ch in text) + spacing * len(text)
    angle = -82 - math.degrees(total / radius) / 2          # centrado un poco a la derecha de arriba, en sentido horario
    for ch in text:
        adv = sticker_font.getlength(ch) + spacing
        a = angle + math.degrees(adv / 2 / radius)
        glyph = Image.new("RGBA", (s(90), s(90)), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glyph)
        gd.text((s(45), s(45)), ch, font=sticker_font, fill=CREAM + (255,), anchor="mm")
        glyph = glyph.rotate(-(a + 90), resample=Image.BICUBIC)
        px = cx + radius * math.cos(math.radians(a)) - glyph.width / 2
        py = cy + radius * math.sin(math.radians(a)) - glyph.height / 2
        img.paste(glyph, (int(px), int(py)), glyph)
        angle += math.degrees(adv / radius)
    tri = s(52)
    rot = math.radians(-8)
    pts = [(-0.55 * tri, -tri), (-0.55 * tri, tri), (1.05 * tri, 0)]
    pts = [(cx + px * math.cos(rot) - py * math.sin(rot), cy + px * math.sin(rot) + py * math.cos(rot)) for px, py in pts]
    d.polygon(pts, fill=CREAM)
    return img


def main() -> int:
    fonts, out = Path(sys.argv[1]), Path(sys.argv[2])
    lang = sys.argv[3] if len(sys.argv) > 3 else "it"
    out.mkdir(parents=True, exist_ok=True)
    img = build(fonts, lang)
    name = TEXTS[lang]["name"]
    img.resize((1400, 1400), Image.LANCZOS).save(out / f"podcast-cover-{name}.jpg", "JPEG", quality=92, optimize=True)
    img.resize((2048, 2048), Image.LANCZOS).save(out / f"logo-{name}-2048.png", optimize=True)
    img.resize((1024, 1024), Image.LANCZOS).save(out / f"logo-{name}-1024.png", optimize=True)
    img.resize((700, 700), Image.LANCZOS).save(out / f"preview-{name}.jpg", "JPEG", quality=88)
    print("ok", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
