#!/usr/bin/env python3
"""Compare the SwiftUI reference with the React Native render on Android.

    ./scripts/diff.py <screen>-<state> [--mask x0,y0,x1,y1 ...]

The phone and the simulator have different aspect ratios, so both are scaled to a common width and
only the overlapping height is compared — a tall phone's extra rows have nothing to compare against
and would otherwise be counted as mismatches.

Prints the share of compared pixels whose largest RGB channel differs by more than THRESHOLD, which
is loose enough to ignore antialiasing and tight enough to catch a real difference in spacing, size,
colour or text wrapping. Writes a heat map to docs/reference/diff/.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

THRESHOLD = 16
COMPARE_WIDTH = 540  # both sides scale to this; keeps the diff cheap and the PNG small

# Each platform's own top inset, in pixels of the 720px-wide stored capture. Used as a floor for the
# content search below, so a status-bar glyph is never mistaken for the first content row.
#   iOS      62 pt on a 402 pt screen -> 62 * (720/402)
#   Android  59 px on a 720 px screen (the status bar / cutout), used as-is
TOP_INSET = {"ios": 111, "android": 59}
ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / "docs" / "reference"


def load(path: Path, width: int) -> Image.Image:
    im = Image.open(path).convert("RGB")
    return im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)


def content_top(im: Image.Image, floor: int) -> int:
    """The first row below the status bar that has any content in it.

    Aligning on each platform's *declared* inset is not enough: iOS reserves 62pt and Android
    31.5dp, but the two apps then start drawing at slightly different distances below that, so
    every row still lands 6-11dp apart and the heat map doubles every element. Finding the first
    real content row on each side and aligning there compares like with like, and makes the
    percentage reflect styling rather than a constant offset.
    """
    a = np.asarray(im.convert("L"), dtype=np.int16)
    for y in range(floor, min(a.shape[0], floor + 400)):
        row = a[y]
        if (np.abs(row - int(np.median(row))) > 24).sum() > 3:
            return y
    return floor


def main(argv: list[str]) -> None:
    name = argv[0]
    masks = []
    i = 1
    while i < len(argv):
        if argv[i] == "--mask":
            masks.append(tuple(int(v) for v in argv[i + 1].split(",")))
            i += 2
        else:
            raise SystemExit(f"unknown argument {argv[i]}")

    ios_path, android_path = REF / "ios" / f"{name}.png", REF / "android" / f"{name}.png"
    for p in (ios_path, android_path):
        if not p.exists():
            raise SystemExit(f"missing {p.relative_to(ROOT)}")

    a, b = load(ios_path, COMPARE_WIDTH), load(android_path, COMPARE_WIDTH)
    # Align on the first content row of each, not on the declared inset — see content_top.
    scale = COMPARE_WIDTH / 720
    a = a.crop((0, content_top(a, round(TOP_INSET["ios"] * scale)), a.width, a.height))
    b = b.crop((0, content_top(b, round(TOP_INSET["android"] * scale)), b.width, b.height))
    height = min(a.height, b.height)  # compare only the overlap
    ai = np.asarray(a.crop((0, 0, COMPARE_WIDTH, height)), dtype=np.int16)
    bi = np.asarray(b.crop((0, 0, COMPARE_WIDTH, height)), dtype=np.int16)

    mismatch = np.abs(ai - bi).max(axis=2) > THRESHOLD
    compared = np.ones(mismatch.shape, dtype=bool)
    for x0, y0, x1, y1 in masks:
        compared[y0:y1, x0:x1] = False

    heat = (ai // 3 + 80).astype(np.uint8)
    heat[mismatch & compared] = (255, 0, 0)
    for x0, y0, x1, y1 in masks:
        heat[y0:y1, x0:x1] = (60, 90, 200)

    (REF / "diff").mkdir(parents=True, exist_ok=True)
    Image.fromarray(heat).convert("P", palette=Image.ADAPTIVE, colors=256).save(
        REF / "diff" / f"{name}.png", optimize=True
    )
    print(f"{100.0 * (mismatch & compared).sum() / compared.sum():.2f}")


if __name__ == "__main__":
    main(sys.argv[1:])
