# Changelog

## 2.4.0-beta.1

- Renamed to Sera WhatsApp Relay: window title, installer, Start menu and Desktop shortcuts, the Mac app, and the docs. Transcripts, the WhatsApp link and the Sera connection carry over. Download file names and the install folder stay the same so existing installers keep working. Upgrading removes the old Sera Relay shortcuts, and the one-line Mac installer replaces the old Sera Relay app.

## 2.3.0-beta.2

- Windows setup asks where to install on first install, so the app (about 2 GB) can go on another drive. The one-line installer takes `$env:SERA_RELAY_DIR`. Updates reuse the chosen folder.
- Send written messages to Sera. Under an open chat, select **Select messages for Sera**, pick messages (Shift-select picks a range), then **Review with Sera**. They go through the same review as a voice note and publish as copied text, not as a transcript.
- The **Select messages for Sera** button sits between the contact's name and WhatsApp's header icons, on a solid background. In a narrow window it shortens to **Sera** instead of covering the photo or name.
- The WhatsApp window no longer shows Chrome's "unsupported command-line flag" warning bar.
- Saved or in-review messages show a small Sera label that reopens their review.
- Sera inbox: choose one chat that people forward messages into. New messages there are counted, and one click opens the chat with them selected. **Mark as handled** clears them without sending anything. The app only reads the chat and never posts.
- Publishing written messages needs the matching Sera server update; older servers are refused before anything is sent.

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
