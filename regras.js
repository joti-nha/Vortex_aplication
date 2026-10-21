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
  ['Desajeitado', 'Você rola um dado a menos (perda) nos testes de Reflexos.', ''],
  ['Míope', 'Você rola um dado a menos (perda) nos testes de Sentidos que dependem da visão e nos ataques à distância contra alvos a mais de 10 m.', ''],
  ['Fobia', 'Escolha algo que você teme. Na presença disso, você rola um dado a menos (perda) em todos os testes até se afastar ou passar num teste de Vontade contra CD 7 (uma tentativa por rodada).', ''],
  ['Vício', 'Escolha uma substância ou um hábito. Se passar um dia sem ele, você rola um dado a menos (perda) nos testes de Vontade e de Sentidos até satisfazer o vício.', ''],
  ['Código de honra', 'Escolha um código (não atacar quem se rende, não mentir, não abandonar um aliado...). Quebrá-lo faz você rolar um dado a menos (perda) em todos os testes até o fim da cena.', ''],
  ['Implante instável', 'Quando um teste feito com uma prótese ou um módulo tiver duas falhas críticas (dois dados 1), a peça desliga até o fim da cena.', ''],
  ['Procurado', 'Alguém poderoso (uma corporação, uma gangue, a lei) quer você. O mestre decide quando e como isso aparece.', ''],
  ['Dívida', 'Você deve a alguém perigoso: começa com metade do dinheiro inicial (750 dos 1.500 Cronos), e o credor vem cobrar.', '']
];
/* Efeitos marciais básicos do poder Luta: [efeito, custo em ataques da rodada, o que faz].
   Só as capacidades genéricas; os estilos de luta (abaixo) trazem as técnicas e passivas próprias.
   A ficha (poder Luta, em items.js) e o capítulo Habilidades usam esta mesma tabela. */
const LUTA_MANOBRAS = [
  ['Passo marcial', '1 por 3 m', 'Você se move 3 m por ataque gasto entre um golpe e outro, sem gastar a ação de movimento.'],
  ['Empurrão', '1 por 3 m', 'Se o golpe acertar, o alvo é empurrado 3 m por ataque gasto (Corpo + Luta contra a Resistência ou os Reflexos dele, o melhor).'],
  ['Alvo extra', '1 por alvo', 'O mesmo golpe acerta mais um alvo adjacente a você por ataque gasto; um só teste vale para todos.'],
  ['Golpe em área', '2 (+1 por 1,5 m)', 'Golpe giratório ou no chão: todos adjacentes a você (raio 1,5 m) sofrem o ataque, com metade do dano. Cada ataque a mais aumenta o raio em 1,5 m.'],
  ['Junção à manobra', '3', 'O golpe e uma manobra (derrubar, desarmar, agarrar ou quebrar a guarda; Corpo + Luta contra a Resistência ou os Reflexos do alvo) saem juntos, sem gastar outra ação.'],
  ['Efeito do dano', '2', 'Se o golpe acertar, causa o efeito do tipo de dano da arma: cortante deixa o alvo Sangrando (perde 1d6 PV no começo de cada turno dele até receber qualquer cura), contundente o deixa Atordoado (perde a ação de movimento; se já estava atordoado, perde o turno), perfurante o deixa Ferido (–1 no ataque e na Defesa por ferida, máximo –3, até receber qualquer cura). O alvo evita com Fortitude contra CD 6 + Corpo (ou Precisão) + Luta.'],
  ['Trocar o dano', '1', 'Neste golpe, a arma causa outro tipo de dano (cortante, contundente ou perfurante): de lado, com o cabo, com a ponta.'],
  ['Guarda', '1 por +1', 'Até o seu próximo turno, +1 na defesa contra ataques corpo a corpo por ataque gasto, até um máximo igual à sua Precisão.'],
  ['Arremesso', '1 por +9 m', 'Todo mundo pode arremessar coisas (alcance base de 9 m, veja Arremessar em Ações); este efeito só aumenta a distância: +9 m por ataque gasto.']
];
/* Estilos de luta: o "upgrade" do poder Luta. Um por ficha; o custo em UP soma ao seu poder em Luta.
   Cada um traz passivas únicas e técnicas próprias, que gastam ataques da rodada como os efeitos básicos. */
const LUTA_ESTILOS = [
  { name: 'Berserker', cost: 2, resumo: 'Fúria e força bruta: troca defesa por dano e fica mais perigoso quanto mais apanha.',
    passivas: [
      ['Fúria', 'Uma vez por cena, como ação livre, você entra em fúria até o fim da cena ou até cair: +2 de dano fixo nos ataques corpo a corpo e –2 na Defesa.'],
      ['Sangue quente', 'Com menos da metade dos PV, você tem +1 ataque por rodada.'],
      ['Couro grosso', 'Em fúria, cada golpe corpo a corpo que você recebe causa 1 de dano a menos.']
    ],
    tecnicas: [
      ['Golpe brutal', '2', 'O golpe causa +1d6 de dano de efeito.'],
      ['Golpe certeiro', '2', 'O golpe causa crítico com 5 e 6.'],
      ['Golpe esmagador', '2', 'Se o golpe acertar, o alvo fica Caído (Corpo + Luta contra a Resistência ou os Reflexos dele, o melhor).'],
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
      ['Aparar', '1 (guardado)', 'Guarde um ataque: como reação a um golpe corpo a corpo, faça um teste de Corpo + Luta contra o ataque; se vencer, o golpe é aparado e não causa dano.'],
      ['Desarme no golpe', '1', 'Se o golpe acertar, o alvo solta a arma no chão (Corpo + Luta contra a Resistência ou os Reflexos dele, o melhor).'],
      ['Golpe certeiro', '2', 'O golpe causa crítico com 5 e 6.'],
      ['Guarda de lâmina', '1 por +2', 'Como a Guarda, mas +2 por ataque gasto; o máximo continua igual à sua Precisão.'],
      ['Arremesso duplo', '1', 'Arremessa duas armas à mão no mesmo ataque, em alvos até 9 m; cada uma faz o seu teste.']
    ] },
  { name: 'Renegado', cost: 2, resumo: 'Briga suja: golpes baixos, truques e saídas rápidas, com o que estiver à mão.',
    passivas: [
      ['Golpe baixo', '+2 de dano fixo contra alvos Caídos, Agarrados, Atordoados ou flanqueados (com dois inimigos adjacentes, em lados opostos).'],
      ['Arma improvisada', 'Qualquer objeto à mão conta como uma arma corpo a corpo da qual você é proficiente, com dano contundente ou cortante (o que fizer mais sentido para o objeto).'],
      ['Escorregadio', 'Se você se moveu nesta rodada, tem +1 na defesa contra ataques corpo a corpo.']
    ],
    tecnicas: [
      ['Finta', '1', 'Enganação contra Sentidos do alvo; se vencer, seus próximos golpes nele, nesta rodada, têm +2 no ataque.'],
      ['Contra-ataque', '1 (guardado)', 'Guarde um ataque: quando um inimigo errar um ataque corpo a corpo em você (não passar da sua Defesa), golpeie-o como reação.'],
      ['Areia nos olhos', '2', 'Enganação contra Reflexos do alvo; se vencer, ele fica Cego até o fim do próximo turno dele.'],
      ['Rasteira', '1', 'Se o golpe acertar, o alvo fica Caído (Corpo + Luta contra a Resistência ou os Reflexos dele, o melhor).'],
      ['Saída suja', '1 por 3 m', 'Você se afasta 3 m por ataque gasto sem provocar o ataque de oportunidade de quem está adjacente.']
    ] }
];
/* Tecnomancia: o poder principal dos tecnomantes. Cada nível compra um modo de ação e uma lista de componentes.
   Toda operação é uma base (ataque, ação efetiva ou item) + implementos (padrão ou especiais, vindos das listas).
   Um tipo de tecnomante por jogador: Engenheiro (listas), Patrocinado (catálogos de uma companhia) e Insano (dispositivos de qualquer lista). */
const TECNO_ACOES = [
  ['Instantâneo', 'Ação', 'Gera um efeito explosivo na hora. A duração em campo ou no alvo é a do efeito.'],
  ['Passivo', 'Nenhuma', 'Fica ativo sem gastar ação. Paga a sustentação (o PE da operação) uma vez por cena, então dura até uma cena. Só serve para efeitos que aprimoram ou energizam o alvo: nunca ataque, condição negativa ou habilidade que precise ser ativada ou gaste ação.'],
  ['Concentrado', 'Ação, toda rodada', 'Gera o efeito uma vez por rodada pagando metade do custo (arredondada para cima), ou sustenta um efeito passivo pela metade do custo. Dura até você encerrar, cair inconsciente ou sofrer um efeito que tome a sua ação completa (movimento + padrão).'],
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
  ['Ataque', 'Grátis', 'Ataque de toque, sem multiplicador de dano. Teste: 2d6 + atributo chave + Operações contra a Defesa do alvo. Dano = ataque – Defesa, do tipo Energia.'],
  ['Ação efetiva', 'Grátis', 'Causa um efeito em algo ou alguém. Se o alvo resistir, a CD é 6 + atributo chave.'],
  ['Item', 'Raridade + custo do item', 'Usa um item conhecido como base: paga o PE da raridade + qualquer custo original do item. Próteses e módulos não têm raridade: custam +1 PE por CC do tipo (Suporte 1, Operacional 2, Mecânico 3).']
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
  ['Tipo de dano', '+1 PE', 'Troca o dano de Energia por um tipo que você tenha de uma fonte conhecida.']
];
const TECNO_TIPOS = [
  { name: 'Engenheiro', cost: 0, resumo: 'Monta a tecnomancia a partir de listas de componentes, uma por nível de Tecnomancia.',
    passivas: [
      ['Atributo chave (característica do Engenheiro)', 'A primeira escolha do Engenheiro: Precisão ou Essência. Esse é o atributo chave, e vale para toda a sua Tecnomancia (todas as listas e níveis): entra nos testes das operações e define quantos implementos cabem nelas.'],
      ['Listas', 'A cada nível de Tecnomancia (cada compra do poder), escolha uma lista de componentes (Poderes, Equipamento, Propriedades, Mods, Próteses e módulos).'],
      ['Componentes conhecidos', 'Em cada lista, você conhece um número de componentes igual a atributo chave + Operações. Eles servem de base Item ou de implementos especiais.'],
      ['Retroativo', 'O número de conhecidos de cada lista usa os valores atuais: quando o atributo chave ou Operações sobem, ele sobe junto em todos os níveis já comprados, e você escolhe os componentes novos.'],
      ['Repetir uma lista', 'Escolher de novo uma lista que já tem dá mais atributo chave + Operações componentes conhecidos dela.'],
      ['Limite de implementos', 'Numa operação, o número de implementos é no máximo o seu atributo chave.'],
      ['Consertar Escudo (exclusivo do Engenheiro)', 'Uma ação efetiva pode recarregar o Escudo de um alvo, seguindo a regra de Cura: teste de atributo chave + Operações contra a CD; o alvo recupera a diferença.']
    ] },
  { name: 'Patrocinado', cost: 0, resumo: 'Uma companhia patrocina você: a cada nível de Tecnomancia, recebe um catálogo inteiro dela.',
    passivas: [
      ['Companhia', 'Escolha uma companhia que patrocina você (por exemplo, Wathrever, Tnnaks, Live Service ou Pinger). Ela vale para todos os níveis.'],
      ['Catálogos', 'A cada nível de Tecnomancia, escolha um catálogo da companhia, como todas as armas dela ou todas as armaduras dela, e conheça todos os componentes desse catálogo. Cada nível dá um catálogo diferente.'],
      ['Categorias universais', 'Propriedades, acessórios e mods não têm patrocinador, porque o valor deles é mecânico. Para eles, o catálogo é um tipo de arma: todos os de armas corpo a corpo ou todos os de armas de fogo.']
    ] },
  { name: 'Insano', cost: 0, resumo: 'Conhece dispositivos de qualquer lista: a cada nível, Essência ou Operações componentes, o que for maior.',
    passivas: [
      ['Dispositivos', 'A cada nível de Tecnomancia, escolha dispositivos de qualquer lista (Poderes, Equipamento, Propriedades, Mods, Próteses e módulos): você conhece um número de componentes igual à sua Essência ou às suas Operações, o que for maior.'],
      ['Retroativo', 'O número usa os valores atuais: quando a Essência ou Operações sobem, ele sobe junto em todos os níveis já comprados, e você escolhe os componentes novos.']
    ] },
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
        ['p', 'Quando uma regra cita só a perícia ("Luta contra Reflexos"), cada lado soma também o atributo dela.'],

        ['h2', 'Classe de Dificuldade (CD)'],
        ['p', 'Contra uma dificuldade fixa, você passa se o total for **igual ou maior** que a CD. Com duas falhas críticas, o teste falha mesmo que o total alcance a CD.'],
        ['table', ['CD', 'Dificuldade'], [['6', 'Fácil'], ['9', 'Normal'], ['12', 'Difícil'], ['15', 'Muito difícil'], ['18', 'Quase impossível']]],
        ['p', 'Quando o efeito é seu e o alvo resiste com um teste (Tecnomancia, armas com efeito no crítico), a própria regra diz a CD. Na cura, a CD tem regra própria (veja [Cura](cura#Classe de Dificuldade (CD))).'],

        ['h2', 'Testes resistidos'],
        ['p', 'Quando duas pessoas disputam (uma manobra, esconder-se contra perceber, agarrar contra soltar-se), as duas rolam e vence o maior total. **No empate, vence quem resiste** (o alvo da ação). Quem tira duas falhas críticas perde a disputa.'],

        ['h2', 'Críticos'],
        ['p', 'Cada dado que mostrar 6 é um **crítico**: o teste soma de novo o valor do atributo usado. Cada dado que mostrar 1 é uma **falha crítica**: ela anula os modificadores que vêm da perícia. Com duas falhas críticas, o teste falha completamente, seja qual for o total.'],
        ['p', 'Você só se beneficia de no máximo 1 crítico por teste, e cada falha crítica (1) anula um crítico (6). O crítico nunca tira pontos: com atributo zero ou negativo, ele não soma nada.'],

        ['h2', 'Ganho'],
        ['p', 'Um **ganho** aumenta a quantidade de dados rolados naquele teste. O terceiro dado vem de fontes de alto valor, e o quarto é concedido pelo mestre ou pelo sistema. O limite é de 4d6 em um teste.'],
        ['p', 'Na defesa, se houve um ganho durante o combate, some o resultado do ganho à sua defesa atual.'],

        ['h2', 'Perda'],
        ['p', 'A **perda** é o contrário do ganho: você rola um dado a menos (no mínimo 1). Ganho e perda no mesmo teste se anulam um a um.'],

        ['h2', 'Vantagem'],
        ['p', 'Com **vantagem** você rola um dado a mais e descarta o menor: o teste soma só os dados que ficaram (os dois maiores, ou os três maiores com um ganho). Críticos e falhas críticas só contam nos dados que ficaram.'],

        ['h2', 'Desvantagem'],
        ['p', 'Com **desvantagem** você também rola um dado a mais, mas descarta o maior.'],
        ['p', 'Vantagem e desvantagem não se acumulam: várias fontes de vantagem dão uma só, e uma vantagem anula uma desvantagem.'],

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
        ['p', 'Você começa com 3 pontos para distribuir entre os atributos. Se quiser, pode reduzir um atributo para –1 e ganhar +1 ponto extra. Nenhum atributo pode começar acima de +3. Durante o jogo, os pontos de um atributo (os iniciais e os de UP) não passam de +6; só bônus de itens e poderes passam disso.'],

        ['h2', 'Recursos'],
        ['h3', 'Pontos de Vida (PV)'],
        ['formula', 'PV', '5 + (Corpo × 5), nunca menos que 5'],
        ['example', 'Com Corpo 2, você tem 5 + 10 = 15 PV.'],

        ['h3', 'Pontos de Essência (PE)'],
        ['formula', 'PE', '5 + (Essência × 5), nunca menos que 5'],
        ['p', 'Os PE representam esforço físico, tecnomancia e as habilidades que exigem energia interior.'],

        ['h3', 'Pontos de Ação (PA)'],
        ['formula', 'PA', 'igual à Precisão (mínimo 1)'],
        ['example', 'Precisão 3 equivale a 3 PA.'],
        ['p', 'Os PA representam um surto de criatividade inteligente (ou não) capaz de mudar a dinâmica das suas interações. Gaste 1 PA para rolar de novo um teste que você acabou de fazer e ficar com o novo resultado (uma vez por teste), ou num efeito que peça PA (como o Simbionte e a Transformação).'],

        ['h3', 'Escudo e Blindagem'],
        ['p', 'Começam em 0 e vêm de equipamentos (escudos energéticos, armaduras), do espécime (no Robô e no Android, a vida é a Blindagem) ou de poderes. O dano passa primeiro pelo Escudo, depois pela Blindagem e só então pelos PV (veja [Ataque e Defesa](ataque-e-defesa#Tipos de Resistência)).'],

        ['h2', 'Recuperação'],
        ['p', 'Você recupera seus recursos depois de um descanso adequado, e a qualidade do descanso define quanto volta.'],
        ['dl', [
          ['Péssimo estado (menos de 1 hora, ou sem condições de descansar)', 'Você recupera de cada recurso uma quantidade igual ao atributo atrelado a ele (PV: Corpo; PE: Essência; PA: Precisão; no mínimo 1).'],
          ['Descanso curto (de 1 hora até menos de 8)', 'Recupera metade de PV, PE, PA e Escudo. A quantidade cai à metade a cada descanso curto seguinte, e volta ao normal depois de um descanso longo. Quem está agonizando não se levanta com o descanso curto: precisa ser reanimado.'],
          ['Descanso longo (8 horas ou mais)', 'Recupera tudo. Quem estava agonizando e estabilizado acorda.']
        ]],
        ['p', 'A Blindagem não volta com o descanso: só com conserto (veja [Cura](cura#Blindagem (BL))). Robôs e outros seres não vivos também não recuperam a vida descansando.'],

        ['h2', 'Outros'],
        ['h3', 'Armadura básica'],
        ['p', 'A armadura básica de todos os seres é 6: é a Armadura de quem está sem armadura, ou com uma de valor menor (veja [Armaduras](armaduras#Outros)).'],
        ['h3', 'Movimento'],
        ['p', 'O movimento padrão dos seres vivos, sem alterações por habilidades, poderes ou Perdas, é de 9 m em terra (30 ft).'],
        ['h3', 'Tamanho'],
        ['p', 'Do menor para o maior: Minúsculo, Pequeno, Médio (humanos, robôs e androides comuns), Grande, Enorme e Colossal. Algumas manobras mudam com a diferença de tamanho (veja [Ações](acoes#Manobras)).']
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
        ['p', 'Os benefícios abaixo contam só os **UP ganhos por XP**: os UP iniciais do espécime e os das Perdas não contam.'],
        ['p', 'Sempre que o personagem alcançar um número par de UP ganhos por XP, poderá escolher dois dos seguintes benefícios:'],
        ['ul', ['+5 PV;', '+5 PE;', '+1 PA.']],
        ['p', 'Sempre que alcançar um número ímpar de UP ganhos por XP, recebe +1 ponto em uma perícia à sua escolha.'],
        ['p', 'Uma vez em cada bloco de 4 UP (UP 1 a 4, 5 a 8 e assim por diante), em vez de receber esse +1 ponto em uma perícia, pode trocá-lo por uma **proficiência** à sua escolha. Só esse ponto ganho pelo UP pode ser trocado: os pontos iniciais, os de UP investido em perícias e os de poderes não.'],
        ['p', 'Além disso, em cada bloco de 4 UP, recebe +1 em um atributo à sua escolha. Os dois valem desde o começo do bloco: o do primeiro bloco já pode ser usado no UP 1 ou no 3, sem esperar o UP 4.'],
        ['note', 'Na ficha', 'A troca do ponto por proficiência fica em Perícias → Proficiências (no roteiro da build, na folha do UP ímpar), e o +1 de atributo é escolhido na aba Progressão.']
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
        ['p', 'A proficiência é o domínio de um tipo de equipamento (um tipo de arma ou uma categoria de armadura) e melhora o uso dele.'],
        ['dl', [
          ['Em armas', 'Dá a [cadência perita](cadencia#Com proficiência (Cadência perita)) e os traços do tipo da arma: nas corpo a corpo, todos (veja [Armas](armas#Tipo)); nas de fogo, os que o card marca com “se for proficiente”.'],
          ['Em armaduras', 'Você usa a penalidade da tabela da armadura (sem proficiência, ela dobra) e ganha +1 de Armadura com ela.']
        ]],
        ['p', 'Você escolhe 4 tipos de armas ou armaduras nos quais é proficiente desde o início.'],

        ['h2', 'Compras com UP'],
        ['p', 'Comprar qualquer um destes poderes custa 1 UP e também dá +1 em uma perícia à sua escolha. Cada um pode ser comprado mais de uma vez, escolhendo outra perícia ou outro tipo.'],
        ['dl', [
          ['Doutor (1 UP cada)', 'O limite da perícia escolhida passa a ser +4.'],
          ['Proficiência em arma (1 UP cada)', 'Você fica proficiente com um tipo de arma e usa a cadência perita com ele.'],
          ['Proficiência em armadura (1 UP cada)', 'Você fica proficiente com um tipo de armadura: ganha +1 de Armadura com ela e não sofre a penalidade dobrada.']
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
        ['p', 'Os únicos espaços fixos são a **armadura**, o **núcleo** e as **duas mãos** (empunhadura). Não há espaço por parte do corpo: dá para vestir três camisas uma por cima da outra.'],
        ['ul', [
          '**Vestíveis** (roupas, mochilas, escudos energéticos...): você se beneficia de até **3 + Corpo** deles.',
          '**Mochilas**: há três, sem raridade, e nenhuma ocupa carga. Cada uma funciona como "a cada X da sua Carga (contada antes da mochila), você ganha +Y de carga": **Pequena**, a cada 6, +1; **Média**, a cada 4, +1 (requer Corpo 2); **Grande**, a cada 3, +1 (requer Corpo 3). Só a maior mochila vestida conta; sem o Corpo pedido, ela não dá benefício.',
          '**Próteses**: limitadas pela sua Carga Cibernética (CC).',
          '**Módulos**: só abrem espaço com ao menos uma prótese implantada; limitados pela CC, com a reserva da Essência.'
        ]],
        ['note', 'Bônus de mesma fonte', '**Qualquer bônus de mesma fonte não acumula** (regra geral, em Testes e Dados). Dois itens iguais equipados (duas camisas iguais, dois escudos do mesmo modelo) valem como um só.'],

        ['h2', 'Sobrecarga'],
        ['p', 'Quando a Carga transportada passa do limite do personagem, ele fica **Sobrecarregado**: o deslocamento cai à metade e cada ação física sobe um degrau na [escada de ações](combate#Turno): livre vira bônus, bônus vira movimento, movimento vira padrão e padrão vira completa.'],
        ['p', 'A penalidade dura enquanto o personagem estiver acima do limite de Carga.']
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'combate', title: 'Combate', group: 'Combate',
      blocks: [
        ['h2', 'Iniciativa'],
        ['formula', 'Iniciativa', '2d6 + Precisão + Iniciativa'],
        ['p', 'Ao entrar em um combate, todos os envolvidos fazem um teste de Precisão + Iniciativa. O resultado define a ordem dos turnos, do maior para o menor: começa por quem tirou a maior rolagem e termina em quem tirou a menor. A ordem se mantém pelo restante do combate. Em empate, age antes quem tem mais Precisão; se continuar empatado, decide a sorte. Quem chega no meio do combate rola ao entrar e entra na ordem pelo resultado.'],
        ['p', 'Junto com a iniciativa também é rolada a Defesa da cena (veja [Ataque e Defesa](ataque-e-defesa#Defesa)). A iniciativa é rolada no início de qualquer combate ou cena que precise de uma ordem.'],

        ['h2', 'Cena'],
        ['p', 'A cena é a marcação de tempo de um evento inteiro. Em combate, uma cena é feita de rodadas.'],

        ['h2', 'Rodadas'],
        ['p', 'Uma rodada é a passagem de todos os participantes pela ordem da iniciativa, do primeiro ao último, e cada um tem o seu turno dentro dela. A rodada é um marco de tempo importante para habilidades, poderes e ações.'],

        ['h2', 'Turno'],
        ['p', 'A ordem dos turnos é definida pela iniciativa. Em cada turno você tem **1 ação padrão, 1 de movimento e 1 bônus**, mais ações livres e reações:'],
        ['dl', [
          ['Ação padrão', 'A ação principal: atacar, fazer uma manobra, usar efeitos utilitários e afins.'],
          ['Ação de movimento', 'Em geral, serve para se deslocar, mas efeitos e habilidades também podem usá-la. Você pode trocar a ação padrão por mais uma ação de movimento.'],
          ['Ação completa', 'A ação padrão e a de movimento juntas, gastas numa coisa só (como avançar ou curar).'],
          ['Ação bônus', 'Uma ação menor, para usar recursos rápidos e acionar mecanismos ou habilidades.'],
          ['Ação livre', 'Algo feito espontaneamente ou junto com as outras ações. Não há limite de ações livres por turno.'],
          ['Reação', 'Uma resposta à ação de outra pessoa. Não há limite de reações por rodada, mas cada uma responde a um gatilho só.']
        ]],
        ['p', '**Escada de ações.** Livre → Bônus → Movimento → Padrão → Completa. Quando uma regra manda uma ação subir uma categoria (Sobrecarga, Akimbo), ela passa para o degrau seguinte.'],
        ['p', '**Ataque de oportunidade.** Sair do alcance corpo a corpo de um inimigo, sem ser empurrado, deixa ele usar a reação para um ataque corpo a corpo contra você (uma vez por rodada para cada inimigo).']
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
        ['p', 'Funciona como um ataque, mas em vez de causar dano você tenta impor uma condição ou um estado ao alvo: agarrar, empurrar, derrubar, desarmar, quebrar a guarda, finalizar ou afetar (estes dois últimos são ataques, com dano). O teste de manobra é **2d6 + Corpo + Luta**. Cada manobra está em [Ações](acoes#Manobras); as condições que elas causam, em [Condições e Estados](condicoes-e-estados).'],

        ['h2', 'Defesa'],
        ['p', 'Quando você é alvo de um ataque, sua Defesa reduz esse ataque. Ela é definida no início de cada combate, junto da iniciativa, com um teste de defesa, e vale até o fim do combate:'],
        ['formula', 'Defesa', '2d6 + Corpo + Resistência'],
        ['p', 'Se o teste ficar abaixo da Defesa mínima (ou falhar com duas falhas críticas), vale a mínima. Fora de combate, quando uma regra pede a Defesa (uma queda, por exemplo), use a mínima.'],
        ['h3', 'Defesa mínima'],
        ['formula', 'Defesa mínima', 'Armadura + Corpo + Resistência'],
        ['p', 'A Armadura é a da armadura vestida, quando for maior que a [básica](atributos-e-recursos#Armadura básica) (6). Um bônus ou uma penalidade de Armadura que comece no meio do combate muda a Defesa atual no mesmo valor, enquanto durar, e a Defesa nunca fica abaixo da mínima.'],

        ['h2', 'Danos'],
        ['formula', 'Dano', '(Ataque – Defesa do alvo) × disparos'],
        ['p', 'O ataque **acerta** quando o total passa da Defesa do alvo. Se ficar igual ou abaixo, é um **raspão**: o ataque erra, causa só o dano mínimo (1 por disparo) e não aplica efeitos de acerto (os que dizem “se acertar”). Quando uma regra diz que o ataque erra automaticamente (Acuidade, Ofuscado, Cego), ele não causa nem o dano mínimo.'],
        ['p', 'O dano atinge a sua Resistência: as camadas de Escudo, Blindagem e PV, descritas abaixo.'],
        ['p', '**Dano fixo e dano de efeito.** Fora do cálculo acima, só o dano fixo e o dano de efeito (como o Sangramento ou o dano adicional de alguns itens) podem rolar um dado de dano ou somar dano que passa pela Defesa do alvo. Eles entram uma vez por alvo, depois do multiplicador da cadência.'],

        ['h2', 'Tipo de dano'],
        ['p', 'Cada tipo de dano interage de um jeito com alvos que tenham fraquezas ou resistências a ele.'],
        ['dl', [
          ['Físicos', ['Cortante', 'Contundente', 'Perfurante', 'Balístico']],
          ['Elementos', ['Fogo', 'Ácido/químico', 'Elétrico']],
          ['Especiais', ['Explosivo', 'Radioativo', 'Necrótico', 'Energia', 'Impacto']]
        ]],
        ['p', 'Energia (lasers, Tecnomancia) e Impacto não têm fraqueza nem resistência em nenhum tipo de Resistência.'],

        ['h2', 'Fraquezas e Eficiência de Dano'],
        ['p', 'Um ataque é **eficiente** quando a camada atingida é fraca ao tipo de dano dele: o dano nessa camada é **dobrado** depois do cálculo normal. Algumas armas são eficientes contra uma camada por natureza (a Marreta contra Blindagem, o Machado contra Escudo).'],
        ['p', 'Um ataque é **resistido** quando a camada atingida resiste ao tipo dele: o dano nessa camada cai à **metade** (arredondado para baixo, mínimo 1).'],

        ['h2', 'Tipos de Resistência'],
        ['p', '**Resistência** é o nome da barra de vida inteira: a soma das camadas de Escudo, Blindagem e PV que a pessoa tiver.'],
        ['card', 'Pontos de Vida (PV)', [
          ['p', 'Carne, sangue e tecido vivo.'],
          ['kv', '', [['Fraquezas', 'Radioativo, Cortante (dano dobrado).'], ['Resiste a', 'Nada.']]],
          ['p', 'Os PV podem ser recuperados por qualquer fonte médica ou efeito que afete Pontos de Vida.']
        ], 3],
        ['card', 'Escudo (E)', [
          ['p', 'Um campo de proteção energética.'],
          ['kv', '', [['Fraquezas', 'Elétrico, Contundente (dano dobrado).'], ['Resiste a', 'Cortante, Perfurante (dano pela metade).']]],
          ['p', 'O Escudo pode ser restaurado por qualquer fonte de energia compatível e volta no descanso.']
        ], 3],
        ['card', 'Blindagem (BL)', [
          ['p', 'Superfícies rígidas e reforçadas.'],
          ['kv', '', [['Fraquezas', 'Ácido/químico, Explosivo (dano dobrado).'], ['Resiste a', 'Fogo, Cortante, Balístico (dano pela metade).']]],
          ['p', 'A Blindagem não se regenera sozinha nem com descanso: volta com conserto (veja [Cura](cura#Blindagem (BL))), com efeitos que digam isso ou com a troca da peça.']
        ], 3],

        ['h2', 'Observações'],
        ['ul', [
          'Se um ataque causar **mais de um tipo de dano**, os efeitos de fraqueza ou resistência **não se acumulam**.',
          'A redução de dano por dois tipos resistidos também **não acumula**, e a fraqueza vence a resistência: se um dos tipos for eficiente contra a camada, o dano dobra.',
          'Caso o alvo possua duas ou mais camadas de Resistência, o dano é aplicado sempre na ordem: **Escudo → Blindagem → PV.**',
          'Se o dano exceder uma camada, o valor restante passa a ser afetado pelas fraquezas e resistências da próxima camada atingida.',
          'O bônus de **dano dobrado por fraqueza** não conta para o cálculo do dano excedente à camada afetada (a menos que a próxima camada também seja fraca ao dano recebido).'
        ]]
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'morte-e-agonia', title: 'Morte e Agonia', group: 'Combate',
      blocks: [
        ['p', 'Se o seu personagem chegar a 0 PV, ele cai **agonizando**: fica inconsciente e Caído, sem ações, e continua sofrendo dano normalmente. Ainda não é o fim: ele só morre quando chega ao valor negativo do seu PV máximo.'],
        ['example', 'Um personagem com PV máximo 20 morre ao chegar a –20.'],
        ['p', 'Quem não tem PV (o Robô, que vive da Blindagem, ou um ser só de Escudo e Blindagem) não agoniza: quando todas as camadas da Resistência zeram, ele fica **fora de combate**, sem ações, até ser consertado (veja [Cura](cura#Blindagem (BL))) ou reanimado.'],

        ['h2', 'Teste de Sobrevivência'],
        ['p', 'Enquanto estiver com 0 PV ou menos, o personagem faz, na vez dele, um teste de Fortitude contra CD 6, que aumenta em +1 a cada nova tentativa no mesmo dia.'],
        ['dl', [
          ['Se falhar', 'Recebe 1 de dano direto no PV, que o leva mais para o negativo. Esse dano aumenta em +1 a cada nova falha no mesmo dia.'],
          ['Se passar', 'Estabiliza: para de testar, mas continua inconsciente até ser reanimado ou até um descanso longo. Se sofrer dano de novo, volta a fazer o teste.']
        ]],

        ['h2', 'Reanimar'],
        ['p', 'Reanimar alguém caído (agonizando ou fora de combate) custa uma **ação padrão**: faça um teste de Ofício (Medicina) contra CD 6, que aumenta em +1 a cada nova tentativa na mesma cena. Para tentar, você precisa de Precisão 3 ou +1 em Ofício (Medicina) e de um Kit Médico, que gasta um uso se for consumível. Se passar, o alvo volta com 1 PV.'],
        ['p', 'Se o caído for um Robô ou outro ser não vivo, troque o Ofício (Medicina) por Tecnologia (com Precisão 3 ou +1 em Tecnologia) e o Kit Médico por um Kit Técnico. Se passar, ele volta com 1 de Blindagem (ou 1 na camada que for a vida dele).'],
        ['p', 'Quem estabilizou também acorda com um descanso longo (veja [Recuperação](atributos-e-recursos#Recuperação)). Quem morreu não volta com reanimação.']
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'cura', title: 'Cura', group: 'Combate',
      blocks: [
        ['p', 'Recuperar **Pontos de Vida (PV)**, **Escudo (E)** e **Blindagem (BL)** usa um método específico para cada recurso, mas todos seguem a mesma regra geral: com o item certo, você faz um **teste da perícia indicada** contra a **CD do alvo**. Curar custa uma **ação completa** (veja [Ações](acoes#Normais)).'],

        ['h2', 'Classe de Dificuldade (CD)'],
        ['p', 'A cura não usa a tabela geral de CD (veja [Testes e Dados](testes-e-dados#Classe de Dificuldade (CD))): a CD depende de quanto falta do recurso. Se ele estiver com **menos da metade** do máximo, a **CD é 10**; caso contrário, a **CD é 6**.'],
        ['p', 'Cada **condição negativa** que afeta o alvo aumenta a CD em **+2** (veja [Condições](condicoes-e-estados#Condições)); estados como Caído ou uma cobertura não contam. Contam também as condições vinculadas (as que vêm antes dela), e a cura sempre acontece antes de qualquer efeito que anule condições.'],

        ['h2', 'Recuperação'],
        ['p', 'O alvo recupera do recurso a **diferença entre o resultado do teste e a CD**. Um resultado igual ou menor que a CD (ou duas falhas críticas) não recupera nada pelo teste. Os bônus de itens e efeitos se somam a isso (veja Bônus, abaixo).'],
        ['example', 'Contra CD 10, um teste 13 recupera 3 PV. Com um item de +2 PV, recupera 5; se o teste tivesse dado 9, recuperaria só os 2 do item.'],

        ['h2', 'Pré-requisitos'],
        ['p', 'O Ofício conta com a especialidade certa (Medicina para PV, Engenharia para Blindagem) ou quando nenhuma especialidade foi escrita; com outra especialidade, o teste usa só o atributo.'],
        ['h3', 'Pontos de Vida (PV)'],
        ['p', 'É necessário um **Kit Médico** (ou outro item médico).'],
        ['formula', 'Teste', '2d6 + Precisão + Ofício (Medicina)'],
        ['h3', 'Escudo (E)'],
        ['p', 'É necessário um **Carregador de Energia**, como o Carregador de Campo LS-3.'],
        ['formula', 'Teste', '2d6 + Essência + Operações'],
        ['h3', 'Blindagem (BL)'],
        ['p', 'É necessário um **Kit Técnico** ou **Componentes Mecânicos**. Vale o melhor dos dois testes.'],
        ['formula', 'Teste', '2d6 + Precisão + Ofício (Engenharia) ou Tecnologia'],

        ['h2', 'Itens de recuperação (Live Service)'],
        ['h3', 'Tipos'],
        ['dl', [
          ['Ferramenta', 'Não é consumida pelo uso.'],
          ['Consumível', 'Gasta um uso a cada cura ou reanimação e acaba quando os usos terminam.'],
          ['Estação', 'Instalar ou retirar custa uma ação completa. Montada, ela soma o bônus dela nos testes de cura do recurso que indica (vale a maior estação), mas só para quem tem ao menos +1 na perícia do teste.']
        ]],
        ['h3', 'Bônus'],
        ['p', 'O bônus de recuperação de um item (por exemplo, +5 PV) se soma ao que o teste recuperou, e essa parte entra mesmo quando o teste não recupera nada.'],
        ['p', '**Usar sem teste.** Um consumível com bônus de recuperação também pode ser usado direto, com a ação padrão (Usar): o alvo recebe só o bônus do item, sem teste nem CD.']
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
          ['Arremessar', 'Arremessar um objeto é um ataque à distância (ação padrão, 2d6 + Precisão + Mira) com alcance de 9 m. Granadas também são arremessadas assim, com o dano da regra delas (veja [Granadas](armas#Granadas)).'],
          ['Deslocamento', 'Usar o seu deslocamento custa uma ação de movimento.'],
          ['Curar', 'Além do item, curar consome uma ação completa (veja [Cura](cura)).'],
          ['Reanimar', 'Trazer de volta alguém caído custa uma ação padrão (veja [Reanimar](morte-e-agonia#Reanimar)).']
        ]],

        ['h3', 'Táticas'],
        ['dl', [
          ['Percepções', 'Analisar, procurar ou investigar custa uma ação de movimento.'],
          ['Esconder-se', 'Você precisa de algo que engane os sentidos, como fumaça, escuridão, silêncio ou camuflagem. Em combate, esconder-se é uma ação padrão com um teste de furtividade (2d6 + Precisão + Manha, com a penalidade de armadura). Você fica [Escondido](condicoes-e-estados#Específicos), e o resultado vira a dificuldade para quem tentar achar você.'],
          ['Mirar', 'Ação de movimento: você engaja a mira, e ela vale até o início do seu próximo turno.'],
          ['Apoiar equipamento', 'Apoiar a arma numa [cobertura](condicoes-e-estados#Benéficos) para atirar pelo campo de visão não coberto: ação completa. Sair de uma cobertura é uma ação livre.'],
          ['Avançar', 'Você usa sua ação completa para se deslocar em linha reta o dobro do seu deslocamento. Ao final, pode fazer um ataque corpo a corpo como parte da ação; esse ataque não ativa habilidades. Se houver no caminho uma criatura de tamanho igual ou menor que o seu, você a atropela.'],
          ['Atropelar', 'Durante um Avançar, faça um teste de manobra contra a Resistência ou os Reflexos de quem está no seu caminho. Se você vencer, o alvo é empurrado para fora do caminho, na direção que você escolher, 1,5 m mais 1,5 m a cada 3 pontos que o seu teste superar o dele, e fica Caído. Se o alvo vencer usando Resistência, você perde o restante da ação e do movimento. Se vencer usando Reflexos, você continua o movimento normalmente e ele não sofre os efeitos da manobra.']
        ]],

        ['h3', 'Manobras'],
        ['p', 'Uma manobra costuma custar a ação padrão e só pode ser feita contra um alvo adjacente a você no momento da ação. O teste de manobra é **2d6 + Corpo + Luta**, contra o teste que cada manobra indicar.'],
        ['dl', [
          ['Agarrar', 'Teste de manobra contra o teste que o alvo escolher: Corpo + Luta ou Precisão + Reflexos. Se você vencer, o alvo fica [Agarrado](condicoes-e-estados#Passageiras) por você. O teste de quem é agarrado ganha +2 para cada categoria de [tamanho](atributos-e-recursos#Tamanho) de diferença entre ele e quem agarra.'],
          ['Empurrar', 'Teste de manobra contra a Resistência ou os Reflexos do alvo. Se o alvo perder, é empurrado na direção que você escolher: 1,5 m, mais 1,5 m a cada 3 pontos que o seu teste superar o dele. A distância dobra se o alvo for Pequeno ou menor.'],
          ['Derrubar', 'Teste de manobra contra a Resistência ou os Reflexos do alvo. Se você vencer, o alvo fica [Caído](condicoes-e-estados#Específicos).'],
          ['Quebrar a guarda', 'Teste de manobra contra a Resistência ou os Reflexos do alvo. Se você vencer, ele fica com a guarda aberta: –2 na Defesa até a próxima rodada.'],
          ['Desarmar', 'Você faz a manobra contra um objeto empunhado, e quem o empunha faz um teste de Resistência ou Reflexos contra o seu. Se você vencer, escolhe: jogar o item no chão, arremessá-lo (como em Arremessar, até 9 m) ou ficar com ele, se tiver uma mão livre. Pegar um item do chão custa uma ação de movimento.'],
          ['Finalizar', 'Só contra um alvo inconsciente, paralisado ou com 0 PV ou menos. Você faz um ataque normal, mas o dano é calculado apenas contra a Defesa mínima do alvo, com o valor cheio do seu ataque: os dados contam como o máximo, e você só os rola para ver se houve crítico.'],
          ['Afetar', 'Um ataque normal mirando uma parte do corpo do alvo: pernas, braços, peito ou cabeça. Se o ataque acertar e o teste tiver 2 críticos (6 nos dois dados), além do dano o alvo fica afetado naquela parte até receber qualquer cura: **pernas**, –3 m de deslocamento; **braços**, –2 nos ataques; **peito**, –2 na Defesa; **cabeça**, Atordoado. Seres abióticos (não vivos ou sem PV, como o Robô e o Android) são imunes a esse efeito.']
        ]],

        ['h3', 'Equipamento'],
        ['dl', [
          ['Saquear', 'Revistar um lugar ou um corpo custa uma ação completa.'],
          ['Vestir / Entrar na direção de veículos', 'Ação completa. Conduzir numa situação difícil pede um teste de Precisão + Pilotagem contra a CD que o mestre definir.'],
          ['Sacar ou guardar', ['Armas: ação de movimento (pistola e revólver: ação bônus).', 'Itens de empunhadura [Saque](empunhadura#Saque): uma vez por turno, sem gastar ações. Utilitários e consumíveis de Saque também saem como parte da ação de usá-los.', 'Pegar um item do chão: ação de movimento.']],
          ['Usar', ['Consumíveis e utilitários: ação padrão (o saque já está incluído).', 'Ferramentas: o custo da ação em que são usadas (curar com um Kit Médico é a ação completa de Curar).', 'Estações: instalar ou retirar custa uma ação completa; montada, a estação soma o bônus dela na cura (veja [Cura](cura#Tipos)).']]
        ]],

        ['h2', 'Salto, queda e fôlego'],
        ['h3', 'Salto'],
        ['p', 'Saltar faz parte do deslocamento: cada metro saltado gasta um metro de deslocamento.'],
        ['dl', [
          ['Salto em distância', 'Com ao menos 3 m de corrida antes, você salta até **2 + Corpo** metros (mínimo 1 m). Parado, salta a metade.'],
          ['Salto em altura', 'Com ao menos 3 m de corrida antes, você salta até **1 + metade do Corpo** metros (mínimo 0,5 m). Parado, salta a metade.'],
          ['Mais longe', 'Para passar desse limite, faça um teste de Atletismo: a cada 2 pontos acima de CD 6, +1 m.']
        ]],
        ['h3', 'Queda'],
        ['p', 'A queda é um ataque de impacto contra você: role **1d6 a cada 3 m** de queda, até o máximo de **20d6** (passa dos 4 dados de um ataque comum). O total vai contra a sua Defesa como qualquer ataque (fora de combate, a Defesa mínima), e você termina [Caído](condicoes-e-estados#Específicos).'],
        ['formula', 'Dano da queda', 'rolagem da queda – Defesa'],
        ['h3', 'Fôlego'],
        ['p', 'Você aguenta prender a respiração por **1 + Corpo** minutos (mínimo 30 segundos). Depois disso, começa a sufocar: aguenta mais **Corpo** rodadas (mínimo 1) e então cai com 0 PV, agonizando. Voltar a respirar encerra a sufocação.'],
        ['p', 'Esforço intenso (combate, correr, nadar) enquanto prende a respiração corta o tempo pela metade.']
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'penalidades', title: 'Alcance e Acuidade', group: 'Combate',
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
        ['p', 'Para disparar a partir da distância média (mesmo dentro da distância efetiva da arma), ou contra um alvo sob cobertura, você precisa antes passar num **teste de Acuidade**: 2d6 + Essência + Sentidos contra a CD da tabela. Se for proficiente com a arma e usar a ação de mirar, pode fazer o teste com Precisão + Mira. Mirando com uma mira ideal para a distância (veja [Miras](mods-e-acessorios#Miras)), você dispensa o teste. Se falhar, o disparo erra automaticamente.'],
        ['table', ['Distância', 'CD'], [
          ['Curto', 'só contra alvo sob cobertura: CD 6'],
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
        ['p', 'Toda arma tem um número máximo de disparos por ação: a sua **cadência**. Você escolhe quantos disparos fazer, até a cadência, e pode dividi-los entre vários alvos: um só teste de ataque vale para todos, com a penalidade do total de disparos, e o dano de cada alvo é multiplicado pelos disparos que ele recebeu.'],

        ['h2', 'Sem proficiência'],
        ['p', 'Um único disparo não sofre penalidade. Com dois ou mais, cada disparo soma o número dele à penalidade, contando desde o primeiro. O dano final é multiplicado pelo número de disparos contra cada alvo.'],
        ['example', 'Cadência 4 → o usuário dispara 3 vezes. Penalidade: –1 –2 –3 = –6 no ataque. Dano final ×3.'],

        ['h2', 'Com proficiência (Cadência perita)'],
        ['p', 'Um único disparo também não sofre penalidade, mas, com mais de um, a penalidade é igual à quantidade de disparos. O dano final é multiplicado da mesma forma.'],
        ['example', 'Cadência 4 → o usuário dispara 3 vezes. Penalidade –3 no ataque. Dano final ×3.'],

        ['h2', 'Resumo'],
        ['table', ['Disparos', 'Sem proficiência', 'Cadência perita', 'Dano'], [
          ['1', '0', '0', '×1'],
          ['2', '–3', '–2', '×2'],
          ['3', '–6', '–3', '×3'],
          ['4', '–10', '–4', '×4'],
          ['5', '–15', '–5', '×5'],
          ['6', '–21', '–6', '×6']
        ]],

        ['h2', 'Modos de tiro'],
        ['p', 'O **modo** da arma de fogo diz como a cadência pode ser usada. Uma arma com mais de um modo escolhe qual usar a cada ataque.'],
        ['card', 'Único', [
          ['p', 'O dispositivo atira **uma única vez** por ataque, sem penalidade de cadência.']
        ]],
        ['card', 'Automático', [
          ['p', 'Você atira livremente quantos disparos quiser, até a cadência, seguindo normalmente a regra de cadência.'],
          ['p', 'Você também pode **quebrar** a sequência de tiros para usar o restante dela em outro ataque. Para isso, precisa deixar sem usar, no mínimo, **¼ da cadência, arredondado para cima**.'],
          ['example', 'Cadência 6 → ¼ de 6 é 1,5, arredondado para 2. Para guardar disparos para outro ataque, o primeiro usa no máximo 4; os que sobraram ficam para o ataque seguinte, cada um com a sua penalidade.']
        ]],
        ['card', 'Semi', [
          ['p', 'Funciona como o automático, mas a cadência é dividida em **disparos e rajadas**, escrita como disparos/rajadas. Uma cadência **3/2** são 3 disparos, duas vezes; para todos os efeitos, multiplique os dois números para ter a cadência normal (3/2 = cadência 6).'],
          ['p', 'Por ataque, você dispara **exatamente uma rajada**, nem mais nem menos. Cada rajada conta com a **sua própria penalidade** de cadência.'],
          ['example', 'Cadência 3/2, com proficiência → cada ataque dispara 3 vezes com –3 e dano ×3; a segunda rajada, num outro ataque, tem de novo –3.']
        ]],
        ['p', 'Na arena, a ficha de ataque mostra o **Modo de tiro** quando a arma tem mais de um. No Semi, a rajada sai inteira e os disparos dela podem ser divididos entre os alvos; a rajada é anotada no campo Rajada da arma (Oficina), e sem ele a rajada é a cadência inteira.'],

        ['h2', 'Como a penalidade entra'],
        ['p', 'A penalidade vale inteira no ataque. Ela é descontada primeiro do bônus da perícia e, o que passar dele, do atributo; por isso o crítico, que soma o atributo de novo, soma só o que sobrou do atributo. A cadência é contada por rodada e por arma.'],
        ['p', 'O Laser é a exceção: a rajada sai inteira num alvo só, sem penalidade nem multiplicador (veja [Laser](armas#Laser)).']
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'condicoes-e-estados', title: 'Condições e Estados', group: 'Combate',
      blocks: [
        ['h2', 'Condições'],
        ['p', 'Condições são aplicadas diretamente ao personagem, como doenças, envenenamento e cegueira. Também podem ser benéficas: voraz, furioso (esse nem tanto), energizado, imune e assim por diante.'],
        ['p', 'Condições diferentes se acumulam entre si, mas a mesma condição aplicada de novo só renova a duração (o Atordoado e o Ferido têm regra própria). Uma condição pode anular a sua oposta; nesse caso, vale a última aplicada. Cada condição negativa no alvo aumenta a CD da [cura](cura#Classe de Dificuldade (CD)) em +2.'],
        ['h3', 'Instantâneas'],
        ['p', 'Pegam na hora e duram pouco: o efeito que as causou diz a duração; se não disser, vão até o fim do próximo turno do afetado.'],
        ['dl', [
          ['Zonzo', 'O afetado tem –2 na Defesa e, se tentar se mover, vai para uma direção aleatória decidida pelo mestre.'],
          ['Atordoado', 'Cada atordoamento consome a ação de movimento do próximo turno do afetado. Se essa ação já tiver sido consumida por outro atordoamento, ele perde o próximo turno inteiro e, até lá, sua defesa vira a defesa mínima. Quem é imune a efeitos mentais ignora esta condição.'],
          ['Ofuscado', 'Você rola um dado a menos (perda) nos testes de percepção que dependem da visão. Antes de cada ataque, role 1d4: à distância, com 1 ou 2 o ataque erra automaticamente; corpo a corpo, erra com 1.'],
          ['Cego', 'Você escolhe a direção do ataque e quem acha que é o alvo; depois rola 1d4: com 1 ou 2, o ataque erra automaticamente, seja qual for o resultado do ataque.'],
          ['Imóvel', 'Você não pode se mover por conta própria: seu deslocamento vira 0, e ataques contra você têm vantagem.']
        ]],
        ['h3', 'Passageiras'],
        ['p', 'Ficam até algo encerrá-las: a duração do efeito, um teste para se livrar ou uma cura, conforme a descrição.'],
        ['dl', [
          ['Envenenado', 'O afetado recebe o dado de dano químico do veneno (d“x”) no início do seu turno, pela quantidade de turnos indicada na descrição do veneno.'],
          ['Necrose', 'Como o Envenenado, mas o dano é necrótico. Se o afetado receber metade da sua vida máxima em dano necrótico, o efeito acaba, mas o membro que a necrose infectou é perdido. Seres e membros artificiais são imunes à necrose.'],
          ['Agarrado', 'Quem perde o teste contra uma tentativa de [Agarrar](acoes#Manobras) fica Agarrado. Você se move junto com quem o agarrou, e o deslocamento dos dois cai à metade. Para se soltar, use sua ação de movimento para repetir o teste; se vencer, fica livre. Enquanto estiver Agarrado, você só pode fazer ações desarmadas ou com itens de empunhadura Saque, e conta como Imóvel para todos os efeitos.'],
          ['Sangrando', 'O afetado perde PV no começo de cada turno dele, até receber qualquer cura: a quantidade que a fonte disser (1d6, se ela não disser).'],
          ['Ferido', '–1 no ataque e na Defesa por ferida, até o máximo de –3, até receber qualquer cura.'],
          ['Em chamas', 'Vem do efeito **Incendiar**. O afetado sofre o dano de fogo da fonte (1d6, se ela não disser) no começo de cada turno dele, até o fogo ser apagado (uma ação de movimento rolando no chão ou abafando, ou entrar na água). Quem é imune a fogo não sofre o dano.'],
          ['Inconsciente', 'O afetado não age, fica Caído e pode ser [finalizado](acoes#Manobras). Quem está agonizando também está inconsciente.'],
          ['Paralisado', 'O afetado não age nem se move, mas continua consciente, e pode ser finalizado.']
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
          ['Caído', 'No chão: –2 na Defesa até se levantar, o que custa uma ação de movimento.'],
          ['Guarda aberta', 'Depois de [Quebrar a guarda](acoes#Manobras): –2 na Defesa até a próxima rodada.'],
          ['No ar', 'Um alvo caindo sem meio de voo (ou voando, se nada disser o contrário) tem –3 em testes.'],
          ['Muito perto!', 'Atirar em um alvo adjacente com uma arma à distância dá –2 no ataque.'],
          ['Escondido', 'Quem passou no teste de [esconder-se](acoes#Táticas). O resultado do teste é a dificuldade para achar você (Sentidos) e a CD da [Acuidade](penalidades#Acuidade) contra você, se for maior. Atacar revela a sua posição.'],
          ['Flanqueado', 'Com dois inimigos adjacentes em lados opostos. Sozinho não muda os testes, mas ativa efeitos como o Golpe baixo do Renegado.'],
          ['PEM', 'Um pulso eletromagnético atordoa automaticamente os seres eletrônicos e desativa Escudos, pela duração do efeito. O Android, com a Humanidade, testa contra a CD do efeito; sem CD, não é afetado.']
        ]],

        ['h2', 'Categorias'],
        ['p', 'Algumas regras falam de tipos de efeito ou de ser:'],
        ['dl', [
          ['Efeitos mentais', 'O Atordoado e tudo o que mexe com a mente (medo, leitura de pensamentos). Quem é imune a efeitos mentais os ignora; o poder Mente de outro mundo dá ganho nos testes contra eles.'],
          ['Efeitos biológicos', 'Venenos, necrose, sangramento e doenças. Seres não vivos (como o Robô) não são afetados.'],
          ['Seres eletrônicos', 'Robô, Android, drones e outros seres de circuito: são afetados pelo PEM. Os que não têm PV, como o Robô e o Android, também são abióticos e imunes a Afetar.']
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
          ['Incomum', 'Tem uma propriedade.'],
          ['Rara', 'Tem mais armadura!'],
          ['Épica', 'Tem mais armadura e uma propriedade.'],
          ['Lendária', 'Tem muita armadura e uma **grande propriedade**: uma propriedade mais um efeito especial próprio da peça.']
        ]],

        ['h2', 'Nos outros itens'],
        ['p', 'Nos demais itens (granadas, escudos energéticos, kits, consumíveis), a raridade diz o preço e a disponibilidade: os mais raros custam mais, aparecem menos e costumam ter efeitos maiores.']
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
        ['p', 'Acessórios vêm embutidos nos mods. Fora disso, cada slot de mod comporta 3 acessórios, ao custo de 50 Cronos a cada 3. Em armas especiais, os acessórios já fazem parte das propriedades.'],
        ['p', 'Cada posição abaixo comporta um só acessório. Acessórios de mods diferentes não se acumulam, mas você escolhe quais dos 3 de cada mod quer usar.'],

        ['h3', 'Melee'],
        ['fields', ['Ponta', 'Dorso', 'Empunhadura', 'Cabo']],

        ['h3', 'Armas de fogo'],
        ['h4', 'Miras'],
        ['dl', [
          ['Red dot/Holográfica', 'Mirando, dispensa o teste de Acuidade a média distância, mesmo contra alvo em cobertura parcial.'],
          ['Ampliação', 'Mirando, dispensa o teste de Acuidade de média a longa distância, mesmo contra alvo em cobertura parcial.'],
          ['Telescópica', 'Mirando, dispensa o teste de Acuidade de longa a muito longa distância, mesmo contra alvo em meia cobertura.']
        ]],
        ['h4', 'Bocal'],
        ['dl', [
          ['Silenciador', 'Permite fazer um teste de furtividade (Precisão + Manha) nos disparos, contra os Sentidos de quem poderia ouvir.'],
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
          ['Telêmetro', 'Mostra em tempo real a distância até onde você está mirando (não muda o teste de Acuidade).'],
          ['Mira laser', 'Mirando, dispensa o teste de Acuidade a média distância, mesmo contra cobertura parcial, mas dá –1 em furtividade de curta a média distância.'],
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
        ['p', 'Até 20 disparos. Recarregar custa uma ação bônus (ou uma ação padrão, se você estiver debilitado: Agarrado ou com os braços afetados), e cada pente ocupa ¼ de carga.'],
        ['h2', 'Pente médio'],
        ['p', 'Até 40 disparos. Recarregar custa uma ação de movimento, e cada pente ocupa ½ de carga.'],
        ['h2', 'Pente pesado'],
        ['p', 'Até 150 disparos. Recarregar custa uma ação completa ou duas ações de movimento (uma nesta rodada e outra na próxima), e cada pente ocupa 1 de carga.'],
        ['h2', 'Recarga parcial'],
        ['p', 'Se a arma recarrega cartucho a cartucho, cada cartucho inserido é uma ação livre, até 2 por turno. Para inserir mais, use outras ações: até 5 com a ação bônus, ou até 10 com a ação de movimento ou a padrão. Cada 20 munições ocupam ¼ de carga.'],
        ['h2', 'Superaquecimento'],
        ['p', 'Algumas armas não têm limite definido de munição, porque a fonte é energética, mítica ou anormal, ou porque têm tantos disparos que o mecanismo esquenta demais (o pente **Sobrecarga**, que não tem nada a ver com a [Sobrecarga](carga#Sobrecarga) de peso).'],
        ['p', 'No lugar de um pente, a arma tem um limite de disparos seguidos: o valor de munição dela (sem esse valor, o dobro da cadência). A cadência continua limitando cada ataque. Se você passar do limite somando os disparos desta rodada e da anterior, a arma superaquece e entra em resfriamento até o fim do seu próximo turno; nesse tempo, você não pode atacar com ela.'],
        ['p', 'Cada carga (Cinta de sobrecarga ou Carga de energia) ocupa 1 de carga e funciona por até 2 cenas seguidas; depois, a arma precisa de uma carga nova. Recarregar custa a ação completa e também a ação bônus.']
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
        ['note', 'Catálogo', 'As armas do catálogo seguem a média de criação do tipo, mas um modelo pode fugir dela (um pente maior, outro alcance): vale o que está na ficha do item.'],
        ['note', 'Sem proficiência em arma corpo a corpo', 'Sem proficiência com o tipo da arma corpo a corpo, você não recebe as propriedades básicas da arma (como a Espada com Precisão, o crítico que sangra ou atordoa e ser efetiva contra escudo ou blindagem). Ela continua causando o dano normal.'],

        ['card', 'Espada', [
          ['p', 'O ataque com espada pode usar Precisão no lugar de Corpo. Num crítico que acerta, o alvo sangra: perde 1d6 PV na hora, a menos que passe num teste de Fortitude contra CD 6 + Precisão + Luta.'],
          ['kv', 'Média de criação', [['Carga', 'Máximo de 2.'], ['Dano', 'Cortante.']]]
        ]],
        ['card', 'Lança', [
          ['p', 'A lança alcança 1,5 m para cada carga que ocupa (mínimo 1,5 m): com carga 2, ataca alvos a até 3 m.'],
          ['kv', 'Média de criação', [['Carga', 'Máximo de 3.'], ['Dano', 'Perfurante.']]]
        ]],
        ['card', 'Marreta', [
          ['p', 'Num crítico que acerta, o alvo fica Atordoado, a menos que passe num teste de Fortitude contra CD 6 + Corpo + Luta. É eficiente contra Blindagem (dano dobrado nela).'],
          ['kv', 'Média de criação', [['Carga', 'Máximo de 3.'], ['Dano', 'Contundente.']]]
        ]],
        ['card', 'Machado', [
          ['p', 'Num crítico que acerta, o alvo sangra: perde 1d6 PV na hora, a menos que passe num teste de Fortitude contra CD 6 + Corpo + Luta. É eficiente contra Escudo (dano dobrado nele).'],
          ['kv', 'Média de criação', [['Carga', 'Máximo de 3.'], ['Dano', 'Contundente ou Cortante.']]]
        ]],
        ['card', 'Pistola', [
          ['p', 'Sacar e guardar a pistola custa uma ação bônus. Ela não sofre a penalidade por atirar em inimigos adjacentes e pode ser usada com a habilidade Akimbo.'],
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
            ['Precisão (Pesado)', 'Aceita um pente pesado de até 50 disparos como se fosse médio e, apoiado, dispensa o teste de Acuidade até a média distância.']
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
        ]],

        ['h2', 'Granadas'],
        ['p', 'Granadas são **consumíveis** de empunhadura **Saque**: sacar uma é grátis uma vez por turno, e cada uma é usada uma vez.'],
        ['p', 'Toda granada tem **alcance curto** de arremesso. Arremessar uma granada funciona como um **ataque normal** (ação padrão, 2d6 + Precisão + Mira), com um teste só contra a Defesa de cada um que está na área. Em vez de dados de dano, a granada tem um **multiplicador de dano fixo**:'],
        ['formula', 'Dano da granada', '(ataque – Defesa do alvo, mínimo 1) × multiplicador da granada'],
        ['example', 'Uma Acid Bloom (×2) com ataque 11 contra Defesa 8 causa (11 – 8) × 2 = 6 de dano. Contra Defesa 12, é um raspão: 1 × 2 = 2.'],
        ['p', 'Os efeitos da granada (Ofuscado, corrosão, fumaça...) valem para quem for atingido. Granadas sem multiplicador só têm o efeito.'],
        ['p', 'Uma [cobertura completa](condicoes-e-estados#Benéficos) protege da explosão se o ponto central dela não tiver uma linha reta até você.']
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
        ['p', 'A penalidade da armadura entra como modificador negativo em **Manha**, **Reflexos**, **Sentidos** e **Operações**. A penalidade das tabelas é a de quem é **proficiente** com a categoria da armadura; sem proficiência, ela **dobra**.'],
        ['p', 'Vestida, a armadura não ocupa Carga; levada na mochila, ocupa a carga do tipo (Leve 1, Média 3, Pesada 5).'],

        ['h2', 'Outros'],
        ['p', 'A armadura básica de todos os seres é 6. A armadura vestida (com +1 se você for proficiente com ela) substitui a básica quando for maior. Um personagem só pode vestir **uma armadura por vez**.'],

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
        ['formula', 'CC total', 'Núcleo + Corpo'],
        ['p', 'Além disso, a Essência concede uma reserva adicional exclusiva para módulos:'],
        ['formula', 'Reserva de módulos', 'Essência'],
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

        ['h2', 'Regras dos módulos'],
        ['p', 'Cada módulo segue a regra do tipo dele: radar, I.A., perito ou rede. São os mesmos módulos que equipam a armadura **Mirage**.'],
        ['card', 'Radares', [
          ['p', 'Radares são como uma percepção bônus que identifica o que o seu método permite detectar.'],
          ['p', 'Por padrão, um radar permite fazer **testes de Sentidos** para perceber o que ele detecta. Exemplo: um radar de radiodetecção pode revelar a posição de inimigos atrás de uma parede que o radar atravessa.'],
          ['p', 'Cada radar conta como um módulo.'],
          ['note', 'Exemplos', ['Radiodetecção: corpos e objetos sólidos, atrás de paredes.', 'Térmico: fontes de calor, mesmo no escuro ou na fumaça.', 'Sonar: movimento e formato do ambiente, sem luz.', 'Eletromagnético: eletrônicos, implantes, núcleos e escudos.', 'Completo: tudo o que os quatro detectam.']]
        ]],
        ['card', 'I.A.', [
          ['p', 'O módulo de I.A. acrescenta uma inteligência artificial que faz ações de **busca, pesquisa e análise** por você. O teste é **2d6 + a Precisão da I.A.** (o nível de inteligência dela), e quem rola é o mestre.'],
          ['p', 'I.A. não tem raridade e existe um único **Módulo de I.A.**, que serve para tudo: pesquisa, análise, infiltração, leitura de combate e qualquer outra tarefa de busca. Diferente dos outros módulos, ela só funciona instalada num item **Épico ou Lendário** equipado (próteses e módulos não têm raridade, então não servem de base).'],
          ['p', 'A **I.A. própria** não é um módulo: ela é como uma personagem, com alta consciência e todo o fator de interpretação de uma I.A. Só itens **Lendários** a suportam, e só ela pode ser colocada em um corpo próprio.'],
          ['p', 'A Precisão do Módulo de I.A. depende da conexão:'],
          ['kv', '', [['Fora da internet', 'Precisão 3'], ['Conectada à internet', 'Precisão 6']]]
        ]],
        ['card', 'Perito', [
          ['p', 'O **módulo perito (perícia)** funciona como o poder Doutor naquela perícia: o limite de modificador nela se torna 4 e você ganha +1 ponto de perícia enquanto o módulo estiver ativo.'],
          ['p', 'Não acumula com Doutor: se você já tem Doutor na mesma perícia, o módulo não muda nada.']
        ]],
        ['card', 'Rede', [
          ['p', 'O **módulo de rede** permite se conectar livremente à internet, sem precisar de um aparelho.'],
          ['p', 'Versões melhores criptografam a conexão ou funcionam mesmo sob bloqueio de sinal.']
        ]],

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
            'Pink Fang ou Hammer F-12 (espada ou fuzil de assalto);',
            'Pente médio padrão (para o fuzil);',
            'Tnnak Blazer (armadura média);',
            '1 comunicador portátil;',
            '1 injetor de estímulo (restaura 5 PE em troca de 5 PV, uma vez por cena).'
          ]]
        ]],
        ['card', 'Mercenário de Fronteira', [
          ['p', 'Viveu entre os destroços das zonas externas, endurecido e acostumado a negociar por munição.'],
          ['p', 'Itens iniciais:'],
          ['ul', [
            '1 arma de fogo comum (à escolha);',
            'Pente leve padrão ou Pente médio padrão ou Caixa de cartuchos (a que servir na arma);',
            'Tnnaks Jackt (armadura leve);',
            'Núcleo comum +2;',
            'Kit Técnico LS-2;',
            'Kit Médico LS-1.'
          ]]
        ]],
        ['card', 'Engenheiro', [
          ['p', 'Ex-funcionário de megacorporação ou catador com cérebro afiado.'],
          ['p', 'Itens iniciais:'],
          ['ul', [
            'Kit Técnico LS-2 (ferramenta multifunção);',
            'Pulse P-01 ou Carbine R-10 (pistola ou rifle);',
            'Pente leve padrão;',
            '1 ano de Chirlez backup (guarda até 20 itens digitais);',
            'Tnnaks Jackt (armadura leve).'
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
            'Caixa de cartuchos ou Pente leve padrão (cartuchos para o revólver, pente para a Carbine);',
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
            'Pente médio padrão ou Caixa de cartuchos (pente para a Storm, cartuchos para a Crusher);',
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
            'Pente leve padrão;',
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
        ]],
        ['card', 'Klyntar', [
          ['p', 'Os simbiontes estão longe de serem apenas parasitas espaciais aleatórios: eles fazem parte de uma mitologia cósmica ancestral baseada no abismo, na escuridão e em uma rebelião contra um deus tirano.'],
          ['p', 'Como os simbiontes originais foram forjados dentro da cabeça decapitada e incandescente de um Celestial, sob intensas batidas de martelo, toda a espécie herdou duas grandes fraquezas biológicas: o fogo e o som extremo (explosão).'],
          ['p', 'As peças dos itens iniciais servem em armas corpo a corpo, inclusive nas que um Simbionte cria (veja [Assimilação Abiótica](especimes#Assimilação Abiótica)).'],
          ['p', 'Itens iniciais:'],
          ['ul', [
            'Reforçada;',
            'Ponta serrilhada;',
            'Lâmina vibratória;',
            'Cabo com laço;',
            'Dorso pesado.'
          ]]
        ]],
        ['card', 'Assassino', [
          ['p', 'Mata por contrato e some antes que o corpo esfrie: prefere distância, silêncio e um único disparo certeiro.'],
          ['p', 'Itens iniciais:'],
          ['ul', [
            'Iron Revolver ER-2;',
            'Caixa de cartuchos;',
            'Ampliação;',
            'Tnnaks Jackt (armadura leve);',
            'Blush Smoke.'
          ]]
        ]],
        ['card', 'Fanático', [
          ['p', 'Vive por uma causa e morreria por ela sem pensar duas vezes. Pode ser um deus esquecido, uma corporação que prometeu salvação ou uma ideia que ouviu nas ruas: o que importa é que ele acredita, e essa fé pesa mais que qualquer dor, medo ou argumento.'],
          ['p', 'Onde os outros hesitam, o fanático avança. Ele carrega símbolos da sua crença no corpo e no equipamento, cumpre o que acha que é a sua missão e enxerga os inimigos da causa como obstáculos a remover.']
        ]]
      ]
    },

    /* ------------------------------------------------------------ 14 */
    {
      id: 'especimes', title: 'Espécimes', group: 'Personagem',
      blocks: [
        ['p', 'O espécime é a raça do personagem. Cada um traz habilidades raciais próprias, que entram sozinhas na ficha. O Etheriano pode comprar habilidades raciais de outros espécimes com UP, e o Android escolhe uma delas de graça (Inspirado em humanoides), inclusive de espécimes criados na Oficina.'],
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
          ['p', 'Você tem um núcleo! E depende dele, acoplado a você, para sobreviver. Você começa o jogo com um núcleo +2 comum, e seus PV viram Blindagem: a sua vida é a Blindagem. Quando todas as camadas da sua Resistência zeram, você fica fora de combate em vez de agonizar (veja [Morte e Agonia](morte-e-agonia)). Como ser eletrônico, você é atordoado pelos efeitos de [PEM](condicoes-e-estados#Específicos).'],
          ['h4', 'Engenharia'],
          ['p', 'Como um bom pedaço de lata, você pode equipar itens normalmente ou acoplá-los ao próprio corpo. Acoplar exige 2 horas de trabalho (Tecnologia ou Ofício (Engenharia)) para cada ponto de Carga do item e vale para armaduras, armas, acessórios, mods, propriedades e demais itens, exceto consumíveis. Um item acoplado ocupa Carga Cibernética igual à Carga dele.'],
          ['p', 'Você se beneficia de uma armadura por vez, e as armas acopladas contam como sempre empunhadas. Para mods e acessórios, você conta ao mesmo tempo como um item **Lendário** de arma de fogo e de arma corpo a corpo: os mods e acessórios acoplados em você valem para você e para qualquer arma da mesma categoria que você estiver usando.'],
          ['p', 'A cada +2 de Carga Cibernética dados pelo núcleo acoplado, você ganha +1 de Carga Cibernética a mais, e você escolhe o atributo-chave do cálculo da sua Carga Cibernética (na ficha, aba Inventário).'],
          ['h4', 'Não vivo'],
          ['p', 'Você é lata, e lata não é afetada por coisas biológicas nem precisa descansar: é só colocar na tomada! Você não recupera a vida (Blindagem) descansando, mas pode ser consertado: no descanso longo, fora de serviço, quem tiver a melhor Tecnologia do grupo faz o teste com um Kit Técnico, e você recupera Blindagem igual ao resultado do teste. Em combate, o conserto é a cura de Blindagem (veja [Cura](cura#Blindagem (BL))).']
        ]],
        ['card', 'Android', [
          ['p', 'Você é um robô, só que humanoide...'],
          ['h4', 'Núcleo'],
          ['p', 'Você tem um núcleo! E depende dele, acoplado a você, para sobreviver. Você começa o jogo com um núcleo +2 comum, e seus PV viram Blindagem: a sua vida é a Blindagem. Quando todas as camadas da sua Resistência zeram, você fica fora de combate em vez de agonizar (veja [Morte e Agonia](morte-e-agonia)). Como ser eletrônico, você é vulnerável a tudo o que afeta eletrônicos. Você não precisa de uma prótese para acoplar módulos.'],
          ['h4', 'Inspirado em humanoides'],
          ['p', 'Você pode escolher livremente um poder (habilidade racial) de qualquer espécime, inclusive dos criados na Oficina (aba Poderes → Características raciais). Se a habilidade escolhida conceder UP, ela fornece só 1 UP.'],
          ['h4', 'Humanidade'],
          ['p', 'Você pode fazer testes para resistir a efeitos de PEM (pulso eletromagnético) quando eles tiverem CD, e metade da sua Blindagem pode ser restaurada como se fosse PV (a outra metade, só com conserto).'],
          ['p', 'Efeitos de [PEM](condicoes-e-estados#Específicos) atordoam automaticamente seres elétricos ou eletrônicos e desativam Escudos. Com a Humanidade, o Android faz o teste quando houver CD; se não houver, ele não é afetado pelo PEM.']
        ]],
        ['card', 'Etheriano', [
          ['p', 'Cria do Éter.'],
          ['h4', 'Cria do Éter'],
          ['p', 'Quando é afetado por energia Ether pura, você recupera recursos iguais ao tamanho do Ether: 10 de PV e de PE para a pequena, 25 para a média e 50 para a grande. O que passar do máximo conta como recurso bônus até o próximo descanso (não acumula com outra fonte: vale o maior bônus). Você também pode tornar um Éter instável e forçar a absorção dele, dividindo com todos na área o XP que o Éter cede.'],
          ['h4', 'Dom do Éter'],
          ['p', 'Você recebe 2 UP extras no início, que também podem comprar habilidades raciais de qualquer outro espécime, inclusive os criados na Oficina (aba Poderes → Características raciais).']
        ]],
        ['card', 'Simbionte', [
          ['p', 'Massa amorfa, viva e independente, que molda o próprio corpo: tira da própria matéria força, cura e armas.'],
          ['h4', 'Força e Agilidade Ampliadas'],
          ['p', 'Aumenta a própria força física a níveis devastadores, permitindo erguer toneladas e enfrentar inimigos do alto escalão. Ganha +6 m de deslocamento e, uma vez por turno, ao custo de 1 PA ou 7 PE, um ganho em um teste de Corpo.'],
          ['h4', 'Cura Regenerativa'],
          ['p', 'Cura ferimentos mortais em questão de segundos, regenera membros decepados e pode até neutralizar doenças terminais.'],
          ['p', 'Ressuscita o alvo se sobrar algo dele que não esteja sendo afetado por algum efeito.'],
          ['p', 'No início de cada turno, faça um teste de regeneração: 2d6 + Fortitude + Tecnologia. A regeneração segue a regra normal de Cura: o teste é contra a CD do recurso (6, ou 10 se estiver abaixo da metade, +2 por condição negativa) e o simbionte recupera a diferença entre o resultado e a CD. Cura PV e também Blindagem (uma exceção à regra de que a Blindagem só volta com conserto).'],
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
        ['card', 'Defensivas', [
          ['kv', '', [['Custo', '1 UP por opção'], ['Quando usa', 'Defesa']]],
          ['p', 'Truques de defesa que você ativa pagando PE.'],
          ['dl', [
            ['Esquiva (1 PE)', 'Ao rolar a Defesa do combate, você usa Precisão + Reflexos (com a penalidade de armadura) no lugar de Corpo + Resistência. Vale também na Defesa mínima (Armadura + Precisão + Reflexos, com a penalidade) e dura o combate inteiro.'],
            ['Explosiva (3 PE)', 'Reação a um ataque recebido: você soma a sua Armadura à Defesa contra esse ataque.']
          ]]
        ]],
        ['card', 'Ataques', [
          ['kv', '', [['Custo', '1 UP por opção'], ['Quando usa', 'Ataque']]],
          ['p', 'Ao fazer um ataque, você pode ativar estas vantagens pagando o PE de cada uma.'],
          ['dl', [
            ['Avante (1 PE)', 'Você também se move 3 m na mesma ação, sem gastar a ação de movimento; o ataque acontece depois do movimento.'],
            ['Certeiro (1 PE)', 'O ataque causa crítico com 5 e 6.']
          ]]
        ]],
        ['card', 'Regeneração', [
          ['kv', '', [['Custo', '1 UP']]],
          ['p', 'Só funciona se você for uma criatura biológica. Você recupera 3 PV por turno.'],
          ['p', 'Se estiver agonizando, pode recobrar a consciência quando recuperar todos os PV.'],
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
          ['p', '**Ataques múltiplos.** Por rodada, você tem uma quantidade de ataques igual ao seu atributo Corpo + a sua perícia Luta. Eles seguem as mesmas regras de cadência das armas de fogo (veja [Regras de Cadência](cadencia)), e cada golpe conta como um disparo: com uma arma corpo a corpo da qual é proficiente (ou desarmado), use a cadência perita; sem proficiência, a penalidade de cadência comum. O dano de cada alvo é multiplicado pelos golpes nele.'],
          ['example', 'Corpo 2 e perícia Luta 1 → 3 ataques por rodada. Desarmado, dois golpes no mesmo alvo: –2 no ataque, dano ×2.'],
          ['p', 'Em vez de golpear, você pode gastar esses ataques nos efeitos marciais básicos abaixo. A tabela é proporcional: cada ataque gasto vale 3 m de movimento, e os efeitos que acumulam crescem um passo por ataque. Os ataques são contados por rodada e não acumulam.'],
          ['table', ['Efeito', 'Custo', 'O que faz'], LUTA_MANOBRAS],
          ['p', '**Estilos de luta.** Os efeitos básicos servem a qualquer lutador; um estilo é o upgrade do poder, com passivas únicas e técnicas próprias que melhoram o básico. Só dá para ter **um estilo por ficha**, e o custo dele soma ao custo do poder.'],
          ...LUTA_ESTILOS.flatMap((e) => [
            ['p', '**' + e.name + ' (' + e.cost + ' UP).** ' + e.resumo],
            ['dl', e.passivas],
            ['table', ['Técnica', 'Custo', 'O que faz'], e.tecnicas]
          ]),
          ['note', 'Luta e Tecnomancia', 'Luta não combina direto com tecnomancia: ela se refere à ação de atacar, e não dá para atacar e conjurar ao mesmo tempo. Para complementar os ataques com tecnomancia, é preciso um poder cuja descrição diga que “pode complementar seus ataques à distância e marciais com técnicas de tecnomancia”.']
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
          ['p', 'Toda operação começa por uma **base**. Depois você soma **implementos**, pagando o PE de cada um. Numa operação, o número de implementos é no máximo o seu **atributo chave**, que vem do seu tipo de tecnomante (o Engenheiro escolhe Precisão ou Essência uma vez, para toda a Tecnomancia).'],
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
          ['p', '**Engenheiro.** Característica do Engenheiro: a primeira coisa que ele escolhe é o atributo chave, **Precisão ou Essência**, que vale para toda a sua Tecnomancia (todas as listas e níveis). A cada nível de Tecnomancia, escolha uma lista de componentes. Você conhece um número de componentes da lista igual a atributo chave + Operações, e eles servem de base Item ou de implementos especiais. Escolher de novo uma lista que já tem dá mais atributo chave + Operações componentes dela.'],
          ['example', 'O Engenheiro compra Tecnomancia: escolhe Precisão como atributo chave, o modo Instantâneo e a lista Equipamento. Com Precisão 2 e Operações 1, conhece 3 itens (por exemplo, uma armadura, uma arma e uma granada).'],
          ['p', '**É retroativo:** o número de conhecidos usa os valores atuais. Quando o atributo chave ou Operações sobem, ele sobe junto em todas as listas e níveis já comprados, e você escolhe os componentes novos.'],
          ['p', '**Consertar Escudo (exclusivo do Engenheiro).** Uma ação efetiva do Engenheiro pode recarregar o Escudo de um alvo, seguindo a regra de Cura: teste de atributo chave + Operações contra a CD; o alvo recupera a diferença.'],
          ['dl', TECNO_LISTAS],
          ['p', '**Patrocinado.** Uma companhia patrocina você. Escolha a companhia uma vez; a cada nível de Tecnomancia, escolha um catálogo dela (todas as armas dela, todas as armaduras dela...) e conheça todos os componentes desse catálogo. Cada nível dá um catálogo diferente.'],
          ['p', 'Propriedades, acessórios e mods não têm patrocinador, porque o valor deles é mecânico. Para essas categorias, o catálogo é um tipo de arma: todas as de armas corpo a corpo ou todas as de armas de fogo.'],
          ['example', 'Um Patrocinado escolhe a Wathrever. No nível 1 de Tecnomancia, pega o catálogo de armas de fogo dela e conhece todas. No nível 2, pega acessórios de armas de fogo.'],
          ['p', '**Insano.** A cada nível de Tecnomancia, escolha dispositivos de qualquer lista (Poderes, Equipamento, Propriedades, Mods, Próteses e módulos). Você conhece um número de componentes igual à sua **Essência ou às suas Operações, o que for maior**, por nível. Também é retroativo: subir a Essência ou Operações aumenta os conhecidos de todos os níveis já comprados.'],
          ['example', 'Um Insano com Essência 3 e Operações 1 conhece 3 componentes por nível: no nível 2, 6 componentes, como uma arma, uma granada, dois poderes e dois mods. Se a Essência subir para 4, passa a conhecer 8.'],
        ]],
        ['card', 'Telecinese', [
          ['kv', '', [['Custo', '1 UP (+1 UP por melhoria)']]],
          ['p', 'Você manipula objetos a curta distância pagando 1 PE por carga do objeto (com carga ½ ou menos, o peso não custa) e +1 PE por ação feita com ele (as livres não custam). Controla ao mesmo tempo um número de objetos igual à sua Essência (mínimo 1); se eles fazem a mesma ação, ela vale para todos.'],
          ['p', 'Com a ação de movimento, você desloca os objetos pelo seu deslocamento dividido pela carga do item. Testes com os objetos usam as suas perícias e atributos normalmente, mas ações contra alguém têm –3. Suas técnicas e habilidades funcionam com os objetos manipulados.'],
          ['p', '**Melhorias**'],
          ['p', '**Mental (1 UP):** a telecinese mexe nas sinapses. Com uma ação padrão, escolha um alvo: ele faz um teste de Vontade contra CD 7 + (um atributo à sua escolha) + Operações ou tem os pensamentos lidos. Lendo os pensamentos, você tem vantagem em tudo o que fizer contra ele até o fim do seu próximo turno, e pode sustentar a leitura com a ação de movimento. Um alvo incapacitado ou inconsciente falha automaticamente; memórias de sonho ou pesadelo que ele esteja vivendo não podem ser lidas. O alvo só sente a leitura se tirar duas falhas críticas no teste.'],
          ['p', '**Preciso (1 UP):** as ações contra alguém não têm os –3, e a carga de todos os itens conta 1 a menos (carga 1 vira ½, sem custo de peso).']
        ]],
        ['card', 'Mente de outro mundo', [
          ['kv', '', [['Custo', '1 UP']]],
          ['p', 'Você tem ganho (um dado a mais) em todos os testes contra efeitos mentais sobre você, e nesses testes a falha crítica (1) não anula a sua perícia.']
        ]],
        ['card', 'Akimbo', [
          ['kv', '', [['Custo', '1 UP']]],
          ['p', 'Você pode empunhar dois itens de Uma mão (ou de Saque), um em cada mão (ou um de cada tipo, seja irado!). Submetralhadoras só entram no Akimbo se você for proficiente com elas (veja [Submetralhadora](armas#Submetralhadora)). A recarga sobe uma categoria de ação: livre vira bônus, bônus vira movimento, movimento vira padrão e padrão vira completa.'],
          ['p', 'Em troca, você pode mirar num único alvo com os dois itens ou escolher até dois alvos. Os disparos saem na mesma ação, mas cada arma faz o seu teste de ataque e causa o seu dano separado.']
        ]],
        ['card', 'Gatilho do velho mundo', [
          ['kv', '', [['Custo', '1 UP']]],
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
          'Cada Perda dá +1 UP. Esses UP não contam para os benefícios de UP par e ímpar, como os iniciais do espécime.',
          'A mecânica de uma Perda (menos PV, menos deslocamento...) entra sozinha na ficha.',
          'Você pode **compensar** uma Perda gastando 1 UP: ela deixa de valer, e o UP que ela deu fica empatado com o que você gastou.'
        ]],
        ['note', 'Na ficha', 'Aba Poderes → Perdas: "Adicionar perda" traz uma Perda do banco, e "Compensar (1 UP)" a desliga. Perdas novas podem ser criadas na Oficina.'],
        ...PERDAS.map((x) => ['card', x[0], [['kv', '', [['Concede', '+1 UP']]], ['p', x[1]]]])
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
        ['fields', ['PV: 5 + (Corpo × 5)', 'Escudo', 'Blindagem', 'PE: 5 + (Essência × 5)', 'PA: Precisão (mínimo 1)']],

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
        ['formula', 'Ataque', '2d6 + atributo + perícia do ataque'],

        ['h2', 'Defesa'],
        ['formula', 'Defesa', '2d6 + Corpo + Resistência (uma vez por combate)'],
        ['h3', 'Defesa mínima'],
        ['formula', 'Defesa mínima', 'Armadura + Corpo + Resistência'],

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