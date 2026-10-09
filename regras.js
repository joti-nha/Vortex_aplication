/* =====================================================================
   VORTEX | regras.js
   Conteúdo das regras (só dados, sem lógica). Para corrigir ou acrescentar
   uma regra, edite aqui; a aba Regras do site monta tudo sozinha.

   Cada capítulo vira uma aba: { id, title, group, blocks: [...] }
   Blocos (cada um é uma lista [tipo, ...]):
     ['h2', 'Título']            seção (numerada)      ['h3', ...] ['h4', ...] subseções
     ['p', 'texto']              parágrafo (**negrito**, *itálico*)
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
/* Efeitos marciais do poder Luta: [efeito, custo em ataques da rodada, o que faz].
   A ficha (poder Luta, em items.js) e o capítulo Habilidades usam esta mesma tabela. */
const LUTA_MANOBRAS = [
  ['Passo marcial', '1', 'Move 3 m entre um golpe e outro, sem gastar a ação de movimento.'],
  ['Investida', '2', 'Antes do golpe, avança até o seu deslocamento em linha reta; o golpe recebe +2 no dano.'],
  ['Golpe varrido', '1 por alvo', 'O mesmo golpe acerta mais um alvo adjacente a você; um só teste vale para todos.'],
  ['Golpe em área', '3', 'Golpe giratório ou no chão: todos adjacentes a você (raio 1,5 m) sofrem o ataque, com metade do dano.'],
  ['Finta', '1', 'Enganação contra Sentidos do alvo; se vencer, seus próximos golpes nele, nesta rodada, têm +2 no ataque.'],
  ['Manobra', '1', 'Derrubar, empurrar, desarmar, agarrar ou quebrar a guarda (Luta contra Resistência ou Reflexos) sem gastar outra ação.'],
  ['Empurrão', '1', 'Se o golpe acertar, o alvo é empurrado 3 m (Corpo + Luta contra Atletismo dele).'],
  ['Sangrar (cortante)', '2', 'Se o golpe cortante acertar, o alvo sangra: perde 1d6 PV no começo de cada turno até ser tratado (CD 6 + Corpo + Luta contra Fortitude para evitar).'],
  ['Atordoar (contundente)', '2', 'Se o golpe contundente acertar, o alvo fica Atordoado até o fim do próximo turno dele (CD 6 + Corpo + Luta contra Fortitude para evitar).'],
  ['Ferir (perfurante)', '2', 'Se o golpe perfurante acertar, o alvo fica Ferido: –1 no ataque e na defesa por ferida (máximo –3) até receber cura (CD 6 + Precisão + Luta contra Fortitude para evitar).'],
  ['Golpe certeiro', '2', 'O golpe causa crítico com 5 e 6.'],
  ['Guarda', '1 cada', 'Até o seu próximo turno, +1 na defesa contra ataques corpo a corpo por ataque gasto (máximo +3).'],
  ['Aparar', '1 (guardado)', 'Guarde um ataque: como reação a um golpe corpo a corpo, faça um teste de Luta contra o ataque; se vencer, o golpe não acerta.'],
  ['Contra-ataque', '1 (guardado)', 'Guarde um ataque: quando um inimigo errar um ataque corpo a corpo em você, golpeie-o como reação.'],
  ['Arremesso', '1', 'Arremessa a arma corpo a corpo ou um objeto à mão: ataque com Luta até 9 m.'],
  ['Grito de guerra', '1', 'Intimidação contra Vontade de quem ouvir, em 6 m; quem perder tem –1 no ataque contra você até o fim da rodada.']
];
window.VORTEX_REGRAS = {
  lutaManobras: LUTA_MANOBRAS,
  groups: ['Fundamentos', 'Combate', 'Equipamento', 'Personagem'],
  chapters: [

    /* ------------------------------------------------------------ */
    {
      id: 'testes-e-dados', title: 'Testes e Dados', group: 'Fundamentos',
      blocks: [
        ['h2', 'Rolagens'],
        ['formula', 'Todos os testes usam', '2d6 + Atributo + Perícia'],

        ['h2', 'Críticos'],
        ['p', 'Cada dado de resultado 6 adiciona novamente o valor do atributo usado no teste.'],
        ['p', 'Cada dado de resultado 1 o deixa em perda; uma perda anula seus modificadores providos da perícia. Duas perdas no teste, ele falha completamente.'],
        ['p', 'Só é possível se beneficiar de no máximo 1 crítico nos dados por teste.'],
        ['p', 'Uma falha crítica (1) anula um crítico (6).'],

        ['h2', 'Ganho'],
        ['p', 'Um ganho é o aumento na quantidade de dados rodados naquele teste.'],
        ['p', 'O número de dados pode aumentar:'],
        ['ul', [
          '3º dado: concedido por fontes de alto valor.',
          '4º dado: concedido pelo mestre/sistema.',
          'Limite total: 4d6.'
        ]],
        ['p', 'Na defesa, se houve um ganho durante o combate, some o resultado do ganho em sua defesa atual.'],

        ['h2', 'Perda'],
        ['p', 'Como um ganho, porém você joga um dado a menos.'],

        ['h2', 'Vantagem'],
        ['p', 'Você rola mais dados, porém, em vez de somar no teste, você escolhe o dado com maior valor.'],

        ['h2', 'Desvantagem'],
        ['p', 'Você rola mais dados, e escolhe entre as opções o pior resultado.']
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'atributos-e-recursos', title: 'Atributos e Recursos', group: 'Fundamentos',
      blocks: [
        ['h2', 'Atributos'],
        ['dl', [
          ['Corpo', 'Força, vitalidade, combate físico e resistência física.'],
          ['Precisão', 'Mira, controle de armas, tecnologia prática.'],
          ['Essência', 'Energia interior, tecnomancia, vontade e presença.']
        ]],
        ['h3', 'Distribuição Inicial'],
        ['ul', [
          '3 pontos para distribuir.',
          'Pode reduzir um atributo para –1 e ganhar +1 ponto extra.',
          'Máximo inicial por atributo: +3.',
          'Limite total: 6.'
        ]],

        ['h2', 'Recursos'],
        ['h3', 'Pontos de Vida (PV)'],
        ['ul', ['PV mínimo: 5', 'PV total: 5 + (Corpo × 5)']],
        ['example', 'Corpo 2 = 5 + 10 = 15 PV.'],

        ['h3', 'Pontos de Essência (PE)'],
        ['ul', ['PE mínimo: 5', 'PE total: 5 + (Essência × 5)']],
        ['p', 'Uso: Representa esforço físico, tecnomancia, habilidades que exigem energia interior.'],

        ['h3', 'Pontos de Ação (PA)'],
        ['ul', ['PA total: igual ao valor de Precisão.']],
        ['example', 'Precisão 3 = 3 PA.'],
        ['p', 'Representa um surto de criatividade inteligente (ou não) capaz de mudar a dinâmica de suas interações.'],

        ['h2', 'Recuperação'],
        ['p', 'Recuperar recursos totalmente após descanso adequado.'],
        ['dl', [
          ['Péssimo estado', 'Recupera seus recursos igual o atributo atrelado.'],
          ['Curta, de 1 a 4 horas', 'Recupera metade dos recursos, dividindo os recuperados à metade a cada descanso curto seguinte. Volta ao normal em um descanso longo.'],
          ['Longa, a partir de 8 horas', 'Recupera totalmente os recursos.']
        ]],

        ['h2', 'Outros'],
        ['h3', 'Armadura básica'],
        ['p', 'A armadura básica de todas as criaturas é de 6.'],
        ['h3', 'Movimento'],
        ['p', 'O movimento padrão (sem alterações por habilidades, poderes ou desvantagens) dos seres vivos é de 9 m terrestres (30 Fts).']
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'progressao', title: 'Sistema de Progressão', group: 'Fundamentos',
      blocks: [
        ['p', 'Os poderes podem ser adquiridos utilizando UP Points, respeitando o custo individual de cada poder.'],
        ['p', 'O personagem recebe 1 UP Point a cada 10 pontos de XP acumulados. O XP é obtido por meio da conclusão de objetivos pessoais ou coletivos, bem como pela superação de encontros em combate.'],

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
        ['p', 'A dificuldade é determinada pela comparação entre a soma dos UP Points do grupo e a dos inimigos.'],
        ['p', 'Se ambos os lados possuírem a mesma quantidade de UP Points, ou a diferença for de até 3 pontos, o XP permanece inalterado.'],
        ['p', 'Caso os oponentes possuam vantagem, o grupo recebe 1 XP adicional para cada 5 UP Points de diferença.'],
        ['p', 'Por outro lado, se o grupo possuir 10 ou mais UP Points acima dos oponentes, o encontro não concede XP.'],
        ['p', 'Além disso, ao enfrentar pela segunda vez o mesmo tipo de inimigo, a recompensa de XP por derrotá-lo é reduzida à metade.'],

        ['h2', 'Benefícios por UP Points'],
        ['p', 'Sempre que o personagem alcançar um número par de UP Points (desconsiderando aqueles provenientes da Origem), poderá escolher dois dos seguintes benefícios:'],
        ['ul', ['+5 PV;', '+5 PE;', '+1 PA.']],
        ['p', 'Sempre que alcançar um número ímpar de UP Points (também desconsiderando os provenientes da Origem), recebe +1 ponto em uma perícia à sua escolha.'],
        ['p', 'Além disso, a cada 4 UP Points (também desconsiderando os da Origem), recebe +1 em um atributo à sua escolha. Na ficha, ele é escolhido na aba Progressão.']
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'pericias', title: 'Perícias', group: 'Fundamentos',
      blocks: [
        ['p', 'As perícias fornecem bônus de +1 a +3.'],
        ['p', 'Um teste de perícia é a soma do status atrelado a ela + o bônus comprado pelo jogador.'],

        ['h2', 'Distribuição Inicial'],
        ['ul', ['2 perícias +2', '1 perícia +1']],

        ['h2', 'Progressão'],
        ['ul', [
          'Limite de +3 por perícia (+4 com Doutor).',
          'Cada ponto investido concede +3 pontos livres para distribuir entre as perícias.'
        ]],

        ['h2', 'Lista de Perícias'],
        ['h3', 'Perícias de Corpo'],
        ['dl', [
          ['Luta', 'combate corpo a corpo.'],
          ['Resistência', 'resistir dano direto.'],
          ['Atletismo', 'força física e mobilidade.'],
          ['Fortitude', 'resistência a efeitos físicos internos (toxinas, radiação etc.).']
        ]],
        ['h3', 'Perícias de Precisão'],
        ['dl', [
          ['Mira', 'com armas de fogo e destreza.'],
          ['Tecnologia', 'uso e manipulação de tecnologias.'],
          ['Iniciativa', 'velocidade de iniciação de atividades hostis.'],
          ['Manha', 'coordenação fina e prestidigitação.'],
          ['Pilotagem', 'veículos, drones e mechas.'],
          ['Intelecto', 'conhecimento de mundo e coesão lógica.'],
          ['Reflexos', 'capacidade cognitiva de reação.'],
          ['Ofício', 'sua experiência em uma função específica. Ao escolher essa perícia você escolhe a profissão a qual é proficiente.']
        ]],
        ['h3', 'Perícias de Essência'],
        ['dl', [
          ['Operações', 'tecnomancia e módulos energéticos.'],
          ['Sentidos', 'capacidade de usar seus sentidos para compreensão, foco e reconhecimento de situações.'],
          ['Vontade', 'resistência mental.'],
          ['Intimidação', 'presença dominante.'],
          ['Diplomacia', 'negociação e persuasão.'],
          ['Enganação', 'blefe e manipulação.']
        ]],

        ['h2', 'Proficiência'],
        ['p', 'É um bônus cedido pela vantagem “perito em”. Em geral, concedem bônus atrelados ao tipo de equipamento.'],
        ['dl', [
          ['Em armas', 'Concede a regra de cadência perita e concede um aprimoramento às regras de tipo.'],
          ['Em armaduras', 'Diminui a penalidade (sem, a penalidade básica é dobrada) e concede +1 de defesa.']
        ]],
        ['p', 'Você escolhe 4 tipos de armas ou armaduras as quais são proficientes desde o início.'],

        ['h2', 'Compras com UP'],
        ['p', 'Comprar qualquer um destes poderes custa 1 UP e também concede +1 em uma perícia à sua escolha. Cada um pode ser comprado mais de uma vez, escolhendo outra perícia ou outro tipo.'],
        ['dl', [
          ['Doutor (1 UP cada)', 'Seu limite de modificador na perícia escolhida se torna 4.'],
          ['Proficiência em arma (1 UP cada)', 'Escolha um tipo de arma o qual é proficiente, para usar a regra de cadência proficiente.'],
          ['Proficiência em armadura (1 UP cada)', 'Escolha um tipo de armadura o qual é proficiente, ganhe +1 de armadura com a mesma e use a regra de proficiência com a armadura.']
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
        ['p', 'A Carga é calculada da seguinte forma:'],
        ['ul', [
          '2 de Carga base',
          '+ 4 para cada ponto de Corpo',
          '+ 1 para cada ponto de Precisão',
          '+ 2 para cada ponto de Essência'
        ]],
        ['example', 'Um personagem com Corpo 2, Precisão 1 e Essência 2 possui: 2 + (2 × 4) + 1 + (2 × 2) = 15 Carga. Portanto, seu limite é de 17 Cargas.'],
        ['p', 'Itens equipados normalmente não ocupam Carga. Itens transportados ocupam a quantidade indicada em sua ficha.'],

        ['h2', 'Sobrecarga'],
        ['p', 'Quando a Carga transportada ultrapassa o limite do personagem, ele fica **Sobrecarregado**.'],
        ['p', 'Enquanto estiver Sobrecarregado:'],
        ['ul', [
          'Seu **Deslocamento é reduzido à metade**.',
          'Todas as **ações físicas** passam a exigir uma categoria de ação maior.'
        ]],
        ['p', 'A categoria das ações é elevada da seguinte forma:'],
        ['formula', '', 'Bônus → Movimento → Padrão'],
        ['p', 'A penalidade permanece enquanto o personagem estiver acima de seu limite de carga.']
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'combate', title: 'Combate', group: 'Combate',
      blocks: [
        ['h2', 'Iniciativa'],
        ['p', 'Ao adentrar em algum combate, todos os envolvidos fazem um teste de precisão, que define a ordem dos turnos: começando daquele que teve a maior rolagem no teste e indo para o com menor (decrescente). A ordem se mantém a mesma pelo restante do combate; também é jogada a defesa da cena (veja em Ataque e Defesa).'],
        ['p', 'A iniciativa é jogada ao início de qualquer combate.'],

        ['h2', 'Cena'],
        ['p', 'Marcação de tempo usada para todo o momento de um determinado evento.'],
        ['p', 'Em combates, uma cena é composta por rodadas.'],

        ['h2', 'Rodadas'],
        ['p', 'Rodadas definem uma marcação de tempo entre as ações de todos os integrantes da situação, na ordem definida pela iniciativa, começando pelo primeiro da iniciativa e terminando no último. Uma rodada é um marco de tempo importante para habilidades, poderes e ações.'],
        ['p', 'Dentro de uma rodada cada participante terá seu turno.'],

        ['h2', 'Turno'],
        ['p', 'A ordem dos turnos de cada jogador é definida pela iniciativa. Dentro de um turno você tem as ações:'],
        ['dl', [
          ['Ação padrão', 'Essa é a ação principal, a qual você ataca, usa efeitos utilitários e afins.'],
          ['Ação de movimento', 'Em geral é a ação utilizada para se movimentar, e efeitos e habilidades podem a usar para além de se mexer em meio ao combate. Pode se fazer mais uma ação de movimento usando sua ação padrão.'],
          ['Ação bônus', 'Ação menor, para usar recursos rápidos e acionar mecanismos ou habilidades.'],
          ['Ação livre', 'Uma ação livre é como fazer algo espontaneamente ou ao mesmo tempo que as outras; diferente das outras, não existe um limite de quantas ações livres você pode fazer.'],
          ['Reação', 'Reagir a uma ação de outros; não tem limite de quantas se pode fazer por turno.']
        ]]
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'ataque-e-defesa', title: 'Ataque e Defesa', group: 'Combate',
      blocks: [
        ['h2', 'Ataque'],
        ['p', 'Para atacar um alvo é necessário que ele esteja ao mínimo no alcance de sua fonte de ataque (corpo a corpo ou à distância); com isso você faz um teste de ataque.'],
        ['p', 'O teste de ataque depende da forma com que você esteja atacando:'],
        ['table', ['Forma', 'Teste'], [
          ['Corpo a corpo', '2d6 + Corpo + Luta'],
          ['À distância', '2d6 + Precisão + Mira'],
          ['Tecnológicos', '2d6 + Essência + Operações']
        ]],
        ['p', 'A regra geral para os ataques é: Modificador + perícia atrelados.'],

        ['h2', 'Defesa'],
        ['p', 'Quando for alvo de um ataque, sua defesa tem como função reduzir/anular um ataque feito contra você.'],
        ['p', 'A defesa é definida no início de cada combate, junto da iniciativa, com um teste de defesa:'],
        ['formula', '', '2d6 + Corpo + Resistência = Defesa'],
        ['p', 'Se o teste ficar abaixo disso, usa-se a defesa mínima.'],
        ['h3', 'Defesa mínima'],
        ['formula', '', 'Armadura + Corpo + Resistência'],

        ['h2', 'Danos'],
        ['formula', '', 'Fonte do dano = Ataque – Defesa do alvo'],
        ['p', 'Se o resultado for zero ou negativo, o mínimo de dano é sempre 1. (A menos que alguma fonte altere essa condição.)'],
        ['p', 'Quando um ataque supera sua defesa você recebe danos que afetam suas resistências (Vida, Blindagem e Escudo: veja abaixo).'],

        ['h2', 'Tipo de dano'],
        ['p', 'Os tipos de dano variam; eles têm interações únicas e diretas contra ou a favor de alvos específicos que contenham fraquezas ou resistências.'],
        ['dl', [
          ['Físicos', ['Cortante', 'Contundente', 'Perfurante', 'Balístico']],
          ['Elementais', ['Fogo', 'Ácido/químico', 'Elétrico']],
          ['Especiais', ['Explosivo', 'Radioativo', 'Necrótico']]
        ]],

        ['h2', 'Fraquezas e Eficiência de Dano'],
        ['p', 'Ataques eficientes causam **dano dobrado** após o cálculo normal.'],

        ['h2', 'Tipos de Resistência'],
        ['card', 'Pontos de Vida (PV)', [
          ['p', 'Representam carne, sangue e tecido vivo.'],
          ['kv', '', [['Fraquezas', 'Radioativo, Cortante (dano dobrado).'], ['Resistência', 'Nenhuma.']]],
          ['p', 'PVs podem ser recuperados por qualquer fonte médica ou efeito que afete Pontos de Vida.']
        ], 3],
        ['card', 'Escudo (E)', [
          ['p', 'Campo de proteção energética.'],
          ['kv', '', [['Fraquezas', 'Elétrico, Contundente (dano dobrado).'], ['Resistência', 'Cortante, Penetrante.']]],
          ['p', 'Escudos podem ser restaurados por qualquer fonte de energia compatível.']
        ], 3],
        ['card', 'Blindagem (BL)', [
          ['p', 'Superfícies rígidas e reforçadas.'],
          ['kv', '', [['Fraquezas', 'Ácido, Explosivo (dano dobrado).'], ['Resistência', 'Fogo, Cortante, Balístico.']]],
          ['p', 'Blindagem só pode ser reparada ou substituída.']
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
        ['p', 'Se o personagem chegar a 0 PV, ele cai agonizando.'],
        ['p', 'Ele só morre quando atinge –PV Máximo.'],
        ['example', 'PV Máx 20 → morre ao chegar em –20.'],

        ['h2', 'Teste de Sobrevivência'],
        ['p', 'Enquanto estiver em 0 ou negativo, faça um teste de fortitude com CD inicial 6, aumentando em +1 a cada nova tentativa no mesmo dia.'],
        ['ul', [
          'Se falhar: recebe 1 de dano negativo; o dano aumenta +1 a cada nova falha no mesmo dia.',
          'Se passar: estabiliza, mas permanece inconsciente até ser reanimado com no mínimo o tempo de um descanso longo ou fonte médica.'
        ]],

        ['h2', 'Teste de medicina para reanimar'],
        ['p', 'CD 6, aumentando em +1 a cada nova tentativa na mesma cena.'],
        ['p', 'Requisito: use uma ação no caído, tenha 3 em precisão ou +1 em ofício: Medicina, e um uso de qualquer Kit médico. Se passar, o alvo reanima com 1 PV.'],
        ['p', 'Se o caído for um robô ou não vivo, troque o teste de medicina por tecnologia e o kit médico por kit robótico.']
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'cura', title: 'Cura', group: 'Combate',
      blocks: [
        ['p', 'A recuperação de **Pontos de Vida (PV)**, **Escudo (E)** e **Blindagem (BL)** utiliza um método específico para cada recurso, mas todos seguem a mesma regra geral.'],
        ['p', 'Para realizar uma recuperação, faça um **teste da perícia indicada** contra a **CD do alvo**.'],

        ['h2', 'Classe de Dificuldade (CD)'],
        ['p', 'A CD da recuperação é baseada no **valor máximo** do recurso que está sendo restaurado.'],
        ['ul', [
          'Se o recurso possuir **menos da metade** de seu valor máximo, a **CD é 10**.',
          'Caso contrário, a **CD é 6**.'
        ]],
        ['p', 'Cada **condição negativa** afetando o alvo aumenta a CD do teste em **+2**.'],
        ['p', '*Considera-se na CD condições vinculadas (que vêm antes dela) e que a cura sempre ocorre primeiro que qualquer anulador de condição.*'],

        ['h2', 'Recuperação'],
        ['p', 'Em caso de sucesso, o alvo recupera uma quantidade da resistência igual à **diferença entre o resultado do teste e a CD**, somada a quaisquer bônus concedidos por habilidades, equipamentos ou outros efeitos.'],
        ['p', 'Se o resultado do teste for igual ou inferior à CD, nenhuma recuperação é realizada.'],

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
        ['ul', [
          '**Ferramenta**: não consome.',
          '**Consumíveis**: é perdido após o uso, pode conter quantidade de usos e ações diferentes.',
          '**Estação**: ação completa para instalar/tirar e para usar; é preciso ter a perícia atrelada para usar.'
        ]],
        ['h3', 'Bônus'],
        ['p', 'O bônus cedido se refere à recuperação do recurso; essa recuperação se aplica mesmo na falha do teste.']
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'acoes', title: 'Ações', group: 'Combate',
      blocks: [
        ['h2', 'Custo de ação'],
        ['p', 'Algumas ações básicas/genéricas já têm atrelada a elas uma ação necessária para sua execução.'],

        ['h3', 'Normais'],
        ['dl', [
          ['Ataque', 'Qualquer ataque: ação padrão.'],
          ['Deslocamento', 'Usar seu deslocamento: ação de movimento.'],
          ['Curar', 'Além dos componentes você também consome uma ação completa (veja em Cura).']
        ]],

        ['h3', 'Táticas'],
        ['dl', [
          ['Percepções', 'Analisar, procurar, investigar...: ação de movimento.'],
          ['Esconder-se', 'Necessita de alguma forma de enganação de sentidos, como fumaça, escuridão, silêncio, camuflagem etc. Em combate, se esconder a partir de algo ou alguém é uma ação padrão para poder fazer o teste de furtividade.'],
          ['Mirar', 'Engaje a mira; essa condição é contabilizada até o início do seu próximo turno: ação de movimento.'],
          ['Apoiar equipamento', 'Para se beneficiar de uma cobertura e poder atirar no campo de visão não coberto: ação completa. Para sair de uma cobertura é uma ação livre.'],
          ['Avançar', 'Você utiliza sua ação completa para se deslocar em linha reta o dobro do seu deslocamento. Ao final, pode realizar um ataque corpo a corpo como parte da ação; o ataque não ativa habilidades. Se houver no caminho uma criatura de tamanho igual ou menor que o seu, você faz a ação atropelar; também pode realizar uma manobra, substituindo o ataque corpo a corpo.'],
          ['Atropelar', 'Faça um teste de Manobra contra Resistência ou Reflexos do alvo. Se vencer, o alvo é arremessado 1,5 m fora do caminho à sua escolha e fica Caído. Se o alvo vencer usando Resistência, você perde o restante da ação e do movimento. Se usar Reflexos, você continua o movimento normalmente e o alvo não sofre os efeitos da manobra.']
        ]],

        ['h3', 'Equipamento'],
        ['dl', [
          ['Saquear', 'Ação completa.'],
          ['Vestir / Entrar na direção de veículos', 'Ação completa.'],
          ['Saque de...', ['Armas: ação de movimento.', 'Utilitárias/consumíveis: parte da ação principal.']],
          ['Usos de...', ['Consumíveis: ação padrão.', 'Utilitários: ação padrão.', 'Ferramentas: atrelados à ação.', 'Estações: toda uma cena (incluindo interlúdio, sem afetar sua recuperação).']]
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
        ['p', 'Se atirar em uma distância maior do que a distância efetiva de sua arma ou menor, recebe -3 no ataque a cada distância acima ou abaixo da efetiva da arma.'],
        ['p', 'Se atirar a um inimigo adjacente a você, o disparo recebe -2 no ataque.'],

        ['h2', 'Acuidade'],
        ['p', 'A distâncias muito longas, quando se tenta fazer um disparo, mesmo na distância efetiva de sua arma, a partir da distância média para a maioria dos seres, ou quando o alvo está sob cobertura, é necessário fazer um teste de sentidos (se for proficiente com a arma pode fazer usando mira com a ação de mirar) para poder tentar acertar o alvo, ou ignorar se usar a ação de mirar com uma mira ideal para a distância; se não, o disparo erra. A dificuldade do teste segue a seguinte tabela:'],
        ['table', ['Distância', 'CD'], [
          ['Médio', 'Cd 6'],
          ['Longo', 'Cd 12'],
          ['Muito longe', 'Cd 18'],
          ['Horizonte', 'imperceptível']
        ]],
        ['p', 'Se o alvo estiver sob cobertura, não total, a Cd do teste aumenta ainda mais.'],
        ['table', ['Cobertura', 'CD'], [
          ['Cobertura parcial', 'Cd +1'],
          ['Cobertura leve', 'Cd +2'],
          ['Cobertura média', 'Cd +4']
        ]],
        ['p', 'Ou o resultado do teste de furtividade do alvo (caso ele tenha feito a ação), o qual for maior.']
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'cadencia', title: 'Regras de Cadência', group: 'Combate',
      blocks: [
        ['p', 'A arma possui um número máximo de disparos por ação.'],

        ['h2', 'Sem proficiência'],
        ['p', 'Sem proficiência com o tipo de arma:'],
        ['ul', [
          'Um disparo: sem penalidades.',
          'A cada disparo adicional você soma na penalidade total cada número.',
          'O dano final recebe multiplicador igual ao número total de disparos contra cada alvo.'
        ]],
        ['example', 'Cadência 4 → o usuário dispara 3 vezes. Penalidade: –1 –2 –3 = –6 no ataque. Dano final ×3.'],

        ['h2', 'Com proficiência (Cadência perita)'],
        ['ul', [
          'Um disparo: sem penalidades.',
          'A cada disparo adicional você recebe uma penalidade igual à quantidade de projéteis disparados.',
          'O dano final recebe multiplicador igual ao número total de disparos contra cada alvo.'
        ]],
        ['example', 'Cadência 4 → o usuário dispara 3 vezes. Penalidade –3 no ataque. Dano final ×3.'],

        ['p', 'Essa penalidade é aplicada primeiramente no seu modificador fixo de ataque, afetando primeiro sua perícia e depois seu atributo.'],
        ['p', 'A cadência é contabilizada por rodada e por arma.']
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'condicoes-e-estados', title: 'Condições e Estados', group: 'Combate',
      blocks: [
        ['h2', 'Condições'],
        ['p', 'Condições são aplicadas diretamente ao personagem: como doenças, envenenamento, cegueira. Mas também podem ser benéficas: voraz, furioso (esse nem tanto), energizado, imune etc.'],
        ['p', 'Condições se acumulam entre si; uma condição pode anular uma oposta (a última aplicada sobressai à outra).'],
        ['h3', 'Instantâneas'],
        ['dl', [
          ['Zonzo', 'O afetado se move aleatoriamente para a direção decidida pelo mestre (se tentar se mover) e tem perdas na defesa.'],
          ['Atordoado', 'O afetado perde suas ações pelo turno e sua defesa se torna a defesa mínima. (Ser imune a efeitos mentais ignora essa condição.)'],
          ['Ofuscado', 'Você tem perdas em testes de percepção que precisem da visão, e de 1 a 2 em um d4 erra automaticamente ataques à distância; para ataque corpo a corpo se erra de 1 em um d4.']
        ]],
        ['h3', 'Passageiras'],
        ['dl', [
          ['Envenenamento', 'Recebe D“x” de dano químico ao início de seu turno, por uma quantidade de turnos igual à descrição do veneno.'],
          ['Necrose', 'Como veneno, mas o dano é necrótico. Se receber metade da sua vida máxima em dano necrótico, o efeito acaba mas o membro o qual a necrose infectou é perdido.']
        ]],

        ['h2', 'Estados'],
        ['p', 'Estados são referentes a: situação, local, preparação e/ou habilidade do operador que o deixe em um estado; esse estado pode ser benéfico ou maléfico. Em ambos, estados que concedem os mesmos bônus/agravos não se acumulam entre si; considere apenas o maior/menor bônus/agravo.'],
        ['p', 'Um benefício pode anular um malefício e vice-versa.'],
        ['h3', 'Benéficos'],
        ['dl', [
          ['Local benéfico', 'Estar em um terreno vantajoso para sua ação, como: lançar uma magia em um campo mágico, atirar estando em um terreno elevado em relação ao alvo, fazer seu dever de casa em uma biblioteca (não de última hora), domesticar um animal selvagem em um ambiente controlado. Você ganha uma vantagem no teste.'],
          ['Preparação', 'Você se preparou para aquele teste... Você gasta horas, dias, até meses para o grande teste final! Mentira, não adianta tanto preparo. Você gasta 3 PE a cada hora de preparo; você tem um ganho que pode ser usado quando o jogador quiser na cena a qual está se preparando, igual a cada hora gasta no preparo. Esse tempo não pode ser usado para descanso e os ganhos do preparo só podem ser gastos na cena que se preparou.']
        ]],
        ['h3', 'Malefícios'],
        ['dl', [
          ['Local maléfico', 'Como local (benefício), mas você tem uma desvantagem no teste!'],
          ['Terreno difícil', 'Qualquer terreno o qual não contenha forma de se deslocar facilmente: aguado, esburacado, destruído, trincheira etc. Você utiliza o dobro do seu deslocamento para se mover por ele.']
        ]],
        ['h3', 'Específicos'],
        ['dl', [
          ['No ar', 'Um alvo caindo sem ter um meio de voo (ou durante o voo, se não for dito o oposto) tem -3 em testes.'],
          ['Muito perto!', 'Atirar a um alvo adjacente a você com uma arma à distância impõe -2 no teste de ataque.'],
          ['Cego', 'O jogador deve escolher a direção que vai atacar e quem é seu possível alvo; depois jogue 1d4: em resultado 1-2 o ataque erra, independente do resultado do ataque.']
        ]]
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'raridade', title: 'Raridade', group: 'Equipamento',
      blocks: [
        ['p', 'A depender do dispositivo, as raridades gerais são:'],
        ['ul', ['Comum', 'Incomum', 'Rara', 'Epica', 'Lendária']],

        ['h2', 'Em Armas'],
        ['p', 'Define a qualidade da arma e a quantidade de modificações que ela suporta.'],
        ['table', ['Raridade', 'Mods', 'Propriedade'], [
          ['Comum', '1 slot de mod.', ''],
          ['Incomum', '1 slot de mod.', 'Contém propriedade.'],
          ['Rara', '2 slots de mod.', ''],
          ['Epica', '2 slots de mod.', 'Contém propriedade.'],
          ['Lendária', '3 slots de mod.', 'Contém propriedade.']
        ]],

        ['h2', 'Em Mods'],
        ['p', 'Definem seu custo de slots e o quão grande pode ser aquela alteração.'],
        ['table', ['Raridade', 'Descrição', 'Custo'], [
          ['Comum', 'Faz o básico.', 'Usa 1 slot'],
          ['Rara', 'Só não faz café.', 'Usa 2 slots'],
          ['Lendária', 'O céu é o limite (literalmente).', 'Usa 3 slots.']
        ]],

        ['h2', 'Em Armaduras'],
        ['p', 'Define a qualidade da proteção.'],
        ['dl', [
          ['Comum', 'normal?'],
          ['Incomum', 'Pode conter uma propriedade'],
          ['Rara', 'Tem mais armadura!'],
          ['Epica', 'Tem mais armadura! e uma propriedade.'],
          ['Lendária', 'Tem muita armadura! e umas propriedades aí…']
        ]]
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'mods-e-acessorios', title: 'Mods e Acessórios', group: 'Equipamento',
      blocks: [
        ['h2', 'Mods'],
        ['p', 'Mods são um método de adição ou modificação das regras originais das armas. Mods não concedem modificadores numéricos em geral, mas promovem habilidades únicas (ou não) para os equipamentos.'],
        ['h3', 'Ficha de mod'],
        ['fields', ['Mod (tipo)', 'Raridade', 'Efeito', 'Acessórios']],

        ['h2', 'Acessórios'],
        ['p', 'São implementados embutidos nos modificadores; caso contrário, a cada 1 espaço de Mods podem ser colocados 3 acessórios (50C a cada 3 acessórios).'],
        ['p', 'Em armas especiais, acessórios estão implementados nas propriedades.'],
        ['p', 'Cada um dos slots citados só pode conter um acessório desses.'],
        ['p', 'Acessórios de mais de um Mod não se acumulam (mas pode escolher quais dos 3 de cada Mod que desejar).'],

        ['h3', 'Melee'],
        ['fields', ['Ponta', 'Dorso', 'Empunhadura', 'Cabo']],

        ['h3', 'Armas de fogo'],
        ['h4', 'Miras'],
        ['dl', [
          ['Red dot/Holográfica', 'Ignora a dificuldade de percepção de média distância e cobertura parcial na mesma distância quando estiver mirando.'],
          ['Ampliação', 'Ignora a dificuldade de percepção de média distância a longa e cobertura parcial nas mesmas distâncias quando estiver mirando.'],
          ['Telescópica', 'Ignora a dificuldade de percepção de longa a muito longa distância e cobertura leve nas mesmas distâncias quando estiver mirando.']
        ]],
        ['h4', 'Bocal'],
        ['dl', [
          ['Silenciador', 'Pode se fazer teste de furtividade para disparos.'],
          ['Cano longo', 'Aumenta em uma categoria o alcance da arma.']
        ]],
        ['h4', 'Carregador'],
        ['dl', [
          ['Estendido', 'Chegue ao limite de munições do tiro de munição.'],
          ['Escalar', 'Aumenta de leve para médio, de médio para pesado, e vice-versa.'],
          ['Duplo', 'Se o carregador contiver no máximo 30 munições, se pode carregar usando ação bônus, uma vez sim, outra não.']
        ]],
        ['h4', 'Empunhadura'],
        ['dl', [
          ['Telêmetro', 'Contabiliza a distância que você está mirando em tempo real.'],
          ['Mira laser', 'Ignora a dificuldade de percepção de média distância e cobertura parcial na mesma distância. -1 em furtividade a curta a média distância.'],
          ['Lanterna', 'Pode ligar quando quiser; te concede uma fonte de luz frontal (cone) da arma de 9 metros à sua frente.'],
          ['Lanterna UV', 'Como lanterna, mas é uma luz UV que não serve para enxergar no escuro.'],
          ['Tripé', 'Use somente uma ação de movimento para apoiar a arma (em vez de ação completa).']
        ]]
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'recarga', title: 'Recarga', group: 'Equipamento',
      blocks: [
        ['p', 'A recarga consome ações dependendo do “peso” do pente ou do mecanismo de alimentação da arma.'],
        ['h2', 'Pente leve'],
        ['ul', ['Até 20 disparos.', 'Ação para recarregar: ação bônus ou padrão (se debilitado).', 'Cada pente utiliza ¼ espaço de carga.']],
        ['h2', 'Pente médio'],
        ['ul', ['Até 40 disparos.', 'Ação para recarregar: ação de movimento.', 'Cada pente utiliza ½ espaço de carga.']],
        ['h2', 'Pente pesado'],
        ['ul', ['Até 150 disparos.', 'Ação para recarregar: ação completa ou duas ações de movimento (uma na rodada atual, outra na próxima).', 'Cada pente utiliza 1 espaço de carga.']],
        ['h2', 'Recarga parcial'],
        ['p', 'Se a arma recarrega cartucho a cartucho: cada cartucho inserido = ação livre, até 2 por turno.'],
        ['p', 'Inserir mais de 2 exige outras ações (até 5 em bônus ou 10 com movimento/padrão). Cada 20 munições utiliza ¼ espaço de carga.'],
        ['h2', 'Superaquecimento'],
        ['p', 'A arma não tem um limite definido de capacidade de munição. Sua fonte é energética, mítica, anormal etc. Ou contém tantos disparos que aquece demais o mecanismo.'],
        ['p', 'Ação para recarregar: se superar um número definido por onde estaria a cadência da arma em disparos consecutivos em até 2 turnos (soma a quantidade de disparos da rodada atual e da rodada anterior), a arma superaquece e entra em resfriamento até o final do próximo turno, impossibilitando atacar com a arma durante esse tempo.'],
        ['p', 'Cada recarga ocupa 1 carga que dura a cena inteira; funciona até 2 cenas consecutivas, antes de precisar alocar munição novamente. Se recarrega a carga com sua ação completa, incluindo a bônus.']
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'empunhadura', title: 'Empunhadura', group: 'Equipamento',
      blocks: [
        ['p', 'A empunhadura define quantas mãos são necessárias para utilizar um item corretamente.'],
        ['p', 'Utilizar uma arma ou equipamento fora de sua empunhadura ideal torna o usuário **improficiente** com aquele item, mesmo que possua a proficiência correspondente.'],

        ['h2', 'Saque'],
        ['p', 'Itens com a empunhadura **Saque** podem ser sacados e manipulados rapidamente, sem interferir nas demais empunhaduras, desde que a ação realizada não envolva os itens já empunhados.'],
        ['p', 'Uma vez por turno, você pode sacar ou guardar **um** item com a empunhadura **Saque** sem gastar ações.'],
        ['p', 'Itens de **Uma Mão** e **Duas Mãos** não podem ser utilizados como itens de **Saque**.'],

        ['h2', 'Uma Mão'],
        ['p', 'Itens que ocupam completamente uma mão durante o uso.'],

        ['h2', 'Duas Mãos'],
        ['p', 'Itens que exigem o uso simultâneo das duas mãos. Utilizá-los de outra forma faz com que o personagem seja considerado **improficiente** com o item.']
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
        ['p', 'O tipo da arma define sua base, qual o mecanismo que gera os disparos ou seu modelo de construção. Eles concedem alguns benefícios por sua natureza.'],
        ['note', 'Sem proficiência em arma corpo a corpo', 'Sem proficiência com o tipo da arma corpo a corpo, você não recebe as propriedades básicas da arma (como a Espada com Precisão, o crítico que sangra ou atordoa e ser efetiva contra escudo ou blindagem). Ela continua causando o dano normal.'],

        ['card', 'Espada', [
          ['p', 'Uma espada pode usar o status de ataque básico com precisão; crítico causa sangramento (d6 de redução de PV; Cd para evitar 6 + precisão + luta contra teste de fortitude do alvo).'],
          ['kv', 'Média de criação', [['Carga', 'Máximo de 2.'], ['Dano', 'Cortante.']]]
        ]],
        ['card', 'Lança', [
          ['p', 'A cada carga ocupada pela lança, ela terá 1,5 metro de alcance.'],
          ['kv', 'Média de criação', [['Carga', 'Máximo de 3.'], ['Dano', 'Perfurante.']]]
        ]],
        ['card', 'Marreta', [
          ['p', 'Crítico causa atordoamento (Cd para ignorar 6 + corpo + luta contra fortitude). Efetivo contra blindagem.'],
          ['kv', 'Média de criação', [['Carga', 'Máximo de 3.'], ['Dano', 'Contundente.']]]
        ]],
        ['card', 'Machado', [
          ['p', 'Crítico causa sangramento (d6 de redução de PV; Cd para evitar 6 + luta contra fortitude). Efetivo contra escudos.'],
          ['kv', 'Média de criação', [['Carga', 'Máximo de 3.'], ['Dano', 'Contundente ou Cortante.']]]
        ]],
        ['card', 'Pistola', [
          ['p', 'O saque pode ser feito usando ação bônus, e guardar também; essas armas não recebem penalidade por atirar a inimigos adjacentes a você, e não recebem penalidade por disparar com uma só mão; permite ser usada com a habilidade akimbo.'],
          ['kv', 'Média de criação', [['Pente', 'Pente leve.'], ['Modo', 'semi, único e automático.'], ['Carga', 'Máximo de 1'], ['Alcance', 'Curto a Médio.']]],
          ['p', '*Variante:*'],
          ['p', 'Revólver. (Continue com as propriedades da pistola) Pode ser usada com a habilidade “Gatilho do velho mundo”.'],
          ['kv', 'Revólver', [['Pente', 'Pente parcial.'], ['Modo', 'Único e semi automático'], ['Alcance', 'Longo.']]],
          ['p', 'Não é necessário ser proficiente com pistolas para atirar com a regra de cadência proficiente.']
        ]],
        ['card', 'Espingarda', [
          ['p', 'Some metade de sua precisão como ataque extra quando o alvo estiver no alcance efetivo da arma.'],
          ['p', 'Se for proficiente com a arma, pode optar por usar o atributo corpo como atributo base.'],
          ['kv', 'Média de criação', [['Pente', 'Pente leve. Pente parcial. Pente médio.'], ['Modo', 'semi e único.'], ['Carga', 'Máximo de 3.'], ['Alcance', 'Curto a médio.']]],
          ['p', '*Variante:*'],
          ['p', 'Cano curto. (Continue com as propriedades da espingarda) O disparo dispersa do centro, acertando o primeiro alvo no raio das 3 linhas na direção a qual você atirou. O dano a todos é reduzido pela metade; não recebe penalidade por tiro a alvos adjacentes a você; o dano só normaliza se estiver adjacente ao alvo, e somente o alvo principal recebe o ataque.'],
          ['kv', 'Cano curto', [['Pente', 'Pente leve. Pente parcial.'], ['Modo', 'semi e único.'], ['Carga', 'Máximo de 2.'], ['Alcance', 'Curto.']]]
        ]],
        ['card', 'Rifle de precisão', [
          ['p', 'Pode usar uma ação completa para mirar em um único disparo: dobra os bônus de perícia do disparo.'],
          ['p', 'Se for proficiente com a arma, você pode fazer mais de um disparo; o bônus decai -1 por disparo adicional até zerar.'],
          ['kv', 'Média de criação', [['Pente', 'Pente médio. Pente parcial. Pente pesado.'], ['Modo', 'semi e único.'], ['Carga', 'Máximo de 3.'], ['Alcance', 'Médio, longo, muito longo.']]]
        ]],
        ['card', 'Fuzil', [
          ['p', 'Contém uma propriedade adicional dependendo do tipo de recarga, entre:'],
          ['dl', [
            ['Assalto (Leve)', 'Recarregue um pente médio de até 30 disparos com ação bônus; não receba penalidades por disparo em estado de terreno ou situação difícil.'],
            ['Batalha (Médio)', 'Penalidades quaisquer são diminuídas em -1 (incluindo cadência).'],
            ['Precisão (Pesado)', 'Pode conter pente pesado até 50 disparos contando como pente médio; se apoiada, não recebe penalidade de percepção até média distância.']
          ]],
          ['p', 'Se for proficiente com a arma, considere a recarga de pente médio com a ação bônus para fuzis.'],
          ['kv', 'Média de criação', [['Pente', 'Pente médio, pente pesado.'], ['Modo', 'Automático e semi automático.'], ['Carga', 'Máximo de 3.'], ['Alcance', 'Médio a longo.']]]
        ]],
        ['card', 'Metralhadora leve', [
          ['p', 'Se ela contiver um tripé, ou for apoiada em uma cobertura não total, onde você precisa usar sua ação completa para se apoiar, sua penalidade de cadência é diminuída em -1 a cada 5 disparos.'],
          ['p', 'Se for proficiente, a diminuição na cadência se torna a cada 3 disparos.'],
          ['kv', 'Média de criação', [['Pente', 'Pente médio. Pente pesado. Sobrecarga.'], ['Modo', 'semi e automático.'], ['Carga', 'Máximo de 5.'], ['Alcance', 'Médio a longo.']]]
        ]],
        ['card', 'Submetralhadora', [
          ['p', 'Você pode escolher usar o modificador de Essência para disparar, mas tem –1 de ataque mesmo no disparo único, que acumula com a penalidade da cadência. Se for proficiente com Submetralhadoras, podem ser usadas com a habilidade Akimbo, e não recebe a penalidade por atirar com essência.'],
          ['kv', 'Média de criação', [['Pente', 'Pente leve. Pente médio.'], ['Modo', 'semi e automático.'], ['Carga', 'Máximo de 2.'], ['Alcance', 'Médio a curto.']]]
        ]],
        ['card', 'Laser', [
          ['p', 'Uma rajada de energia contínua. Pode aplicar toda a sua cadência de uma só vez (não concede multiplicador nem penalidades); a cada turno precisa fazer um ataque com essa arma no mesmo alvo do ataque anterior. A cada turno consecutivo ganha +1 no ataque, consumindo em um a cadência usada inicialmente. Para esse benefício é necessário continuar acertando o alvo e não ser interrompido:'],
          ['p', 'Se for acertado por qualquer fonte durante esse período, terá de fazer um teste de resistência de Cd 8-10-12 respectivamente em: terreno normal, terreno difícil, em estado especial/voando.'],
          ['p', 'Caso contrário o benefício reinicia, mas a cadência gasta é perdida.'],
          ['p', 'Se for proficiente, a munição da cadência não é perdida se falhar no teste.'],
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
          ['p', 'Não possui penalidades / 1 Carga.'],
          ['table', ['Modelo genérico', 'Armadura', 'Extra'], [
            ['Comum', '5', ''],
            ['Incomum', '5', 'uma Propriedade'],
            ['Rara', '6', ''],
            ['Épica', '6', 'uma Propriedade'],
            ['Lendária', '7', 'uma grande Propriedade']
          ]]
        ], 3],
        ['card', 'Armadura Média', [
          ['p', 'Penalidade de **–1** (**–2** para personagens sem proficiência) / 3 cargas.'],
          ['table', ['Modelo genérico', 'Armadura', 'Penalidade', 'Extra'], [
            ['Comum', '6', '–1', ''],
            ['Incomum', '6', '–1', 'uma Propriedade'],
            ['Rara', '7', '–1', ''],
            ['Épica', '7', '–1', 'uma Propriedade'],
            ['Lendária', '9', '–1', 'uma grande Propriedade']
          ]]
        ], 3],
        ['card', 'Armadura Pesada', [
          ['p', 'Penalidade de **–2** (**–4** para personagens sem proficiência) / 5 cargas.'],
          ['table', ['Modelo genérico', 'Armadura', 'Penalidade', 'Extra'], [
            ['Comum', '8', '–2', ''],
            ['Incomum', '8', '–2', 'uma Propriedade'],
            ['Rara', '9', '–2', ''],
            ['Épica', '9', '–2', 'uma Propriedade'],
            ['Lendária', '11', '–2', 'uma grande Propriedade']
          ]]
        ], 3],

        ['h2', 'Penalidade de Armadura'],
        ['p', 'A penalidade da armadura é aplicada como um modificador negativo nas seguintes perícias:'],
        ['ul', ['Manha', 'Reflexos', 'Sentidos', 'Operações']],
        ['p', 'Caso o personagem seja **proficiente** com a categoria da armadura, sua penalidade é reduzida pela metade.'],
        ['p', 'O valor positivo da penalidade final também determina a **Carga** ocupada pela armadura quando transportada.'],

        ['h2', 'Outros'],
        ['p', 'A armadura básica de todos os seres é de 6.'],
        ['p', 'Um personagem só pode equipar **uma armadura por vez**.'],

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
        ['fields', ['Modelo/Fabricante', 'Capacidade Cibernética', 'Raridade']],

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

        ['h2', 'Ficha de Próteses e Módulos'],
        ['fields', ['Modelo (Prótese ou Módulo)', 'Tipo / CC', 'Efeito']]
      ]
    },

    /* ------------------------------------------------------------ 13 */
    {
      id: 'origens', title: 'Origens', group: 'Personagem',
      blocks: [
        ['card', 'Exilado Urbano', [
          ['p', 'Vivendo nas ruínas das cidades corporativas, sobreviveu nas sombras — roubando energia, vendendo informações e lidando com o submundo.'],
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
            '1 armadura leve 2 com núcleo simples +2;',
            '1 kit de manutenção de robô (2 cargas, 3d6 cura blindagem, 1h de trabalho, 1/4 Carga);',
            '1 kit de primeiros socorros (2d6 cura PVs, 1/4 Carga).'
          ]]
        ]],
        ['card', 'Engenheiro', [
          ['p', 'Ex-funcionário de megacorporação ou catador com cérebro afiado.'],
          ['p', 'Itens iniciais:'],
          ['ul', [
            '1 ferramenta multifunção (permite utilizar a perícia de tecnologia);',
            '1 pistola básica ou rifle (3 slots de munição);',
            '1 ano Chirlez backup (20 slots digitais de itens);',
            '1 vestimenta de proteção leve (armadura leve +2).'
          ]]
        ]]
      ]
    },

    /* ------------------------------------------------------------ 14 */
    {
      id: 'especimes', title: 'Espécimes', group: 'Personagem',
      blocks: [
        ['card', 'Humano', [
          ['p', 'Nada de especial, talvez sua experiência passada: tome 3 Up points de início!'],
          ['p', 'Opcional — Experiência mundana:'],
          ['table', ['Idade', 'Ganho'], [
            ['17 a 25 anos', '3 Up points'],
            ['26 a 30 anos', '4 Up points e 1 Perda.'],
            ['31 a 40 anos', '5 Up points e 2 Perdas.'],
            ['41 a 60 anos', '6 Up points e 3 Perdas.'],
            ['Mais que isso...', 'Até 10 Up points e um valor igual de Perdas!']
          ]]
        ]],
        ['card', 'Robô', [
          ['p', 'Meio que é… feito de lata né não?'],
          ['h4', 'Núcleo'],
          ['p', 'Você contém núcleo! Você depende do mesmo acoplado a você para sobreviver, você contém um núcleo +2 comum desde o início do jogo, e seus PV são convertidos para blindagem e os negativos contam como Shield!'],
          ['h4', 'Engenharia'],
          ['p', 'Como um bom pedaço de lata, você não pode equipar itens, e sim os acoplar em seu corpo. Isso vale para armaduras e módulos. Leva ao menos 1 hora para acoplar; se acoplado a você, você tem carga cibernética adicional igual a +1 a cada +2 na carga concedida pelo núcleo.'],
          ['h4', 'Não vivo'],
          ['p', 'Você é lata, lata não é afetada por coisas biológicas, nem precisa descansar, só colocar na tomada! Não recupera PVs por descanso nem curas, mas pode ser consertado com testes de tecnologia e um kit de ferramentas adequado (demora 1 descanso longe de serviço; a perícia de tecnologia recupera blindagem igual o resultado no dado.)']
        ]],
        ['card', 'Android', [
          ['p', 'Você é um robô, só que humanoide...'],
          ['h4', 'Engenharia'],
          ['p', 'Como um bom pedaço de lata, você não pode equipar itens, e sim acoplar em seu corpo. Isso vale para armas e armaduras: se acopladas, elas passam a ocupar sua carga cibernética em vez da capacidade de carga. Leva ao menos 1 hora para acoplar; se acoplado a você, você tem carga cibernética adicional igual a +1 a cada +2 na carga concedida pelo núcleo.'],
          ['p', 'Próteses para você são peças, e você não precisa de uma prótese para colocar os módulos.'],
          ['h4', 'Núcleo'],
          ['p', 'Você contém núcleo! Você depende do mesmo acoplado a você para sobreviver, você contém um núcleo +2 comum desde o início do jogo, e seus PV são convertidos para blindagem e os negativos contam como Shield!'],
          ['h4', 'Humanidade'],
          ['p', 'Você pode fazer testes para resistir a efeitos de PE se tiver CD, e metade da sua blindagem pode ser regenerada como se fossem PVs.'],
          ['p', 'Efeitos de PE causam atordoamento automático em seres elétricos ou eletrônicos e desativam shields; com a Humanidade, o Android faz o teste quando houver CD.']
        ]]
      ]
    },

    /* ------------------------------------------------------------ 15 */
    {
      id: 'habilidades', title: 'Habilidades', group: 'Personagem',
      blocks: [
        ['card', 'Esquiva', [
          ['kv', '', [['Custo', '1 Up point']]],
          ['p', 'Use precisão como atributo básico, e reflexo como perícia para os testes de defesa.'],
          ['p', 'Pode gastar +1 Up point para contar na defesa básica também.']
        ]],
        ['card', 'Regeneração', [
          ['kv', '', [['Custo', '2 Up points']]],
          ['p', 'Se for uma criatura biológica. Recupere 3 PVs por turno.'],
          ['p', 'Se caído, pode recobrar a consciência quando recuperar todos os PV.'],
          ['p', 'A cada Up point utilizado para essa habilidade acima do primeiro, aumente em +1 a recuperação de PVs.']
        ]],
        ['card', 'Transformação', [
          ['p', 'Utilizando uma ação, você pode assumir uma nova forma, criando uma transformação, realocando seus Up Points livremente. Durante a transformação, os itens pertencentes à forma original tornam-se inutilizáveis.'],
          ['p', 'Para se transformar mais de uma vez no mesmo dia, é necessário gastar 1 Ponto de Ação a cada transformação adicional.'],
          ['p', 'Os recursos da nova forma não são diferenciados dos da forma original. Isso significa que, ao assumir a transformação, você passa a utilizar os valores atuais de seus recursos, aplicando apenas os ajustes positivos ou negativos próprios da nova forma. Ao retornar à forma original, os recursos permanecem nas quantidades em que se encontravam no momento da reversão. Recursos excedentes não são convertidos em recursos adicionais, e recursos que eram maiores antes da transformação voltam a ser contabilizados normalmente; caso tenham sido gastos durante a transformação, esse consumo é refletido nos pontos realocados.'],
          ['p', 'A nova forma deve manter a mesma quantidade de pontos em desvantagens da forma original, e o custo deste poder permanece atrelado à forma transformada. Quando seus Pontos de Vida forem reduzidos a zero, o jogador pode escolher entre manter a forma atual ou retornar à forma original. Cada Up Point investido corresponde a uma transformação distinta.'],
          ['p', '**Transformação de 2 UP.** Ao adquirir uma transformação de custo 2 Up Points, os itens da forma original permanecem utilizáveis. Nesse caso, não é necessário manter a mesma quantidade de perdas, embora também não haja ganho de pontos adicionais por isso. Além disso, os recursos passam a ser diferenciados entre a forma original e a forma transformada.'],
          ['p', '**Melhorias**'],
          ['p', '**Única (1 UP cada):** você escolhe uma só transformação e monta a ficha dela. Não pode se transformar em nada além dela. Funciona como a transformação de 2 UP, pelo preço de 1 UP. Cada transformação escolhida assim custa 1 UP.'],
          ['p', '**Mutável (1 UP):** as transformações têm seus custos em UP diminuídos pela metade, e pode se transformar mais vezes ao dia usando 4 PE (ao invés de 1 PA); porém, os valores contabilizados na transformação não mudam e agora contabilizam essa habilidade. Pré-requisito: Transformação (1 ou 2).']
        ]],
        ['card', 'Luta', [
          ['kv', '', [['Custo', '1 Up point (+1 por Ataque extra)']]],
          ['p', 'O principal poder marcial: faz quem luta corpo a corpo competir em dano com as armas de fogo.'],
          ['p', 'Seus ataques desarmados contam como uma arma contundente para todos os efeitos, sem precisar de luvas ou armas desse gênero, e você é proficiente com eles.'],
          ['p', '**Ataques múltiplos.** Por rodada, você tem uma quantidade de ataques igual ao seu poder (os Up points investidos em Luta) + 1. Eles funcionam como a cadência de uma arma de fogo: com uma arma corpo a corpo da qual é proficiente (ou desarmado), use a cadência perita; sem proficiência, a penalidade de cadência comum. O dano de cada alvo é multiplicado pelos golpes nele.'],
          ['example', 'Luta com 1 Up point → 2 ataques por rodada. Desarmado, dois golpes no mesmo alvo: –2 no ataque, dano ×2.'],
          ['p', 'Em vez de golpear, você pode gastar esses ataques em efeitos marciais. Os ataques são contados por rodada e não acumulam.'],
          ['table', ['Efeito', 'Custo', 'O que faz'], LUTA_MANOBRAS],
          ['p', '**Ataque extra (1 Up point cada):** +1 ataque por rodada.'],
          ['note', 'Técnico', 'Luta não combina direto com tecnomagia: ela se refere à ação de atacar, e não dá para atacar e conjurar ao mesmo tempo. Para complementar os ataques com tecnomancia, é preciso um poder cuja descrição diga que “pode complementar seus ataques à distância e marciais com técnicas de tecnomancia”.']
        ]],
        ['card', 'Akimbo', [
          ['p', 'Você pode empunhar pistolas ou submetralhadoras uma em cada mão (ou uma de cada, seja irado!). O tempo de recarga aumenta em uma categoria (ação livre para bônus, bônus para movimento, movimento para ação padrão, ação padrão para ação completa.)'],
          ['p', 'Porém, pode mirar em um único alvo com ambas as armas ou escolher até dois alvos para atirar; você usa a mesma ação para atacar mas faz um teste de ataque com cada arma, que aplicam dano separadamente.']
        ]],
        ['card', 'Gatilho do velho mundo', [
          ['p', 'Com um revólver de disparos único, você força a arma a obter uma cadência igual a 1 + metade de sua precisão, arredondando para cima. O primeiro disparo não contabiliza na penalidade de cadência.'],
          ['p', 'Você pode escolher múltiplos alvos, com base em quantos disparos irão contra cada alvo; o ataque se mantém o mesmo, com a penalidade totalitária.'],
          ['p', 'Você precisa de outra mão livre para usar essa habilidade.']
        ]]
      ]
    },

    /* ------------------------------------------------------------ */
    {
      id: 'ficha', title: 'Ficha', group: 'Personagem',
      blocks: [
        ['h2', 'Modelo de ficha'],
        ['fields', ['Nome', 'Idade', 'Altura e peso', 'Sexo', 'Origem', 'Espécime', 'Xp: 0', 'Up points']],

        ['h2', 'Status'],
        ['fields', ['Corpo', 'Precisão', 'Essência']],

        ['h2', 'Recursos'],
        ['fields', ['Pv: 5 + (Corpo × 5)', 'Escudo', 'Blindagem', 'Pe: 5 + (Essência × 5)', 'Pa = Precisão (mínimo 1)']],

        ['h2', 'Perícias'],
        ['h3', 'Perícias de Corpo'],
        ['fields', ['Luta', 'Resistência', 'Atletismo', 'Fortitude']],
        ['h3', 'Perícias de Precisão'],
        ['fields', ['Pontaria (Mira)', 'Tecnologia', 'Iniciativa', 'Manha', 'Pilotagem', 'Intelecto', 'Reflexos', 'Ofício']],
        ['h3', 'Perícias de Essência'],
        ['fields', ['Operações', 'Sentidos', 'Vontade', 'Intimidação', 'Diplomacia', 'Enganação']],

        ['h2', 'Proficiências (4 iniciais)'],
        ['fields', ['—', '—', '—', '—']],

        ['h2', 'Ataques'],
        ['formula', '', '2d6 + atributo base + perícia do ataque = ataque'],

        ['h2', 'Defesa'],
        ['formula', '', '2d6 + Corpo + Resistência = Defesa'],
        ['h3', 'Defesa mínima'],
        ['formula', '', 'Armadura + modificador de Corpo + Resistência'],

        ['h2', 'Núcleo'],
        ['formula', 'Capacidade cibernética', '(núcleo) + corpo'],
        ['p', 'Bônus somente para módulos = essência.'],

        ['h2', 'Poderes e Habilidades'],
        ['p', 'Poderes e habilidades ficam listados na ficha, cada um com o seu custo em UP Points.'],

        ['h2', 'Inventário'],
        ['formula', 'Carga', '2 + (Corpo × 5) + Precisão + (Essência × 2)']
      ]
    }
  ]
};