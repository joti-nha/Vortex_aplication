/* Vortex — imagens em pixel art dos itens oficiais.
   Cada desenho é uma grade de até 16x16; cada letra é uma cor da paleta e "." é transparente.
   "a"/"A" pegam a cor da raridade do item; "c" é o brilho (troca por item, ex.: injetores). */
(function () {
  'use strict';

  const PAL = {
    k: '#12161d', d: '#3b4352', m: '#6c7787', l: '#b4bdca', w: '#eef1f5',
    g: '#5b3c29', G: '#8a5c3c', r: '#d9434a', R: '#8f2228', y: '#f2c14e',
    c: '#5fe3ff', C: '#2a8fb0', p: '#b57bff', v: '#5fd38a', o: '#e88a3a', s: '#2b313c'
  };
  const RAR = { Comum: ['#9aa6b6', '#5d6878'], Incomum: ['#5fd38a', '#2f8a52'], Rara: ['#5aa6ff', '#2b5fb0'], Epica: ['#b57bff', '#6a3cb0'], 'Épica': ['#b57bff', '#6a3cb0'], 'Lendária': ['#f2c14e', '#b07a1c'] };

  const SPR = {
    pistola: [
      '..kkkkkkkkkkkk..',
      '..kllllllllllkk.',
      '..kmmmmmmmmmmmk.',
      '..kdaaaddddddkk.',
      '..kkkkgggkkkkk..',
      '.....kgGgk.kk...',
      '.....kgGgkkdk...',
      '....kgGgk.kk....',
      '....kgGgk.......',
      '....kgggk.......',
      '....kkkkk.......'
    ],
    revolver: [
      '.k...........k..',
      'kkkkkkkkkkkkkkk.',
      'klllmmmmmmmmmmk.',
      'kmmmaammkkkkkkk.',
      'kdddaaddk.......',
      '.kkkgggkk.......',
      '...kgGgk.kk.....',
      '..kgGgkkkdk.....',
      '..kgGgk.kk......',
      '..kgggk.........',
      '..kkkkk.........'
    ],
    rifle: [
      '.....kkkkk......',
      '.....kdddk......',
      'kkk.kkkkkkkkk...',
      'kmkkkmmmmmmmmkkk',
      'kmmmmmmlllmmmmmk',
      'kdddddaaaddddkkk',
      'kkkkkkdgkkddk...',
      '.....kgGk.kddk..',
      '.....kgGk..kk...',
      '.....kkkk.......'
    ],
    fuzil: [
      '.....kkkkkk.....',
      '.....kcdddk.....',
      'kkkkkkkkkkkkkk..',
      'kgggkmmmmmmmmkkk',
      'kgGGkmlllmmmmmmk',
      'kgggkdaaadddkkkk',
      'kkkkkddkkdddk...',
      '.....kgk.kddk...',
      '.....kGk..kk....',
      '.....kkk........'
    ],
    espingarda: [
      'kkkk.kkkkkkkkkkk',
      'kgGkkmmmmmmmmmmk',
      'kgGGkllllllllllk',
      'kgggkdddkGGGGkkk',
      'kkkkkddkkgggk...',
      '.....kgk.kkk....',
      '.....kGk........',
      '.....kkk........'
    ],
    submetralhadora: [
      '...kkkkkkkk.....',
      'kkkkllllllkkkkk.',
      'kmmmmmmmmmmmmmk.',
      'kkkdaaadddddkkk.',
      '...kkgkkdddk....',
      '...kgGk.kdk.....',
      '...kgGk.kdk.....',
      '...kkkk.kdk.....',
      '........kkk.....'
    ],
    metralhadora: [
      '......kkk.......',
      'kkkk.kkdkkkkkkkk',
      'kgGkkmmmmmmmmmmk',
      'kgGGkllllmmmmmmk',
      'kgggkdaaaddddkkk',
      'kkkkkdkkdddk.k..',
      '....kgk.kaak.k..',
      '....kGk.kaak.k..',
      '....kkk.kkkk.kk.'
    ],
    laser: [
      '....kkkkkkk.....',
      '..kkmmmmmmmkkk..',
      '.kmmlllllllmmkk.',
      'kmmmcccccccccck.',
      '.kdddaaddddkkk..',
      '..kkkgkkddk.....',
      '....kgGk.kk.....',
      '...kgGk.........',
      '...kkkk.........'
    ],
    gravitacional: [
      '.......kkkk.....',
      '..kkkkkpppp.....',
      '.kmmmmkpwwpkkk..',
      'kmmllmkpwwpmmmk.',
      'kdddaakppppddkk.',
      '.kkkgkkkkkkkk...',
      '...kgGk..kk.....',
      '..kgGk..........',
      '..kkkk..........'
    ],
    hibrida: [
      '....kkkkkk......',
      '....kcccrk......',
      'kkkkkkkkkkkkkk..',
      'kgggkmmmmmmmmkkk',
      'kgGGkllcclrrlmmk',
      'kgggkdaaadddkkkk',
      'kkkkkddkkdddk...',
      '.....kgk.kddk...',
      '.....kGk..kk....',
      '.....kkk........'
    ],
    portal: [
      '.....kkkkkk.....',
      '....kppppppk....',
      '...kpkkkkkkpk...',
      '..kpk.....kkpk..',
      '..kpk.kmmmmmmmk.',
      '..kpkkmlllaaaak.',
      '..kpk.kddddkkk..',
      '...kpkkkgGk.....',
      '....kppkgGk.....',
      '.....kkkkkk.....'
    ],
    lancador: [
      '..kkkkkkkkkkkk..',
      '.kmmmmmmmmmmmmk.',
      'kkllllllllllllkk',
      'kdmmmmmmmmmmmmok',
      'kkddaaaddddddkkk',
      '.kkkkgkkkdkkkk..',
      '....kgGk.kdk....',
      '....kgGk.kk.....',
      '....kkkk........'
    ],
    // acessórios
    mira: [
      '................',
      '...kkkkkkkkk....',
      '..kmmmmmmmmmk...',
      '.kcmlllllllmck..',
      '.kcmmmmmmmmmck..',
      '..kdaaaaaaadk...',
      '...kkdkkkdkk....',
      '....kk...kk.....'
    ],
    reddot: [
      '....kkkkkkk.....',
      '...kdddddddk....',
      '..kdk.....kdk...',
      '..kdk..r..kdk...',
      '..kdk.....kdk...',
      '..kdaaaaaaadk...',
      '..kkkkkkkkkkk...',
      '...kk.....kk....'
    ],
    silenciador: [
      '................',
      '..kkkkkkkkkkkk..',
      '.kmmmmmmmmmmmmk.',
      'kklllllllllllllk',
      'kdmmamammammmdk.',
      'kkdddddddddddkk.',
      '..kkkkkkkkkkkk..'
    ],
    cano: [
      '................',
      'kkkk............',
      'kmmkkkkkkkkkkkkk',
      'klllllllllllllll',
      'kddaadddddddddkk',
      'kkkkkkkkkkkkkkk.'
    ],
    carregador: [
      '....kkkkkk......',
      '....kyyyyk......',
      '....kmmmmk......',
      '...kmlllmk......',
      '...kmaaamk......',
      '...kmmmmmk......',
      '..kmmmmmk.......',
      '..kmaaamk.......',
      '..kdddddk.......',
      '..kkkkkkk.......'
    ],
    carregador2: [
      '...kkkkkkkkk....',
      '...kyyyykyyyk...',
      '...kmmmmkmmmk...',
      '..kmlllkmlllk...',
      '..kmaaakmaaak...',
      '..kmmmmkmmmmk...',
      '.kmmmmkmmmmk....',
      '.kmaaakmaaak....',
      '.kddddkddddk....',
      '.kkkkkkkkkkk....'
    ],
    telemetro: [
      '..kkkkkkkkkkk...',
      '.kmmmmmmmmmmmk..',
      '.kmkkkkkkkkkmkk.',
      '.kmkvvvvvvvkmkck',
      '.kmkvkvvkvvkmkk.',
      '.kmkkkkkkkkkmk..',
      '.kdaaadddddddk..',
      '..kkkkkkkkkkk...'
    ],
    mira_laser: [
      '................',
      '.kkkkkk.........',
      'kmmmmmmk........',
      'kllllllkrrrrrrrr',
      'kdaaaddk........',
      '.kkkkkk.........'
    ],
    lanterna: [
      '...........ccc..',
      '.kkkkkkkk.cc....',
      'kmmmmmmmkkyc....',
      'kllllllllkyyyyyy',
      'kdaaadddkkyc....',
      '.kkkkkkkk.cc....',
      '...........ccc..'
    ],
    tripe: [
      '.....kkkkk......',
      '.....kmmmk......',
      '.....kdadk......',
      '....kkkmkkk.....',
      '...kk.kmk.kk....',
      '..kk..kmk..kk...',
      '.kk...kmk...kk..',
      'kk....kmk....kk.',
      'k.....kkk.....k.'
    ],
    // armaduras
    leve: [
      '...kkk....kkk...',
      '..kaaak..kaaak..',
      '.kaaaakkkkaaaak.',
      'kaaAaaaaaaaaAaak',
      'kaAkaaaAAaaakAak',
      'kkkkaaaAAaaakkkk',
      '...kaaaAAaaak...',
      '...kaaayyaaak...',
      '...kaaaAAaaak...',
      '...kkkkkkkkkk...'
    ],
    media: [
      '..kkkk....kkkk..',
      '.kmmmak..kammmk.',
      'kmmmmakkkkammmmk',
      'kmmmmaaaaaammmmk',
      'kkmkmlllllllmkmk',
      '..kkmlaaaaalmkk.',
      '...kmlllllllmk..',
      '...kmaaaaaaamk..',
      '...kmmmmmmmmmk..',
      '...kkkkkkkkkkk..'
    ],
    pesada: [
      '.....kkkkkk.....',
      '....kmmmmmmk....',
      '...kmcccccmmk...',
      '.kkkkmmmmmmkkkk.',
      'kaaaakkkkkkaaaak',
      'kaAmmlllllllmAak',
      'kakmmlaaaaalmmkk',
      'kk.kmmmmmmmmk.kk',
      '...kmlaaaaalk...',
      '...kmmmmmmmmk...',
      '...kkkkkkkkkk...'
    ],
    // itens gerais
    // munições (um desenho por tipo de pente)
    pente_leve: [
      '......kkkk......',
      '.....kyyyyk.....',
      '....kkkkkkkk....',
      '....kmllllmk....',
      '....kmllllmk....',
      '....kmllllmk....',
      '....kmaaaamk....',
      '....kmllllmk....',
      '....kmllllmk....',
      '....kmllllmk....',
      '....kmmmmmmk....',
      '...kkddddddkk...',
      '...kkkkkkkkkk...'
    ],
    pente_medio: [
      '...kkkk.........',
      '..kyyyyk........',
      '.kkkkkkkk.......',
      '.kmllllmk.......',
      '.kmllllmkk......',
      '..kmllllmk......',
      '..kmaaaamk......',
      '...kmllllmk.....',
      '...kmllllmkk....',
      '....kmllllmk....',
      '.....kmllllmk...',
      '.....kmmmmmmk...',
      '....kkddddddkk..',
      '....kkkkkkkkkk..'
    ],
    pente_pesado: [
      '.....kkkkkk.....',
      '.....k....k.....',
      '.kkkkkkkkkkkkkk.',
      '.kmmmmmmmmmmmmk.',
      '.kmllllllllllmk.',
      '.kmlaaaaaaaalmk.',
      '.kmlaayyyyaalmk.',
      '.kmlaaaaaaaalmk.',
      '.kmllllllllllmk.',
      '.kmmmmmmmmmmmmk.',
      '.kddddddddddddk.',
      '.kkkkkkkkkkkkkk.'
    ],
    sobrecarga: [
      '..y...y...y...y.',
      '.yyy.yyy.yyy.yyy',
      '.yyy.yyy.yyy.yyy',
      '.ooo.ooo.ooo.ooo',
      '.ooo.ooo.ooo.ooo',
      'kaaakaaakaaakaaa',
      'kAAAkAAAkAAAkAAA',
      '.ooo.ooo.ooo.ooo',
      '.ooo.ooo.ooo.ooo',
      '.ooo.ooo.ooo.ooo',
      '.GGG.GGG.GGG.GGG'
    ],
    cartuchos: [
      '.kkkk.kkkk.kkkk.',
      '.kRRk.kRRk.kRRk.',
      '.krrk.krrk.krrk.',
      '.krrk.krrk.krrk.',
      '.krrk.krrk.krrk.',
      '.krrk.krrk.krrk.',
      '.krrk.krrk.krrk.',
      '.kaak.kaak.kaak.',
      '.kyyk.kyyk.kyyk.',
      '.kyyk.kyyk.kyyk.',
      '.kGGk.kGGk.kGGk.',
      '.kkkk.kkkk.kkkk.'
    ],
    celula: [
      '......kkkk......',
      '......kmmk......',
      '...kkkkkkkkkk...',
      '...kddddddddk...',
      '...kdccccccdk...',
      '...kdcwwwccdk...',
      '...kdcwccccdk...',
      '...kdccccccdk...',
      '...kdaaaaaadk...',
      '...kdccccccdk...',
      '...kdCCCCCCdk...',
      '...kdCCCCCCdk...',
      '...kddddddddk...',
      '...kkkkkkkkkk...'
    ],
    kit: [
      '.....kkkkk......',
      '.....k...k......',
      '.kkkkkkkkkkkkk..',
      '.kwwwwwwwwwwwk..',
      '.kwwwwwrwwwwwk..',
      '.kwwwwrrrwwwwk..',
      '.kwwwwwrwwwwwk..',
      '.kllllllllllllk.',
      '.kkkkkkkkkkkkkk.'
    ],
    ferramentas: [
      '.....kkkkk......',
      '.....k...k......',
      '.kkkkkkkkkkkkk..',
      '.kooooooooooook.',
      '.kooooommkooook.',
      '.kkkkkkkkkkkkkk.',
      '.kooookmmkoooook',
      '.kooooooooooook.',
      '.kkkkkkkkkkkkkk.'
    ],
    bateria: [
      '......kkk.......',
      '....kkkmkkk.....',
      '....kdddddk.....',
      '....kdcccdk.....',
      '....kdcwcdk.....',
      '....kdcccdk.....',
      '....kdcccdk.....',
      '....kdcccdk.....',
      '....kdaaadk.....',
      '....kkkkkkk.....'
    ],
    estacao: [
      '.kkkkkkkkkkkkkk.',
      '.kmmmmmmmmmmmmk.',
      '.kmkkkkkkkkkkmk.',
      '.kmkccccccccckmk',
      '.kmkcwcccccwckmk',
      '.kmkkkkkkkkkkmk.',
      '.kmmmmmmmmmmmmk.',
      '.kdaaddddddaadk.',
      '.kkkkkkkkkkkkkk.',
      '..kk........kk..'
    ],
    frasco: [
      '......kkkk......',
      '......kmmk......',
      '......kkkk......',
      '.....kwccwk.....',
      '....kwccccwk....',
      '...kwccccccwk...',
      '...kcwccccccck..',
      '...kccccccccck..',
      '....kcccccck....',
      '.....kkkkkk.....'
    ],
    injetor: [
      '.............k..',
      '............kmk.',
      '...........kmk..',
      '..........kkk...',
      '.........kcck...',
      '........kccck...',
      '.......kccwk....',
      '......kcccak....',
      '.....kcccak.....',
      '....kkaakk......',
      '...kmkkk........',
      '..kmk...........',
      '.kk.............'
    ],
    reviver: [
      '................',
      '..kkk.....kkk...',
      '.kcccc...cccck..',
      'kccwccc.cccccck.',
      'kcwcccccccyccck.',
      'kcccccccyyccck..',
      '.kccccccyycck...',
      '..kccccyycck....',
      '...kccccyck.....',
      '....kccccck.....',
      '.....kccck......',
      '......kck.......',
      '.......k........'
    ],
    orbe: [
      '.....kkkkkk.....',
      '...kkccccccckk..',
      '..kcccwwcccccck.',
      '.kccwwwcccccccck',
      '.kccwwcccccccack',
      '.kcccccccccccack',
      '.kccccccccccaack',
      '..kcccccccaaack.',
      '...kkcccaaaakk..',
      '.....kkkkkk.....',
      '....kkmmmmmkk...',
      '...kdddddddddk..',
      '...kkkkkkkkkkk..'
    ]
  };

  // id do catálogo -> [desenho, cores trocadas]
  const ART = {
    'of-acc-red-dot': ['reddot'], 'of-acc-ampliacao': ['mira'], 'of-acc-telescopica': ['mira', { c: '#c7d0dc' }],
    'of-acc-silenciador': ['silenciador'], 'of-acc-cano-longo': ['cano'],
    'of-acc-estendido': ['carregador'], 'of-acc-escalar': ['carregador', { y: '#5fd38a' }], 'of-acc-duplo': ['carregador2'],
    'of-acc-telemetro': ['telemetro'], 'of-acc-mira-laser': ['mira_laser'],
    'of-acc-lanterna': ['lanterna', { c: '#fff3b0' }], 'of-acc-lanterna-uv': ['lanterna', { y: '#b57bff', c: '#7a4cd0' }], 'of-acc-tripe': ['tripe'],
    'of-ls-kit-medico-ls-1': ['kit'], 'of-ls-kit-tecnico-ls-2': ['ferramentas'], 'of-ls-carregador-de-campo-ls-3': ['bateria'],
    'of-ls-estacao-medica-portatil': ['estacao', { c: '#d9434a' }], 'of-ls-estacao-energetica': ['estacao'], 'of-ls-oficina-compacta': ['estacao', { c: '#e88a3a' }],
    'of-ls-estacao-clinica': ['estacao', { c: '#5fd38a' }],
    'of-ls-nano-purificador': ['frasco', { c: '#5fd38a' }], 'of-ls-antidoto-universal': ['frasco', { c: '#b57bff' }],
    'of-ls-choque-neural': ['injetor', { c: '#f2c14e' }], 'of-ls-choque-sistemico': ['injetor', { c: '#e88a3a' }],
    'of-ls-nano-injector-pv-i': ['injetor', { c: '#d9434a' }], 'of-ls-nano-injector-shield-i': ['injetor'],
    'of-ls-nano-injector-tank-i': ['injetor', { c: '#b4bdca' }], 'of-ls-nano-injector-pe-i': ['injetor', { c: '#b57bff' }],
    'of-ls-nano-injector-total': ['injetor', { c: '#f2c14e', w: '#ffffff' }], 'of-ls-nano-injector-dual': ['injetor', { c: '#5fd38a' }],
    'of-ls-auto-reviver-ls': ['reviver', { c: '#d9434a' }], 'of-ls-auto-reviver-de-campo': ['reviver', { c: '#e86a9a' }],
    'of-ls-live-service-genesis': ['orbe', { c: '#f2c14e', w: '#fff7d6' }]
  };
  const BY_TYPE = {
    pistola: 'pistola', revolver: 'revolver', rifle: 'rifle', fuzil: 'fuzil', espingarda: 'espingarda', submetralhadora: 'submetralhadora',
    metralhadora: 'metralhadora', laser: 'laser', gravitacional: 'gravitacional', hibrida: 'hibrida', portal: 'portal', lancador: 'lancador',
    leve: 'leve', media: 'media', pesada: 'pesada'
  };
  // munição: o desenho sai do tipo (pente leve, médio...); as especiais trocam a cor da ponta
  const AMMO = { 'pente-leve': 'pente_leve', 'pente-medio': 'pente_medio', 'pente-pesado': 'pente_pesado', sobrecarga: 'sobrecarga', cartuchos: 'cartuchos', 'carga-energia': 'celula' };
  const AMMO_TINT = {
    'of-mun-pente-leve-de-ponta-oca': { y: '#d9434a' }, 'of-mun-pente-medio-perfurante': { y: '#5aa6ff' },
    'of-mun-cartuchos-incendiarios': { r: '#e88a3a', R: '#b0541c' }, 'of-mun-pente-pesado-tracante': { y: '#5fd38a', o: '#c7e86a' },
    'of-mun-carga-de-energia-instavel': { c: '#f2c14e', C: '#b07a1c' }
  };

  function svgOf(rows, pal) {
    const top = Math.floor((16 - rows.length) / 2);
    let rects = '';
    rows.forEach((row, y) => {
      for (let x = 0; x < 16; x++) {
        const ch = row.charAt(x);
        if (!ch || ch === '.' || !pal[ch]) continue;
        let n = 1;
        while (x + n < 16 && row.charAt(x + n) === ch) n++;
        rects += '<rect x="' + x + '" y="' + (y + top) + '" width="' + n + '" height="1" fill="' + pal[ch] + '"/>';
        x += n - 1;
      }
    });
    return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 18 18" shape-rendering="crispEdges">' + rects + '</svg>');
  }

  const cache = {};
  // devolve a imagem de um item oficial (pelo id) ou '' quando não há desenho
  function itemArt(e) {
    if (!e || !e.id) return '';
    if (cache[e.id] !== undefined) return cache[e.id];
    let pick = ART[e.id];
    if (!pick && String(e.id).indexOf('of-') === 0 && (e.kind === 'arma-fogo' || e.kind === 'armadura') && BY_TYPE[e.typeId]) pick = [BY_TYPE[e.typeId]];
    if (!pick && String(e.id).indexOf('of-') === 0 && e.kind === 'municao' && AMMO[e.typeId]) pick = [AMMO[e.typeId], AMMO_TINT[e.id]];
    if (!pick || !SPR[pick[0]]) return (cache[e.id] = '');
    const rar = RAR[(e.values && e.values.raridade) || 'Comum'] || RAR.Comum;
    const pal = Object.assign({}, PAL, { a: rar[0], A: rar[1] }, pick[1] || {});
    return (cache[e.id] = svgOf(SPR[pick[0]], pal));
  }

  window.VORTEX_ART = { itemArt, sprites: SPR };
})();
