# Start with Sera Relay

1. Install FFmpeg and ensure `ffmpeg` is available on `PATH`, or set `VOICE_FFMPEG` to the full path to its executable.
2. Download the [Sera Relay 2.1.0-beta.1 Windows x64 ZIP](https://github.com/Agent5D-369/sera-relay/releases/tag/v2.1.0-beta.1), extract the complete ZIP, and run `Install.cmd`.
3. Open Sera Relay from the Desktop or Start menu and link WhatsApp using the QR instructions.
4. To use Sera, open Settings and enter your own compatible workspace MCP URL and token. Your Sera administrator supplies a token with document-write permission and the reviewed voice-memory integration.
5. Select a voice note, transcribe it, and review the proposed memory and tasks before saving.

Speech recognition runs locally using the bundled Whisper model. Previewing sends the selected note to your Sera workspace for analysis; saving publishes it there. AI usage follows your workspace's billing arrangement. Chrome or Edge is required. See [DEPLOYMENT.md](DEPLOYMENT.md) for data storage, source builds, and additional requirements.
