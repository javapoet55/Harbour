#!/bin/bash
set -euo pipefail
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
# Command Line Tools are enough: these checks compile for macOS only.
[ -d "$DEVELOPER_DIR" ] || export DEVELOPER_DIR=/Library/Developer/CommandLineTools
repo_root=$(cd "$(dirname "$0")/../.." && pwd)
check_dir=$(mktemp -d /private/tmp/nexdo-email-verification.XXXXXX)
trap 'rm -rf "$check_dir"' EXIT
# Compile the actual AppModel against a mocked URL transport on macOS. Exclude
# only the iOS App entry point and the focus banner View, not model behavior.
python3 - "$repo_root" "$check_dir" <<'PY'
import pathlib,sys
root=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2])
s=(root/'ios/App/NexdoApp.swift').read_text()
(out/'AppModel.swift').write_text('import SwiftUI\n'+s[s.index('@MainActor\nfinal class AppModel'):])
s=(root/'ios/App/FocusSessionStrip.swift').read_text()
(out/'FocusModels.swift').write_text(s[:s.index('/// A single native presentation')])
PY
"$(xcrun --find swiftc)" \
  -swift-version 6 -parse-as-library -sdk "$(xcrun --sdk macosx --show-sdk-path)" \
  "$repo_root"/ios/Sources/NexdoCore/*.swift \
  "$check_dir/AppModel.swift" "$check_dir/FocusModels.swift" \
  "$repo_root/ios/Tests/AppModelChecks/UIKitShim.swift" \
  "$repo_root/ios/Tests/AppModelChecks/EmailVerificationChecks.swift" \
  -o "$check_dir/checks"
"$check_dir/checks"
