"""Generates a placeholder app icon set for the Tauri bundle.
Run once; replace icons/icon.png with real branding later and re-run
`npx tauri icon icons/icon.png` to regenerate the full platform set.
"""
from PIL import Image, ImageDraw, ImageFont
import os

ROOT = os.path.join(os.path.dirname(__file__), "..", "src-tauri", "icons")
os.makedirs(ROOT, exist_ok=True)

SIZE = 1024
BG = (128, 20, 20, 255)  # deep maroon, matches scripture-study palette
FG = (240, 200, 120, 255)  # saffron glyph

img = Image.new("RGBA", (SIZE, SIZE), BG)
draw = ImageDraw.Draw(img)
try:
    font = ImageFont.truetype("segoeuib.ttf", 520)
except OSError:
    font = ImageFont.load_default()
text = "PC"
bbox = draw.textbbox((0, 0), text, font=font)
w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
draw.text(((SIZE - w) / 2 - bbox[0], (SIZE - h) / 2 - bbox[1]), text, font=font, fill=FG)

img.save(os.path.join(ROOT, "icon.png"))

sizes = [32, 128, 256]
for s in sizes:
    resized = img.resize((s, s), Image.LANCZOS)
    if s == 128:
        resized.save(os.path.join(ROOT, "128x128.png"))
        img.resize((256, 256), Image.LANCZOS).save(os.path.join(ROOT, "128x128@2x.png"))
    else:
        resized.save(os.path.join(ROOT, f"{s}x{s}.png"))

ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
img.save(os.path.join(ROOT, "icon.ico"), sizes=ico_sizes)

# .icns is only meaningfully used on macOS; write a placeholder PNG-as-icns
# is not valid, so just skip it — Windows builds do not require it.
print("Generated placeholder icons in", ROOT)
