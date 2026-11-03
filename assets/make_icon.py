"""Builds the app icons from the Saberra "S" mark (Saberra Artwork/Icons/Saberra Icon- 003).

python assets/make_icon.py <source.png>   writes sera-relay.png (1024 px, macOS) and sera-relay.ico (Windows).
Large sizes keep the full mark on a dark tile. Small sizes (48 px and under) show the S alone,
because the surrounding dots and sparkles turn to noise at that size.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
TILE = (17, 27, 33, 255)  # WhatsApp dark panel color, so the icon sits well next to WhatsApp.


def tile(size):
    image = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(image).rounded_rectangle((0, 0, size - 1, size - 1), radius=round(size * 0.22), fill=TILE)
    return image


def s_only(mark):
    # Keep the warm yellow/orange S strokes; drop the cyan dots, lines and small sparkles around it.
    pixels = mark.load()
    out = Image.new('RGBA', mark.size, (0, 0, 0, 0))
    target = out.load()
    for y in range(mark.height):
        for x in range(mark.width):
            r, g, b, a = pixels[x, y]
            if a and r > 180 and b < 140 and 300 <= x <= 1000 and 105 <= y <= 1110:
                target[x, y] = (r, g, b, a)
    return out.crop(out.getbbox())


def place(mark, size, fill):
    image = tile(size)
    inner = round(size * fill)
    scaled = mark.copy()
    scaled.thumbnail((inner, inner), Image.LANCZOS)
    image.alpha_composite(scaled, ((size - scaled.width) // 2, (size - scaled.height) // 2))
    return image


def main(source):
    mark = Image.open(source).convert('RGBA')
    mark = mark.crop(mark.getbbox())
    letter = s_only(Image.open(source).convert('RGBA'))
    big = place(mark, 1024, 0.84)
    big.save(HERE / 'sera-relay.png')
    frames = [place(letter if size <= 48 else mark, size, 0.78 if size <= 48 else 0.84) for size in (16, 24, 32, 48, 64, 128, 256)]
    frames[-1].save(HERE / 'sera-relay.ico', sizes=[(f.width, f.height) for f in frames], append_images=frames[:-1])


if __name__ == '__main__':
    main(sys.argv[1])
