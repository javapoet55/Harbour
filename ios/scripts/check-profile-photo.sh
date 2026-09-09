#!/bin/bash
set -euo pipefail
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
repo_root=$(cd "$(dirname "$0")/../.." && pwd)
check_dir=$(mktemp -d /private/tmp/nexdo-photo-checks.XXXXXX)
trap 'rm -rf "$check_dir"' EXIT
sed -n '/^@MainActor/,$p' "$repo_root/ios/App/NexdoApp.swift" > "$check_dir/AppModel-body.swift"
{ printf 'import SwiftUI\n'; cat "$check_dir/AppModel-body.swift"; } > "$check_dir/AppModel.swift"
sed '/^\/\/\/ A single native presentation/,$d' "$repo_root/ios/App/FocusSessionStrip.swift" > "$check_dir/FocusModels.swift"
"$DEVELOPER_DIR/Toolchains/XcodeDefault.xctoolchain/usr/bin/swiftc" \
  -swift-version 6 -parse-as-library -sdk "$(xcrun --sdk macosx --show-sdk-path)" \
  "$repo_root"/ios/Sources/NexdoCore/*.swift \
  "$check_dir/AppModel.swift" "$check_dir/FocusModels.swift" \
  "$repo_root/ios/Tests/AppModelChecks/ProfilePhotoChecks.swift" -o "$check_dir/checks"
"$check_dir/checks"
