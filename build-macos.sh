#!/usr/bin/env bash
# Build "Sera Relay.app" plus a drag-to-Applications DMG and a ZIP for the one-line installer.
# Needs: macOS on Apple Silicon, Python 3.13 with requirements-build.txt, Node.js 24, the Whisper small model.
set -euo pipefail
cd "$(dirname "$0")"
python="${PYTHON:-python3}"
version="$("$python" -c 'from platform_support import VERSION; print(VERSION)')"

"$python" -m PyInstaller --noconfirm portable.spec
app="dist/Sera Relay.app"
resources="$app/Contents/Resources"

mkdir -p "$resources/receiver"
for file in bridge.cjs compat.cjs external.cjs focus.cjs history.cjs incoming.cjs inline.cjs media-compat.cjs review-ui.cjs window.cjs package.json package-lock.json; do
  cp "receiver/$file" "$resources/receiver/"
done
node="$(find "$app/Contents" -path '*/runtime/node' -type f | head -n 1)"
PUPPETEER_SKIP_DOWNLOAD=true "$node" "$(dirname "$(command -v npm)")/../lib/node_modules/npm/bin/npm-cli.js" \
  ci --omit=dev --prefix "$resources/receiver" --ignore-scripts
cp DEPLOYMENT.md LICENSE "$resources/"
cp -R assets "$resources/"
mkdir -p "$resources/THIRD-PARTY-NOTICES"
"$python" collect_licenses.py "$resources/THIRD-PARTY-NOTICES"

# Files were added after PyInstaller signed the bundle; reseal it (ad hoc, no Apple Developer ID).
codesign --force --deep --sign - "$app"
codesign --verify --deep --strict "$app"

rm -f dist/SeraRelay-macOS.zip dist/SeraRelay-macOS.dmg
ditto -c -k --sequesterRsrc --keepParent "$app" dist/SeraRelay-macOS.zip
staging="$(mktemp -d)"
cp -R "$app" "$staging/"
ln -s /Applications "$staging/Applications"
hdiutil create -volname "Sera Relay $version" -srcfolder "$staging" -fs HFS+ -format UDZO -ov dist/SeraRelay-macOS.dmg
rm -rf "$staging"
shasum -a 256 dist/SeraRelay-macOS.zip dist/SeraRelay-macOS.dmg
