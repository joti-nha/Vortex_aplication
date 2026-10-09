# Gera os GIFs dos Nyan Cats (img/nyan/) a partir das paletas de NYAN_VARIANTS no app.js.
# Uso: node tools/nyan-paletas.js app.js > /tmp/pal.json && python3 tools/nyan-gifs.py img/nyan /tmp/pal.json  (precisa do Pillow)
import json, sys, os
from PIL import Image, ImageDraw
pal = json.load(open(sys.argv[2] if len(sys.argv) > 2 else "pal.json"))
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
def hexc(c):
    c = c.lstrip('#')
    if len(c) == 3: c = ''.join(x*2 for x in c)
    return tuple(int(c[i:i+2], 16) for i in (0, 2, 4)) + (255,)
ACC = {'xmas': 'santa', 'bday': 'party', 'newyear': 'party', 'fiesta': 'party', 'mexinyan': 'sombrero', 'pirate': 'band', 'nyaninja': 'ninja',
       'daft': 'shades', 'smooth': 'shades', 'skrillex': 'shades', 'wiki:mrs': 'bow', 'mummy': 'wrap', 'jazz': 'hat', 'elevator': 'hat', 'wiki:cleo': 'band'}
W, H = 40, 26
for vid, p in pal:
    c = dict(fur='#9b9b9b', crust='#f6d39a', frost='#ff99cc', dot='#ff3d8b', cheek='#ff99cc'); c.update({k: v for k, v in p.items() if isinstance(v, str)})
    C = {k: hexc(v) for k, v in c.items()}
    K = (0, 0, 0, 255); Wt = (255, 255, 255, 255)
    frames = []
    for f in range(6):
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
        R = lambda x, y, w, h, col: d.rectangle([x + 3, y + 3, x + 3 + w - 1, y + 3 + h - 1], fill=col)
        by = 1 if f in (1, 2) else 0           # o corpo sobe e desce
        lx = 1 if f in (1, 2, 3) else 0        # as patas vão e voltam
        ty = [9, 10, 11, 10, 9, 8][f]          # o rabo balança
        R(0, ty + by, 5, 3, K); R(1, ty + by + 0, 4, 2, C['fur'])
        for x0, y0 in ((5, 17), (10, 18), (19, 18), (24, 17)):
            R(x0 + lx - 1, y0 + by, 4, 3, K); R(x0 + lx, y0 + by, 2, 2, C['fur'])
        R(4, 1 + by, 21, 17, K); R(5, 2 + by, 19, 15, C['crust']); R(7, 4 + by, 15, 11, C['frost'])
        for x0, y0 in ((9, 6), (13, 5), (17, 7), (11, 10), (15, 12), (19, 11), (9, 13)): R(x0, y0 + by, 1, 1, C['dot'])
        hx = 1 if f in (2, 3) else 0; hy = by
        R(16 + hx, 4 + hy, 3, 3, K); R(26 + hx, 4 + hy, 3, 3, K); R(17 + hx, 5 + hy, 2, 2, C['fur']); R(27 + hx, 5 + hy, 2, 2, C['fur'])
        R(16 + hx, 6 + hy, 16, 12, K); R(17 + hx, 7 + hy, 14, 10, C['fur'])
        R(20 + hx, 10 + hy, 2, 2, K); R(26 + hx, 10 + hy, 2, 2, K); R(20 + hx, 10 + hy, 1, 1, Wt); R(26 + hx, 10 + hy, 1, 1, Wt)
        R(18 + hx, 13 + hy, 2, 2, C['cheek']); R(28 + hx, 13 + hy, 2, 2, C['cheek']); R(22 + hx, 14 + hy, 5, 1, K)
        a = ACC.get(vid)
        if a == 'santa': R(19 + hx, 0 + hy, 10, 4, hexc('#e32a2a')); R(18 + hx, 3 + hy, 12, 2, Wt); R(29 + hx, 0 + hy, 2, 2, Wt)
        elif a == 'party': R(22 + hx, -2 + hy, 4, 6, hexc(c['dot'])); R(23 + hx, -3 + hy, 2, 2, Wt)
        elif a == 'hat': R(19 + hx, 2 + hy, 12, 2, K); R(21 + hx, -1 + hy, 8, 4, K)
        elif a == 'sombrero': R(15 + hx, 3 + hy, 18, 2, hexc('#d9a050')); R(20 + hx, -1 + hy, 8, 5, hexc('#d9a050')); R(20 + hx, 2 + hy, 8, 1, hexc('#e32a2a'))
        elif a == 'band': R(17 + hx, 7 + hy, 14, 2, hexc('#e32a2a' if vid == 'pirate' else '#2a6ac8'))
        elif a == 'ninja': R(17 + hx, 7 + hy, 14, 3, K); R(17 + hx, 12 + hy, 14, 5, K); R(31 + hx, 8 + hy, 3, 1, hexc('#e32a2a'))
        elif a == 'shades': R(19 + hx, 9 + hy, 11, 3, K); R(20 + hx, 10 + hy, 1, 1, hexc('#6affff'))
        elif a == 'bow': R(27 + hx, 2 + hy, 5, 3, hexc('#ff2a6a')); R(29 + hx, 3 + hy, 1, 1, K)
        elif a == 'wrap':
            for yy in (8, 12, 15): R(17 + hx, yy + hy, 14, 1, hexc('#d9cfae'))
        frames.append(im)
    name = vid.replace(':', '-')
    frames[0].save(os.path.join(out, name + '.gif'), save_all=True, append_images=frames[1:], duration=70, loop=0, disposal=2, transparency=0, optimize=False)
print(len(pal), 'gifs')
