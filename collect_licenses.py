"""Collect dependency license texts and version inventories for the binary distribution."""
import importlib.metadata as md
import json, sys, urllib.request
from pathlib import Path
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
inventory=[]
for dist in md.distributions():
 name=dist.metadata.get('Name','unknown');folder=out/'python'/name;folder.mkdir(parents=True,exist_ok=True)
 inventory.append({'ecosystem':'python','name':name,'version':dist.version,'license':dist.metadata.get('License-Expression') or dist.metadata.get('License','')})
 for item in dist.files or []:
  if any(term in Path(str(item)).name.lower() for term in ('license','copying','notice')):
   src=Path(dist.locate_file(item))
   if src.is_file(): (folder/str(item).replace('/','_').replace('\\','_').replace('..','_')).write_bytes(src.read_bytes())
node=out.parent/'receiver'/'node_modules'
for manifest in node.rglob('package.json'):
 if 'test' in manifest.parts or 'fixtures' in manifest.parts: continue
 try: package=json.loads(manifest.read_text(encoding='utf-8'))
 except (ValueError,UnicodeError): continue
 if not package.get('name') or not package.get('version'):continue
 relative=manifest.parent.relative_to(node)
 inventory.append({'ecosystem':'npm','name':package['name'],'version':package['version'],'license':package.get('license',''),'path':str(relative)})
 target=out/'npm'/relative;target.mkdir(parents=True,exist_ok=True)
 for src in manifest.parent.iterdir():
  if src.is_file() and any(term in src.name.lower() for term in ('license','copying','notice')): (target/src.name).write_bytes(src.read_bytes())
links={'NODE-LICENSE.txt':'https://raw.githubusercontent.com/nodejs/node/v24.13.0/LICENSE','WHISPER-MODEL-AND-CODE-LICENSE.txt':'https://raw.githubusercontent.com/openai/whisper/v20250625/LICENSE','PYTHON-LICENSE.txt':f'https://raw.githubusercontent.com/python/cpython/v{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}/LICENSE','TCL-LICENSE.txt':'https://raw.githubusercontent.com/tcltk/tcl/core-8-6-branch/license.terms','TK-LICENSE.txt':'https://raw.githubusercontent.com/tcltk/tk/core-8-6-branch/license.terms'}
for name,url in links.items():
 with urllib.request.urlopen(url,timeout=45) as response:(out/name).write_bytes(response.read())
(out/'inventory.json').write_text(json.dumps(inventory,indent=2),encoding='utf-8')
(out/'README.txt').write_text('Owned Sera Relay source: MIT. Third-party components retain their respective licenses. Whisper model weights and code: MIT (https://github.com/openai/whisper#license). FFmpeg is not included. Inventory lists build environment distributions; some listed build tools are not shipped. Full dependency notices accompany this distribution.',encoding='utf-8')
