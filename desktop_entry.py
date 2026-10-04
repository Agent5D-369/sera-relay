"""Portable Windows entry point. Bundled runtimes; all user data remains per account."""
import json
import os
from pathlib import Path
import subprocess
import sys


def setup_runtime():
    if getattr(sys, 'frozen', False):
        root = Path(sys._MEIPASS)
        os.environ['PATH'] = str(root / 'runtime') + os.pathsep + os.environ.get('PATH', '')
        import shutil
        decoder = os.environ.get('VOICE_FFMPEG') or shutil.which('ffmpeg')
        if decoder: os.environ['VOICE_FFMPEG'] = decoder


def self_test():
    import tkinter as tk
    import numpy as np
    from engine import Transcriber
    root = tk.Tk(); root.withdraw(); root.update(); root.destroy()
    model = Transcriber()
    result = {'version': '2.1.0-beta.1', 'tk': True, 'model': True, 'numpy': np.__version__}
    for command in ['node', os.environ.get('VOICE_FFMPEG', 'ffmpeg')]:
        p = subprocess.run([command, '--version' if command == 'node' else '-version'], capture_output=True,
                           creationflags=subprocess.CREATE_NO_WINDOW, timeout=15)
        if p.returncode: raise RuntimeError('Bundled runtime check failed')
        result['node' if command == 'node' else 'ffmpeg'] = p.stdout.decode(errors='replace').splitlines()[0]
    if '--audio' in sys.argv:
        result['transcript'] = model.transcribe(Path(sys.argv[sys.argv.index('--audio') + 1]))
    Path(sys.argv[sys.argv.index('--report') + 1]).write_text(json.dumps(result, indent=2), encoding='utf-8')


if __name__ == '__main__':
    setup_runtime()
    if '--self-test' in sys.argv:
        try: self_test()
        except Exception as error:
            Path(sys.argv[sys.argv.index('--report') + 1]).write_text(json.dumps({'error': str(error)}), encoding='utf-8')
            raise
    elif '--manual' in sys.argv:
        from app import main
        main()
    else:
        from auto_app import main
        if '--auto' not in sys.argv and '--inline' not in sys.argv: sys.argv.append('--inline')
        main()
