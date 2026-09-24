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
window.VORTEX_REGRAS = {
  groups: ['Fundamentos', 'Combate', 'Equipamento', 'Personagem'],
  chapters: [

    /* ------------------------------------------------------------ 1 */
    {
      id: 'testes-e-dados', title: 'Testes e Dados', group: 'Fundamentos',
      blocks: [
        ['h2', 'Rolagens'],
        ['formula', 'Todos os testes usam', '2d6 + Atributo + Perícia'],
        ['p', 'O número de dados pode aumentar:'],
        ['ul', [
          '3º dado: concedido por qualquer fonte.',
          '4º dado: concedido pelo mestre/sistema.',
          'Limite total: 4d6.'
        ]],

        ['h2', 'Críticos'],
        ['dl', [
          ['Em ataques', 'cada dado de resultado 6 adiciona novamente o valor do atributo usado no ataque.'],
          ['Em defesa da cena', 'cada dado de resultado 6 adiciona novamente o valor do atributo usado na defesa.']
        ]]
      ]
    },

    /* ------------------------------------------------------------ 2 */
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

        ['h3', 'Pontos de Esforço (PE)'],
        ['ul', ['PE mínimo: 5', 'PE total: 5 + (Essência × 5)']],
        ['p', 'Uso: Representa esforço físico, tecnomancia, habilidades que exigem energia interior.'],

        ['h3', 'Pontos de Ação (PA)'],
        ['ul', ['PA total: igual ao valor de Precisão.']],
        ['example', 'Precisão 3 = 3 PA.'],
        ['p', 'Uso: habilidades que exigem precisão, cálculo ou processamento tático. Ações especiais definidas pelo mestre ou pelos módulos/armas.'],

        ['h2', 'Recuperação'],
        ['p', 'Recuperar totalmente após descanso adequado.'],
        ['dl', [
          ['Curta de 1 a 4 horas', 'Recupera metade dos PVs, dividindo o recuperado a cada descanso curto seguinte. Volta ao normal em um descanso longo.'],
          ['Longa a partir de 8 horas', 'Recupera todos os recursos.']
        ]]
      ]
    },

    /* ------------------------------------------------------------ 3 */
    {
      id: 'morte-e-agonia', title: 'Morte e Agonia', group: 'Fundamentos',
      blocks: [
        ['p', 'Se o personagem chegar a 0 PV, ele cai agonizando.'],
        ['p', 'Ele só morre quando atinge –PV Máximo.'],
        ['example', 'PV Máx 20 → morre ao chegar em –20.'],

        ['h2', 'Teste de Sobrevivência'],
        ['p', 'Enquanto estiver em 0 ou negativo, faça um teste com CD inicial 6, aumentando em +1 a cada nova tentativa no mesmo dia.'],
        ['ul', [
          'Se falhar: recebe 1 de dano negativo, o dano aumenta +1 a cada nova falha no mesmo dia.',
          'Se passar: estabiliza, mas permanece inconsciente até ser reanimado com no mínimo o tempo de um descanso longo ou fonte médica.'
        ]]
      ]
    },

    /* ------------------------------------------------------------ 4 */
    {
      id: 'pericias', title: 'Perícias', group: 'Fundamentos',
      blocks: [
        ['p', 'As perícias fornecem bônus de +1 a +3.'],
        ['p', 'Um teste de perícia é a soma do status atrelado a ela + o bônus comprado pelo jogar.'],

        ['h2', 'Distribuição Inicial'],
        ['ul', ['2 perícias +2', '1 perícia +1']],

        ['h2', 'Progressão'],
        ['ul', [
          'Limite de +3 por perícia.',
          'Cada ponto investido concede +2 pontos livres para distribuir entre as perícias.'
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
        ]]
      ]
    },

    /* ------------------------------------------------------------ 5 */
    {
      id: 'combate', title: 'Combate', group: 'Combate',
      blocks: [
        ['p', 'Ações por turno: ação padrão, ação de movimento, ação bônus, reação, ação livre.'],
        ['p', 'Deslocamento padrão: 9 metros.'],

        ['h2', 'Ataques'],
        ['table', ['Forma', 'Teste'], [
          ['Corpo a corpo', '2d6 + Corpo + Luta'],
          ['À distância', '2d6 + Precisão + Mira'],
          ['Tecnológicos', '2d6 + Essência + Operações']
        ]],
        ['p', 'Crítico no ataque: cada dado que mostrar 6 adiciona novamente o valor da perícia usada no ataque.']
      ]
    },

    /* ------------------------------------------------------------ 6 */
    {
      id: 'armas', title: 'Armas', group: 'Equipamento',
      blocks: [
        ['h2', 'Modelo de Armas'],
        ['h3', 'Melee'],
        ['fields', ['Tipo', 'Modelo/ Fabricante', 'Raridade', 'Dano', 'Carga', 'Modificador']],
        ['h3', 'Armas de fogo'],
        ['fields', ['Tipo', 'Modelo/Fabricante', 'Raridade', 'Dano', 'Cadência/modo', 'Pente/Recarga', 'Alcance efetivo', 'Carga', 'Modificador']],

        ['h2', 'Tipo'],
        ['p', 'O tipo da arma define sua base, qual o mecanismo que gera os disparos ou seu modelo de construção. Eles concedem alguns benefícios por sua natureza:'],

        ['card', 'Pistola', [
          ['p', 'O saque pode ser feito usando ação livre, e guardá-la também, essas armas não recebem penalidade por atirar a inimigos adjacentes a você, e não recebe penalidade por disparar com uma só mão, permite ser usada com habilidade akimbo.'],
          ['kv', 'Média de criação', [['Pente', 'Pente leve.'], ['Modo', 'semi, único e automático.'], ['Carga', 'Máximo de 1'], ['Alcance', 'Curto a Médio.']]],
          ['p', '*Variante:*'],
          ['p', 'Revólver. (Continue com as propriedades da pistola) Pode ser usada com a habilidade “Gatilho do velho mundo.”.'],
          ['kv', 'Revólver', [['Pente', 'Pente parcial.'], ['Modo', 'Único e semi automático'], ['Alcance', 'Longo.']]]
        ]],
        ['card', 'Espingarda', [
          ['p', 'Some metade de seu corpo ou precisão no ataque quando o alvo estiver no alcance efetivo da arma.'],
          ['kv', 'Média de criação', [['Pente', 'Pente leve. Pente parcial. Pente médio.'], ['Modo', 'semi e único.'], ['Carga', 'Máximo de 3.'], ['Alcance', 'Curto a médio.']]],
          ['p', '*Variante:*'],
          ['p', 'Cano curto. (Continue com as propriedades da espingarda) O disparo dispensa do centro, acertando o primeiro alvo no raio das 3 linhas na direção até que você atira. O dano a todos é reduzido pela metade, não recebe penalidade por tiro adjacente a você.'],
          ['kv', 'Cano curto', [['Pente', 'Pente leve. Pente parcial.'], ['Modo', 'semi e único.'], ['Carga', 'Máximo de 2.'], ['Alcance', 'Curto.']]]
        ]],
        ['card', 'Rifle', [
          ['p', 'Se o Rifle contiver luneta telescópica, pode usar uma ação completa em um disparo único para dobrar os bônus de perícia do disparo (pode ultrapassar o +3 da perícia padrão.)']
        ]],
        ['card', 'Submetralhadora', [
          ['p', 'Você pode escolher usar o modificador de Essência para disparar, mas tem –1 de ataque mesmo no disparo único, que acumula com a penalidade da cadência. Submetralhadoras podem ser usadas com a habilidade Akimbo.'],
          ['kv', 'Média de criação', [['Pente', 'Pente leve. Pente médio.'], ['Modo', 'semi e automático.'], ['Carga', 'Máximo de 2.'], ['Alcance', 'Médio a baixo.']]]
        ]],
        ['card', 'Metralhadora', [
          ['p', 'Se ela contiver um tripé, ou for apoiada em uma cobertura não total, onde você precisa usar sua ação completa para se apoiar, sua penalidade de cadência é diminuída em -1 a cada 3 disparos.'],
          ['kv', 'Média de criação', [['Pente', 'Pente médio. Pente pesado. Sobrecarga.'], ['Modo', 'semi e automático.'], ['Carga', 'Máximo de 5.'], ['Alcance', 'Médio a longo.']]]
        ]],
        ['card', 'Laser', [
          ['p', 'Uma rajada de energia continua. Pode aplicar toda a sua cadência de uma só vez, a cada turno precisa fazer um ataque com essa arma no mesmo alvo do ataque anterior. A cada turno consecutivo ganha +1 no ataque, consumindo a cadência usada inicialmente. Para esse benefício é necessário continuar acertando o alvo e não ser interrompido:'],
          ['p', 'Se for acertado por qualquer fonte durante esse período, terá de fazer um teste de fortitude de Cd 8-10-12 respectivamente em: terreno normal, terreno difícil, em estado especial/voando.'],
          ['p', 'Caso contrário o benefício reinicia mas a cadência gasta prossegue.'],
          ['kv', 'Média de criação', [['Pente', 'Pente médio, Sobrecarga.'], ['Modo', 'contínuo.'], ['Carga', 'Máximo de 3.'], ['Alcance', 'Médio a longo.']]]
        ]],

        ['h2', 'Descrição de Alcance'],
        ['table', ['Distância', 'Alcance'], [
          ['Curto', '0 a 10m'],
          ['Médio', '10m a 100m'],
          ['Longo', '100m a 1000m'],
          ['Muito longo', '1000m a 5000m'],
          ['Horizonte', '5000 a 10.000m']
        ]],
        ['p', 'Se atirar em uma distância maior do que a distância efetiva de sua arma ou menor, recebe -3 no ataque a cada distância acima ou abaixo da efetiva da arma.'],
        ['p', 'Se atirar a um inimigo adjacente a você. O disparo recebe -3 no ataque.'],

        ['h2', 'Distância de visão'],
        ['p', 'A distâncias muito longas, quando se tenta fazer um disparo, mesmo na distância efetiva de sua arma, a partir da distância média para maioria dos seres, ou quando o alvo está sob cobertura, é necessário fazer um teste de percepção para poder tentar acertar o alvo, senão o disparo era, a dificuldade do teste segue a seguinte tabela:'],
        ['table', ['Distância', 'CD'], [
          ['Médio', 'Cd 8'],
          ['Longo', 'Cd 12'],
          ['Muito longe', 'Cd 16'],
          ['Horizonte', 'imperceptível']
        ]],
        ['p', 'Se o alvo estiver sob cobertura, não total, a Cd do teste aumenta ainda mais.'],
        ['table', ['Cobertura', 'CD'], [
          ['Cobertura parcial', 'Cd +1'],
          ['Cobertura leve', 'Cd +2'],
          ['Cobertura média', 'Cd + 4']
        ]],
        ['p', 'Ou o resultado do teste de furtividade do alvo (caso ele tenha feito a ação), o qual for maior.'],

        ['h2', 'Regras de Cadência'],
        ['p', 'A arma possui um número máximo de disparos por ação.'],
        ['ul', [
          'Um disparo sem penalidade.',
          'A cada disparo adicional você recebe uma penalidade igual à quantidade de projéteis disparados.',
          'O dano final recebe multiplicador igual ao número total de disparos contra cada alvo.'
        ]],
        ['example', 'Cadência 4 → o usuário dispara 3 vezes. Penalidade –3 no ataque. Dano final ×3.'],

        ['h2', 'Acessórios'],
        ['p', 'São implementados embutidos nos modificadores, caso contrário a cada 1 espaço de Mods, podem ser colocados 3 acessórios.'],
        ['p', 'Em armas especiais, acessórios estão implementados nas propriedades. Cada um dos slots citados só pode conter um acessório desses.'],
        ['h3', 'Melee'],
        ['fields', ['Fio', 'Guardas', 'Cabo']],
        ['h3', 'Armas de fogo'],
        ['h4', 'Miras'],
        ['dl', [
          ['Red dot/Holográfica', 'Ignora a dificuldade de percepção de média distância e cobertura parcial na mesma distância.'],
          ['Ampliação', 'Ignora a dificuldade de percepção de média distância a longa e cobertura parcial nas mesmas distâncias.'],
          ['Telescópica', 'Ignora a dificuldade de percepção de longa, a muito longa distância e cobertura leve nas mesmas distâncias.']
        ]],
        ['h4', 'Bocal'],
        ['dl', [
          ['Silenciador', 'Pode se fazer teste de furtividade para disparos.'],
          ['Tripé', 'Use somente uma ação de movimento para apoiar a arma.']
        ]],
        ['h4', 'Carregador'],
        ['dl', [
          ['Estendido', 'Chegue ao limite de munições do tiro de munição.'],
          ['Escalar', 'Aumenta de leve para médio, de médio para pesado, e vice versa.'],
          ['Duplo', 'Se o carregador contiver no máximo 30 munições, se pode carregar usando ação bônus, uma vez sim, outra não.']
        ]],
        ['h4', 'Guarda'],
        ['dl', [
          ['Telêmetro', 'Contabiliza a distância que você está mirando em tempo real.'],
          ['Mira laser', 'Ignora a dificuldade de percepção de média distância e cobertura parcial na mesma distância. -1 em furtividade a curta a média distância.'],
          ['Lanterna', 'Pode ligar quando quiser, te concede uma fonte de luz frontal da arma de 9 metros à sua frente.'],
          ['Lanterna UV', 'Como lanterna, mas é uma luz UV que não serve para enxergar no escuro.']
        ]],

        ['h2', 'Recarga'],
        ['p', 'A recarga consome ações dependendo do “peso” do pente ou do mecanismo de alimentação da arma.'],
        ['h3', 'Pente leve'],
        ['ul', ['Até 20 disparos.', 'Ação para recarregar: ação bônus ou padrão (se debilitado).', 'Cada pente utiliza ¼ espaço de carga.']],
        ['h3', 'Pente médio'],
        ['ul', ['Até 50 disparos.', 'Ação para recarregar: ação de movimento.', 'Cada pente utiliza ½ espaço de carga.']],
        ['h3', 'Pente pesado'],
        ['ul', ['Até 150 disparos.', 'Ação para recarregar: ação completa ou duas ações de movimento (uma na rodada atual, outra na próxima).', 'Cada pente utiliza 1 espaço de carga.']],
        ['h3', 'Recarga parcial'],
        ['p', 'Se a arma recarrega cartucho a cartucho: cada cartucho inserido = ação livre, até 2 por turno.'],
        ['p', 'Inserir mais de 2 exige outras ações (até 5 em bônus ou 10 com movimento/padrão). Cada 20 munições utiliza ¼ espaço de carga'],
        ['h3', 'Superaquecimento'],
        ['p', 'A arma não tem um limite indefinido de capacidade de munição. Sua fonte é energética, mítica, anormal e etc. Ou contém tantos disparos que aquece demais o mecanismo.'],
        ['p', 'Ação para recarregar: Se superar um número definido pela arma de disparos consecutivos em até 2 turnos (soma a quantidade de disparos da rodada atual e da rodada anterior), se feito, a arma superaquece e entra em resfriamento até o final do próximo turno. Cada recarga ocupa 1 carga que dura a cena inteira, funciona até 2 cenas consecutivas, antes de precisar locar munição novamente. Se recarrega a carga com sua ação completa, incluindo a bônus.']
      ]
    },

    /* ------------------------------------------------------------ 7 */
    {
      id: 'raridade', title: 'Raridade', group: 'Equipamento',
      blocks: [
        ['p', 'A depender do dispositivo às raridade gerais são:'],
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
        ['h3', 'Ficha do Mod de armas'],
        ['fields', ['Mod (tipo)', 'Raridade', 'Efeito', 'Acessórios']],

        ['h2', 'Em Mods'],
        ['p', 'Definem seu custo de slots e o quão grande pode ser aquela alteração.'],
        ['table', ['Raridade', 'Descrição', 'Custo'], [
          ['Comum', 'Faz o básico.', 'Usa 1 slot'],
          ['Rara', 'Só não faz café.', 'Usa 2 slots'],
          ['Lendária', 'o céu é o limite (literalmente).', 'Usa 3 slots.']
        ]],

        ['h2', 'Em Armaduras'],
        ['p', 'Define a qualidade da proteção.'],
        ['dl', [
          ['Comum', 'normal?'],
          ['Incomum', 'Pode conter uma propriedade'],
          ['Rara', 'Tem mais armadura!'],
          ['Epica', 'Tem mais armadura! e uma propriedade.'],
          ['Lendária', 'Tem muita armadura! e umas propriedades ai…']
        ]]
      ]
    },

    /* ------------------------------------------------------------ 8 */
    {
      id: 'defesa-e-danos', title: 'Defesa e Danos', group: 'Combate',
      blocks: [
        ['h2', 'Defesa'],
        ['formula', 'A cada início de cena', '2d6 + Corpo + Resistência = Defesa'],
        ['p', 'Se o teste ficar abaixo disso, usa-se a defesa mínima.'],
        ['h3', 'Defesa mínima'],
        ['formula', '', 'Armadura + Corpo + Resistência'],
        ['p', 'Crítico na defesa: adicione novamente o valor do status usado.'],

        ['h2', 'Danos'],
        ['formula', '', 'Fonte do dano = Ataque – Defesa do alvo'],
        ['p', 'Se o resultado for zero ou negativo, não há dano.'],

        ['h2', 'Fraquezas e Eficiência de Dano'],
        ['p', 'Ataques eficientes causam dano dobrado após o cálculo normal.'],

        ['h2', 'Tipos de PV'],
        ['card', 'Pontos de Vida (PV)', [
          ['p', 'Representam carne, sangue, tecido vivo.'],
          ['kv', '', [['Fraquezas', 'Fogo, Radioativo (dano dobrado).'], ['Resistência', 'dano elétrico.']]]
        ], 3],
        ['card', 'Escudo (Energia)', [
          ['p', 'Campo energético.'],
          ['kv', '', [['Fraquezas', 'Elétrico (dano dobrado).'], ['Resistência', 'Fogo.']]]
        ], 3],
        ['card', 'Blindagem (Metal/Ferro)', [
          ['p', 'Superfícies endurecidas.'],
          ['kv', '', [['Fraquezas', 'Ácido, Corrosivo (dano dobrado).'], ['Resistência', 'Elétrico e Fogo.']]]
        ], 3]
      ]
    },

    /* ------------------------------------------------------------ 9 */
    {
      id: 'armaduras', title: 'Armaduras', group: 'Equipamento',
      blocks: [
        ['p', 'Podem conter ou não um Núcleo.'],
        ['p', 'Pode se acoplar órtese a ele, que funcionam igualmente a próteses, com o limite idêntico, porém, para colocar em outra armadura são um descanso longo de trabalho, e se a roupa for tirada de você, você perde o benefício da órtese.'],

        ['h2', 'Tipos'],
        ['table', ['Tipo', 'Armadura básica', 'Penalidade'], [
          ['Leve', '4 de armadura', '—'],
          ['Média', '5 de armadura', '–1'],
          ['Pesada', '6 de armadura', '–2']
        ]],
        ['p', 'Penalidade de armadura: aplica –X nas perícias Manha, Reflexos e Sentidos. O positivo da penalidade +1 é a carga que ela ocupa.'],
        ['p', 'Não conta na carga quando equipada.'],
        ['p', 'Somente uma armadura pode ser equipada por vez.'],

        ['h2', 'Ficha de Armadura'],
        ['fields', ['Modelo/Fabricante', 'Núcleo (sim/não)', 'Armadura', 'Penalidade', 'Carga', 'Raridade']]
      ]
    },

    /* ------------------------------------------------------------ 10 */
    {
      id: 'nucleo-proteses-modulos', title: 'Núcleo, Próteses e Módulos', group: 'Equipamento',
      blocks: [
        ['h2', 'Núcleo'],
        ['p', 'Sustenta sistemas de próteses e módulos.'],
        ['p', 'Sem ele, próteses funcionam apenas como órgãos naturais e módulos permanecem inativos.'],
        ['p', 'Um núcleo implantado, em um corpo ou em uma armadura, não conta na carga máxima; todo núcleo pesa 1 carga.'],
        ['h3', 'Ficha de Núcleo'],
        ['fields', ['Modelo/Fabricante', 'Capacidade Cibernética', 'Raridade']],

        ['h2', 'Sistema de Próteses e Módulos'],
        ['p', 'Próteses substituem partes do corpo com benefícios mecânicos.'],
        ['p', 'Módulos são addons, geralmente passivos, dependentes de próteses. O Núcleo permite operá-los.'],
        ['p', 'Cada personagem só pode possuir um único Núcleo.'],
        ['formula', '', 'Limite total de próteses = Núcleo + Corpo'],
        ['formula', '', 'Limite total de módulos = Núcleo + Essência'],
        ['p', 'O mesmo Núcleo é usado para ambos. Os slots de próteses e módulos não se somam duas vezes. Próteses e módulos implantados não contam com carga.'],

        ['h3', 'Regiões do corpo'],
        ['dl', [
          ['Cabeça', 'olhos, ouvidos, nariz, boca.'],
          ['Tronco', 'pescoço, espinha, tórax, abdómen, pélvis.'],
          ['Membros superiores', 'ombro, braço, antebraço, pulso, mão.'],
          ['Membros inferiores', 'glúteos, coxas, panturrilha, joelho, tornozelos/pés.'],
          ['Órgãos internos', 'esqueleto, sistema nervoso, pulmonar, cardiovascular, digestivo.']
        ]],

        ['h3', 'Ficha de Prótese ou Módulo'],
        ['fields', ['Modelo (Prótese ou Módulo)', 'Região', 'Tipo / CC', 'Efeito']]
      ]
    },

    /* ------------------------------------------------------------ 11 */
    {
      id: 'carga', title: 'Carga', group: 'Equipamento',
      blocks: [
        ['formula', 'Limite de carga', '5 + (Corpo × 5)'],
        ['p', '(–1 no atributo = 2 de carga)'],
        ['p', 'Só pode se beneficiar de 4 itens equipados simultaneamente. (isso não conta para módulos/próteses.)'],

        ['h2', 'Sobrecarga'],
        ['p', 'Se estiver com carga além do seu limite, recebe -3 em todos os testes e perde metade de todos os seus deslocamentos enquanto está em sobrecarga.']
      ]
    },

    /* ------------------------------------------------------------ 12 */
    {
      id: 'progressao', title: 'Progressão', group: 'Fundamentos',
      blocks: [
        ['p', 'XP é obtido derrotando oponentes e superando desafios.'],
        ['formula', '', '1 UP = 10 XP'],
        ['p', 'UP compra perícias, habilidades e recursos.'],
        ['p', 'A cada 4 UPs obtidos anteriormente, ganha-se +1 atributo (até cerca de 20 UP).'],

        ['h2', 'Recursos por UP'],
        ['table', ['UP investido', 'Ganho'], [
          ['1 Up', '+2 em perícias.'],
          ['1 Up', '+10 PV.'],
          ['1 Up', '+10 PE.'],
          ['1 Up', '+2 PA.']
        ]]
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
        ]]
      ]
    },

    /* ------------------------------------------------------------ 15 */
    {
      id: 'habilidades', title: 'Habilidades', group: 'Personagem',
      blocks: [
        ['card', 'Esquiva', [
          ['kv', '', [['Custo', '2 Up points']]],
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
          ['p', 'Você se transforma no que quiser!'],
          ['p', 'Utilizando uma ação completa você pode se transformar; você cria uma transformação trocando seus Up points e os realocando como quiser. Seus itens caem ao chão no processo. Cada Up point equivale a uma transformação.']
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

    /* ------------------------------------------------------------ 16 */
    {
      id: 'ficha', title: 'Ficha', group: 'Personagem',
      blocks: [
        ['h2', 'Modelo de ficha'],
        ['fields', ['Nome', 'Idade', 'Altura', 'Sexo', 'Origem', 'Espécime', 'Xp: 0', 'Up points']],

        ['h2', 'Status'],
        ['fields', ['Corpo', 'Precisão', 'Essência']],

        ['h2', 'Recursos'],
        ['fields', ['Pv: 5 (Corpo * 5)', 'Shield', 'Blindagem', 'Pe: 5 + (Essência * 5)', 'Pa = Precisão']],

        ['h2', 'Perícias'],
        ['h3', 'Perícias de Corpo'],
        ['fields', ['Luta', 'Resistência', 'Atletismo', 'Fortitude']],
        ['h3', 'Perícias de Precisão'],
        ['fields', ['Mira', 'Tecnologia', 'Manha', 'Pilotagem', 'Intelecto', 'Reflexos']],
        ['h3', 'Perícias de Essência'],
        ['fields', ['Operações', 'Sentidos', 'Vontade', 'Intimidação', 'Diplomacia', 'Enganação']],

        ['h2', 'Ataques'],
        ['formula', '', '2d6 + atributo base + perícia do ataque = ataque'],

        ['h2', 'Defesa'],
        ['formula', '', '2d6 + Corpo + Resistência = Defesa'],
        ['h3', 'Defesa mínima'],
        ['formula', '', 'Armadura + Corpo + Resistência'],

        ['h2', 'Implantados'],
        ['h3', 'Núcleo'],
        ['formula', 'Capacidade cibernética', '(núcleo) + corpo'],
        ['p', 'Bônus somente para módulos = essência.'],

        ['h2', 'Inventário'],
        ['formula', 'Carga', '5 + (Corpo × 5)'],
        ['example', 'Corpo 0 = 2 de carga.']
      ]
    }
  ]
};