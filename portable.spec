from pathlib import Path
import shutil
import sys
from PyInstaller.utils.hooks import collect_data_files, collect_dynamic_libs, copy_metadata

root = Path(SPECPATH)
sys.path.insert(0, str(root))
from platform_support import VERSION

mac = sys.platform == 'darwin'
runtime = root / 'build' / 'runtime-input'
runtime.mkdir(parents=True, exist_ok=True)
node_name = 'node' if mac else 'node.exe'
shutil.copy2(shutil.which('node'), runtime / node_name)
datas = collect_data_files('whisper') + collect_data_files('tiktoken') + copy_metadata('openai-whisper')
datas += [(str(Path.home() / '.cache' / 'whisper' / 'small.pt'), 'models')]
datas += [(str(root / 'assets' / 'sera-relay.ico'), 'assets')]
# libsndfile (with Ogg/Opus) decodes voice notes, so no separate FFmpeg install is needed.
binaries = [(str(runtime / node_name), 'runtime')] + collect_dynamic_libs('soundfile')
datas += collect_data_files('soundfile')
hidden = ['tiktoken_ext.openai_public', 'auto_app', 'soundfile'] + ([] if mac else ['app'])
a = Analysis([str(root / 'desktop_entry.py')], pathex=[str(root)], binaries=binaries, datas=datas,
             hiddenimports=hidden,
             excludes=['tensorflow', 'matplotlib', 'IPython', 'jupyter', 'pytest', 'pandas', 'cv2', 'torchaudio', 'torchvision']
                      + (['app', 'capture', 'process_audio_capture'] if mac else []),
             noarchive=False)
pyz = PYZ(a.pure)
icon = str(root / 'assets' / ('sera-relay.png' if mac else 'sera-relay.ico'))
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='SeraRelay', debug=False,
          bootloader_ignore_signals=False, strip=False, upx=False, console=False, icon=icon)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='SeraRelay')
if mac:
    app = BUNDLE(coll, name='Sera Relay.app', icon=icon, bundle_identifier='com.agent5d.serarelay',
                 version=VERSION.split('-')[0],
                 info_plist={'CFBundleDisplayName': 'Sera Relay', 'CFBundleShortVersionString': VERSION,
                             'LSMinimumSystemVersion': '12.0', 'NSHighResolutionCapable': True})
