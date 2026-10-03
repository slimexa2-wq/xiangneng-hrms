"""Generate the original local line icons used by the WeChat client (Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

out = Path(__file__).resolve().parents[1] / 'apps/miniapp/src/assets/recruitment'
out.mkdir(parents=True, exist_ok=True)
S = 6
for name in ['jobs', 'applications', 'referrals', 'profile', 'factory', 'warehouse', 'wrench', 'truck', 'search', 'location', 'company']:
    variants = [(False, '#8b98ac'), (True, '#246bfd')] if name in ['jobs', 'applications', 'referrals', 'profile'] else [(name in ['factory', 'warehouse', 'wrench', 'truck'], '#246bfd' if name in ['factory', 'warehouse', 'wrench', 'truck'] else '#8b98ac')]
    for active, color in variants:
        im = Image.new('RGBA', (24*S, 24*S))
        d = ImageDraw.Draw(im)
        def line(points):
            d.line([(int(x*S), int(y*S)) for x,y in points], fill=color, width=round(1.7*S), joint='curve')
        def box(bounds, radius=2):
            d.rounded_rectangle(tuple(int(v*S) for v in bounds), radius=radius*S, outline=color, width=round(1.7*S))
        def ellipse(bounds):
            d.ellipse(tuple(int(v*S) for v in bounds), outline=color, width=round(1.7*S))
        if name == 'jobs':
            box((3,7,21,20));box((8,3,16,8));line([(3,12),(12,15),(21,12)]);line([(12,13),(12,17)])
        elif name == 'applications':
            box((5,4,19,21));box((9,2,15,6));line([(9,11),(15,11)]);line([(9,15),(15,15)])
        elif name == 'referrals':
            box((3,8,21,12),1);box((5,12,19,21),1);line([(12,8),(12,21)]);ellipse((5,2,12,8));ellipse((12,2,19,8))
        elif name == 'profile':
            ellipse((8,3,16,11));d.arc((4*S,12*S,20*S,26*S),180,360,fill=color,width=round(1.7*S));line([(4,19),(4,21),(20,21),(20,19)])
        elif name == 'factory':
            line([(3,20),(3,10),(9,7),(9,11),(15,8),(15,12),(21,12),(21,20),(3,20)]);line([(18,12),(18,4),(21,4),(21,12)]);line([(7,15),(7,17)]);line([(12,15),(12,17)]);line([(17,15),(17,17)])
        elif name == 'warehouse':
            line([(3,10),(12,3),(21,10),(21,21),(3,21),(3,10)]);box((7,12,17,21),1);line([(7,16),(17,16)])
        elif name == 'wrench':
            line([(14,4),(10,7),(10,12),(3,19),(5,21),(12,14),(17,14),(21,10),(20,6),(16,10),(13,7),(14,4)])
        elif name == 'truck':
            box((2,5,14,17),1);line([(14,10),(18,10),(22,14),(22,18),(14,18)]);ellipse((5,15,10,21));ellipse((16,15,21,21))
        elif name == 'search':
            ellipse((3,3,17,17));line([(16,16),(21,21)])
        elif name == 'location':
            ellipse((5,2,19,16));line([(6,13),(12,22),(18,13)]);ellipse((9,6,15,12))
        elif name == 'company':
            box((5,3,19,21),1);line([(3,21),(21,21)]);line([(9,7),(10,7)]);line([(14,7),(15,7)]);line([(9,11),(10,11)]);line([(14,11),(15,11)]);box((10,16,14,21),0)
        im.resize((72,72), Image.Resampling.LANCZOS).save(out / f'{name}{"-active" if active else ""}.png', optimize=True)
print(f'Generated icons in {out}')
