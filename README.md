# Vortex

Site de RPG: fichas, campanhas, personagens e criaturas. Regras, exemplos de regras e gerador de token entram nas próximas versões.

## Versão 0.1 (telas e navegação)

- **Início**: digite o nome, escolha Personagem ou Criatura e abra a ficha.
- **Ficha**: identidade, atributos, recursos (vida e energia), anotações e campanhas do personagem. Personagem e criatura usam a mesma ficha por enquanto.
- **Campanhas**: entrar com um ID de entrada ou criar uma campanha. Um personagem pode estar em quantas campanhas quiser.
- **Campanha**: ID de entrada e todos os candidatos (personagens e criaturas).

Os dados ainda ficam **só na memória do navegador** (`public/assets/js/services/mock-db.js`) e somem ao recarregar. Para testar a entrada em campanha, use o ID de demonstração `VX7K2Q`.

## Como abrir

Dê dois cliques em `public/index.html`, ou use a extensão Live Server do VS Code.

## Estrutura

```
vortex-rpg/
├── public/                     o site (é a pasta publicada no Firebase Hosting)
│   ├── index.html              todas as telas + modelos de componentes
│   └── assets/
│       ├── css/                base, layout, components, screens
│       ├── img/                favicon
│       └── js/
│           ├── core/           namespace, ajudantes de DOM, roteador de telas
│           ├── services/       banco de dados (simulado hoje, Firebase depois)
│           ├── views/          uma pasta de lógica por tela
│           └── app.js          ponto de entrada
├── docs/
│   ├── firebase-setup.md       passo a passo para criar o banco
│   └── modelo-de-dados.md      coleções e campos do Firestore
├── firestore.rules             regras de segurança (rascunho)
├── firebase.json               configuração de Hosting e Firestore
└── README.md
```

## Como as telas trocam

O roteador (`core/router.js`) usa o endereço com `#`: `#/home`, `#/sheet`, `#/campaigns`, `#/campaign/ID`. Cada tela é uma `<section data-screen="...">` no `index.html`; o roteador mostra uma e esconde as outras. O botão Voltar do navegador funciona.

Para criar uma tela nova: adicione a `<section data-screen="nome" data-title="Título">`, crie `views/nome.js` com `Vortex.views.nome = { init, enter }`, inclua o script no `index.html` e adicione `nome` em `NAV_FOR` no roteador.

## Próximos passos

1. Criar o projeto no Firebase (`docs/firebase-setup.md`).
2. Escrever `services/firebase-db.js` com o mesmo contrato do `mock-db.js`, sem mexer nas telas.
3. Regras, exemplos de regras e gerador de token.
