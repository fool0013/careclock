# renders the png app icons (same design as icons/icon.svg). run: python scripts/make_icons.py
from PIL import Image, ImageDraw
import math, os

BLUE, WHITE, YELLOW = (29, 95, 184), (255, 255, 255), (250, 178, 25)
OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')


def draw(size, maskable=False):
    S = 4  # supersample for smooth edges
    n = size * S
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    k = n / 512
    if maskable:
        d.rectangle([0, 0, n, n], fill=BLUE)
        k *= 0.8  # keep art inside the safe zone
    else:
        d.rounded_rectangle([0, 0, n - 1, n - 1], radius=112 * k, fill=BLUE)
    off = (n - 512 * k) / 2
    P = lambda x, y: (off + x * k, off + y * k)
    cx, cy = P(256, 256)
    r = 168 * k
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE)
    w = int(34 * k)
    d.line([P(256, 150), P(256, 256), P(326, 300)], fill=BLUE, width=w, joint='curve')
    for x, y in (P(256, 150), P(326, 300)):
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=BLUE)
    # capsule rotated -40deg around (372, 380)
    pill = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pill)
    x0, y0 = P(300, 340)
    x1, y1 = P(450, 416)
    pd.rounded_rectangle([x0, y0, x1, y1], radius=38 * k, fill=YELLOW, outline=BLUE, width=int(14 * k))
    mx, _ = P(375, 0)
    pd.line([(mx, y0), (mx, y1)], fill=BLUE, width=int(14 * k))
    pill = pill.rotate(40, center=P(372, 380), resample=Image.BICUBIC)
    img.alpha_composite(pill)
    return img.resize((size, size), Image.LANCZOS)


draw(192).save(os.path.join(OUT, 'icon-192.png'))
draw(512).save(os.path.join(OUT, 'icon-512.png'))
draw(512, maskable=True).save(os.path.join(OUT, 'maskable-512.png'))
print('icons written')
