#!/bin/bash
# Sera Relay one-line installer for Macs with Apple Silicon (M1 or newer). Paste into Terminal:
#   curl -fsSL https://raw.githubusercontent.com/Agent5D-369/sera-relay/main/install.sh | bash
# Downloads the newest release, checks its SHA-256, puts Sera Relay in Applications, and opens it.
set -euo pipefail
repo="Agent5D-369/sera-relay"
name="SeraRelay-macOS.zip"

fail() { echo "Sera Relay: $*" >&2; exit 1; }
[ "$(uname -s)" = "Darwin" ] || fail "this installer is for macOS. On Windows, see https://github.com/$repo#install"
[ "$(uname -m)" = "arm64" ] || fail "the Mac version needs Apple Silicon (M1 or newer). Intel Macs are not supported yet."

echo "Finding the newest Sera Relay release..."
url="$(curl -fsSL -H 'User-Agent: sera-relay-installer' "https://api.github.com/repos/$repo/releases?per_page=10" \
  | grep -o "\"browser_download_url\": *\"[^\"]*/$name\"" | head -n 1 | sed 's/.*"\(https[^"]*\)"/\1/')"
[ -n "$url" ] || fail "no release with $name yet. See https://github.com/$repo/releases"
sums_url="${url%/*}/SHA256SUMS.txt"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
echo "Downloading $(basename "$(dirname "$url")"). This can take a few minutes..."
curl -fL --progress-bar -o "$work/$name" "$url"
if curl -fsSL -o "$work/SHA256SUMS.txt" "$sums_url"; then
  expected="$(grep " $name\$" "$work/SHA256SUMS.txt" | awk '{print $1}' | head -n 1)"
  actual="$(shasum -a 256 "$work/$name" | awk '{print $1}')"
  [ -n "$expected" ] && [ "$expected" = "$actual" ] || fail "the download did not match the published checksum. Nothing was installed. Try again."
  echo "Checksum verified."
fi

dest="/Applications"
[ -w "$dest" ] || { dest="$HOME/Applications"; mkdir -p "$dest"; }
if pgrep -f "Sera Relay.app/Contents/MacOS/SeraRelay" >/dev/null; then
  echo "Closing the running copy of Sera Relay..."
  osascript -e 'quit app "Sera Relay"' >/dev/null 2>&1 || true
  sleep 3
  pkill -f "Sera Relay.app/Contents/MacOS/SeraRelay" || true
fi
rm -rf "$dest/Sera Relay.app"
ditto -x -k "$work/$name" "$dest"

if [ ! -d "/Applications/Google Chrome.app" ] && [ ! -d "$HOME/Applications/Google Chrome.app" ] \
  && [ ! -d "/Applications/Microsoft Edge.app" ] && [ ! -d "$HOME/Applications/Microsoft Edge.app" ]; then
  echo "Note: Sera Relay needs Google Chrome or Microsoft Edge to show WhatsApp. Install one, then open Sera Relay."
fi
echo "Installed in $dest. Opening Sera Relay. Next time, open it from Launchpad or Applications."
open "$dest/Sera Relay.app"
