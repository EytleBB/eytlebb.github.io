"""Create the aligned night background from the daytime master painting.

The forest is never resized, warped, or redrawn here. Night mode only changes
the colors of the daytime pixels, then adds stars and a crescent in open sky.
This keeps every trunk, branch, flower, and bird at the exact same coordinate.
"""

from pathlib import Path
import random

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
DAY = ROOT / "images" / "patchlog-bg-light.jpg"
OUT = ROOT / "images" / "patchlog-bg-night.jpg"

day = Image.open(DAY).convert("RGB")
gray = ImageOps.grayscale(day)
red, green, blue = day.split()

# Masks only select how the original pixels are recolored.
blue_over_red = ImageChops.subtract(blue, red)
blue_over_green = ImageChops.subtract(blue, green)
sky_mask = ImageChops.multiply(
    blue_over_red.point(lambda value: 255 if value > 24 else 0),
    blue_over_green.point(lambda value: 255 if value > 5 else 0),
).filter(ImageFilter.GaussianBlur(1.2))

red_over_blue = ImageChops.subtract(red, blue)
green_over_blue = ImageChops.subtract(green, blue)
warm_mask = ImageChops.multiply(
    red_over_blue.point(lambda value: 255 if value > 24 else 0),
    green_over_blue.point(lambda value: 255 if value > 10 else 0),
).filter(ImageFilter.GaussianBlur(1.0))

moonlit = ImageOps.colorize(
    gray,
    black=(2, 9, 24),
    mid=(39, 62, 92),
    white=(151, 173, 194),
    midpoint=136,
)
moonlit = ImageEnhance.Contrast(moonlit).enhance(1.06)

sky_detail = ImageOps.colorize(gray, black=(1, 10, 28), white=(15, 52, 91))
sky = Image.blend(Image.new("RGB", day.size, (3, 22, 52)), sky_detail, 0.32)
night = Image.composite(sky, moonlit, sky_mask)

warm = ImageEnhance.Brightness(day).enhance(0.43)
warm = ImageEnhance.Color(warm).enhance(0.78)
warm = Image.blend(warm, Image.new("RGB", day.size, (34, 38, 54)), 0.12)
night = Image.composite(warm, night, warm_mask.point(lambda value: int(value * 0.78)))

# Deterministic sparse stars, painted only in detected sky gaps.
width, height = night.size
overlay = Image.new("RGBA", day.size, (0, 0, 0, 0))
draw = ImageDraw.Draw(overlay)
rng = random.Random(20260816)
for _ in range(150):
    x = rng.randrange(24, width - 24)
    y = rng.randrange(18, int(height * 0.68))
    if sky_mask.getpixel((x, y)) < 220:
        continue
    radius = rng.choice((1, 1, 1, 2, 2, 3))
    alpha = rng.randrange(80, 175)
    draw.ellipse(
        (x - radius, y - radius, x + radius, y + radius),
        fill=(220, 231, 239, alpha),
    )

# Crescent position is fixed in a gap between the central trunks.
moon_mask = Image.new("L", day.size, 0)
moon_draw = ImageDraw.Draw(moon_mask)
cx, cy, radius = int(width * 0.640), int(height * 0.145), int(height * 0.055)
moon_draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=255)
moon_draw.ellipse(
    (
        cx - radius + int(radius * 0.58),
        cy - radius - int(radius * 0.10),
        cx + radius + int(radius * 0.58),
        cy + radius - int(radius * 0.10),
    ),
    fill=0,
)
glow = moon_mask.filter(ImageFilter.GaussianBlur(radius * 0.32))
glow_layer = Image.new("RGBA", day.size, (166, 205, 232, 0))
glow_layer.putalpha(glow.point(lambda value: int(value * 0.34)))
overlay = Image.alpha_composite(overlay, glow_layer)
moon_layer = Image.new("RGBA", day.size, (237, 234, 205, 0))
moon_layer.putalpha(moon_mask)
overlay = Image.alpha_composite(overlay, moon_layer)

night = Image.alpha_composite(night.convert("RGBA"), overlay).convert("RGB")
night.save(OUT, "JPEG", quality=93, subsampling=0, optimize=True, progressive=True)
print(OUT)
