"""One-time menu presentation migration; retain every existing menu item action."""
from pathlib import Path
import collections
import re

path = Path(__file__).resolve().parents[1] / 'gtk2_ardour' / 'ardour.menus.in'
text = path.read_text(encoding='utf-8')
if "<menu name='PhaedraMIDI'" in text:
    raise SystemExit('Menu presentation already migrated')
boundary = text.index('  </menubar>')
head, tail = text[:boundary], text[boundary:]
blocks = re.findall(r'^    <menu\b.*?^    </menu>', head, re.M | re.S)
assert len(blocks) == 8, 'Unexpected top-level menu structure'
session, transport, edit, clips, tracks, view, settings, help_menu = blocks
midi = re.search(r"^      <menu action='RegionMenuMIDI'>.*?^      </menu>", clips, re.M | re.S)
assert midi
midi_menu = '\n'.join(line[2:] if line.startswith('  ') else line for line in midi.group().splitlines())
midi_menu = midi_menu.replace("<menu action='RegionMenuMIDI'>", "<menu name='PhaedraMIDI' action='PhaedraMidiMenu'>", 1)
clips = clips[:midi.start()] + clips[midi.end():]
edit = edit[:-len('    </menu>')] + '\n' + '\n'.join('  ' + line for line in transport.splitlines()) + '\n    </menu>'
rebuilt = '\n'.join([session, edit, tracks, clips, midi_menu, view, settings, help_menu])
start = head.index(blocks[0])
finish = head.index(blocks[-1]) + len(blocks[-1])
result = '\n'.join(line.rstrip() for line in (head[:start] + rebuilt + head[finish:] + tail).splitlines()) + '\n'
def items(value):
    return collections.Counter(re.findall(r'<menuitem\s+action=[\'"]([^\'"]+)', value))
assert items(result) == items(text), 'Migration changed available menu actions'
path.write_text(result, encoding='utf-8')
print(f'Reorganized menus; all {sum(items(text).values())} menu item references preserved.')
