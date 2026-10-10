# Sera Relay deployment and source builds

## Installing a release

Each release has four downloads:

| File | For |
|---|---|
| `SeraRelay-Windows-Setup.exe` | Windows 10 and 11, 64-bit. Per-user install, no administrator rights, Start menu and Desktop shortcuts, uninstaller in Settings > Apps. |
| `SeraRelay-Windows-x64-portable.zip` | Windows, if you prefer to extract and run `Install.cmd`. Installs to the same folder as Setup. |
| `SeraRelay-macOS.dmg` | Macs with Apple Silicon. Drag to Applications. |
| `SeraRelay-macOS.zip` | Used by the one-line Mac installer (`install.sh`). |

`SHA256SUMS.txt` lists the checksum of every download. The one-line installers (`install.ps1`, `install.sh`) pick the newest release, verify its checksum, install, and open the app. `BUILD-INFO.json` records the commit and the packaged smoke-test result for both platforms.

Releases are not code-signed. Windows SmartScreen and macOS Gatekeeper ask for a one-time confirmation; the README shows the exact steps.

Node.js, the Whisper `small` model, and the audio decoder (libsndfile with Ogg Opus) are bundled. Chrome or Edge must already be installed. FFmpeg is not needed. If FFmpeg is on `PATH`, or `VOICE_FFMPEG` points to it, it is used only for audio formats the bundled decoder cannot read.

## Local data

All user data lives in `.whatsapp-transcriber` in your home folder (`%USERPROFILE%` on Windows, `~` on macOS): the WhatsApp link in `auth`, transcripts and queue state in `inbox.sqlite3`, and audio waiting for transcription in `spool`. Installing, updating, and uninstalling never touch this folder. Delete it only when you intend to erase local history and sign-in state.

The Sera token is protected by the operating system: Windows DPAPI for your account (`sera-credential.dpapi`), or the macOS Keychain (service "Sera Relay"; the file then only marks that a credential exists).

## Sera workspace

Each user connects their own compatible Sera workspace using its MCP URL and token. The token needs document-write access and the reviewed voice-memory integration; read-only tokens cannot publish. Previewing and publishing send the selected note to the connected workspace. A general AI provider API key is not used by this desktop package. AI usage follows the connected workspace's billing arrangement.

## Build from source

You need Python 3.13, Node.js 24, and the Whisper `small` model in the standard cache. Install Torch before the other requirements.

Windows (PowerShell):

```powershell
py -3.13 -m venv .venv
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install torch==2.9.1 --index-url https://download.pytorch.org/whl/cpu
.venv\Scripts\python.exe -m pip install -r requirements-build.txt
```

macOS (Terminal, Apple Silicon):

```bash
python3.13 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install torch==2.9.1
.venv/bin/python -m pip install -r requirements-build.txt
```

Then, on either system:

```bash
cd receiver && npm ci && cd ..
python -c "import whisper; whisper.load_model('small')"
python -m unittest discover -s tests -v
cd receiver && node --test *.test.cjs && cd ..
```

Build:

- Windows: `.\Build-Release.ps1` builds `dist\SeraRelay`, the portable ZIP, and, with [Inno Setup 6](https://jrsoftware.org/isinfo.php) installed, `SeraRelay-Windows-Setup.exe`. Pass `-SkipInstaller` to skip the installer.
- macOS: `PYTHON=.venv/bin/python bash build-macos.sh` builds `dist/Sera Relay.app`, the DMG, and the ZIP. The app is sealed with an ad hoc signature.

## Releasing

Raise `VERSION` in `platform_support.py`, update `CHANGELOG.md` and `docs/RELEASE-NOTES.md`, then run the **Release** workflow in GitHub Actions. It builds both installers on clean runners, installs each one, transcribes a synthetic voice note with FFmpeg removed from `PATH`, uninstalls (Windows), and drafts a release with checksums. A person reviews the draft and publishes it. Do not describe a release as verified on a clean machine beyond what that workflow and any manual checks actually did. Third-party license notices are collected into every package.
