# Start with Sera Relay

1. Install Sera Relay. Windows: run `SeraRelay-Windows-Setup.exe`. Mac (Apple Silicon): paste `curl -fsSL https://raw.githubusercontent.com/Agent5D-369/sera-relay/main/install.sh | bash` into Terminal. The [README](README.md#install) shows each click, including the one-time security confirmation for this unsigned beta.
2. Open Sera Relay and link WhatsApp: on your phone, WhatsApp > Settings > Linked devices > Link a device, then scan the QR code.
3. Open a chat. Each voice note gets a panel with its transcript. Select **Transcribe** on older notes.
4. Optional: to use Sera, select **Connect Sera** under a transcript and enter your workspace's MCP URL and a token with document-write access. Then select **Review and publish** on a note.

Speech recognition runs on your computer with the bundled Whisper model. Nothing else needs to be installed except Chrome or Edge. Previewing sends the selected note to your Sera workspace for analysis; publishing saves it there. See [DEPLOYMENT.md](DEPLOYMENT.md) for data storage and source builds.
