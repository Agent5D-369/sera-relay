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
# Every receiver module except tests and browser checks, so a new module cannot be left out.
for file in receiver/*.cjs receiver/package.json receiver/package-lock.json; do
  case "$(basename "$file")" in *.test.cjs|verify_*) continue ;; esac
  cp "$file" "$resources/receiver/"
done
node="$(find "$app/Contents" -path '*/runtime/node' -type f | head -n 1)"
PUPPETEER_SKIP_DOWNLOAD=true "$node" "$(dirname "$(command -v npm)")/../lib/node_modules/npm/bin/npm-cli.js" \
  ci --omit=dev --prefix "$resources/receiver" --ignore-scripts
"$node" "$resources/receiver/check-package.cjs" "$resources/receiver"
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
