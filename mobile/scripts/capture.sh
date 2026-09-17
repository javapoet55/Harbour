#!/bin/zsh
# capture.sh <screen>-<state>
#
# Takes the same moment on both apps at once: the SwiftUI reference from the iOS Simulator and the
# React Native app from the Android phone over USB. The Swift app is the reference; Android is the
# thing being corrected.
#
#   ./scripts/capture.sh sign-in-empty        both
#   PLATFORM=ios ./scripts/capture.sh ...     only the simulator
#   PLATFORM=android ./scripts/capture.sh ... only the phone
set -e
NAME="$1"
[ -z "$NAME" ] && { echo "usage: capture.sh <screen>-<state>"; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REF="$ROOT/docs/reference"
ADB="${ADB:-$HOME/Library/Android/sdk/platform-tools/adb}"
SIM="${SIM:-booted}"
PLATFORM="${PLATFORM:-both}"

mkdir -p "$REF/ios" "$REF/android"

# The simulator shoots at 1206px wide and the phone at 720. Store both at the phone's width: the
# diff scales to 540 anyway, and a 1.9 MB reference per screen would blow the repository up.
shrink() {
  python3 - "$1" <<'PYEOF'
import sys
from PIL import Image
p = sys.argv[1]
im = Image.open(p).convert("RGB")
if im.width > 720:
    im = im.resize((720, round(im.height * 720 / im.width)), Image.LANCZOS)
im.convert("P", palette=Image.ADAPTIVE, colors=256).save(p, optimize=True)
PYEOF
}

if [ "$PLATFORM" = "both" ] || [ "$PLATFORM" = "ios" ]; then
  # simctl refuses to overwrite a file carrying extended attributes, so clear the target first.
  rm -f "$REF/ios/$NAME.png"
  xcrun simctl io "$SIM" screenshot --type png "$REF/ios/$NAME.png" >/dev/null 2>&1 \
    && shrink "$REF/ios/$NAME.png" && echo "ios/$NAME.png" || echo "ios: FAILED"
fi

if [ "$PLATFORM" = "both" ] || [ "$PLATFORM" = "android" ]; then
  rm -f "$REF/android/$NAME.png"
  "$ADB" exec-out screencap -p > "$REF/android/$NAME.png" 2>/dev/null \
    && shrink "$REF/android/$NAME.png" && echo "android/$NAME.png" || echo "android: FAILED"
fi
