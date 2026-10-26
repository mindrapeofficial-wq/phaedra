from pathlib import Path
import base64
import re

root=Path(__file__).resolve().parents[1]
skin=root/'resources/data/skins/prisma.surge-skin'
source_skin=root/'resources/data/skins/dark-mode.surge-skin'
skin.mkdir(parents=True,exist_ok=True)
(skin/'SVG').mkdir(parents=True,exist_ok=True)
xml=skin/'skin.xml'
s=(source_skin/'skin.xml').read_text(encoding='utf-8')
s=s.replace('name="Surge Dark" author="Surge Synth Team" authorURL="https://surge-synth-team.org/"','name="PRISMA" category="Phaedra" author="Phaedra" authorURL=""')
palette={
 '#FFFFFF':'#F6EEDB','#000000':'#0C0713','#050505':'#09050F','#242424':'#20142A',
 '#0F0F0F':'#120B1A','#808080':'#A99AAF','#B4B4B4':'#D2C3D9','#4f4f4f':'#65536F',
 '#3c3c3c':'#40304C','#202020':'#1A1024','#131313':'#140B1D','#005CB6':'#8545BB',
 '#005CB680':'#8545BB80','#ff9300':'#DBB363','#151515':'#160D20','#2E86FE':'#E0B964',
 '#2E86FE60':'#E0B96460','#399dff':'#B96BE6','#ff9000':'#DBB363','#525252':'#584663',
 '#2D2D2D':'#25162F','#A0A0A0':'#A594AC','#303030':'#2C1C38','#737373':'#847489',
 '#A05000':'#A07C42','#40ADFF':'#F0D28A','#E5E5E5':'#F5E8F1','#E3E3E3':'#E7D9E9',
 '#043367':'#3C1C60','#0B58A6':'#7A3FAD','#A0B5FF':'#D7B6F1','#EEEEEE':'#F1E7E9',
 '#242524':'#22182D','#1C1C1C':'#1A1124','#28282A':'#281934','#494949':'#594568',
 '#959595':'#B09FAF',
 '#2471DB':'#8D4CC2','#001E3C':'#27153F','#0269F7':'#B16DE0','#2D86FE':'#DDB768',
 '#1A3460':'#3B2457','#1D8ADC':'#A968D2','#2F5DAA':'#744198','#4487F6':'#B777E2',
 '#0090FF':'#B96BE6','#A3A3FF':'#D6AEF0','#C0EBFF':'#EAD2F3','#9DC8DC':'#C6AED2','#A3C2D9':'#C8AED5' 
}
pattern=re.compile('|'.join(re.escape(c) for c in sorted(palette,key=len,reverse=True)),re.I)
# Build a lower-case lookup once; preserving alpha and XML references.
lookup={k.lower():v for k,v in palette.items()}
def recolor(source):return pattern.sub(lambda m:lookup[m.group(0).lower()],source)
s=recolor(s)
s=s.replace('<control ui_identifier="controls.surge_menu" x="850"/>',
'''<control ui_identifier="controls.surge_menu" x="850"/>

        <!-- Scene controls in the free right-hand margin, below the FX grid. -->
        <control ui_identifier="global.active_scene" x="758" y="288" w="40" h="42"/>
        <control ui_identifier="global.scene_mode" x="807" y="288" w="40" h="42"/>
        <control ui_identifier="scene.splitpoint" x="857" y="288" w="43" h="14"/>
        <control ui_identifier="scene.polylimit" x="857" y="309" w="43" h="14"/>''')
xml.write_text(s,encoding='utf-8')
logo_data=base64.b64encode((root/'resources/prisma/Prisma-logo.png').read_bytes()).decode('ascii')
for original in (source_skin/'SVG').glob('*.svg'):
 svg=skin/'SVG'/original.name
 s=recolor(original.read_text(encoding='utf-8'))
 if svg.name=='bmp00102.svg':
  brand=f'''<defs><linearGradient id="prisma-brand" x1="0" y1="0" x2="148" y2="56" gradientUnits="userSpaceOnUse"><stop stop-color="#1A1028"/><stop offset="1" stop-color="#2B1841"/></linearGradient></defs><g id="prisma-gold-rules" stroke="#C8A364" stroke-width="1" opacity="0.65"><path d="M148 77.5H748M148 211.5H748M0 398.5H748"/></g><g id="prisma-branding"><rect width="148" height="56" fill="url(#prisma-brand)"/><image x="757" y="431" width="140" height="48" xlink:href="data:image/png;base64,{logo_data}"/><path d="M0 55.5H148" stroke="#6F4E7B"/></g>'''
  s=s.replace('</svg>',brand+'</svg>')
 svg.write_text(s,encoding='utf-8')
print('skin',skin,'svg',len(list((skin/'SVG').glob('*.svg'))))










