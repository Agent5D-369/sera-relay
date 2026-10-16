# Sera Relay 2.3.0-beta.1 for Windows and Mac

Read WhatsApp voice notes as text inside WhatsApp, transcribed on your own computer. Optionally publish a reviewed voice note, or a set of written messages, to your Sera workspace with its follow-up tasks in one step.

## Install

- **Windows 10/11 (64-bit):** download `SeraRelay-Windows-Setup.exe` and open it. If Windows shows "Windows protected your PC", select More info, then Run anyway. Or in PowerShell: `irm https://raw.githubusercontent.com/Agent5D-369/sera-relay/main/install.ps1 | iex`
- **Mac (Apple Silicon):** in Terminal: `curl -fsSL https://raw.githubusercontent.com/Agent5D-369/sera-relay/main/install.sh | bash`. Or open `SeraRelay-macOS.dmg`, drag to Applications, and approve it once in System Settings > Privacy & Security > Open Anyway.

Chrome or Edge is required. Nothing else: FFmpeg is no longer needed. Updating keeps your transcripts, WhatsApp link, and Sera connection.

## New in this release

- **Send written messages to Sera.** Under an open chat, select **Select messages for Sera**, click the messages you want (Shift-click picks a range), then **Review with Sera**. They go through the same review as a voice note and are saved as copied text with each sender and time. Photo, video and file captions count as text.
- **Labels on sent messages.** Messages already sent to Sera show a small label that reopens their review.
- **Sera inbox chat.** Choose one chat that people forward messages into. New messages there are counted in the panel, and one click opens the chat with them selected. **Mark as handled** clears messages without sending them. Sera Relay only reads that chat and never posts.
- A forwarded message shows who forwarded it, because WhatsApp does not show the original author.
- Publishing written messages needs a current Sera workspace. Older Sera servers are refused before anything is sent.

Everything from 2.2 is included: Mac support, the one-file Windows installer, no FFmpeg, note colors, Mark reviewed, the voice-note rail, and one-step publish with tasks.

## Checks

Python and receiver test suites run on Windows and macOS in CI. Each installer was installed on a clean GitHub runner and transcribed a synthetic voice note with FFmpeg removed from `PATH`; the Windows installer was also uninstalled. Results are in `BUILD-INFO.json`. A full interactive WhatsApp linking test on a fresh machine is still a manual step. Not code-signed.

Unofficial companion, not affiliated with WhatsApp or Meta. Upstream changes can affect compatibility.
