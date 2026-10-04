"""Build a redistributable ZIP and fail on accidentally included user state."""
from pathlib import Path
import sys
import zipfile

source, target = map(Path, sys.argv[1:])
files = sorted(p for p in source.rglob('*') if p.is_file())
for path in files:
    parts = path.relative_to(source).parts
    if any(p.lower() in ('auth', 'spool', '.whatsapp-transcriber', '.wwebjs_auth', '.env', 'inbox.sqlite3', 'sera-credential.dpapi') for p in parts):
        raise RuntimeError('User data must not be included in the release')
temporary = target.with_suffix('.partial.zip')
with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=1) as archive:
    for path in files:
        archive.write(path, str(path.relative_to(source)))
temporary.replace(target)
print(f'Packaged {len(files)} files, {target.stat().st_size} bytes.')
