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
     rarity (raridade, com cor)
   Em select/multi, "optKey" busca as opções no tipo escolhido (type.opts)
   e, se o tipo não tiver, usa a lista geral com o nome dado em "options".
   ===================================================================== */
window.VORTEX_ITEMS = {
  raridades: ['Comum', 'Incomum', 'Rara', 'Epica', 'Lendária'],
  raridadesMod: ['Comum', 'Rara', 'Lendária'],
  raridadeCor: { 'Comum': '#9db2c1', 'Incomum': '#7fd68a', 'Rara': '#6aa8ff', 'Epica': '#c08bff', 'Lendária': '#f0b85a' },
  tiposDano: ['Cortante', 'Contundente', 'Perfurante', 'Balístico', 'Fogo', 'Ácido/químico', 'Elétrico', 'Explosivo', 'Radioativo', 'Necrótico'],

  // listas gerais (usadas quando o tipo não limita)
  modos: ['Único', 'Semi', 'Automático', 'Contínuo'],
  pentes: ['Pente leve', 'Pente parcial', 'Pente médio', 'Pente pesado', 'Sobrecarga'],
  alcances: ['Curto', 'Médio', 'Longo', 'Muito longo', 'Horizonte'],
  empunhaduras: ['Uma mão', 'Duas mãos'],
  simNao: ['Não', 'Sim'],
  classesImplante: ['Prótese', 'Módulo'],
  paraMod: ['Qualquer arma', 'Arma de fogo', 'Arma corpo a corpo'],
  paraPropriedade: ['Qualquer item', 'Arma', 'Armadura'],
  vidaBase: ['PV', 'Blindagem', 'Escudo'],

  /* Slots (capítulo Raridade e seção Acessórios das regras) */
  slots: {
    modsPorRaridade: { 'Comum': 1, 'Incomum': 1, 'Rara': 2, 'Epica': 2, 'Lendária': 3 }, // slots de mod da arma
    custoMod: { 'Comum': 1, 'Rara': 2, 'Lendária': 3 },                                   // quantos slots o mod usa
    propArma: { 'Comum': 0, 'Incomum': 1, 'Rara': 0, 'Epica': 1, 'Lendária': 1 },         // propriedades que a arma comporta
    propArmadura: { 'Comum': 0, 'Incomum': 1, 'Rara': 0, 'Epica': 1, 'Lendária': 2 },     // idem para armadura
    acessoriosPorSlot: 3,                                                                 // 1 slot de mod livre = 3 acessórios
    posicoes: {                                                                           // um acessório por posição
      'arma-fogo': ['Mira', 'Bocal', 'Carregador', 'Guarda'],
      'arma-melee': ['Fio', 'Guardas', 'Cabo']
    }
  },

  categories: [
    /* ------------------------------ Armas ------------------------------ */
    {
      id: 'arma-melee', title: 'Arma corpo a corpo', group: 'Armas', inventory: true, slots: 'arma', image: true, bonus: true,
      hint: 'As regras ainda não definem tipos de arma corpo a corpo. Mods, propriedade e acessórios entram nos slots.',
      fields: [
        { key: 'nome', label: 'Nome do item', kind: 'text', big: true },
        { key: 'modelo', label: 'Modelo/Fabricante', kind: 'text' },
        { key: 'raridade', label: 'Raridade', kind: 'rarity', options: 'raridades' },
        { key: 'dano', label: 'Tipo de dano', kind: 'select', options: 'tiposDano' },
        { key: 'empunhadura', label: 'Empunhadura', kind: 'select', options: 'empunhaduras' },
        { key: 'carga', label: 'Carga', kind: 'number', min: 0, step: 0.25 },
        { key: 'especial', label: 'Especial', kind: 'textarea', big: true, placeholder: 'Efeitos, condições ou regras próprias deste item.' }
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
          id: 'revolver', title: 'Revólver', sub: 'Variante da Pistola', rule: 'armas/pistola', cargaMax: 1,
          opts: { modo: ['Único', 'Semi'], pente: ['Pente parcial'], alcance: ['Longo'], empunhadura: ['Uma mão', 'Duas mãos'] }
        },
        {
          id: 'espingarda', title: 'Espingarda', rule: 'armas/espingarda', cargaMax: 3,
          opts: { modo: ['Único', 'Semi'], pente: ['Pente leve', 'Pente parcial', 'Pente médio'], alcance: ['Curto', 'Médio'], empunhadura: ['Duas mãos'] }
        },
        {
          id: 'espingarda-cano-curto', title: 'Espingarda de cano curto', sub: 'Variante da Espingarda', rule: 'armas/espingarda', cargaMax: 2,
          opts: { modo: ['Único', 'Semi'], pente: ['Pente leve', 'Pente parcial'], alcance: ['Curto'], empunhadura: ['Uma mão', 'Duas mãos'] }
        },
        {
          // as regras ainda não trazem a média de criação do Rifle: fica livre entre todas as opções
          id: 'rifle', title: 'Rifle', sub: 'Sem média de criação nas regras: opções livres', rule: 'armas/rifle',
          opts: { empunhadura: ['Duas mãos'] }
        },
        {
          id: 'submetralhadora', title: 'Submetralhadora', rule: 'armas/submetralhadora', cargaMax: 2,
          opts: { modo: ['Semi', 'Automático'], pente: ['Pente leve', 'Pente médio'], alcance: ['Curto', 'Médio'], empunhadura: ['Uma mão', 'Duas mãos'] }
        },
        {
          id: 'metralhadora', title: 'Metralhadora', rule: 'armas/metralhadora', cargaMax: 5,
          opts: { modo: ['Semi', 'Automático'], pente: ['Pente médio', 'Pente pesado', 'Sobrecarga'], alcance: ['Médio', 'Longo'], empunhadura: ['Duas mãos'] }
        },
        {
          id: 'laser', title: 'Laser', rule: 'armas/laser', cargaMax: 3,
          opts: { modo: ['Contínuo'], pente: ['Pente médio', 'Sobrecarga'], alcance: ['Médio', 'Longo'], empunhadura: ['Duas mãos'] }
        }
      ],
      fields: [
        { key: 'nome', label: 'Nome do item', kind: 'text', big: true },
        { key: 'modelo', label: 'Modelo/Fabricante', kind: 'text' },
        { key: 'raridade', label: 'Raridade', kind: 'rarity', options: 'raridades' },
        { key: 'dano', label: 'Tipo de dano', kind: 'select', options: 'tiposDano' },
        { key: 'modo', label: 'Modo', kind: 'multi', optKey: 'modo', options: 'modos' },
        { key: 'cadencia', label: 'Cadência (disparos por ação)', kind: 'number', min: 1, step: 1 },
        { key: 'pente', label: 'Pente/Recarga', kind: 'select', optKey: 'pente', options: 'pentes' },
        { key: 'alcance', label: 'Alcance efetivo', kind: 'select', optKey: 'alcance', options: 'alcances' },
        { key: 'empunhadura', label: 'Empunhadura', kind: 'select', optKey: 'empunhadura', options: 'empunhaduras' },
        { key: 'carga', label: 'Carga', kind: 'number', min: 0, step: 0.25, maxFrom: 'cargaMax', defaultFrom: 'cargaMax' },
        { key: 'especial', label: 'Especial', kind: 'textarea', big: true, placeholder: 'Efeitos, condições ou regras próprias deste item.' }
      ]
    },

    /* ------------------------------ Proteção ------------------------------ */
    {
      id: 'armadura', title: 'Armadura', group: 'Proteção', inventory: true, slots: 'armadura', image: true, bonus: true,
      hint: 'Escolha o tipo: armadura básica, penalidade e carga já vêm das regras.',
      types: [
        { id: 'leve', title: 'Leve', rule: 'armaduras/tipos', defaults: { armadura: '4', penalidade: '0', carga: '1' } },
        { id: 'media', title: 'Média', rule: 'armaduras/tipos', defaults: { armadura: '5', penalidade: '1', carga: '2' } },
        { id: 'pesada', title: 'Pesada', rule: 'armaduras/tipos', defaults: { armadura: '6', penalidade: '2', carga: '3' } }
      ],
      fields: [
        { key: 'nome', label: 'Nome do item', kind: 'text', big: true },
        { key: 'modelo', label: 'Modelo/Fabricante', kind: 'text' },
        { key: 'raridade', label: 'Raridade', kind: 'rarity', options: 'raridades' },
        { key: 'armadura', label: 'Armadura', kind: 'number', min: 0, step: 1 },
        { key: 'penalidade', label: 'Penalidade (–X em Manha, Reflexos e Sentidos)', kind: 'number', min: 0, step: 1 },
        { key: 'carga', label: 'Carga (não conta quando equipada)', kind: 'number', min: 0, step: 0.25 },
        { key: 'nucleo', label: 'Tem núcleo?', kind: 'select', options: 'simNao' },
        { key: 'capacidade', label: 'Capacidade do núcleo (se tiver)', kind: 'number', min: 0, step: 1 },
        { key: 'especial', label: 'Especial', kind: 'textarea', big: true, placeholder: 'Efeitos, condições ou regras próprias deste item.' }
      ]
    },

    /* ------------------------------ Implantes ------------------------------ */
    {
      id: 'nucleo', title: 'Núcleo', group: 'Implantes', inventory: true, implant: true, image: true, bonus: true,
      hint: 'Todo núcleo pesa 1 de carga (não conta quando implantado) e sustenta próteses e módulos.',
      defaults: { carga: '1' },
      fields: [
        { key: 'nome', label: 'Nome do item', kind: 'text', big: true },
        { key: 'modelo', label: 'Modelo/Fabricante', kind: 'text' },
        { key: 'raridade', label: 'Raridade', kind: 'rarity', options: 'raridades' },
        { key: 'capacidade', label: 'Capacidade Cibernética', kind: 'number', min: 0, step: 1 },
        { key: 'carga', label: 'Carga', kind: 'number', min: 0, step: 0.25 },
        { key: 'especial', label: 'Especial', kind: 'textarea', big: true, placeholder: 'Efeitos, condições ou regras próprias deste item.' }
      ]
    },
    {
      id: 'protese-modulo', title: 'Prótese ou Módulo', group: 'Implantes', inventory: true, implant: true, image: true, bonus: true,
      hint: 'Escolha a região do corpo onde o implante fica instalado.',
      defaults: { cc: '1' },
      types: [
        { id: 'cabeca', title: 'Cabeça', sub: 'olhos, ouvidos, nariz, boca', rule: 'nucleo-proteses-modulos/regioes-do-corpo' },
        { id: 'tronco', title: 'Tronco', sub: 'pescoço, espinha, tórax, abdómen, pélvis', rule: 'nucleo-proteses-modulos/regioes-do-corpo' },
        { id: 'membros-superiores', title: 'Membros superiores', sub: 'ombro, braço, antebraço, pulso, mão', rule: 'nucleo-proteses-modulos/regioes-do-corpo' },
        { id: 'membros-inferiores', title: 'Membros inferiores', sub: 'glúteos, coxas, panturrilha, joelho, pés', rule: 'nucleo-proteses-modulos/regioes-do-corpo' },
        { id: 'orgaos-internos', title: 'Órgãos internos', sub: 'esqueleto, sistemas nervoso, pulmonar, cardiovascular, digestivo', rule: 'nucleo-proteses-modulos/regioes-do-corpo' }
      ],
      fields: [
        { key: 'nome', label: 'Nome (Prótese ou Módulo)', kind: 'text', big: true },
        { key: 'classe', label: 'É prótese ou módulo?', kind: 'select', options: 'classesImplante' },
        { key: 'cc', label: 'CC (capacidade que ocupa)', kind: 'number', min: 0, step: 1 },
        { key: 'efeito', label: 'Efeito', kind: 'textarea', big: true }
      ]
    },

    /* ------------------------------ Peças de slot ------------------------------ */
    {
      id: 'mod-arma', title: 'Mod de arma', group: 'Peças de slot', slots: 'mod', bonus: true,
      hint: 'Mod é uma peça à parte: depois de salvo, é encaixado em cada arma pelos slots. A cor vem da raridade.',
      fields: [
        { key: 'nome', label: 'Nome do mod', kind: 'text', big: true },
        { key: 'raridade', label: 'Raridade (define a cor e quantos slots usa)', kind: 'rarity', options: 'raridadesMod', big: true },
        { key: 'para', label: 'Serve em', kind: 'select', options: 'paraMod' },
        { key: 'tipo', label: 'Mod (tipo)', kind: 'text' },
        { key: 'efeito', label: 'Efeito', kind: 'textarea', big: true }
      ]
    },
    {
      id: 'propriedade', title: 'Propriedade', group: 'Peças de slot', image: true, bonus: true,
      hint: 'Propriedades só entram em itens cuja raridade comporta (Incomum, Épica e Lendária).',
      fields: [
        { key: 'nome', label: 'Nome da propriedade', kind: 'text', big: true },
        { key: 'para', label: 'Serve em', kind: 'select', options: 'paraPropriedade' },
        { key: 'efeito', label: 'Efeito', kind: 'textarea', big: true }
      ]
    },
    {
      id: 'acessorio', title: 'Acessório', group: 'Peças de slot',
      hint: 'Escolha o tipo de arma. Cada posição da arma só aceita um acessório daquela posição.',
      types: [
        { id: 'arma-fogo', title: 'Para arma de fogo', sub: 'Mira, Bocal, Carregador, Guarda', rule: 'armas/acessorios', opts: { posicao: ['Mira', 'Bocal', 'Carregador', 'Guarda'] } },
        { id: 'arma-melee', title: 'Para arma corpo a corpo', sub: 'Fio, Guardas, Cabo', rule: 'armas/acessorios', opts: { posicao: ['Fio', 'Guardas', 'Cabo'] } }
      ],
      fields: [
        { key: 'nome', label: 'Nome do acessório', kind: 'text', big: true },
        { key: 'posicao', label: 'Posição (slot)', kind: 'select', optKey: 'posicao', options: [] },
        { key: 'efeito', label: 'Efeito', kind: 'textarea', big: true }
      ]
    },

    /* ------------------------------ Personagem ------------------------------ */
    {
      id: 'especime', title: 'Espécime', group: 'Personagem', image: true, bonus: true,
      hint: 'A espécie escolhida na ficha. A vida base diz em que tipo de resistência os PV do personagem entram na barra.',
      defaults: { vidaBase: 'PV', upInicial: '0', nucleoBase: '0' },
      fields: [
        { key: 'nome', label: 'Nome do espécime', kind: 'text', big: true },
        { key: 'vidaBase', label: 'Vida base', kind: 'select', options: 'vidaBase' },
        { key: 'upInicial', label: 'UP iniciais', kind: 'number', min: 0, step: 1 },
        { key: 'nucleoBase', label: 'Núcleo de nascença (capacidade)', kind: 'number', min: 0, step: 1 },
        { key: 'descricao', label: 'Descrição', kind: 'textarea', big: true },
        { key: 'tracos', label: 'Traços e regras', kind: 'textarea', big: true }
      ]
    },
    {
      id: 'poder', title: 'Poder', group: 'Personagem', image: true, bonus: true,
      hint: 'Poderes e habilidades. Os bônus automáticos (PV, Escudo, Blindagem...) entram sozinhos na ficha de quem tiver o poder.',
      fields: [
        { key: 'nome', label: 'Nome do poder', kind: 'text', big: true },
        { key: 'custo', label: 'Custo (UP)', kind: 'number', min: 0, step: 1 },
        { key: 'custoUso', label: 'Custo de uso (PE, PA...)', kind: 'text' },
        { key: 'efeito', label: 'Efeito', kind: 'textarea', big: true }
      ]
    },

    /* ------------------------------ Geral ------------------------------ */
    {
      id: 'item-geral', title: 'Item geral', group: 'Geral', inventory: true, image: true, bonus: true,
      hint: 'Kits, consumíveis, ferramentas, munição e qualquer coisa que ocupe carga.',
      fields: [
        { key: 'nome', label: 'Nome do item', kind: 'text', big: true },
        { key: 'raridade', label: 'Raridade', kind: 'rarity', options: 'raridades' },
        { key: 'carga', label: 'Carga', kind: 'number', min: 0, step: 0.25 },
        { key: 'efeito', label: 'Efeito / descrição', kind: 'textarea', big: true },
        { key: 'especial', label: 'Especial', kind: 'textarea', big: true, placeholder: 'Efeitos, condições ou regras próprias deste item.' }
      ]
    }
  ],

  /* -----------------------------------------------------------------
     Catálogo oficial: o que as regras já trazem pronto. Aparece na
     pesquisa com o selo "Oficial" e não pode ser editado pelo site.
     ----------------------------------------------------------------- */
  catalogo: [
    // Acessórios de arma de fogo
    { id: 'of-acc-red-dot', kind: 'acessorio', typeId: 'arma-fogo', name: 'Red dot/Holográfica', values: { posicao: 'Mira', efeito: 'Ignora a dificuldade de percepção de média distância e cobertura parcial na mesma distância.' } },
    { id: 'of-acc-ampliacao', kind: 'acessorio', typeId: 'arma-fogo', name: 'Ampliação', values: { posicao: 'Mira', efeito: 'Ignora a dificuldade de percepção de média distância a longa e cobertura parcial nas mesmas distâncias.' } },
    { id: 'of-acc-telescopica', kind: 'acessorio', typeId: 'arma-fogo', name: 'Telescópica', values: { posicao: 'Mira', efeito: 'Ignora a dificuldade de percepção de longa, a muito longa distância e cobertura leve nas mesmas distâncias.' } },
    { id: 'of-acc-silenciador', kind: 'acessorio', typeId: 'arma-fogo', name: 'Silenciador', values: { posicao: 'Bocal', efeito: 'Pode se fazer teste de furtividade para disparos.' } },
    { id: 'of-acc-tripe', kind: 'acessorio', typeId: 'arma-fogo', name: 'Tripé', values: { posicao: 'Bocal', efeito: 'Use somente uma ação de movimento para apoiar a arma.' } },
    { id: 'of-acc-estendido', kind: 'acessorio', typeId: 'arma-fogo', name: 'Carregador estendido', values: { posicao: 'Carregador', efeito: 'Chegue ao limite de munições do tiro de munição.' } },
    { id: 'of-acc-escalar', kind: 'acessorio', typeId: 'arma-fogo', name: 'Carregador escalar', values: { posicao: 'Carregador', efeito: 'Aumenta de leve para médio, de médio para pesado, e vice versa.' } },
    { id: 'of-acc-duplo', kind: 'acessorio', typeId: 'arma-fogo', name: 'Carregador duplo', values: { posicao: 'Carregador', efeito: 'Se o carregador contiver no máximo 30 munições, se pode carregar usando ação bônus, uma vez sim, outra não.' } },
    { id: 'of-acc-telemetro', kind: 'acessorio', typeId: 'arma-fogo', name: 'Telêmetro', values: { posicao: 'Guarda', efeito: 'Contabiliza a distância que você está mirando em tempo real.' } },
    { id: 'of-acc-mira-laser', kind: 'acessorio', typeId: 'arma-fogo', name: 'Mira laser', values: { posicao: 'Guarda', efeito: 'Ignora a dificuldade de percepção de média distância e cobertura parcial na mesma distância. -1 em furtividade a curta a média distância.' } },
    { id: 'of-acc-lanterna', kind: 'acessorio', typeId: 'arma-fogo', name: 'Lanterna', values: { posicao: 'Guarda', efeito: 'Pode ligar quando quiser, te concede uma fonte de luz frontal da arma de 9 metros à sua frente.' } },
    { id: 'of-acc-lanterna-uv', kind: 'acessorio', typeId: 'arma-fogo', name: 'Lanterna UV', values: { posicao: 'Guarda', efeito: 'Como lanterna, mas é uma luz UV que não serve para enxergar no escuro.' } },

    // Espécimes
    {
      id: 'of-esp-humano', kind: 'especime', name: 'Humano',
      values: { vidaBase: 'PV', upInicial: '3', nucleoBase: '0', descricao: 'Nada de especial, talvez sua experiência passada.', tracos: 'Tome 3 Up points de início! Opcional (experiência mundana): 26 a 30 anos, 4 UP e 1 Perda; 31 a 40 anos, 5 UP e 2 Perdas; 41 a 60 anos, 6 UP e 3 Perdas; mais que isso, até 10 UP e um valor igual de Perdas.' }
    },
    {
      id: 'of-esp-robo', kind: 'especime', name: 'Robô',
      values: { vidaBase: 'Blindagem', upInicial: '0', nucleoBase: '2', descricao: 'Meio que é… feito de lata né não?', tracos: 'Núcleo: contém um núcleo +2 comum desde o início; os PV são convertidos para blindagem e os negativos contam como Shield. Engenharia: não equipa itens, acopla (ao menos 1 hora). Não vivo: não é afetado por coisas biológicas, não recupera PV por descanso nem curas; é consertado com Tecnologia e um kit de ferramentas.' }
    },

    // Poderes (capítulo Habilidades)
    { id: 'of-pod-esquiva', kind: 'poder', name: 'Esquiva', values: { custo: '2', efeito: 'Use precisão como atributo básico, e reflexo como perícia para os testes de defesa. Pode gastar +1 Up point para contar na defesa básica também.' } },
    { id: 'of-pod-regeneracao', kind: 'poder', name: 'Regeneração', values: { custo: '2', efeito: 'Se for uma criatura biológica, recupere 3 PVs por turno. Se caído, pode recobrar a consciência quando recuperar todos os PV. A cada Up point acima do primeiro, +1 na recuperação de PVs.' } },
    { id: 'of-pod-transformacao', kind: 'poder', name: 'Transformação', values: { efeito: 'Com uma ação completa você se transforma; cria uma transformação trocando seus Up points e os realocando como quiser. Seus itens caem ao chão no processo. Cada Up point equivale a uma transformação.' } },
    { id: 'of-pod-akimbo', kind: 'poder', name: 'Akimbo', values: { efeito: 'Empunhe pistolas ou submetralhadoras uma em cada mão. O tempo de recarga aumenta em uma categoria. Pode mirar em um único alvo com ambas ou escolher até dois alvos; faz um teste de ataque com cada arma, que aplicam dano separadamente.' } },
    { id: 'of-pod-gatilho', kind: 'poder', name: 'Gatilho do velho mundo', values: { efeito: 'Com um revólver de disparo único, obtém cadência igual a 1 + metade da precisão (para cima). O primeiro disparo não conta na penalidade de cadência. Precisa da outra mão livre.' } }
  ]
};