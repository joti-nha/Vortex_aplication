/* =====================================================================
   VORTEX | items.js
   Catálogo da Oficina (só dados, sem lógica). A tela Itens usa isto para
   montar os formulários e a sub-tela de pesquisa usa para filtrar.

   Como editar:
   - Opções de uma arma (modo, pente, alcance, empunhadura): em "opts" do
     tipo. O formulário só deixa escolher dentro dessas opções (a "média de
     criação" das regras). Tipo sem "opts" deixa escolher entre todas.
   - Slots por raridade: bloco "slots".
   - Cores de raridade: "raridadeCor".
   - Itens oficiais que já vêm no banco (acessórios, espécimes, poderes):
     lista "catalogo", no fim do arquivo.

   Tipos de campo (kind):
     text · textarea · number · select (uma opção) · multi (várias opções)
     rarity (raridade, com cor) · cards (uma opção, em cartões com descrição)
   "auto: { from, table }": quando o campo "from" muda, este campo recebe o
   valor da tabela (procurada primeiro no tipo, depois aqui em cima). É assim
   que a raridade da armadura muda a Defesa e o tipo da prótese muda o CC.
   Em select/multi, "optKey" busca as opções no tipo escolhido (type.opts)
   e, se o tipo não tiver, usa a lista geral com o nome dado em "options".
   ===================================================================== */
window.VORTEX_ITEMS = {
  raridades: ['Comum', 'Incomum', 'Rara', 'Epica', 'Lendária'],
  raridadesMod: ['Comum', 'Rara', 'Lendária'],
  raridadeCor: { 'Comum': '#9db2c1', 'Incomum': '#7fd68a', 'Rara': '#6aa8ff', 'Epica': '#c08bff', 'Lendária': '#f0b85a' },
  tiposDano: ['Cortante', 'Contundente', 'Perfurante', 'Balístico', 'Fogo', 'Ácido/químico', 'Elétrico', 'Explosivo', 'Radioativo', 'Necrótico', 'Energia', 'Impacto'],

  // listas gerais (usadas quando o tipo não limita)
  modos: ['Único', 'Semi', 'Automático', 'Contínuo'],
  pentes: ['Pente leve', 'Pente parcial', 'Pente médio', 'Pente pesado', 'Sobrecarga', 'Superaquecimento'],
  alcances: ['Curto', 'Médio', 'Longo', 'Muito longo', 'Extremo', 'Horizonte'],
  empunhaduras: ['Saque', 'Uma mão', 'Duas mãos'],
  tiposUso: ['Ferramenta', 'Consumível', 'Estação'],
  simNao: ['Não', 'Sim'],
  categoriasNpc: ['Comum', 'Maior', 'Chefão'],
  formasAtaque: ['Corpo a corpo', 'À distância', 'Tecnológico'],
  efetivoContra: ['Escudo', 'Blindagem', 'Vida'],
  // criadoras/companhias/corporações do mundo (tag opcional dos itens; só se escolhe na criação)
  fabricantes: ['Wathrever', 'Pinger', 'Live Service', 'Tnnaks'],
  // lore de cada criadora: aparece ao tocar no selo dela (escreva aqui o texto do mundo)
  fabricantesLore: {
    'Tnnaks': 'A Tnnak fabrica equipamentos de proteção voltados para uso civil, industrial e militar. Seu catálogo básico prioriza proteção confiável e produção em larga escala, enquanto os modelos especiais incorporam sistemas experimentais e propriedades próprias.',
    'Wathrever': '',
    'Pinger': '',
    'Live Service': ''
  },
  classesImplante: ['Prótese', 'Módulo'],
  // os 3 tipos de prótese/módulo: definem o custo em Carga Cibernética (CC)
  tiposImplante: [
    { value: 'Suporte', sub: '1 CC · Sistema simples para auxiliar em tarefas específicas: melhorias pequenas, funções auxiliares ou utilidades narrativas.' },
    { value: 'Operacional', sub: '2 CC · Sistema completo que substitui equipamentos, cumpre funções inteiras ou traz ferramentas integradas.' },
    { value: 'Mecânico', sub: '3 CC · Sistema avançado de alto desempenho: altera capacidades do usuário e pode conter habilidades especiais.' }
  ],
  custoCC: { 'Suporte': '1', 'Operacional': '2', 'Mecânico': '3' },
  armaduraBase: 6, // a armadura básica de todos os seres

  /* Proficiências: 4 iniciais, entre tipos de arma e de armadura */
  proficiencias: [
    { id: 'espada', label: 'Espada' }, { id: 'lanca', label: 'Lança' }, { id: 'marreta', label: 'Marreta' }, { id: 'machado', label: 'Machado' },
    { id: 'pistola', label: 'Pistola' }, { id: 'espingarda', label: 'Espingarda' }, { id: 'rifle', label: 'Rifle de precisão' }, { id: 'fuzil', label: 'Fuzil' },
    { id: 'metralhadora', label: 'Metralhadora leve' }, { id: 'submetralhadora', label: 'Submetralhadora' }, { id: 'laser', label: 'Laser' },
    { id: 'armadura-leve', label: 'Armadura leve' }, { id: 'armadura-media', label: 'Armadura média' }, { id: 'armadura-pesada', label: 'Armadura pesada' }
  ],
  paraMod: ['Qualquer arma', 'Arma de fogo', 'Arma corpo a corpo'],
  paraPropriedade: ['Qualquer item', 'Arma', 'Armadura'],
  vidaBase: ['PV', 'Blindagem', 'Escudo'],

  /* Slots (capítulo Raridade e seção Acessórios das regras) */
  slots: {
    modsPorRaridade: { 'Comum': 1, 'Incomum': 1, 'Rara': 2, 'Epica': 2, 'Lendária': 3 }, // slots de mod da arma
    custoMod: { 'Comum': 1, 'Rara': 2, 'Lendária': 3 },                                   // quantos slots o mod usa
    propArma: { 'Comum': 0, 'Incomum': 1, 'Rara': 0, 'Epica': 1, 'Lendária': 1 },         // propriedades que a arma comporta
    propArmadura: { 'Comum': 0, 'Incomum': 1, 'Rara': 0, 'Epica': 1, 'Lendária': 1 },     // idem para armadura (Lendária: uma grande)
    acessoriosPorSlot: 3,                                                                 // 1 slot de mod livre = 3 acessórios
    posicoes: {                                                                           // um acessório por posição
      'arma-fogo': ['Mira', 'Bocal', 'Carregador', 'Empunhadura'],
      'arma-melee': ['Ponta', 'Dorso', 'Empunhadura', 'Cabo']
    }
  },

  categories: [
    /* ------------------------------ Armas ------------------------------ */
    {
      id: 'arma-melee', title: 'Arma corpo a corpo', group: 'Armas', inventory: true, slots: 'arma', image: true, bonus: true,
      hint: 'Escolha o tipo: dano e carga máxima vêm da média de criação. A empunhadura decide quantas mãos a arma ocupa no inventário.',
      types: [
        { id: 'espada', title: 'Espada', sub: 'Pode atacar com Precisão; crítico causa sangramento', rule: 'armas/espada', cargaMax: 2, opts: { dano: ['Cortante'] } },
        { id: 'lanca', title: 'Lança', sub: '1,5 m de alcance por carga ocupada', rule: 'armas/lanca', cargaMax: 3, opts: { dano: ['Perfurante'] } },
        { id: 'marreta', title: 'Marreta', sub: 'Crítico atordoa; efetiva contra blindagem', rule: 'armas/marreta', cargaMax: 3, opts: { dano: ['Contundente'] } },
        { id: 'machado', title: 'Machado', sub: 'Crítico causa sangramento; efetivo contra escudos', rule: 'armas/machado', cargaMax: 3, opts: { dano: ['Contundente', 'Cortante'] } }
      ],
      fields: [
        { key: 'nome', label: 'Nome do item', kind: 'text', big: true },
        { key: 'fabricante', label: 'Criadora / companhia / corporação (opcional)', kind: 'select', options: 'fabricantes', blank: 'Nenhuma' },
        { key: 'modelo', label: 'Modelo/Fabricante', kind: 'text' },
        { key: 'raridade', label: 'Raridade', kind: 'rarity', options: 'raridades' },
        { key: 'preco', label: 'Preço (Cronos)', kind: 'text', placeholder: 'Ex.: 1.000' },
        { key: 'dano', label: 'Tipo de dano', kind: 'select', optKey: 'dano', options: 'tiposDano' },
        { key: 'empunhadura', label: 'Empunhadura', kind: 'select', options: 'empunhaduras' },
        { key: 'carga', label: 'Carga', kind: 'number', min: 0, step: 0.25, maxFrom: 'cargaMax', defaultFrom: 'cargaMax' },
        { key: 'especial', label: 'Especial', kind: 'textarea', big: true, placeholder: 'Efeitos, condições ou regras próprias deste item.' },
        { key: 'lore', label: 'Lore (opcional)', kind: 'textarea', big: true, placeholder: 'História, origem e o lugar deste item no mundo. Aparece no ícone 📜.' }
      ]
    },
    {
      id: 'arma-fogo', title: 'Arma de fogo', group: 'Armas', inventory: true, slots: 'arma', image: true, bonus: true,
      hint: 'Escolha o tipo: modo, pente, alcance e empunhadura só oferecem as opções da média de criação daquele tipo.',
      types: [
        {
          id: 'pistola', title: 'Pistola', rule: 'armas/pistola', cargaMax: 1,
          opts: { modo: ['Único', 'Semi', 'Automático'], pente: ['Pente leve'], alcance: ['Curto', 'Médio'], empunhadura: ['Uma mão', 'Duas mãos'] }
        },
        {
          id: 'revolver', title: 'Revólver', sub: 'Variante da Pistola', rule: 'armas/pistola', prof: 'pistola', cargaMax: 1,
          opts: { modo: ['Único', 'Semi'], pente: ['Pente parcial'], alcance: ['Longo'], empunhadura: ['Uma mão', 'Duas mãos'] }
        },
        {
          id: 'espingarda', title: 'Espingarda', rule: 'armas/espingarda', cargaMax: 3,
          opts: { modo: ['Único', 'Semi'], pente: ['Pente leve', 'Pente parcial', 'Pente médio'], alcance: ['Curto', 'Médio'], empunhadura: ['Duas mãos'] }
        },
        {
          id: 'espingarda-cano-curto', title: 'Espingarda de cano curto', sub: 'Variante da Espingarda', rule: 'armas/espingarda', prof: 'espingarda', cargaMax: 2,
          opts: { modo: ['Único', 'Semi'], pente: ['Pente leve', 'Pente parcial'], alcance: ['Curto'], empunhadura: ['Uma mão', 'Duas mãos'] }
        },
        {
          id: 'rifle', title: 'Rifle de precisão', rule: 'armas/rifle-de-precisao', cargaMax: 3,
          opts: { modo: ['Único', 'Semi'], pente: ['Pente médio', 'Pente parcial', 'Pente pesado'], alcance: ['Médio', 'Longo', 'Muito longo'], empunhadura: ['Duas mãos'] }
        },
        {
          id: 'fuzil', title: 'Fuzil', sub: 'Assalto, Batalha ou Precisão', rule: 'armas/fuzil', cargaMax: 3,
          opts: { modo: ['Semi', 'Automático'], pente: ['Pente médio', 'Pente pesado'], alcance: ['Médio', 'Longo'], empunhadura: ['Duas mãos'], subtipo: ['Assalto (Leve)', 'Batalha (Médio)', 'Precisão (Pesado)'] }
        },
        {
          id: 'metralhadora', title: 'Metralhadora leve', rule: 'armas/metralhadora-leve', cargaMax: 5,
          opts: { modo: ['Semi', 'Automático'], pente: ['Pente médio', 'Pente pesado', 'Sobrecarga'], alcance: ['Médio', 'Longo'], empunhadura: ['Duas mãos'] }
        },
        {
          id: 'submetralhadora', title: 'Submetralhadora', rule: 'armas/submetralhadora', cargaMax: 2,
          opts: { modo: ['Semi', 'Automático'], pente: ['Pente leve', 'Pente médio'], alcance: ['Curto', 'Médio'], empunhadura: ['Uma mão', 'Duas mãos'] }
        },
        {
          id: 'laser', title: 'Laser', rule: 'armas/laser', cargaMax: 3,
          opts: { modo: ['Contínuo'], pente: ['Pente médio', 'Sobrecarga'], alcance: ['Médio', 'Longo'], empunhadura: ['Duas mãos'] }
        },
        // tipos especiais do catálogo Wathrever (sem média de criação nas regras: escolha livre)
        { id: 'gravitacional', title: 'Gravitacional', sub: 'Puxa objetos; não causa dano direto', cargaMax: 3 },
        { id: 'hibrida', title: 'Híbrida', sub: 'Combina dois tipos de arma', cargaMax: 3 },
        { id: 'portal', title: 'Portal', sub: 'Abre portais entre dois pontos', cargaMax: 2 },
        { id: 'lancador', title: 'Lançador', sub: 'Disparos explosivos em área', cargaMax: 4 }
      ],
      fields: [
        { key: 'nome', label: 'Nome do item', kind: 'text', big: true },
        { key: 'fabricante', label: 'Criadora / companhia / corporação (opcional)', kind: 'select', options: 'fabricantes', blank: 'Nenhuma' },
        { key: 'modelo', label: 'Modelo/Fabricante', kind: 'text' },
        { key: 'raridade', label: 'Raridade', kind: 'rarity', options: 'raridades' },
        { key: 'preco', label: 'Preço (Cronos)', kind: 'text', placeholder: 'Ex.: 1.000' },
        { key: 'dano', label: 'Tipo de dano', kind: 'select', options: 'tiposDano' },
        { key: 'subtipo', label: 'Propriedade do Fuzil', kind: 'select', optKey: 'subtipo', options: [], onlyWithOpts: true },
        { key: 'modo', label: 'Modo', kind: 'multi', optKey: 'modo', options: 'modos' },
        { key: 'cadencia', label: 'Cadência (disparos por ação)', kind: 'number', min: 1, step: 1 },
        { key: 'pente', label: 'Pente/Recarga', kind: 'select', optKey: 'pente', options: 'pentes' },
        { key: 'municao', label: 'Munição (disparos por pente)', kind: 'number', min: 0, step: 1 },
        { key: 'alcance', label: 'Alcance efetivo', kind: 'select', optKey: 'alcance', options: 'alcances' },
        { key: 'empunhadura', label: 'Empunhadura', kind: 'select', optKey: 'empunhadura', options: 'empunhaduras' },
        { key: 'carga', label: 'Carga', kind: 'number', min: 0, step: 0.25, maxFrom: 'cargaMax', defaultFrom: 'cargaMax' },
        { key: 'especial', label: 'Especial', kind: 'textarea', big: true, placeholder: 'Efeitos, condições ou regras próprias deste item.' },
        { key: 'lore', label: 'Lore (opcional)', kind: 'textarea', big: true, placeholder: 'História, origem e o lugar deste item no mundo. Aparece no ícone 📜.' }
      ]
    },

    /* ------------------------------ Proteção ------------------------------ */
    {
      id: 'armadura', title: 'Armadura', group: 'Proteção', inventory: true, slots: 'armadura', image: true, bonus: true,
      hint: 'Escolha o tipo: a Defesa muda sozinha com a raridade; penalidade e carga vêm das regras.',
      types: [
        { id: 'leve', title: 'Leve', sub: 'Sem penalidade · 1 carga', rule: 'armaduras/armadura-leve', defaults: { penalidade: '0', carga: '1' }, defesaPorRaridade: { 'Comum': '5', 'Incomum': '5', 'Rara': '6', 'Epica': '6', 'Lendária': '7' } },
        { id: 'media', title: 'Média', sub: 'Penalidade –1 (–2 sem proficiência) · 3 cargas', rule: 'armaduras/armadura-media', defaults: { penalidade: '1', carga: '3' }, defesaPorRaridade: { 'Comum': '6', 'Incomum': '6', 'Rara': '7', 'Epica': '7', 'Lendária': '9' } },
        { id: 'pesada', title: 'Pesada', sub: 'Penalidade –2 (–4 sem proficiência) · 5 cargas', rule: 'armaduras/armadura-pesada', defaults: { penalidade: '2', carga: '5' }, defesaPorRaridade: { 'Comum': '8', 'Incomum': '8', 'Rara': '9', 'Epica': '9', 'Lendária': '11' } }
      ],
      fields: [
        { key: 'nome', label: 'Nome do item', kind: 'text', big: true },
        { key: 'fabricante', label: 'Criadora / companhia / corporação (opcional)', kind: 'select', options: 'fabricantes', blank: 'Nenhuma' },
        { key: 'modelo', label: 'Modelo/Fabricante', kind: 'text' },
        { key: 'raridade', label: 'Raridade', kind: 'rarity', options: 'raridades' },
        { key: 'preco', label: 'Preço (Cronos)', kind: 'text', placeholder: 'Ex.: 1.000' },
        { key: 'armadura', label: 'Defesa', kind: 'number', min: 0, step: 1, auto: { from: 'raridade', table: 'defesaPorRaridade' }, hint: 'Vem do tipo e da raridade; muda sozinha quando a raridade muda.' },
        { key: 'penalidade', label: 'Penalidade (com proficiência; sem, dobra)', kind: 'number', min: 0, step: 1 },
        { key: 'carga', label: 'Carga (só conta quando transportada)', kind: 'number', min: 0, step: 0.25 },
        { key: 'nucleo', label: 'Tem núcleo?', kind: 'select', options: 'simNao' },
        { key: 'capacidade', label: 'Capacidade do núcleo (se tiver)', kind: 'number', min: 0, step: 1 },
        { key: 'especial', label: 'Especial', kind: 'textarea', big: true, placeholder: 'Efeitos, condições ou regras próprias deste item.' },
        { key: 'lore', label: 'Lore (opcional)', kind: 'textarea', big: true, placeholder: 'História, origem e o lugar deste item no mundo. Aparece no ícone 📜.' }
      ]
    },
    {
      id: 'vestivel', title: 'Vestível', group: 'Proteção', inventory: true, image: true, bonus: true,
      hint: 'Roupas, capacetes, mochilas, luvas, botas: ocupam um espaço do corpo no inventário, sem gastar CC. Escolha a região.',
      types: [
        { id: 'cabeca', title: 'Cabeça' },
        { id: 'tronco', title: 'Tronco' },
        { id: 'membros-superiores', title: 'Membros superiores', sub: 'um braço' },
        { id: 'membros-inferiores', title: 'Membros inferiores', sub: 'uma perna' },
        { id: 'orgaos-internos', title: 'Órgãos internos' }
      ],
      fields: [
        { key: 'nome', label: 'Nome do item', kind: 'text', big: true },
        { key: 'fabricante', label: 'Criadora / companhia / corporação (opcional)', kind: 'select', options: 'fabricantes', blank: 'Nenhuma' },
        { key: 'raridade', label: 'Raridade', kind: 'rarity', options: 'raridades' },
        { key: 'preco', label: 'Preço (Cronos)', kind: 'text', placeholder: 'Ex.: 1.000' },
        { key: 'carga', label: 'Carga (só conta quando transportado)', kind: 'number', min: 0, step: 0.25 },
        { key: 'efeito', label: 'Efeito / descrição', kind: 'textarea', big: true },
        { key: 'lore', label: 'Lore (opcional)', kind: 'textarea', big: true, placeholder: 'História, origem e o lugar deste item no mundo. Aparece no ícone 📜.' }
      ]
    },

    /* ------------------------------ Implantes ------------------------------ */
    {
      id: 'nucleo', title: 'Núcleo', group: 'Implantes', inventory: true, implant: true, image: true, bonus: true,
      hint: 'Todo núcleo tem Carga 1 (não conta quando implantado) e sustenta próteses e módulos. Só um núcleo ativo por personagem.',
      defaults: { carga: '1' },
      fields: [
        { key: 'nome', label: 'Nome do item', kind: 'text', big: true },
        { key: 'fabricante', label: 'Criadora / companhia / corporação (opcional)', kind: 'select', options: 'fabricantes', blank: 'Nenhuma' },
        { key: 'modelo', label: 'Modelo/Fabricante', kind: 'text' },
        { key: 'raridade', label: 'Raridade', kind: 'rarity', options: 'raridades' },
        { key: 'preco', label: 'Preço (Cronos)', kind: 'text', placeholder: 'Ex.: 1.000' },
        { key: 'capacidade', label: 'Capacidade Cibernética', kind: 'number', min: 0, step: 1 },
        { key: 'carga', label: 'Carga', kind: 'number', min: 0, step: 0.25 },
        { key: 'especial', label: 'Especial', kind: 'textarea', big: true, placeholder: 'Efeitos, condições ou regras próprias deste item.' },
        { key: 'lore', label: 'Lore (opcional)', kind: 'textarea', big: true, placeholder: 'História, origem e o lugar deste item no mundo. Aparece no ícone 📜.' }
      ]
    },
    {
      id: 'protese-modulo', title: 'Prótese ou Módulo', group: 'Implantes', inventory: true, implant: true, image: true, bonus: true,
      hint: 'Escolha a região do corpo. Próteses ocupam o espaço daquela região no inventário (como um vestível) e gastam CC; módulos vão na fileira de módulos.',
      defaults: { classe: 'Prótese', tipo: 'Suporte', cc: '1' },
      types: [
        { id: 'cabeca', title: 'Cabeça', sub: 'olhos, ouvidos, nariz, boca', rule: 'nucleo-proteses-modulos/regioes-do-corpo' },
        { id: 'tronco', title: 'Tronco', sub: 'pescoço, espinha, tórax, abdómen, pélvis', rule: 'nucleo-proteses-modulos/regioes-do-corpo' },
        { id: 'membros-superiores', title: 'Membros superiores', sub: 'ombro, braço, antebraço, pulso, mão', rule: 'nucleo-proteses-modulos/regioes-do-corpo' },
        { id: 'membros-inferiores', title: 'Membros inferiores', sub: 'glúteos, coxas, panturrilha, joelho, pés', rule: 'nucleo-proteses-modulos/regioes-do-corpo' },
        { id: 'orgaos-internos', title: 'Órgãos internos', sub: 'esqueleto, sistemas nervoso, pulmonar, cardiovascular, digestivo', rule: 'nucleo-proteses-modulos/regioes-do-corpo' }
      ],
      fields: [
        { key: 'nome', label: 'Nome (Prótese ou Módulo)', kind: 'text', big: true },
        { key: 'fabricante', label: 'Criadora / companhia / corporação (opcional)', kind: 'select', options: 'fabricantes', blank: 'Nenhuma' },
        { key: 'classe', label: 'É prótese ou módulo?', kind: 'select', options: 'classesImplante' },
        { key: 'tipo', label: 'Tipo (define o custo em CC)', kind: 'cards', options: 'tiposImplante', big: true },
        { key: 'cc', label: 'CC (Carga Cibernética)', kind: 'number', min: 0, step: 1, auto: { from: 'tipo', table: 'custoCC' }, hint: 'Suporte 1, Operacional 2, Mecânico 3.' },
        { key: 'efeito', label: 'Efeito', kind: 'textarea', big: true },
        { key: 'lore', label: 'Lore (opcional)', kind: 'textarea', big: true, placeholder: 'História, origem e o lugar deste item no mundo. Aparece no ícone 📜.' }
      ]
    },

    /* ------------------------------ Peças de slot ------------------------------ */
    {
      id: 'mod-arma', title: 'Mod de arma', group: 'Peças de slot', slots: 'mod', bonus: true,
      hint: 'Mod é uma peça à parte: depois de salvo, é encaixado em cada arma pelos slots. A cor vem da raridade.',
      fields: [
        { key: 'nome', label: 'Nome do mod', kind: 'text', big: true },
        { key: 'fabricante', label: 'Criadora / companhia / corporação (opcional)', kind: 'select', options: 'fabricantes', blank: 'Nenhuma' },
        { key: 'raridade', label: 'Raridade (define a cor e quantos slots usa)', kind: 'rarity', options: 'raridadesMod', big: true },
        { key: 'para', label: 'Serve em', kind: 'select', options: 'paraMod' },
        { key: 'tipo', label: 'Mod (tipo)', kind: 'text' },
        { key: 'efeito', label: 'Efeito', kind: 'textarea', big: true },
        { key: 'lore', label: 'Lore (opcional)', kind: 'textarea', big: true, placeholder: 'História, origem e o lugar deste item no mundo. Aparece no ícone 📜.' }
      ]
    },
    {
      id: 'propriedade', title: 'Propriedade', group: 'Peças de slot', image: true, bonus: true,
      hint: 'Propriedades só entram em itens cuja raridade comporta (Incomum, Épica e Lendária).',
      fields: [
        { key: 'nome', label: 'Nome da propriedade', kind: 'text', big: true },
        { key: 'fabricante', label: 'Criadora / companhia / corporação (opcional)', kind: 'select', options: 'fabricantes', blank: 'Nenhuma' },
        { key: 'para', label: 'Serve em', kind: 'select', options: 'paraPropriedade' },
        { key: 'efeito', label: 'Efeito', kind: 'textarea', big: true },
        { key: 'lore', label: 'Lore (opcional)', kind: 'textarea', big: true, placeholder: 'História, origem e o lugar deste item no mundo. Aparece no ícone 📜.' }
      ]
    },
    {
      id: 'acessorio', title: 'Acessório', group: 'Peças de slot',
      hint: 'Escolha o tipo de arma. Cada posição da arma só aceita um acessório daquela posição.',
      types: [
        { id: 'arma-fogo', title: 'Para arma de fogo', sub: 'Mira, Bocal, Carregador, Empunhadura', rule: 'mods-e-acessorios/acessorios', opts: { posicao: ['Mira', 'Bocal', 'Carregador', 'Empunhadura'] } },
        { id: 'arma-melee', title: 'Para arma corpo a corpo', sub: 'Ponta, Dorso, Empunhadura, Cabo', rule: 'mods-e-acessorios/acessorios', opts: { posicao: ['Ponta', 'Dorso', 'Empunhadura', 'Cabo'] } }
      ],
      fields: [
        { key: 'nome', label: 'Nome do acessório', kind: 'text', big: true },
        { key: 'fabricante', label: 'Criadora / companhia / corporação (opcional)', kind: 'select', options: 'fabricantes', blank: 'Nenhuma' },
        { key: 'posicao', label: 'Posição (slot)', kind: 'select', optKey: 'posicao', options: [] },
        { key: 'efeito', label: 'Efeito', kind: 'textarea', big: true },
        { key: 'lore', label: 'Lore (opcional)', kind: 'textarea', big: true, placeholder: 'História, origem e o lugar deste item no mundo. Aparece no ícone 📜.' }
      ]
    },

    /* ------------------------------ Personagem ------------------------------ */
    {
      id: 'especime', title: 'Espécime', group: 'Personagem', image: true, bonus: true,
      hint: 'A espécie escolhida na ficha. A vida base diz em que tipo de resistência os PV do personagem entram na barra.',
      defaults: { vidaBase: 'PV', upInicial: '0', nucleoBase: '0', acopla: 'Não', humanidade: 'Não', eletronico: 'Não' },
      fields: [
        { key: 'nome', label: 'Nome do espécime', kind: 'text', big: true },
        { key: 'vidaBase', label: 'Vida base', kind: 'select', options: 'vidaBase' },
        { key: 'upInicial', label: 'UP iniciais', kind: 'number', min: 0, step: 1 },
        { key: 'nucleoBase', label: 'Núcleo de nascença (capacidade)', kind: 'number', min: 0, step: 1 },
        { key: 'acopla', label: 'Engenharia: acopla armas e armaduras na Carga Cibernética?', kind: 'select', options: 'simNao' },
        { key: 'humanidade', label: 'Humanidade: regenera vida no descanso como um ser orgânico e resiste ao atordoamento de PE?', kind: 'select', options: 'simNao' },
        { key: 'eletronico', label: 'Ser elétrico ou eletrônico (efeitos de PE atordoam)?', kind: 'select', options: 'simNao' },
        { key: 'descricao', label: 'Descrição', kind: 'textarea', big: true },
        { key: 'tracos', label: 'Traços e regras', kind: 'textarea', big: true },
        { key: 'lore', label: 'Lore (opcional)', kind: 'textarea', big: true, placeholder: 'História, origem e o lugar deste item no mundo. Aparece no ícone 📜.' }
      ]
    },
    {
      id: 'poder', title: 'Poder', group: 'Personagem', image: true, bonus: true,
      hint: 'Poderes e habilidades. Os bônus automáticos (PV, Escudo, Blindagem...) entram sozinhos na ficha de quem tiver o poder.',
      fields: [
        { key: 'nome', label: 'Nome do poder', kind: 'text', big: true },
        { key: 'custo', label: 'Custo (UP)', kind: 'number', min: 0, step: 1 },
        { key: 'custoUso', label: 'Custo de uso (PE, PA...)', kind: 'text' },
        { key: 'efeito', label: 'Efeito', kind: 'textarea', big: true },
        { key: 'lore', label: 'Lore (opcional)', kind: 'textarea', big: true, placeholder: 'História, origem e o lugar deste item no mundo. Aparece no ícone 📜.' }
      ]
    },

    {
      id: 'origem', title: 'Origem', group: 'Personagem',
      hint: 'De onde o personagem vem. Os itens iniciais (um por linha) aparecem na distribuição inicial, no kit da origem.',
      fields: [
        { key: 'nome', label: 'Nome da origem', kind: 'text', big: true },
        { key: 'descricao', label: 'Descrição', kind: 'textarea', big: true },
        { key: 'itens', label: 'Itens iniciais (um por linha)', kind: 'textarea', big: true, placeholder: '1 pistola básica ou rifle (3 slots de munição);' },
        { key: 'lore', label: 'Lore (opcional)', kind: 'textarea', big: true, placeholder: 'História, origem e o lugar deste item no mundo. Aparece no ícone 📜.' }
      ]
    },

    /* ------------------------------ Ameaças ------------------------------ */
    {
      id: 'npc', title: 'NPC / Inimigo', group: 'Ameaças', image: true,
      hint: 'Monstros, inimigos e NPCs da lista aberta: qualquer mestre pode colocar na campanha. Defesa mínima = armadura + Corpo + Resistência.',
      defaults: { categoria: 'Comum', up: '0', corpo: '1', precisao: '1', essencia: '0', luta: '1', mira: '1', operacoes: '0', resistencia: '1', armadura: '6', pv: '10', escudo: '0', blindagem: '0', cadencia: '1', ataque: 'Corpo a corpo' },
      fields: [
        { key: 'nome', label: 'Nome', kind: 'text', big: true },
        { key: 'categoria', label: 'Categoria (XP)', kind: 'select', options: 'categoriasNpc' },
        { key: 'up', label: 'UP (para a dificuldade do encontro)', kind: 'number', min: 0, step: 1 },
        { key: 'corpo', label: 'Corpo', kind: 'number', min: -1, step: 1 },
        { key: 'precisao', label: 'Precisão', kind: 'number', min: -1, step: 1 },
        { key: 'essencia', label: 'Essência', kind: 'number', min: -1, step: 1 },
        { key: 'luta', label: 'Luta', kind: 'number', min: 0, step: 1 },
        { key: 'mira', label: 'Mira', kind: 'number', min: 0, step: 1 },
        { key: 'operacoes', label: 'Operações', kind: 'number', min: 0, step: 1 },
        { key: 'resistencia', label: 'Resistência', kind: 'number', min: 0, step: 1 },
        { key: 'armadura', label: 'Armadura', kind: 'number', min: 0, step: 1 },
        { key: 'pv', label: 'PV máximo', kind: 'number', min: 0, step: 1 },
        { key: 'escudo', label: 'Escudo', kind: 'number', min: 0, step: 1 },
        { key: 'blindagem', label: 'Blindagem', kind: 'number', min: 0, step: 1 },
        { key: 'ataque', label: 'Ataque principal', kind: 'select', options: 'formasAtaque' },
        { key: 'arma', label: 'Arma ou ataque (nome)', kind: 'text', placeholder: 'Ex.: Garras, Fuzil de assalto' },
        { key: 'dano', label: 'Tipos de dano do ataque', kind: 'multi', options: 'tiposDano' },
        { key: 'cadencia', label: 'Cadência (disparos por ação)', kind: 'number', min: 1, step: 1 },
        { key: 'efetivo', label: 'Efetivo contra (como arma de tipo)', kind: 'select', options: 'efetivoContra', blank: 'Nada' },
        { key: 'descricao', label: 'Descrição e habilidades', kind: 'textarea', big: true },
        { key: 'lore', label: 'Lore (opcional)', kind: 'textarea', big: true, placeholder: 'História e lugar desta ameaça no mundo. Aparece no ícone 📜.' }
      ]
    },

    /* ------------------------------ Geral ------------------------------ */
    {
      id: 'item-geral', title: 'Item geral', group: 'Geral', inventory: true, image: true, bonus: true,
      hint: 'Kits, consumíveis, ferramentas, munição e qualquer coisa que ocupe carga. Com empunhadura, pode ir para as mãos.',
      fields: [
        { key: 'nome', label: 'Nome do item', kind: 'text', big: true },
        { key: 'fabricante', label: 'Criadora / companhia / corporação (opcional)', kind: 'select', options: 'fabricantes', blank: 'Nenhuma' },
        { key: 'raridade', label: 'Raridade', kind: 'rarity', options: 'raridades' },
        { key: 'preco', label: 'Preço (Cronos)', kind: 'text', placeholder: 'Ex.: 1.000' },
        { key: 'empunhadura', label: 'Empunhadura', kind: 'select', options: 'empunhaduras' },
        { key: 'carga', label: 'Carga', kind: 'number', min: 0, step: 0.25 },
        { key: 'tipoUso', label: 'Tipo de uso', kind: 'select', options: 'tiposUso', blank: '—' },
        { key: 'usos', label: 'Usos (consumíveis)', kind: 'number', min: 0, step: 1 },
        { key: 'bonusRec', label: 'Bônus de recuperação', kind: 'text', placeholder: 'Ex.: +5 PV' },
        { key: 'efeito', label: 'Efeito / descrição', kind: 'textarea', big: true },
        { key: 'especial', label: 'Especial', kind: 'textarea', big: true, placeholder: 'Efeitos, condições ou regras próprias deste item.' },
        { key: 'lore', label: 'Lore (opcional)', kind: 'textarea', big: true, placeholder: 'História, origem e o lugar deste item no mundo. Aparece no ícone 📜.' }
      ]
    }
  ],

  /* -----------------------------------------------------------------
     Catálogo oficial: o que as regras já trazem pronto. Aparece na
     pesquisa com o selo "Oficial" e não pode ser editado pelo site.
     ----------------------------------------------------------------- */
  catalogo: [
    // Acessórios de arma de fogo
    { id: 'of-acc-red-dot', kind: 'acessorio', typeId: 'arma-fogo', name: 'Red dot/Holográfica', values: { posicao: 'Mira', efeito: 'Ignora a dificuldade de percepção de média distância e cobertura parcial na mesma distância quando estiver mirando.' } },
    { id: 'of-acc-ampliacao', kind: 'acessorio', typeId: 'arma-fogo', name: 'Ampliação', values: { posicao: 'Mira', efeito: 'Ignora a dificuldade de percepção de média distância a longa e cobertura parcial nas mesmas distâncias quando estiver mirando.' } },
    { id: 'of-acc-telescopica', kind: 'acessorio', typeId: 'arma-fogo', name: 'Telescópica', values: { posicao: 'Mira', efeito: 'Ignora a dificuldade de percepção de longa, a muito longa distância e cobertura leve nas mesmas distâncias quando estiver mirando.' } },
    { id: 'of-acc-silenciador', kind: 'acessorio', typeId: 'arma-fogo', name: 'Silenciador', values: { posicao: 'Bocal', efeito: 'Pode se fazer teste de furtividade para disparos.' } },
    { id: 'of-acc-cano-longo', kind: 'acessorio', typeId: 'arma-fogo', name: 'Cano longo', values: { posicao: 'Bocal', efeito: 'Aumenta em uma categoria o alcance da arma.' } },
    { id: 'of-acc-estendido', kind: 'acessorio', typeId: 'arma-fogo', name: 'Carregador estendido', values: { posicao: 'Carregador', efeito: 'Chegue ao limite de munições do tiro de munição.' } },
    { id: 'of-acc-escalar', kind: 'acessorio', typeId: 'arma-fogo', name: 'Carregador escalar', values: { posicao: 'Carregador', efeito: 'Aumenta de leve para médio, de médio para pesado, e vice versa.' } },
    { id: 'of-acc-duplo', kind: 'acessorio', typeId: 'arma-fogo', name: 'Carregador duplo', values: { posicao: 'Carregador', efeito: 'Se o carregador contiver no máximo 30 munições, se pode carregar usando ação bônus, uma vez sim, outra não.' } },
    { id: 'of-acc-telemetro', kind: 'acessorio', typeId: 'arma-fogo', name: 'Telêmetro', values: { posicao: 'Empunhadura', efeito: 'Contabiliza a distância que você está mirando em tempo real.' } },
    { id: 'of-acc-mira-laser', kind: 'acessorio', typeId: 'arma-fogo', name: 'Mira laser', values: { posicao: 'Empunhadura', efeito: 'Ignora a dificuldade de percepção de média distância e cobertura parcial na mesma distância. -1 em furtividade a curta a média distância.' } },
    { id: 'of-acc-lanterna', kind: 'acessorio', typeId: 'arma-fogo', name: 'Lanterna', values: { posicao: 'Empunhadura', efeito: 'Pode ligar quando quiser, te concede uma fonte de luz frontal (cone) da arma de 9 metros à sua frente.' } },
    { id: 'of-acc-lanterna-uv', kind: 'acessorio', typeId: 'arma-fogo', name: 'Lanterna UV', values: { posicao: 'Empunhadura', efeito: 'Como lanterna, mas é uma luz UV que não serve para enxergar no escuro.' } },
    { id: 'of-acc-tripe', kind: 'acessorio', typeId: 'arma-fogo', name: 'Tripé', values: { posicao: 'Empunhadura', efeito: 'Use somente uma ação de movimento para apoiar a arma (em vez de ação completa).' } },

    // Espécimes
    {
      id: 'of-esp-humano', kind: 'especime', name: 'Humano',
      values: { vidaBase: 'PV', upInicial: '3', nucleoBase: '0', descricao: 'Nada de especial, talvez sua experiência passada.', tracos: 'Tome 3 Up points de início! Opcional (experiência mundana): 26 a 30 anos, 4 UP e 1 Perda; 31 a 40 anos, 5 UP e 2 Perdas; 41 a 60 anos, 6 UP e 3 Perdas; mais que isso, até 10 UP e um valor igual de Perdas.' }
    },
    {
      id: 'of-esp-robo', kind: 'especime', name: 'Robô',
      values: { vidaBase: 'Blindagem', upInicial: '0', nucleoBase: '2', eletronico: 'Sim', descricao: 'Meio que é… feito de lata né não?', tracos: 'Núcleo: contém um núcleo +2 comum desde o início; os PV são convertidos para blindagem e os negativos contam como Shield. Engenharia: não equipa itens, acopla (ao menos 1 hora). Não vivo: não é afetado por coisas biológicas, não recupera PV por descanso nem curas; é consertado com Tecnologia e um kit de ferramentas.' }
    },
    {
      id: 'of-esp-android', kind: 'especime', name: 'Android',
      values: { vidaBase: 'Blindagem', upInicial: '0', nucleoBase: '2', acopla: 'Sim', humanidade: 'Sim', eletronico: 'Sim', descricao: 'Você é um robô, só que humanoide...', tracos: 'Engenharia: não equipa, acopla (ao menos 1 hora). Armas e armaduras acopladas ocupam a Carga Cibernética em vez da carga; +1 de Carga Cibernética a cada +2 de carga dada pelo núcleo. Próteses são peças, e módulos não precisam de prótese. Núcleo: núcleo +2 comum desde o início; os PV viram blindagem e os negativos contam como Shield. Humanidade: resiste a efeitos de PE (não é atordoado automaticamente como outros seres eletrônicos) e se regenera como um ser orgânico, e também por engenharia e bateria.' }
    },

    // NPCs e inimigos de exemplo (lista aberta da campanha)
    { id: 'of-npc-saqueador', kind: 'npc', name: 'Saqueador de Ferro-Velho', values: { categoria: 'Comum', up: '1', corpo: '1', precisao: '1', essencia: '0', luta: '1', mira: '1', operacoes: '0', resistencia: '1', armadura: '6', pv: '10', escudo: '0', blindagem: '0', ataque: 'À distância', arma: 'Pistola improvisada', dano: 'Balístico', cadencia: '2', descricao: 'Ataca em grupo e foge quando metade do bando cai.' } },
    { id: 'of-npc-drone', kind: 'npc', name: 'Drone de Segurança', values: { categoria: 'Comum', up: '2', corpo: '0', precisao: '2', essencia: '0', luta: '0', mira: '2', operacoes: '0', resistencia: '1', armadura: '6', pv: '0', escudo: '6', blindagem: '8', ataque: 'À distância', arma: 'Laser de patrulha', dano: 'Fogo', cadencia: '1', descricao: 'Ser eletrônico: efeitos de PE o atordoam.' } },
    { id: 'of-npc-mutante', kind: 'npc', name: 'Mutante Radioativo', values: { categoria: 'Maior', up: '4', corpo: '3', precisao: '0', essencia: '1', luta: '2', mira: '0', operacoes: '0', resistencia: '2', armadura: '7', pv: '25', escudo: '0', blindagem: '0', ataque: 'Corpo a corpo', arma: 'Garras', dano: 'Cortante, Radioativo', cadencia: '1', descricao: 'Avança sobre o alvo mais próximo.' } },
    { id: 'of-npc-mecha', kind: 'npc', name: 'Mecha de Contenção', values: { categoria: 'Chefão', up: '10', corpo: '4', precisao: '2', essencia: '1', luta: '2', mira: '3', operacoes: '1', resistencia: '3', armadura: '9', pv: '20', escudo: '15', blindagem: '30', ataque: 'À distância', arma: 'Metralhadora rotativa', dano: 'Balístico, Explosivo', cadencia: '5', efetivo: 'Blindagem', descricao: 'Camadas de escudo e blindagem antes do piloto.' } },

    // Poderes (capítulo Habilidades)
    { id: 'of-pod-esquiva', kind: 'poder', name: 'Esquiva', values: { custo: '1', efeito: 'Use precisão como atributo básico, e reflexo como perícia para os testes de defesa. Pode gastar +1 Up point para contar na defesa básica também.' } },
    { id: 'of-pod-regeneracao', kind: 'poder', name: 'Regeneração', values: { custo: '2', efeito: 'Se for uma criatura biológica, recupere 3 PVs por turno. Se caído, pode recobrar a consciência quando recuperar todos os PV. A cada Up point acima do primeiro, +1 na recuperação de PVs.' } },
    { id: 'of-pod-transformacao', kind: 'poder', name: 'Transformação', values: { efeito: 'Com uma ação completa você se transforma; cria uma transformação trocando seus Up points e os realocando como quiser. Seus itens caem ao chão no processo. Cada Up point equivale a uma transformação.' } },
    { id: 'of-pod-akimbo', kind: 'poder', name: 'Akimbo', values: { efeito: 'Empunhe pistolas ou submetralhadoras uma em cada mão. O tempo de recarga aumenta em uma categoria. Pode mirar em um único alvo com ambas ou escolher até dois alvos; faz um teste de ataque com cada arma, que aplicam dano separadamente.' } },
    { id: 'of-pod-gatilho', kind: 'poder', name: 'Gatilho do velho mundo', values: { efeito: 'Com um revólver de disparo único, obtém cadência igual a 1 + metade da precisão (para cima). O primeiro disparo não conta na penalidade de cadência. Precisa da outra mão livre.' } }
  ]
};

/* -----------------------------------------------------------------
   Catálogo Tnnak (armaduras) e Wathrever (armas de fogo), com preço
   em Cronos. Uma linha por item; o bloco no fim transforma cada linha
   numa entrada do catálogo oficial.
   ----------------------------------------------------------------- */
(function () {
  var cat = window.VORTEX_ITEMS.catalogo;
  var slug = function (n) { return n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); };

  /* Armaduras Tnnak: [nome, tipo, raridade, armadura, penalidade, carga, preço, especial] */
  var TIPO_ARMADURA = { 'Leve': 'leve', 'Média': 'media', 'Pesada': 'pesada' };
  [
    ['Tnnaks Jackt', 'Leve', 'Comum', 5, 0, 1, '1.000'],
    ['Tnnak Blazer', 'Média', 'Comum', 6, 1, 3, '3.000'],
    ['Tnnak Parka', 'Pesada', 'Comum', 8, 2, 5, '5.000'],
    ['Tnnak Guard-L', 'Leve', 'Incomum', 5, 0, 1, '2.000', 'Propriedade: 1'],
    ['Tnnak Guard-M', 'Média', 'Incomum', 6, 1, 3, '6.000', 'Propriedade: 1'],
    ['Tnnak Guard-H', 'Pesada', 'Incomum', 8, 2, 5, '10.000', 'Propriedade: 1'],
    ['Tnnak Shalt-L', 'Leve', 'Rara', 6, 0, 1, '3.500'],
    ['Tnnak Ki-l-l-M', 'Média', 'Rara', 7, 1, 3, '10.500'],
    ['Tnnak Siege-H', 'Pesada', 'Rara', 9, 2, 5, '17.500'],
    ['Tnnak Teclack', 'Leve', 'Epica', 6, 0, 1, '6.500', 'Propriedade: 1'],
    ['Tnnak Umbra & Flex', 'Média', 'Epica', 7, 1, 3, '19.500', 'Propriedade: 1'],
    ['Tnnak Brut', 'Pesada', 'Epica', 9, 2, 5, '32.500', 'Propriedade: 1'],
    ['Mirage', 'Leve', 'Lendária', 7, 0, 1, '12.000',
      'Propriedade: 1 + Especial: OVER-R.E.S\nA armadura é equipada com módulo de radar (todos), módulo de I.A (Combate), e módulo perito (Precisão), por fim, módulo de rede. Esses módulos não dependem de núcleo e funcionam em qualquer condição, menos quando o equipamento for destruído, essa armadura pode assumir a forma de outras roupas comuns.'],
    ['Heavy-Metal', 'Média', 'Lendária', 9, 1, 3, '36.000',
      'Propriedade: 1 + Especial: Hora do Show!\nUtilize 5 PE. Pelo restante da cena, sua Armadura aumenta em +3, você entra em chamas e se torna Imune a Fogo.\nEnquanto estiver sob este efeito, qualquer criatura que realizar um ataque contra você a uma distância adjacente recebe 2d6 de dano de fogo.\nAlém disso, todos os seus ataques passam a causar dano de fogo adicional e aplicam o efeito Incendiar. O dano causado por esta fonte pode se acumular normalmente.\nDurante a duração, você possui vantagem em testes realizados com armas ou instrumentos que possuam as palavras-chave Ritmo ou Musical.'],
    ['Juggernaut', 'Pesada', 'Lendária', 11, 2, 5, '60.000',
      'Propriedade: 1 + Especial: Steamroller\nSempre que se desloca em linha reta. Você recebe +1 no próximo ataque ou manobra para cada 3 metros percorridos, até um máximo igual ao seu Corpo.\nAo mesmo tempo, recebe um bônus de Armadura igual ao valor acumulado, que permanece até o início do seu próximo turno.\nSe utilizar esse impulso durante uma queda e atingir uma criatura ao aterrissar, você pode transferir a queda e seu dano para o alvo escolhido em vez de sofrê-lo.']
  ].forEach(function (a) {
    cat.push({
      id: 'of-arm-' + slug(a[0]), kind: 'armadura', typeId: TIPO_ARMADURA[a[1]], name: a[0],
      values: { fabricante: 'Tnnaks', modelo: 'Tnnak', raridade: a[2], preco: a[6], armadura: String(a[3]), penalidade: String(a[4]), carga: String(a[5]), nucleo: 'Não', especial: a[7] || '' }
    });
  });

  /* Armas Wathrever: [nome, tipo, modelo, raridade, dano, cadência, munição, recarga, alcance, carga, empunhadura, preço, especial]
     Carga/empunhadura entre colchetes no comentário = não vieram na ficha do item; usamos o padrão de uma arma parecida. */
  var TIPO_ARMA = { 'Pistola': 'pistola', 'Revólver': 'revolver', 'Rifle': 'rifle', 'Espingarda': 'espingarda', 'Submetralhadora': 'submetralhadora', 'Metralhadora': 'metralhadora', 'Fuzil': 'fuzil', 'Laser': 'laser', 'Gravitacional': 'gravitacional', 'Híbrida': 'hibrida', 'Portal': 'portal', 'Lançador': 'lancador' };
  var PENTE = { 'Leve': 'Pente leve', 'Parcial': 'Pente parcial', 'Médio': 'Pente médio', 'Pesado': 'Pente pesado', 'Superaquecimento': 'Superaquecimento' };
  [
    ['Pulse P-01', 'Pistola', 'Pulse P-01', 'Comum', 'Balístico', 2, 14, 'Leve', 'Médio', 1, 'Uma mão', '250'],
    ['Iron Revolver ER-2', 'Revólver', 'ER-2', 'Comum', 'Balístico', 1, 6, 'Parcial', 'Médio', 1, 'Uma mão', '300'],
    ['Carbine R-10', 'Rifle', 'R-10', 'Comum', 'Balístico', 2, 18, 'Leve', 'Longo', 2, 'Duas mãos', '500'],
    ['Crusher SG-4', 'Espingarda', 'SG-4', 'Comum', 'Balístico', 1, 8, 'Parcial', 'Curto', 2, 'Duas mãos', '450'],
    ['Storm SM-5', 'Submetralhadora', 'SM-5', 'Comum', 'Balístico', 4, 28, 'Médio', 'Curto', 2, 'Duas mãos', '400'],
    ['Bastion MG-1', 'Metralhadora', 'MG-1', 'Comum', 'Balístico', 6, 60, 'Pesado', 'Longo', 4, 'Duas mãos', '1.250'],
    ['Helix P-20', 'Pistola', 'P-20', 'Incomum', 'Energia', 2, 18, 'Leve', 'Médio', 1, 'Uma mão', '500', 'Propriedade: 1'], // [carga/empunhadura]
    ['Hammer F-12', 'Fuzil', 'F-12', 'Incomum', 'Energia', 3, 24, 'Médio', 'Longo', 2, 'Duas mãos', '850', 'Propriedade: 1'],
    ['Cyclops SG-9', 'Espingarda', 'SG-9', 'Incomum', 'Fogo', 2, 10, 'Parcial', 'Curto', 2, 'Duas mãos', '700', 'Propriedade: 1'], // [carga/empunhadura]
    ['Viper L-1', 'Laser', 'L-1', 'Incomum', 'Ácido/químico', 1, 3, 'Superaquecimento', 'Muito longo', 2, 'Duas mãos', '900', 'Propriedade: 1'],
    ['Suppressor SM-9', 'Submetralhadora', 'SM-9', 'Incomum', 'Balístico', 5, 36, 'Médio', 'Médio', 2, 'Duas mãos', '650', 'Propriedade: 1'], // [carga/empunhadura]
    ['Titan F-30', 'Fuzil', 'F-30', 'Rara', 'Balístico', 3, 30, 'Médio', 'Muito longo', 2, 'Duas mãos', '1.250'], // [carga/empunhadura]
    ['Atlas MG-8', 'Metralhadora', 'MG-8', 'Rara', 'Fogo', 7, 80, 'Pesado', 'Longo', 4, 'Duas mãos', '1.900'], // [carga/empunhadura]
    ['Nova L-7', 'Laser', 'L-7', 'Rara', 'Energia', 2, 5, 'Superaquecimento', 'Extremo', 2, 'Duas mãos', '1.300'], // [carga/empunhadura]
    ['Quasar G-4', 'Gravitacional', 'G-4', 'Rara', 'Impacto', 1, 10, 'Pesado', 'Médio', 2, 'Duas mãos', '1.600', // [carga/empunhadura]
      'Especial (tipo): Essa arma não causa dano diretamente.\nEm alcance curto você pode utilizar essa arma para puxar objetos do cenário ou em posse de outro (ação de movimento/teste contra), efetivo contra construções.'],
    ['Hydra H-2', 'Híbrida', 'H-2', 'Rara', 'Balístico', 2, 18, 'Leve', 'Longo', 2, 'Duas mãos', '2.100', 'Híbrida (Escopeta/Rifle)'], // [carga/empunhadura]
    ['Jesper 4k', 'Portal', 'Jas', 'Epica', '', 1, 8, 'Pesado', 'Curto', 1, 'Uma mão', '2.600', // [carga/empunhadura]
      'Portal: Permite ao usuário abrir um portal entre 2 pontos, atravessar um dos pontos te faz aparecer no outro, cada carga gera o portal de saída e o de entrada, o portal consome 1 projétil por rodada enquanto estiver em campo, sem cargas ele se dissipa.'],
    ['Leviathan MG-X', 'Metralhadora', 'MG-X', 'Epica', 'Energia', 8, 120, 'Pesado', 'Longo', 4, 'Duas mãos', '2.700', 'Propriedade: 1'], // [carga/empunhadura]
    ['Hyperion LX', 'Lançador', 'LX', 'Epica', 'Explosivo', 1, 3, 'Parcial', 'Longo', 3, 'Duas mãos', '2.100', 'Propriedade: 1\nDano: Explosão (4x4/3m³)'], // [carga/empunhadura]
    ['ODIN-ONE', 'Híbrida', 'ODIN-01', 'Lendária', 'Balístico', 5, 30, 'Médio', 'Horizonte', 3, 'Duas mãos', '4.700',
      'Híbrida (Rifle/Fuzil)\nPropriedade: 1 + Especial: Demolidor.\nSeus disparos ignoram cobertura até total (não blindada), é efetivo contra escudos e blindagens.']
  ].forEach(function (a) {
    cat.push({
      id: 'of-wat-' + slug(a[0]), kind: 'arma-fogo', typeId: TIPO_ARMA[a[1]], name: a[0],
      values: {
        fabricante: 'Wathrever', modelo: a[2] + ' / Wathrever', raridade: a[3], preco: a[11], dano: a[4], cadencia: String(a[5]), municao: String(a[6]),
        pente: PENTE[a[7]], alcance: a[8], carga: String(a[9]), empunhadura: a[10], especial: a[12] || ''
      }
    });
  });

  /* Origens do livro (capítulo Origens de regras.js), para buscar no banco como os espécimes */
  var regras = (window.VORTEX_REGRAS && window.VORTEX_REGRAS.chapters) || [];
  var origens = regras.filter(function (c) { return c.id === 'origens'; })[0];
  (origens ? origens.blocks : []).filter(function (b) { return b[0] === 'card'; }).forEach(function (b) {
    var p = b[2].filter(function (x) { return x[0] === 'p'; })[0];
    var ul = b[2].filter(function (x) { return x[0] === 'ul'; })[0];
    cat.push({ id: 'of-ori-' + slug(b[1]), kind: 'origem', typeId: '', name: b[1], values: { descricao: p ? p[1] : '', itens: (ul ? ul[1] : []).join('\n') } });
  });

  /* Live Service (itens gerais de recuperação): [nome, raridade, tipo, usos, carga, bônus, efeito, preço] */
  [
    ['Kit Médico LS-1', 'Comum', 'Ferramenta', '', 1, '', 'Permite recuperar PV com medicina.', '200'],
    ['Kit Técnico LS-2', 'Comum', 'Ferramenta', '', 1, '', 'Permite recuperar Blindagem com engenharia/Tecnologia.', '200'],
    ['Carregador de Campo LS-3', 'Comum', 'Ferramenta', '', 1, '', 'Permite recuperar Escudos com operações.', '200'],
    ['Estação Médica Portátil', 'Comum', 'Estação', '', 3, '', 'Concede +2 em testes para recuperar PV com medicina.', '600'],
    ['Estação Energética', 'Comum', 'Estação', '', 3, '', 'Concede +2 em testes para recuperar Escudos usando operações.', '600'],
    ['Oficina Compacta', 'Comum', 'Estação', '', 3, '', 'Concede +2 em testes para recuperar Blindagem usando engenharia/tecnologia.', '600'],
    ['Nano Purificador', 'Incomum', 'Consumível', '', 1, '', 'Remove 1 condição negativa.', '400'],
    ['Antídoto Universal', 'Incomum', 'Consumível', '', 1, '', 'Remove todas as condições.', '500'],
    ['Choque Neural', 'Incomum', 'Consumível', '', 1, '', 'Remove todas as condições mentais.', '550'],
    ['Choque Sistêmico', 'Incomum', 'Consumível', '', 1, '', 'Remove todas as condições físicas.', '650'],
    ['Estação Clínica', 'Incomum', 'Estação', '', 5, '', 'Concede +5 em todos os testes de recuperação.', '1.200'],
    ['Nano Injector PV-I', 'Rara', 'Consumível', '3', 1, '+5 PV', 'Permite recuperar PV com medicina.', '900'],
    ['Nano Injector Shield-I', 'Rara', 'Consumível', '3', 1, '+5 Escudo', 'Permite recuperar Escudo com operações.', '900'],
    ['Nano Injector Tank-I', 'Rara', 'Consumível', '3', 1, '+5 Blindagem', 'Permite recuperar Blindagem com engenharia/tecnologia.', '900'],
    ['Nano Injector PE-I', 'Rara', 'Consumível', '3', 1, '', 'Recupera 1d6 + 2 PE.', '1.100'],
    ['Auto Reviver LS', 'Rara', 'Consumível', '', 2, '', 'Ao entrar em estado de morrendo, ativa automaticamente: você levanta com 5 do seu recurso vital na próxima rodada.\nVocê pode optar por ele estar ativado ou não.', '1.600'],
    ['Nano Injector Total', 'Epica', 'Consumível', '5', 1, '+10', 'Remove todas as condições e recupera um recurso à sua escolha entre PV, E e BL, com suas respectivas perícias chaves.', '1.700'],
    ['Nano Injector Dual', 'Epica', 'Consumível', '5', 1, '', 'Escolha dois recursos entre PV, Escudo e Blindagem. Você faz o teste de cura que preferir com a maior CD dentre os dois e recupera ambos.', '2.100'],
    ['Auto Reviver de Campo', 'Epica', 'Consumível', '', 3, '', 'Pode ser utilizado em até 3 criaturas inconscientes ou morrendo em até alcance Curto.\nCada alvo retorna com metade de cada um de seus recursos recuperados.', '2.800'],
    ['Live Service Genesis', 'Lendária', 'Consumível', '', 2, '', 'Recupera automaticamente todos os seus recursos.\nRemove todas as condições negativas.\nTambém pode ser utilizado em um personagem morto há no máximo um dia, restaurando-o imediatamente aos valores acima.', '5.000']
  ].forEach(function (a) {
    cat.push({
      id: 'of-ls-' + slug(a[0]), kind: 'item-geral', typeId: '', name: a[0],
      values: { fabricante: 'Live Service', raridade: a[1], tipoUso: a[2], usos: a[3], carga: String(a[4]), bonusRec: a[5], efeito: a[6], preco: a[7] }
    });
  });
})();