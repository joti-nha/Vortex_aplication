"""Desenha os cenários em pixel art dos Nyan Cats famosos (img/nyan/cenas/<variante>.png, 160x90).

Uso: python3 tools/nyan-cenarios.py img/nyan/cenas
O site amplia com image-rendering: pixelated; o que se mexe (neve, estrelas piscando, ondas) fica no CSS."""
import sys, os, random
from PIL import Image, ImageDraw

W, H = 160, 90


def img():
    im = Image.new('RGB', (W, H))
    return im, ImageDraw.Draw(im)


def sky(d, cols, y0=0, y1=H):
    # céu em faixas, como nas artes oficiais
    n = len(cols)
    for i, c in enumerate(cols):
        d.rectangle([0, y0 + (y1 - y0) * i // n, W, y0 + (y1 - y0) * (i + 1) // n], fill=c)


def disc(d, cx, cy, r, c):
    for y in range(-r, r + 1):
        for x in range(-r, r + 1):
            if x * x + y * y <= r * r + r * 0.6:
                d.point((cx + x, cy + y), fill=c)


def sparkle(d, x, y, c='#ffffff', big=False):
    d.point((x, y), fill=c)
    if big:
        for k in (2, 3):
            for dx, dy in ((k, 0), (-k, 0), (0, k), (0, -k)):
                d.point((x + dx, y + dy), fill=c)


def ring(d, x, y, c='#ffffff'):
    for dx, dy in ((0, -3), (2, -2), (3, 0), (2, 2), (0, 3), (-2, 2), (-3, 0), (-2, -2)):
        d.point((x + dx, y + dy), fill=c)


def stars(d, n, y1, seed, c='#ffffff'):
    r = random.Random(seed)
    for _ in range(n):
        x, y = r.randrange(W), r.randrange(max(1, y1))
        if r.random() < 0.15:
            sparkle(d, x, y, c, True)
        elif r.random() < 0.12:
            ring(d, x, y, c)
        else:
            d.point((x, y), fill=c)


def hills(d, base, amp, period, phase, c):
    import math
    for x in range(W):
        top = int(base - amp * (0.5 + 0.5 * math.sin((x + phase) / period)))
        d.line([(x, top), (x, H)], fill=c)


def bricks(d, y0, c='#e52312', mortar='#541808', hi='#c77f0f'):
    d.rectangle([0, y0, W, H], fill=mortar)
    row = 0
    for y in range(y0 + 1, H, 6):
        off = 0 if row % 2 == 0 else 6
        for x in range(-off, W, 12):
            d.rectangle([x + 1, y, x + 11, y + 4], fill=c)
            d.line([(x + 1, y), (x + 11, y)], fill=hi)
        row += 1


def cactus(d, x, y, h, c='#4a7a14', dark='#2f5a0a'):
    d.rectangle([x, y - h, x + 3, y], fill=c)
    d.line([(x + 3, y - h), (x + 3, y)], fill=dark)
    d.rectangle([x - 4, y - h * 0.6, x - 2, y - h * 0.35], fill=c)
    d.rectangle([x - 4, y - h * 0.4, x, y - h * 0.35], fill=c)
    d.rectangle([x + 5, y - h * 0.75, x + 7, y - h * 0.5], fill=c)
    d.rectangle([x + 3, y - h * 0.55, x + 7, y - h * 0.5], fill=c)


def pine(d, x, y, h, c='#1f5a2a', lights=None, r=None):
    for k in range(h):
        w = (k * 5) // h + 1
        d.line([(x - w, y - h + k), (x + w, y - h + k)], fill=c)
        if lights and r and r.random() < 0.25:
            d.point((x + r.randint(-w, w), y - h + k), fill=r.choice(lights))
    d.rectangle([x - 1, y, x + 1, y + 2], fill='#4a2a1a')


def tomb(d, x, y, c='#7a8a8a', dark='#4a5a5a'):
    d.rectangle([x, y - 8, x + 6, y], fill=c)
    d.rectangle([x + 1, y - 9, x + 5, y - 9], fill=c)
    d.line([(x + 6, y - 8), (x + 6, y)], fill=dark)
    d.line([(x + 2, y - 6), (x + 4, y - 6)], fill=dark)
    d.line([(x + 3, y - 7), (x + 3, y - 4)], fill=dark)


def pumpkin(d, x, y):
    d.ellipse([x, y - 5, x + 8, y], fill='#ff7a00')
    d.line([(x + 4, y - 5), (x + 4, y)], fill='#c85a00')
    d.point((x + 4, y - 6), fill='#2a6a1a')
    d.point((x + 2, y - 3), fill='#2a1500'); d.point((x + 6, y - 3), fill='#2a1500')


def bat(d, x, y, c='#0a0010'):
    d.point((x, y), fill=c)
    d.line([(x - 3, y - 1), (x - 1, y)], fill=c)
    d.line([(x + 1, y), (x + 3, y - 1)], fill=c)


def scene_nyandoge():
    im, d = img()
    d.rectangle([0, 0, W, H], fill='#003366')
    stars(d, 26, 70, 1)
    bricks(d, 72)
    return im


def scene_cowboy():
    im, d = img()
    sky(d, ['#201269', '#2e1788', '#491a92', '#69278e', '#a8306e', '#d9445a', '#ff5a5a'], 0, 62)
    disc(d, 46, 62, 12, '#ffd36a')
    for x0, w in ((0, 40), (60, 30), (110, 50)):  # nuvens
        d.rectangle([x0, 58, x0 + w, 63], fill='#f4f4ef')
        d.rectangle([x0 + 6, 55, x0 + w - 8, 58], fill='#ebede8')
    d.rectangle([0, 63, W, H], fill='#e5a878')
    d.rectangle([0, 72, W, 80], fill='#d89c6a')
    d.rectangle([0, 81, W, H], fill='#d97353')
    for x in range(0, W, 9):
        d.point((x + 3, 67), fill='#c48168'); d.point((x + 6, 76), fill='#c88669')
    cactus(d, 120, 88, 18)
    cactus(d, 18, 86, 11)
    d.rectangle([128, 2, 128, 2], fill='#fff')
    ring(d, 138, 12)
    return im


def scene_xmas():
    im, d = img()
    sky(d, ['#06123a', '#0c1f52', '#14306a', '#1d4282'], 0, 64)
    stars(d, 20, 50, 3)
    disc(d, 130, 16, 7, '#f4f0d8')
    hills(d, 70, 6, 14, 0, '#dfe9f7')
    d.rectangle([0, 72, W, H], fill='#ffffff')
    r = random.Random(4)
    for x in (12, 34, 58, 96, 118, 146):
        pine(d, x, 74 + r.randint(-2, 2), r.randint(14, 22), lights=['#ff3a3a', '#ffd700', '#3aa8ff'], r=r)
    # casinha com janela acesa
    d.rectangle([70, 60, 88, 74], fill='#7a3a1a'); d.polygon([(68, 60), (79, 51), (90, 60)], fill='#ffffff')
    d.rectangle([74, 64, 78, 68], fill='#ffd27a'); d.rectangle([82, 66, 85, 74], fill='#3a1a0a')
    return im


def scene_pumpkin():
    im, d = img()
    sky(d, ['#12002b', '#2a0a4a', '#4a1a6a', '#7a2a6a', '#c8501a', '#ff7a1a'], 0, 70)
    disc(d, 118, 22, 13, '#ffd27a')
    disc(d, 114, 19, 3, '#f0b860')
    for x, y in ((40, 14), (52, 20), (64, 12), (90, 30)):
        bat(d, x, y)
    hills(d, 74, 8, 18, 4, '#140020')
    d.rectangle([0, 76, W, H], fill='#0a0010')
    # árvore seca
    d.line([(22, 76), (22, 48)], fill='#0a0010', width=2)
    for a, b in (((22, 58), (12, 50)), ((22, 54), (32, 44)), ((22, 50), (16, 42))):
        d.line([a, b], fill='#0a0010')
    for x in (40, 70, 100, 138):
        tomb(d, x, 82, '#3a2a4a', '#1a0a2a')
    for x in (55, 84, 120):
        pumpkin(d, x, 86)
    return im


def scene_pirate():
    im, d = img()
    sky(d, ['#020818', '#061430', '#0a2040', '#0e2c50'], 0, 58)
    stars(d, 30, 50, 6)
    disc(d, 32, 18, 8, '#f4f0d8')
    d.rectangle([0, 58, W, H], fill='#0a3a5a')
    for y in range(60, H, 5):
        for x in range((y * 7) % 10, W, 10):
            d.line([(x, y), (x + 4, y)], fill='#2a6a8a')
    d.line([(32, 60), (32, 80)], fill='#c8c4a8')  # reflexo da lua
    # navio
    d.polygon([(92, 58), (136, 58), (130, 66), (98, 66)], fill='#4a2a1a')
    d.line([(92, 58), (136, 58)], fill='#7a4a2a')
    d.line([(114, 58), (114, 28)], fill='#3a1a0a'); d.line([(102, 58), (102, 36)], fill='#3a1a0a')
    d.polygon([(104, 32), (124, 32), (122, 52), (106, 52)], fill='#e8e0c8')
    d.polygon([(103, 38), (112, 38), (111, 52), (104, 52)], fill='#d8d0b8')
    d.rectangle([110, 22, 118, 27], fill='#111'); d.point((114, 24), fill='#fff')  # bandeira de caveira
    return im


def scene_tacnayn():
    im, d = img()
    sky(d, ['#0a0000', '#1a0202', '#2a0303', '#4a0805', '#6a1006'], 0, 66)
    r = random.Random(8)
    for _ in range(40):
        d.point((r.randrange(W), r.randrange(66)), fill=r.choice(['#ff7a1a', '#ffb02a', '#ff4a1a']))
    hills(d, 66, 14, 9, 2, '#1a0a08')
    hills(d, 74, 8, 6, 9, '#2a120c')
    d.rectangle([0, 78, W, H], fill='#ff4a0a')
    for y in range(79, H, 3):
        for x in range((y * 5) % 14, W, 14):
            d.line([(x, y), (x + 5, y)], fill='#ffb02a')
    for x in (30, 90, 140):  # caveiras na beira
        d.rectangle([x, 72, x + 5, 76], fill='#e8e0c8'); d.point((x + 1, 74), fill='#111'); d.point((x + 4, 74), fill='#111')
    return im


def scene_paddy():
    im, d = img()
    sky(d, ['#4aa8f0', '#5ab8ff', '#7ac8ff', '#a0d8ff'], 0, 70)
    cols = ['#ff2a2a', '#ff9a2a', '#ffee2a', '#33cc4a', '#2aa8ff', '#7a2aff']
    for i, c in enumerate(cols):
        rr = 52 - i * 3
        d.arc([80 - rr, 72 - rr, 80 + rr, 72 + rr], 180, 360, fill=c, width=3)
    for x0 in (10, 120):
        d.ellipse([x0, 10, x0 + 24, 18], fill='#ffffff'); d.ellipse([x0 + 6, 6, x0 + 18, 14], fill='#ffffff')
    hills(d, 70, 10, 16, 0, '#3aa04a')
    hills(d, 80, 6, 11, 20, '#2a8a3a')
    # pote de ouro no fim do arco-íris
    d.rectangle([124, 72, 134, 80], fill='#222'); d.rectangle([123, 70, 135, 72], fill='#333')
    for x in range(125, 134, 2):
        d.point((x, 69), fill='#ffd700')
    r = random.Random(9)
    for _ in range(14):
        x, y = r.randrange(W), r.randrange(78, H)
        d.point((x, y), fill='#7ae07a'); d.point((x + 1, y), fill='#7ae07a'); d.point((x, y - 1), fill='#7ae07a')
    return im


def scene_mexinyan():
    im, d = img()
    sky(d, ['#2aa8ff', '#5ab8ff', '#8ad0ff', '#c8e8ff'], 0, 60)
    # varais de papel picado
    cols = ['#ff2a8a', '#ffee2a', '#33cc4a', '#2aa8ff', '#ff7a1a', '#b02aff']
    for row, y in enumerate((8, 22)):
        d.line([(0, y), (W, y + 3)], fill='#555')
        for i, x in enumerate(range(4 + row * 5, W, 12)):
            yy = y + (x * 3) // W
            d.rectangle([x, yy + 1, x + 7, yy + 8], fill=cols[(i + row) % len(cols)])
            d.point((x + 3, yy + 4), fill='#fff')
    # casas da praça
    for x0, w, h, c in ((0, 40, 26, '#f0c060'), (40, 34, 20, '#e87a5a'), (112, 48, 28, '#7ac8a0')):
        d.rectangle([x0, 60 - h, x0 + w, 60], fill=c)
        for x in range(x0 + 5, x0 + w - 4, 10):
            d.rectangle([x, 60 - h + 6, x + 4, 60 - h + 12], fill='#5a3a2a')
    d.rectangle([0, 60, W, H], fill='#e0b070')
    for x in range(0, W, 8):
        d.line([(x, 60), (x, H)], fill='#d0a060')
    cactus(d, 90, 82, 16, '#3a8a2a', '#2a6a1a')
    return im


def scene_zombie():
    im, d = img()
    sky(d, ['#020a04', '#04120a', '#081a0e', '#0e2414'], 0, 66)
    disc(d, 124, 18, 10, '#b8f0a0')
    stars(d, 14, 50, 11, '#9ad09a')
    hills(d, 68, 6, 15, 0, '#0a1a0a')
    d.rectangle([0, 70, W, H], fill='#142a14')
    d.line([(36, 70), (36, 44)], fill='#050a05', width=2)
    for a, b in (((36, 56), (26, 48)), ((36, 52), (46, 42))):
        d.line([a, b], fill='#050a05')
    for x in (12, 52, 78, 104, 140):
        tomb(d, x, 80)
    d.rectangle([60, 82, 64, 86], fill='#6a9a5a')  # mão saindo da terra
    d.point((60, 81), fill='#6a9a5a'); d.point((62, 80), fill='#6a9a5a'); d.point((64, 81), fill='#6a9a5a')
    return im


def scene_surfing():
    im, d = img()
    sky(d, ['#2a8ae8', '#3aa0f0', '#5ab8ff', '#8ad0ff'], 0, 52)
    disc(d, 128, 14, 8, '#fff36a')
    for x0 in (14, 70):
        d.ellipse([x0, 12, x0 + 22, 19], fill='#ffffff'); d.ellipse([x0 + 5, 8, x0 + 16, 15], fill='#ffffff')
    d.rectangle([0, 52, W, 76], fill='#1a6ac8')
    for y in range(54, 76, 4):
        for x in range((y * 9) % 12, W, 12):
            d.line([(x, y), (x + 5, y)], fill='#5aa8ff')
    # onda grande
    d.pieslice([90, 40, 150, 100], 180, 270, fill='#2a8ae8')
    d.arc([90, 40, 150, 100], 180, 270, fill='#ffffff', width=2)
    d.rectangle([0, 76, W, H], fill='#f4d9a0')
    # coqueiro
    d.line([(20, 86), (26, 46)], fill='#8a5a2a', width=3)
    for dx, dy in ((-14, 6), (-10, -4), (12, -4), (14, 6), (0, -8)):
        d.line([(26, 46), (26 + dx, 46 + dy)], fill='#2a8a3a', width=2)
    return im


def scene_vday():
    im, d = img()
    sky(d, ['#5a0a3a', '#8a1a5a', '#c8306e', '#ff6a9a', '#ffaacc'], 0, 72)
    def heart(x, y, c, s=1):
        for dy, row in enumerate(['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...']):
            for dx, ch in enumerate(row):
                if ch == '#':
                    d.rectangle([x + dx * s, y + dy * s, x + dx * s + s - 1, y + dy * s + s - 1], fill=c)
    heart(68, 14, '#ff2a6a', 3)
    for x, y in ((20, 20), (130, 12), (40, 44), (118, 46)):
        heart(x, y, '#ffd0e0')
    hills(d, 74, 6, 14, 3, '#3a8a3a')
    d.rectangle([0, 78, W, H], fill='#2a7a2a')
    for x in range(6, W, 14):  # rosas
        d.rectangle([x, 80, x + 2, 82], fill='#e8104a'); d.line([(x + 1, 83), (x + 1, 87)], fill='#1a5a1a')
    return im


def scene_newyear():
    im, d = img()
    sky(d, ['#02021a', '#06062a', '#0a0a3a', '#10104a'], 0, 64)
    stars(d, 16, 40, 13)
    r = random.Random(14)
    for cx, cy, c in ((30, 18, '#ffd700'), (80, 12, '#ff2a6a'), (126, 22, '#2affd0'), (56, 34, '#ffffff')):
        for k in range(12):
            import math
            a = k * math.pi / 6
            for t in (4, 6, 8):
                d.point((cx + int(math.cos(a) * t), cy + int(math.sin(a) * t)), fill=c)
    # prédios
    x = 0
    while x < W:
        w, h = r.randint(10, 18), r.randint(16, 36)
        d.rectangle([x, H - h, x + w, H], fill='#0a0a14')
        for wy in range(H - h + 3, H - 2, 4):
            for wx in range(x + 2, x + w - 1, 3):
                if r.random() < 0.45:
                    d.point((wx, wy), fill='#ffd27a')
        x += w + 1
    return im


def scene_easter():
    im, d = img()
    sky(d, ['#8ad0ff', '#a0daff', '#c0e8ff', '#e0f4ff'], 0, 64)
    for x0 in (20, 104):
        d.ellipse([x0, 10, x0 + 26, 18], fill='#ffffff'); d.ellipse([x0 + 7, 6, x0 + 19, 14], fill='#ffffff')
    hills(d, 66, 8, 18, 0, '#7ad87a')
    d.rectangle([0, 70, W, H], fill='#5ac85a')
    r = random.Random(15)
    cols = ['#ff84bd', '#ffad31', '#ffd684', '#7bceff', '#9c42a5']
    for x in range(8, W, 20):  # ovos
        y = r.randint(76, 84)
        c = r.choice(cols)
        d.ellipse([x, y - 6, x + 5, y], fill=c)
        d.line([(x, y - 3), (x + 5, y - 3)], fill='#ffffff')
    for _ in range(18):  # florzinhas
        x, y = r.randrange(W), r.randrange(72, H)
        d.point((x, y), fill='#ffffff'); d.point((x + 1, y), fill='#ffee2a')
    return im


def scene_star():
    im, d = img()
    sky(d, ['#02021a', '#06103a', '#0a1a4a', '#122a6a'], 0, 70)
    stars(d, 40, 66, 17, '#fff6a0')
    disc(d, 30, 20, 9, '#fff6a0'); disc(d, 34, 17, 8, '#06103a')  # lua minguante
    hills(d, 72, 6, 20, 0, '#1a3a5a')
    d.rectangle([0, 76, W, H], fill='#14304a')
    for x in range(0, W, 10):  # cerca
        d.rectangle([x, 70, x + 1, 80], fill='#6a5a4a')
    d.line([(0, 73), (W, 73)], fill='#6a5a4a'); d.line([(0, 77), (W, 77)], fill='#6a5a4a')
    return im


SCENES = {k[6:]: v for k, v in globals().items() if k.startswith('scene_')}

if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for name, fn in SCENES.items():
        fn().save(os.path.join(out, name + '.png'), optimize=True)
        print(name)
