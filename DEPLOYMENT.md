# Sera Relay deployment and source builds

## Windows beta installation

Download the Windows x64 ZIP for Sera Relay 2.1.0-beta.1 from the [GitHub release page](https://github.com/Agent5D-369/sera-relay/releases/tag/v2.1.0-beta.1). Extract the entire ZIP and run `Install.cmd`. The installer adds Start menu and Desktop shortcuts for your Windows account. The app is unsigned beta software.

Node.js and the Whisper `small` model are included in the release. Chrome or Edge must already be installed for WhatsApp linking and browser links. FFmpeg is a separate prerequisite: install FFmpeg and add its executable to `PATH`, or set `VOICE_FFMPEG` to the full executable path. Restart Sera Relay after changing the environment. Without FFmpeg, transcription cannot decode audio.

The app stores WhatsApp authentication, transcripts, inbox history, save receipts, and Windows-encrypted Sera credentials in the Windows user profile, outside the release ZIP. Keep this data directory when updating. To uninstall, remove the installed app folder and shortcuts. Remove the data directory separately only when you intend to erase local history and sign-in state.

## Sera workspace

Each user connects their own compatible Sera workspace using its MCP URL and token. The token needs document-write access and the reviewed voice-memory integration; read-only tokens cannot publish. Previewing and publishing send the selected note to the connected workspace. A general AI provider API key is not used by this desktop package. AI usage follows the connected workspace's billing arrangement.

## Build from source

Build and release packaging are maintained for Windows. The released app includes Python runtime components, Node.js, and the Whisper model. The build machine needs Python 3.13, Node.js, and FFmpeg available on `PATH` (or `VOICE_FFMPEG` set). Use a Python virtual environment and install the CPU build of Torch before installing `requirements-build.txt`:

```powershell
py -3.13 -m venv .venv
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install torch==2.9.1 --index-url https://download.pytorch.org/whl/cpu
.venv\Scripts\python.exe -m pip install -r requirements-build.txt
```

Install Node.js 24, then install the receiver dependencies and fetch the Whisper model into the standard cache:

```powershell
Set-Location receiver
npm ci
Set-Location ..
.venv\Scripts\python.exe -c "import whisper; whisper.load_model('small')"
```

Run the source test suites on Windows:

```powershell
.venv\Scripts\python.exe -m unittest discover -s tests -v
Set-Location receiver
npm test
```

Build the Windows release package from the repository root:

```powershell
Set-Location ..
.\Build-Release.ps1
```

The package is unsigned. Do not describe a release as clean-VM verified unless that verification has actually been performed. Third-party license notices are collected into the release package.
