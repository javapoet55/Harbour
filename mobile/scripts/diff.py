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

# Each platform's own top inset, in pixels of the 720px-wide stored capture.
#   iOS      62 pt on a 402 pt screen -> 62 * (720/402)
#   Android  59 px on a 720 px screen (the status bar / cutout), used as-is
# Overlaying from the screen top instead makes every content row land ~30 px apart and reports
# 35-40% on any populated screen, which says nothing about styling. Cropping each side by its own
# inset first compares content to content.
TOP_INSET = {"ios": 111, "android": 59}
ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / "docs" / "reference"


def load(path: Path, width: int) -> Image.Image:
    im = Image.open(path).convert("RGB")
    return im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)


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
    # Drop each platform's status bar so the first content row lines up.
    scale = COMPARE_WIDTH / 720
    a = a.crop((0, round(TOP_INSET["ios"] * scale), a.width, a.height))
    b = b.crop((0, round(TOP_INSET["android"] * scale), b.width, b.height))
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
