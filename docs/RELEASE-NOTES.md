# Sera Relay 2.1.0-beta.1

A Windows companion for reading received and sent WhatsApp voice notes as local transcripts, with optional reviewed memories and shared tasks through your own Sera workspace.

## Get started

1. Install FFmpeg separately and put `ffmpeg` on PATH, or set `VOICE_FFMPEG` to the executable path.
2. Download the ZIP, verify it against SHA256SUMS.txt, and extract the entire archive.
3. Run Install.cmd, open Sera Relay, and link WhatsApp. Chrome or Edge must already be installed.
4. For memory publishing, connect your own compatible Sera MCP URL and token in Settings. Sera is optional for transcription.

## Included

- Integrated WhatsApp voice-note transcription using the bundled local Whisper small model.
- Received, sent, and older-note support; durable local duplicate tracking.
- Transcript review, automatic titles including the sender, duplicate checks, and published-memory indicators.
- Reviewed memory publishing, multiple assignees on one shared task, and links to saved records.
- Saved links routed to the last-focused regular Chrome/Edge window.
- Original branding, synthetic screenshots, setup/support/security guides, and dependency license notices.

## Validation and beta status

39 local Python checks, eight receiver checks, and inline/responsive browser flows passed. The packaged runtime is smoke-tested with synthetic speech. GitHub Windows CI checks source behavior independently. Interactive audio-device checks run locally and are skipped on hosted CI. This is an unsigned beta; a clean-machine interactive WhatsApp linking test has not been completed. FFmpeg is not included. Bulk Markdown export is not included.

Speech recognition runs locally. Sera preview/publishing sends the selected transcript and its message context to the workspace you choose; provider charges depend on that workspace. This unofficial companion is not affiliated with WhatsApp or Meta. Upstream changes can affect compatibility.
