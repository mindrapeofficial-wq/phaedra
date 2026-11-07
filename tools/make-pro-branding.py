#!/usr/bin/env python3
"""Regenerate Phaedra Pro's branding assets from the master logo.

The master logo is a white "~P" glyph on a black square (the Phaedra Lite
app icon). Phaedra Pro uses the inverse: a black glyph on a white square.

Usage:
    python3 tools/make-pro-branding.py <master-logo.png>

Writes, relative to the repository root:
    gtk2_ardour/resources/Phaedra-icon*.png    window/taskbar icons
    gtk2_ardour/icons/Phaedra.ico              executable icon
    gtk2_ardour/resources/phaedra-header-logo.png  toolbar badge
    gtk2_ardour/resources/Phaedra-splash.png   startup splash (600x218)
    gtk2_ardour/resources/Phaedra-small-splash.png (300x109)

Requires Pillow.
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "gtk2_ardour" / "resources"
ICONS = ROOT / "gtk2_ardour" / "icons"
FONTS = ROOT / "gtk2_ardour" / "fonts" / "ibm-plex"

BG = (19, 18, 23)          # Lite window background #131217
BAND = (14, 13, 17)        # splash message band
BAND_EDGE = (34, 31, 40)   # #221F28
TEXT = (244, 240, 246)     # #F4F0F6
TEXT_DIM = (150, 150, 152) # #969698
ACCENT = (236, 63, 151)    # #EC3F97


def glyph_mask(master: Path) -> Image.Image:
    """Return the glyph as an L-mode alpha mask on the full square canvas."""
    src = Image.open(master).convert("L")
    # The master is white-on-black; luminance is the glyph coverage.
    return src.point(lambda v: 0 if v < 24 else (255 if v > 232 else v))


def inverse_icon(mask: Image.Image, size: int, radius_ratio: float = 0.0) -> Image.Image:
    """Black glyph on a white square (optionally rounded), RGBA.

    Small sizes zoom into the glyph a little so the stroke stays legible.
    """
    big = 1024
    zoom = 1.25 if size <= 32 else (1.12 if size <= 48 else 1.0)
    if zoom > 1.0:
        side = mask.size[0] / zoom
        off = (mask.size[0] - side) / 2
        mask = mask.crop((round(off), round(off), round(off + side), round(off + side)))
    m = mask.resize((big, big), Image.LANCZOS)
    tile = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    shape = Image.new("L", (big, big), 0)
    ImageDraw.Draw(shape).rounded_rectangle((0, 0, big - 1, big - 1), radius=int(big * radius_ratio), fill=255)
    white = Image.new("RGBA", (big, big), (255, 255, 255, 255))
    tile.paste(white, (0, 0), shape)
    black = Image.new("RGBA", (big, big), (0, 0, 0, 255))
    tile.paste(black, (0, 0), m)
    return tile.resize((size, size), Image.LANCZOS)


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size)


def splash(mask: Image.Image, scale: float) -> Image.Image:
    w, h = int(600 * scale), int(218 * scale)
    im = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(im)

    band_top = h - int(32 * scale)
    d.rectangle((0, band_top, w, h), fill=BAND)
    d.line((0, band_top, w, band_top), fill=BAND_EDGE, width=max(1, int(scale)))

    tile_size = int(108 * scale)
    tile = inverse_icon(mask, tile_size, radius_ratio=0.22)
    tx = int(54 * scale)
    ty = (band_top - tile_size) // 2
    im.paste(tile, (tx, ty), tile)

    title = font("IBMPlexSans-Light.ttf", int(62 * scale))
    sub = font("IBMPlexSans-Regular.ttf", int(17 * scale))
    x = tx + tile_size + int(30 * scale)
    tb = d.textbbox((0, 0), "Phaedra", font=title)
    sb = d.textbbox((0, 0), "by Galante", font=sub)
    gap = int(10 * scale)
    block_h = (tb[3] - tb[1]) + gap + (sb[3] - sb[1])
    y0 = ty + (tile_size - block_h) // 2
    d.text((x - tb[0], y0 - tb[1]), "Phaedra", font=title, fill=TEXT)
    sy = y0 + (tb[3] - tb[1]) + gap
    d.text((x - sb[0], sy - sb[1]), "by Galante", font=sub, fill=TEXT_DIM)
    # thin accent rule, as in the Lite selection colour
    ry = sy + (sb[3] - sb[1]) + int(12 * scale)
    d.rounded_rectangle((x, ry, x + int(46 * scale), ry + max(2, int(3 * scale))), radius=2, fill=ACCENT)
    return im


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    mask = glyph_mask(Path(sys.argv[1]))

    for size in (16, 22, 24, 32, 48, 128, 256, 512):
        inverse_icon(mask, size).save(RES / f"Phaedra-icon_{size}px.png")
    inverse_icon(mask, 256).save(RES / "Phaedra-icon.png")

    ico = inverse_icon(mask, 256)
    ico.save(ICONS / "Phaedra.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

    inverse_icon(mask, 36, radius_ratio=0.22).save(RES / "phaedra-header-logo.png")

    splash(mask, 1.0).save(RES / "Phaedra-splash.png")
    splash(mask, 0.5).save(RES / "Phaedra-small-splash.png")
    print("branding assets written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
