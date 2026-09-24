/* =====================================================================
   VORTEX | items.js
   Catálogo de itens (só dados). A tela Itens usa isto para montar o
   formulário: escolha a categoria, escolha o tipo (quando existir) e o
   formulário já vem com os valores da "média de criação" das regras,
   prontos para editar.
   ===================================================================== */
window.VORTEX_ITEMS = {
  raridades: ['Comum', 'Incomum', 'Rara', 'Epica', 'Lendária'],
  tiposDano: ['Cortante', 'Contundente', 'Perfurante', 'Balístico', 'Fogo', 'Ácido/químico', 'Elétrico', 'Explosivo', 'Radioativo', 'Necrótico'],

  categories: [
    {
      id: 'arma-melee', title: 'Arma corpo a corpo', group: 'Armas',
      hint: 'As regras desta versão não definem tipos específicos de arma corpo a corpo; preencha livremente.',
      fields: [
        { key: 'nome', label: 'Nome do item', kind: 'text', big: true },
        { key: 'modelo', label: 'Modelo/Fabricante', kind: 'text' },
        { key: 'raridade', label: 'Raridade', kind: 'select', options: 'raridades' },
        { key: 'dano', label: 'Tipo de dano', kind: 'select', options: 'tiposDano' },
        { key: 'carga', label: 'Carga', kind: 'text' },
        { key: 'modificador', label: 'Modificador', kind: 'text' }
      ]
    },
    {
      id: 'arma-fogo', title: 'Arma de fogo', group: 'Armas',
      hint: 'Escolha o tipo: pente, modo e alcance já vêm preenchidos com a média de criação das regras.',
      types: [
        { id: 'pistola', title: 'Pistola', rule: 'armas/pistola', defaults: { pente: 'Pente leve', modo: 'Semi, único e automático', carga: '1', alcance: 'Curto a Médio' } },
        { id: 'revolver', title: 'Revólver (variante da Pistola)', rule: 'armas/pistola', defaults: { pente: 'Pente parcial', modo: 'Único e semi automático', carga: '1', alcance: 'Longo' } },
        { id: 'espingarda', title: 'Espingarda', rule: 'armas/espingarda', defaults: { pente: 'Pente leve, parcial ou médio', modo: 'Semi e único', carga: '3', alcance: 'Curto a médio' } },
        { id: 'espingarda-cano-curto', title: 'Espingarda de cano curto', rule: 'armas/espingarda', defaults: { pente: 'Pente leve ou parcial', modo: 'Semi e único', carga: '2', alcance: 'Curto' } },
        { id: 'rifle', title: 'Rifle', rule: 'armas/rifle', defaults: { pente: '', modo: '', carga: '', alcance: '' } },
        { id: 'submetralhadora', title: 'Submetralhadora', rule: 'armas/submetralhadora', defaults: { pente: 'Pente leve ou médio', modo: 'Semi e automático', carga: '2', alcance: 'Médio a baixo' } },
        { id: 'metralhadora', title: 'Metralhadora', rule: 'armas/metralhadora', defaults: { pente: 'Pente médio, pesado ou sobrecarga', modo: 'Semi e automático', carga: '5', alcance: 'Médio a longo' } },
        { id: 'laser', title: 'Laser', rule: 'armas/laser', defaults: { pente: 'Pente médio ou sobrecarga', modo: 'Contínuo', carga: '3', alcance: 'Médio a longo' } }
      ],
      fields: [
        { key: 'nome', label: 'Nome do item', kind: 'text', big: true },
        { key: 'modelo', label: 'Modelo/Fabricante', kind: 'text' },
        { key: 'raridade', label: 'Raridade', kind: 'select', options: 'raridades' },
        { key: 'dano', label: 'Tipo de dano', kind: 'select', options: 'tiposDano' },
        { key: 'modo', label: 'Modo', kind: 'text', fromType: true },
        { key: 'pente', label: 'Pente/Recarga', kind: 'text', fromType: true },
        { key: 'alcance', label: 'Alcance efetivo', kind: 'text', fromType: true },
        { key: 'carga', label: 'Carga', kind: 'text', fromType: true },
        { key: 'modificador', label: 'Modificador', kind: 'text' }
      ]
    },
    {
      id: 'armadura', title: 'Armadura', group: 'Proteção',
      hint: 'Escolha o tipo: a armadura básica e a penalidade já vêm das regras.',
      types: [
        { id: 'leve', title: 'Leve', rule: 'armaduras/tipos', defaults: { armadura: '4', penalidade: '—' } },
        { id: 'media', title: 'Média', rule: 'armaduras/tipos', defaults: { armadura: '5', penalidade: '–1' } },
        { id: 'pesada', title: 'Pesada', rule: 'armaduras/tipos', defaults: { armadura: '6', penalidade: '–2' } }
      ],
      fields: [
        { key: 'nome', label: 'Nome do item', kind: 'text', big: true },
        { key: 'modelo', label: 'Modelo/Fabricante', kind: 'text' },
        { key: 'nucleo', label: 'Núcleo (sim/não)', kind: 'text' },
        { key: 'armadura', label: 'Armadura', kind: 'text', fromType: true },
        { key: 'penalidade', label: 'Penalidade', kind: 'text', fromType: true },
        { key: 'carga', label: 'Carga', kind: 'text' },
        { key: 'raridade', label: 'Raridade', kind: 'select', options: 'raridades' }
      ]
    },
    {
      id: 'nucleo', title: 'Núcleo', group: 'Implantes',
      hint: 'Todo núcleo pesa 1 de carga e sustenta próteses e módulos.',
      fields: [
        { key: 'nome', label: 'Nome do item', kind: 'text', big: true },
        { key: 'modelo', label: 'Modelo/Fabricante', kind: 'text' },
        { key: 'capacidade', label: 'Capacidade Cibernética', kind: 'text' },
        { key: 'raridade', label: 'Raridade', kind: 'select', options: 'raridades' }
      ]
    },
    {
      id: 'protese-modulo', title: 'Prótese ou Módulo', group: 'Implantes',
      hint: 'Escolha a região do corpo onde o implante fica instalado.',
      types: [
        { id: 'cabeca', title: 'Cabeça', rule: 'nucleo-proteses-modulos/regioes-do-corpo', defaults: {} },
        { id: 'tronco', title: 'Tronco', rule: 'nucleo-proteses-modulos/regioes-do-corpo', defaults: {} },
        { id: 'membros-superiores', title: 'Membros superiores', rule: 'nucleo-proteses-modulos/regioes-do-corpo', defaults: {} },
        { id: 'membros-inferiores', title: 'Membros inferiores', rule: 'nucleo-proteses-modulos/regioes-do-corpo', defaults: {} },
        { id: 'orgaos-internos', title: 'Órgãos internos', rule: 'nucleo-proteses-modulos/regioes-do-corpo', defaults: {} }
      ],
      fields: [
        { key: 'nome', label: 'Nome (Prótese ou Módulo)', kind: 'text', big: true },
        { key: 'tipocc', label: 'Tipo / CC', kind: 'text' },
        { key: 'efeito', label: 'Efeito', kind: 'textarea' }
      ]
    },
    { id: 'mod-arma', title: 'Mod de arma', group: 'Em breve', comingSoon: true },
    { id: 'mod-armadura', title: 'Mod de armadura', group: 'Em breve', comingSoon: true },
    { id: 'mod-nucleo', title: 'Mod de núcleo', group: 'Em breve', comingSoon: true },
    { id: 'propriedades', title: 'Propriedades', group: 'Em breve', comingSoon: true }
  ]
};