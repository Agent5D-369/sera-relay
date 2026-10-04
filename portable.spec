from pathlib import Path
import shutil
from PyInstaller.utils.hooks import collect_data_files, copy_metadata

root = Path(SPECPATH)
runtime = root / 'build' / 'runtime-input'
runtime.mkdir(parents=True, exist_ok=True)
shutil.copy2(shutil.which('node'), runtime / 'node.exe')
datas = collect_data_files('whisper') + collect_data_files('tiktoken') + copy_metadata('openai-whisper')
datas += [(str(Path.home() / '.cache' / 'whisper' / 'small.pt'), 'models')]
datas += [(str(root / 'assets' / 'sera-relay.ico'), 'assets')]
binaries = [(str(runtime / 'node.exe'), 'runtime')]
a = Analysis([str(root / 'desktop_entry.py')], pathex=[str(root)], binaries=binaries, datas=datas,
             hiddenimports=['tiktoken_ext.openai_public', 'auto_app', 'app'],
             excludes=['tensorflow', 'matplotlib', 'IPython', 'jupyter', 'pytest', 'pandas', 'cv2', 'torchaudio', 'torchvision'],
             noarchive=False)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='SeraRelay', debug=False,
          bootloader_ignore_signals=False, strip=False, upx=False, console=False, icon=str(root / 'assets' / 'sera-relay.ico'))
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='SeraRelay')
