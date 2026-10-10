# Sera Relay 2.2.0-beta.1 for Windows and Mac

Read WhatsApp voice notes as text inside WhatsApp, transcribed on your own computer. Optionally publish a reviewed note to your Sera workspace with its follow-up tasks in one step.

## Install

- **Windows 10/11 (64-bit):** download `SeraRelay-Windows-Setup.exe` and open it. If Windows shows "Windows protected your PC", select More info, then Run anyway. Or in PowerShell: `irm https://raw.githubusercontent.com/Agent5D-369/sera-relay/main/install.ps1 | iex`
- **Mac (Apple Silicon):** in Terminal: `curl -fsSL https://raw.githubusercontent.com/Agent5D-369/sera-relay/main/install.sh | bash`. Or open `SeraRelay-macOS.dmg`, drag to Applications, and approve it once in System Settings > Privacy & Security > Open Anyway.

Chrome or Edge is required. Nothing else: FFmpeg is no longer needed. Updating keeps your transcripts, WhatsApp link, and Sera connection.

## New in this release

- **Mac support** (Apple Silicon). The Sera token is stored in the macOS Keychain.
- **One-file Windows installer** with an uninstaller. No administrator rights needed. Upgrades the 2.1 beta in place.
- **No FFmpeg install.** Voice notes are decoded by the bundled libsndfile.
- **Colors by what a note needs:** not transcribed (dashed yellow), to review (yellow), reviewed (purple), saved (green), needs attention (red).
- **Mark reviewed** keeps a note on your computer as handled, without publishing it.
- **Voice-note rail:** a marker on the right edge of the chat for every voice note. Select one to jump to it.
- **Publish memory + create tasks in one step.** A failed task never undoes a saved memory, and reopening a saved note never re-analyzes it.
- Silent voice notes say they are silent. Read and Hide transcript stay where you put them. Clicking outside the review window closes it. Opening the app again brings the running window forward.

## Checks

Python and receiver test suites run on Windows and macOS in CI. Each installer was installed on a clean GitHub runner and transcribed a synthetic voice note with FFmpeg removed from `PATH`; the Windows installer was also uninstalled. Results are in `BUILD-INFO.json`. A full interactive WhatsApp linking test on a fresh machine is still a manual step. Not code-signed.

Unofficial companion, not affiliated with WhatsApp or Meta. Upstream changes can affect compatibility.
