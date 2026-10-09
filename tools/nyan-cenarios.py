"""Desenha os cenários em pixel art dos Nyan Cats famosos (img/nyan/cenas/<variante>.png, 640x360).

Uso: python3 tools/nyan-cenarios.py img/nyan/cenas
Segue o jeito dos cenários oficiais do nyan.cat: céu em faixas com bordas em degrau, nuvens com sombra embaixo,
brilhos em cruz e em anel. A composição é desenhada numa grade de 320x180 (cada ponto vira 2x2) e os detalhes finos
(pontilhado entre as faixas do céu, brilho da lua, textura de tijolo, areia, grama, janelas, fagulhas) vão na grade
cheia de 640x360. O site amplia com image-rendering: pixelated; o que se mexe (neve, estrelas piscando, brasas,
corações, névoa) fica no CSS."""
import sys, os, math, random
from PIL import Image, ImageDraw

W, H = 320, 180  # grade da composição
NW, NH = W * 2, H * 2  # grade fina, a da imagem salva


class Draw2:
    """ImageDraw em que cada ponto da grade de 320x180 vira um bloco de 2x2; .raw desenha na grade fina."""

    def __init__(self, im):
        self.raw = ImageDraw.Draw(im)

    @staticmethod
    def _box(b):
        x0, y0, x1, y1 = b
        return [x0 * 2, y0 * 2, x1 * 2 + 1, y1 * 2 + 1]

    def rectangle(self, b, fill=None, outline=None):
        self.raw.rectangle(self._box(b), fill=fill, outline=outline, width=2 if outline else 1)

    def point(self, p, fill=None):
        x, y = p
        self.raw.rectangle([x * 2, y * 2, x * 2 + 1, y * 2 + 1], fill=fill)

    def line(self, pts, fill=None, width=1):
        self.raw.line([(x * 2 + 1, y * 2 + 1) for x, y in pts], fill=fill, width=width * 2)

    def polygon(self, pts, fill=None):
        self.raw.polygon([(x * 2, y * 2) for x, y in pts], fill=fill)

    def ellipse(self, b, fill=None):
        self.raw.ellipse(self._box(b), fill=fill)

    def arc(self, b, a0, a1, fill=None, width=1):
        self.raw.arc(self._box(b), a0, a1, fill=fill, width=width * 2)

    def pieslice(self, b, a0, a1, fill=None):
        self.raw.pieslice(self._box(b), a0, a1, fill=fill)


def img():
    im = Image.new('RGB', (NW, NH))
    return im, Draw2(im)


# ---------- detalhes na grade fina (coordenadas de 640x360) ----------

def fpx(d, x, y, c):
    if 0 <= x < NW and 0 <= y < NH:
        d.raw.point((x, y), fill=c)


def dither(d, x0, y0, x1, y1, c, level=2):
    """Pontilhado ordenado: level 1 = 25%, 2 = 50%, 3 = 75% dos pixels com a cor c."""
    for y in range(max(0, y0), min(NH, y1 + 1)):
        for x in range(max(0, x0), min(NW, x1 + 1)):
            if level == 2:
                on = (x + y) % 2 == 0
            elif level == 1:
                on = x % 2 == 0 and y % 2 == 0
            else:
                on = not (x % 2 == 1 and y % 2 == 1)
            if on:
                d.raw.point((x, y), fill=c)


def glow(d, cx, cy, r0, r1, c, bands=3, ymax=NH):
    """Halo pontilhado em volta de um astro (cx, cy, raios na grade de 320x180): mais denso perto, some longe."""
    cx, cy, r0, r1 = cx * 2 + 1, cy * 2 + 1, r0 * 2, r1 * 2
    for y in range(cy - r1, min(ymax, cy + r1 + 1)):
        for x in range(cx - r1, cx + r1 + 1):
            t = math.hypot(x - cx, y - cy)
            if r0 < t <= r1:
                k = int((t - r0) / (r1 - r0 + 1e-9) * bands)
                on = ((x + y) % 2 == 0) if k == 0 else (x % 2 == 0 and y % 2 == 0) if k == 1 else (x % 4 == 0 and y % 4 == (x // 4) % 2 * 2)
                if on:
                    fpx(d, x, y, c)


def fine_stars(d, n, y1, seed, cols=('#ffffff', '#c8d8ff', '#ffe8b0')):
    """Estrelinhas de 1 pixel fino, entre as maiores."""
    r = random.Random(seed * 31 + 7)
    for _ in range(n):
        x, y = r.randrange(NW), r.randrange(max(1, y1 * 2))
        c = r.choice(cols)
        fpx(d, x, y, c)
        if r.random() < 0.12:  # algumas com brilho em cruz fininho
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                fpx(d, x + dx, y + dy, c)


def blades(d, y0, y1, n, cols, seed, x0=0, x1=None):
    """Tufos de grama de 1 pixel fino entre as linhas y0 e y1 (grade de 320x180)."""
    r = random.Random(seed * 17 + 3)
    x1 = NW if x1 is None else x1 * 2
    for _ in range(n):
        x, y = r.randrange(x0 * 2, x1), r.randrange(y0 * 2, y1 * 2)
        c = r.choice(cols)
        for k in range(r.randint(2, 4)):
            fpx(d, x + (k == 3) * r.choice((-1, 1)), y - k, c)
        if r.random() < 0.5:
            fpx(d, x - 1, y - 1, c)
            fpx(d, x + 1, y - 2, c)


def grains(d, y0, y1, n, cols, seed, x0=0, x1=None):
    """Grãos e pedrinhas de 1 a 2 pixels finos (areia, terra, neve)."""
    r = random.Random(seed * 13 + 5)
    x1 = NW if x1 is None else x1 * 2
    for _ in range(n):
        x, y = r.randrange(x0 * 2, x1), r.randrange(y0 * 2, y1 * 2)
        c = r.choice(cols)
        fpx(d, x, y, c)
        if r.random() < 0.3:
            fpx(d, x + 1, y, c)


def sparkle(d, x, y, c='#ffffff'):
    """Brilho fino em cruz (grade de 640x360)."""
    fpx(d, x, y, c)
    for k in (1, 2):
        for dx, dy in ((k, 0), (-k, 0), (0, k), (0, -k)):
            fpx(d, x + dx, y + dy, c)


def sky(d, cols, y0=0, y1=H, step=8, jag=2, seed=0):
    """Céu em faixas; a borda entre duas faixas sobe e desce em degraus, como nas artes oficiais,
    com um pontilhado fino de 4 linhas na emenda para a passagem de uma cor à outra ficar suave."""
    r = random.Random(seed)
    n = len(cols)
    d.rectangle([0, y0, W, y1], fill=cols[-1])
    edges = []
    for i in range(n - 1, -1, -1):
        bottom = y0 + (y1 - y0) * (i + 1) // n
        for x in range(0, W, step):
            off = r.choice((-jag, 0, 0, jag)) if i < n - 1 else 0
            d.rectangle([x, y0, x + step - 1, bottom + off], fill=cols[i])
            if i < n - 1:
                edges.append((x, bottom + off, cols[i], cols[i + 1]))
    for x, b, up, down in edges:  # as faixas de cima pintam por cima das de baixo; o pontilhado vem por último
        nb, xa, xb = (b + 1) * 2, x * 2, (x + step) * 2 - 1
        for y in range(nb - 2, nb + 2):
            for xx in range(xa, xb + 1):
                k = y - (nb - 2)
                if (k == 0 and xx % 4 == (y // 2 % 2) * 2) or (k == 1 and (xx + y) % 2 == 0):
                    fpx(d, xx, y, down)
                elif (k == 2 and (xx + y) % 2 == 1) or (k == 3 and xx % 4 == (y // 2 % 2) * 2 + 1):
                    fpx(d, xx, y, up)


def disc(d, cx, cy, r, c):
    for y in range(-r, r + 1):
        for x in range(-r, r + 1):
            if x * x + y * y <= r * r + r * 0.6:
                d.point((cx + x, cy + y), fill=c)


def moon(d, cx, cy, r, base='#e8eef0', spots=('#9fd8f4', '#6ac0ea'), outline='#000000', seed=1):
    disc(d, cx, cy, r + 2, outline)
    disc(d, cx, cy, r, base)
    rr = random.Random(seed)
    for _ in range(r * 3):
        a, t = rr.random() * 6.283, rr.random() * (r - 3)
        x, y = int(cx + math.cos(a) * t), int(cy + math.sin(a) * t)
        c = rr.choice(spots)
        d.rectangle([x, y, x + rr.randint(1, 3), y + rr.randint(0, 2)], fill=c)
    # na grade fina: crateras com borda clara embaixo e sombra em cima, e a beira iluminada do lado esquerdo
    ncx, ncy, nr = cx * 2 + 1, cy * 2 + 1, r * 2
    for _ in range(max(3, r // 3)):
        a, t = rr.random() * 6.283, rr.random() * (nr - 8)
        x, y, k = int(ncx + math.cos(a) * t), int(ncy + math.sin(a) * t), rr.randint(2, 4)
        for dx in range(-k, k + 1):
            fpx(d, x + dx, y - k, spots[-1])
            fpx(d, x + dx, y + k, '#ffffff')
    for y in range(ncy - nr, ncy + nr + 1):
        for x in range(ncx - nr, ncx):
            t = math.hypot(x - ncx, y - ncy)
            if nr - 2.5 < t <= nr - 0.5 and x < ncx - nr * 0.3:
                fpx(d, x, y, '#ffffff')


def cross(d, x, y, c='#ffffff', s=2):
    d.rectangle([x, y, x + s - 1, y + s - 1], fill=c)
    for k in (2, 3):
        for dx, dy in ((k, 0), (-k, 0), (0, k), (0, -k)):
            d.rectangle([x + dx * s, y + dy * s, x + dx * s + s - 1, y + dy * s + s - 1], fill=c)


def ring(d, x, y, c='#ffffff', s=2):
    for dx, dy in ((0, -3), (2, -2), (3, 0), (2, 2), (0, 3), (-2, 2), (-3, 0), (-2, -2)):
        d.rectangle([x + dx * s, y + dy * s, x + dx * s + s - 1, y + dy * s + s - 1], fill=c)


def stars(d, n, y1, seed, c='#ffffff'):
    r = random.Random(seed)
    for _ in range(n):
        x, y = r.randrange(W), r.randrange(max(1, y1))
        p = r.random()
        if p < 0.08:
            cross(d, x, y, c, 2)
        elif p < 0.14:
            ring(d, x, y, c, 2)
        elif p < 0.4:
            d.rectangle([x, y, x + 1, y + 1], fill=c)
        else:
            d.point((x, y), fill=c)


def cloud(d, x, y, w, h=None, cols=('#ffffff', '#eef0ec', '#d8dcd6')):
    """Nuvem fofa em pixel: calombos redondos em cima, meio-tom e sombra embaixo."""
    h = h or max(8, w // 4)
    light, mid, dark = cols
    r = random.Random(x * 7 + y * 13 + w)
    bumps, n = [], max(2, w // 22)
    for k in range(n):  # calombos maiores no meio, menores nas pontas
        cx = x + w * (k + 0.5) / n + r.randint(-3, 3)
        edge = 1 - abs((k + 0.5) / n - 0.5) * 1.4
        rad = max(4, int(h * (0.45 + 0.4 * edge) + r.randint(-2, 2)))
        bumps.append((cx, y + h - rad * 0.55, rad))
    base = y + h

    def inside(px, py, dy=0):
        if py > base:
            return False
        if py >= base - h * 0.35 and x + 3 <= px <= x + w - 3:
            return True
        return any((px - cx) ** 2 + (py - cy - dy) ** 2 <= rad * rad for cx, cy, rad in bumps)

    for py in range(int(y - h), base + 1):
        for px in range(int(x), int(x + w) + 1):
            if not (0 <= px < W and 0 <= py < H) or not inside(px, py):
                continue
            if py >= base - 1:
                c = dark
            elif not inside(px, py, 3) or py >= base - h * 0.3:
                c = mid  # a metade de baixo de cada calombo fica no meio-tom
            else:
                c = light
            d.point((px, py), fill=c)
    for px in range(int(x), int(x + w) + 1):  # beira de cima de cada calombo com um fio branco fino
        for py in range(int(y - h), base + 1):
            if 0 <= px < W and 0 <= py < H and inside(px, py):
                fpx(d, px * 2, py * 2, '#ffffff')
                fpx(d, px * 2 + 1, py * 2, '#ffffff')
                break


def hills(d, base, amp, period, phase, c, top=None):
    for x in range(W):
        t = int(base - amp * (0.5 + 0.5 * math.sin((x + phase) / period)))
        d.rectangle([x, t, x, H], fill=c)
        if top:
            d.point((x, t), fill=top)
            for xx in (x * 2, x * 2 + 1):  # o claro do topo desce pontilhado mais 2 pixels finos
                if (xx + t) % 2 == 0:
                    fpx(d, xx, t * 2 + 2, top)
                if xx % 4 == 0:
                    fpx(d, xx, t * 2 + 3, top)


def bricks(d, y0, c='#e52312', mortar='#541808', hi='#f04a2a', lo='#c77f0f'):
    d.rectangle([0, y0, W, H], fill=mortar)
    row = 0
    for y in range(y0 + 2, H, 14):
        off = 0 if row % 2 == 0 else 15
        for x in range(-off, W, 30):
            d.rectangle([x + 2, y, x + 28, y + 11], fill=c)
            d.line([(x + 2, y), (x + 28, y)], fill=hi)
            d.line([(x + 2, y + 11), (x + 28, y + 11)], fill=lo)
            r = random.Random(x * 7 + y)
            for _ in range(10):  # pintinhas e lascas de cada tijolo, na grade fina
                fx, fy = r.randrange((x + 3) * 2, (x + 28) * 2), r.randrange((y + 2) * 2, (y + 10) * 2)
                fpx(d, fx, fy, r.choice((hi, lo, '#b81a0a')))
            fpx(d, (x + 2) * 2, y * 2 + 2, '#ff8a6a')
            fpx(d, (x + 2) * 2 + 1, y * 2 + 2, '#ff8a6a')
            fpx(d, (x + 2) * 2, y * 2 + 3, '#ff8a6a')
        row += 1


def cactus(d, x, y, h, c='#4a7a14', dark='#2f5a0a', hi='#6aa02a'):
    w = max(6, h // 5)
    d.rectangle([x, y - h, x + w, y], fill=c)
    d.line([(x + 1, y - h + 1), (x + 1, y)], fill=hi)
    d.line([(x + w, y - h), (x + w, y)], fill=dark)
    a = int(h * 0.55)
    d.rectangle([x - w, y - a, x - w + 3, y - a + w], fill=c)
    d.rectangle([x - w, y - a - int(h * 0.25), x - w + 3, y - a], fill=c)
    b = int(h * 0.7)
    d.rectangle([x + w, y - b, x + w + w - 2, y - b + w - 2], fill=c)
    d.rectangle([x + 2 * w - 5, y - b - int(h * 0.2), x + 2 * w - 2, y - b], fill=c)
    for k in range(4, h, 6):
        d.point((x + w // 2, y - k), fill=dark)
    for k in range(3, h * 2, 5):  # espinhos finos dos dois lados
        fpx(d, x * 2 - 1, (y * 2) - k, '#f0e8c0')
        fpx(d, (x + w) * 2 + 2, (y * 2) - k - 2, '#f0e8c0')


def pine(d, x, y, h, c='#1f5a2a', hi='#2f7a3a', lights=None, r=None, snow=False):
    for k in range(h):
        w = (k * 9) // h + 1
        if (k // 4) % 2 == 1:
            w += 1
        d.line([(x - w, y - h + k), (x + w, y - h + k)], fill=c)
        d.point((x - w, y - h + k), fill=hi)
        if snow and (k // 4) % 2 == 0:
            d.point((x - w + 1, y - h + k), fill='#ffffff')
        if lights and r and r.random() < 0.3:
            d.point((x + r.randint(-w, w), y - h + k), fill=r.choice(lights))
    d.rectangle([x - 2, y, x + 2, y + 4], fill='#4a2a1a')
    if lights:
        cross(d, x, y - h - 3, '#ffd700', 1)


def tomb(d, x, y, c='#7a8a8a', dark='#4a5a5a', hi='#9aaaaa'):
    d.rectangle([x, y - 16, x + 12, y], fill=c)
    d.rectangle([x + 2, y - 18, x + 10, y - 16], fill=c)
    d.line([(x + 12, y - 16), (x + 12, y)], fill=dark)
    d.line([(x, y - 16), (x, y)], fill=hi)
    d.line([(x + 4, y - 11), (x + 8, y - 11)], fill=dark)
    d.line([(x + 6, y - 14), (x + 6, y - 6)], fill=dark)
    d.rectangle([x - 2, y, x + 14, y + 1], fill='#2a3a2a')
    for k, (dx, dy) in enumerate(((19, -6), (20, -5), (20, -4), (21, -3), (22, -3))):  # rachadura fina
        fpx(d, x * 2 + dx, y * 2 + dy * 2, dark)
    for dx in range(0, 26, 3):  # musgo no pé
        fpx(d, x * 2 + dx, y * 2 - 1, '#3a6a3a')


def pumpkin(d, x, y):
    d.ellipse([x, y - 10, x + 16, y], fill='#ff7a00')
    d.ellipse([x + 4, y - 10, x + 12, y], fill='#ff9a2a')
    d.line([(x + 8, y - 10), (x + 8, y)], fill='#c85a00')
    d.rectangle([x + 7, y - 13, x + 9, y - 10], fill='#2a6a1a')
    d.polygon([(x + 3, y - 6), (x + 6, y - 6), (x + 4, y - 8)], fill='#ffe23a')
    d.polygon([(x + 10, y - 6), (x + 13, y - 6), (x + 12, y - 8)], fill='#ffe23a')
    d.line([(x + 4, y - 3), (x + 12, y - 3)], fill='#ffe23a')


def bat(d, x, y, c='#0a0010'):
    d.rectangle([x - 1, y - 1, x + 1, y + 1], fill=c)
    d.line([(x - 6, y - 3), (x - 2, y)], fill=c, width=2)
    d.line([(x + 2, y), (x + 6, y - 3)], fill=c, width=2)


def heart(d, x, y, c, s=1):
    for dy, row in enumerate(['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...']):
        for dx, ch in enumerate(row):
            if ch == '#':
                d.rectangle([x + dx * s, y + dy * s, x + dx * s + s - 1, y + dy * s + s - 1], fill=c)


def sea(d, y0, cols=('#1a8cff', '#0a6ad8', '#2a9aff', '#0a5ac8'), band=6):
    r = random.Random(y0)
    for i, y in enumerate(range(y0, H, band)):
        d.rectangle([0, y, W, y + band], fill=cols[i % 2])
        for x in range((i * 23) % 40, W, 40):
            d.rectangle([x, y, x + 22, y + 1], fill=cols[2 + i % 2])
            dither(d, x * 2 - 6, y * 2 + 4, x * 2 - 1, y * 2 + 4, cols[2 + i % 2])  # a crista some aos poucos
            dither(d, (x + 23) * 2, y * 2, (x + 26) * 2, y * 2 + 1, cols[2 + i % 2])
        for _ in range(6):  # brilhos finos na água
            fx, fy = r.randrange(NW), r.randrange(y * 2, (y + band) * 2)
            fpx(d, fx, fy, '#ffffff'); fpx(d, fx + 1, fy, '#ffffff')


def building(d, x, w, h, c, win, r, lit=0.5, edge='#000000'):
    d.rectangle([x, H - h, x + w, H], fill=edge)
    d.rectangle([x + 2, H - h + 2, x + w - 2, H], fill=c)
    d.raw.line([((x + 2) * 2, (H - h + 2) * 2), ((x + w - 2) * 2 + 1, (H - h + 2) * 2)], fill=win if lit > 0.3 else c)  # beiral claro
    if r.random() < 0.5:  # antena ou caixa-d'água no telhado
        ax = (x + r.randint(4, max(5, w - 6))) * 2
        if r.random() < 0.5:
            d.raw.line([(ax, (H - h) * 2 - 10), (ax, (H - h) * 2)], fill=edge)
            fpx(d, ax, (H - h) * 2 - 11, '#ff3a3a')
        else:
            d.raw.rectangle([ax - 4, (H - h) * 2 - 6, ax + 4, (H - h) * 2 - 1], fill=edge)
    for wy in range(H - h + 6, H - 3, 6):
        for wx in range(x + 5, x + w - 4, 6):
            if r.random() < lit:
                d.rectangle([wx, wy, wx + 2, wy + 2], fill=win)
                fpx(d, wx * 2, wy * 2, '#ffffff')  # o vidro aceso brilha no canto
                d.raw.line([(wx * 2, wy * 2 + 5), (wx * 2 + 5, wy * 2 + 5)], fill=edge)  # e tem um peitoril
            else:
                d.raw.rectangle([wx * 2 + 1, wy * 2 + 1, wx * 2 + 4, wy * 2 + 4], fill=edge)


# ---------- cenários ----------

def scene_nyandoge():  # paredão de tijolos sob o céu da noite (exemplo do João)
    im, d = img()
    sky(d, ['#002a58', '#00305f', '#003366', '#033a6e'], 0, 144, seed=1)
    stars(d, 70, 135, 1)
    for x, y in ((60, 30), (250, 50), (140, 100)):
        ring(d, x, y)
    for x, y in ((100, 50), (290, 120)):
        cross(d, x, y)
    bricks(d, 144)
    return im


def scene_cowboy():  # pôr do sol no deserto, com nuvens e cacto (exemplo do João)
    im, d = img()
    sky(d, ['#201269', '#2e1788', '#491a92', '#69278e', '#a8306e', '#d9445a', '#ff5a5a'], 0, 126, step=10, jag=3, seed=2)
    ring(d, 268, 36)
    d.rectangle([250, 20, 251, 21], fill='#ffffff')
    disc(d, 92, 124, 24, '#ffd36a')
    disc(d, 92, 124, 18, '#ffe48a')
    for x0, w in ((0, 90), (110, 60), (190, 130)):
        cloud(d, x0, 108, w, 18, ('#f6f7f4', '#ebede8', '#d9dcd6'))
    d.rectangle([0, 126, W, H], fill='#e5a878')
    for y, c in ((140, '#d89c6a'), (156, '#d98a5a'), (168, '#d97353')):
        for x in range(0, W, 12):
            d.rectangle([x, y + (x // 12 % 2) * 2, x + 12, H], fill=c)
    r = random.Random(3)
    for _ in range(40):
        x, y = r.randrange(W), r.randrange(130, H)
        d.rectangle([x, y, x + 2, y], fill=r.choice(['#c48168', '#c88669', '#f0b888']))
    cactus(d, 236, 176, 44)
    cactus(d, 34, 172, 26)
    return im


def scene_xmas():  # vila de Natal: casinhas, pinheiros com luzes e neve
    im, d = img()
    sky(d, ['#06123a', '#0c1f52', '#14306a', '#1d4282', '#2a5296'], 0, 144, seed=3)
    stars(d, 60, 100, 3)
    moon(d, 262, 32, 14, '#f4f0d8', ('#e0dcc0', '#d0cca8'), '#06123a', 3)
    hills(d, 138, 12, 28, 0, '#c8d8ee', '#e8f0fa')
    d.rectangle([0, 144, W, H], fill='#ffffff')
    for x in range(0, W, 16):
        d.rectangle([x, 146 + (x // 16 % 3), x + 8, 147 + (x // 16 % 3)], fill='#dfe9f7')
    r = random.Random(4)
    for x in (22, 64, 112, 214, 254, 296):
        pine(d, x, 146 + r.randint(-3, 3), r.randint(28, 44), lights=['#ff3a3a', '#ffd700', '#3aa8ff', '#33ff4a'], r=r, snow=True)
    for hx, c in ((140, '#7a3a1a'), (178, '#5a2a6a')):  # casinhas com telhado de neve
        d.rectangle([hx, 118, hx + 34, 148], fill=c)
        d.polygon([(hx - 5, 120), (hx + 17, 100), (hx + 39, 120)], fill='#ffffff')
        d.rectangle([hx + 6, 126, hx + 14, 134], fill='#ffd27a')
        d.line([(hx + 10, 126), (hx + 10, 134)], fill=c)
        d.rectangle([hx + 22, 132, hx + 29, 148], fill='#3a1a0a')
        d.rectangle([hx + 26, 104, hx + 31, 112], fill='#5a3a2a')
    return im


def scene_pumpkin():  # Halloween: lua cheia, morcegos, árvore seca, lápides e abóboras
    im, d = img()
    sky(d, ['#12002b', '#2a0a4a', '#4a1a6a', '#7a2a6a', '#c8501a', '#ff7a1a'], 0, 152, step=10, jag=3, seed=5)
    stars(d, 30, 70, 5, '#ffd8a0')
    moon(d, 236, 46, 24, '#ffd27a', ('#f0b860', '#e8a850'), '#3a0a4a', 5)
    for x, y in ((80, 28), (104, 40), (128, 24), (180, 60), (60, 56)):
        bat(d, x, y)
    hills(d, 148, 16, 36, 4, '#140020')
    d.rectangle([0, 152, W, H], fill='#0a0010')
    d.line([(44, 152), (44, 96)], fill='#0a0010', width=4)
    for a, b in (((44, 116), (24, 100)), ((44, 108), (64, 88)), ((44, 100), (32, 84)), ((54, 96), (60, 80))):
        d.line([a, b], fill='#0a0010', width=2)
    for x in (80, 140, 200, 276):
        tomb(d, x, 164, '#3a2a4a', '#1a0a2a', '#4a3a5a')
    for x in (108, 168, 240):
        pumpkin(d, x, 172)
    return im


def scene_pirate():  # navio pirata no mar à noite
    im, d = img()
    sky(d, ['#020818', '#061430', '#0a2040', '#0e2c50'], 0, 116, seed=6)
    stars(d, 70, 100, 6)
    moon(d, 64, 36, 16, '#f4f0d8', ('#e0dcc0', '#cfc8a8'), '#020818', 6)
    sea(d, 116, ('#0a3a5a', '#0c4466', '#2a6a8a', '#1a5a7a'))
    for k, y in enumerate(range(120, 162, 6)):  # reflexo da lua tremendo na água
        d.rectangle([64 - 6 + k % 2 * 3, y, 64 + 4 - k % 2 * 2, y + 1], fill='#c8c4a8')
    d.polygon([(184, 116), (272, 116), (260, 132), (196, 132)], fill='#4a2a1a')
    d.line([(184, 116), (272, 116)], fill='#7a4a2a', width=2)
    for x in range(200, 258, 10):
        disc(d, x, 124, 2, '#1a0a0a')
    d.line([(228, 116), (228, 56)], fill='#3a1a0a', width=2)
    d.line([(204, 116), (204, 72)], fill='#3a1a0a', width=2)
    d.polygon([(208, 64), (248, 64), (244, 104), (212, 104)], fill='#e8e0c8')
    d.polygon([(206, 76), (224, 76), (222, 104), (208, 104)], fill='#d8d0b8')
    d.rectangle([220, 44, 236, 54], fill='#111111')
    disc(d, 228, 48, 2, '#ffffff')
    return im


def scene_tacnayn():  # inferno: brasas, rochas, lava e caveiras
    im, d = img()
    sky(d, ['#0a0000', '#1a0202', '#2a0303', '#4a0805', '#6a1006'], 0, 132, seed=8)
    r = random.Random(8)
    for _ in range(90):
        x, y = r.randrange(W), r.randrange(132)
        d.rectangle([x, y, x + r.randint(0, 1), y + r.randint(0, 1)], fill=r.choice(['#ff7a1a', '#ffb02a', '#ff4a1a']))
    hills(d, 132, 28, 18, 2, '#1a0a08', '#3a1a10')
    hills(d, 148, 16, 12, 9, '#2a120c', '#4a2214')
    d.rectangle([0, 156, W, H], fill='#ff4a0a')
    for y in range(158, H, 5):
        for x in range((y * 5) % 28, W, 28):
            d.rectangle([x, y, x + 10, y + 1], fill='#ffb02a')
    for x in (60, 180, 280):
        d.rectangle([x, 142, x + 10, 152], fill='#e8e0c8')
        d.rectangle([x + 2, 146, x + 3, 147], fill='#111'); d.rectangle([x + 7, 146, x + 8, 147], fill='#111')
        d.rectangle([x + 3, 152, x + 7, 154], fill='#e8e0c8')
    return im


def scene_paddy():  # arco-íris nos morros verdes, com pote de ouro
    im, d = img()
    sky(d, ['#4aa8f0', '#5ab8ff', '#7ac8ff', '#a0d8ff'], 0, 140, seed=9)
    for i, c in enumerate(['#ff2a2a', '#ff9a2a', '#ffee2a', '#33cc4a', '#2aa8ff', '#7a2aff']):
        rr = 104 - i * 6
        d.arc([160 - rr, 144 - rr, 160 + rr, 144 + rr], 180, 360, fill=c, width=6)
    for x0, w in ((14, 60), (232, 70)):
        cloud(d, x0, 18, w, 16)
    hills(d, 140, 20, 32, 0, '#3aa04a', '#5ac85a')
    hills(d, 160, 12, 22, 20, '#2a8a3a', '#3aa04a')
    d.rectangle([246, 142, 268, 158], fill='#222'); d.rectangle([244, 138, 270, 142], fill='#333')
    for x in range(248, 268, 3):
        disc(d, x, 136, 2, '#ffd700')
    r = random.Random(9)
    for _ in range(26):
        x, y = r.randrange(W), r.randrange(156, H)
        for dx, dy in ((0, 0), (2, 0), (1, -2), (1, 2)):
            d.rectangle([x + dx, y + dy, x + dx + 1, y + dy + 1], fill='#7ae07a')
    return im


def scene_mexinyan():  # praça com varais de papel picado
    im, d = img()
    sky(d, ['#2aa8ff', '#5ab8ff', '#8ad0ff', '#c8e8ff'], 0, 120, seed=10)
    cols = ['#ff2a8a', '#ffee2a', '#33cc4a', '#2aa8ff', '#ff7a1a', '#b02aff']
    for row, y in enumerate((14, 42)):
        d.line([(0, y), (W, y + 6)], fill='#555', width=1)
        for i, x in enumerate(range(6 + row * 10, W, 24)):
            yy = y + (x * 6) // W
            c = cols[(i + row) % len(cols)]
            d.polygon([(x, yy + 1), (x + 15, yy + 1), (x + 15, yy + 14), (x + 7, yy + 18), (x, yy + 14)], fill=c)
            d.rectangle([x + 5, yy + 6, x + 9, yy + 9], fill='#ffffff')
    for x0, w, h, c in ((0, 80, 52, '#f0c060'), (80, 68, 40, '#e87a5a'), (224, 96, 56, '#7ac8a0')):
        d.rectangle([x0, 120 - h, x0 + w, 120], fill=c)
        d.rectangle([x0, 120 - h, x0 + w, 120 - h + 3], fill='#ffffff')
        for x in range(x0 + 8, x0 + w - 8, 18):
            d.rectangle([x, 120 - h + 12, x + 8, 120 - h + 24], fill='#5a3a2a')
            d.rectangle([x - 2, 120 - h + 24, x + 10, 120 - h + 26], fill='#c84a2a')
    d.rectangle([0, 120, W, H], fill='#e0b070')
    for y in range(120, H, 12):
        for x in range((y // 12 % 2) * 12, W, 24):
            d.rectangle([x, y, x + 23, y + 11], outline='#d0a060')
    cactus(d, 180, 166, 34, '#3a8a2a', '#2a6a1a', '#5aaa3a')
    return im


def scene_zombie():  # cemitério com lua verde, árvore seca e mão saindo da terra
    im, d = img()
    sky(d, ['#020a04', '#04120a', '#081a0e', '#0e2414'], 0, 140, seed=11)
    moon(d, 248, 36, 20, '#b8f0a0', ('#98d880', '#88c870'), '#020a04', 11)
    stars(d, 26, 100, 11, '#9ad09a')
    hills(d, 136, 12, 30, 0, '#0a1a0a', '#142a14')
    d.rectangle([0, 140, W, H], fill='#142a14')
    d.line([(72, 140), (72, 88)], fill='#050a05', width=4)
    for a, b in (((72, 112), (52, 96)), ((72, 104), (92, 84)), ((72, 96), (62, 80))):
        d.line([a, b], fill='#050a05', width=2)
    for x in (24, 104, 156, 208, 280):
        tomb(d, x, 160)
    d.rectangle([120, 164, 128, 172], fill='#6a9a5a')
    for dx in (0, 3, 6, 8):
        d.rectangle([120 + dx, 158 + (dx % 4), 121 + dx, 164], fill='#6a9a5a')
    return im


def scene_surfing():  # praia: sol, coqueiro e uma onda grande
    im, d = img()
    sky(d, ['#2a8ae8', '#3aa0f0', '#5ab8ff', '#8ad0ff'], 0, 104, seed=12)
    disc(d, 256, 28, 16, '#fff36a'); disc(d, 256, 28, 12, '#fffaa0')
    for x0, w in ((24, 60), (136, 48)):
        cloud(d, x0, 20, w, 14)
    sea(d, 104, ('#1a6ac8', '#1a7ad8', '#5aa8ff', '#4a98f0'))
    d.pieslice([180, 80, 300, 200], 180, 270, fill='#2a8ae8')
    d.arc([180, 80, 300, 200], 180, 270, fill='#ffffff', width=4)
    d.rectangle([0, 152, W, H], fill='#f4d9a0')
    for x in range(0, W, 10):
        d.rectangle([x, 152, x + 6, 153], fill='#ffffff')
    d.line([(40, 172), (52, 92)], fill='#8a5a2a', width=6)
    for k in range(92, 172, 8):
        d.line([(40 + (172 - k) * 12 // 80 - 3, k), (40 + (172 - k) * 12 // 80 + 3, k)], fill='#6a3a1a')
    for dx, dy in ((-28, 12), (-20, -8), (24, -8), (28, 12), (0, -16)):
        d.line([(52, 92), (52 + dx, 92 + dy)], fill='#2a8a3a', width=4)
    return im


def scene_vday():  # corações concêntricos em rosa e vermelho (exemplo do João)
    im, d = img()
    cols = ['#ff81a4', '#ff8dac', '#ffb3c6', '#ffbccc', '#fed5e2', '#fdccdb', '#ffe8e8', '#ffc1c1', '#ff4f4f', '#d10000', '#a60000']
    cx, cy = 160, 84

    def inside(x, y, s):
        u, v = (x - cx) / s, -(y - cy) / s
        return (u * u + v * v - 1) ** 3 - u * u * v * v * v <= 0
    for y in range(H):
        for x in range(W):
            k = 0
            for i in range(len(cols)):
                if inside(x, y, 260 - i * 22):
                    k = i
            d.point((x, y), fill=cols[k])
    for x, y in ((40, 30), (280, 40), (30, 150), (290, 150)):
        ring(d, x, y)
    for x, y in ((60, 110), (270, 100)):
        heart(d, x, y, '#ffffff', 2)
    return im


def scene_newyear():  # cidade à noite com fogos
    im, d = img()
    sky(d, ['#02021a', '#06062a', '#0a0a3a', '#10104a'], 0, 128, seed=13)
    stars(d, 40, 80, 13)
    for cx, cy, c in ((60, 36, '#ffd700'), (160, 24, '#ff2a6a'), (252, 44, '#2affd0'), (112, 68, '#ffffff'), (210, 84, '#b07aff')):
        for k in range(16):
            a = k * math.pi / 8
            for t in (6, 10, 14, 17):
                x, y = cx + int(math.cos(a) * t), cy + int(math.sin(a) * t)
                d.rectangle([x, y, x + 1, y + 1], fill=c)
    r = random.Random(14)
    x = 0
    while x < W:
        w, h = r.randint(20, 36), r.randint(32, 72)
        building(d, x, w, h, '#0a0a14', '#ffd27a', r, 0.45, '#05050a')
        x += w + 2
    return im


def scene_easter():  # campo de primavera com ovos coloridos
    im, d = img()
    sky(d, ['#8ad0ff', '#a0daff', '#c0e8ff', '#e0f4ff'], 0, 140, seed=15)
    for x0, w in ((40, 64), (208, 70)):
        cloud(d, x0, 18, w, 16)
    hills(d, 132, 16, 36, 0, '#7ad87a', '#9ae89a')
    d.rectangle([0, 140, W, H], fill='#5ac85a')
    r = random.Random(15)
    cols = ['#ff84bd', '#ffad31', '#ffd684', '#7bceff', '#9c42a5', '#5abd7b']
    for x in range(12, W, 36):
        y = r.randint(152, 168)
        c = r.choice(cols)
        d.ellipse([x, y - 14, x + 10, y], fill=c)
        d.rectangle([x + 1, y - 8, x + 9, y - 6], fill='#ffffff')
        for k in range(2, 9, 3):
            d.point((x + k, y - 11), fill='#ffffff')
    for _ in range(40):
        x, y = r.randrange(W), r.randrange(144, H)
        d.rectangle([x, y, x + 1, y + 1], fill='#ffffff'); d.point((x + 2, y), fill='#ffee2a')
    return im


def scene_star():  # pasto da Star Sheep sob o céu estrelado
    im, d = img()
    sky(d, ['#02021a', '#06103a', '#0a1a4a', '#122a6a'], 0, 152, seed=16)
    stars(d, 90, 132, 17, '#fff6a0')
    disc(d, 60, 40, 18, '#fff6a0'); disc(d, 68, 34, 16, '#06103a')
    hills(d, 144, 12, 40, 0, '#1a3a5a', '#2a4a6a')
    d.rectangle([0, 152, W, H], fill='#14304a')
    for x in range(0, W, 20):
        d.rectangle([x, 140, x + 3, 160], fill='#6a5a4a')
    d.rectangle([0, 145, W, 147], fill='#6a5a4a'); d.rectangle([0, 153, W, 155], fill='#6a5a4a')
    return im


def scene_cherry():  # cerejeira rosa, nuvens rosadas e chão de pétalas (exemplo do João)
    im, d = img()
    sky(d, ['#4ac8f0', '#62d0f4', '#7ad8f6', '#98e0f8', '#b8e8fa'], 0, 128, step=10, jag=3, seed=18)
    for x0, w, cols in ((0, 110, ('#ffd0ec', '#f4b8e0', '#e8a0d8')), (90, 120, ('#f0c0f0', '#d8a8ec', '#c098e4')), (220, 110, ('#c8b8f4', '#a8a0ec', '#9090e0'))):
        cloud(d, x0, 100, w, 28, cols)
    d.rectangle([0, 128, W, H], fill='#f8b8e0')
    d.rectangle([0, 150, W, H], fill='#fcd0ea')
    r = random.Random(18)
    for _ in range(14):
        cross(d, r.randrange(W), r.randrange(140, H), '#ffe8f6', 1)
    # tronco e galhos
    d.polygon([(220, 160), (236, 160), (232, 90), (226, 90)], fill='#a8507a')
    d.line([(229, 110), (196, 60)], fill='#a8507a', width=4)
    d.line([(231, 100), (270, 50)], fill='#a8507a', width=4)
    d.line([(229, 90), (236, 30)], fill='#a8507a', width=3)
    # copa em manchas de rosa
    for _ in range(260):
        a, t = r.random() * 6.283, r.random() ** 0.6 * 70
        x, y = int(232 + math.cos(a) * t * 1.2), int(52 + math.sin(a) * t * 0.7)
        c = r.choice(['#ff9ad8', '#ffb0e0', '#f080c8', '#ffc8ea', '#e870b8'])
        d.rectangle([x, y, x + r.randint(3, 7), y + r.randint(2, 5)], fill=c)
    for _ in range(18):
        cross(d, int(232 + (r.random() - 0.5) * 150), int(52 + (r.random() - 0.5) * 90), '#ffffff', 1)
    for _ in range(12):  # pétalas caindo
        x, y = r.randrange(W), r.randrange(130)
        d.rectangle([x, y, x + 3, y + 2], fill='#ffa0d8')
    return im


def scene_liberty():  # cidade ao entardecer, com prédios iluminados (exemplo do João)
    im, d = img()
    sky(d, ['#2a0a3e', '#40185a', '#4e1c5e', '#64286a', '#c06a94', '#e08aa0', '#f6a8a0', '#fcc0a0'], 0, H, step=10, jag=3, seed=19)
    ring(d, 280, 70)
    d.rectangle([60, 120, 61, 121], fill='#ffffff')
    r = random.Random(19)
    for x, w, h, c, win in ((0, 24, 70, '#3a3048', '#f0e090'), (34, 60, 112, '#2a2840', None), (110, 30, 56, '#4a3a58', '#f0e090'),
                            (150, 22, 80, '#3a3048', '#f0e090'), (186, 64, 120, '#7a7890', '#c8c0e0'), (262, 40, 64, '#3a3048', '#f0e090'), (306, 20, 90, '#2a2840', '#f0e090')):
        if win is None:  # o prédio de faixas laranja e amarelas
            d.rectangle([x, H - h, x + w, H], fill='#000000')
            for y in range(H - h + 4, H, 12):
                d.rectangle([x + 3, y, x + w - 3, y + 4], fill='#2a2840')
                d.rectangle([x + 3, y + 5, x + w // 2, y + 8], fill='#ff8800')
                d.rectangle([x + w // 2, y + 5, x + w - 3, y + 8], fill='#ffee00')
        else:
            building(d, x, w, h, c, win, r, 0.4)
    return im


def scene_angel():  # céu claro com nuvens e brilhos (exemplo do João)
    im, d = img()
    sky(d, ['#2aa0ff', '#36aaff', '#42b4ff', '#5ac0ff', '#78ccff'], 0, H, step=12, jag=3, seed=20)
    for x0, y0, w in ((0, 120, 110), (90, 140, 140), (230, 116, 100), (40, 40, 56), (220, 30, 64)):
        cloud(d, x0, y0, w, max(12, w // 5), ('#ffffff', '#e8f4ff', '#c8e4ff'))
    for x, y in ((30, 150), (160, 60), (290, 90)):
        cross(d, x, y)
    for x, y in ((120, 24), (260, 150)):
        ring(d, x, y)
    return im


def scene_demonic():  # vermelho do inferno com chamas no chão e brilhos (exemplo do João)
    im, d = img()
    sky(d, ['#660000', '#7a0000', '#8c0000', '#990000', '#a80a00'], 0, 150, step=12, jag=3, seed=21)
    for x, y in ((250, 40), (60, 90), (180, 20)):
        ring(d, x, y)
    for x, y in ((120, 60), (290, 110)):
        cross(d, x, y)
    r = random.Random(21)
    for x in range(0, W, 6):  # chamas
        h = r.randint(10, 30)
        d.rectangle([x, 160 - h, x + 5, 160], fill=r.choice(['#ff4a0a', '#ff7a1a']))
        d.rectangle([x + 1, 160 - h // 2, x + 4, 160], fill='#ffb02a')
    d.rectangle([0, 160, W, H], fill='#2a0000')
    return im


def scene_biker():  # cidade à noite com rua asfaltada e faixas brancas (exemplo do João)
    im, d = img()
    sky(d, ['#002a58', '#03305f', '#063666', '#0a3c6e'], 0, 130, step=10, jag=3, seed=22)
    cloud(d, 110, 14, 96, 18, ('#ffffff', '#f0f0f8', '#d8d8ea'))
    ring(d, 262, 36)
    stars(d, 14, 70, 22)
    r = random.Random(22)
    x = -6
    while x < W:  # prédios cinza com janelas amarelas e verdes-claros no meio
        w, h = r.randint(26, 46), r.randint(36, 70)
        c = r.choice(['#9a9a8c', '#8c8c80', '#a4a496'])
        d.rectangle([x, 130 - h, x + w, 130], fill=c)
        for wy in range(130 - h + 5, 126, 8):
            for wx in range(x + 4, x + w - 4, 8):
                d.rectangle([wx, wy, wx + 3, wy + 3], fill='#ffe83a' if r.random() < 0.35 else '#5e5e54')
        x += w + r.choice([0, 0, 6])
        if r.random() < 0.4:
            d.rectangle([x - 6, 116, x, 130], fill='#8ab890')
            x += 2
    d.rectangle([0, 130, W, 134], fill='#4a4a4a')
    d.rectangle([0, 134, W, 162], fill='#56636e')
    for x in range(8, W, 54):
        d.rectangle([x, 147, x + 26, 148], fill='#ffffff')
    d.rectangle([0, 162, W, H], fill='#2cae2c')
    d.rectangle([0, 162, W, 163], fill='#249424')
    return im


# ---------- acabamento fino de cada cenário (coordenadas de 640x360) ----------

def fine_nyandoge(d):
    fine_stars(d, 160, 140, 1)
    for x, y in ((180, 60), (420, 150), (560, 40)):
        sparkle(d, x, y)


def fine_cowboy(d):
    glow(d, 92, 124, 25, 36, '#ff9a6a', ymax=216)  # só no céu, acima das nuvens
    grains(d, 128, 180, 900, ['#c48168', '#f0b888', '#d8946a', '#b8705a'], 31)
    for x, y in ((150, 300), (330, 330), (560, 318)):  # pedras com sombra
        d.raw.ellipse([x, y, x + 14, y + 8], fill='#9a6a5a'); d.raw.line([(x + 3, y + 1), (x + 9, y + 1)], fill='#c89a7a')
        d.raw.line([(x + 2, y + 9), (x + 14, y + 9)], fill='#a05a48')
    d.raw.ellipse([380, 300, 398, 316], outline='#8a5a2a'); d.raw.ellipse([384, 304, 394, 312], outline='#a0703a')  # uma bola de feno


def fine_xmas(d):
    glow(d, 262, 32, 17, 28, '#2a5296')
    fine_stars(d, 120, 100, 3)
    grains(d, 144, 180, 500, ['#dfe9f7', '#c8d8ee', '#ffffff'], 32)
    for hx in (140, 178):  # fumaça da chaminé, janela com brilho e luzinhas no beiral
        for k, (dx, dy) in enumerate(((0, 0), (3, -5), (1, -10), (5, -15), (3, -20))):
            d.raw.ellipse([(hx + 27) * 2 + dx * 2, 200 + dy * 2, (hx + 27) * 2 + dx * 2 + 6 + k, 205 + dy * 2 + k], fill='#8a9ab8' if k % 2 else '#a8b8d0')
        for k, x in enumerate(range(hx * 2 - 8, (hx + 39) * 2, 6)):
            y = 240 - abs(x - (hx + 17) * 2) * 40 // ((22) * 2)
            fpx(d, x, y + 2, ['#ff3a3a', '#ffd700', '#3aa8ff', '#33ff4a'][k % 4])
    for x in range(0, NW, 12):  # cerquinha de madeira com neve
        d.raw.rectangle([x, 318, x + 3, 334], fill='#7a4a2a'); d.raw.rectangle([x, 316, x + 3, 317], fill='#ffffff')
    d.raw.rectangle([0, 322, NW, 324], fill='#6a3a1a'); d.raw.rectangle([0, 321, NW, 321], fill='#ffffff')


def fine_pumpkin(d):
    glow(d, 236, 46, 27, 40, '#ffb04a')
    fine_stars(d, 60, 70, 5, ('#ffd8a0', '#ffffff'))
    for x, y in ((300, 70), (330, 96), (420, 40)):  # morcegos de longe, finos
        d.raw.line([(x - 4, y - 2), (x, y)], fill='#0a0010'); d.raw.line([(x, y), (x + 4, y - 2)], fill='#0a0010')
    for x in range(0, NW, 10):  # cerca torta do cemitério
        h = 18 + (x * 7) % 6
        d.raw.rectangle([x + 2, 300 - h, x + 4, 304], fill='#1a0a2a'); fpx(d, x + 3, 299 - h, '#1a0a2a')
    d.raw.line([(0, 290), (NW, 290)], fill='#1a0a2a', width=2)
    blades(d, 150, 180, 260, ['#1a0a2a', '#2a1a3a'], 33)


def fine_pirate(d):
    glow(d, 64, 36, 19, 30, '#2a4a70')
    fine_stars(d, 140, 110, 6)
    for k in range(6):  # tábuas do casco e o cordame
        y = 236 + k * 4
        d.raw.line([(372 + k * 3, y), (540 - k * 3, y)], fill='#6a3a1a' if k % 2 else '#3a1a0a')
    for a, b in (((456, 112), (380, 232)), ((456, 112), (540, 232)), ((408, 144), (370, 232)), ((456, 112), (408, 144))):
        d.raw.line([a, b], fill='#2a1a0a')
    for y in range(132, 208, 8):  # costuras da vela
        d.raw.line([(420, y), (492, y)], fill='#c8c0a8')
    d.raw.line([(448, 96), (448, 90)], fill='#ffffff'); fpx(d, 446, 94, '#ffffff'); fpx(d, 450, 94, '#ffffff')  # ossos da caveira
    for x in range(340, 600, 9):  # espuma batendo no casco
        fpx(d, x, 266, '#ffffff'); fpx(d, x + 1, 267, '#c8e4ff')


def fine_tacnayn(d):
    r = random.Random(34)
    for _ in range(40):  # bolhas de lava estourando
        x, y = r.randrange(NW), r.randrange(316, 356)
        d.raw.ellipse([x, y, x + 5, y + 4], outline='#ffe08a')
    grains(d, 100, 156, 500, ['#4a2214', '#5a2a18', '#1a0a08'], 35)
    for x in (60, 180, 280):  # dentes e rachaduras nas caveiras
        for k in range(4):
            fpx(d, x * 2 + 7 + k * 3, 307, '#111111')
        fpx(d, x * 2 + 4, 288, '#b8b0a0'); fpx(d, x * 2 + 5, 289, '#b8b0a0')
    for _ in range(60):
        sparkle(d, r.randrange(NW), r.randrange(250), r.choice(('#ffb02a', '#ff7a1a'))) if r.random() < 0.15 else fpx(d, r.randrange(NW), r.randrange(250), '#ffcc66')


def fine_paddy(d):
    rr = 104 * 2 - 3  # fio claro por dentro da faixa vermelha do arco-íris
    d.raw.arc([321 - rr, 289 - rr, 321 + rr, 289 + rr], 185, 355, fill='#ff8a8a', width=1)
    blades(d, 140, 180, 500, ['#5ac85a', '#2a8a3a', '#7ae07a'], 36)
    r = random.Random(37)
    for _ in range(18):  # trevos de três folhas e florzinhas
        x, y = r.randrange(NW), r.randrange(300, 356)
        for dx, dy in ((0, -3), (-3, 0), (3, 0)):
            d.raw.ellipse([x + dx - 2, y + dy - 2, x + dx + 2, y + dy + 2], fill='#1a7a2a')
        fpx(d, x, y + 3, '#1a7a2a'); fpx(d, x, y + 4, '#1a7a2a')
    for _ in range(14):
        x, y = r.randrange(NW), r.randrange(300, 356)
        fpx(d, x, y, '#ffee2a'); [fpx(d, x + dx, y + dy, '#ffffff') for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))]
    for x, y in ((500, 262), (520, 266), (532, 258)):  # o ouro brilha
        sparkle(d, x, y, '#fff6a0')


def fine_mexinyan(d):
    r = random.Random(38)
    for row, y in enumerate((14, 42)):  # recortes do papel picado
        for i, x in enumerate(range(6 + row * 10, W, 24)):
            yy = (y + (x * 6) // W) * 2
            for dx, dy in ((4, 6), (24, 6), (14, 22), (6, 22), (22, 22)):
                fpx(d, x * 2 + dx, yy + dy, '#ffffff'); fpx(d, x * 2 + dx + 1, yy + dy, '#ffffff')
    for x0, w, h in ((0, 80, 52), (80, 68, 40), (224, 96, 56)):  # rachaduras e manchas no reboco
        for _ in range(30):
            fpx(d, r.randrange(x0 * 2, (x0 + w) * 2), r.randrange((120 - h + 4) * 2, 238), '#00000022' if False else '#c89a50')
    for y in range(240, NH, 24):  # sombra fina nos ladrilhos
        for x in range((y // 24 % 2) * 24, NW, 48):
            d.raw.line([(x + 2, y + 21), (x + 45, y + 21)], fill='#c89048')
            d.raw.line([(x + 2, y + 2), (x + 45, y + 2)], fill='#f0c888')
    for dx, dy in ((0, 0), (3, -2), (6, 0)):  # flor no cacto
        d.raw.ellipse([370 + dx, 262 + dy, 374 + dx, 266 + dy], fill='#ff4a8a')


def fine_zombie(d):
    glow(d, 248, 36, 23, 34, '#1a3a1a')
    fine_stars(d, 50, 100, 11, ('#9ad09a', '#ffffff'))
    blades(d, 140, 180, 420, ['#1e3a1e', '#2a4a2a', '#0e1e0e'], 39)
    for y in range(256, 300, 6):  # névoa rasteira pontilhada
        dither(d, 0, y, NW, y, '#2a4a34', 1)
    for dx in (0, 6, 12, 16):  # unhas da mão
        fpx(d, 240 + dx, 316 + (dx % 8) // 2, '#c8e0b0')


def fine_surfing(d):
    glow(d, 256, 28, 17, 26, '#8ad0ff')
    for k in range(10):  # espuma e gotas na onda
        a = math.radians(185 + k * 8)
        x, y = 481 + int(math.cos(a) * 124), 281 + int(math.sin(a) * 124)
        fpx(d, x - 3, y + 2, '#ffffff'); fpx(d, x + 2, y + 5, '#ffffff')
    grains(d, 153, 180, 500, ['#e8c888', '#ffffff', '#d8b878'], 40)
    for x, y in ((180, 330), (420, 340), (560, 320)):  # conchinhas
        d.raw.ellipse([x, y, x + 6, y + 5], fill='#ffb8a0'); d.raw.line([(x + 3, y), (x + 3, y + 5)], fill='#e08a7a')
    for x, y in ((90, 196), (100, 200), (96, 204)):  # cocos
        d.raw.ellipse([x, y, x + 7, y + 7], fill='#6a3a1a')
    for x, y in ((200, 60), (230, 50), (330, 80)):  # gaivotas
        d.raw.line([(x - 5, y - 2), (x, y)], fill='#ffffff'); d.raw.line([(x, y), (x + 5, y - 2)], fill='#ffffff')


def fine_vday(d):
    r = random.Random(41)
    for _ in range(24):  # coraçõezinhos finos e brilhos
        x, y = r.randrange(NW), r.randrange(NH)
        if r.random() < 0.5:
            for dy, row in enumerate(['.#.#.', '#####', '.###.', '..#..']):
                for dx, ch in enumerate(row):
                    if ch == '#':
                        fpx(d, x + dx, y + dy, '#ffffff')
        else:
            sparkle(d, x, y)


def fine_newyear(d):
    fine_stars(d, 100, 90, 13)
    r = random.Random(42)
    for cx, cy, c in ((60, 36, '#ffd700'), (160, 24, '#ff2a6a'), (252, 44, '#2affd0'), (112, 68, '#ffffff'), (210, 84, '#b07aff')):
        for k in range(32):  # fagulhas finas entre os raios e o rastro que subiu
            a = k * math.pi / 16 + 0.1
            t = r.uniform(20, 38)
            fpx(d, cx * 2 + int(math.cos(a) * t), cy * 2 + int(math.sin(a) * t), c)
        for y in range(cy * 2 + 40, 250, 6):
            fpx(d, cx * 2 + (y % 3) - 1, y, '#ffe8b0')


def fine_easter(d):
    blades(d, 136, 180, 520, ['#7ad87a', '#3aa03a', '#9ae89a'], 43)
    r = random.Random(44)
    for _ in range(26):  # florzinhas
        x, y = r.randrange(NW), r.randrange(284, 356)
        c = r.choice(('#ff84bd', '#ffd684', '#7bceff', '#ffffff'))
        for dx, dy in ((0, -2), (-2, 0), (2, 0), (0, 2)):
            fpx(d, x + dx, y + dy, c)
        fpx(d, x, y, '#ffee2a')
    rr = random.Random(15)
    for x in range(12, W, 36):  # zigue-zague e bolinhas em cada ovo
        y = rr.randint(152, 168); rr.choice([0])
        for k in range(0, 18, 2):
            fpx(d, x * 2 + 2 + k, (y - 4) * 2 + (k // 2 % 2) * 2, '#ffffff')
        d.raw.line([(x * 2 + 4, (y - 13) * 2), (x * 2 + 6, (y - 13) * 2)], fill='#ffffff')


def fine_star(d):
    fine_stars(d, 200, 132, 17, ('#fff6a0', '#ffffff'))
    for x, y, l in ((120, 40, 24), (470, 70, 18)):  # estrelas cadentes
        for k in range(l):
            fpx(d, x - k, y - k // 2, '#fff6a0' if k < l // 2 else '#a0a0d0')
    for x in range(0, NW, 40):  # veios da madeira da cerca
        d.raw.line([(x + 2, 282), (x + 2, 318)], fill='#8a7a6a')
    d.raw.line([(0, 291), (NW, 291)], fill='#8a7a6a'); d.raw.line([(0, 307), (NW, 307)], fill='#8a7a6a')
    blades(d, 150, 180, 260, ['#1a3a5a', '#2a4a6a'], 45)


def fine_cherry(d):
    r = random.Random(46)
    for _ in range(140):  # flores finas na copa, com miolo
        a, t = r.random() * 6.283, r.random() ** 0.6 * 140
        x, y = int(464 + math.cos(a) * t * 1.2), int(104 + math.sin(a) * t * 0.7)
        c = r.choice(('#ffd8f0', '#ffffff', '#ffb0e0'))
        for dx, dy in ((0, -1), (-1, 0), (1, 0), (0, 1)):
            fpx(d, x + dx, y + dy, c)
        fpx(d, x, y, '#e8508a')
    for y in range(180, 320, 4):  # casca do tronco
        fpx(d, 458 + (y * 3) % 6, y, '#7a3058'); fpx(d, 462 - (y * 5) % 4, y + 2, '#c8709a')
    for _ in range(90):  # pétalas no chão
        x, y = r.randrange(NW), r.randrange(262, 356)
        fpx(d, x, y, '#ff9ad8'); fpx(d, x + 1, y, '#ffb0e0')


def fine_liberty(d):
    r = random.Random(47)
    d.raw.polygon([(588, 210), (600, 210), (598, 176), (590, 176)], fill='#2a6a6a')  # a estátua ao longe, de verde-cobre
    d.raw.rectangle([591, 168, 597, 176], fill='#3a8a8a')
    for k in range(5):
        fpx(d, 590 + k * 2, 166 - (k % 2), '#3a8a8a')
    d.raw.line([(597, 172), (604, 156)], fill='#3a8a8a', width=2); d.raw.ellipse([602, 150, 607, 155], fill='#ffd27a')
    d.raw.rectangle([584, 210, 604, 230], fill='#4a3a58')
    for _ in range(40):
        sparkle(d, r.randrange(NW), r.randrange(160), '#ffe8d0') if r.random() < 0.1 else fpx(d, r.randrange(NW), r.randrange(160), '#ffd8c0')


def fine_angel(d):
    r = random.Random(48)
    for k in range(7):  # raios de luz pontilhados vindos do alto
        x0 = 60 + k * 90
        for y in range(0, NH, 2):
            x = x0 + y // 3
            if (x // 2 + y // 2) % 3 == 0:
                fpx(d, x, y, '#bfe4ff')
    for _ in range(30):
        x, y = r.randrange(NW), r.randrange(NH)
        sparkle(d, x, y, '#fff6c0') if r.random() < 0.3 else fpx(d, x, y, '#ffffff')


def fine_demonic(d):
    r = random.Random(49)
    for x in range(0, NW, 12):  # língua de fogo clara dentro de cada chama
        h = r.randint(8, 22)
        d.raw.polygon([(x + 3, 320), (x + 9, 320), (x + 6, 320 - h)], fill='#ffe08a')
    for _ in range(80):  # brasas soltas
        x, y = r.randrange(NW), r.randrange(120, 300)
        fpx(d, x, y, r.choice(('#ffb02a', '#ff7a1a', '#ffe08a')))
    grains(d, 160, 180, 300, ['#4a0000', '#1a0000', '#5a0a00'], 50)


def fine_biker(d):
    r = random.Random(51)
    for x in range(40, NW, 120):  # postes com luz amarela
        d.raw.rectangle([x, 196, x + 2, 262], fill='#2a2a2a')
        d.raw.rectangle([x, 194, x + 12, 196], fill='#2a2a2a'); d.raw.rectangle([x + 8, 197, x + 14, 199], fill='#ffe83a')
        dither(d, x + 6, 200, x + 16, 206, '#c8b84a', 1)
    grains(d, 134, 162, 600, ['#4e5a64', '#606e78', '#46525c'], 52)  # asfalto
    d.raw.line([(0, 268), (NW, 268)], fill='#8a8a8a')  # meio-fio
    blades(d, 162, 180, 300, ['#249424', '#3ac83a'], 53)
    fine_stars(d, 50, 70, 22)


DETAILS = {k[5:]: v for k, v in list(globals().items()) if k.startswith('fine_') and k != 'fine_stars'}

SCENES = {k[6:]: v for k, v in list(globals().items()) if k.startswith('scene_')}

if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for name, fn in SCENES.items():
        im = fn()
        if name in DETAILS:
            DETAILS[name](Draw2(im))
        im.save(os.path.join(out, name + '.png'), optimize=True)
        print(name)
