# Changelog

## 2.2.0-beta.1

- Mac support for Apple Silicon, with the Sera token stored in the macOS Keychain.
- One-file Windows installer (per-user, uninstaller included) and one-line installers for Windows and Mac.
- FFmpeg is no longer required; the bundled libsndfile decodes voice notes.
- Notes are colored by what they need, can be marked reviewed, and are marked on a rail at the edge of the chat.
- Publishing a memory and creating its follow-up tasks is one step. A failed task never downgrades a saved memory.
- Silent notes say they are silent. Read/Hide transcript survives background redraws. Clicking outside the review window closes it.
- Opening Sera Relay while it runs brings the existing window forward (the helper was missing from the 2.1 package).
- The 2.1 retry and record-link patches are included; the separate patch installers are removed.

## 2.1.0-beta.1

- Transcribe received and sent WhatsApp voice notes locally with Whisper; read and copy transcripts.
- Optionally review and save selected notes as Sera memory and shared tasks.
- Open saved record links in the last-focused regular Chrome or Edge window.
- Bundle the Windows x64 app runtimes and speech model in the release package.
- Marked beta; this Windows release is unsigned.
