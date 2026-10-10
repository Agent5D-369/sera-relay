"""Packaged entry point for Windows and macOS. Bundled runtimes; all user data remains per account."""
import json
import os
from pathlib import Path
import subprocess
import sys

from platform_support import NO_WINDOW, VERSION


def setup_runtime():
    if getattr(sys, 'frozen', False):
        root = Path(sys._MEIPASS)
        os.environ['PATH'] = str(root / 'runtime') + os.pathsep + os.environ.get('PATH', '')


def self_test():
    import tkinter as tk
    import numpy as np
    import soundfile
    from engine import Transcriber
    root = tk.Tk(); root.withdraw(); root.update(); root.destroy()
    model = Transcriber()
    result = {'version': VERSION, 'platform': sys.platform, 'tk': True, 'model': True, 'numpy': np.__version__,
              'decoder': 'libsndfile ' + soundfile.__libsndfile_version__}
    # Generous: antivirus scans a freshly installed node.exe on its first run.
    p = subprocess.run(['node', '--version'], capture_output=True, creationflags=NO_WINDOW, timeout=90)
    if p.returncode: raise RuntimeError('Bundled runtime check failed')
    result['node'] = p.stdout.decode(errors='replace').strip()
    if '--audio' in sys.argv:
        result['transcript'] = model.transcribe(Path(sys.argv[sys.argv.index('--audio') + 1]))
    Path(sys.argv[sys.argv.index('--report') + 1]).write_text(json.dumps(result, indent=2), encoding='utf-8')


if __name__ == '__main__':
    setup_runtime()
    if '--self-test' in sys.argv:
        try: self_test()
        except Exception as error:
            Path(sys.argv[sys.argv.index('--report') + 1]).write_text(json.dumps({'error': str(error)}), encoding='utf-8')
            # Exit instead of raising: a windowed build would show a crash dialog and hang the test.
            sys.exit(1)
    elif '--manual' in sys.argv:
        from app import main
        main()
    else:
        from auto_app import main
        if '--auto' not in sys.argv and '--inline' not in sys.argv: sys.argv.append('--inline')
        main()
