/* =====================================================================
   VORTEX | regras.js
   Conteúdo das regras (só dados, sem lógica). Para corrigir ou acrescentar
   uma regra, edite aqui; a aba Regras do site monta tudo sozinha.

   Cada capítulo vira uma aba: { id, title, group, blocks: [...] }
   Blocos (cada um é uma lista [tipo, ...]):
     ['h2', 'Título']            seção (numerada)      ['h3', ...] ['h4', ...] subseções
     ['p', 'texto']              parágrafo (**negrito**, *itálico*, [link](capítulo#Título da seção))
     ['ul', ['item', ...]]       lista
     ['formula', 'rótulo', 'texto']    fórmula em destaque
     ['example', 'texto']        exemplo
     ['note', 'rótulo', 'texto' ou ['itens']]   observação
     ['table', ['cabeçalhos'], [['linha'], ...]]   tabela
     ['dl', [['termo', 'descrição' ou ['itens']], ...]]   termos e definições
     ['kv', 'legenda', [['campo', 'valor'], ...]]   ficha de propriedades
     ['fields', ['campo', ...]]  campos em branco (modelo de ficha)
     ['card', 'Título', [blocos]] cartão com título (aparece no índice)
   ===================================================================== */
/* Perícias com descrição de uso (pericias.js, carregado antes deste arquivo). O capítulo Perícias monta a tabela a partir daqui. */
const PERICIAS = window.VORTEX_PERICIAS || [];
/* Perdas: desvantagens que dão +1 UP cada. [nome, efeito, script (mecânica automática na ficha, opcional)].
   O capítulo Perdas e o banco (items.js, kind 'perda') saem desta mesma lista. */
const PERDAS = [
  ['Frágil', 'Seu corpo aguenta menos que o normal: você tem –3 PV máximos.', 'pv: -3'],
  ['Essência fraca', 'Sua Essência se esgota rápido: você tem –3 PE máximos.', 'pe: -3'],
  ['Lento', 'Você se move devagar: –3 m de deslocamento.', 'deslocamento: -3'],
  ['Costas ruins', 'Você carrega menos peso: –3 de Carga.', 'carga: -3'],
  ['Desajeitado', 'Você tem perda nos testes de Reflexos.', ''],
  ['Míope', 'Você tem perda nos testes de Sentidos que dependem da visão e nos ataques à distância contra alvos a mais de 10 m.', ''],
  ['Fobia', 'Escolha algo que você teme. Na presença disso, você tem perda em todos os testes até se afastar ou passar num teste de Vontade contra CD 7 (uma tentativa por rodada).', ''],
  ['Vício', 'Escolha uma substância ou um hábito. Se passar um dia sem ele, você tem perda nos testes de Vontade e de Sentidos até satisfazer o vício.', ''],
  ['Código de honra', 'Escolha um código (não atacar quem se rende, não mentir, não abandonar um aliado...). Quebrá-lo deixa você em perda em todos os testes até o fim da cena.', ''],
  ['Implante instável', 'Quando um teste feito com uma prótese ou um módulo tiver duas perdas, a peça desliga até o fim da cena.', ''],
  ['Procurado', 'Alguém poderoso (uma corporação, uma gangue, a lei) quer você. O mestre decide quando e como isso aparece.', ''],
  ['Dívida', 'Você deve a alguém perigoso: começa com metade do dinheiro inicial, e o credor vem cobrar.', '']
];
/* Efeitos marciais básicos do poder Luta: [efeito, custo em ataques da rodada, o que faz].
   Só as capacidades genéricas; os estilos de luta (abaixo) trazem as técnicas e passivas próprias.
   A ficha (poder Luta, em items.js) e o capítulo Habilidades usam esta mesma tabela. */
const LUTA_MANOBRAS = [
  ['Passo marcial', '1 por 3 m', 'Você se move 3 m por ataque gasto entre um golpe e outro, sem gastar a ação de movimento.'],
  ['Empurrão', '1 por 3 m', 'Se o golpe acertar, o alvo é empurrado 3 m por ataque gasto (Corpo + Luta contra Atletismo dele).'],
  ['Alvo extra', '1 por alvo', 'O mesmo golpe acerta mais um alvo adjacente a você por ataque gasto; um só teste vale para todos.'],
  ['Golpe em área', '2 (+1 por 1,5 m)', 'Golpe giratório ou no chão: todos adjacentes a você (raio 1,5 m) sofrem o ataque, com metade do dano. Cada ataque a mais aumenta o raio em 1,5 m.'],
  ['Junção à manobra', '3', 'O golpe e uma manobra (derrubar, desarmar, agarrar ou quebrar a guarda; Luta contra Resistência ou Reflexos) saem juntos, sem gastar outra ação.'],
  ['Efeito do dano', '2', 'Se o golpe acertar, causa o efeito do tipo de dano da arma: cortante faz sangrar (perde 1d6 PV no começo de cada turno até ser tratado), contundente atordoa (o alvo perde a ação de movimento; se já estava atordoado, perde o turno), perfurante fere (–1 no ataque e na defesa por ferida, máximo –3, até receber cura). O alvo evita com Fortitude contra CD 6 + Corpo (ou Precisão) + Luta.'],
  ['Trocar o dano', '1', 'Neste golpe, a arma causa outro tipo de dano (cortante, contundente ou perfurante): de lado, com o cabo, com a ponta.'],
  ['Guarda', '1 por +1', 'Até o seu próximo turno, +1 na defesa contra ataques corpo a corpo por ataque gasto, até um máximo igual à sua Precisão.'],
  ['Arremesso', '1 por +9 m', 'Todo mundo pode arremessar coisas; este efeito só aumenta a distância: seu arremesso alcança +9 m por ataque gasto.']
];
/* Estilos de luta: o "upgrade" do poder Luta. Um por ficha; o custo em UP soma ao seu poder em Luta.
   Cada um traz passivas únicas e técnicas próprias, que gastam ataques da rodada como os efeitos básicos. */
const LUTA_ESTILOS = [
  { name: 'Berserker', cost: 2, resumo: 'Fúria e força bruta: troca defesa por dano e fica mais perigoso quanto mais apanha.',
    passivas: [
      ['Fúria', 'Uma vez por cena, como ação livre, você entra em fúria até o fim da cena ou até cair: +2 no dano corpo a corpo e –2 na defesa.'],
      ['Sangue quente', 'Com menos da metade dos PV, você tem +1 ataque por rodada.'],
      ['Couro grosso', 'Em fúria, cada golpe corpo a corpo que você recebe causa 1 de dano a menos.']
    ],
    tecnicas: [
      ['Golpe brutal', '2', 'O golpe causa +1d6 de dano.'],
      ['Golpe certeiro', '2', 'O golpe causa crítico com 5 e 6.'],
      ['Golpe esmagador', '2', 'Se o golpe acertar, o alvo cai (Corpo + Luta contra Atletismo dele).'],
      ['Grito de guerra', '1', 'Intimidação contra Vontade de quem ouvir, em 6 m; quem perder tem –1 no ataque contra você até o fim da rodada.'],
      ['Ignorar a dor', '1 (guardado)', 'Guarde um ataque: como reação a um golpe que acertou, o dano dele cai pela metade.']
    ] },
  { name: 'Armetista', cost: 2, resumo: 'Mestre de armas: domina qualquer arma corpo a corpo e transforma a técnica em defesa.',
    passivas: [
      ['Arsenal', 'Você é proficiente com todas as armas corpo a corpo.'],
      ['Troca rápida', 'Uma vez por rodada, sacar ou trocar uma arma corpo a corpo é ação livre.'],
      ['Domínio da arma', 'Trocar o dano custa 0 ataques, e você pode usar Precisão + Luta no ataque com qualquer arma corpo a corpo.']
    ],
    tecnicas: [
      ['Aparar', '1 (guardado)', 'Guarde um ataque: como reação a um golpe corpo a corpo, faça um teste de Luta contra o ataque; se vencer, o golpe não acerta.'],
      ['Desarme no golpe', '1', 'Se o golpe acertar, o alvo solta a arma (Luta contra Reflexos dele).'],
      ['Golpe certeiro', '2', 'O golpe causa crítico com 5 e 6.'],
      ['Guarda de lâmina', '1 por +2', 'Como a Guarda, mas +2 por ataque gasto; o máximo continua igual à sua Precisão.'],
      ['Arremesso duplo', '1', 'Arremessa duas armas à mão no mesmo ataque, em alvos até 9 m; cada uma faz o seu teste.']
    ] },
  { name: 'Renegado', cost: 2, resumo: 'Briga suja: golpes baixos, truques e saídas rápidas, com o que estiver à mão.',
    passivas: [
      ['Golpe baixo', '+2 no dano contra alvos Caídos, Agarrados, Atordoados ou flanqueados.'],
      ['Arma improvisada', 'Qualquer objeto à mão conta como uma arma da qual você é proficiente (1d6, contundente ou cortante).'],
      ['Escorregadio', 'Se você se moveu nesta rodada, tem +1 na defesa contra ataques corpo a corpo.']
    ],
    tecnicas: [
      ['Finta', '1', 'Enganação contra Sentidos do alvo; se vencer, seus próximos golpes nele, nesta rodada, têm +2 no ataque.'],
      ['Contra-ataque', '1 (guardado)', 'Guarde um ataque: quando um inimigo errar um ataque corpo a corpo em você, golpeie-o como reação.'],
      ['Areia nos olhos', '2', 'Enganação contra Reflexos do alvo; se vencer, ele fica Cego até o fim do próximo turno dele.'],
      ['Rasteira', '1', 'Se o golpe acertar, o alvo cai (Luta contra Atletismo dele).'],
      ['Saída suja', '1 por 3 m', 'Você se afasta 3 m por ataque gasto sem provocar reação de quem está adjacente.']
    ] }
];
/* Tecnomancia: o poder principal dos tecnomantes. Cada nível compra um modo de ação e uma lista de componentes.
   Toda operação é uma base (ataque, ação efetiva ou item) + implementos (padrão ou especiais, vindos das listas).
   Um tipo de tecnomante por jogador: Engenheiro (listas) e Patrocinado (catálogos de uma companhia); o Insano chega depois. */
const TECNO_ACOES = [
  ['Instantâneo', 'Ação', 'Gera um efeito explosivo na hora. A duração em campo ou no alvo é a do efeito.'],
  ['Passivo', 'Nenhuma', 'Fica ativo sem gastar ação. Paga a sustentação no mínimo uma vez por cena, então dura até uma cena. Só serve para efeitos que aprimoram ou energizam o alvo: nunca ataque, condição negativa ou habilidade que precise ser ativada ou gaste ação.'],
  ['Concentrado', 'Ação, toda rodada', 'Gera o efeito uma vez por rodada pagando metade do custo, ou sustenta um efeito passivo pela metade do custo. Dura até você encerrar, cair inconsciente ou sofrer um efeito que tome a sua ação completa (movimento + padrão).'],
  ['Ativo', 'Ação (ao ativar)', 'Você fabrica o efeito antes: paga o PE na fabricação e trabalha 1 hora por PE. Depois, ativa quando quiser, seguindo as regras do Instantâneo.'],
  ['Reativo', 'Reação', 'Como o Instantâneo, mas em reação a uma ação. Permite usar qualquer efeito que tenha a reação como ação.']
];
// Listas de componentes do Engenheiro: uma por nível de Tecnomancia (pode repetir uma lista)
const TECNO_LISTAS = [
  ['Poderes', 'Poderes do banco: os das Habilidades e os criados na Oficina.'],
  ['Equipamento', 'Armas, armaduras, granadas e outros itens.'],
  ['Propriedades', 'As propriedades de armas e armaduras do sistema.'],
  ['Mods', 'Mods de armas e armaduras.'],
  ['Próteses e módulos', 'Próteses e módulos.']
];
// Bases de uma operação
const TECNO_BASES = [
  ['Ataque', 'Grátis', 'Ataque de toque, sem multiplicador de dano. Teste: 2d6 + atributo chave + Operações contra a Defesa do alvo. Dano = ataque – Defesa, do tipo mágico.'],
  ['Ação efetiva', 'Grátis', 'Causa um efeito em algo ou alguém. Se o alvo resistir, a CD é 6 + atributo chave.'],
  ['Item', 'Raridade + custo do item', 'Usa um item conhecido como base: paga o PE da raridade + qualquer custo original do item.']
];
// PE por raridade de um componente (base Item ou implemento especial)
const TECNO_RARIDADE = [['Comum', '+1 PE'], ['Incomum', '+2 PE'], ['Rara', '+3 PE'], ['Épica', '+4 PE'], ['Lendária', '+5 PE']];
// Implementos padrão: todo tecnomante conhece. Cada um conta 1 no limite e pode ser repetido.
const TECNO_IMPLEMENTOS = [
  ['Alcance', '+1 PE', 'Sobe uma categoria de alcance: toque, Curto (até 10 m), Médio, Longo...'],
  ['Área', '+2 PE', 'O efeito vira uma área de 3 m de raio, dentro do alcance. Cada repetição soma +3 m de raio.'],
  ['Intensificar', '+1 PE', 'Multiplica o dano como a cadência: cada Intensificar conta como um disparo a mais na tabela das Regras de Cadência (multiplicador e penalidade).'],
  ['Modificador', '+1 PE', '+1 no teste da operação (ataque, cura ou efeito).'],
  ['CD', '+1 PE', '+1 na CD que o alvo precisa vencer para resistir ao efeito (a CD padrão é 6 + atributo chave).'],
  ['Alvo extra', '+1 PE', 'Mais um alvo, cada um com o seu teste.'],
  ['Tipo de dano', '+1 PE', 'Troca o dano mágico por um tipo que você tenha de uma fonte conhecida.']
];
const TECNO_TIPOS = [
  { name: 'Engenheiro', cost: 0, resumo: 'Monta a tecnomancia a partir de listas de componentes, uma por nível de Tecnomancia.',
    passivas: [
      ['Atributo chave (característica do Engenheiro)', 'Para cada lista, o Engenheiro escolhe se ela usa Precisão ou Essência. Esse é o atributo chave: entra nos testes das operações e define quantos implementos cabem nelas.'],
      ['Listas', 'A cada nível de Tecnomancia (cada compra do poder), escolha uma lista de componentes (Poderes, Equipamento, Propriedades, Mods, Próteses e módulos) e o atributo chave dela.'],
      ['Componentes conhecidos', 'Em cada lista, você conhece um número de componentes igual a atributo chave + Operações. Eles servem de base Item ou de implementos especiais.'],
      ['Repetir uma lista', 'Escolher de novo uma lista que já tem dá mais atributo chave + Operações componentes conhecidos dela.'],
      ['Limite de implementos', 'Numa operação, o número de implementos é no máximo o atributo chave da lista usada.'],
      ['Consertar Escudo (exclusivo do Engenheiro)', 'Uma ação efetiva pode recarregar o Escudo de um alvo, seguindo a regra de Cura: teste de atributo chave + Operações contra a CD; o alvo recupera a diferença.']
    ] },
  { name: 'Patrocinado', cost: 0, resumo: 'Uma companhia patrocina você: a cada nível de Tecnomancia, recebe um catálogo inteiro dela.',
    passivas: [
      ['Companhia', 'Escolha uma companhia que patrocina você (por exemplo, Wathrever, Tnnaks, Live Service ou Pinger). Ela vale para todos os níveis.'],
      ['Catálogos', 'A cada nível de Tecnomancia, escolha um catálogo da companhia, como todas as armas dela ou todas as armaduras dela, e conheça todos os componentes desse catálogo. Cada nível dá um catálogo diferente.'],
      ['Categorias universais', 'Propriedades, acessórios e mods não têm patrocinador, porque o valor deles é mecânico. Para eles, o catálogo é um tipo de arma: todos os de armas corpo a corpo ou todos os de armas de fogo.']
    ] },
  { name: 'Insano', cost: 0, pendente: true, resumo: 'Obtém componentes de outro jeito. Em breve.' }
];
window.VORTEX_REGRAS = {
  perdas: PERDAS,
  lutaManobras: LUTA_MANOBRAS,
  lutaEstilos: LUTA_ESTILOS,
  tecnoAcoes: TECNO_ACOES,
  tecnoListas: TECNO_LISTAS,
  tecnoBases: TECNO_BASES,
  tecnoImplementos: TECNO_IMPLEMENTOS,
  tecnoRaridade: TECNO_RARIDADE,
  estilos: { 'of-pod-luta': LUTA_ESTILOS, 'of-pod-tecnomancia': TECNO_TIPOS },
  groups: ['Fundamentos', 'Combate', 'Equipamento', 'Personagem'],
  chapters: [

    /* ------------------------------------------------------------ */
    {
      id: 'testes-e-dados', title: 'Testes e Dados', group: 'Fundamentos',
      blocks: [
        ['h2', 'Rolagens'],
        ['p', 'Todo teste no Vortex segue a mesma base: você rola dois dados de seis faces e soma o atributo e a perícia envolvidos.'],
        ['formula', 'Todo teste', '2d6 + Atributo + Perícia'],

        ['h2', 'Críticos'],
        ['p', 'Cada dado que mostrar 6 soma de novo o valor do atributo usado no teste. Já cada dado que mostrar 1 deixa você em **perda**, e uma perda anula os modificadores que vêm da perícia. Se o teste tiver duas perdas, ele falha completamente.'],
        ['p', 'Você só pode se beneficiar de no máximo 1 crítico nos dados por teste, e uma falha crítica (1) anula um crítico (6).'],

        ['h2', 'Ganho'],
        ['p', 'Um **ganho** aumenta a quantidade de dados rolados naquele teste. O terceiro dado vem de fontes de alto valor, e o quarto é concedido pelo mestre ou pelo sistema. O limite é de 4d6 em um teste.'],
        ['p', 'Na defesa, se houve um ganho durante o combate, some o resultado do ganho à sua defesa atual.'],

        ['h2', 'Perda'],
        ['p', 'A **perda** é o contrário do ganho: você rola um dado a menos.'],

        ['h2', 'Vantagem'],
        ['p', 'Com **vantagem** você rola mais dados, mas, em vez de somá-los, fica com o dado de maior valor.'],

        ['h2', 'Desvantagem'],
        ['p', 'Com **desvantagem** você também rola mais dados, mas fica com o pior resultado.'],

        ['h2', 'Bônus de mesma fonte'],
        ['note', 'Regra geral', '**Qualquer bônus de mesma fonte não acumula.** Vale para itens, poderes, operações de Tecnomancia, habilidades e qualquer outra fonte: usar, vestir ou ativar a mesma fonte de novo não soma o bônus dela outra vez.'],
        ['example', 'Duas camisas iguais vestidas valem como uma, e ativar duas vezes o mesmo poder que dá +2 de Defesa continua dando +2. Bônus de fontes diferentes somam normalmente.']
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'atributos-e-recursos', title: 'Atributos e Recursos', group: 'Fundamentos',
      blocks: [
        ['h2', 'Atributos'],
        ['p', 'Todo personagem é definido por três atributos.'],
        ['dl', [
          ['Corpo', 'Força, vitalidade, combate físico e resistência física.'],
          ['Precisão', 'Mira, controle de armas e tecnologia prática.'],
          ['Essência', 'Energia interior, tecnomancia, vontade e presença.']
        ]],
        ['h3', 'Distribuição Inicial'],
        ['p', 'Você começa com 3 pontos para distribuir entre os atributos. Se quiser, pode reduzir um atributo para –1 e ganhar +1 ponto extra. Nenhum atributo pode começar acima de +3, e o limite total é 6.'],

        ['h2', 'Recursos'],
        ['h3', 'Pontos de Vida (PV)'],
        ['formula', 'PV', '5 + (Corpo × 5), nunca menos que 5'],
        ['example', 'Com Corpo 2, você tem 5 + 10 = 15 PV.'],

        ['h3', 'Pontos de Essência (PE)'],
        ['formula', 'PE', '5 + (Essência × 5), nunca menos que 5'],
        ['p', 'Os PE representam esforço físico, tecnomancia e as habilidades que exigem energia interior.'],

        ['h3', 'Pontos de Ação (PA)'],
        ['formula', 'PA', 'igual à Precisão'],
        ['example', 'Precisão 3 equivale a 3 PA.'],
        ['p', 'Os PA representam um surto de criatividade inteligente (ou não) capaz de mudar a dinâmica das suas interações.'],

        ['h2', 'Recuperação'],
        ['p', 'Você recupera seus recursos depois de um descanso adequado, e a qualidade do descanso define quanto volta.'],
        ['dl', [
          ['Péssimo estado', 'Você recupera de cada recurso uma quantidade igual ao atributo atrelado a ele.'],
          ['Descanso curto (1 a 4 horas)', 'Recupera metade dos recursos. A quantidade cai à metade a cada descanso curto seguinte, e volta ao normal depois de um descanso longo.'],
          ['Descanso longo (8 horas ou mais)', 'Recupera totalmente os recursos.']
        ]],

        ['h2', 'Outros'],
        ['h3', 'Armadura básica'],
        ['p', 'A armadura básica de todas as criaturas é 6.'],
        ['h3', 'Movimento'],
        ['p', 'O movimento padrão dos seres vivos, sem alterações por habilidades, poderes ou desvantagens, é de 9 m em terra (30 ft).']
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'progressao', title: 'Sistema de Progressão', group: 'Fundamentos',
      blocks: [
        ['p', 'Os poderes podem ser adquiridos utilizando UP, respeitando o custo individual de cada poder.'],
        ['p', 'O personagem recebe 1 UP a cada 10 pontos de XP acumulados. O XP é obtido por meio da conclusão de objetivos pessoais ou coletivos, bem como pela superação de encontros em combate.'],

        ['h2', 'Recompensas por Missões'],
        ['ul', ['Missão Secundária: 2 XP.', 'Missão Principal: 5 XP.']],

        ['h2', 'Recompensas por Combate'],
        ['p', 'Os inimigos concedem XP de acordo com sua categoria:'],
        ['ul', [
          'Inimigo Comum: 1 XP (limite de 3 XP por encontro).',
          'Inimigo Maior: 3 XP (limite de 6 XP por encontro).',
          'Chefão: 5 XP.'
        ]],
        ['p', 'A concessão de XP depende da existência de um desfecho para o encontro. Caso o grupo seja vitorioso, recebe a recompensa integral. Se, mesmo sem vencer, houver tentativa genuína e esforço significativo para superar o desafio, o grupo recebe metade do XP correspondente.'],

        ['h2', 'Ajuste de XP pela Dificuldade do Encontro'],
        ['p', 'A dificuldade é determinada pela comparação entre a soma dos UP do grupo e a dos inimigos.'],
        ['p', 'Se ambos os lados possuírem a mesma quantidade de UP, ou a diferença for de até 3 pontos, o XP permanece inalterado.'],
        ['p', 'Caso os oponentes possuam vantagem, o grupo recebe 1 XP adicional para cada 5 UP de diferença.'],
        ['p', 'Por outro lado, se o grupo possuir 10 ou mais UP acima dos oponentes, o encontro não concede XP.'],
        ['p', 'Além disso, ao enfrentar pela segunda vez o mesmo tipo de inimigo, a recompensa de XP por derrotá-lo é reduzida à metade.'],

        ['h2', 'Benefícios por UP'],
        ['p', 'Sempre que o personagem alcançar um número par de UP (desconsiderando aqueles provenientes da Origem), poderá escolher dois dos seguintes benefícios:'],
        ['ul', ['+5 PV;', '+5 PE;', '+1 PA.']],
        ['p', 'Sempre que alcançar um número ímpar de UP (também desconsiderando os provenientes da Origem), recebe +1 ponto em uma perícia à sua escolha.'],
        ['p', 'Uma vez em cada bloco de 4 UP (UP 1 a 4, 5 a 8 e assim por diante, também desconsiderando os da Origem), em vez de receber esse +1 ponto em uma perícia, pode trocá-lo por uma **proficiência** à sua escolha. Só esse ponto ganho pelo UP pode ser trocado: os pontos iniciais, os de UP investido em perícias e os de poderes não. Na ficha, a troca fica em Perícias → Proficiências; no roteiro da build, na folha do UP ímpar.'],
        ['p', 'Além disso, em cada bloco de 4 UP (também desconsiderando os da Origem), recebe +1 em um atributo à sua escolha. Os dois valem desde o começo do bloco: o do primeiro bloco já pode ser usado no UP 1 ou no 3, sem esperar o UP 4. Na ficha, ele é escolhido na aba Progressão.']
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'pericias', title: 'Perícias', group: 'Fundamentos',
      blocks: [
        ['p', 'As perícias dão bônus de +1 a +3. Um teste de perícia soma 2d6, o atributo atrelado a ela e o bônus que o jogador comprou.'],

        ['h2', 'Distribuição Inicial'],
        ['p', 'No início, você coloca +2 em duas perícias e +1 em uma perícia. Ou, na **distribuição livre**, os mesmos 5 pontos vão onde você quiser, respeitando o limite de +3 por perícia.'],

        ['h2', 'Progressão'],
        ['p', 'Cada perícia tem limite de +3 (+4 com Doutor). Cada UP investido em perícias concede 3 pontos livres para distribuir entre elas.'],

        ['h2', 'Lista de Perícias'],
        ['p', 'Cada perícia está atrelada a um atributo: o teste soma 2d6 + o atributo + o bônus da perícia. As tabelas dizem tudo o que cada perícia faz nas regras; os links levam às regras em que ela entra.'],
        ...[['Corpo', 'corpo'], ['Precisão', 'precisao'], ['Essência', 'essencia']].flatMap(([label, tone]) => [
          ['h3', 'Perícias de ' + label],
          ['table', ['Perícia', 'O que pode fazer'], PERICIAS.filter((x) => x.tone === tone).map((x) => [
            x.name,
            '**' + x.summary + '** ' + (x.faz || x.uses) +
              ((x.regras || []).length ? ' **Regras:** ' + x.regras.map((l) => '[' + l[0] + '](' + l[1] + (l[2] ? '#' + l[2] : '') + ')').join(' · ') : '')
          ])]
        ]),

        ['h2', 'Proficiência'],
        ['p', 'A proficiência é um bônus dado pela vantagem “perito em” e, em geral, melhora o uso de um tipo de equipamento.'],
        ['dl', [
          ['Em armas', 'Dá a [cadência perita](cadencia) e libera as propriedades do tipo da arma.'],
          ['Em armaduras', 'Reduz a penalidade da armadura à metade (sem proficiência, a penalidade básica é dobrada) e dá +1 de armadura.']
        ]],
        ['p', 'Você escolhe 4 tipos de armas ou armaduras nos quais é proficiente desde o início.'],

        ['h2', 'Compras com UP'],
        ['p', 'Comprar qualquer um destes poderes custa 1 UP e também dá +1 em uma perícia à sua escolha. Cada um pode ser comprado mais de uma vez, escolhendo outra perícia ou outro tipo.'],
        ['dl', [
          ['Doutor (1 UP cada)', 'O limite da perícia escolhida passa a ser +4.'],
          ['Proficiência em arma (1 UP cada)', 'Você fica proficiente com um tipo de arma e usa a cadência perita com ele.'],
          ['Proficiência em armadura (1 UP cada)', 'Você fica proficiente com um tipo de armadura: ganha +1 de armadura com ela e a penalidade dela cai à metade.']
        ]]
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'carga', title: 'Carga', group: 'Fundamentos',
      blocks: [
        ['p', 'A **Carga** representa a quantidade de equipamento que um personagem consegue transportar sem comprometer sua mobilidade.'],

        ['h2', 'Cálculo da Carga'],
        ['formula', 'Carga', '2 + (Corpo × 5) + Precisão + (Essência × 2)'],
        ['p', 'Na prática: você parte de 2 de Carga base, soma 5 para cada ponto de Corpo, 1 para cada ponto de Precisão e 2 para cada ponto de Essência.'],
        ['example', 'Um personagem com Corpo 2, Precisão 1 e Essência 2 tem 2 + (2 × 5) + 1 + (2 × 2) = 17 de Carga.'],
        ['p', 'Itens equipados normalmente não ocupam Carga. Itens transportados ocupam a quantidade indicada em sua ficha.'],

        ['h2', 'Equipado'],
        ['p', 'Os únicos espaços fixos são a **armadura**, o **núcleo** e as **duas mãos** (empunhadura). Não há espaço por parte do corpo: dá para vestir três camisas uma por cima da outra, ou três mochilas.'],
        ['ul', [
          '**Vestíveis** (roupas, mochilas, escudos energéticos...): você se beneficia de até **3 + Corpo** deles.',
          '**Mochilas**: há três, sem raridade, e nenhuma ocupa carga. Cada uma funciona como "a cada X da sua Carga (contada antes da mochila), você ganha +Y de carga": **Pequena**, a cada 6, +1; **Média**, a cada 4, +1 (requer Corpo 2); **Grande**, a cada 3, +1 (requer Corpo 3). Só a maior mochila vestida conta; sem o Corpo pedido, ela não dá benefício.',
          '**Próteses**: limitadas pela sua Carga Cibernética (CC).',
          '**Módulos**: só abrem espaço com ao menos uma prótese implantada; limitados pela CC, com a reserva da Essência.'
        ]],
        ['note', 'Bônus de mesma fonte', '**Qualquer bônus de mesma fonte não acumula** (regra geral, em Testes e Dados). Dois itens iguais equipados (duas camisas iguais, dois escudos do mesmo modelo) valem como um só.'],

        ['h2', 'Sobrecarga'],
        ['p', 'Quando a Carga transportada passa do limite do personagem, ele fica **Sobrecarregado**: o deslocamento cai à metade e todas as ações físicas passam a exigir uma categoria de ação maior, assim:'],
        ['formula', '', 'Bônus → Movimento → Padrão'],
        ['p', 'A penalidade dura enquanto o personagem estiver acima do limite de Carga.']
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'combate', title: 'Combate', group: 'Combate',
      blocks: [
        ['h2', 'Iniciativa'],
        ['formula', 'Iniciativa', '2d6 + Precisão + Iniciativa'],
        ['p', 'Ao entrar em um combate, todos os envolvidos fazem um teste de Precisão + Iniciativa. O resultado define a ordem dos turnos, do maior para o menor: começa por quem tirou a maior rolagem e termina em quem tirou a menor. A ordem se mantém pelo restante do combate.'],
        ['p', 'Junto com a iniciativa também é rolada a Defesa da cena (veja [Ataque e Defesa](ataque-e-defesa#Defesa)). A iniciativa é rolada no início de qualquer combate ou cena que precise de uma ordem.'],

        ['h2', 'Cena'],
        ['p', 'A cena é a marcação de tempo de um evento inteiro. Em combate, uma cena é feita de rodadas.'],

        ['h2', 'Rodadas'],
        ['p', 'Uma rodada é a passagem de todos os participantes pela ordem da iniciativa, do primeiro ao último, e cada um tem o seu turno dentro dela. A rodada é um marco de tempo importante para habilidades, poderes e ações.'],

        ['h2', 'Turno'],
        ['p', 'A ordem dos turnos é definida pela iniciativa. Dentro do seu turno, você dispõe destas ações:'],
        ['dl', [
          ['Ação padrão', 'A ação principal: atacar, fazer uma manobra, usar efeitos utilitários e afins.'],
          ['Ação de movimento', 'Em geral, serve para se deslocar, mas efeitos e habilidades também podem usá-la. Você pode trocar a ação padrão por mais uma ação de movimento.'],
          ['Ação completa', 'A ação padrão e a de movimento juntas, gastas numa coisa só (como avançar ou curar).'],
          ['Ação bônus', 'Uma ação menor, para usar recursos rápidos e acionar mecanismos ou habilidades.'],
          ['Ação livre', 'Algo feito espontaneamente ou junto com as outras ações. Não há limite de ações livres por turno.'],
          ['Reação', 'Uma resposta à ação de outra pessoa. Também não há limite de reações por turno.']
        ]]
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'ataque-e-defesa', title: 'Ataque e Defesa', group: 'Combate',
      blocks: [
        ['h2', 'Ataque'],
        ['p', 'Para atacar, o alvo precisa estar ao alcance da sua fonte de ataque, corpo a corpo ou à distância. Aí você faz um teste de ataque, que depende da forma de atacar:'],
        ['table', ['Forma', 'Teste'], [
          ['Corpo a corpo', '2d6 + Corpo + Luta'],
          ['À distância', '2d6 + Precisão + Mira'],
          ['Tecnológicos', '2d6 + Essência + Operações']
        ]],
        ['p', 'A regra geral para os ataques é: atributo + perícia atrelados.'],
        ['h3', 'Manobra'],
        ['p', 'Funciona como um ataque, mas em vez de causar dano você tenta impor uma condição ou um estado ao alvo: agarrar, empurrar, derrubar, finalizar, desarmar ou afetar (este último também causa dano, numa parte do corpo). O teste de manobra é **2d6 + Corpo + Luta**. Cada manobra está em [Ações](acoes#Manobras); as condições que elas causam, em [Condições e Estados](condicoes-e-estados).'],

        ['h2', 'Defesa'],
        ['p', 'Quando você é alvo de um ataque, sua defesa reduz ou anula esse ataque. Ela é definida no início de cada combate, junto da iniciativa, com um teste de defesa:'],
        ['formula', '', '2d6 + Corpo + Resistência = Defesa'],
        ['p', 'Se o teste ficar abaixo disso, usa-se a defesa mínima.'],
        ['h3', 'Defesa mínima'],
        ['formula', '', 'Armadura + Corpo + Resistência'],

        ['h2', 'Danos'],
        ['formula', '', 'Fonte do dano = Ataque – Defesa do alvo'],
        ['p', 'Se o resultado for zero ou negativo, o dano mínimo é sempre 1, a menos que alguma fonte mude isso. O dano atinge as suas resistências (Escudo, Blindagem e Vida), descritas abaixo.'],
        ['p', '**Dano fixo e dano de efeito.** Fora do cálculo acima, só o dano fixo e o dano de efeito (como o Sangramento ou o dano adicional de alguns itens) podem rolar um dado de dano ou somar dano que passa pela Defesa do alvo.'],

        ['h2', 'Tipo de dano'],
        ['p', 'Cada tipo de dano interage de um jeito com alvos que tenham fraquezas ou resistências a ele.'],
        ['dl', [
          ['Físicos', ['Cortante', 'Contundente', 'Perfurante', 'Balístico']],
          ['Elementos', ['Fogo', 'Ácido/químico', 'Elétrico']],
          ['Especiais', ['Explosivo', 'Radioativo', 'Necrótico']]
        ]],

        ['h2', 'Fraquezas e Eficiência de Dano'],
        ['p', 'Um ataque é **eficiente** quando o alvo é fraco ao tipo de dano dele: o dano é **dobrado** depois do cálculo normal.'],

        ['h2', 'Tipos de Resistência'],
        ['card', 'Pontos de Vida (PV)', [
          ['p', 'Carne, sangue e tecido vivo.'],
          ['kv', '', [['Fraquezas', 'Radioativo, Cortante (dano dobrado).'], ['Resistência', 'Nenhuma.']]],
          ['p', 'Os PV podem ser recuperados por qualquer fonte médica ou efeito que afete Pontos de Vida.']
        ], 3],
        ['card', 'Escudo (E)', [
          ['p', 'Um campo de proteção energética.'],
          ['kv', '', [['Fraquezas', 'Elétrico, Contundente (dano dobrado).'], ['Resistência', 'Cortante, Perfurante.']]],
          ['p', 'O Escudo pode ser restaurado por qualquer fonte de energia compatível.']
        ], 3],
        ['card', 'Blindagem (BL)', [
          ['p', 'Superfícies rígidas e reforçadas.'],
          ['kv', '', [['Fraquezas', 'Ácido, Explosivo (dano dobrado).'], ['Resistência', 'Fogo, Cortante, Balístico.']]],
          ['p', 'A Blindagem só pode ser reparada ou substituída.']
        ], 3],

        ['h2', 'Observações'],
        ['ul', [
          'Se um ataque causar **mais de um tipo de dano**, os efeitos de fraqueza ou resistência **não se acumulam**.',
          'A redução de dano por dois tipos resistidos também **não acumula**, mas pode ser anulada se um dos tipos for efetivo contra o alvo.',
          'Caso o alvo possua duas ou mais camadas de resistência, o dano é aplicado sempre na ordem: **Escudo → Blindagem → Vida.**',
          'Se o dano exceder uma camada de resistência, o valor restante passa a ser afetado pelas propriedades da próxima camada atingida.',
          'O bônus de **dano dobrado por fraqueza** não conta para o cálculo do dano excedente à resistência afetada (a menos que a próxima resistência também seja fraca ao dano recebido).'
        ]]
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'morte-e-agonia', title: 'Morte e Agonia', group: 'Combate',
      blocks: [
        ['p', 'Se o seu personagem chegar a 0 PV, ele cai **agonizando**. Ainda não é o fim: ele só morre quando chega ao valor negativo do seu PV máximo.'],
        ['example', 'Um personagem com PV máximo 20 morre ao chegar a –20.'],

        ['h2', 'Teste de Sobrevivência'],
        ['p', 'Enquanto estiver com 0 PV ou menos, o personagem faz um teste de Fortitude com CD 6, que aumenta em +1 a cada nova tentativa no mesmo dia.'],
        ['dl', [
          ['Se falhar', 'Recebe 1 de dano, que o leva mais para o negativo. Esse dano aumenta em +1 a cada nova falha no mesmo dia.'],
          ['Se passar', 'Estabiliza, mas continua inconsciente até ser reanimado, o que leva no mínimo um descanso longo ou exige uma fonte médica.']
        ]],

        ['h2', 'Teste de medicina para reanimar'],
        ['p', 'Para reanimar alguém caído, faça um teste de Ofício (Medicina) com CD 6, que aumenta em +1 a cada nova tentativa na mesma cena. Para tentar, você usa uma ação no caído, precisa ter Precisão 3 ou +1 em Ofício (Medicina) e gasta um uso de qualquer Kit Médico. Se passar, o alvo volta com 1 PV.'],
        ['p', 'Se o caído for um robô ou outro ser não vivo, troque o teste de medicina por Tecnologia e o Kit Médico por um kit robótico.']
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'cura', title: 'Cura', group: 'Combate',
      blocks: [
        ['p', 'Recuperar **Pontos de Vida (PV)**, **Escudo (E)** e **Blindagem (BL)** usa um método específico para cada recurso, mas todos seguem a mesma regra geral: você faz um **teste da perícia indicada** contra a **CD do alvo**.'],

        ['h2', 'Classe de Dificuldade (CD)'],
        ['p', 'A CD depende do **valor máximo** do recurso que está sendo restaurado: se o recurso estiver com **menos da metade** do máximo, a **CD é 10**; caso contrário, a **CD é 6**.'],
        ['p', 'Cada **condição negativa** que afeta o alvo aumenta a CD em **+2**. Contam também as condições vinculadas (as que vêm antes dela), e a cura sempre acontece antes de qualquer efeito que anule condições.'],

        ['h2', 'Recuperação'],
        ['p', 'Em caso de sucesso, o alvo recupera do recurso a **diferença entre o resultado do teste e a CD**, somada aos bônus de habilidades, equipamentos ou outros efeitos. Se o resultado for igual ou menor que a CD, nada é recuperado.'],

        ['h2', 'Pré-requisitos'],
        ['h3', 'Pontos de Vida (PV)'],
        ['p', 'É necessário um **Kit Médico**.'],
        ['formula', 'Teste', '2d6 + Precisão + Ofício (Medicina)'],
        ['h3', 'Escudo (E)'],
        ['p', 'É necessário um **Carregador de Energia**.'],
        ['formula', 'Teste', '2d6 + Essência + Operações'],
        ['h3', 'Blindagem (BL)'],
        ['p', 'São necessários **Componentes Mecânicos**.'],
        ['formula', 'Teste', '2d6 + Precisão + Ofício (Engenharia)'],

        ['h2', 'Itens de recuperação (Live Service)'],
        ['h3', 'Tipos'],
        ['dl', [
          ['Ferramenta', 'Não é consumida pelo uso.'],
          ['Consumível', 'É perdido depois do uso; cada um pode ter uma quantidade de usos e um custo de ação diferentes.'],
          ['Estação', 'Leva uma ação completa para instalar ou retirar e outra para usar, e só pode ser usada por quem tem a perícia atrelada a ela.']
        ]],
        ['h3', 'Bônus'],
        ['p', 'O bônus de um item se soma à recuperação do recurso, e essa parte é recuperada mesmo quando o teste falha.']
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'acoes', title: 'Ações', group: 'Combate',
      blocks: [
        ['h2', 'Custo de ação'],
        ['p', 'Algumas ações básicas já têm um tipo de ação definido para serem feitas.'],

        ['h3', 'Normais'],
        ['dl', [
          ['Ataque', 'Qualquer ataque custa uma ação padrão.'],
          ['Deslocamento', 'Usar o seu deslocamento custa uma ação de movimento.'],
          ['Curar', 'Além dos componentes, curar consome uma ação completa (veja [Cura](cura)).']
        ]],

        ['h3', 'Táticas'],
        ['dl', [
          ['Percepções', 'Analisar, procurar ou investigar custa uma ação de movimento.'],
          ['Esconder-se', 'Você precisa de algo que engane os sentidos, como fumaça, escuridão, silêncio ou camuflagem. Em combate, esconder-se de algo ou de alguém é uma ação padrão, que permite fazer o teste de furtividade.'],
          ['Mirar', 'Ação de movimento: você engaja a mira, e ela vale até o início do seu próximo turno.'],
          ['Apoiar equipamento', 'Apoiar a arma numa [cobertura](condicoes-e-estados#Benéficos) para atirar pelo campo de visão não coberto: ação completa. Sair de uma cobertura é uma ação livre.'],
          ['Avançar', 'Você usa sua ação completa para se deslocar em linha reta o dobro do seu deslocamento. Ao final, pode fazer um ataque corpo a corpo como parte da ação; esse ataque não ativa habilidades. Se houver no caminho uma criatura de tamanho igual ou menor que o seu, você a atropela.'],
          ['Atropelar', 'Durante um Avançar, faça um teste de manobra contra a Resistência ou os Reflexos de quem está no seu caminho. Se você vencer, o alvo é empurrado para fora do caminho, na direção que você escolher, 1,5 m mais 1,5 m a cada 3 pontos que o seu teste superar o dele, e fica Caído. Se o alvo vencer usando Resistência, você perde o restante da ação e do movimento. Se vencer usando Reflexos, você continua o movimento normalmente e ele não sofre os efeitos da manobra.']
        ]],

        ['h3', 'Manobras'],
        ['p', 'Uma manobra costuma custar a ação padrão e só pode ser feita contra um alvo adjacente a você no momento da ação. O teste de manobra é **2d6 + Corpo + Luta**, contra o teste que cada manobra indicar.'],
        ['dl', [
          ['Agarrar', 'Teste de manobra contra o teste que o alvo escolher: Corpo + Luta ou Precisão + Reflexos. Se você vencer, o alvo fica [Agarrado](condicoes-e-estados#Passageiras) por você. O teste de quem é agarrado ganha +2 para cada categoria de tamanho de diferença entre ele e quem agarra.'],
          ['Empurrar', 'Teste de manobra contra a Resistência ou os Reflexos do alvo. Se o alvo perder, é empurrado na direção que você escolher: 1,5 m, mais 1,5 m a cada 3 pontos que o seu teste superar o dele. A distância dobra se o alvo for Pequeno ou menor.'],
          ['Derrubar', 'Teste de manobra contra a Resistência ou os Reflexos do alvo. Se você vencer, o alvo fica Caído.'],
          ['Desarmar', 'Você faz a manobra contra um objeto empunhado, e quem o empunha faz um teste de Resistência ou Reflexos contra o seu. Se você vencer, escolhe: jogar o item no chão, arremessá-lo (como numa ação de arremesso) ou ficar com ele, se tiver as mãos livres.'],
          ['Finalizar', 'Só contra um alvo inconsciente, paralisado ou com 0 PV ou menos. Você faz um ataque normal, mas o dano é calculado apenas contra a Defesa mínima do alvo, com o valor cheio do seu ataque: os dados contam como o máximo, e você só os rola para ver se houve crítico.'],
          ['Afetar', 'Você mira uma parte do corpo do alvo (pernas, braços, peito ou cabeça) e causa um dano massivo localizado. Se o teste tiver 2 críticos (6 nos dois dados), você também pode deixar um efeito naquela parte, que dura até o alvo receber qualquer cura. Seres abióticos são imunes a esse efeito.']
        ]],

        ['h3', 'Equipamento'],
        ['dl', [
          ['Saquear', 'Revistar um lugar ou um corpo custa uma ação completa.'],
          ['Vestir / Entrar na direção de veículos', 'Ação completa.'],
          ['Sacar', ['Armas: ação de movimento.', 'Itens utilitários e consumíveis com empunhadura [Saque](empunhadura#Saque): fazem parte da ação principal.']],
          ['Usar', ['Consumíveis e utilitários: ação padrão.', 'Ferramentas: o custo da ação em que são usadas.', 'Estações: toda uma cena (incluindo o interlúdio, sem afetar a sua recuperação).']]
        ]]
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'penalidades', title: 'Penalidades', group: 'Combate',
      blocks: [
        ['h2', 'Alcance'],
        ['table', ['Distância', 'Alcance'], [
          ['Curto', '0 a 10m'],
          ['Médio', '10m a 100m'],
          ['Longo', '100m a 1000m'],
          ['Muito longo', '1000m a 5000m'],
          ['Horizonte', '5000 a 10.000m']
        ]],
        ['p', 'Se você atirar a uma distância maior ou menor que a distância efetiva da sua arma, recebe –3 no ataque para cada faixa acima ou abaixo da efetiva. Atirar em um inimigo adjacente dá –2 no ataque.'],

        ['h2', 'Acuidade'],
        ['p', 'Para disparar a partir da distância média (mesmo dentro da distância efetiva da arma), ou contra um alvo sob cobertura, você precisa antes de um teste de Sentidos para conseguir tentar acertar. Se for proficiente com a arma, pode fazer esse teste com Mira, usando a ação de mirar. Se usar a ação de mirar com uma mira ideal para a distância, ignora o teste. Sem nada disso, o disparo erra.'],
        ['table', ['Distância', 'CD'], [
          ['Médio', 'CD 6'],
          ['Longo', 'CD 12'],
          ['Muito longo', 'CD 18'],
          ['Horizonte', 'imperceptível']
        ]],
        ['p', 'Se o alvo estiver sob [cobertura](condicoes-e-estados#Benéficos) que não seja completa, a CD do teste aumenta ainda mais.'],
        ['table', ['Cobertura', 'CD'], [
          ['Cobertura parcial', 'CD +1'],
          ['Meia cobertura', 'CD +2']
        ]],
        ['p', 'Se o alvo tiver feito a ação de se esconder, vale o resultado do teste de furtividade dele no lugar da CD, se for maior.']
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'cadencia', title: 'Regras de Cadência', group: 'Combate',
      blocks: [
        ['p', 'Toda arma tem um número máximo de disparos por ação: a sua **cadência**.'],

        ['h2', 'Sem proficiência'],
        ['p', 'Um único disparo não sofre penalidade. A cada disparo adicional, você soma à penalidade o número daquele disparo. O dano final é multiplicado pelo número de disparos contra cada alvo.'],
        ['example', 'Cadência 4 → o usuário dispara 3 vezes. Penalidade: –1 –2 –3 = –6 no ataque. Dano final ×3.'],

        ['h2', 'Com proficiência (Cadência perita)'],
        ['p', 'Um único disparo também não sofre penalidade, mas, com mais de um, a penalidade é igual à quantidade de disparos. O dano final é multiplicado da mesma forma.'],
        ['example', 'Cadência 4 → o usuário dispara 3 vezes. Penalidade –3 no ataque. Dano final ×3.'],

        ['p', 'A penalidade sai primeiro do seu modificador fixo de ataque: primeiro da perícia, depois do atributo. A cadência é contada por rodada e por arma.']
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'condicoes-e-estados', title: 'Condições e Estados', group: 'Combate',
      blocks: [
        ['h2', 'Condições'],
        ['p', 'Condições são aplicadas diretamente ao personagem, como doenças, envenenamento e cegueira. Também podem ser benéficas: voraz, furioso (esse nem tanto), energizado, imune e assim por diante.'],
        ['p', 'Condições se acumulam entre si, e uma condição pode anular a sua oposta; nesse caso, vale a última aplicada.'],
        ['h3', 'Instantâneas'],
        ['dl', [
          ['Zonzo', 'Se tentar se mover, o afetado vai para uma direção aleatória decidida pelo mestre, e tem perdas na defesa.'],
          ['Atordoado', 'Cada atordoamento consome a ação de movimento do próximo turno do afetado. Se essa ação já tiver sido consumida por outro atordoamento, ele perde o próximo turno inteiro e, até lá, sua defesa vira a defesa mínima. Quem é imune a efeitos mentais ignora esta condição.'],
          ['Ofuscado', 'Você tem perdas em testes de percepção que dependem da visão. Em ataques à distância, role 1d4: com 1 ou 2 o ataque erra automaticamente; em ataques corpo a corpo, erra com 1.'],
          ['Imóvel', 'Você não pode se mover por conta própria: seu deslocamento vira 0, e ataques contra você têm vantagem.']
        ]],
        ['h3', 'Passageiras'],
        ['dl', [
          ['Envenenamento', 'O afetado recebe o dado de dano químico do veneno (d“x”) no início do seu turno, pela quantidade de turnos indicada na descrição do veneno.'],
          ['Necrose', 'Como o envenenamento, mas o dano é necrótico. Se o afetado receber metade da sua vida máxima em dano necrótico, o efeito acaba, mas o membro que a necrose infectou é perdido. Seres e membros artificiais são imunes à necrose.'],
          ['Agarrado', 'Quem perde o teste contra uma tentativa de [Agarrar](acoes#Manobras) fica Agarrado. Você se move junto com quem o agarrou, e o deslocamento dos dois cai à metade. Para se soltar, use sua ação de movimento para repetir o teste; se vencer, fica livre. Enquanto estiver Agarrado, você só pode fazer ações desarmadas ou com itens de empunhadura Saque, e conta como Imóvel para todos os efeitos.']
        ]],

        ['h2', 'Estados'],
        ['p', 'Estados vêm da situação, do local, da preparação ou da habilidade de quem age, e podem ser benéficos ou maléficos. Estados que dão o mesmo bônus ou a mesma penalidade não se acumulam: vale só o maior. Um benefício pode anular um malefício e vice-versa.'],
        ['h3', 'Benéficos'],
        ['dl', [
          ['Local benéfico', 'Estar em um terreno vantajoso para a sua ação, como lançar uma magia em um campo mágico, atirar de um ponto mais alto que o alvo, fazer o dever de casa numa biblioteca (não de última hora) ou domesticar um animal selvagem num ambiente controlado. Você tem vantagem no teste.'],
          ['Cobertura', ['Entre você e o atacante há um objeto maciço, como uma parede ou uma barricada. Parte da cadência dirigida a você acerta a cobertura, conforme o quanto você está protegido na direção do atacante:', 'Cobertura parcial: absorve 1d2 disparos da cadência.', 'Meia cobertura: absorve 1d4 disparos da cadência.', 'Cobertura completa: absorve todo o dano. Um dano em área ou outro efeito só atinge você se o ponto central dele tiver uma linha reta até você.', 'Contra disparos a distância, a cobertura parcial e a meia também aumentam a CD da [Acuidade](penalidades#Acuidade).']],
          ['Preparação', 'Você se preparou para aquele teste. Gasta horas, dias, até meses para o grande teste final! Mentira, não adianta tanto preparo. Cada hora de preparo custa 3 PE e dá um ganho, que você usa quando quiser na cena para a qual se preparou. Esse tempo não conta como descanso, e os ganhos só valem nessa cena.']
        ]],
        ['h3', 'Malefícios'],
        ['dl', [
          ['Local maléfico', 'Como o local benéfico, mas você tem desvantagem no teste!'],
          ['Terreno difícil', 'Qualquer terreno difícil de atravessar: alagado, esburacado, destruído, trincheira e afins. Mover-se por ele gasta o dobro do deslocamento.']
        ]],
        ['h3', 'Específicos'],
        ['dl', [
          ['No ar', 'Um alvo caindo sem meio de voo (ou voando, se nada disser o contrário) tem –3 em testes.'],
          ['Muito perto!', 'Atirar em um alvo adjacente com uma arma à distância dá –2 no ataque.'],
          ['Cego', 'Você escolhe a direção do ataque e quem acha que é o alvo; depois rola 1d4: com 1 ou 2, o ataque erra, seja qual for o resultado do ataque.']
        ]]
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'raridade', title: 'Raridade', group: 'Equipamento',
      blocks: [
        ['p', 'As raridades gerais, conforme o dispositivo, são:'],
        ['ul', ['Comum', 'Incomum', 'Rara', 'Épica', 'Lendária']],

        ['h2', 'Em Armas'],
        ['p', 'Nas armas, a raridade define a qualidade da arma e quantos mods ela suporta.'],
        ['table', ['Raridade', 'Mods', 'Propriedade'], [
          ['Comum', '1 slot de mod.', ''],
          ['Incomum', '1 slot de mod.', 'Contém propriedade.'],
          ['Rara', '2 slots de mod.', ''],
          ['Épica', '2 slots de mod.', 'Contém propriedade.'],
          ['Lendária', '3 slots de mod.', 'Contém propriedade.']
        ]],

        ['h2', 'Em Mods'],
        ['p', 'Nos mods, a raridade define quantos slots o mod ocupa e o tamanho da alteração que ele faz.'],
        ['table', ['Raridade', 'Descrição', 'Custo'], [
          ['Comum', 'Faz o básico.', 'Usa 1 slot'],
          ['Rara', 'Só não faz café.', 'Usa 2 slots'],
          ['Lendária', 'O céu é o limite (literalmente).', 'Usa 3 slots.']
        ]],

        ['h2', 'Em Armaduras'],
        ['p', 'Nas armaduras, a raridade define a qualidade da proteção.'],
        ['dl', [
          ['Comum', 'Normal, ou quase isso.'],
          ['Incomum', 'Pode ter uma propriedade.'],
          ['Rara', 'Tem mais armadura!'],
          ['Épica', 'Tem mais armadura e uma propriedade.'],
          ['Lendária', 'Tem muita armadura e umas propriedades aí…']
        ]]
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'mods-e-acessorios', title: 'Mods e Acessórios', group: 'Equipamento',
      blocks: [
        ['h2', 'Mods'],
        ['p', 'Mods acrescentam ou modificam regras das armas. Em geral, não dão bônus numéricos, mas dão habilidades únicas (ou não) aos equipamentos.'],
        ['h3', 'Ficha de mod'],
        ['fields', ['Mod (tipo)', 'Raridade', 'Efeito', 'Acessórios']],

        ['h2', 'Acessórios'],
        ['p', 'Acessórios vêm embutidos nos mods. Fora disso, cada slot de mod comporta 3 acessórios, ao custo de 50C a cada 3. Em armas especiais, os acessórios já fazem parte das propriedades.'],
        ['p', 'Cada posição abaixo comporta um só acessório. Acessórios de mods diferentes não se acumulam, mas você escolhe quais dos 3 de cada mod quer usar.'],

        ['h3', 'Melee'],
        ['fields', ['Ponta', 'Dorso', 'Empunhadura', 'Cabo']],

        ['h3', 'Armas de fogo'],
        ['h4', 'Miras'],
        ['dl', [
          ['Red dot/Holográfica', 'Ignora a dificuldade de percepção de média distância e cobertura parcial na mesma distância quando estiver mirando.'],
          ['Ampliação', 'Ignora a dificuldade de percepção de média distância a longa e cobertura parcial nas mesmas distâncias quando estiver mirando.'],
          ['Telescópica', 'Ignora a dificuldade de percepção de longa a muito longa distância e meia cobertura nas mesmas distâncias quando estiver mirando.']
        ]],
        ['h4', 'Bocal'],
        ['dl', [
          ['Silenciador', 'Permite fazer teste de furtividade para os disparos.'],
          ['Cano longo', 'Aumenta em uma categoria o alcance da arma.']
        ]],
        ['h4', 'Carregador'],
        ['dl', [
          ['Estendido', 'O pente chega ao limite de munição do tipo dele.'],
          ['Escalar', 'Muda o pente de leve para médio e de médio para pesado, e vice-versa.'],
          ['Duplo', 'Se o pente tiver no máximo 30 munições, você recarrega com a ação bônus, uma vez sim, outra não.']
        ]],
        ['h4', 'Empunhadura'],
        ['dl', [
          ['Telêmetro', 'Mostra em tempo real a distância até onde você está mirando.'],
          ['Mira laser', 'Ignora a dificuldade de percepção de média distância e a cobertura parcial nessa distância, mas dá –1 em furtividade de curta a média distância.'],
          ['Lanterna', 'Liga quando você quiser e ilumina um cone de 9 m à frente da arma.'],
          ['Lanterna UV', 'Como a lanterna, mas a luz é UV e não serve para enxergar no escuro.'],
          ['Tripé', 'Apoiar a arma custa só uma ação de movimento, em vez de uma ação completa.']
        ]]
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'recarga', title: 'Recarga', group: 'Equipamento',
      blocks: [
        ['p', 'A recarga consome ações dependendo do “peso” do pente ou do mecanismo de alimentação da arma.'],
        ['h2', 'Pente leve'],
        ['p', 'Até 20 disparos. Recarregar custa uma ação bônus (ou uma ação padrão, se você estiver debilitado), e cada pente ocupa ¼ de carga.'],
        ['h2', 'Pente médio'],
        ['p', 'Até 40 disparos. Recarregar custa uma ação de movimento, e cada pente ocupa ½ de carga.'],
        ['h2', 'Pente pesado'],
        ['p', 'Até 150 disparos. Recarregar custa uma ação completa ou duas ações de movimento (uma nesta rodada e outra na próxima), e cada pente ocupa 1 de carga.'],
        ['h2', 'Recarga parcial'],
        ['p', 'Se a arma recarrega cartucho a cartucho, cada cartucho inserido é uma ação livre, até 2 por turno. Para inserir mais, use outras ações: até 5 com a ação bônus, ou até 10 com a ação de movimento ou a padrão. Cada 20 munições ocupam ¼ de carga.'],
        ['h2', 'Superaquecimento'],
        ['p', 'Algumas armas não têm limite definido de munição, porque a fonte é energética, mítica ou anormal, ou porque têm tantos disparos que o mecanismo esquenta demais (o pente **Sobrecarga**).'],
        ['p', 'No lugar da cadência, a arma tem um limite de disparos seguidos. Se você passar desse limite somando os disparos desta rodada e da anterior, a arma superaquece e entra em resfriamento até o fim do seu próximo turno; nesse tempo, você não pode atacar com ela.'],
        ['p', 'Cada recarga ocupa 1 de carga, dura a cena inteira e funciona por até 2 cenas seguidas antes de você precisar de munição de novo. Recarregar custa a ação completa, incluindo a ação bônus.']
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'empunhadura', title: 'Empunhadura', group: 'Equipamento',
      blocks: [
        ['p', 'A empunhadura define quantas mãos são necessárias para usar um item corretamente. Usar uma arma ou equipamento fora da empunhadura ideal deixa você **sem proficiência** com aquele item, mesmo que tenha a proficiência correspondente.'],

        ['h2', 'Saque'],
        ['p', 'Itens de empunhadura **Saque** podem ser sacados e manipulados rapidamente, sem atrapalhar as outras empunhaduras, desde que a ação não envolva os itens já empunhados. Uma vez por turno, você pode sacar ou guardar **um** item de Saque sem gastar ações. Itens de **Uma Mão** e **Duas Mãos** não podem ser usados como itens de Saque.'],

        ['h2', 'Uma Mão'],
        ['p', 'Itens que ocupam uma mão inteira durante o uso.'],

        ['h2', 'Duas Mãos'],
        ['p', 'Itens que exigem as duas mãos ao mesmo tempo. Usá-los de outra forma deixa o personagem **sem proficiência** com o item.']
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'armas', title: 'Armas', group: 'Equipamento',
      blocks: [
        ['h2', 'Ficha de armas'],
        ['h3', 'Melee'],
        ['fields', ['Tipo', 'Modelo/Fabricante', 'Raridade', 'Dano', 'Carga/Empunhadura', 'Modificador']],
        ['h3', 'Armas de fogo'],
        ['fields', ['Tipo', 'Modelo/Fabricante', 'Raridade', 'Dano', 'Cadência/modo', 'Pente/Recarga', 'Alcance efetivo', 'Carga/Empunhadura', 'Modificador']],

        ['h2', 'Tipo'],
        ['p', 'O tipo da arma define a sua base: o mecanismo que gera os disparos ou o modelo de construção. Cada tipo dá alguns benefícios por natureza, e a **média de criação** diz os valores típicos de uma arma daquele tipo.'],
        ['note', 'Sem proficiência em arma corpo a corpo', 'Sem proficiência com o tipo da arma corpo a corpo, você não recebe as propriedades básicas da arma (como a Espada com Precisão, o crítico que sangra ou atordoa e ser efetiva contra escudo ou blindagem). Ela continua causando o dano normal.'],

        ['card', 'Espada', [
          ['p', 'O ataque com espada pode usar Precisão no lugar de Corpo. O crítico causa sangramento (perde 1d6 PV); o alvo evita com Fortitude contra CD 6 + Precisão + Luta.'],
          ['kv', 'Média de criação', [['Carga', 'Máximo de 2.'], ['Dano', 'Cortante.']]]
        ]],
        ['card', 'Lança', [
          ['p', 'A lança tem 1,5 m de alcance para cada carga que ocupa.'],
          ['kv', 'Média de criação', [['Carga', 'Máximo de 3.'], ['Dano', 'Perfurante.']]]
        ]],
        ['card', 'Marreta', [
          ['p', 'O crítico causa atordoamento; o alvo evita com Fortitude contra CD 6 + Corpo + Luta. É eficiente contra Blindagem.'],
          ['kv', 'Média de criação', [['Carga', 'Máximo de 3.'], ['Dano', 'Contundente.']]]
        ]],
        ['card', 'Machado', [
          ['p', 'O crítico causa sangramento (perde 1d6 PV); o alvo evita com Fortitude contra CD 6 + Corpo + Luta. É eficiente contra Escudo.'],
          ['kv', 'Média de criação', [['Carga', 'Máximo de 3.'], ['Dano', 'Contundente ou Cortante.']]]
        ]],
        ['card', 'Pistola', [
          ['p', 'Sacar e guardar a pistola custa uma ação bônus. Ela não sofre penalidade por atirar em inimigos adjacentes nem por disparar com uma só mão, e pode ser usada com a habilidade Akimbo.'],
          ['kv', 'Média de criação', [['Pente', 'Pente leve.'], ['Modo', 'semi, único e automático.'], ['Carga', 'Máximo de 1'], ['Alcance', 'Curto a Médio.']]],
          ['p', '*Variante:*'],
          ['p', 'Revólver: mantém as propriedades da pistola e pode ser usado com a habilidade Gatilho do velho mundo.'],
          ['kv', 'Revólver', [['Pente', 'Pente parcial.'], ['Modo', 'Único e semi automático'], ['Alcance', 'Longo.']]],
          ['p', 'Não é preciso ser proficiente com pistolas para atirar com a cadência perita.']
        ]],
        ['card', 'Espingarda', [
          ['p', 'Quando o alvo está no alcance efetivo, some metade da sua Precisão ao ataque. Se for proficiente com a arma, você pode usar Corpo como atributo base.'],
          ['kv', 'Média de criação', [['Pente', 'Pente leve. Pente parcial. Pente médio.'], ['Modo', 'semi e único.'], ['Carga', 'Máximo de 3.'], ['Alcance', 'Curto a médio.']]],
          ['p', '*Variante:*'],
          ['p', 'Cano curto: mantém as propriedades da espingarda. O disparo se espalha e acerta o primeiro alvo em cada uma de 3 linhas na direção do tiro, com metade do dano em todos. Não sofre penalidade contra alvos adjacentes; se você estiver adjacente ao alvo, só ele recebe o ataque, com dano normal.'],
          ['kv', 'Cano curto', [['Pente', 'Pente leve. Pente parcial.'], ['Modo', 'semi e único.'], ['Carga', 'Máximo de 2.'], ['Alcance', 'Curto.']]]
        ]],
        ['card', 'Rifle de precisão', [
          ['p', 'Você pode usar uma ação completa para mirar em um único disparo, que dobra o bônus de perícia dele. Se for proficiente com a arma, pode fazer mais de um disparo assim; o bônus cai 1 por disparo adicional até zerar.'],
          ['kv', 'Média de criação', [['Pente', 'Pente médio. Pente parcial. Pente pesado.'], ['Modo', 'semi e único.'], ['Carga', 'Máximo de 3.'], ['Alcance', 'Médio, longo, muito longo.']]]
        ]],
        ['card', 'Fuzil', [
          ['p', 'O fuzil tem uma propriedade a mais, conforme o tipo de recarga:'],
          ['dl', [
            ['Assalto (Leve)', 'Recarrega um pente médio de até 30 disparos com a ação bônus e não sofre penalidade por atirar em terreno difícil ou em situação difícil.'],
            ['Batalha (Médio)', 'Todas as penalidades caem 1 (incluindo a de cadência).'],
            ['Precisão (Pesado)', 'Aceita um pente pesado de até 50 disparos como se fosse médio e, apoiado, não sofre penalidade de percepção até a média distância.']
          ]],
          ['p', 'Se você for proficiente com fuzis, recarrega o pente médio com a ação bônus.'],
          ['kv', 'Média de criação', [['Pente', 'Pente médio, pente pesado.'], ['Modo', 'Automático e semi automático.'], ['Carga', 'Máximo de 3.'], ['Alcance', 'Médio a longo.']]]
        ]],
        ['card', 'Metralhadora leve', [
          ['p', 'Com tripé, ou apoiada numa cobertura que não seja completa (apoiar custa a ação completa), a penalidade de cadência cai 1 a cada 5 disparos. Se você for proficiente, cai 1 a cada 3 disparos.'],
          ['kv', 'Média de criação', [['Pente', 'Pente médio. Pente pesado. Sobrecarga.'], ['Modo', 'semi e automático.'], ['Carga', 'Máximo de 5.'], ['Alcance', 'Médio a longo.']]]
        ]],
        ['card', 'Submetralhadora', [
          ['p', 'Você pode atirar com Essência no lugar de Precisão, mas com –1 no ataque mesmo no disparo único, somado à penalidade de cadência. Se for proficiente com submetralhadoras, pode usá-las com a habilidade Akimbo e não sofre a penalidade por atirar com Essência.'],
          ['kv', 'Média de criação', [['Pente', 'Pente leve. Pente médio.'], ['Modo', 'semi e automático.'], ['Carga', 'Máximo de 2.'], ['Alcance', 'Médio a curto.']]]
        ]],
        ['card', 'Laser', [
          ['p', 'Uma rajada de energia contínua. Você aplica toda a cadência de uma vez (sem multiplicador nem penalidade), e a cada turno precisa atacar o mesmo alvo do ataque anterior. A cada turno seguido, ganha +1 no ataque, gastando 1 da cadência usada no início. Para manter o bônus, você precisa continuar acertando e não ser interrompido.'],
          ['p', 'Se for atingido por qualquer fonte nesse período, faça um teste de Resistência contra CD 8 em terreno normal, 10 em terreno difícil ou 12 em estado especial ou voando. Se falhar, o bônus recomeça e a cadência gasta é perdida; se for proficiente, a munição não é perdida.'],
          ['kv', 'Média de criação', [['Pente', 'Pente médio, Sobrecarga.'], ['Modo', 'contínuo.'], ['Carga', 'Máximo de 3.'], ['Alcance', 'Médio a longo.']]]
        ]]
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'armaduras', title: 'Armaduras', group: 'Equipamento',
      blocks: [
        ['p', 'As armaduras podem ou não possuir um **Núcleo** integrado.'],
        ['p', 'Também é possível instalar **órteses** em uma armadura. Elas funcionam da mesma forma que próteses, utilizando os mesmos limites de instalação e regras de funcionamento. No entanto, transferir uma órtese para outra armadura exige **um descanso longo dedicado ao trabalho de adaptação**. Além disso, caso a armadura seja removida, todos os benefícios concedidos por suas órteses deixam de funcionar até que ela seja equipada novamente.'],

        ['h2', 'Tipos de Armadura'],
        ['card', 'Armadura Leve', [
          ['p', 'Sem penalidade. Ocupa 1 de carga.'],
          ['table', ['Modelo genérico', 'Armadura', 'Extra'], [
            ['Comum', '5', ''],
            ['Incomum', '5', 'uma Propriedade'],
            ['Rara', '6', ''],
            ['Épica', '6', 'uma Propriedade'],
            ['Lendária', '7', 'uma grande Propriedade']
          ]]
        ], 3],
        ['card', 'Armadura Média', [
          ['p', 'Penalidade de **–1** (**–2** sem proficiência). Ocupa 3 de carga.'],
          ['table', ['Modelo genérico', 'Armadura', 'Penalidade', 'Extra'], [
            ['Comum', '6', '–1', ''],
            ['Incomum', '6', '–1', 'uma Propriedade'],
            ['Rara', '7', '–1', ''],
            ['Épica', '7', '–1', 'uma Propriedade'],
            ['Lendária', '9', '–1', 'uma grande Propriedade']
          ]]
        ], 3],
        ['card', 'Armadura Pesada', [
          ['p', 'Penalidade de **–2** (**–4** sem proficiência). Ocupa 5 de carga.'],
          ['table', ['Modelo genérico', 'Armadura', 'Penalidade', 'Extra'], [
            ['Comum', '8', '–2', ''],
            ['Incomum', '8', '–2', 'uma Propriedade'],
            ['Rara', '9', '–2', ''],
            ['Épica', '9', '–2', 'uma Propriedade'],
            ['Lendária', '11', '–2', 'uma grande Propriedade']
          ]]
        ], 3],

        ['h2', 'Penalidade de Armadura'],
        ['p', 'A penalidade da armadura entra como modificador negativo em **Manha**, **Reflexos**, **Sentidos** e **Operações**. Se o personagem for **proficiente** com a categoria da armadura, a penalidade cai à metade.'],
        ['p', 'O valor da penalidade final, sem o sinal, também é a **Carga** que a armadura ocupa quando transportada.'],

        ['h2', 'Outros'],
        ['p', 'A armadura básica de todos os seres é 6. Um personagem só pode vestir **uma armadura por vez**.'],

        ['h2', 'Ficha de Armadura'],
        ['fields', ['Modelo/Fabricante', 'Núcleo (Sim/Não. Se sim, qual?)', 'Armadura', 'Penalidade', 'Carga', 'Raridade/tipo']]
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'nucleo-proteses-modulos', title: 'Núcleo, Próteses e Módulos', group: 'Equipamento',
      blocks: [
        ['h2', 'Núcleo'],
        ['p', 'O Núcleo sustenta todos os sistemas de próteses e módulos.'],
        ['p', 'Sem um Núcleo, próteses funcionam apenas como substituições de órgãos naturais e todos os módulos permanecem inativos.'],
        ['p', 'Um Núcleo implantado, seja em um personagem ou em uma armadura, **não conta para o limite máximo de Carga**. Independentemente do modelo, **todo Núcleo possui Carga 1**.'],
        ['h3', 'Ficha de Núcleo'],
        ['fields', ['Modelo/Fabricante', 'Carga Cibernética', 'Raridade']],

        ['h2', 'Próteses e Módulos'],
        ['p', 'Próteses e módulos são sistemas cibernéticos que podem ser instalados no corpo do usuário ou em armaduras compatíveis.'],
        ['p', '**Próteses** substituem partes do corpo, reproduzindo ou ampliando suas funções naturais. Elas concedem benefícios mecânicos diretos e podem alterar capacidades físicas, sensoriais ou funcionais do usuário.'],
        ['p', '**Módulos** são componentes adicionais instalados em próteses, armaduras ou estruturas compatíveis. Normalmente possuem funções passivas, melhorias específicas ou sistemas auxiliares que ampliam o funcionamento do equipamento ao qual estão conectados.'],
        ['p', 'Ambos dependem de um **Núcleo** para funcionar corretamente.'],
        ['p', 'Cada personagem pode possuir apenas **um único Núcleo ativo**, seja ele implantado diretamente no corpo ou integrado em uma armadura.'],

        ['h2', 'Carga Cibernética (CC)'],
        ['p', 'A **Carga Cibernética** representa a capacidade do Núcleo de alimentar e controlar sistemas cibernéticos.'],
        ['p', 'O limite total de próteses e módulos é:'],
        ['formula', '', 'CC Total = Núcleo + Corpo'],
        ['p', 'Além disso, a Essência concede uma reserva adicional exclusiva para módulos:'],
        ['formula', '', 'Carga adicional de Módulos = Essência'],
        ['p', 'Essa carga adicional não pode ser usada para instalar próteses.'],
        ['p', 'O mesmo Núcleo é utilizado para calcular ambos os limites. Os slots de instalação não são somados novamente para criar um limite separado.'],

        ['h2', 'Tipos de Próteses e Módulos'],
        ['p', 'O tipo define o custo em **Carga Cibernética (CC)**, o nível de complexidade e o potencial do sistema instalado.'],
        ['card', 'Suporte', [
          ['kv', '', [['Custo', '1 CC']]],
          ['p', 'Sistemas simples projetados para auxiliar o usuário em tarefas específicas.'],
          ['p', 'Possuem baixo consumo energético e normalmente oferecem melhorias pequenas, funções auxiliares ou utilidades narrativas.'],
          ['p', 'São comuns em equipamentos civis, trabalhadores industriais e usuários que precisam de pequenas adaptações.'],
          ['note', 'Exemplos', ['Olho artificial com visão ampliada.', 'Mão mecânica para maior precisão.', 'Interface de comunicação simples.', 'Sistema respiratório auxiliar.', 'Compartimento interno oculto em uma armadura.']]
        ], 3],
        ['card', 'Operacional', [
          ['kv', '', [['Custo', '2 CC']]],
          ['p', 'Sistemas completos capazes de substituir equipamentos, cumprir funções inteiras ou oferecer ferramentas integradas.'],
          ['p', 'Possuem maior complexidade e podem eliminar a necessidade de carregar determinados itens físicos.'],
          ['note', 'Exemplos', ['Braço mecânico com ferramenta integrada.', 'Olho com análise tática e leitura de informações.', 'Armadura com sistema de suporte médico.', 'Módulo de armazenamento interno.', 'Perna com sistema de estabilização e impulso.']]
        ], 3],
        ['card', 'Mecânico', [
          ['kv', '', [['Custo', '3 CC']]],
          ['p', 'Sistemas avançados de alto desempenho, projetados para alterar capacidades do usuário e ampliar suas limitações naturais.'],
          ['p', 'Possuem mecanismos próprios, maior potência e podem conter habilidades especiais.'],
          ['p', 'Normalmente são utilizados por soldados especializados, mercenários de elite e usuários com grande capacidade cibernética.'],
          ['note', 'Exemplos', ['Braço de combate com força ampliada.', 'Espinha artificial que melhora processamento motor.', 'Sistema muscular artificial de alta potência.', 'Armadura com membros auxiliares automatizados.', 'Núcleo de combate integrado com funções avançadas.']]
        ], 3],

        ['h2', 'Módulos especiais'],
        ['p', 'Alguns módulos têm regras próprias. São os mesmos que equipam a armadura **Mirage**: radar, I.A., perito e rede.'],
        ['card', 'Radares', [
          ['p', 'Radares são como uma percepção bônus que identifica o que o seu método permite detectar.'],
          ['p', 'Por padrão, um radar permite fazer **testes de Sentidos** para perceber o que ele detecta. Exemplo: um radar de radiodetecção pode revelar a posição de inimigos atrás de uma parede que o radar atravessa.'],
          ['p', 'Cada radar conta como um módulo.'],
          ['note', 'Exemplos', ['Radiodetecção: corpos e objetos sólidos, atrás de paredes.', 'Térmico: fontes de calor, mesmo no escuro ou na fumaça.', 'Sonar: movimento e formato do ambiente, sem luz.', 'Eletromagnético: eletrônicos, implantes, núcleos e escudos.', 'Completo: tudo o que os quatro detectam.']]
        ], 2],
        ['card', 'I.A.', [
          ['p', 'O módulo de I.A. acrescenta uma inteligência artificial que faz ações de **busca, pesquisa e análise** por você. Quem faz o teste é o mestre, usando a **Precisão** da I.A., que é o nível de inteligência dela.'],
          ['p', 'I.A. não tem raridade. Como módulo só existe a **I.A. leve**, e as variações dela são a especialidade (pesquisa, análise, infiltração, combate...). Diferente dos outros módulos, ela só pode ser instalada em itens **Épicos ou Lendários**.'],
          ['p', 'A **I.A. própria** não é um módulo: ela é como uma personagem, com alta consciência e todo o fator de interpretação de uma I.A. Só itens **Lendários** a suportam, e só ela pode ser colocada em um corpo próprio.'],
          ['p', 'O **preço** da I.A. leve é o que define a Precisão dela; a especialidade só muda o que ela faz:'],
          ['kv', '', [['4.000 Cronos', 'Precisão 1'], ['6.000 Cronos', 'Precisão 2'], ['9.000 Cronos', 'Precisão 3']]]
        ], 2],
        ['card', 'Perito', [
          ['p', 'O **módulo perito (perícia)** funciona como o poder Doutor naquela perícia: o limite de modificador nela se torna 4 e você ganha +1 ponto de perícia enquanto o módulo estiver ativo.'],
          ['p', 'Não acumula com Doutor: se você já tem Doutor na mesma perícia, o módulo não muda nada.']
        ], 2],
        ['card', 'Rede', [
          ['p', 'O **módulo de rede** permite se conectar livremente à internet, sem precisar de um aparelho.'],
          ['p', 'Versões melhores criptografam a conexão ou funcionam mesmo sob bloqueio de sinal.']
        ], 2],

        ['h2', 'Ficha de Próteses e Módulos'],
        ['fields', ['Modelo (Prótese ou Módulo)', 'Tipo / CC', 'Efeito']]
      ]
    },

    /* ------------------------------------------------------------ 13 */
    {
      id: 'origens', title: 'Origens', group: 'Personagem',
      blocks: [
        ['card', 'Exilado Urbano', [
          ['p', 'Vivendo nas ruínas das cidades corporativas, sobreviveu nas sombras, roubando energia, vendendo informações e lidando com o submundo.'],
          ['p', 'Itens iniciais:'],
          ['ul', [
            '1 Lâmina simples ou fuzil de assalto comum (3 cargas de munição);',
            '1 armadura média improvisada (4 armadura, –1 penalidade comum);',
            '1 comunicador portátil;',
            '1 injetor de estímulo (restaura 5 PE em troca de 5 PV, uma vez por cena).'
          ]]
        ]],
        ['card', 'Mercenário de Fronteira', [
          ['p', 'Viveu entre os destroços das zonas externas, endurecido e acostumado a negociar por munição.'],
          ['p', 'Itens iniciais:'],
          ['ul', [
            '1 arma de fogo comum (à escolha, 3 cargas de munição);',
            '1 armadura leve (armadura 2) com núcleo simples +2;',
            '1 kit de manutenção de robô (2 usos, cura 3d6 de Blindagem, 1 h de trabalho, ¼ de carga);',
            '1 kit de primeiros socorros (cura 2d6 PV, ¼ de carga).'
          ]]
        ]],
        ['card', 'Engenheiro', [
          ['p', 'Ex-funcionário de megacorporação ou catador com cérebro afiado.'],
          ['p', 'Itens iniciais:'],
          ['ul', [
            '1 ferramenta multifunção (permite usar a perícia Tecnologia);',
            '1 pistola básica ou rifle (3 slots de munição);',
            '1 ano Chirlez backup (20 slots digitais de itens);',
            '1 vestimenta de proteção leve (armadura leve +2).'
          ]]
        ]],
        ['card', 'Médico de Rua', [
          ['p', 'Atendeu em clínicas clandestinas, costurando gangues rivais na mesma noite e cobrando em créditos, favores ou silêncio.'],
          ['p', 'Itens iniciais:'],
          ['ul', [
            'Kit Médico LS-1;',
            'Pulse P-01 (pistola comum);',
            'Pente leve padrão;',
            'Tnnaks Jackt (armadura leve);',
            'Nano Purificador (1 dose).'
          ]]
        ]],
        ['card', 'Caçador de Recompensas', [
          ['p', 'Vive de contratos: rastreia fugitivos pelas zonas externas e só recebe se trouxer o alvo, vivo ou não.'],
          ['p', 'Itens iniciais:'],
          ['ul', [
            'Iron Revolver ER-2 ou Carbine R-10;',
            'Pente leve padrão;',
            'Static Candy (granada elétrica);',
            'Tnnaks Jackt (armadura leve);',
            'Mochila pequena.'
          ]]
        ]],
        ['card', 'Ex-Soldado Corporativo', [
          ['p', 'Serviu numa força de segurança de megacorporação até ser dispensado, ou até desertar. Ainda carrega o treino e parte do equipamento.'],
          ['p', 'Itens iniciais:'],
          ['ul', [
            'Storm SM-5 ou Crusher SG-4;',
            'Pente médio padrão;',
            'Tnnak Blazer (armadura média);',
            'Pink Pop (granada de fragmentação);',
            'Kit Médico LS-1.'
          ]]
        ]],
        ['card', 'Fantasma da Rede', [
          ['p', 'Invasor de sistemas que vive mais na rede do que nas ruas. Vende acessos, apaga registros e some antes que alguém descubra quem foi.'],
          ['p', 'Itens iniciais:'],
          ['ul', [
            'Pulse P-01 (pistola comum);',
            'Stiletto Noir (lâmina de saque);',
            'Carregador de Campo LS-3;',
            'Blush Smoke (granada de fumaça);',
            '1 comunicador portátil criptografado.'
          ]]
        ]],
        ['card', 'Gladiador de Arena', [
          ['p', 'Lutou em arenas clandestinas pelo entretenimento das elites e saiu de lá com cicatrizes, fama e pouca paciência.'],
          ['p', 'Itens iniciais:'],
          ['ul', [
            'Kiss Hammer ou Bubblegum Hatchet;',
            'Tnnak Blazer (armadura média);',
            'Pink Veil (escudo energético);',
            'Kit Médico LS-1.'
          ]]
        ]],
        ['card', 'Sucateiro', [
          ['p', 'Cresceu nos ferros-velhos, desmontando drones e robôs abandonados. Sabe o valor de cada peça e conserta quase tudo com o que tem à mão.'],
          ['p', 'Itens iniciais:'],
          ['ul', [
            'Kit Técnico LS-2;',
            'Bubblegum Hatchet (machadinha);',
            'Mochila média;',
            'Tnnaks Jackt (armadura leve);',
            '1 sucata de núcleo (pode ser vendida ou usada como peça).'
          ]]
        ]]
      ]
    },

    /* ------------------------------------------------------------ 14 */
    {
      id: 'especimes', title: 'Espécimes', group: 'Personagem',
      blocks: [
        ['card', 'Humano', [
          ['p', 'Nada de especial, talvez a sua experiência passada: tome 3 UP de início!'],
          ['p', 'Regra opcional, **Experiência mundana**: a idade do humano define quantos UP ele recebe e quantas Perdas carrega.'],
          ['table', ['Idade', 'Ganho'], [
            ['17 a 25 anos', '3 UP'],
            ['26 a 30 anos', '4 UP e 1 Perda.'],
            ['31 a 40 anos', '5 UP e 2 Perdas.'],
            ['41 a 60 anos', '6 UP e 3 Perdas.'],
            ['Mais que isso...', 'Até 10 UP e um valor igual de Perdas!']
          ]]
        ]],
        ['card', 'Robô', [
          ['p', 'Meio que é… feito de lata né não?'],
          ['h4', 'Núcleo'],
          ['p', 'Você tem um núcleo! E depende dele, acoplado a você, para sobreviver. Você começa o jogo com um núcleo +2 comum, seus PV viram Blindagem, e o que ficar negativo conta como Escudo!'],
          ['h4', 'Engenharia'],
          ['p', 'Como um bom pedaço de lata, você não equipa itens: você os acopla ao corpo. Isso vale para armaduras e módulos. Acoplar leva ao menos 1 hora, e cada +2 de Carga Cibernética dado pelo núcleo acoplado vale +1 de Carga Cibernética a mais.'],
          ['h4', 'Não vivo'],
          ['p', 'Você é lata, e lata não é afetada por coisas biológicas nem precisa descansar: é só colocar na tomada! Você não recupera PV por descanso nem por cura, mas pode ser consertado com testes de Tecnologia e um kit de ferramentas adequado. O conserto leva 1 descanso longo fora de serviço, e o teste de Tecnologia recupera Blindagem igual ao resultado dos dados.']
        ]],
        ['card', 'Android', [
          ['p', 'Você é um robô, só que humanoide...'],
          ['h4', 'Engenharia'],
          ['p', 'Como um bom pedaço de lata, você não equipa itens: você os acopla ao corpo. Isso vale para armas e armaduras, que, acopladas, ocupam a sua Carga Cibernética em vez da Carga. Acoplar leva ao menos 1 hora, e cada +2 de Carga Cibernética dado pelo núcleo acoplado vale +1 de Carga Cibernética a mais.'],
          ['p', 'Para você, próteses são peças, e você não precisa de uma prótese para instalar módulos.'],
          ['h4', 'Núcleo'],
          ['p', 'Você tem um núcleo! E depende dele, acoplado a você, para sobreviver. Você começa o jogo com um núcleo +2 comum, seus PV viram Blindagem, e o que ficar negativo conta como Escudo!'],
          ['h4', 'Humanidade'],
          ['p', 'Você pode fazer testes para resistir a efeitos de PEM (pulso eletromagnético) quando eles tiverem CD, e metade da sua Blindagem pode ser regenerada como se fosse PV.'],
          ['p', 'Efeitos de PEM atordoam automaticamente seres elétricos ou eletrônicos e desativam Escudos. Com a Humanidade, o Android faz o teste quando houver CD; se não houver, ele não é afetado pelo PEM.']
        ]],
        ['card', 'Simbionte', [
          ['p', 'Massa amorfa, viva e independente, que molda o próprio corpo: tira da própria matéria força, cura e armas.'],
          ['h4', 'Força e Agilidade Ampliadas'],
          ['p', 'Aumenta a própria força física a níveis devastadores, permitindo erguer toneladas e enfrentar inimigos do alto escalão. Ganha +6 m de deslocamento e, uma vez por turno, ao custo de 1 PA ou 7 PE, um ganho em um teste de Corpo.'],
          ['h4', 'Cura Regenerativa'],
          ['p', 'Cura ferimentos mortais em questão de segundos, regenera membros decepados e pode até neutralizar doenças terminais.'],
          ['p', 'Ressuscita o alvo se sobrar algo dele que não esteja sendo afetado por algum efeito.'],
          ['p', 'No início de cada turno, faça um teste de regeneração: 2d6 + Fortitude + Tecnologia. A regeneração segue a regra normal de Cura: o teste é contra a CD do recurso (6, ou 10 se estiver abaixo da metade, +2 por condição negativa) e o simbionte recupera a diferença entre o resultado e a CD. Cura PV e também Blindagem.'],
          ['p', 'A regeneração é engajada por cena e custa 1 PE por cena.'],
          ['h4', 'Assimilação Abiótica'],
          ['p', 'O simbionte estica a própria massa amorfa para criar tentáculos, escudos protetores, garras, lâminas, machados, espigões, martelos sólidos, armaduras e outros itens que não sejam consumíveis. O simbionte escolhe o item e o tipo de dano.'],
          ['p', 'Criar um item custa uma ação bônus, e você conta como proficiente com todos os itens que o simbionte cria.'],
          ['p', 'Você pode guardar dentro de si itens criados até um número igual ao seu Corpo; para usar um deles, só precisa sacar.'],
          ['p', 'Os simbiontes não criam armas de dano de Fogo.'],
          ['p', 'O simbionte também é capaz de replicar mods e acessórios que tenha assimilado alguma vez.'],
          ['p', 'Na ficha, o botão **Assimilar** (aba Inventário) abre os slots de assimilação (um por ponto de Corpo, mínimo 1) e o **catálogo de assimilações**: tudo que já passou pelo inventário do personagem, menos consumíveis e armas de Fogo. No catálogo ficam os presets, o Armeiro do catálogo (monta no item as peças do próprio catálogo, sem gastá-las) e a opção de assimilar um item num slot escolhido.']
        ]]
      ]
    },

    /* ------------------------------------------------------------ 15 */
    {
      id: 'habilidades', title: 'Habilidades', group: 'Personagem',
      blocks: [
        ['card', 'Esquiva', [
          ['kv', '', [['Custo', '1 UP']]],
          ['p', 'Nos testes de defesa, você usa Precisão como atributo e Reflexos como perícia.'],
          ['p', 'Gastando +1 UP, a Esquiva passa a valer também na defesa mínima.']
        ]],
        ['card', 'Regeneração', [
          ['kv', '', [['Custo', '1 UP']]],
          ['p', 'Só funciona se você for uma criatura biológica. Você recupera 3 PV por turno.'],
          ['p', 'Se estiver caído, pode recobrar a consciência quando recuperar todos os PV.'],
          ['p', 'Cada UP investido nesta habilidade além do custo inicial aumenta a recuperação em +1 PV por turno.']
        ]],
        ['card', 'Transformação', [
          ['p', 'Com uma ação, você assume uma nova forma, criando uma transformação e realocando seus UP livremente. Durante a transformação, os itens da forma original ficam inutilizáveis. Para se transformar mais de uma vez no mesmo dia, gaste 1 PA a cada transformação adicional.'],
          ['p', 'Os recursos da nova forma não são diferenciados dos da forma original. Isso significa que, ao assumir a transformação, você passa a utilizar os valores atuais de seus recursos, aplicando apenas os ajustes positivos ou negativos próprios da nova forma. Ao retornar à forma original, os recursos permanecem nas quantidades em que se encontravam no momento da reversão. Recursos excedentes não são convertidos em recursos adicionais, e recursos que eram maiores antes da transformação voltam a ser contabilizados normalmente; caso tenham sido gastos durante a transformação, esse consumo é refletido nos pontos realocados.'],
          ['p', 'A nova forma deve manter a mesma quantidade de pontos em desvantagens da forma original, e o custo deste poder permanece atrelado à forma transformada. Quando seus Pontos de Vida forem reduzidos a zero, o jogador pode escolher entre manter a forma atual ou retornar à forma original. Cada UP investido corresponde a uma transformação distinta.'],
          ['p', '**Transformação de 2 UP.** Ao adquirir uma transformação de custo 2 UP, os itens da forma original permanecem utilizáveis. Nesse caso, não é necessário manter a mesma quantidade de perdas, embora também não haja ganho de pontos adicionais por isso. Além disso, os recursos passam a ser diferenciados entre a forma original e a forma transformada.'],
          ['p', '**Melhorias**'],
          ['p', '**Única (1 UP cada):** você escolhe uma só transformação e monta a ficha dela. Não pode se transformar em nada além dela. Funciona como a transformação de 2 UP, pelo preço de 1 UP. Cada transformação escolhida assim custa 1 UP.'],
          ['p', '**Mutável (1 UP):** o custo em UP das transformações cai à metade, e você pode se transformar mais vezes ao dia pagando 4 PE (em vez de 1 PA). Os valores contados na transformação não mudam, e passam a contar esta habilidade. Pré-requisito: Transformação (1 ou 2).']
        ]],
        ['card', 'Luta', [
          ['kv', '', [['Custo', '1 UP (+ o custo do estilo de luta, se comprar um)']]],
          ['p', 'Você domina o combate corpo a corpo e golpeia várias vezes por rodada, rivalizando em dano com quem usa armas de fogo.'],
          ['p', 'Seus ataques desarmados contam como uma arma contundente para todos os efeitos, sem precisar de luvas ou armas desse gênero, e você é proficiente com eles.'],
          ['p', '**Ataques múltiplos.** Por rodada, você tem uma quantidade de ataques igual ao seu atributo Corpo + a sua perícia Luta. Eles seguem as mesmas regras de cadência das armas de fogo (veja Regras de Cadência), e cada golpe conta como um disparo: com uma arma corpo a corpo da qual é proficiente (ou desarmado), use a cadência perita; sem proficiência, a penalidade de cadência comum. O dano de cada alvo é multiplicado pelos golpes nele.'],
          ['example', 'Corpo 2 e perícia Luta 1 → 3 ataques por rodada. Desarmado, dois golpes no mesmo alvo: –2 no ataque, dano ×2.'],
          ['p', 'Em vez de golpear, você pode gastar esses ataques nos efeitos marciais básicos abaixo. A tabela é proporcional: cada ataque gasto vale 3 m de movimento, e os efeitos que acumulam crescem um passo por ataque. Os ataques são contados por rodada e não acumulam.'],
          ['table', ['Efeito', 'Custo', 'O que faz'], LUTA_MANOBRAS],
          ['p', '**Estilos de luta.** Os efeitos básicos servem a qualquer lutador; um estilo é o upgrade do poder, com passivas únicas e técnicas próprias que melhoram o básico. Só dá para ter **um estilo por ficha**, e o custo dele soma ao custo do poder.'],
          ...LUTA_ESTILOS.flatMap((e) => [
            ['p', '**' + e.name + ' (' + e.cost + ' UP).** ' + e.resumo],
            ['dl', e.passivas],
            ['table', ['Técnica', 'Custo', 'O que faz'], e.tecnicas]
          ]),
          ['note', 'Técnico', 'Luta não combina direto com tecnomancia: ela se refere à ação de atacar, e não dá para atacar e conjurar ao mesmo tempo. Para complementar os ataques com tecnomancia, é preciso um poder cuja descrição diga que “pode complementar seus ataques à distância e marciais com técnicas de tecnomancia”.']
        ]],
        ['card', 'Tecnomancia', [
          ['kv', '', [['Custo', '1 UP por nível de Tecnomancia (até 5)'], ['Recurso', 'Essência (PE)'], ['Efeitos ao mesmo tempo', 'um por modo de ação'], ['CD contra os seus efeitos', '6 + atributo chave']]],
          ['p', 'A Tecnomancia é o poder dos tecnomantes: com ela você gasta Essência (PE) para criar efeitos com a sua tecnologia, como um disparo de energia ou o efeito de um equipamento que você conhece.'],
          ['p', 'Cada efeito criado se chama **operação**. Você começa com algo simples, como um ataque de toque, e vai somando melhorias (os **implementos**): mais alcance, uma área, mais dano. Cada melhoria custa PE.'],
          ['p', 'Cada nível compra um jeito de usar o poder (o **modo de ação**, como Instantâneo ou Reativo). O seu **tipo de tecnomante** diz de onde vêm os efeitos que você conhece. Cada jogador tem um só tipo.'],
          ['h3', 'Nível de Tecnomancia'],
          ['p', 'O **nível de Tecnomancia** é o nível deste poder, e não o nível do personagem: é quantas vezes você comprou a Tecnomancia. Cada nível de Tecnomancia, incluindo o primeiro, custa 1 UP e compra **um modo de ação** e um grupo de componentes (uma **lista** no Engenheiro, um **catálogo** no Patrocinado). Um modo não pode ser comprado duas vezes, então o nível máximo de Tecnomancia é 5. Você mantém **um efeito ativo por modo de ação** que tem.'],
          ['table', ['Modo', 'Ação', 'Como funciona'], TECNO_ACOES],
          ['h3', 'Operação = base + implementos'],
          ['p', 'Toda operação começa por uma **base**. Depois você soma **implementos**, pagando o PE de cada um. Numa operação, o número de implementos é no máximo o seu **atributo chave**, que vem do seu tipo de tecnomante (o Engenheiro escolhe Precisão ou Essência para cada lista).'],
          ['table', ['Base', 'Custo', 'Como funciona'], TECNO_BASES],
          ['p', '**CD padrão.** Quando alguém faz um teste para resistir a uma operação sua, a CD é **6 + o seu atributo chave**.'],
          ['note', 'Dano', 'Toda forma de causar dano segue a regra de ataque, com o multiplicador da cadência. Dado de dano ou dano que passa pela Defesa só vem de **dano fixo** ou **dano de efeito** de um componente conhecido, como o Sangramento ou o dano adicional de alguns itens.'],
          ['p', '**Implementos padrão.** Todo tecnomante conhece. Cada um conta 1 no limite e pode ser repetido.'],
          ['table', ['Implemento', 'Custo', 'O que faz'], TECNO_IMPLEMENTOS],
          ['p', '**Implementos especiais.** São os componentes que você conhece das suas listas: uma propriedade, um mod, o efeito de uma prótese, um poder. Você usa numa operação no máximo um número de implementos especiais igual ao seu nível de Tecnomancia (o nível do poder, não o do personagem).'],
          ['ul', [
            '**Poder:** custa em PE o dobro do custo de uso + o custo em UP do poder.',
            '**Equipamento, propriedade, mod ou prótese:** custa o PE da raridade (tabela abaixo) + qualquer custo original. Um implemento lendário custa +5 PE.',
            '**Exigências:** siga as do original. Se ele pede uma ação, gaste essa ação.'
          ]],
          ['table', ['Raridade do componente', 'Custo em PE'], TECNO_RARIDADE],
          ['example', 'Com Precisão 2, um ataque a alcance Médio: base Ataque (grátis) + Alcance duas vezes (toque → Curto → Médio) = 2 PE e 2 implementos, o máximo com Precisão 2. Com Precisão 3, ainda caberia uma Área (+2 PE).'],
          ['h3', 'Tipo de tecnomante (um por jogador)'],
          ['p', 'Define de onde vêm os seus componentes.'],
          ['p', '**Engenheiro.** Característica do Engenheiro: ele escolhe o atributo chave de cada lista, **Precisão ou Essência**. A cada nível de Tecnomancia, escolha uma lista de componentes e o atributo chave dela. Você conhece um número de componentes da lista igual a atributo chave + Operações, e eles servem de base Item ou de implementos especiais. Escolher de novo uma lista que já tem dá mais atributo chave + Operações componentes dela.'],
          ['example', 'O Engenheiro compra Tecnomancia: escolhe a lista Equipamento com Precisão como atributo chave e o modo Instantâneo. Com Precisão 2 e Operações 1, conhece 3 itens (por exemplo, uma armadura, uma arma e uma granada).'],
          ['p', '**Consertar Escudo (exclusivo do Engenheiro).** Uma ação efetiva do Engenheiro pode recarregar o Escudo de um alvo, seguindo a regra de Cura: teste de atributo chave + Operações contra a CD; o alvo recupera a diferença.'],
          ['dl', TECNO_LISTAS],
          ['p', '**Patrocinado.** Uma companhia patrocina você. Escolha a companhia uma vez; a cada nível de Tecnomancia, escolha um catálogo dela (todas as armas dela, todas as armaduras dela...) e conheça todos os componentes desse catálogo. Cada nível dá um catálogo diferente.'],
          ['p', 'Propriedades, acessórios e mods não têm patrocinador, porque o valor deles é mecânico. Para essas categorias, o catálogo é um tipo de arma: todas as de armas corpo a corpo ou todas as de armas de fogo.'],
          ['example', 'Um Patrocinado escolhe a Wathrever. No nível 1 de Tecnomancia, pega o catálogo de armas de fogo dela e conhece todas. No nível 2, pega acessórios de armas de fogo.'],
          ['p', '**Insano.** Obtém componentes de um jeito diferente. Em breve.']
        ]],
        ['card', 'Akimbo', [
          ['p', 'Você pode empunhar itens de uma mão, um em cada mão (ou um de cada tipo, seja irado!). A recarga sobe uma categoria de ação: livre vira bônus, bônus vira movimento, movimento vira padrão e padrão vira completa.'],
          ['p', 'Em troca, você pode mirar num único alvo com os dois itens ou escolher até dois alvos. Os disparos saem na mesma ação, mas cada arma faz o seu teste de ataque e causa o seu dano separado.']
        ]],
        ['card', 'Gatilho do velho mundo', [
          ['p', 'Com um revólver de disparo único, você força a arma a ter cadência igual a 1 + metade da sua Precisão, arredondada para cima. O primeiro disparo não entra na penalidade de cadência.'],
          ['p', 'Você pode dividir os disparos entre vários alvos; o ataque é o mesmo para todos, com a penalidade do total de disparos.'],
          ['p', 'Você precisa da outra mão livre para usar esta habilidade.']
        ]]
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'perdas', title: 'Perdas', group: 'Personagem',
      blocks: [
        ['p', 'Uma **Perda** funciona como um poder ao contrário: em vez de custar UP, ela **dá +1 UP** em troca de uma desvantagem que fica com o personagem.'],
        ['ul', [
          'Cada Perda dá +1 UP. Esses UP não contam para os benefícios de UP par e ímpar, como os de origem.',
          'A mecânica de uma Perda (menos PV, menos deslocamento...) entra sozinha na ficha.',
          'Você pode **compensar** uma Perda gastando 1 UP: ela deixa de valer, e o UP que ela deu fica empatado com o que você gastou.'
        ]],
        ['note', 'Na ficha', 'Aba Poderes → Perdas: "Adicionar perda" traz uma Perda do banco, e "Compensar (1 UP)" a desliga. Perdas novas podem ser criadas na Oficina.'],
        ...PERDAS.map((x) => ['card', x[0], [['kv', '', [['Ganho', '+1 UP']]], ['p', x[1]]]])
      ]
    },

    {
      id: 'ficha', title: 'Ficha', group: 'Personagem',
      blocks: [
        ['h2', 'Modelo de ficha'],
        ['fields', ['Nome', 'Idade', 'Altura e peso', 'Sexo', 'Origem', 'Espécime', 'XP: 0', 'UP']],

        ['h2', 'Atributos'],
        ['fields', ['Corpo', 'Precisão', 'Essência']],

        ['h2', 'Recursos'],
        ['fields', ['PV: 5 + (Corpo × 5)', 'Escudo', 'Blindagem', 'PE: 5 + (Essência × 5)', 'PA = Precisão (mínimo 1)']],

        ['h2', 'Perícias'],
        ['h3', 'Perícias de Corpo'],
        ['fields', ['Luta', 'Resistência', 'Atletismo', 'Fortitude']],
        ['h3', 'Perícias de Precisão'],
        ['fields', ['Mira', 'Tecnologia', 'Iniciativa', 'Manha', 'Pilotagem', 'Intelecto', 'Reflexos', 'Ofício']],
        ['h3', 'Perícias de Essência'],
        ['fields', ['Operações', 'Sentidos', 'Vontade', 'Intimidação', 'Diplomacia', 'Enganação']],

        ['h2', 'Proficiências (4 iniciais)'],
        ['fields', ['—', '—', '—', '—']],

        ['h2', 'Ataques'],
        ['formula', '', '2d6 + atributo + perícia do ataque = Ataque'],

        ['h2', 'Defesa'],
        ['formula', '', '2d6 + Corpo + Resistência = Defesa'],
        ['h3', 'Defesa mínima'],
        ['formula', '', 'Armadura + Corpo + Resistência'],

        ['h2', 'Núcleo'],
        ['formula', 'Carga Cibernética', 'Núcleo + Corpo'],
        ['p', 'Reserva só para módulos: + Essência.'],

        ['h2', 'Poderes e Habilidades'],
        ['p', 'Poderes e habilidades ficam listados na ficha, cada um com o seu custo em UP.'],

        ['h2', 'Inventário'],
        ['formula', 'Carga', '2 + (Corpo × 5) + Precisão + (Essência × 2)']
      ]
    }
  ]
};