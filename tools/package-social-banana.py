"""Build the customer ZIP from the active extension, excluding developer/private files."""
import argparse, hashlib, json, re, zipfile
from pathlib import Path

p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--output',required=True)
a=p.parse_args();root=Path(a.source).resolve();out=Path(a.output).resolve()
manifest=json.loads((root/'manifest.json').read_text(encoding='utf8'))
files=[root/'manifest.json',root/'LEEME-INSTALAR.txt']
files += [f for f in root.iterdir() if f.is_file() and f.suffix in ('.js','.html','.css') and not f.name.startswith('test-')]
files += list((root/'assets').glob('*.png'))
for f in files:
    if f.suffix in ('.js','.html','.json') and re.search(r'(?:sk-proj-|[sr]k_(?:live|test)_|whsec_)[a-zA-Z0-9]{12,}',f.read_text(encoding='utf8')):
        raise RuntimeError('Possible secret in distribution: '+f.name)
required=[manifest['background']['service_worker']]
for script in manifest['content_scripts']: required += script['js']
for name in required:
    if root/name not in files: raise RuntimeError('Missing runtime file: '+name)
out.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
    for f in sorted(files):z.write(f,f.relative_to(root).as_posix())
print(json.dumps({'version':manifest['version'],'archive':str(out),'files':len(files),'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}))
