/* =====================================================================
   VORTEX | app.js
   Índice: 1 Firebase (config) · 2 Utilidades · 3 Dados (rolagem)
           4 Banco local · 5 Banco Firebase · 6 Acesso rápido, ajuda e exportação
           7 Telas · 8 Início do app
   Para ligar ou trocar o Firebase, edite só o bloco FIREBASE_CONFIG abaixo.
   Vazio = modo local (dados só neste aparelho).
   ===================================================================== */
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDEaRWcliVKrFGSGslzO-YODgZDZxgI5yE',
  authDomain: 'vortex-7faa5.firebaseapp.com',
  projectId: 'vortex-7faa5',
  storageBucket: 'vortex-7faa5.firebasestorage.app',
  messagingSenderId: '174536440512',
  appId: '1:174536440512:web:e62bab9f3a255039644b25',
  measurementId: 'G-FK6E5GTTHR'
};

(function () {
  'use strict';

  /* =====================================================================
     2. UTILIDADES
     ===================================================================== */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  class UserError extends Error {}

  const TYPE_LABEL = { personagem: 'Personagem', criatura: 'Criatura' };
  const DUP_CHARACTER = 'Já existe um personagem ou criatura com esse nome. Escolha outro.';
  const DUP_CAMPAIGN = 'Já existe uma campanha com esse nome. Escolha outro.';
  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem O, 0, I, 1

  // Cria elemento; texto entra sempre como texto (nunca como HTML)
  function h(tag, cls, ...kids) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    e.append(...kids.filter((k) => k !== null && k !== undefined && k !== false));
    return e;
  }

  function debounce(fn, ms) {
    let t;
    return () => { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  const uid = () => (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function randInt(n) { // inteiro de 1 a n, sem viés
    if (window.crypto && crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      const limit = Math.floor(4294967296 / n) * n;
      do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
      return (buf[0] % n) + 1;
    }
    return Math.floor(Math.random() * n) + 1;
  }

  function newCode() {
    let code = '';
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randInt(CODE_ALPHABET.length) - 1];
    return code;
  }

  /* Nomes: "Ílyra  Voss" e "ilyra voss" contam como o mesmo nome */
  const cleanName = (v) => String(v).replace(/\s+/g, ' ').trim();
  const nameKey = (v) => cleanName(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\//g, ' ');
  function validateName(v) {
    if (v.length < 2) return 'Digite um nome com pelo menos 2 letras.';
    if (v.length > 40) return 'Use no máximo 40 caracteres.';
    return '';
  }

  /* Busca: palavras sem acento e em minúsculas; a ficha guarda os começos de cada palavra */
  const words = (text) => nameKey(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  function buildSearchKeys(name, species, origin) {
    const set = new Set();
    words([name, species, origin].join(' ')).slice(0, 14).forEach((w) => {
      for (let i = 1; i <= Math.min(w.length, 20); i++) set.add(w.slice(0, i));
    });
    return Array.from(set);
  }
  /* Motor de busca (como num site de pesquisa): sem acento nem maiúsculas, todas as palavras
     precisam aparecer em qualquer ordem (como começo de palavra), plural e singular valem o mesmo,
     um erro de digitação é tolerado e o resultado vem ordenado por relevância. */
  function stemWord(w) {
    if (w.length < 4 || /\d/.test(w)) return w;
    if (/[oa]es$/.test(w)) return w.slice(0, -3) + 'ao'; // munições, pães
    if (w.length > 4 && /ais$/.test(w)) return w.slice(0, -2) + 'l'; // especiais
    if (w.length > 4 && /eis$/.test(w)) return w.slice(0, -3) + 'el'; // papéis
    if (/ns$/.test(w)) return w.slice(0, -2) + 'm'; // bens
    if (/[rz]es$/.test(w)) return w.slice(0, -2); // lasers, luzes
    if (/[^s]s$/.test(w)) return w.slice(0, -1); // pistolas
    return w;
  }
  const STEM_CACHE = new Map();
  function stemWords(text) {
    const key = String(text || '');
    let out = STEM_CACHE.get(key);
    if (out) return out;
    out = words(key).map(stemWord);
    // palavras coladas também valem ("P-01" acha com "p01")
    const n = out.length;
    for (let i = 0; i < n - 1; i++) if (out[i].length <= 3 || out[i + 1].length <= 3) out.push(out[i] + out[i + 1]);
    if (STEM_CACHE.size > 6000) STEM_CACHE.clear();
    STEM_CACHE.set(key, out);
    return out;
  }
  // distância de edição entre t e o começo mais parecido de w (tolerância a erro de digitação)
  function prefixDistance(t, w, max) {
    if (Math.abs(Math.min(w.length, t.length) - t.length) > max) return max + 1;
    let prev = [];
    for (let j = 0; j <= w.length; j++) prev[j] = j;
    for (let i = 1; i <= t.length; i++) {
      const cur = [i];
      let low = i;
      for (let j = 1; j <= w.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (t[i - 1] === w[j - 1] ? 0 : 1));
        if (cur[j] < low) low = cur[j];
      }
      if (low > max) return max + 1;
      prev = cur;
    }
    let best = max + 1;
    for (let j = Math.max(0, t.length - max); j <= w.length; j++) best = Math.min(best, prev[j]);
    return best;
  }
  function editDistance(a, b) {
    let prev = Array.from({ length: b.length + 1 }, (x, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  const typoLimit = (t) => (t.length >= 7 ? 2 : t.length >= 4 ? 1 : 0);
  // quão bem a palavra t casa com alguma palavra da lista (0 = não casa)
  function wordHit(t, list, fuzzy) {
    let best = 0;
    for (const w of list) {
      if (w === t) return 1;
      if (w.indexOf(t) === 0) best = Math.max(best, 0.8);
      else if (fuzzy && best < 0.5 && t.length >= 3 && w.indexOf(t) > 0) best = Math.max(best, 0.4);
    }
    if (best || !fuzzy) return best;
    const max = typoLimit(t);
    if (!max) return 0;
    for (const w of list) if (w.length >= 3 && prefixDistance(t, w, max) <= max) return 0.3;
    return 0;
  }
  /* Pontua um registro: fields = [[texto, peso], ...] (nome pesa mais que tipo, que pesa mais que descrição).
     Volta 0 se alguma palavra da busca não aparece; sem busca, tudo vale 1. */
  function searchScore(fields, q) {
    const qs = stemWords(q);
    if (!qs.length) return 1;
    const parts = fields.filter((f) => f && f[0]).map((f) => [stemWords(f[0]), f[1]]);
    let total = 0;
    for (const t of qs) {
      let best = 0;
      for (const [list, weight] of parts) {
        const hit = wordHit(t, list, weight >= 4);
        if (hit * weight > best) best = hit * weight;
      }
      if (!best) return 0;
      total += best;
    }
    const name = fields[0] && fields[0][0] ? stemWords(fields[0][0]).join(' ') : '';
    const query = qs.join(' ');
    if (name === query) total += 40;
    else if (name.indexOf(query) === 0) total += 20;
    return total;
  }
  // filtra e ordena por relevância (empate: ordem alfabética); sem busca, mantém a ordem recebida
  function rankSearch(list, q, fieldsOf) {
    if (!stemWords(q).length) return list.slice();
    return list.map((x) => [x, searchScore(fieldsOf(x), q)])
      .filter((r) => r[1] > 0)
      .sort((a, b) => (b[1] - a[1]) || String(a[0].name || '').localeCompare(String(b[0].name || ''), 'pt-BR'))
      .map((r) => r[0]);
  }
  // "Você quis dizer…?": troca cada palavra sem resultado pela mais parecida dos nomes conhecidos
  function suggestQuery(q, texts) {
    const qs = words(q);
    if (!qs.length) return '';
    const vocab = new Set();
    texts.forEach((t) => words(t).forEach((w) => { if (w.length >= 3) vocab.add(w); }));
    let changed = false;
    const out = qs.map((t) => {
      if (vocab.has(t) || t.length < 3) return t;
      if (Array.from(vocab).some((w) => w.indexOf(t) === 0)) return t;
      const limit = t.length >= 7 ? 3 : 2;
      let best = '', dist = limit + 1;
      vocab.forEach((w) => {
        if (Math.abs(w.length - t.length) > limit) return;
        const d = editDistance(t, w);
        if (d <= limit && (d < dist || (d === dist && w.length < best.length))) { dist = d; best = w; }
      });
      if (!best) return t;
      changed = true;
      return best;
    });
    return changed ? out.join(' ') : '';
  }
  // a busca de fichas olha nome (mais forte), espécie e origem
  const charFields = (c) => [[c.name, 10], [[c.species, c.origin].join(' '), 4]];
  function matchesQuery(c, q) { return searchScore(charFields(c), q) > 0; }
  const deep = (o) => JSON.parse(JSON.stringify(o === undefined ? null : o));
  const libHay = (e) => nameKey([e.name, e.typeTitle, e.kindTitle].join(' '));
  // Banco de itens: nome, depois tipo/categoria/fabricante/dano..., depois todo o texto da entrada
  const ENTRY_TAGS = ['raridade', 'fabricante', 'posicao', 'para', 'dano', 'pente', 'calibre', 'subtipo', 'tipo', 'municao', 'alcance', 'cadencia'];
  function entryFields(e) {
    const v = e.values || {};
    const tags = [e.typeTitle, e.kindTitle].concat(ENTRY_TAGS.map((k) => v[k]));
    const rest = Object.keys(v).filter((k) => ENTRY_TAGS.indexOf(k) < 0 && typeof v[k] === 'string').map((k) => v[k]);
    return [[e.name, 10], [tags.filter(Boolean).join(' '), 4], [rest.join(' '), 1]];
  }
  function matchesText(hay, q) { return searchScore([[hay, 4]], q) > 0; }
  const fileSlug = (name) => nameKey(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'ficha';

  function errorMessage(err) {
    if (err instanceof UserError) return err.message;
    console.error(err);
    const code = err && err.code;
    if (code === 'permission-denied') return 'O Firebase recusou a operação. Confira o login anônimo e as regras (veja o guia).';
    if (code === 'auth/network-request-failed') return 'Não foi possível acessar o Firebase. Confira sua conexão e tente de novo.';
    if (code === 'failed-precondition') return 'O Firestore ainda não está configurado neste projeto. Crie o banco e publique as regras.';
    if (code === 'auth/configuration-not-found') return 'O Firebase não encontrou a configuração de autenticação deste projeto.';
    if (code === 'unavailable') return 'Sem conexão com o Firebase. Tente de novo.';
    return 'Algo deu errado. Tente de novo.';
  }

  /* =====================================================================
     3. DADOS
     ===================================================================== */
  /* Teste do sistema: 2d6 + Atributo + Perícia (regras "Testes e Dados").
     - Cada 6 soma o atributo de novo, mas só vale 1 crítico por teste.
     - Cada 1 é uma perda: anula o bônus da perícia; duas perdas = falha completa.
     - Um 1 anula um 6.
     - Ganho: um 3º ou 4º dado entra na soma (limite 4d6). Perda: um dado a menos.
     - Vantagem/desvantagem: rola um dado a mais e fica com os melhores/piores (não soma o extra).
     o: { label, attrName, attr, skillName, skill, mods: [[nome, valor]], dice, adv: 'vantagem'|'desvantagem' } */
  function rollTest(o) {
    if (++vxDice >= 13) vxClue(6); // enigma do Vórtex: treze rolagens numa visita
    const n = clamp(Math.round(o.dice || 2), 1, 4);
    const adv = o.adv === 'vantagem' || o.adv === 'desvantagem' ? o.adv : '';
    const all = Array.from({ length: n + (adv ? 1 : 0) }, () => randInt(6));
    let rolls = all;
    let dropped = null;
    if (adv) {
      const sorted = all.slice().sort((a, b) => (adv === 'vantagem' ? b - a : a - b));
      dropped = sorted[n];
      rolls = all.slice();
      rolls.splice(rolls.lastIndexOf(dropped), 1);
    }
    const ones = rolls.filter((v) => v === 1).length;
    const sixes = rolls.filter((v) => v === 6 || (o.critFive && v === 5)).length; // Certeiro: crítico com 5 e 6
    const crit = sixes > ones;
    const skillLost = ones > 0 && Boolean(o.skill);
    const mods = (o.mods || []).filter((x) => x && x[1]);
    const dice = rolls.reduce((t, v) => t + v, 0);
    const skill = skillLost ? 0 : (o.skill || 0);
    const total = dice + (o.attr || 0) + skill + mods.reduce((t, x) => t + x[1], 0) + (crit ? (o.attr || 0) : 0);
    const sg = (v) => (v < 0 ? ' - ' + Math.abs(v) : ' + ' + v);
    let detail = n + 'd6 [' + rolls.join(', ') + ']' + (adv ? ' (' + adv + ': descartou ' + dropped + ')' : '') + sg(o.attr || 0) + ' ' + o.attrName;
    if (o.skillName) detail += sg(o.skill || 0) + ' ' + o.skillName + (skillLost ? ' (anulada: perda)' : '');
    mods.forEach((x) => { detail += sg(x[1]) + ' ' + x[0]; });
    if (crit) detail += sg(o.attr || 0) + ' crítico (' + o.attrName + ')';
    if (ones >= 2) detail += ' · duas perdas: falha completa';
    const fixed = (o.attr || 0) + (o.skill || 0) + mods.reduce((t, x) => t + x[1], 0);
    return {
      expr: n + 'd6' + (fixed ? (fixed > 0 ? '+' : '') + fixed : '') + (adv ? ' (' + adv + ')' : ''),
      label: String(o.label || '').slice(0, 60),
      detail: detail.slice(0, 1400),
      total,
      flag: ones >= 2 ? 'falha' : crit ? 'crit' : ''
    };
  }

  /* =====================================================================
     4. BANCO LOCAL (localStorage): funciona sem Firebase
     Os dois bancos (local e Firebase) têm os mesmos métodos.
     O ID da campanha é o próprio ID de entrada (ex.: VX7K2Q).
     Fichas são públicas e qualquer pessoa pode editar; só quem criou exclui.
     ===================================================================== */
  const LocalDb = (function () {
    const KEY = 'vortex.local.v1';
    const ROLLS = 'vortex.rolls.v1.';
    const ME = 'local';
    const clone = (o) => JSON.parse(JSON.stringify(o));

    // Fichas e campanha de demonstração (para testar busca e campanha sem Firebase)
    const DEMO_CHARACTERS = [
      { id: 'demo-1', name: 'Kael Ashdown', type: 'personagem', species: 'Humano', age: '34 anos', origin: 'Porto de Vento' },
      { id: 'demo-2', name: 'Mara Quill', type: 'personagem', species: 'Halfling', age: '29 anos', origin: 'Vale das Cinzas' },
      { id: 'demo-3', name: 'Cinzento', type: 'criatura', species: 'Espectro', age: 'desconhecida', origin: 'Poço Seco' }
    ];

    function addDemo(d) {
      const now = Date.now();
      DEMO_CHARACTERS.forEach((c, i) => {
        const taken = Object.values(d.characters).some((x) => x.nameKey === nameKey(c.name));
        if (d.characters[c.id] || taken) return;
        d.characters[c.id] = Object.assign({
          ownerUid: 'demo', nameKey: nameKey(c.name), image: '', thumb: '', campaignIds: ['VX7K2Q'], updatedAt: now - i
        }, c);
      });
      if (!d.campaigns.VX7K2Q && !d.demoDone) {
        d.campaigns.VX7K2Q = {
          id: 'VX7K2Q', name: 'A Queda de Vortex', nameKey: nameKey('A Queda de Vortex'), ownerUid: 'demo', members: {}
        };
      }
      const camp = d.campaigns.VX7K2Q;
      if (camp) {
        DEMO_CHARACTERS.forEach((c, i) => {
          if (d.characters[c.id] && !camp.members[c.id]) camp.members[c.id] = { characterId: c.id, ownerUid: 'demo', joinedAt: now + i };
        });
      }
      d.demoDone = true;
    }

    function read() {
      let d = null;
      try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* começa do zero */ }
      if (!d || !d.characters || !d.campaigns) d = { characters: {}, campaigns: {} };
      if (!d.library) d.library = {}; // banco de itens, mods, propriedades, acessórios, espécimes e poderes
      if (!d.v) { addDemo(d); d.v = 2; write(d, true); } // migração da versão anterior
      return d;
    }

    function write(d, quiet) {
      try { localStorage.setItem(KEY, JSON.stringify(d)); }
      catch (e) { if (!quiet) throw new UserError('O armazenamento do navegador está cheio. Apague algo ou remova imagens.'); }
    }

    const summarize = (c) => ({ id: c.id, name: c.name, isOwner: c.ownerUid === ME, passHash: c.passHash || '', public: Boolean(c.public) });
    const toChar = (c) => ({
      id: c.id, name: c.name, type: c.type, image: c.image || '', thumb: c.thumb || '',
      species: c.species || '', age: c.age || '', origin: c.origin || '',
      campaignIds: (c.campaignIds || []).slice(), mine: c.ownerUid === ME,
      sheet: c.sheet ? clone(c.sheet) : null
    });
    const toLib = (e) => Object.assign(clone(e), { mine: e.ownerUid === ME });
    const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR');

    const listeners = {}; // campaignId -> Set de callbacks
    const foeListeners = {};
    const sceneListeners = {};
    const foesOf = (campaignId) => Object.values((read().foes || {})[campaignId] || {}).map(clone).sort((a, b) => a.createdAt - b.createdAt);
    function notifyFoes(campaignId) { (foeListeners[campaignId] || new Set()).forEach((cb) => cb(foesOf(campaignId))); }
    const shopListeners = {};
    const shopsOf = (campaignId) => Object.values((read().shops || {})[campaignId] || {}).map(clone).sort((a, b) => a.createdAt - b.createdAt);
    function notifyShops(campaignId) { (shopListeners[campaignId] || new Set()).forEach((cb) => cb(shopsOf(campaignId))); }
    // saque, armazéns e derrotados: uma coleção por campanha, com o mesmo formato
    const colListeners = {};
    const colOf = (campaignId, col) => Object.values(((read().cols || {})[col] || {})[campaignId] || {}).map(clone).sort((a, b) => a.createdAt - b.createdAt);
    function notifyCol(campaignId, col) { (colListeners[col + ':' + campaignId] || new Set()).forEach((cb) => cb(colOf(campaignId, col))); }
    function colBox(d, campaignId, col) { d.cols = d.cols || {}; d.cols[col] = d.cols[col] || {}; return (d.cols[col][campaignId] = d.cols[col][campaignId] || {}); }
    function rollsOf(campaignId) {
      try { return JSON.parse(localStorage.getItem(ROLLS + campaignId)) || []; } catch (e) { return []; }
    }
    function notify(campaignId) {
      const list = rollsOf(campaignId).slice(-60);
      (listeners[campaignId] || []).forEach((cb) => cb(list));
    }
    window.addEventListener('storage', (ev) => { // outras abas do mesmo navegador
      if (ev.key && ev.key.indexOf(ROLLS) === 0) notify(ev.key.slice(ROLLS.length));
    });

    function removeFromCampaign(d, campaignId, characterId) {
      const camp = d.campaigns[campaignId];
      if (camp) delete camp.members[characterId];
      const ch = d.characters[characterId];
      if (ch) ch.campaignIds = ch.campaignIds.filter((id) => id !== campaignId);
    }

    return {
      mode: 'local',
      uid: ME,

      async nameTaken(kind, name, exceptId) {
        const d = read();
        const key = nameKey(name);
        const pool = kind === 'campaign' ? Object.values(d.campaigns) : Object.values(d.characters);
        return pool.some((x) => x.nameKey === key && x.id !== exceptId);
      },

      async getCharacter(id) {
        const c = read().characters[id];
        return c ? toChar(c) : null;
      },

      async searchCharacters(query, type) {
        const all = Object.values(read().characters).filter((c) => !type || c.type === type)
          .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        return rankSearch(all, query, charFields).slice(0, 60).map(toChar);
      },

      async createCharacter({ name, type }) {
        const d = read();
        const key = nameKey(name);
        if (Object.values(d.characters).some((c) => c.nameKey === key)) throw new UserError(DUP_CHARACTER);
        const c = { id: uid(), ownerUid: ME, name, nameKey: key, type, image: '', thumb: '', species: '', age: '', origin: '', campaignIds: [], updatedAt: Date.now() };
        d.characters[c.id] = c;
        write(d);
        return toChar(c);
      },

      async saveCharacter(id, patch) {
        const d = read();
        const c = d.characters[id];
        if (!c) throw new UserError('Personagem não encontrado.');
        ['species', 'age', 'origin', 'image', 'thumb'].forEach((k) => { if (k in patch) c[k] = String(patch[k]); });
        if ('sheet' in patch) c.sheet = clone(patch.sheet);
        c.updatedAt = Date.now();
        write(d);
      },

      async renameCharacter(id, name) {
        const d = read();
        const c = d.characters[id];
        if (!c) throw new UserError('Personagem não encontrado.');
        const key = nameKey(name);
        if (Object.values(d.characters).some((x) => x.nameKey === key && x.id !== id)) throw new UserError(DUP_CHARACTER);
        c.name = name;
        c.nameKey = key;
        c.updatedAt = Date.now();
        write(d);
      },

      async deleteCharacter(id) {
        const d = read();
        const c = d.characters[id];
        if (!c) return;
        if (c.ownerUid !== ME) throw new UserError('Só quem criou esta ficha pode excluí-la.');
        c.campaignIds.slice().forEach((cid) => removeFromCampaign(d, cid, id));
        delete d.characters[id];
        write(d);
      },

      async createCampaign(name) {
        const d = read();
        const key = nameKey(name);
        if (Object.values(d.campaigns).some((c) => c.nameKey === key)) throw new UserError(DUP_CAMPAIGN);
        let code;
        do { code = newCode(); } while (d.campaigns[code]);
        d.campaigns[code] = { id: code, name, nameKey: key, ownerUid: ME, members: {} };
        write(d);
        return summarize(d.campaigns[code]);
      },

      async getCampaign(id) {
        const c = read().campaigns[id];
        return c ? summarize(c) : null;
      },
      // acesso: pública (aparece na lista) e senha (guardada só como hash)
      async updateCampaign(id, patch) {
        const d = read();
        const c = d.campaigns[id];
        if (!c || c.ownerUid !== ME) throw new UserError('Só quem criou a campanha muda isso.');
        Object.assign(c, patch);
        write(d);
      },
      async listPublicCampaigns() {
        return Object.values(read().campaigns).filter((c) => c.public).map(summarize).sort(byName);
      },

      async deleteCampaign(id) {
        const d = read();
        const c = d.campaigns[id];
        if (!c || c.ownerUid !== ME) throw new UserError('Só quem criou a campanha pode excluí-la.');
        Object.keys(c.members).forEach((characterId) => removeFromCampaign(d, id, characterId));
        delete d.campaigns[id];
        write(d);
        localStorage.removeItem(ROLLS + id);
      },

      async joinCampaign(code, characterId) {
        const d = read();
        const camp = d.campaigns[String(code).trim().toUpperCase()];
        const ch = d.characters[characterId];
        if (!ch) throw new UserError('Personagem não encontrado.');
        if (!camp) throw new UserError('Não encontramos nenhuma campanha com esse ID. Confira o código e tente de novo.');
        if (camp.members[characterId]) throw new UserError('Este personagem já está nessa campanha.');
        camp.members[characterId] = { characterId, ownerUid: ME, joinedAt: Date.now() };
        ch.campaignIds.push(camp.id);
        write(d);
        return summarize(camp);
      },

      async leaveCampaign(campaignId, characterId) {
        const d = read();
        removeFromCampaign(d, campaignId, characterId);
        write(d);
      },

      // o mestre tira qualquer personagem da campanha
      async removeMember(campaignId, characterId) {
        const d = read();
        removeFromCampaign(d, campaignId, characterId);
        write(d);
      },

      async listCharacterCampaigns(characterId) {
        const d = read();
        const ch = d.characters[characterId];
        if (!ch) return [];
        return ch.campaignIds.filter((id) => d.campaigns[id]).map((id) => summarize(d.campaigns[id]));
      },

      async listMyCampaigns() {
        return Object.values(read().campaigns)
          .filter((c) => c.ownerUid === ME || Object.values(c.members).some((m) => m.ownerUid === ME))
          .map(summarize);
      },

      // Candidatos: dados sempre atuais da ficha (quem edita a ficha, muda aqui também)
      async listMembers(campaignId) {
        const d = read();
        const c = d.campaigns[campaignId];
        if (!c) return [];
        return Object.values(c.members)
          .filter((m) => d.characters[m.characterId])
          .sort((a, b) => a.joinedAt - b.joinedAt)
          .map((m) => Object.assign(toChar(d.characters[m.characterId]), { characterId: m.characterId, ownerUid: m.ownerUid, mine: m.ownerUid === ME }));
      },

      // ---------- Banco de itens (público; só quem criou edita ou exclui) ----------
      async searchLibrary({ kinds, query }) {
        const all = Object.values(read().library).filter((e) => !kinds || kinds.indexOf(e.kind) >= 0)
          .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).map(toLib);
        return rankSearch(all, query, (e) => entryFields(decorate(e)));
      },

      async saveLibrary(entry) {
        const d = read();
        const old = entry.id ? d.library[entry.id] : null;
        if (old && old.ownerUid !== ME) throw new UserError('Só quem criou pode editar.');
        const id = old ? old.id : uid();
        const e = clone(entry);
        delete e.mine;
        d.library[id] = Object.assign(e, { id, ownerUid: ME, nameKey: nameKey(e.name), createdAt: old ? old.createdAt : Date.now(), updatedAt: Date.now() });
        write(d);
        return toLib(d.library[id]);
      },

      async deleteLibrary(id) {
        const d = read();
        const e = d.library[id];
        if (!e) return;
        if (e.ownerUid !== ME) throw new UserError('Só quem criou pode excluir.');
        delete d.library[id];
        write(d);
      },

      async addRoll(campaignId, roll) {
        const list = rollsOf(campaignId);
        list.push(Object.assign({ id: uid(), createdAt: Date.now() }, roll));
        try { localStorage.setItem(ROLLS + campaignId, JSON.stringify(list.slice(-100))); }
        catch (e) { throw new UserError('O armazenamento do navegador está cheio.'); }
        notify(campaignId);
      },

      subscribeRolls(campaignId, callback) {
        (listeners[campaignId] = listeners[campaignId] || new Set()).add(callback);
        callback(rollsOf(campaignId).slice(-60));
        return () => listeners[campaignId].delete(callback);
      },

      // ---------- Perfis (falso login: o código abre o perfil, sem senha) ----------
      async getProfile(code) {
        const p = (read().profiles || {})[code];
        return p ? clone(p) : null;
      },

      async saveProfile(code, p) {
        const d = read();
        d.profiles = d.profiles || {};
        d.profiles[code] = Object.assign(clone(p), { code, updatedAt: Date.now() });
        write(d);
      },

      async touchCampaign() { /* no modo local tudo já está neste aparelho */ },

      // ---------- Combate: inimigos que o mestre coloca na campanha ----------
      async addFoe(campaignId, foe) {
        const d = read();
        d.foes = d.foes || {};
        const box = d.foes[campaignId] = d.foes[campaignId] || {};
        const id = uid();
        box[id] = Object.assign(clone(foe), { id, createdAt: Date.now() });
        write(d);
        notifyFoes(campaignId);
        return id;
      },
      async updateFoe(campaignId, id, patch) {
        const d = read();
        const box = (d.foes || {})[campaignId] || {};
        if (!box[id]) throw new UserError('Esse inimigo não está mais na campanha.');
        Object.assign(box[id], clone(patch));
        write(d);
        notifyFoes(campaignId);
      },
      async removeFoe(campaignId, id) {
        const d = read();
        if (d.foes && d.foes[campaignId]) delete d.foes[campaignId][id];
        write(d);
        notifyFoes(campaignId);
      },
      subscribeFoes(campaignId, callback) {
        (foeListeners[campaignId] = foeListeners[campaignId] || new Set()).add(callback);
        callback(foesOf(campaignId));
        return () => foeListeners[campaignId].delete(callback);
      },

      // ---------- Cena: iniciativa, rodada e turno ----------
      async saveScene(campaignId, scene) {
        const d = read();
        d.scenes = d.scenes || {};
        d.scenes[campaignId] = clone(scene);
        write(d);
        (sceneListeners[campaignId] || new Set()).forEach((fn) => fn(clone(scene)));
      },
      subscribeScene(campaignId, callback) {
        (sceneListeners[campaignId] = sceneListeners[campaignId] || new Set()).add(callback);
        callback(clone((read().scenes || {})[campaignId] || null));
        return () => sceneListeners[campaignId].delete(callback);
      },

      // ---------- Lojas da campanha ----------
      async addShop(campaignId, shop) {
        const d = read();
        d.shops = d.shops || {};
        const box = d.shops[campaignId] = d.shops[campaignId] || {};
        const id = uid();
        box[id] = Object.assign(clone(shop), { id, createdAt: Date.now() });
        write(d);
        notifyShops(campaignId);
        return id;
      },
      async updateShop(campaignId, id, patch) {
        const d = read();
        const box = (d.shops || {})[campaignId] || {};
        if (!box[id]) throw new UserError('Essa loja não existe mais.');
        Object.assign(box[id], clone(patch));
        write(d);
        notifyShops(campaignId);
      },
      async removeShop(campaignId, id) {
        const d = read();
        if (d.shops && d.shops[campaignId]) delete d.shops[campaignId][id];
        write(d);
        notifyShops(campaignId);
      },
      subscribeShops(campaignId, callback) {
        (shopListeners[campaignId] = shopListeners[campaignId] || new Set()).add(callback);
        callback(shopsOf(campaignId));
        return () => shopListeners[campaignId].delete(callback);
      },

      // ---------- Saque, armazéns e derrotados ----------
      async addDoc(campaignId, col, data, id) {
        const d = read();
        const box = colBox(d, campaignId, col);
        id = id || uid();
        box[id] = Object.assign(clone(data), { id, createdAt: (box[id] && box[id].createdAt) || Date.now() });
        write(d);
        notifyCol(campaignId, col);
        return id;
      },
      async updateDoc(campaignId, col, id, patch) {
        const d = read();
        const box = colBox(d, campaignId, col);
        if (!box[id]) throw new UserError('Isso não existe mais.');
        Object.assign(box[id], clone(patch));
        write(d);
        notifyCol(campaignId, col);
      },
      async removeDoc(campaignId, col, id) {
        const d = read();
        delete colBox(d, campaignId, col)[id];
        write(d);
        notifyCol(campaignId, col);
      },
      subscribeCol(campaignId, col, callback) {
        const k = col + ':' + campaignId;
        (colListeners[k] = colListeners[k] || new Set()).add(callback);
        callback(colOf(campaignId, col));
        return () => colListeners[k].delete(callback);
      }
    };
  })();

  /* =====================================================================
     5. BANCO FIREBASE (Firestore + login anônimo)
     Só é usado quando FIREBASE_CONFIG está preenchido e a conexão funciona.
     Fichas são públicas: qualquer pessoa logada lê e edita; só quem criou exclui.
     Nomes únicos: cada nome vira um documento em "names"; as regras não
     deixam criar duas vezes o mesmo documento.
     ===================================================================== */
  function makeFirebaseDb(firebase, fs, me) {
    const FV = firebase.firestore.FieldValue;
    const chars = () => fs.collection('characters');
    const camps = () => fs.collection('campaigns');
    const names = () => fs.collection('names');
    const lib = () => fs.collection('library');
    const libCache = new Map();
    const nameDoc = (kind, name) => names().doc((kind === 'campaign' ? 'k_' : 'c_') + nameKey(name));

    const toChar = (snap) => {
      const d = snap.data();
      return {
        id: snap.id, name: d.name, type: d.type, image: d.image || '', thumb: d.thumb || '',
        species: d.species || '', age: d.age || '', origin: d.origin || '',
        campaignIds: d.campaignIds || [], mine: d.ownerUid === me,
        sheet: d.sheet ? deep(d.sheet) : null
      };
    };
    const toLib = (snap) => {
      const d = snap.data({ serverTimestamps: 'estimate' });
      return {
        id: snap.id, kind: d.kind, typeId: d.typeId || '', typeTitle: d.typeTitle || '', kindTitle: d.kindTitle || '',
        name: d.name, values: d.values || {}, bonus: d.bonus || {}, slots: d.slots || null,
        image: d.image || '', thumb: d.thumb || '', mine: d.ownerUid === me,
        updatedAt: d.updatedAt && d.updatedAt.toMillis ? d.updatedAt.toMillis() : 0
      };
    };
    const toCamp = (snap) => ({ id: snap.id, name: snap.data().name, isOwner: snap.data().ownerUid === me, passHash: snap.data().passHash || '', public: Boolean(snap.data().public) });

    // Fichas criadas antes da busca não têm searchKeys: completa em segundo plano
    function backfillKeys(snap) {
      const d = snap.data();
      if (Array.isArray(d.searchKeys)) return;
      snap.ref.update({ searchKeys: buildSearchKeys(d.name, d.species, d.origin) }).catch(() => {});
    }

    const db = {
      mode: 'firebase',
      uid: me,

      async nameTaken(kind, name, exceptId) {
        const s = await nameDoc(kind, name).get();
        return s.exists && s.data().refId !== exceptId;
      },

      async getCharacter(id) {
        const s = await chars().doc(id).get();
        if (!s.exists) return null;
        backfillKeys(s);
        return toChar(s);
      },

      /* Busca: o servidor acha as fichas pelo começo de uma palavra (nome, espécie ou origem);
         a relevância, o plural e os erros de digitação são resolvidos aqui. Sem acerto exato,
         procura entre as fichas mais recentes com tolerância a erro. */
      async searchCharacters(query, type) {
        const qs = words(query);
        const keep = (list) => list.filter((c) => !type || c.type === type);
        if (!qs.length) {
          const snap = await chars().orderBy('updatedAt', 'desc').limit(30).get();
          snap.docs.forEach(backfillKeys);
          return keep(snap.docs.map(toChar));
        }
        const longest = qs.slice().sort((a, b) => b.length - a.length)[0];
        const snap = await chars().where('searchKeys', 'array-contains', stemWord(longest).slice(0, 20)).limit(80).get();
        snap.docs.forEach(backfillKeys);
        let found = rankSearch(keep(snap.docs.map(toChar)), query, charFields);
        if (!found.length) {
          const recent = await chars().orderBy('updatedAt', 'desc').limit(300).get();
          found = rankSearch(keep(recent.docs.map(toChar)), query, charFields);
        }
        return found.slice(0, 60);
      },

      async createCharacter({ name, type }) {
        const nRef = nameDoc('character', name);
        if ((await nRef.get()).exists) throw new UserError(DUP_CHARACTER);
        const ref = chars().doc();
        const batch = fs.batch();
        batch.set(nRef, { kind: 'character', ownerUid: me, refId: ref.id, createdAt: FV.serverTimestamp() });
        batch.set(ref, {
          ownerUid: me, name, nameKey: nameKey(name), type, image: '', thumb: '',
          species: '', age: '', origin: '', campaignIds: [], searchKeys: buildSearchKeys(name, '', ''),
          createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp()
        });
        try { await batch.commit(); }
        catch (e) {
          if (await db.nameTaken('character', name)) throw new UserError(DUP_CHARACTER);
          throw e;
        }
        return { id: ref.id, name, type, image: '', thumb: '', species: '', age: '', origin: '', campaignIds: [], mine: true, sheet: null };
      },

      // Grava só os campos enviados (assim não apaga o que outra pessoa editou nos outros campos)
      async saveCharacter(id, patch) {
        const ref = chars().doc(id);
        const upd = { updatedAt: FV.serverTimestamp() };
        ['species', 'age', 'origin', 'image', 'thumb'].forEach((k) => { if (k in patch) upd[k] = String(patch[k]); });
        if ('sheet' in patch) upd.sheet = deep(patch.sheet); // atributos, perícias, recursos e inventário
        if ('species' in patch || 'origin' in patch) {
          const d = (await ref.get()).data();
          const next = Object.assign({}, d, upd);
          upd.searchKeys = buildSearchKeys(d.name, next.species, next.origin);
        }
        await ref.update(upd);
      },

      async renameCharacter(id, name) {
        const ref = chars().doc(id);
        const s = await ref.get();
        if (!s.exists) throw new UserError('Personagem não encontrado.');
        const old = s.data();
        const batch = fs.batch();
        if (nameKey(old.name) !== nameKey(name)) {
          const nRef = nameDoc('character', name);
          if ((await nRef.get()).exists) throw new UserError(DUP_CHARACTER);
          batch.set(nRef, { kind: 'character', ownerUid: me, refId: id, createdAt: FV.serverTimestamp() });
          batch.delete(nameDoc('character', old.name));
        }
        batch.update(ref, {
          name, nameKey: nameKey(name), searchKeys: buildSearchKeys(name, old.species, old.origin),
          updatedAt: FV.serverTimestamp()
        });
        try { await batch.commit(); }
        catch (e) {
          if (await db.nameTaken('character', name, id)) throw new UserError(DUP_CHARACTER);
          throw e;
        }
      },

      async deleteCharacter(id) {
        const ref = chars().doc(id);
        const s = await ref.get();
        if (!s.exists) return;
        const ch = s.data();
        if (ch.ownerUid !== me) throw new UserError('Só quem criou esta ficha pode excluí-la.');
        for (const cid of (ch.campaignIds || [])) {
          try { await db.leaveCampaign(cid, id); } catch (e) { console.warn(e); }
        }
        const batch = fs.batch();
        batch.delete(nameDoc('character', ch.name));
        batch.delete(ref);
        await batch.commit();
      },

      async createCampaign(name) {
        const nRef = nameDoc('campaign', name);
        if ((await nRef.get()).exists) throw new UserError(DUP_CAMPAIGN);
        let code;
        do { code = newCode(); } while ((await camps().doc(code).get()).exists);
        const batch = fs.batch();
        batch.set(nRef, { kind: 'campaign', ownerUid: me, refId: code, createdAt: FV.serverTimestamp() });
        batch.set(camps().doc(code), {
          name, nameKey: nameKey(name), ownerUid: me, memberUids: [], createdAt: FV.serverTimestamp()
        });
        try { await batch.commit(); }
        catch (e) {
          if (await db.nameTaken('campaign', name)) throw new UserError(DUP_CAMPAIGN);
          throw e;
        }
        return { id: code, name, isOwner: true };
      },

      async getCampaign(id) {
        const s = await camps().doc(id).get();
        return s.exists ? toCamp(s) : null;
      },
      async updateCampaign(id, patch) {
        await camps().doc(id).update(deep(patch));
      },
      async listPublicCampaigns() {
        const snap = await camps().where('public', '==', true).limit(60).get();
        return snap.docs.map(toCamp).sort((x, y) => x.name.localeCompare(y.name, 'pt-BR'));
      },

      async deleteCampaign(id) {
        const cRef = camps().doc(id);
        const s = await cRef.get();
        if (!s.exists) return;
        if (s.data().ownerUid !== me) throw new UserError('Só quem criou a campanha pode excluí-la.');
        // apaga primeiro o que está dentro (as regras precisam da campanha existindo)
        for (const sub of ['members', 'rolls']) {
          const snap = await cRef.collection(sub).get();
          for (let i = 0; i < snap.docs.length; i += 400) {
            const batch = fs.batch();
            snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
            await batch.commit();
          }
        }
        const batch = fs.batch();
        batch.delete(nameDoc('campaign', s.data().name));
        batch.delete(cRef);
        await batch.commit();
      },

      async joinCampaign(code, characterId) {
        const id = String(code).trim().toUpperCase();
        const cRef = camps().doc(id);
        const cs = await cRef.get();
        if (!cs.exists) throw new UserError('Não encontramos nenhuma campanha com esse ID. Confira o código e tente de novo.');
        const chSnap = await chars().doc(characterId).get();
        if (!chSnap.exists) throw new UserError('Personagem não encontrado.');
        if ((chSnap.data().campaignIds || []).indexOf(id) >= 0) throw new UserError('Este personagem já está nessa campanha.');
        const batch = fs.batch();
        batch.update(cRef, { memberUids: FV.arrayUnion(me) });
        batch.set(cRef.collection('members').doc(characterId), {
          characterId, ownerUid: me, joinedAt: FV.serverTimestamp()
        });
        batch.update(chars().doc(characterId), { campaignIds: FV.arrayUnion(id) });
        await batch.commit();
        return toCamp(cs);
      },

      async leaveCampaign(campaignId, characterId) {
        const cRef = camps().doc(campaignId);
        const cs = await cRef.get();
        const batch = fs.batch();
        batch.update(chars().doc(characterId), { campaignIds: FV.arrayRemove(campaignId) });
        if (cs.exists) {
          let snap = null;
          try { snap = await cRef.collection('members').get(); } catch (e) { snap = null; } // quem não participa não lê a lista
          if (snap) {
            batch.delete(cRef.collection('members').doc(characterId));
            const others = snap.docs.filter((d) => d.id !== characterId && d.data().ownerUid === me).length;
            if (others === 0) batch.update(cRef, { memberUids: FV.arrayRemove(me) });
          }
        }
        await batch.commit();
      },

      // o mestre tira qualquer personagem: apaga o vínculo, limpa a ficha (se ela ainda existir)
      // e tira o dono de memberUids quando ele não tem mais ninguém na campanha
      async removeMember(campaignId, characterId) {
        const cRef = camps().doc(campaignId);
        const snap = await cRef.collection('members').get();
        const row = snap.docs.find((d) => d.id === characterId);
        const owner = row ? row.data().ownerUid : '';
        const batch = fs.batch();
        if (row) batch.delete(row.ref);
        const cs = await chars().doc(characterId).get();
        if (cs.exists && (cs.data().campaignIds || []).indexOf(campaignId) >= 0) batch.update(cs.ref, { campaignIds: FV.arrayRemove(campaignId) });
        if (owner && !snap.docs.some((d) => d.id !== characterId && d.data().ownerUid === owner)) batch.update(cRef, { memberUids: FV.arrayRemove(owner) });
        await batch.commit();
      },

      async listCharacterCampaigns(characterId) {
        const s = await chars().doc(characterId).get();
        if (!s.exists) return [];
        const ids = s.data().campaignIds || [];
        const snaps = await Promise.all(ids.map((id) => camps().doc(id).get().catch(() => null)));
        const out = [];
        const gone = [];
        snaps.forEach((cs, i) => { if (cs && cs.exists) out.push(toCamp(cs)); else gone.push(ids[i]); });
        if (gone.length) { // campanha apagada pelo mestre: limpa o vínculo
          chars().doc(characterId).update({ campaignIds: FV.arrayRemove(...gone) }).catch(() => {});
        }
        return out;
      },

      async listMyCampaigns() {
        const [a, b] = await Promise.all([
          camps().where('ownerUid', '==', me).get(),
          camps().where('memberUids', 'array-contains', me).get()
        ]);
        const map = new Map();
        a.docs.concat(b.docs).forEach((d) => map.set(d.id, toCamp(d)));
        return Array.from(map.values());
      },

      // Candidatos: lê os dados atuais de cada ficha (quem edita a ficha, muda aqui também)
      async listMembers(campaignId) {
        const snap = await camps().doc(campaignId).collection('members').get();
        const rows = await Promise.all(snap.docs.map(async (d) => {
          const m = d.data({ serverTimestamps: 'estimate' });
          const cs = await chars().doc(d.id).get();
          // ficha apagada, ou que já saiu desta campanha: não aparece e o vínculo é limpo
          if (!cs.exists || (cs.data().campaignIds || []).indexOf(campaignId) < 0) { d.ref.delete().catch(() => {}); return null; }
          const at = m.joinedAt && m.joinedAt.toMillis ? m.joinedAt.toMillis() : 0;
          return Object.assign(toChar(cs), { characterId: d.id, ownerUid: m.ownerUid || '', mine: m.ownerUid === me, at });
        }));
        return rows.filter(Boolean).sort((x, y) => x.at - y.at);
      },

      // ---------- Banco de itens (público; só quem criou edita ou exclui) ----------
      /* O banco é lido por categoria e guardado por um minuto: cada letra digitada filtra aqui,
         com relevância, plural e tolerância a erro (salvar ou excluir limpa a cópia). */
      async searchLibrary({ kinds, query }) {
        const key = kinds && kinds.length && kinds.length <= 10 ? kinds.slice().sort().join(',') : '*';
        const hit = libCache.get(key);
        let all;
        if (hit && Date.now() - hit.at < 60000) all = hit.list;
        else {
          const snap = key === '*' ? await lib().get() : await lib().where('kind', 'in', kinds.slice(0, 10)).get();
          all = snap.docs.map(toLib).sort((a, b) => b.updatedAt - a.updatedAt);
          libCache.set(key, { at: Date.now(), list: all });
        }
        all = all.filter((e) => !kinds || kinds.indexOf(e.kind) >= 0);
        return rankSearch(all, query, (e) => entryFields(decorate(e)));
      },

      async saveLibrary(entry) {
        const e = deep(entry);
        const data = {
          kind: e.kind, typeId: e.typeId || '', typeTitle: e.typeTitle || '', kindTitle: e.kindTitle || '',
          name: e.name, nameKey: nameKey(e.name), values: e.values || {}, bonus: e.bonus || {}, slots: e.slots || {},
          image: e.image || '', thumb: e.thumb || '',
          searchKeys: buildSearchKeys(e.name, e.typeTitle || '', e.kindTitle || ''),
          updatedAt: FV.serverTimestamp()
        };
        let ref;
        libCache.clear();
        if (e.id) { ref = lib().doc(e.id); await ref.update(data); }
        else { ref = lib().doc(); await ref.set(Object.assign({ ownerUid: me, createdAt: FV.serverTimestamp() }, data)); }
        return Object.assign({}, e, { id: ref.id, mine: true, updatedAt: Date.now() });
      },

      async deleteLibrary(id) {
        await lib().doc(id).delete();
        libCache.clear();
      },

      async addRoll(campaignId, roll) {
        await camps().doc(campaignId).collection('rolls').add(Object.assign({}, roll, {
          authorUid: me, createdAt: FV.serverTimestamp()
        }));
      },

      subscribeRolls(campaignId, callback, onError) {
        return camps().doc(campaignId).collection('rolls').orderBy('createdAt', 'desc').limit(60).onSnapshot(
          (snap) => {
            callback(snap.docs.map((d) => {
              const r = d.data({ serverTimestamps: 'estimate' });
              return Object.assign({ id: d.id }, r, { createdAt: r.createdAt && r.createdAt.toMillis ? r.createdAt.toMillis() : Date.now() });
            }).reverse());
          },
          (err) => { if (onError) onError(err); }
        );
      },

      // ---------- Perfis (falso login: o código abre o perfil, sem senha) ----------
      async getProfile(code) {
        const s = await fs.collection('profiles').doc(code).get();
        return s.exists ? Object.assign({}, s.data(), { code }) : null;
      },

      async saveProfile(code, p) {
        await fs.collection('profiles').doc(code).set({
          name: p.name || '', chars: p.chars || [], camps: p.camps || [], gm: p.gm || [], favs: p.favs || [],
          updatedAt: FV.serverTimestamp()
        });
      },

      // Abrir a campanha por outro aparelho: entra em memberUids para ler candidatos e rolar
      async touchCampaign(id) {
        const ref = camps().doc(id);
        const s = await ref.get();
        if (!s.exists || s.data().ownerUid === me || (s.data().memberUids || []).indexOf(me) >= 0) return;
        await ref.update({ memberUids: FV.arrayUnion(me) });
      },

      // ---------- Combate: inimigos que o mestre coloca na campanha ----------
      async addFoe(campaignId, foe) {
        const ref = camps().doc(campaignId).collection('foes').doc();
        await ref.set(Object.assign(deep(foe), { createdAt: Date.now() }));
        return ref.id;
      },
      async updateFoe(campaignId, id, patch) {
        await camps().doc(campaignId).collection('foes').doc(id).update(deep(patch));
      },
      async removeFoe(campaignId, id) {
        await camps().doc(campaignId).collection('foes').doc(id).delete();
      },
      subscribeFoes(campaignId, callback, onError) {
        return camps().doc(campaignId).collection('foes').onSnapshot(
          (snap) => callback(snap.docs.map((d) => Object.assign({}, d.data(), { id: d.id })).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))),
          (err) => { if (onError) onError(err); }
        );
      },

      // ---------- Cena: iniciativa, rodada e turno (um documento por campanha) ----------
      async saveScene(campaignId, scene) {
        await camps().doc(campaignId).collection('scene').doc('state').set(Object.assign(deep(scene), { updatedAt: Date.now() }));
      },
      subscribeScene(campaignId, callback, onError) {
        return camps().doc(campaignId).collection('scene').doc('state').onSnapshot(
          (snap) => callback(snap.exists ? snap.data() : null),
          (err) => { if (onError) onError(err); }
        );
      },

      // ---------- Lojas da campanha ----------
      async addShop(campaignId, shop) {
        const ref = camps().doc(campaignId).collection('shops').doc();
        await ref.set(Object.assign(deep(shop), { createdAt: Date.now() }));
        return ref.id;
      },
      async updateShop(campaignId, id, patch) {
        await camps().doc(campaignId).collection('shops').doc(id).update(deep(patch));
      },
      async removeShop(campaignId, id) {
        await camps().doc(campaignId).collection('shops').doc(id).delete();
      },
      subscribeShops(campaignId, callback, onError) {
        return camps().doc(campaignId).collection('shops').onSnapshot(
          (snap) => callback(snap.docs.map((d) => Object.assign({}, d.data(), { id: d.id })).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))),
          (err) => { if (onError) onError(err); }
        );
      },

      // ---------- Saque (loot), armazéns (vaults) e derrotados (fallen) ----------
      async addDoc(campaignId, col, data, id) {
        const ref = id ? camps().doc(campaignId).collection(col).doc(id) : camps().doc(campaignId).collection(col).doc();
        await ref.set(Object.assign(deep(data), { createdAt: Date.now() }));
        return ref.id;
      },
      async updateDoc(campaignId, col, id, patch) {
        await camps().doc(campaignId).collection(col).doc(id).update(deep(patch));
      },
      async removeDoc(campaignId, col, id) {
        await camps().doc(campaignId).collection(col).doc(id).delete();
      },
      subscribeCol(campaignId, col, callback, onError) {
        return camps().doc(campaignId).collection(col).onSnapshot(
          (snap) => callback(snap.docs.map((d) => Object.assign({}, d.data(), { id: d.id })).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))),
          (err) => { if (onError) onError(err); }
        );
      }
    };
    return db;
  }

  /* Carrega o Firebase só quando há configuração, e entra com login anônimo */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Não foi possível carregar ' + src));
      document.head.appendChild(s);
    });
  }

  async function connectFirebase() {
    const base = 'https://www.gstatic.com/firebasejs/10.14.1/';
    await loadScript(base + 'firebase-app-compat.js');
    await Promise.all([loadScript(base + 'firebase-auth-compat.js'), loadScript(base + 'firebase-firestore-compat.js')]);
    firebase.initializeApp(FIREBASE_CONFIG);
    const cred = await firebase.auth().signInAnonymously();
    return makeFirebaseDb(firebase, firebase.firestore(), cred.user.uid);
  }

  function explainConnectError(err) {
    const code = err && err.code;
    if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') return 'Ative o login Anônimo em Authentication > Método de login.';
    if (code === 'auth/unauthorized-domain') return 'Adicione este endereço em Authentication > Configurações > Domínios autorizados.';
    if (code === 'auth/invalid-api-key' || code === 'auth/api-key-not-valid') return 'A apiKey parece errada. Copie o firebaseConfig de novo.';
    if (code === 'auth/network-request-failed') return 'A conexão com o Firebase falhou. Confira sua rede e tente novamente.';
    if (code === 'failed-precondition') return 'O Firestore ainda não foi criado ou está indisponível neste projeto.';
    if (location.protocol === 'file:') return 'Abra o site por um endereço http (extensão Live Server) ou publique-o; com duplo clique o Firebase pode não conectar.';
    return (err && err.message) || 'Não foi possível conectar.';
  }

  /* =====================================================================
     6b. EXPORTAR FICHA: PDF, Word (.docx) e texto
     Tudo é gerado no aparelho; nada é enviado a servidor.
     ===================================================================== */
  const enc = new TextEncoder();
  const ascii = (s) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };
  function concat(chunks) {
    let n = 0;
    chunks.forEach((c) => { n += c.length; });
    const out = new Uint8Array(n);
    let o = 0;
    chunks.forEach((c) => { out.set(c, o); o += c.length; });
    return out;
  }
  function dataUrlToBytes(url) {
    const bin = atob(String(url).split(',')[1] || '');
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function jpegSize(b) { // lê largura e altura do JPEG
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xFF) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xFF) { i++; continue; }
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
    return null;
  }

  /* ---------- Texto ---------- */
  function sheetText(m) {
    const lines = [m.title, m.kind, ''];
    m.fields.forEach((f) => lines.push(f[0] + ': ' + (f[1] || '—')));
    lines.push('', 'Campanhas: ' + (m.campaigns.length ? m.campaigns.join(', ') : '—'), '', 'Exportado do Vortex em ' + m.date);
    return lines.join('\n');
  }

  /* ---------- PDF (feito à mão: Helvetica padrão, sem bibliotecas) ---------- */
  const HELV = [].concat(
    [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278], // 32-47
    Array(10).fill(556),                                                                // 0-9
    [278, 278, 584, 584, 584, 556, 1015],                                               // 58-64
    [667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611], // A-Z
    [278, 278, 278, 469, 556, 333],                                                     // 91-96
    [556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500], // a-z
    [334, 260, 334, 584]                                                                // 123-126
  );
  const CP1252 = { '€': 128, '‚': 130, 'ƒ': 131, '„': 132, '…': 133, '†': 134, '‡': 135, 'ˆ': 136, '‰': 137, 'Š': 138, '‹': 139, 'Œ': 140, 'Ž': 142, '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '˜': 152, '™': 153, 'š': 154, '›': 155, 'œ': 156, 'ž': 158, 'Ÿ': 159 };

  function winAnsi(str) { // o que a fonte padrão do PDF consegue mostrar; o resto vira "?"
    let out = '';
    for (const ch of String(str)) {
      const c = ch.codePointAt(0);
      if (c < 32 || c === 127) out += ' ';
      else if (c < 127 || (c >= 160 && c < 256)) out += ch;
      else if (CP1252[ch]) out += String.fromCharCode(CP1252[ch]);
      else out += '?';
    }
    return out;
  }
  function charW(ch) {
    const c = ch.charCodeAt(0);
    if (c >= 32 && c <= 126) return HELV[c - 32];
    const base = ch.normalize('NFD').charCodeAt(0);
    return base >= 32 && base <= 126 ? HELV[base - 32] : 556;
  }
  const textW = (s, size, bold) => { let w = 0; for (const ch of s) w += charW(ch); return (w / 1000) * size * (bold ? 1.07 : 1); };
  const pdfEsc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

  function wrapText(text, size, maxW, bold) {
    const out = [];
    let line = '';
    winAnsi(text).split(/\s+/).filter(Boolean).forEach((word) => {
      while (textW(word, size, bold) > maxW) { // palavra maior que a linha: quebra por letras
        let cut = word.length;
        while (cut > 1 && textW(word.slice(0, cut), size, bold) > maxW) cut--;
        if (line) { out.push(line); line = ''; }
        out.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const test = line ? line + ' ' + word : word;
      if (textW(test, size, bold) <= maxW) line = test;
      else { if (line) out.push(line); line = word; }
    });
    if (line) out.push(line);
    return out.length ? out : [''];
  }

  function makePdf(m) {
    const W = 595, H = 842, M = 56, CW = W - 2 * M, IMG = 116;
    const img = m.image ? dataUrlToBytes(m.image) : null;
    const dim = img ? jpegSize(img) : null;
    const useImg = Boolean(img && dim);
    const pages = [];
    let ops = [];
    let y = H - M;

    const newPage = () => { if (ops.length) pages.push(ops); ops = []; y = H - M; };
    // escreve uma linha; abre página nova se não couber
    function put(str, size, bold, gray, gap, x) {
      if (y - size * 1.25 < M + 24) newPage();
      y -= size * 1.25;
      ops.push(gray + ' g BT /' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf ' + (x || M) + ' ' + y.toFixed(2) + ' Td (' + pdfEsc(str) + ') Tj ET');
      y -= gap;
    }

    // cabeçalho: nome, tipo e imagem
    const leftW = useImg ? CW - IMG - 20 : CW;
    wrapText(m.title, 26, leftW, true).forEach((l) => put(l, 26, true, 0.1, 5));
    put(winAnsi(m.kind), 12, false, 0.4, 0);
    if (useImg) {
      ops.push('q ' + IMG + ' 0 0 ' + IMG + ' ' + (W - M - IMG) + ' ' + (H - M - IMG) + ' cm /Im1 Do Q');
      y = Math.min(y, H - M - IMG);
    }
    y -= 16;
    ops.push('0.8 g ' + M + ' ' + y.toFixed(2) + ' ' + CW + ' 0.8 re f');
    y -= 14;

    // campos (rótulo e valor ficam juntos na mesma página)
    const need = (h) => { if (y - h < M + 24) newPage(); };
    m.fields.forEach((f) => {
      need(60);
      put(winAnsi(f[0]), 10, true, 0.4, 3);
      wrapText(f[1] || '—', 13, CW, false).forEach((l) => put(l, 13, false, 0.1, 3));
      y -= 10;
    });

    // campanhas
    need(70);
    put('Campanhas', 10, true, 0.4, 3);
    if (!m.campaigns.length) put('—', 13, false, 0.1, 3);
    m.campaigns.forEach((c) => wrapText('• ' + c, 13, CW, false).forEach((l) => put(l, 13, false, 0.1, 3)));
    newPage();

    // rodapé em todas as páginas
    const n = pages.length;
    pages.forEach((p, i) => {
      p.push('0.55 g BT /F1 9 Tf ' + M + ' 34 Td (' + pdfEsc(winAnsi('Vortex · exportado em ' + m.date + ' · página ' + (i + 1) + ' de ' + n)) + ') Tj ET');
    });

    // objetos: 1 catálogo, 2 páginas, 3-4 fontes, 5 info, [6 imagem], depois página+conteúdo
    const base = useImg ? 6 : 5;
    const pageNo = (i) => base + 1 + 2 * i;
    const objs = [];
    objs.push([ascii('<< /Type /Catalog /Pages 2 0 R >>')]);
    objs.push([ascii('<< /Type /Pages /Count ' + n + ' /Kids [' + pages.map((_, i) => pageNo(i) + ' 0 R').join(' ') + '] >>')]);
    objs.push([ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')]);
    objs.push([ascii('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')]);
    objs.push([ascii('<< /Title (' + pdfEsc(winAnsi(m.title)) + ') /Producer (Vortex) /Creator (Vortex) >>')]);
    if (useImg) {
      objs.push([ascii('<< /Type /XObject /Subtype /Image /Width ' + dim.w + ' /Height ' + dim.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + img.length + ' >>\nstream\n'), img, ascii('\nendstream')]);
    }
    pages.forEach((p, i) => {
      const content = ascii(p.join('\n'));
      objs.push([ascii('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Contents ' + (pageNo(i) + 1) + ' 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >>' + (useImg && i === 0 ? ' /XObject << /Im1 6 0 R >>' : '') + ' >> >>')]);
      objs.push([ascii('<< /Length ' + content.length + ' >>\nstream\n'), content, ascii('\nendstream')]);
    });

    const parts = [new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10, 37, 226, 227, 207, 211, 10])]; // %PDF-1.4 + comentário binário
    let offset = parts[0].length;
    const offsets = [];
    objs.forEach((chunks, i) => {
      offsets.push(offset);
      const piece = concat([ascii((i + 1) + ' 0 obj\n')].concat(chunks, [ascii('\nendobj\n')]));
      parts.push(piece);
      offset += piece.length;
    });
    const pad = (v) => String(v).padStart(10, '0');
    let xref = 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    offsets.forEach((o) => { xref += pad(o) + ' 00000 n \n'; });
    xref += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R /Info 5 0 R >>\nstartxref\n' + offset + '\n%%EOF\n';
    parts.push(ascii(xref));
    return concat(parts);
  }

  /* ---------- Word (.docx): um ZIP simples com XML ---------- */
  const CRC_T = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function zipStore(files) { // sem compressão: mais simples e abre em qualquer programa
    const now = new Date();
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const chunks = [];
    const central = [];
    let offset = 0;
    files.forEach((f) => {
      const name = enc.encode(f.name);
      const crc = crc32(f.data);
      const lh = new Uint8Array(30 + name.length);
      const v = new DataView(lh.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, 0, true);
      v.setUint16(10, dosTime, true); v.setUint16(12, dosDate, true); v.setUint32(14, crc, true);
      v.setUint32(18, f.data.length, true); v.setUint32(22, f.data.length, true); v.setUint16(26, name.length, true); v.setUint16(28, 0, true);
      lh.set(name, 30);
      chunks.push(lh, f.data);
      const ch = new Uint8Array(46 + name.length);
      const c = new DataView(ch.buffer);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true);
      c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true); c.setUint16(28, name.length, true);
      c.setUint32(42, offset, true);
      ch.set(name, 46);
      central.push(ch);
      offset += lh.length + f.data.length;
    });
    const cdSize = central.reduce((n, c) => n + c.length, 0);
    const end = new Uint8Array(22);
    const e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
    return concat(chunks.concat(central, [end]));
  }

  const xml = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function makeDocx(m) {
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
    const run = (text, opts) => {
      const o = opts || {};
      return '<w:r><w:rPr>' + (o.bold ? '<w:b/>' : '') + (o.color ? '<w:color w:val="' + o.color + '"/>' : '') + (o.size ? '<w:sz w:val="' + o.size + '"/><w:szCs w:val="' + o.size + '"/>' : '') +
        '</w:rPr><w:t xml:space="preserve">' + xml(text) + '</w:t></w:r>';
    };
    const para = (inner, after) => '<w:p><w:pPr><w:spacing w:after="' + (after === undefined ? 120 : after) + '"/></w:pPr>' + inner + '</w:p>';

    const img = m.image ? dataUrlToBytes(m.image) : null;
    const dim = img ? jpegSize(img) : null;
    const useImg = Boolean(img && dim);
    const EMU = 1440000; // 4 cm

    let body = para(run(m.title, { bold: true, size: 52 }), 40) + para(run(m.kind, { color: '666666', size: 24 }), 240);
    if (useImg) {
      body += '<w:p><w:pPr><w:spacing w:after="240"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + EMU + '" cy="' + EMU + '"/>' +
        '<wp:docPr id="1" name="Imagem" descr="Imagem da ficha"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
        '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="imagem.jpg"/><pic:cNvPicPr/></pic:nvPicPr>' +
        '<pic:blipFill><a:blip r:embed="rIdImg"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
        '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + EMU + '" cy="' + EMU + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
    }
    m.fields.forEach((f) => { body += para(run(f[0] + ': ', { bold: true }) + run(f[1] || '—')); });
    body += para(run('Campanhas', { bold: true }), 60);
    if (!m.campaigns.length) body += para(run('—'), 60);
    m.campaigns.forEach((c) => { body += para(run('• ' + c), 40); });
    body += para(run('Exportado do Vortex em ' + m.date, { color: '888888', size: 18 }), 0).replace('<w:spacing w:after="0"/>', '<w:spacing w:before="360" w:after="0"/>');

    const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + NS + '><w:body>' + body +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>';
    const stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>';
    const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>';
    const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
    const docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      (useImg ? '<Relationship Id="rIdImg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.jpeg"/>' : '') + '</Relationships>';

    const files = [
      { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
      { name: '_rels/.rels', data: enc.encode(rootRels) },
      { name: 'word/document.xml', data: enc.encode(documentXml) },
      { name: 'word/styles.xml', data: enc.encode(stylesXml) },
      { name: 'word/_rels/document.xml.rels', data: enc.encode(docRels) }
    ];
    if (useImg) files.push({ name: 'word/media/image1.jpeg', data: img });
    return zipStore(files);
  }

  /* ---------- Baixar e copiar ---------- */
  function downloadFile(bytes, mime, filename) {
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) { /* segue para o método antigo */ }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  /* =====================================================================
     6. ACESSO RÁPIDO (localStorage), AJUDA E PEÇAS DE INTERFACE
     ===================================================================== */
  let db = LocalDb;
  let quickKey = 'vortex.quick.v1.local'; // uma lista por modo, para nunca misturar local com Firebase

  function quickLoad() {
    try { const l = JSON.parse(localStorage.getItem(quickKey)); return Array.isArray(l) ? l : []; }
    catch (e) { return []; }
  }
  function quickSave(list) {
    try { localStorage.setItem(quickKey, JSON.stringify(list)); }
    catch (e) { toast('Não foi possível salvar o acesso rápido: o armazenamento está cheio.'); }
  }
  const quickEntry = (c) => ({ id: c.id, name: c.name, type: c.type, thumb: c.thumb || '', species: c.species || '', mine: Boolean(c.mine) });
  const quickHas = (id) => quickLoad().some((x) => x.id === id);
  function quickAdd(c) { // entra no começo da lista
    quickSave([quickEntry(c)].concat(quickLoad().filter((x) => x.id !== c.id)));
  }
  function quickUpdate(c, toFront) { // só mexe em quem já está na lista
    const list = quickLoad();
    const i = list.findIndex((x) => x.id === c.id);
    if (i < 0) return;
    list.splice(i, 1);
    if (toFront) list.unshift(quickEntry(c)); else list.splice(i, 0, quickEntry(c));
    quickSave(list);
  }
  const quickRemove = (id) => quickSave(quickLoad().filter((x) => x.id !== id));

  // Confere cada item da lista no banco: atualiza nome e imagem, tira o que foi apagado
  async function refreshQuick() {
    const list = quickLoad();
    const out = [];
    await Promise.all(list.map(async (q, i) => {
      try {
        const c = await db.getCharacter(q.id);
        if (c) out[i] = quickEntry(c);
      } catch (e) { console.warn(e); out[i] = q; } // sem conexão: mantém como estava
    }));
    const clean = out.filter(Boolean);
    quickSave(clean);
    return clean;
  }

  /* ---------- Perfil (falso login) ----------
     Um código de 1 a 6 dígitos abre o perfil vinculado a ele, em qualquer aparelho.
     O perfil guarda personagens, campanhas (e quais você mestra) e favoritos.
     Não é senha: quem souber o código abre o perfil. */
  let profileKey = 'vortex.profile.v1.local';
  let profile = null; // { code, name, chars, camps, gm, favs }
  const CHAR_FAV_KEY = 'vortex.charfav.v1';
  const PROFILE_LISTS = ['chars', 'camps', 'gm', 'favs'];
  const idList = (l) => (Array.isArray(l) ? l.filter((x) => typeof x === 'string' && x).slice(0, 300) : []);
  function normProfile(p, code) {
    const out = { code, name: String((p && p.name) || '').slice(0, 40) };
    PROFILE_LISTS.forEach((k) => { out[k] = idList(p && p[k]); });
    return out;
  }
  const validCode = (code) => /^[0-9]{1,6}$/.test(code);

  let profileQueue = Promise.resolve();
  function profileSave() { // em fila: duas mudanças seguidas nunca se atropelam
    if (!profile) return profileQueue;
    const snap = JSON.parse(JSON.stringify(profile));
    profileQueue = profileQueue.then(() => db.saveProfile(snap.code, snap))
      .catch((e) => { console.warn(e); toast('Não foi possível salvar o perfil. ' + errorMessage(e)); });
    return profileQueue;
  }
  const inProfile = (list, id) => Boolean(profile && profile[list].indexOf(id) >= 0);
  const isMyChar = (id) => inProfile('chars', id);
  const isGmOf = (id) => inProfile('gm', id);
  function profileSet(list, id, on) { // devolve true se mudou algo
    if (!profile || !id || inProfile(list, id) === on) return false;
    profile[list] = on ? [id].concat(profile[list]).slice(0, 300) : profile[list].filter((x) => x !== id);
    if (list === 'chars' && !on) profile.favs = profile.favs.filter((x) => x !== id);
    if (list === 'camps' && !on) profile.gm = profile.gm.filter((x) => x !== id);
    profileSave();
    renderProfileBtn();
    return true;
  }

  // Favoritos de personagem: ficam no perfil quando há login; senão, neste aparelho
  function localCharFavs() {
    try { const l = JSON.parse(localStorage.getItem(CHAR_FAV_KEY)); return idList(l); }
    catch (e) { return []; }
  }
  const charFavs = () => new Set(profile ? profile.favs : localCharFavs());
  function charFavToggle(id) {
    const on = !charFavs().has(id);
    if (profile) {
      if (on) profile.chars = [id].concat(profile.chars.filter((x) => x !== id)).slice(0, 300); // favoritar também salva no perfil
      profileSet('favs', id, on);
    } else {
      const l = localCharFavs().filter((x) => x !== id);
      if (on) l.unshift(id);
      try { localStorage.setItem(CHAR_FAV_KEY, JSON.stringify(l.slice(0, 300))); } catch (e) { toast('O armazenamento está cheio.'); }
    }
    return on;
  }
  function charStar(c, onToggle) {
    const b = h('button', 'star');
    b.type = 'button';
    const paint = (on) => {
      b.textContent = on ? '★' : '☆';
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', (on ? 'Tirar dos favoritos: ' : 'Favoritar: ') + c.name);
      b.title = on ? 'Favorito' : 'Favoritar';
    };
    paint(charFavs().has(c.id));
    b.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); paint(charFavToggle(c.id)); if (onToggle) onToggle(); });
    return b;
  }

  function renderProfileBtn() {
    const b = $('#profile-btn');
    if (!b) return;
    b.textContent = profile ? (profile.name || 'Perfil ' + profile.code) : 'Entrar';
    b.title = profile ? 'Abrir o perfil (código ' + profile.code + ')' : 'Entrar com um código de perfil';
    b.classList.toggle('profile-btn--on', Boolean(profile));
  }

  function profileUse(p, code) {
    profile = normProfile(p, code);
    try { localStorage.setItem(profileKey, code); } catch (e) { /* segue só nesta visita */ }
    renderProfileBtn();
  }
  function profileLogout() {
    profile = null;
    try { localStorage.removeItem(profileKey); } catch (e) { /* nada */ }
    renderProfileBtn();
  }
  async function profileRestore() {
    let code = '';
    try { code = localStorage.getItem(profileKey) || ''; } catch (e) { /* sem armazenamento */ }
    if (!validCode(code)) return;
    try {
      const p = await db.getProfile(code);
      if (p) profileUse(p, code); else profileLogout();
    } catch (e) { console.warn(e); }
  }

  let toastTimer;
  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 4200);
  }

  const openDialog = (dlg) => { play('open'); if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', ''); };

  // Pergunta de uma escolha (ex.: a perícia do Doutor). Devolve o valor ou null.
  function askChoice(title, label, hint, options, ok) {
    const dlg = document.getElementById('choice-dialog');
    document.getElementById('choice-ok').textContent = ok || 'Escolher';
    const sel = document.getElementById('choice-select');
    document.getElementById('choice-title').textContent = title;
    document.getElementById('choice-label').textContent = label;
    document.getElementById('choice-hint').textContent = hint;
    sel.replaceChildren(...options.map((o) => { const op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; return op; }));
    return new Promise((resolve) => {
      const done = (v) => { dlg.removeEventListener('close', onClose); if (dlg.open) dlg.close(); resolve(v); };
      const onClose = () => done(dlg.returnValue === 'ok' ? sel.value : null);
      dlg.returnValue = '';
      dlg.addEventListener('close', onClose);
      openDialog(dlg);
      sel.focus();
    });
  }
  const closeDialog = (dlg) => { if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open'); };

  // Senha de campanha: só o hash (SHA-256 com o ID) fica salvo; quem acerta a senha fica liberado neste aparelho
  async function campHash(id, pw) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('vortex:' + id + ':' + pw));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  const UNLOCK_KEY = 'vortex.unlock.v1';
  const unlocked = () => { try { return new Set(JSON.parse(localStorage.getItem(UNLOCK_KEY) || '[]')); } catch (e) { return new Set(); } };
  function unlock(id) { const s = unlocked(); s.add(id); try { localStorage.setItem(UNLOCK_KEY, JSON.stringify(Array.from(s).slice(-100))); } catch (e) { /* só nesta visita */ } }
  let secretDlg = null;
  function askSecret(title, text) {
    if (!secretDlg) {
      secretDlg = document.createElement('dialog');
      secretDlg.className = 'dialog startdlg';
      secretDlg.setAttribute('aria-labelledby', 'secret-title');
      document.body.append(secretDlg);
    }
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (done) return; done = true; resolve(v); if (secretDlg.open) closeDialog(secretDlg); };
      const inp = h('input', 'input');
      inp.type = 'password';
      inp.id = 'secret-input';
      inp.autocomplete = 'off';
      inp.maxLength = 60;
      const ok = h('button', 'btn btn--primary btn--sm', 'Entrar');
      ok.type = 'submit';
      const cancel = h('button', 'btn btn--ghost btn--sm', 'Cancelar');
      cancel.type = 'button';
      cancel.addEventListener('click', () => finish(null));
      const form = h('form', 'startdlg__body', h('h2', '', title), h('p', 'field__hint', text),
        h('label', 'field__label', 'Senha'), inp, h('div', 'dialog__actions', cancel, ok));
      form.querySelector('h2').id = 'secret-title';
      form.querySelector('label').htmlFor = 'secret-input';
      form.addEventListener('submit', (ev) => { ev.preventDefault(); finish(inp.value); });
      secretDlg.onclose = () => { if (!secretDlg.open) finish(null); }; // o "close" da tentativa anterior chega atrasado
      secretDlg.replaceChildren(form);
      openDialog(secretDlg);
      inp.focus();
    });
  }
  // pede a senha quando a campanha tem uma e esta pessoa ainda não entrou; true = pode seguir
  async function passGate(camp) {
    if (!camp || !camp.passHash || camp.isOwner || isGmOf(camp.id) || unlocked().has(camp.id) || (profile && profile.camps.indexOf(camp.id) >= 0)) return true;
    for (let tries = 0; tries < 3; tries++) {
      const pw = await askSecret('Senha de ' + camp.name, tries ? 'Senha errada. Tente de novo.' : 'O mestre pôs uma senha para entrar nesta campanha.');
      if (pw === null) return false;
      if (await campHash(camp.id, pw) === camp.passHash) { unlock(camp.id); return true; }
    }
    toast('Senha errada.');
    return false;
  }

  function askConfirm({ title, text, ok }) {
    const dlg = $('#confirm');
    if (typeof dlg.showModal !== 'function') return Promise.resolve(window.confirm(title + '\n' + text));
    $('#confirm-title').textContent = title;
    $('#confirm-text').textContent = text;
    $('#confirm-ok').textContent = ok || 'Confirmar';
    return new Promise((resolve) => {
      dlg.returnValue = '';
      dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
      dlg.showModal();
    });
  }

  function setError(errorEl, inputEl, message) {
    errorEl.textContent = message;
    inputEl.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function setBadge(el, type) {
    el.className = 'badge badge--' + type;
    el.textContent = TYPE_LABEL[type];
  }
  const badge = (type) => { const e = h('span'); setBadge(e, type); return e; };

  function avatar(name, type, thumb) {
    const t = h('span', 'token token--' + type + (thumb ? ' token--img' : ''));
    if (thumb) { const img = h('img'); img.src = thumb; img.alt = ''; t.append(img); }
    else t.textContent = name.trim().charAt(0).toUpperCase();
    return t;
  }

  const formatTime = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

  /* Foto do personagem: recorta em quadrado e reduz, para caber no banco */
  function cropSquare(img, size, quality) {
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#162836';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', quality);
  }
  function fileToImages(file, big, small) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try { resolve({ image: cropSquare(img, big || 320, 0.82), thumb: cropSquare(img, small || 96, 0.75) }); }
        catch (e) { reject(e); }
        finally { URL.revokeObjectURL(url); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new UserError('Não consegui ler essa imagem. Tente um arquivo JPG ou PNG.')); };
      img.src = url;
    });
  }

  /* ---------- Ajuda: passe o mouse ou clique no nome da aba ---------- */
  // Cada tópico pode apontar para um trecho da aba Regras (campo "rule": capítulo/seção).
  // Sem "rule", o balão não mostra o botão "Ver nas regras".
  const TOPICS = {
    fichas: {
      title: 'Personagens e criaturas',
      text: 'Atalho para as fichas que você criou ou fixou. A lista fica salva neste aparelho; o conteúdo das fichas fica no Firebase (ou só no navegador, no modo local). Todas as fichas são públicas e qualquer pessoa pode editar.',
      rule: 'ficha'
    },
    campanhas: {
      title: 'Campanhas',
      text: 'Cada campanha tem um ID de entrada de 6 caracteres. Quem tem o ID vincula um personagem a ela, e um personagem pode estar em quantas campanhas quiser.',
      rule: null
    },
    'dados-basicos': {
      title: 'Dados básicos',
      text: 'Nome, espécime, idade, altura, sexo e origem. O nome é único. "Buscar no banco" vincula um espécime: as habilidades raciais dele entram sozinhas na ficha, com a mecânica (vida base, UP iniciais, núcleo).',
      rule: 'ficha/modelo-de-ficha'
    },
    rolagens: {
      title: 'Dados',
      text: 'Registro da mesa: testes, ataques, defesas, iniciativa e poderes usados aparecem aqui, em nome de cada personagem. Todos os testes usam 2d6 + Atributo + Perícia, montados pela ficha no painel do personagem.',
      rule: 'testes-e-dados/rolagens'
    },
    combate: {
      title: 'Combate',
      text: 'O mestre adiciona inimigos da lista aberta (NPCs criados na Oficina por qualquer pessoa). Cada um começa a cena com a defesa mínima; "Rolar defesa" faz 2d6 + Corpo + Resistência e fica com a mínima se o teste for menor. Na vez de cada um, o menu Ações / Itens / Diversos mostra as ações básicas com o custo delas (padrão, movimento, bônus, completa) e risca o que já foi gasto no turno. Itens mostra só o que o personagem tem: pegar uma arma custa movimento (pistola, bônus; item de Saque, grátis uma vez por turno) e precisa de mão livre. Manobras são Luta contra a Resistência ou os Reflexos do alvo e podem derrubar, agarrar, desarmar ou abrir a guarda (a defesa cai). Para atacar, marque um ou mais alvos e divida a cadência entre eles: um teste vale para todos os alvos, o dano é ataque – defesa (mínimo 1) vezes os disparos e entra na ordem Escudo → Blindagem → Vida. Fraqueza dobra o dano naquela camada; resistência corta pela metade; o dobro não passa para a camada seguinte.',
      rule: 'ataque-e-defesa'
    },
    candidatos: {
      title: 'Candidatos',
      text: 'Personagens e criaturas vinculados à campanha. Toque num nome para ver a ficha resumida e abrir a ficha completa.',
      rule: null
    },
    recursos: {
      title: 'Recursos',
      text: 'Nada aqui é digitado: PV = 5 + Corpo × 5, PE = 5 + Essência × 5, PA = Precisão (mínimo 1). A barra de resistência é uma só e junta PV, Blindagem e Escudo, cada um com a sua cor; itens equipados, poderes e o espécime somam o tipo deles sozinhos. Você só marca o valor atual; "Sofrer dano" desconta na ordem Escudo → Blindagem → Vida.',
      rule: 'atributos-e-recursos/recursos'
    },
    pericias: {
      title: 'Perícias',
      text: 'Bônus de +1 a +3. O número ao lado já é o total do teste (atributo + perícia), com a penalidade da armadura equipada em Manha, Reflexos, Sentidos e Operações. Abaixo ficam as 4 proficiências iniciais.',
      rule: 'pericias'
    },
    progressao: {
      title: 'Progressão',
      text: '10 XP viram 1 UP. A cada UP par alcançado, 2 benefícios entre +5 PV, +5 PE e +1 PA; a cada ímpar, +1 ponto de perícia. UP de origem não contam para isso. Poderes custam UP; cada UP investido em perícias dá +3 pontos. Por 1 UP cada: Doutor (limite +4 numa perícia) e proficiências extras de arma ou armadura (cada uma dá +1 ponto de perícia).',
      rule: 'progressao'
    },
    poderes: {
      title: 'Poderes',
      text: 'Poderes e habilidades vêm do banco (os das regras já estão lá; crie os seus na aba Itens). Os bônus de um poder entram sozinhos nos recursos.',
      rule: 'habilidades'
    },
    inventario: {
      title: 'Inventário',
      text: 'Em cima, o que está equipado: núcleo, corpo (vestíveis e próteses por região), armadura e as duas mãos; arma de duas mãos ocupa as duas. Embaixo, a mochila. Passe o mouse (ou toque) num bloco para ver os detalhes e equipar; também dá para arrastar. Carga = 2 + Corpo × 5 + Precisão + Essência × 2, e só a mochila conta. Em "Detalhes" ficam os slots de mod, propriedade e acessórios.',
      rule: 'carga'
    },
    banco: {
      title: 'Banco de dados',
      text: 'Tudo o que é salvo na Oficina, mais o catálogo oficial das regras. É aqui que a pesquisa dos slots e do inventário procura. A estrela favorita (fica neste aparelho); só quem criou edita ou exclui.',
      rule: null
    },
    busca: {
      title: 'Buscar',
      text: 'Procura fichas por nome, espécie ou origem; basta o começo de uma palavra. Todas as fichas são públicas.',
      rule: null
    }
  };

  const pop = $('#help-pop');
  const helpState = { trigger: null, pinned: false, openTimer: 0, closeTimer: 0 };
  let rulesBack = '#/home'; // de onde a pessoa veio ao abrir as regras
  let rulesFromHelp = false; // chegou às regras pelo botão do balão de ajuda?

  function placeHelp(trigger) {
    const heading = trigger.parentElement;
    heading.insertAdjacentElement('afterend', pop);
    pop.hidden = false;
    pop.style.left = '0px';
    pop.style.top = (heading.offsetTop + heading.offsetHeight + 4) + 'px';
    const r = pop.getBoundingClientRect();
    const over = r.right - (window.innerWidth - 8);
    if (over > 0) pop.style.left = -over + 'px';
    if (pop.getBoundingClientRect().left < 8) pop.style.left = (8 - pop.getBoundingClientRect().left) + 'px';
  }

  function openHelp(trigger, pin) {
    clearTimeout(helpState.openTimer);
    clearTimeout(helpState.closeTimer);
    const topic = TOPICS[trigger.dataset.help];
    if (!topic) return;
    if (helpState.trigger && helpState.trigger !== trigger) helpState.trigger.setAttribute('aria-expanded', 'false');
    helpState.trigger = trigger;
    helpState.pinned = Boolean(pin);
    $('#help-pop-title').textContent = topic.title;
    $('#help-pop-text').textContent = topic.text;
    const link = $('#help-pop-link');
    link.hidden = !topic.rule;
    if (topic.rule) link.href = '#/rules/' + topic.rule;
    trigger.setAttribute('aria-expanded', 'true');
    trigger.setAttribute('aria-controls', 'help-pop');
    placeHelp(trigger);
  }

  function closeHelp(returnFocus) {
    clearTimeout(helpState.openTimer);
    clearTimeout(helpState.closeTimer);
    const t = helpState.trigger;
    pop.hidden = true;
    helpState.trigger = null;
    helpState.pinned = false;
    if (t) { t.setAttribute('aria-expanded', 'false'); if (returnFocus) t.focus(); }
  }

  const scheduleHelpClose = () => {
    clearTimeout(helpState.closeTimer);
    if (!helpState.pinned) helpState.closeTimer = setTimeout(() => closeHelp(false), 250);
  };

  $$('.help').forEach((t) => {
    t.setAttribute('aria-expanded', 'false');
    t.addEventListener('mouseenter', () => {
      clearTimeout(helpState.closeTimer);
      if (helpState.trigger !== t) helpState.openTimer = setTimeout(() => openHelp(t, false), 250);
    });
    t.addEventListener('mouseleave', () => { clearTimeout(helpState.openTimer); scheduleHelpClose(); });
    t.addEventListener('click', () => {
      if (helpState.trigger === t && helpState.pinned) closeHelp(false); else openHelp(t, true);
    });
  });
  pop.addEventListener('mouseenter', () => clearTimeout(helpState.closeTimer));
  pop.addEventListener('mouseleave', scheduleHelpClose);
  $('#help-pop-link').addEventListener('click', () => { rulesBack = location.hash || '#/home'; rulesFromHelp = true; closeHelp(false); });
  document.addEventListener('click', (ev) => {
    if (!helpState.trigger) return;
    if (ev.target.closest('.help') || ev.target.closest('#help-pop')) return;
    closeHelp(false);
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && helpState.trigger) closeHelp(true);
  });

  /* Linhas de lista */
  function characterRow(c) {
    const open = h('button', 'row__open',
      avatar(c.name, c.type, c.thumb),
      h('span', 'row__main', h('span', 'row__title', c.name), h('span', 'row__meta', c.species)),
      badge(c.type));
    open.type = 'button';
    open.addEventListener('click', () => go('character', c.id));
    // quem criou pode excluir; ficha de outra pessoa só sai da lista
    const act = h('button', 'btn btn--sm ' + (c.mine ? 'btn--danger' : 'btn--ghost'), c.mine ? 'Excluir' : 'Remover');
    act.type = 'button';
    act.setAttribute('aria-label', (c.mine ? 'Excluir ' : 'Tirar do acesso rápido: ') + c.name);
    act.addEventListener('click', async () => {
      if (c.mine) { if (await deleteCharacterFlow(c)) views.personagens(); }
      else { quickRemove(c.id); views.personagens(); }
    });
    return h('li', 'row', open, charStar(c, () => renderFavBlock()), act);
  }

  function searchRow(c) {
    const a = h('a', 'row__open',
      avatar(c.name, c.type, c.thumb),
      h('span', 'row__main', h('span', 'row__title', c.name), h('span', 'row__meta', [c.species, c.origin].filter(Boolean).join(' · '))),
      badge(c.type));
    a.href = '#/character/' + encodeURIComponent(c.id);
    return h('li', 'row', a, charStar(c, () => renderFavBlock()));
  }

  // Linha de personagem do perfil: abre, favorita e sai do perfil
  function profileCharRow(c, onChange) {
    const a = h('a', 'row__open',
      avatar(c.name, c.type, c.thumb),
      h('span', 'row__main', h('span', 'row__title', c.name), h('span', 'row__meta', [c.species, c.origin].filter(Boolean).join(' · '))),
      badge(c.type));
    a.href = '#/character/' + encodeURIComponent(c.id);
    const out = h('button', 'btn btn--ghost btn--sm', 'Tirar');
    out.type = 'button';
    out.setAttribute('aria-label', 'Tirar do perfil: ' + c.name);
    out.addEventListener('click', () => { profileSet('chars', c.id, false); toast(c.name + ' saiu do perfil.'); onChange(); });
    return h('li', 'row', a, charStar(c, onChange), out);
  }

  // Busca as fichas de uma lista de IDs; tira do perfil as que foram apagadas
  async function loadChars(ids) {
    const list = await Promise.all(ids.map((id) => db.getCharacter(id).then((c) => c || { gone: id }).catch(() => null)));
    list.filter((c) => c && c.gone).forEach((c) => profileSet('chars', c.gone, false));
    return list.filter((c) => c && !c.gone);
  }

  // Favoritos na tela de Personagens
  async function renderFavBlock() {
    const ids = Array.from(charFavs());
    const list = ids.length ? await loadChars(ids) : [];
    $('#fav-list').replaceChildren(...list.map(searchRowPlain));
    $('#fav-block').hidden = list.length === 0;
  }
  function searchRowPlain(c) { // sem a estrela recarregar a própria lista no meio do clique
    const a = h('a', 'row__open',
      avatar(c.name, c.type, c.thumb),
      h('span', 'row__main', h('span', 'row__title', c.name), h('span', 'row__meta', [c.species, c.origin].filter(Boolean).join(' · '))),
      badge(c.type));
    a.href = '#/character/' + encodeURIComponent(c.id);
    return h('li', 'row', a, charStar(c, () => { renderFavBlock(); views.personagens(); }));
  }

  function campaignRow(c, action) {
    const open = h('a', 'row__open',
      h('span', 'row__main', h('span', 'row__title', c.name), h('span', 'row__meta', c.isOwner ? 'Criada por você' : isGmOf(c.id) ? 'Você é o mestre' : '')),
      h('code', 'code-tag', c.id));
    open.href = '#/campaign/' + encodeURIComponent(c.id);
    const kids = [open];
    if (action && action.pad) { // ocupa o lugar do botão das outras linhas, para os códigos ficarem na mesma coluna
      const pad = h('span', 'btn btn--danger btn--sm row__pad', action.label);
      pad.setAttribute('aria-hidden', 'true');
      kids.push(pad);
    } else if (action) {
      const btn = h('button', 'btn btn--danger btn--sm', action.label);
      btn.type = 'button';
      btn.setAttribute('aria-label', action.label + ' ' + c.name);
      btn.addEventListener('click', action.onClick);
      kids.push(btn);
    }
    return h('li', 'row', ...kids);
  }

  // Resumo de combate de um candidato: recursos atuais, defesa, carga e pendências
  function memberStats(c) {
    if (!c.sheet || !c.sheet.attrs) return [];
    let out = [];
    try {
      const cc = Object.assign({}, c, { sheet: normSheet(c.sheet) });
      const s = cc.sheet;
      const m = compute(cc);
      const res = [[m.base, m.base === 'pv' ? 'PV' : m.base === 'blindagem' ? 'Blindagem' : 'Escudo'], ['pe', 'PE'], ['pa', 'PA']]
        .filter((r) => m.max[r[0]] > 0).map((r) => r[1] + ' ' + getCur(s, r[0], m.max[r[0]]) + '/' + m.max[r[0]]);
      out = [h('dt', '', 'Recursos'), h('dd', '', res.join(' · ')),
        h('dt', '', 'Defesa'), h('dd', '', 'mínima ' + m.defMin + (m.pen ? ' · penalidade –' + m.pen : '')),
        h('dt', '', 'Carga'), h('dd', m.over ? 'member__warn' : '', fmtNum(m.cargaUsed) + ' / ' + fmtNum(m.cargaMax) + (m.over ? ' · sobrecarregado' : ''))];
      const weapons = s.inventory.filter((i) => i.slot && isWeapon(i.kind)).map((i) => i.name);
      if (weapons.length) out.push(h('dt', '', 'Em mãos'), h('dd', '', weapons.join(', ')));
      const pend = Math.max(0, m.picksAllowed - m.picksUsed) + Math.max(0, m.attrAllowed - m.attrUsed) + Math.max(0, m.upTotal - m.upSpent) + Math.max(0, m.skillBudget - m.skillUsed);
      if (pend > 0) out.push(h('dt', '', 'Pendências'), h('dd', 'member__warn', 'tem pontos para distribuir'));
    } catch (err) { console.warn(err); }
    return out;
  }

  // Painel do candidato: dados, resumo de combate, dinheiro nesta campanha e ações
  function fillMemberPanel(m, panel) {
    const pic = h('span', 'member__pic token token--' + m.type);
    if (m.image) { const img = h('img'); img.src = m.image; img.alt = ''; pic.append(img); pic.classList.add('token--img'); }
    else pic.textContent = m.name.trim().charAt(0).toUpperCase();
    const link = h('a', 'btn btn--ghost btn--sm', 'Abrir ficha completa');
    link.href = '#/character/' + encodeURIComponent(m.characterId);
    const money = num(m.sheet && m.sheet.money && currentCamp ? m.sheet.money[currentCamp.id] : 0);
    const info = h('div', 'member__info',
      ...(loreButton(m.name, 'Lore do personagem', m.sheet && m.sheet.lore) ? [h('p', 'member__lore', loreButton(m.name, 'Lore do personagem', m.sheet.lore), ' Lore de ' + m.name)] : []),
      h('dl', 'member__data',
        h('dt', '', 'Espécie'), h('dd', '', m.species || '—'),
        h('dt', '', 'Idade'), h('dd', '', m.age || '—'),
        h('dt', '', 'Origem'), h('dd', '', m.origin || '—'),
        ...(m.sheet && m.sheet.attrs ? [h('dt', '', 'Atributos'), h('dd', '', 'Corpo ' + (m.sheet.attrs.corpo || 0) + ' · Precisão ' + (m.sheet.attrs.precisao || 0) + ' · Essência ' + (m.sheet.attrs.essencia || 0))] : []),
        ...memberStats(m),
        h('dt', '', 'Dinheiro'), h('dd', 'member__money', fmtCronos(money) + ' Cronos (nesta campanha)')),
      link);
    if (currentCamp && (m.mine || currentCamp.gm)) info.append(moneyEditor(m, panel));
    if (m.mine && m.sheet) { // as ações ficam no painel do personagem, no topo da campanha
      const play = h('button', 'btn btn--primary btn--sm', 'Jogar com ' + m.name);
      play.type = 'button';
      play.addEventListener('click', () => playAs(m.characterId));
      info.append(play);
    }
    // o mestre sempre pode tirar qualquer personagem; o jogador tira os próprios
    if (currentCamp && (currentCamp.gm || m.mine)) {
      const out = h('button', 'btn btn--danger btn--sm', currentCamp.gm ? 'Tirar da campanha' : 'Sair da campanha');
      out.type = 'button';
      out.dataset.fid = 'member-out-' + m.characterId;
      out.addEventListener('click', () => removeFromCamp(m, out));
      info.append(out);
    }
    panel.replaceChildren(pic, info);
  }

  async function removeFromCamp(m, btn) {
    const gm = currentCamp.gm;
    const ok = await askConfirm({
      title: (gm ? 'Tirar ' + m.name + ' da campanha?' : 'Sair de ' + currentCamp.name + '?'),
      text: gm ? m.name + ' sai do grupo e do combate. A ficha continua salva; dá para pôr de novo depois.' : m.name + ' deixa de participar. Você pode entrar de novo com o ID de entrada.',
      ok: gm ? 'Tirar' : 'Sair'
    });
    if (!ok) return;
    if (btn) btn.disabled = true;
    try {
      if (gm) await db.removeMember(currentCamp.id, m.characterId);
      else await db.leaveCampaign(currentCamp.id, m.characterId);
      const id = 'chr:' + m.characterId;
      if (gm && scene) { // sai da ordem, de "fora do combate" e do time
        const next = sceneBase();
        dropFromOrder(next, id);
        next.out = sceneOut().filter((x) => x !== id);
        if (next.team && next.team[id]) { next.team = Object.assign({}, next.team); delete next.team[id]; }
        await saveScene(next);
      }
      toast(m.name + ' saiu da campanha.');
      views.campaign(currentCamp.id);
    } catch (err) { if (btn) btn.disabled = false; toast(errorMessage(err)); }
  }

  const memberAtk = {}; // escolhas de ataque de cada personagem, enquanto a página estiver aberta
  const fmtCronos = (n) => Math.round(n).toLocaleString('pt-BR');

  // Altera a ficha de um candidato a partir da campanha: lê a versão atual antes de salvar
  async function patchMemberSheet(m, fn) {
    const fresh = await db.getCharacter(m.characterId);
    if (!fresh) throw new UserError('Essa ficha não existe mais.');
    const sheet = normSheet(fresh.sheet);
    fn(sheet);
    guideSync(sheet); // build guiada: o UP ganho na campanha já entra na ficha
    await db.saveCharacter(m.characterId, { sheet });
    m.sheet = sheet;
    return sheet;
  }

  function moneyEditor(m, panel) {
    const inp = h('input', 'input');
    inp.type = 'number';
    inp.min = '0';
    inp.step = '1';
    inp.inputMode = 'numeric';
    inp.placeholder = 'Valor em Cronos';
    inp.id = 'money-' + m.characterId;
    inp.setAttribute('aria-label', 'Valor em Cronos para ' + m.name);
    const act = (label, sign) => {
      const b = h('button', 'btn btn--ghost btn--sm', label);
      b.type = 'button';
      b.addEventListener('click', async () => {
        const v = Math.round(num(inp.value));
        if (v <= 0) { inp.focus(); return; }
        b.disabled = true;
        try {
          await patchMemberSheet(m, (s) => {
            s.money = Object.assign({}, s.money);
            s.money[currentCamp.id] = Math.max(0, num(s.money[currentCamp.id]) + sign * v);
          });
          toast((sign > 0 ? '+' : '–') + fmtCronos(v) + ' Cronos para ' + m.name + '.');
          fillMemberPanel(m, panel);
          renderShops();
        } catch (err) { toast(errorMessage(err)); b.disabled = false; }
      });
      return b;
    };
    return h('div', 'money-edit', inp, act('Adicionar', 1), act('Retirar', -1));
  }

  // Rolagem feita a partir da campanha, em nome de um personagem seu
  async function campaignRoll(m, r) {
    if (r.expr !== 'ação') play('dice');
    try {
      await db.addRoll(currentCamp.id, {
        characterId: m.characterId, characterName: m.name, characterType: m.type,
        expr: r.expr, label: r.label, detail: r.detail, total: r.total, flag: r.flag
      });
    } catch (err) { toast(errorMessage(err)); }
  }

  // Candidato: toque no nome abre a ficha resumida, sem sair da campanha
  function memberRow(m) {
    const panelId = 'member-' + m.characterId;
    const toggle = h('button', 'row__open member__toggle',
      avatar(m.name, m.type, m.thumb),
      h('span', 'row__main', h('span', 'row__title', m.name), h('span', 'row__meta', m.mine ? 'Seu personagem' : m.species)),
      badge(m.type));
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', panelId);

    const panel = h('div', 'member__panel');
    fillMemberPanel(m, panel);
    panel.id = panelId;
    panel.hidden = true;

    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      panel.hidden = open;
    });
    return h('li', 'member', toggle, panel);
  }

  function rollRow(r) {
    const flagText = r.flag === 'crit' ? 'Sucesso crítico!' : r.flag === 'fail' ? 'Falha crítica' : r.flag === 'falha' ? 'Falha completa' : '';
    return h('li', 'roll' + (r.flag ? ' roll--' + (r.flag === 'falha' ? 'fail' : r.flag) : ''),
      avatar(r.characterName, r.characterType, ''),
      h('div', 'roll__body',
        h('div', 'roll__head', h('strong', '', r.characterName), h('span', 'roll__time', formatTime(r.createdAt)), flagText ? h('span', 'roll__flag', flagText) : null),
        h('div', 'roll__expr', r.expr + (r.label ? ' · ' + r.label : '')),
        h('div', 'roll__detail', r.detail)),
      h('div', 'roll__total', r.expr === 'ação' ? '✓' : String(r.total)));
  }

  /* Exclusão de personagem (usada no início e na ficha) */
  async function deleteCharacterFlow(c) {
    const ok = await askConfirm({
      title: 'Excluir ' + c.name + '?',
      text: 'A ficha some para todos e o vínculo com as campanhas é apagado. Não dá para desfazer.',
      ok: 'Excluir'
    });
    if (!ok) return false;
    try {
      await db.deleteCharacter(c.id);
      quickRemove(c.id);
      profileSet('chars', c.id, false);
      toast(c.name + ' foi excluído.');
      return true;
    } catch (err) { toast(errorMessage(err)); return false; }
  }

  /* =====================================================================
     7. TELAS: navegação por endereço
        #/home  #/novo  #/personagens  #/campanhas  #/itens
        #/character/ID  #/campaign/ID  #/rules/TÓPICO
     ===================================================================== */
  const views = {};
  let onLeave = null; // cada tela pode registrar uma limpeza (ex.: parar de ouvir os dados)
  let lastCharacterId = null;
  const NAV_FOR = { home: 'home', personagens: 'personagens', campanhas: 'campanhas', itens: 'itens', rules: 'rules' };

  function go(name, param) {
    const next = '#/' + name + (param ? '/' + encodeURIComponent(param) : '');
    if (location.hash === next) render(); else location.hash = next;
  }

  async function render() {
    if (onLeave) { onLeave(); onLeave = null; }
    closeHelp(false);
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    const name = parts[0] || 'home';
    const param = parts[1] ? decodeURIComponent(parts.slice(1).join('/')) : null;
    if (!(name in views)) return go('home');

    if (name !== 'rules') rulesFromHelp = false;
    $('#conteudo').classList.toggle('container--wide', name === 'rules'); // as regras usam a largura toda
    $('#rules-fab').hidden = name !== 'rules';
    const target = $('[data-screen="' + name + '"]');
    $$('[data-screen]').forEach((s) => { s.hidden = s !== target; });
    target.classList.remove('is-entering');
    void target.offsetWidth; // reinicia a animação
    target.classList.add('is-entering');
    $$('[data-nav]').forEach((a) => {
      if (a.dataset.nav === NAV_FOR[name]) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.title = target.dataset.title + ' | Vortex';

    target.setAttribute('aria-busy', 'true'); // esconde "lista vazia" enquanto carrega
    try { await views[name](param); }
    catch (err) { toast(errorMessage(err)); }
    target.removeAttribute('aria-busy');

    if (name === 'personagens' && window.matchMedia('(pointer: fine)').matches) $('#search-input').focus();
    else { const heading = $('h1', target); if (heading) heading.focus({ preventScroll: true }); }
    window.scrollTo(0, 0);
  }

  /* ---------- Início (vitrine) ---------- */
  // Painel: o que a pessoa estava jogando (fichas recentes e campanhas) e atalhos
  views.home = async function showHome() {
    $('#home-hello').textContent = profile && profile.name ? 'Bem-vindo de volta, ' + profile.name : 'Painel do jogador';
    const quick = await refreshQuick().catch(() => []);
    $('#dash-chars').replaceChildren(...quick.slice(0, 5).map(characterRow));
    $('#dash-chars-empty').hidden = quick.length > 0;
    const camps = await db.listMyCampaigns().catch(() => []);
    $('#dash-camps').replaceChildren(...camps.slice(0, 5).map((c) => campaignRow(c)));
    $('#dash-camps-empty').hidden = camps.length > 0;
  };

  /* ---------- Criar personagem ---------- */
  const formCreate = $('#form-create');
  const inCreate = $('#create-name');
  const errCreate = $('#create-error');
  const btnCreate = $('#create-button');

  function applyKind() {
    const el = $('input[name="kind"]:checked', formCreate);
    $('#create-name-label').textContent = el.dataset.label;
    inCreate.placeholder = el.dataset.placeholder;
    btnCreate.textContent = el.dataset.button;
    setError(errCreate, inCreate, '');
  }

  // Avisa enquanto digita se o nome já existe (o bloqueio de verdade acontece ao criar)
  let createSeq = 0;
  const liveCheckCreate = debounce(async () => {
    const seq = createSeq;
    const name = cleanName(inCreate.value);
    if (validateName(name)) return;
    try {
      const taken = await db.nameTaken('character', name);
      if (seq === createSeq && taken) setError(errCreate, inCreate, DUP_CHARACTER);
    } catch (e) { /* a checagem final acontece ao criar */ }
  }, 350);

  $$('input[name="kind"]', formCreate).forEach((r) => r.addEventListener('change', () => {
    createSeq++;
    applyKind();
    liveCheckCreate();
  }));
  inCreate.addEventListener('input', () => { createSeq++; setError(errCreate, inCreate, ''); liveCheckCreate(); });

  formCreate.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const kind = formCreate.elements.kind.value;
    const name = cleanName(inCreate.value);
    const bad = validateName(name);
    if (bad) { setError(errCreate, inCreate, bad); inCreate.focus(); return; }
    btnCreate.disabled = true;
    try {
      const c = await db.createCharacter({ name, type: kind });
      quickAdd(c);
      profileSet('chars', c.id, true);
      inCreate.value = '';
      go('character', c.id);
    } catch (err) {
      setError(errCreate, inCreate, errorMessage(err));
      inCreate.focus();
    } finally { btnCreate.disabled = false; }
  });

  views.novo = async function showNovo() {
    formCreate.reset();
    applyKind();
  };

  async function deleteCampaignFlow(c) {
    const ok = await askConfirm({
      title: 'Excluir ' + c.name + '?',
      text: 'A campanha, a lista de candidatos e o histórico de dados serão apagados para todos. Não dá para desfazer.',
      ok: 'Excluir'
    });
    if (!ok) return false;
    try { await db.deleteCampaign(c.id); profileSet('camps', c.id, false); toast('Campanha excluída.'); return true; }
    catch (err) { toast(errorMessage(err)); return false; }
  }

  /* ---------- Personagens (acesso rápido + busca) ---------- */
  const formSearch = $('#form-search');
  const inSearch = $('#search-input');
  let searchSeq = 0;

  /* Claptrap: buscar o nome dele entre os personagens mostra a ficha dele. Abrir desbloqueia o tema.
     A ficha não salva e o favorito não pega, de propósito. */
  const CLAP_SAVE = ['Erro ao salvar: a ficha do Claptrap é grande demais para o banco. Ele jura que não é.', 'Salvamento recusado. O Claptrap tentou subir as escadas do servidor.', 'Não salvou. Ele estava falando e a conexão desistiu.', 'O banco de dados pediu um minuto de silêncio. Ainda não acabou.'];
  const CLAP_FAV = ['Ninguém favorita o Claptrap. Nem ele mesmo conseguiu.', 'A estrela caiu. Ela também não aguentou ouvir ele falar.', 'Favorito recusado: limite de 0 Claptraps por perfil.', 'Ele agradece a intenção. Muito. Por muito tempo.'];
  const pickOne = (list) => list[Math.floor(Math.random() * list.length)];
  function claptrapRow() {
    const a = h('button', 'row__open secret--claptrap-char',
      h('span', 'token token--personagem clap-token'),
      h('span', 'row__main', h('span', 'row__title', 'Claptrap'), h('span', 'row__meta', 'Robô · CL4P-TP · Unidade de uso geral')),
      badge('personagem'));
    a.type = 'button';
    a.addEventListener('click', openClaptrap);
    const star = h('button', 'star', '☆');
    star.type = 'button';
    star.setAttribute('aria-label', 'Favoritar: Claptrap');
    star.addEventListener('click', (ev) => clapFav(ev, star));
    return h('li', 'row', a, star);
  }
  function clapFav(ev, star) {
    ev.preventDefault();
    ev.stopPropagation();
    star.textContent = '★';
    star.classList.add('star--fall');
    setTimeout(() => { star.textContent = '☆'; star.classList.remove('star--fall'); }, 700);
    toast(pickOne(CLAP_FAV));
  }
  let clapDlg = null;
  function openClaptrap() {
    if (themeState.unlocked.indexOf('claptrap') < 0) { unlockTheme('claptrap'); setTimeout(showClaptrap, 3300); return; }
    showClaptrap();
  }
  function showClaptrap() {
    if (!clapDlg) {
      clapDlg = h('dialog', 'dialog dialog--wide clap');
      clapDlg.setAttribute('aria-labelledby', 'clap-title');
      document.body.append(clapDlg);
    }
    const stat = (label, val, sub) => h('div', 'clap__stat', h('span', 'clap__label', label), h('strong', '', val), h('span', 'clap__sub', sub));
    const portrait = h('img', 'clap__portrait');
    portrait.src = 'img/claptrap.jpg';
    portrait.alt = 'Retrato do Claptrap de capacete do exército';
    const close = h('button', 'btn btn--ghost btn--sm clap__close', 'Fechar');
    close.type = 'button';
    close.addEventListener('click', () => closeDialog(clapDlg));
    const save = h('button', 'btn btn--primary btn--sm', 'Salvar ficha');
    save.type = 'button';
    save.addEventListener('click', () => { save.classList.remove('clap--shake'); void save.offsetWidth; save.classList.add('clap--shake'); toast(pickOne(CLAP_SAVE)); });
    const star = h('button', 'btn btn--ghost btn--sm', '☆ Favoritar');
    star.type = 'button';
    star.addEventListener('click', (ev) => { ev.preventDefault(); star.textContent = '★ Favorito'; setTimeout(() => { star.textContent = '☆ Favoritar'; }, 700); toast(pickOne(CLAP_FAV)); });
    clapDlg.replaceChildren(h('div', 'picker clap__sheet',
      h('div', 'clap__head',
        portrait,
        h('div', 'clap__id',
          h('span', 'badge badge--personagem', 'Personagem'),
          h('h2', 'clap__name', 'Claptrap', h('span', '', ' CL4P-TP')),
          h('p', 'clap__meta', 'Robô · Origem: linha de montagem · Ficha não salva neste aparelho (nem em nenhum outro)')),
        close),
      h('div', 'clap__actions', save, star),
      h('div', 'clap__stats',
        stat('Corpo', '–1', 'uma roda só'), stat('Precisão', '+1', 'acerta às vezes'), stat('Essência', '+3', 'fala por três'),
        stat('Defesa', '6', 'mínima, e olhe lá'), stat('Blindagem', '1/1', 'lata fina'), stat('Deslocamento', '9 m', 'escadas: 0 m')),
      h('div', 'clap__cols',
        h('section', '', h('h3', 'sub-title', 'Perícias'), h('ul', 'clap__list',
          h('li', '', 'Diplomacia +3', h('span', '', ' (ele acha que +10)')), h('li', '', 'Enganação +3'), h('li', '', 'Intimidação +0', h('span', '', ' (ninguém se intimida)')), h('li', '', 'Atletismo –5'))),
        h('section', '', h('h3', 'sub-title', 'Poderes'), h('ul', 'clap__list',
          h('li', '', h('strong', '', 'Falar sem parar. '), 'Custo de uso: 0 PE. Sempre ativo, não desliga.'),
          h('li', '', h('strong', '', 'Dança da vitória. '), 'Usada antes da vitória. Às vezes antes do combate.'),
          h('li', '', h('strong', '', 'Fraqueza: escadas. '), 'Qualquer degrau encerra o turno dele.'))),
        h('section', '', h('h3', 'sub-title', 'Inventário'), h('ul', 'clap__list',
          h('li', '', 'Roda sobressalente ×0'), h('li', '', 'Amigos ×0', h('span', '', ' (procurando)')), h('li', '', 'Capacete do exército, verde')))),
      h('p', 'field__hint', 'Esta ficha não pode ser salva, editada nem favoritada. O tema Claptrap fica no seu Perfil.')));
    openDialog(clapDlg);
  }

  async function runSearch() {
    const seq = ++searchSeq;
    const q = inSearch.value;
    const type = formSearch.elements.stype.value;
    if (!words(q).length) { // personagens só aparecem buscando
      $('#search-list').replaceChildren();
      $('#search-empty').hidden = true;
      $('#search-hint').textContent = 'Digite um nome, espécie ou origem para encontrar fichas.';
      return;
    }
    let list;
    try {
      list = await db.searchCharacters(q.trim(), type); // os termos procuram nome, espécie e origem
    }
    catch (err) {
      if (seq === searchSeq) $('#search-hint').textContent = errorMessage(err);
      return;
    }
    if (seq !== searchSeq) return; // uma busca mais nova já saiu
    const clap = /clap\s*trap|cl4p/.test(nameKey(q));
    $('#search-list').replaceChildren(...(clap ? [claptrapRow()] : []), ...list.map(searchRow));
    $('#search-empty').hidden = list.length > 0 || clap;
    $('#search-hint').textContent = plural(list.length + (clap ? 1 : 0), 'ficha encontrada', 'fichas encontradas');
  }
  const liveSearch = debounce(runSearch, 300);
  inSearch.addEventListener('input', liveSearch);
  $$('input[name="stype"]', formSearch).forEach((r) => r.addEventListener('change', runSearch));
  formSearch.addEventListener('submit', (ev) => { ev.preventDefault(); runSearch(); });

  views.personagens = async function showPersonagens() {
    const quick = await refreshQuick();
    $('#quick-list').replaceChildren(...quick.map(characterRow));
    $('#quick-empty').hidden = quick.length > 0;
    await Promise.all([renderFavBlock(), runSearch(), runCatalog()]);
  };

  /* ---------- Campanhas ---------- */
  const formCreateCamp = $('#form-create-campaign');
  const inCampName = $('#campaign-name');
  const errCampName = $('#campaign-name-error');

  inCampName.addEventListener('input', () => setError(errCampName, inCampName, ''));
  formCreateCamp.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const name = cleanName(inCampName.value);
    if (!profile) { setError(errCampName, inCampName, 'Para criar uma campanha, entre ou crie um perfil.'); openLogin('campanhas'); return; }
    if (name.length < 3) { setError(errCampName, inCampName, 'Dê um nome com pelo menos 3 letras.'); inCampName.focus(); return; }
    try {
      const camp = await db.createCampaign(name);
      const pw = $('#campaign-pass').value;
      const access = { public: $('#campaign-public').checked };
      if (pw) access.passHash = await campHash(camp.id, pw);
      if (access.public || pw) await db.updateCampaign(camp.id, access);
      if (profile) { profileSet('camps', camp.id, true); profileSet('gm', camp.id, true); }
      formCreateCamp.reset();
      toast('Campanha criada. Vincule um personagem pela ficha dele para rolar dados.');
      go('campaign', camp.id);
    } catch (err) {
      setError(errCampName, inCampName, errorMessage(err));
    }
  });

  // Campanhas salvas no perfil (as que este aparelho ainda não conhece entram aqui)
  async function profileCamps(skip) {
    if (!profile) return [];
    const ids = profile.camps.filter((id) => skip.indexOf(id) < 0);
    const list = await Promise.all(ids.map((id) => db.getCampaign(id).then((c) => c || { gone: id }).catch(() => null)));
    list.filter((c) => c && c.gone).forEach((c) => profileSet('camps', c.gone, false));
    return list.filter((c) => c && !c.gone);
  }

  $('#create-camp-login').addEventListener('click', () => openLogin('campanhas'));
  views.campanhas = async function showCampanhas() {
    setError(errCampName, inCampName, '');
    // só quem tem perfil cria campanha (o mestre precisa dele para achar a campanha em outro aparelho)
    $('#create-camp-need').hidden = Boolean(profile);
    $('#form-create-campaign').hidden = !profile;
    const camps = await db.listMyCampaigns().catch((e) => { toast(errorMessage(e)); return []; });
    camps.push(...await profileCamps(camps.map((c) => c.id)));
    const anyOwn = camps.some((c) => c.isOwner);
    $('#camp-list').replaceChildren(...camps.map((c) => campaignRow(c, c.isOwner
      ? { label: 'Excluir', onClick: async () => { if (await deleteCampaignFlow(c)) views.campanhas(); } }
      : anyOwn ? { label: 'Excluir', pad: true } : null)));
    $('#camp-empty').hidden = camps.length > 0;
    // campanhas públicas: qualquer um vê e abre (com senha, se o mestre pôs)
    const pub = await db.listPublicCampaigns().catch((e) => { console.warn(e); return []; });
    $('#pub-list').replaceChildren(...pub.map((c) => campaignRow(Object.assign({}, c, { name: c.name + (c.passHash ? ' 🔒' : '') }), null)));
    $('#pub-empty').hidden = pub.length > 0;
  };


  /* ---------- Perfil (falso login) ---------- */
  const loginDlg = $('#login-dialog');
  const formLogin = $('#form-login');
  const inLoginCode = $('#login-code');
  const inLoginName = $('#login-name');
  const errLogin = $('#login-error');
  let loginNew = false; // true: o código não existe e o formulário passa a criar

  function setLoginNew(on) {
    loginNew = on;
    $('#login-new').hidden = !on;
    $('#login-submit').textContent = on ? 'Criar perfil' : 'Entrar';
  }
  let loginBack = ''; // tela para voltar depois de entrar (senão, o perfil); ['campaign', id] volta para a campanha
  function openLogin(back) {
    loginBack = typeof back === 'string' || Array.isArray(back) ? back : '';
    formLogin.reset();
    setLoginNew(false);
    setError(errLogin, inLoginCode, '');
    openDialog(loginDlg);
    inLoginCode.focus();
  }
  inLoginCode.addEventListener('input', () => {
    const clean = inLoginCode.value.replace(/[^0-9]/g, '').slice(0, 6);
    if (clean !== inLoginCode.value) inLoginCode.value = clean;
    setError(errLogin, inLoginCode, '');
    if (loginNew) setLoginNew(false);
  });
  $('#login-cancel').addEventListener('click', () => closeDialog(loginDlg));
  formLogin.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const code = inLoginCode.value.trim();
    if (!validCode(code)) { setError(errLogin, inLoginCode, 'Use de 1 a 6 dígitos, só números.'); inLoginCode.focus(); return; }
    const btn = $('#login-submit');
    btn.disabled = true;
    try {
      if (!loginNew) {
        const p = await db.getProfile(code);
        if (!p) { // código livre: oferece criar
          setLoginNew(true);
          setError(errLogin, inLoginCode, 'Ainda não existe um perfil com o código ' + code + '. Crie agora com ele.');
          inLoginName.focus();
          return;
        }
        profileUse(p, code);
        toast('Perfil aberto' + (profile.name ? ': ' + profile.name : '') + '.');
      } else {
        const fresh = { name: cleanName(inLoginName.value).slice(0, 40), chars: [], camps: [], gm: [], favs: localCharFavs() };
        if ($('#login-bring').checked) { // traz o que já está neste aparelho
          fresh.chars = quickLoad().filter((q) => q.mine).map((q) => q.id).concat(fresh.favs);
          const camps = await db.listMyCampaigns().catch(() => []);
          fresh.camps = camps.map((c) => c.id);
          fresh.gm = camps.filter((c) => c.isOwner).map((c) => c.id);
        }
        fresh.chars = Array.from(new Set(fresh.chars));
        if (await db.getProfile(code)) throw new UserError('Alguém acabou de criar um perfil com esse código. Tente entrar de novo.');
        await db.saveProfile(code, fresh);
        profileUse(fresh, code);
        toast('Perfil criado. Guarde o código ' + code + ' para entrar de outro aparelho.');
      }
      closeDialog(loginDlg);
      const back = loginBack;
      loginBack = '';
      if (Array.isArray(back)) go(back[0], back[1]);
      else if (back && location.hash.indexOf('#/' + back) === 0 && views[back]) views[back](); else go(back || 'perfil');
    } catch (err) {
      setError(errLogin, inLoginCode, errorMessage(err));
    } finally { btn.disabled = false; }
  });
  $('#profile-btn').addEventListener('click', () => { if (profile) go('perfil'); else openLogin(); });
  $('#perfil-login').addEventListener('click', openLogin);
  $('#perfil-logout').addEventListener('click', () => {
    const code = profile ? profile.code : '';
    profileLogout();
    toast('Você saiu do perfil. Para voltar, use o código ' + code + '.');
    views.perfil();
  });
  $('#form-profile-name').addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!profile) return;
    profile.name = cleanName($('#profile-name').value).slice(0, 40);
    profileSave();
    renderProfileBtn();
    $('#perfil-title').textContent = profile.name || 'Perfil';
    toast('Nome do perfil salvo.');
  });

  views.perfil = async function showPerfil() {
    renderThemes();
    const on = Boolean(profile);
    $('#perfil-out').hidden = on;
    $('#perfil-body').hidden = !on;
    $('#perfil-logout').hidden = !on;
    $('#perfil-title').textContent = on ? (profile.name || 'Perfil') : 'Perfil';
    $('#perfil-sub').textContent = on ? 'Código ' + profile.code + '. Quem souber o código abre este perfil, em qualquer aparelho.' : '';
    if (!on) return;
    $('#profile-name').value = profile.name;
    const redraw = () => { if (location.hash.indexOf('#/perfil') === 0) views.perfil(); };
    const [chars, camps] = await Promise.all([loadChars(profile.chars), profileCamps([])]);
    const favs = charFavs();
    const favList = chars.filter((c) => favs.has(c.id));
    const rest = chars.filter((c) => !favs.has(c.id));
    $('#prof-favs').replaceChildren(...favList.map((c) => profileCharRow(c, redraw)));
    $('#prof-favs-empty').hidden = favList.length > 0;
    $('#prof-chars').replaceChildren(...rest.map((c) => profileCharRow(c, redraw)));
    $('#prof-chars-empty').hidden = rest.length > 0;
    $('#prof-camps').replaceChildren(...camps.map((c) => campaignRow(c, {
      label: 'Tirar', onClick: () => { profileSet('camps', c.id, false); toast(c.name + ' saiu do perfil.'); redraw(); }
    })));
    $('#prof-camps-empty').hidden = camps.length > 0;
  };

  /* ---------- Banco de itens: peças comuns ----------
     Os dados de formulário vêm de items.js (window.VORTEX_ITEMS). Tudo o que é
     salvo na Oficina vai para o banco (db.saveLibrary): itens, mods, propriedades,
     acessórios, espécimes e poderes. A ficha guarda uma cópia do que usa. */
  const ITEM_DATA = window.VORTEX_ITEMS || { categories: [], catalogo: [], raridades: [], raridadeCor: {} };
  const SLOT_RULES = Object.assign({ modsPorRaridade: {}, custoMod: {}, propArma: {}, propArmadura: {}, acessoriosPorSlot: 3, posicoes: {} }, ITEM_DATA.slots);
  const findCategory = (id) => ITEM_DATA.categories.find((c) => c.id === id);
  const findType = (cat, id) => ((cat && cat.types) || []).find((t) => t.id === id);
  const kindTitle = (k) => { const c = findCategory(k); return c ? c.title : k; };
  const isWeapon = (k) => k === 'arma-fogo' || k === 'arma-melee';
  const WEAPON_PARA = { 'arma-fogo': 'Arma de fogo', 'arma-melee': 'Arma corpo a corpo' };
  const INVENTORY_KINDS = ITEM_DATA.categories.filter((c) => c.inventory).map((c) => c.id);
  const IMPLANT_KINDS = ITEM_DATA.categories.filter((c) => c.implant).map((c) => c.id);
  const rarColor = (r) => (ITEM_DATA.raridadeCor || {})[r] || '';
  const BONUS_KEYS = [['pv', 'PV'], ['escudo', 'Escudo'], ['blindagem', 'Blindagem'], ['pe', 'PE'], ['pa', 'PA'], ['carga', 'Carga'], ['armadura', 'Armadura']];

  // números escritos à mão: "1/4", "½", "0,5", "–1"
  function num(v) {
    const n = parseFloat(String(v === null || v === undefined ? '' : v).replace(',', '.').replace(/[–−]/g, '-'));
    return isFinite(n) ? n : 0;
  }
  function parseCarga(v) {
    const s = String(v === null || v === undefined ? '' : v).trim();
    if (s === '¼') return 0.25;
    if (s === '½') return 0.5;
    if (s === '¾') return 0.75;
    const m = s.match(/^(\d+)\s*\/\s*(\d+)/);
    if (m && parseInt(m[2], 10)) return parseInt(m[1], 10) / parseInt(m[2], 10);
    return Math.max(0, num(s));
  }
  const fmtNum = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
  const signed = (n) => (n > 0 ? '+' : '') + fmtNum(n);

  /* Favoritos: ficam neste aparelho */
  const FAV_KEY = 'vortex.fav.v1';
  function favLoad() {
    try { const l = JSON.parse(localStorage.getItem(FAV_KEY)); return new Set(Array.isArray(l) ? l : []); }
    catch (e) { return new Set(); }
  }
  function favToggle(id) {
    const set = favLoad();
    if (set.has(id)) set.delete(id); else set.add(id);
    try { localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(set))); } catch (e) { /* sem espaço: segue sem favoritar */ }
    return set.has(id);
  }

  /* Catálogo oficial (items.js) + o que as pessoas salvaram no banco */
  function decorate(e) {
    const cat = findCategory(e.kind);
    const type = findType(cat, e.typeId);
    return Object.assign({ image: '', thumb: '', bonus: {}, slots: null, values: {}, typeId: '' }, e, {
      kindTitle: cat ? cat.title : (e.kindTitle || e.kind),
      typeTitle: type ? type.title : (e.typeTitle || '')
    });
  }
  // pixel art dos itens oficiais (pixelart.js), achada pela id: não vai para o banco e vale para fichas antigas
  const itemArt = (e) => (window.VORTEX_ART ? window.VORTEX_ART.itemArt(e) : '');
  const BUILTINS = (ITEM_DATA.catalogo || []).map((e) => Object.assign(decorate(e), { oficial: true, mine: false }));
  // registros secretos (a espécime Neko) só aparecem quando a busca pede por eles
  const secretOk = (e, q) => !e.secreto || /\b(neko|nyan)/.test(nameKey(q || ''));
  const isNeko = (sp) => Boolean(sp && (sp.id === 'of-esp-neko' || nameKey(sp.name || '') === 'neko'));

  // Catálogo oficial sempre aparece; se o banco compartilhado falhar, o aviso fica em libSearch.warn
  /* Busca do banco (oficiais + criados), já ordenada por relevância quando há texto.
     Sem resultado, libSearch.suggest traz um "Você quis dizer…?" montado com os nomes da categoria. */
  async function libSearch(kinds, q) {
    const inKinds = (e) => !kinds || kinds.indexOf(e.kind) >= 0;
    libSearch.warn = '';
    libSearch.suggest = '';
    let own = [];
    try { own = (await db.searchLibrary({ kinds, query: '' })).map(decorate); }
    catch (err) { console.warn(err); libSearch.warn = errorMessage(err); }
    const all = BUILTINS.filter(inKinds).filter((e) => secretOk(e, q)).concat(own.filter(inKinds));
    const found = rankSearch(all, q, entryFields);
    if (!found.length && words(q || '').length) libSearch.suggest = suggestQuery(q, all.map((e) => [e.name, e.typeTitle, e.kindTitle].join(' ')));
    return found;
  }
  // linha "Você quis dizer …?" para listas vazias: clicar troca a busca pela sugestão
  function didYouMean(suggest, onPick, tag) {
    if (!suggest) return null;
    const b = h('button', 'link-btn', suggest);
    b.type = 'button';
    b.addEventListener('click', () => onPick(suggest));
    return h(tag || 'p', 'did-you-mean', 'Você quis dizer ', b, '?');
  }
  // põe (ou tira) a sugestão logo depois da lista; clicar refaz a busca com ela
  function suggestAfter(anchor, suggest, input, rerun) {
    const old = anchor.nextElementSibling;
    if (old && old.classList.contains('did-you-mean')) old.remove();
    const line = didYouMean(suggest, (t) => { input.value = t; rerun(); input.focus(); });
    if (line) anchor.after(line);
  }
  const hasQuery = (q) => words(q || '').length > 0;

  /* ---------- Filtros por especificação ----------
     Toda tela de busca põe, acima da lista, grupos de filtros tirados dos campos da categoria
     (tipo, raridade, criadora, dano, empunhadura, quando usa...). Dentro de um grupo vale qualquer
     marcado; entre grupos, todos. Só aparece grupo com 2 ou mais valores na lista atual, e o número
     ao lado de cada valor diz quantos registros sobram ao marcá-lo. Sem categoria escolhida (lista
     com muitas categorias), só os filtros comuns: categoria, raridade, criadora e origem. */
  const FACET_LABEL = { fabricante: 'Criadora', raridade: 'Raridade', momento: 'Quando usa', dano: 'Dano', tipoUso: 'Uso', nucleo: 'Aceita núcleo', profs: 'Proficiências', efetivo: 'Efetivo contra', ataque: 'Ataque', posicao: 'Posição', para: 'Para' };
  const FACET_KINDS = ['select', 'multi', 'rarity', 'cards'];
  const FACET_BROAD = ['raridade', 'fabricante'];
  const facetLabel = (f) => FACET_LABEL[f.key] || String(f.label || f.key).replace(/\(.*?\)/g, '').split(' / ')[0].trim();
  function facetOrder(f) {
    const o = f && f.options;
    const list = Array.isArray(o) ? o : (typeof o === 'string' && Array.isArray(ITEM_DATA[o]) ? ITEM_DATA[o] : []);
    return list.map((x) => (x && typeof x === 'object' ? x.title || x.label || x.id : x));
  }
  function facetDefs(kinds, skip) {
    const cats = ITEM_DATA.categories.filter((c) => kinds.indexOf(c.id) >= 0);
    const broad = cats.length > 3;
    const defs = [];
    const add = (d) => { if (!defs.some((x) => x.key === d.key) && (skip || []).indexOf(d.key) < 0) defs.push(d); };
    if (cats.length > 1) add({ key: '_kind', label: 'Categoria', get: (e) => e.kindTitle || kindTitle(e.kind), order: cats.map((c) => c.title) });
    if (!broad && cats.some((c) => c.types && c.types.length)) add({ key: '_type', label: 'Tipo', get: (e) => e.typeTitle || '', order: cats.reduce((t, c) => t.concat((c.types || []).map((x) => x.title)), []) });
    if (kinds.indexOf('poder') >= 0 && !broad) {
      add({ key: '_custo', label: 'Custo', get: (e) => (e.kind === 'poder' ? Math.max(0, num((e.values || {}).custo)) + ' UP' : ''), num: true });
      add({ key: 'momento', label: 'Quando usa', get: (e) => (e.kind === 'poder' ? powerMoment(e) : ''), order: POWER_MOMENTS });
    }
    if (kinds.indexOf('npc') >= 0 && !broad) add({ key: '_up', label: 'UP', get: (e) => (e.kind === 'npc' && num((e.values || {}).up) ? 'UP ' + num((e.values || {}).up) : ''), num: true });
    if (kinds.indexOf('build') >= 0 && !broad) add({ key: 'tipo', label: 'Tipo de build', get: (e) => (e.kind === 'build' ? (e.values || {}).tipo : ''), order: ITEM_DATA.buildTipos });
    cats.forEach((c) => (c.fields || []).forEach((f) => {
      if (FACET_KINDS.indexOf(f.kind) < 0 || f.options === 'pericias') return;
      if (broad && FACET_BROAD.indexOf(f.key) < 0) return;
      add({ key: f.key, label: facetLabel(f), multi: f.kind === 'multi', order: facetOrder(f), rarity: f.kind === 'rarity', get: (e) => (kinds.length > 1 && !(findCategory(e.kind) || { fields: [] }).fields.some((x) => x.key === f.key) ? '' : (e.values || {})[f.key]) });
    }));
    add({ key: '_src', label: 'Fonte', get: (e) => (e.oficial ? 'Oficial' : e.mine ? 'Meus' : 'Do banco'), order: ['Oficial', 'Meus', 'Do banco'] });
    return defs;
  }
  const facetVals = (d, e) => {
    const v = d.get(e);
    const arr = Array.isArray(v) ? v : d.multi && typeof v === 'string' ? v.split(',') : [v];
    return arr.map((x) => String(x == null ? '' : x).trim()).filter(Boolean);
  };
  // uma caixa de filtros: apply(lista, kinds) desenha os grupos e devolve a lista filtrada
  function facetBox(onChange, cfg) {
    const o = cfg || {};
    const box = h('details', 'facets');
    box.open = true; // aberto ao escolher a categoria; fechar fica valendo até sair da tela
    const st = { on: {}, box };
    const active = () => Object.keys(st.on).reduce((t, k) => t + st.on[k].size, 0);
    st.reset = () => { st.on = {}; };
    st.apply = (list, kinds) => {
      const ks = kinds && kinds.length ? kinds : Array.from(new Set(list.map((e) => e.kind)));
      const defs = facetDefs(ks, typeof o.skip === 'function' ? o.skip() : o.skip);
      Object.keys(st.on).forEach((k) => { if (!defs.some((d) => d.key === k) || !st.on[k].size) delete st.on[k]; });
      const pass = (e, skip) => defs.every((d) => d.key === skip || !st.on[d.key] || facetVals(d, e).some((v) => st.on[d.key].has(v)));
      const groups = [];
      defs.forEach((d) => {
        const counts = new Map();
        list.forEach((e) => { if (pass(e, d.key)) facetVals(d, e).forEach((v) => counts.set(v, (counts.get(v) || 0) + 1)); });
        const sel = st.on[d.key] || new Set();
        sel.forEach((v) => { if (!counts.has(v)) counts.set(v, 0); });
        if (counts.size < 2 && !sel.size) return;
        const ord = d.order || [];
        const keys = Array.from(counts.keys()).sort((a, b) => {
          const ia = ord.indexOf(a), ib = ord.indexOf(b);
          if (ia >= 0 || ib >= 0) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
          if (d.num) return num(a.replace(/\D+/g, '')) - num(b.replace(/\D+/g, ''));
          return a.localeCompare(b, 'pt-BR');
        });
        groups.push(h('div', 'facets__group', h('span', 'facets__label', d.label), h('div', 'facets__chips', ...keys.map((v) => {
          const on = sel.has(v);
          const b = h('button', 'chip chip--toggle facets__chip', v, h('small', 'facets__n', String(counts.get(v))));
          b.type = 'button';
          b.dataset.facet = d.key + ':' + v;
          b.setAttribute('aria-pressed', String(on));
          if (d.rarity && ITEM_DATA.raridadeCor[v]) b.style.setProperty('--rar', ITEM_DATA.raridadeCor[v]);
          if (!counts.get(v) && !on) b.disabled = true;
          b.addEventListener('click', () => {
            const s = st.on[d.key] || (st.on[d.key] = new Set());
            if (s.has(v)) s.delete(v); else s.add(v);
            onChange();
          });
          return b;
        }))));
      });
      const n = active();
      const clear = h('button', 'link-btn facets__clear', 'Limpar filtros');
      clear.type = 'button';
      clear.hidden = !n;
      clear.addEventListener('click', (ev) => { ev.preventDefault(); st.reset(); onChange(); });
      box.replaceChildren(h('summary', 'facets__sum', 'Filtrar por especificação', n ? h('span', 'facets__count', String(n)) : null), ...groups, clear);
      box.hidden = !groups.length && !n;
      return list.filter((e) => pass(e));
    };
    return st;
  }
  // filtra cartões já desenhados: esconde quem não casa e põe os mais relevantes no topo
  function rankCards(cards, objs, q, fieldsOf) {
    const scores = objs.map((o) => searchScore(fieldsOf(o), q));
    const order = cards.map((el, i) => i);
    if (hasQuery(q)) order.sort((a, b) => scores[b] - scores[a] || a - b);
    order.forEach((i) => { cards[i].hidden = !scores[i]; if (cards[i].parentNode) cards[i].parentNode.append(cards[i]); });
    return scores.filter(Boolean).length;
  }

  function entryIcon(e) {
    const el = h('span', 'lib-icon' + (e.kind === 'mod-arma' ? ' lib-icon--mod' : ''));
    const color = e.values && rarColor(e.values.raridade);
    if (color) el.style.setProperty('--rar', color);
    const pic = e.thumb || itemArt(e);
    if (pic) { const img = h('img'); img.src = pic; img.alt = ''; el.append(img); }
    else el.textContent = (e.name || '?').trim().charAt(0).toUpperCase();
    return el;
  }
  const layersSummary = (v) => [['escudo', 'Escudo'], ['blindagem', 'Blindagem'], ['pv', 'PV']].filter((x) => num(v[x[0]])).map((x) => x[1] + ' ' + num(v[x[0]])).join(' · ');
  function entryMeta(e) {
    const v = e.values || {};
    if (e.kind === 'build') return [e.kindTitle || kindTitle(e.kind), v.papel, ['corpo', 'precisao', 'essencia'].map((k) => k.charAt(0).toUpperCase() + ' ' + (num(v[k]) > 0 ? '+' : '') + num(v[k])).join(' '), [v.pericia2a, v.pericia2b].filter(Boolean).map((x) => x + ' +2').concat(v.pericia1 ? [v.pericia1 + ' +1'] : []).join(', ')].filter(Boolean).join(' · ');
    if (e.kind === 'municao') return [e.kindTitle || kindTitle(e.kind), e.typeTitle, v.raridade, ammoUnitText(e), v.dano, v.para ? 'Para ' + v.para : '', priceText(v.preco)].filter(Boolean).join(' · ');
    if (e.kind === 'npc') return [e.kindTitle || kindTitle(e.kind), v.categoria, num(v.up) ? 'UP ' + v.up : '', layersSummary(v), 'Defesa mín. ' + (num(v.armadura || 6) + num(v.corpo) + num(v.resistencia)), v.dano].filter(Boolean).join(' · ');
    return [e.kindTitle || kindTitle(e.kind), e.typeTitle, v.raridade, v.posicao, v.para, v.classe, v.tipoUso, num(v.usos) ? v.usos + ' usos' : '', v.bonusRec ? 'Bônus ' + v.bonusRec : '', priceText(v.preco)].filter(Boolean).join(' · ');
  }
  /* Lore: texto do mundo escondido atrás do ícone 📜 (itens, criadoras, espécimes, origens, personagens) */
  const loreDlg = $('#lore-dialog');
  function openLore(title, meta, text) {
    $('#lore-title').textContent = title;
    $('#lore-meta').textContent = meta || '';
    const box = $('#lore-text');
    const t = String(text || '').trim();
    box.replaceChildren(...(t ? t.split(/\n+/).map((p) => h('p', '', p)) : [h('p', 'empty', 'Ainda não há lore escrita para ' + title + '.')]));
    openDialog(loreDlg);
  }
  $('#lore-close').addEventListener('click', () => closeDialog(loreDlg));
  function loreButton(title, meta, text, always) {
    if (!always && !String(text || '').trim()) return null;
    const b = h('button', 'lore-btn', '📜');
    b.type = 'button';
    b.title = 'Lore: ' + title;
    b.setAttribute('aria-label', 'Ver a lore de ' + title);
    b.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); openLore(title, meta, text); });
    return b;
  }
  const makerLore = (f) => ((ITEM_DATA.fabricantesLore || {})[f] || '');
  function makerTag(f) {
    const b = h('button', 'tag tag--maker tag--btn', f);
    b.type = 'button';
    b.title = 'Lore de ' + f;
    b.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); openLore(f, 'Criadora / companhia / corporação', makerLore(f)); });
    return b;
  }
  const entryLore = (e) => loreButton(e.name || 'Sem nome', [kindTitle(e.kind), (e.values || {}).fabricante].filter(Boolean).join(' · '), (e.values || {}).lore);

  const priceText = (p) => (String(p || '').trim() ? String(p).trim() + ' Cronos' : '');
  const entryText = (e) => { const v = e.values || {}; return v.efeito || v.especial || v.descricao || v.tracos || ''; };

  function starButton(e, onToggle) {
    const b = h('button', 'star');
    b.type = 'button';
    const paint = (on) => {
      b.textContent = on ? '★' : '☆';
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', (on ? 'Tirar dos favoritos: ' : 'Favoritar: ') + e.name);
      b.title = on ? 'Favorito' : 'Favoritar';
    };
    paint(favLoad().has(e.id));
    b.addEventListener('click', () => { paint(favToggle(e.id)); if (onToggle) onToggle(); });
    return b;
  }

  function libRow(e, actions, onFav) {
    const title = h('span', 'row__title', e.name || 'Sem nome');
    if (e.oficial) title.append(' ', h('span', 'tag', 'Oficial'));
    if (e.values && e.values.fabricante) title.append(' ', makerTag(e.values.fabricante));
    const lb = entryLore(e);
    if (lb) title.append(' ', lb);
    const main = h('span', 'row__main', title, h('span', 'row__meta', entryMeta(e)));
    const text = entryText(e);
    if (text) main.append(h('span', 'row__text', text));
    const open = h('span', 'row__open lib-row__open', entryIcon(e), main);
    open.tabIndex = 0;
    open.setAttribute('role', 'button');
    open.setAttribute('aria-label', 'Ver todos os dados de ' + (e.name || 'Sem nome'));
    open.addEventListener('click', () => openEntry(e));
    open.addEventListener('keydown', (ev) => { if (ev.target === open && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); openEntry(e); } });
    const row = h('li', 'row lib-row', open, starButton(e, onFav));
    row.libEntry = e; // usado pela seleção múltipla
    (actions || []).forEach((a) => {
      const b = h('button', 'btn btn--sm ' + (a.cls || 'btn--ghost'), a.label);
      b.type = 'button';
      b.setAttribute('aria-label', a.label + ': ' + e.name);
      b.addEventListener('click', a.onClick);
      row.append(b);
    });
    return row;
  }

  /* Seleção múltipla numa lista de libRow: segurar (toque longo) ou dar dois cliques num item liga o modo;
     daí cada toque marca ou desmarca, e a barra confirma todos de uma vez. A marcação sobrevive a novas buscas. */
  const multiKey = (e) => e.id || e.uid || e.name;
  function multiPick(ul, cfg) {
    const st = { on: false, sel: new Map(), timer: 0, longed: false, clickT: 0, passing: false };
    const count = h('strong', 'multi-bar__count', '');
    const clear = h('button', 'btn btn--ghost btn--sm', 'Cancelar');
    clear.type = 'button';
    clear.dataset.fid = 'multi-cancel';
    const ok = h('button', 'btn btn--primary btn--sm', '');
    ok.type = 'button';
    ok.dataset.fid = 'multi-ok';
    const tip = h('p', 'multi-tip', window.matchMedia('(pointer: fine)').matches ? 'Dica: Ctrl + clique (ou dois cliques) num item para escolher vários de uma vez.' : 'Dica: segure ou toque duas vezes num item para escolher vários de uma vez.');
    const bar = h('div', 'multi-bar', count, h('span', 'multi-bar__acts', clear, ok));
    bar.hidden = true;
    const live = () => !cfg.enabled || cfg.enabled();
    const paint = () => {
      ul.classList.toggle('is-multi', st.on);
      ul.querySelectorAll('.lib-row').forEach((r) => {
        const on = Boolean(r.libEntry && st.sel.has(multiKey(r.libEntry)));
        r.classList.toggle('is-picked', on);
        if (st.on) r.setAttribute('aria-selected', String(on)); else r.removeAttribute('aria-selected');
      });
      const n = st.sel.size;
      bar.hidden = !st.on;
      tip.hidden = st.on || !live();
      count.textContent = plural(n, 'item selecionado', 'itens selecionados');
      ok.textContent = cfg.label(n);
      ok.disabled = !n;
    };
    const reset = () => { st.on = false; st.sel.clear(); paint(); };
    const toggle = (row) => {
      const e = row.libEntry;
      if (!e) return;
      const k = multiKey(e);
      if (st.sel.has(k)) st.sel.delete(k); else st.sel.set(k, e);
      st.on = true;
      paint();
    };
    const rowOf = (t) => { if (!live()) return null; const r = t && t.closest ? t.closest('.lib-row') : null; return r && ul.contains(r) ? r : null; };
    ul.addEventListener('pointerdown', (ev) => {
      const r = rowOf(ev.target);
      if (!r || ev.button > 0) return;
      st.longed = false;
      const x = ev.clientX, y = ev.clientY;
      clearTimeout(st.timer);
      st.timer = setTimeout(() => { st.longed = true; if (navigator.vibrate) navigator.vibrate(15); toggle(r); }, 450);
      const stop = (e2) => {
        if (e2.type === 'pointermove' && Math.hypot(e2.clientX - x, e2.clientY - y) < 10) return;
        clearTimeout(st.timer);
        ['pointermove', 'pointerup', 'pointercancel'].forEach((t) => window.removeEventListener(t, stop));
      };
      ['pointermove', 'pointerup', 'pointercancel'].forEach((t) => window.addEventListener(t, stop));
    });
    ul.addEventListener('contextmenu', (ev) => { if (rowOf(ev.target)) ev.preventDefault(); });
    ul.addEventListener('click', (ev) => {
      const r = rowOf(ev.target);
      if (!r || st.passing) return;
      if (ev.target.closest('.star')) { if (!st.on) return; }
      if (st.longed) { st.longed = false; ev.stopPropagation(); ev.preventDefault(); return; }
      if (st.on || ev.ctrlKey || ev.metaKey) { ev.stopPropagation(); ev.preventDefault(); toggle(r); return; } // Ctrl/Cmd + clique: atalho do PC
      // fora do modo: dois cliques no corpo do item ligam o modo; um clique só abre a ficha, como antes
      const open = ev.target.closest('.row__open');
      if (!open) return;
      ev.stopPropagation();
      ev.preventDefault();
      if (st.clickT && st.clickRow === r) { clearTimeout(st.clickT); st.clickT = 0; toggle(r); return; }
      clearTimeout(st.clickT);
      st.clickRow = r;
      st.clickT = setTimeout(() => { st.clickT = 0; st.passing = true; open.click(); st.passing = false; }, 280);
    }, true);
    clear.addEventListener('click', reset);
    ok.addEventListener('click', () => { const list = [...st.sel.values()].map(deep); reset(); cfg.onConfirm(list); });
    return { bar, tip, paint, reset, get on() { return st.on; } };
  }

  // campos de mecânica que o espécime tinha antes do script dos poderes
  const LEGACY_LABEL = { vidaBase: 'Vida base (campo antigo)', upInicial: 'UP iniciais (campo antigo)', nucleoBase: 'Núcleo (campo antigo)', acopla: 'Acopla (campo antigo)', humanidade: 'Humanidade (campo antigo)', eletronico: 'Eletrônico (campo antigo)', tracos: 'Traços e regras', poderes: 'Poderes de nascença' };
  const LEGACY_SPECIES = Object.keys(LEGACY_LABEL);
  /* Todos os dados de um registro do banco (vale para itens, espécimes, poderes e origens) */
  const entryDlg = $('#entry-dialog');
  function openEntry(e) {
    const cat = findCategory(e.kind);
    const v = e.values || {};
    $('#entry-title').replaceChildren(e.name || 'Sem nome', ...(e.oficial ? [' ', h('span', 'tag', 'Oficial')] : []));
    $('#entry-meta').textContent = [e.kindTitle || kindTitle(e.kind), e.typeTitle, e.source || (e.oficial ? 'Catálogo oficial' : (e.mine ? 'Criado por você' : 'Banco compartilhado'))].filter(Boolean).join(' · ');
    const body = $('#entry-body');
    body.replaceChildren();
    const pic = e.image || e.thumb || itemArt(e);
    if (pic) { const img = h('img', 'entry__img'); img.src = pic; img.alt = ''; body.append(img); }
    const seen = new Set(['nome', 'lore', 'compraRacial']); // compraRacial: campo antigo, hoje é exclusivo do Etheriano
    if (e.kind === 'poder') { body.append(powerView(e)); ['custo', 'efeito', 'opcoes', 'melhorias', 'custoUso', 'manobras', 'estilos', 'estiloRotulo'].forEach((k) => seen.add(k)); }
    const facts = entryFacts(e, seen, cat && cat.inventory ? ' (quando equipado)' : '');
    if (facts) body.append(facts);
    else if (e.kind !== 'poder') body.append(h('p', 'empty', 'Sem outros dados além do nome.'));
    const lore = String(v.lore || '').trim();
    if (lore) body.append(h('h3', 'entry__sub', 'Lore'), ...lore.split(/\n+/).map((t) => h('p', 'entry__lore', t)));
    const attach = quickAttachBox(e);
    if (attach) body.append(attach);
    openDialog(entryDlg);
  }
  $('#entry-close').addEventListener('click', () => closeDialog(entryDlg));
  /* Ficha de detalhe (banco, bestiário, inventário): números curtos viram blocos agrupados
     (atributos, perícias, defesas, ataque...), textos viram seções e listas viram etiquetas,
     em vez de uma coluna crua de rótulo e valor. */
  const FACT_GROUPS = {
    npc: [['Ameaça', ['categoria', 'up', 'cronos']], ['Atributos', ['corpo', 'precisao', 'essencia']], ['Perícias', ['luta', 'mira', 'operacoes', 'resistencia']],
      ['Defesas', ['defesa', 'armadura', 'pv', 'escudo', 'blindagem']], ['Ataque', ['arma', 'ataque', 'dano', 'cadencia', 'efetivo']]],
    build: [['Build', ['tipo', 'papel']], ['Atributos', ['corpo', 'precisao', 'essencia']], ['Perícias e proficiências', ['pericia2a', 'pericia2b', 'pericia1', 'profs']]],
    '*': [['Ficha', ['fabricante', 'modelo', 'raridade', 'preco', 'classe', 'tipo', 'subtipo', 'posicao', 'para', 'custoUso']],
      ['Combate', ['dano', 'modo', 'cadencia', 'pente', 'municao', 'disparos', 'alcance']],
      ['Proteção', ['armadura', 'penalidade', 'nucleo', 'capacidade', 'cc']],
      ['Uso', ['empunhadura', 'carga', 'tipoUso', 'usos', 'bonusRec', 'bonus', 'encaixes']]]
  };
  const FACT_HI = { defesa: 1, arma: 1, dano: 1, armadura: 1, raridade: 1 };
  function entryFacts(e, seen, bonusNote) {
    const cat = findCategory(e.kind);
    const v = e.values || {};
    seen = seen || new Set(['nome', 'lore']);
    const facts = [];
    const add = (key, label, val, type, extra) => facts.push(Object.assign({ key, label, val, type }, extra || {}));
    const classify = (f, val) => {
      const txt = String(val).trim();
      const lines = txt.split('\n').map((x) => x.trim()).filter(Boolean);
      if (f && f.kind === 'textarea' && lines.length > 1 && lines.every((l) => l.length <= 40)) return ['list', lines];
      if ((f && (f.kind === 'textarea' || f.big)) || txt.length > 40 || lines.length > 1) return ['text', txt];
      return ['stat', txt];
    };
    ((cat && cat.fields) || []).forEach((f) => {
      const val = v[f.key];
      if (f.kind === 'roteiro') { rtEntryRows(v).forEach((r, i) => add('roteiro' + i, r[0], r[1], 'text')); return; }
      if (seen.has(f.key)) return;
      seen.add(f.key);
      if (f.hidden || f.key === 'nome' || f.key === 'lore' || val === undefined || val === null || String(val).trim() === '') return;
      const label = f.key === 'fabricante' ? 'Criadora' : f.label.replace(/\s*\(.*\)$/, '');
      if (f.kind === 'script') { add(f.key, 'Script', String(val), 'text', { code: true }); return; }
      if (f.kind === 'racial3') { add(f.key, 'Habilidades raciais', h('div', '', ...powerLines(val).map((t) => h('p', 'entry__racial', h('strong', '', t.name), t.text ? ': ' + t.text : ''))), 'text'); return; }
      if (f.key === 'fabricante') { add(f.key, label, makerTag(String(val)), 'stat'); return; }
      if (f.key === 'preco') { add(f.key, label, priceText(val), 'stat'); return; }
      const c = classify(f, val);
      if (c[0] === 'list') add(f.key, label, null, 'list', { items: c[1] });
      else add(f.key, label, c[1], c[0]);
    });
    // campos que não estão no formulário atual (registros antigos) também aparecem
    Object.keys(v).forEach((k) => {
      if (seen.has(k) || !String(v[k] || '').trim()) return;
      if (e.kind === 'especime' && LEGACY_LABEL[k]) { if (v[k] !== 'Não' && v[k] !== '0') add(k, LEGACY_LABEL[k], String(v[k]), 'stat'); return; }
      const c = classify(null, v[k]);
      add(k, k, c[0] === 'list' ? null : c[1], c[0], c[0] === 'list' ? { items: c[1] } : null);
    });
    if (e.kind === 'npc') add('defesa', 'Defesa mínima', String(num(v.armadura) + num(v.corpo) + num(v.resistencia)), 'stat', { hint: 'armadura + Corpo + Resistência' });
    const b = bonusLine(entryBonus(e));
    if (b) add('bonus', 'Bônus', b + (bonusNote || ''), 'stat');
    const parts = e.slots ? (e.slots.mods || []).concat(e.slots.props || [], e.slots.accs || []).map((x) => x.name) : [];
    if (parts.length && !seen.has('encaixes')) add('encaixes', 'Encaixes', null, 'list', { items: parts });
    if (!facts.length) return null;
    const tile = (f) => {
      const t = h('div', 'fact' + (FACT_HI[f.key] ? ' fact--hi' : ''), h('span', 'fact__k', f.label), h('span', 'fact__v', f.val), f.hint ? h('span', 'fact__hint', f.hint) : null);
      const c = f.key === 'raridade' ? rarColor(f.val) : '';
      if (c) { t.classList.add('fact--rar'); t.style.setProperty('--rar', c); }
      return t;
    };
    const stats = facts.filter((f) => f.type === 'stat');
    const used = new Set();
    const out = [];
    (FACT_GROUPS[e.kind] || FACT_GROUPS['*']).forEach((g) => {
      const fs = g[1].map((k) => stats.find((f) => f.key === k && !used.has(f))).filter(Boolean);
      if (!fs.length) return;
      fs.forEach((f) => used.add(f));
      out.push(h('section', 'facts__group', h('h3', 'facts__title', g[0]), h('div', 'facts__grid', ...fs.map(tile))));
    });
    const rest = stats.filter((f) => !used.has(f));
    if (rest.length) out.push(h('section', 'facts__group', out.length ? h('h3', 'facts__title', 'Outros dados') : null, h('div', 'facts__grid', ...rest.map(tile))));
    facts.filter((f) => f.type === 'text').forEach((f) => out.push(h('section', 'facts__group', h('h3', 'facts__title', f.label), h('div', 'facts__text' + (f.code ? ' entry__code' : ''), f.val))));
    facts.filter((f) => f.type === 'list').forEach((f) => out.push(h('section', 'facts__group', h('h3', 'facts__title', f.label), h('ul', 'facts__chips', ...f.items.map((x) => h('li', 'facts__chip', x))))));
    return h('div', 'facts', ...out);
  }

  /* Tela de um poder: o tipo (simples, lista, com escolha, com melhorias), como se obtém e
     as opções e melhorias em cartões, em vez do texto cru "Nome | efeito | custo". */
  function powerKind(e) {
    if (CHOICE_POWERS[e.id]) return 'escolha';
    if (powerOpts(e).length) return 'lista';
    return powerUps(e).length ? 'melhorias' : 'simples';
  }
  // efeitos marciais (poder Luta): "Efeito | custo | descrição"; cópias antigas na ficha usam os do poder oficial
  function powerManobras(p) {
    const off = p && p.id ? BUILTINS.find((x) => x.id === p.id) : null;
    return powerLines((p.values && p.values.manobras) || (off && off.values && off.values.manobras));
  }
  const manobraTable = (rows) => h('div', 'pwview__tablewrap', h('table', 'pwview__table', h('thead', '', h('tr', '', h('th', '', 'Efeito'), h('th', '', 'Custo'), h('th', '', 'O que faz'))),
    h('tbody', '', ...rows.map((r) => h('tr', '', h('th', '', r.name), h('td', 'pwview__cost', r.text), h('td', '', r.cost))))));
  // Tecnomancia na Oficina: as mesmas tabelas do capítulo Habilidades (bases, implementos e raridade)
  const ruleTable = (head, rows) => h('div', 'pwview__tablewrap', h('table', 'pwview__table', h('thead', '', h('tr', '', ...head.map((t) => h('th', '', t)))),
    h('tbody', '', ...rows.map((r) => h('tr', '', h('th', '', r[0]), ...r.slice(1).map((c, k) => h('td', k === 0 && r.length > 2 ? 'pwview__cost' : '', c)))))));
  const tecnoView = () => {
    const R = window.VORTEX_REGRAS || {};
    return [h('h3', 'entry__sub', 'Operação = base + implementos'),
      h('p', 'pwview__efeito', 'Toda operação começa por uma base. Depois você soma implementos, pagando o PE de cada um. Numa operação, o número de implementos é no máximo o atributo chave da lista usada (Precisão ou Essência).'),
      ruleTable(['Base', 'Custo', 'Como funciona'], R.tecnoBases || []),
      h('p', 'pwview__efeito', 'Dano: toda forma de causar dano segue a regra de ataque, com o multiplicador da cadência. Dado de dano ou dano que passa pela Defesa só vem de dano fixo ou dano de efeito de um componente conhecido, como o Sangramento ou o dano adicional de alguns itens.'),
      h('h3', 'entry__sub', 'Implementos padrão'),
      h('p', 'pwview__efeito', 'Todo tecnomante conhece. Cada um conta 1 no limite e pode ser repetido.'),
      ruleTable(['Implemento', 'Custo', 'O que faz'], R.tecnoImplementos || []),
      h('h3', 'entry__sub', 'Implementos especiais'),
      h('p', 'pwview__efeito', 'São os componentes que você conhece das suas listas: uma propriedade, um mod, o efeito de uma prótese, um poder. Numa operação, no máximo um número igual ao seu nível. Um poder custa em PE o dobro do custo de uso + o custo em UP; o resto custa o PE da raridade + qualquer custo original.'),
      ruleTable(['Raridade', 'Custo'], R.tecnoRaridade || [])];
  };
  function powerView(e) {
    const v = e.values || {};
    const kind = powerKind(e);
    const cost = num(v.custo);
    const opts = powerOpts(e);
    const ups = powerUps(e);
    const man = powerManobras(e);
    const bank = (n) => BUILTINS.some((x) => x.kind === 'poder' && x.id !== e.id && nameKey(x.name) === nameKey(n));
    const label = { lista: 'Poder-lista', escolha: 'Poder com escolha', melhorias: 'Poder com melhorias', simples: 'Poder' }[kind];
    const what = { pericia: 'a perícia', arma: 'o tipo de arma', armadura: 'o tipo de armadura' }[CHOICE_POWERS[e.id]];
    const how = kind === 'lista' ? 'Na ficha, em Poderes, "Adicionar poder" abre as opções: pegue quantas quiser, cada uma custa ' + cost + ' UP.'
      : kind === 'escolha' ? 'Na ficha, ao adicionar, você escolhe ' + what + '. Cada compra custa ' + cost + ' UP, vale para uma escolha e dá +1 em uma perícia à sua escolha; dá para comprar de novo.'
      : 'Na ficha, em Poderes, "Adicionar poder"' + (cost ? ' por ' + cost + ' UP' : '') + '.' + (kind === 'melhorias' ? ' Depois, as melhorias são compradas na lista de poderes.' : '') + (powerStyles(e).length ? ' Depois, na lista de poderes, escolha: ' + styleLabel(e).toLowerCase() + '.' : '');
    const card = (t, tag, i) => h('li', 'pwview__card', h('span', 'pwview__head', h('strong', '', t.name), tag ? h('span', 'tag', tag) : null, bank(t.name) ? h('span', 'tag pwview__bank', 'Poder do banco') : null),
      t.text ? h('span', 'pwview__text', t.text) : null);
    return h('div', 'pwview pwview--' + kind,
      h('p', 'pwview__chips', h('span', 'pwview__kind', label), h('span', 'tag', kind === 'lista' ? cost + ' UP por opção' : cost + ' UP'), v.custoUso ? h('span', 'tag', 'Uso: ' + v.custoUso) : null),
      v.efeito ? h('p', 'pwview__efeito', v.efeito) : null,
      opts.length ? h('h3', 'entry__sub', 'Opções') : null,
      opts.length ? h('ul', 'pwview__list', ...opts.map((o) => card(o, o.cost ? 'Uso: ' + o.cost : ''))) : null,
      ...(e.id === 'of-pod-tecnomancia' ? tecnoView() : []),
      man.length ? h('h3', 'entry__sub', 'Efeitos marciais (custo em ataques da rodada)') : null,
      man.length ? manobraTable(man) : null,
      ...(powerStyles(e).length ? [h('h3', 'entry__sub', styleLabel(e)),
        h('ul', 'pwview__list', ...powerStyles(e).map((st) => h('li', 'pwview__card', h('span', 'pwview__head', h('strong', '', st.name), st.pendente ? h('span', 'tag', 'em breve') : st.cost ? h('span', 'tag', '+' + st.cost + ' UP') : null),
          st.resumo ? h('span', 'pwview__text', st.resumo) : null, ...styleBody(st))))] : []),
      ups.length ? h('h3', 'entry__sub', 'Melhorias') : null,
      ups.length ? h('ul', 'pwview__list', ...ups.map((u) => card(u, '+' + (u.cost === '' ? 1 : num(u.cost)) + ' UP'))) : null,
      h('p', 'pwview__how', h('strong', '', 'Como obter: '), how));
  }

  /* Escolha única em cartões (perícia do Doutor, tipo de arma ou armadura): no modelo das características raciais. */
  let cardAskDlg = null;
  function askCards(o) {
    if (!cardAskDlg) { cardAskDlg = h('dialog', 'dialog pickchar racial powopt'); cardAskDlg.setAttribute('aria-labelledby', 'cardask-title'); document.body.append(cardAskDlg); }
    const dlg = cardAskDlg;
    return new Promise((resolve) => {
      let done = false;
      const finish = (val) => { if (done) return; done = true; resolve(val); if (dlg.open) closeDialog(dlg); };
      const q = h('input', 'input');
      q.type = 'search';
      q.id = 'cardask-q';
      q.autocomplete = 'off';
      q.placeholder = 'Buscar';
      const qLab = h('label', 'visually-hidden', 'Buscar');
      qLab.htmlFor = 'cardask-q';
      const list = h('ul', 'pickchar__list');
      const draw = () => {
        const shown = rankSearch(o.items, q.value, (x) => [[x.name, 10], [[x.meta, x.text].filter(Boolean).join(' '), 2]]);
        list.replaceChildren(...shown.map((x) => {
          const b = h('button', 'btn btn--sm btn--primary', o.ok || 'Escolher');
          b.type = 'button';
          b.dataset.fid = ('cardask-' + nameKey(x.name)).replace(/\s+/g, '-');
          b.addEventListener('click', () => finish(x.value));
          return h('li', 'pickchar__card racial__trait', h('span', 'pickchar__info', h('strong', 'pickchar__name', x.name), x.meta ? h('span', 'pickchar__meta', x.meta) : null, x.text ? h('span', 'racial__text', x.text) : null), b);
        }));
        if (!shown.length) list.append(h('li', 'empty', 'Nada com esse nome.'));
      };
      q.addEventListener('input', draw);
      const cancel = h('button', 'btn btn--ghost btn--sm', 'Cancelar');
      cancel.type = 'button';
      cancel.addEventListener('click', () => finish(null));
      const title = h('h2', '', o.title);
      title.id = 'cardask-title';
      dlg.replaceChildren(h('div', 'pickchar__body', title, o.tag ? h('p', 'racial__only', o.tag) : null,
        o.efeito ? h('p', 'powopt__efeito', o.efeito) : null, o.hint ? h('p', 'field__hint', o.hint) : null,
        o.items.length > 6 ? h('div', 'field racial__search', qLab, q) : null, list, h('div', 'dialog__actions', cancel)));
      dlg.onclose = () => finish(null);
      draw();
      openDialog(dlg);
    });
  }


  /* ---------- Slots: mods, propriedade e acessórios ----------
     Cada slot só aceita a peça do seu tipo. A raridade do item define quantos
     mods cabem e se cabe propriedade; 1 slot de mod livre vale 3 acessórios;
     cada posição (Mira, Bocal...) só leva um acessório. */
  const slotSnap = (e) => ({
    id: e.id || '', kind: e.kind, typeId: e.typeId || '', typeTitle: e.typeTitle || '', name: e.name,
    values: deep(e.values || {}), bonus: deep(e.bonus || {}),
    slots: e.slots && e.slots.accs && e.slots.accs.length ? { accs: e.slots.accs.map(slotSnap) } : null
  });
  function normSlots(s) {
    const pick = (k) => ((s && Array.isArray(s[k])) ? s[k] : []).map(slotSnap);
    return { mods: pick('mods'), props: pick('props'), accs: pick('accs') };
  }

  function slotInfo(item) {
    const r = (item.values && item.values.raridade) || 'Comum';
    const pos = SLOT_RULES.posicoes;
    if (isWeapon(item.kind)) return { rar: r, mods: SLOT_RULES.modsPorRaridade[r] || 0, props: SLOT_RULES.propArma[r] || 0, positions: pos[item.kind] || [] };
    if (item.kind === 'armadura') return { rar: r, mods: 0, props: SLOT_RULES.propArmadura[r] || 0, positions: [] };
    if (item.kind === 'mod-arma') {
      const para = item.values && item.values.para;
      const fogo = pos['arma-fogo'] || [], melee = pos['arma-melee'] || [];
      return { rar: r, mods: 0, props: 0, embedded: true, positions: para === 'Arma de fogo' ? fogo : para === 'Arma corpo a corpo' ? melee : fogo.concat(melee) };
    }
    return null;
  }
  const modCost = (m) => SLOT_RULES.custoMod[m.values && m.values.raridade] || 1;
  function slotUse(item) {
    const mods = item.slots.mods.reduce((t, m) => t + modCost(m), 0);
    const acc = Math.ceil(item.slots.accs.length / (SLOT_RULES.acessoriosPorSlot || 3));
    return { mods, acc, total: mods + acc };
  }
  function takenPositions(item) {
    const map = {};
    item.slots.mods.forEach((m) => ((m.slots && m.slots.accs) || []).forEach((a) => { map[a.values.posicao] = { acc: a, mod: m }; }));
    item.slots.accs.forEach((a) => { map[a.values.posicao] = { acc: a, mod: null }; });
    return map;
  }
  // a raridade caiu (ou o tipo mudou): tira o que não cabe mais
  function trimSlots(item) {
    const info = slotInfo(item);
    item.slots = normSlots(item.slots);
    if (!info) return 0;
    let removed = 0;
    while (item.slots.props.length > info.props) { item.slots.props.pop(); removed++; }
    item.slots.accs = item.slots.accs.filter((a) => { const ok = info.positions.indexOf(a.values.posicao) >= 0; if (!ok) removed++; return ok; });
    if (!info.embedded) {
      while (slotUse(item).total > info.mods) {
        if (item.slots.accs.length) item.slots.accs.pop(); else item.slots.mods.pop();
        removed++;
      }
    }
    return removed;
  }

  function slotChip(e, onRemove) {
    const chip = h('span', 'slot-chip', h('span', 'slot-chip__name', e.name));
    const color = rarColor(e.values && e.values.raridade);
    if (color) chip.style.setProperty('--rar', color);
    const text = entryText(e);
    if (text) chip.title = text;
    if (onRemove) {
      const x = h('button', 'slot-chip__x', '×');
      x.type = 'button';
      x.setAttribute('aria-label', 'Tirar ' + e.name);
      x.addEventListener('click', onRemove);
      chip.append(x);
    }
    return chip;
  }

  function slotEditor(item, onChange) {
    const box = h('div', 'slots');
    const changed = () => { if (onChange) onChange(); fill(); };
    const addBtn = (label, disabled, why, onClick) => {
      const b = h('button', 'btn btn--ghost btn--sm', label);
      b.type = 'button';
      b.disabled = disabled;
      if (disabled && why) b.title = why;
      b.addEventListener('click', onClick);
      return b;
    };

    function fill() {
      const info = slotInfo(item);
      box.replaceChildren();
      if (!info) return;
      item.slots = item.slots && item.slots.mods ? item.slots : normSlots(item.slots);
      const s = item.slots;
      const use = slotUse(item);
      const per = SLOT_RULES.acessoriosPorSlot || 3;
      box.append(h('h3', 'slots__title', info.embedded ? 'Acessórios embutidos no mod' : 'Slots'));

      // ----- Mods (só em armas)
      if (!info.embedded && isWeapon(item.kind)) {
        const free = info.mods - use.total;
        const g = h('div', 'slots__group');
        g.append(h('p', 'slots__label', 'Mods', h('span', 'slots__count', use.total + ' de ' + info.mods + (info.mods === 1 ? ' slot usado' : ' slots usados') + (use.acc ? ' (' + use.acc + ' com acessórios)' : ''))));
        const line = h('div', 'slots__line');
        s.mods.forEach((m, i) => line.append(slotChip(m, () => { s.mods.splice(i, 1); changed(); })));
        line.append(addBtn('Adicionar mod', free < 1, 'Sem slot de mod livre nesta raridade.', async () => {
          const e = await openPicker({
            title: 'Escolher mod', kinds: ['mod-arma'],
            chips: ['Mod de arma', WEAPON_PARA[item.kind], 'cabe em ' + free + (free === 1 ? ' slot' : ' slots')],
            filter: (x) => x.kind === 'mod-arma' && (!x.values.para || x.values.para === 'Qualquer arma' || x.values.para === WEAPON_PARA[item.kind]) && modCost(x) <= free
          });
          if (!e || e.kind !== 'mod-arma') return; // o slot só aceita mod
          const taken = takenPositions(item);
          const clash = ((e.slots && e.slots.accs) || []).find((a) => taken[a.values.posicao]);
          if (clash) { toast('A posição ' + clash.values.posicao + ' já está ocupada; tire o acessório antes de pôr este mod.'); return; }
          s.mods.push(slotSnap(e));
          changed();
        }));
        g.append(line, h('p', 'field__hint', 'Raridade ' + info.rar + ': ' + info.mods + (info.mods === 1 ? ' slot' : ' slots') + ' de mod. Mod Comum usa 1, Rara usa 2, Lendária usa 3.'));
        box.append(g);
      }

      // ----- Propriedade (a raridade decide se cabe)
      if (!info.embedded) {
        const g = h('div', 'slots__group');
        g.append(h('p', 'slots__label', 'Propriedade', h('span', 'slots__count', info.props ? s.props.length + ' de ' + info.props : 'bloqueada')));
        if (!info.props) g.append(h('p', 'field__hint', 'A raridade ' + info.rar + ' não comporta propriedade. Só Incomum, Épica e Lendária.'));
        else {
          const line = h('div', 'slots__line');
          s.props.forEach((p, i) => line.append(slotChip(p, () => { s.props.splice(i, 1); changed(); })));
          const target = isWeapon(item.kind) ? 'Arma' : 'Armadura';
          line.append(addBtn('Adicionar propriedade', s.props.length >= info.props, 'Este item já tem todas as propriedades que a raridade permite.', async () => {
            const e = await openPicker({
              title: 'Escolher propriedade', kinds: ['propriedade'], chips: ['Propriedade', 'para ' + target.toLowerCase()],
              filter: (x) => x.kind === 'propriedade' && (!x.values.para || x.values.para === 'Qualquer item' || x.values.para === target) && !s.props.some((p) => p.id && p.id === x.id)
            });
            if (!e || e.kind !== 'propriedade') return; // o slot só aceita propriedade
            s.props.push(slotSnap(e));
            changed();
          }));
          g.append(line);
        }
        box.append(g);
      }

      // ----- Acessórios: uma posição, um acessório
      if (info.positions.length) {
        const g = h('div', 'slots__group');
        if (!info.embedded) g.append(h('p', 'slots__label', 'Acessórios', h('span', 'slots__count', s.accs.length + ' colocados · cada slot de mod livre leva ' + per)));
        const taken = takenPositions(item);
        const noRoom = !info.embedded && Math.ceil((s.accs.length + 1) / per) + use.mods > info.mods;
        const grid = h('div', 'slots__grid');
        info.positions.forEach((pos) => {
          const cell = h('div', 'slots__pos', h('span', 'slots__pos-name', pos));
          const t = taken[pos];
          if (t && t.mod) cell.append(slotChip(t.acc), h('span', 'field__hint', 'vem no mod ' + t.mod.name));
          else if (t) cell.append(slotChip(t.acc, () => { s.accs.splice(s.accs.indexOf(t.acc), 1); changed(); }));
          else {
            cell.append(addBtn('Escolher', noRoom, 'Sem slot de mod livre para mais acessórios.', async () => {
              const e = await openPicker({
                title: 'Escolher acessório: ' + pos, kinds: ['acessorio'],
                chips: ['Acessório', pos].concat(WEAPON_PARA[item.kind] ? [WEAPON_PARA[item.kind]] : []),
                filter: (x) => x.kind === 'acessorio' && x.values.posicao === pos && (info.embedded || x.typeId === item.kind)
              });
              if (!e || e.kind !== 'acessorio' || e.values.posicao !== pos) return; // o slot só aceita acessório desta posição
              s.accs.push(slotSnap(e));
              changed();
            }));
          }
          grid.append(cell);
        });
        g.append(grid);
        box.append(g);
      }
    }
    fill();
    return box;
  }

  /* ---------- Sub-tela de pesquisa ----------
     Procura no banco inteiro, já filtrada pelo que o slot aceita.
     Devolve a peça escolhida (ou null se a pessoa fechar). */
  const pickerDlg = $('#picker');
  const pk = { opts: null, resolve: null, seq: 0, on: new Set() };

  function finishPicker(value) {
    const r = pk.resolve;
    pk.resolve = null;
    pk.opts = null;
    if (pickerDlg.open) closeDialog(pickerDlg);
    if (r) r(value);
  }

  async function runPicker() {
    const o = pk.opts;
    if (!o) return;
    const seq = ++pk.seq;
    const q = $('#picker-q').value;
    let list;
    let warn = '';
    try { list = await libSearch(o.kinds, q); }
    catch (err) { warn = errorMessage(err); list = rankSearch(BUILTINS.filter((e) => o.kinds.indexOf(e.kind) >= 0), q, entryFields); }
    if (seq !== pk.seq || pk.opts !== o) return;
    const suggest = libSearch.suggest;
    const favs = favLoad();
    const favOnly = $('#picker-fav').checked;
    // chips escolhidos pela pessoa: mostra só essas categorias (nenhum escolhido = todas)
    const picked = (o.chips || []).filter((c) => c && c.kinds && pk.on.has(c.label));
    const allowed = picked.length ? picked.reduce((t, c) => t.concat(c.kinds), []) : null;
    list = list.filter((e) => (!o.filter || o.filter(e)) && (!favOnly || favs.has(e.id)) && (!allowed || allowed.indexOf(e.kind) >= 0));
    list = pkFacets.apply(list, allowed || o.kinds);
    // com texto, vale a relevância; sem texto, favoritos primeiro e o resto em ordem alfabética
    if (!hasQuery(q)) list.sort((a, b) => (Number(favs.has(b.id)) - Number(favs.has(a.id))) || a.name.localeCompare(b.name, 'pt-BR'));
    $('#picker-list').replaceChildren(...list.map((e) => libRow(e,
      [{ label: 'Escolher', cls: 'btn--primary', onClick: () => finishPicker(deep(e)) }],
      () => { if ($('#picker-fav').checked) runPicker(); })));
    $('#picker-empty').hidden = list.length > 0;
    pkMulti.paint();
    suggestAfter($('#picker-list'), list.length ? '' : suggest, $('#picker-q'), runPicker);
    $('#picker-hint').textContent = warn || plural(list.length, 'opção compatível', 'opções compatíveis') + (favOnly ? ' entre os favoritos' : '');
  }

  function openPicker(opts) {
    if (pk.resolve) finishPicker(null);
    return new Promise((resolve) => {
      pk.opts = opts;
      pk.resolve = resolve;
      $('#picker-title').textContent = opts.title;
      pk.on = new Set();
      pkFacets.reset();
      pkFacets.box.hidden = true;
      const chips = (opts.chips || []).filter(Boolean);
      const toggles = chips.some((c) => c.kinds);
      $('#picker-chips').replaceChildren(h('span', 'picker__filter-label', toggles ? 'Filtro (toque para mostrar só as escolhidas):' : 'Filtro automático:'), ...chips.map((c) => {
        if (!c.kinds) return h('span', 'chip', c.label || c);
        const b = h('button', 'chip chip--toggle', c.label);
        b.type = 'button';
        b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', () => {
          if (pk.on.has(c.label)) pk.on.delete(c.label); else pk.on.add(c.label);
          b.setAttribute('aria-pressed', String(pk.on.has(c.label)));
          runPicker();
        });
        return b;
      }));
      $('#picker-q').value = '';
      $('#picker-fav').checked = false;
      $('#picker-list').replaceChildren();
      pk.multi = Boolean(opts.multi);
      pkMulti.reset();
      $('#picker-empty').hidden = true;
      $('#picker-create').hidden = !opts.create;
      if (opts.create) $('#picker-create-btn').textContent = opts.create.label;
      $('#picker-hint').textContent = 'Buscando...';
      openDialog(pickerDlg);
      runPicker();
      if (window.matchMedia('(pointer: fine)').matches) $('#picker-q').focus();
    });
  }
  // seleção múltipla do picker: só nos menus que aceitam vários itens (openPickerMany)
  // a categoria já tem os chips do topo quando o menu aceita mais de uma
  const pkFacets = facetBox(() => runPicker(), { skip: () => ((pk.opts && pk.opts.chips) || []).some((c) => c && c.kinds) ? ['_kind'] : [] });
  $('#picker-hint').before(pkFacets.box);
  const pkMulti = multiPick($('#picker-list'), { enabled: () => pk.multi, label: (n) => 'Adicionar ' + (n || ''), onConfirm: (list) => finishPicker(list) });
  $('#picker-list').before(pkMulti.tip);
  $('#picker-list').after(pkMulti.bar);
  // como openPicker, mas devolve sempre uma lista (vazia se fechar sem escolher)
  async function openPickerMany(opts) {
    const r = await openPicker(Object.assign({}, opts, { multi: true }));
    return !r ? [] : Array.isArray(r) ? r : [r];
  }
  $('#picker-q').addEventListener('input', debounce(runPicker, 250));
  $('#picker-fav').addEventListener('change', runPicker);
  $('#picker-close').addEventListener('click', () => finishPicker(null));
  $('#picker-create-btn').addEventListener('click', () => {
    const c = pk.opts && pk.opts.create;
    finishPicker(null);
    if (c) c.onClick();
  });
  pickerDlg.addEventListener('close', () => finishPicker(null));

  /* ---------- Oficina: categoria → tipo → formulário ---------- */
  const itemState = { step: 'categoria', draft: null };

  function itemCard(title, hint, onClick) {
    const btn = h('button', 'item-card', h('span', 'item-card__title', title), hint ? h('span', 'item-card__hint', hint) : null);
    btn.type = 'button';
    btn.addEventListener('click', onClick);
    return btn;
  }

  function setItemStep(step) {
    itemState.step = step;
    ['categoria', 'tipo', 'form'].forEach((s) => { $('#item-panel-' + s).hidden = s !== step; });
    $$('.item-steps__step').forEach((b) => b.setAttribute('aria-current', b.dataset.itemStep === step ? 'step' : 'false'));
    const d = itemState.draft;
    const cat = d ? findCategory(d.kind) : null;
    $('#step-tipo-btn').hidden = !cat || !cat.types || step === 'categoria';
    $('#step-form-btn').hidden = step !== 'form';
  }

  function renderCategoryGrid() {
    const grid = $('#item-category-grid');
    grid.replaceChildren();
    let lastGroup = null;
    ITEM_DATA.categories.forEach((c) => {
      if (c.group !== lastGroup) { grid.append(h('p', 'item-grid__group', c.group)); lastGroup = c.group; }
      grid.append(itemCard(c.title, c.hint, () => openCategory(c.id)));
    });
  }

  function openCategory(id) {
    const cat = findCategory(id);
    if (!cat) return;
    itemState.draft = { kind: id };
    if (cat.types) {
      $('#item-tipo-title').textContent = cat.title;
      $('#item-tipo-hint').textContent = cat.hint || '';
      $('#item-type-grid').replaceChildren(...cat.types.map((t) => itemCard(t.title, t.sub || null, () => openForm(id, t.id, null))));
      setItemStep('tipo');
      $('#item-tipo-title').focus({ preventScroll: true });
      return;
    }
    openForm(id, '', null);
  }

  // opções de um campo: as do tipo escolhido (média de criação) ou a lista geral
  function fieldOptions(field, type) {
    if (field.optKey && type && type.opts && type.opts[field.optKey]) return type.opts[field.optKey];
    return Array.isArray(field.options) ? field.options : (ITEM_DATA[field.options] || []);
  }

  // campo automático: o valor sai de uma tabela conforme outro campo (raridade → Defesa, tipo → CC)
  function autoValue(f, type, values) {
    if (!f.auto) return undefined;
    const table = (type && type[f.auto.table]) || ITEM_DATA[f.auto.table];
    return table ? table[values[f.auto.from]] : undefined;
  }

  function newDraft(kind, typeId, from) {
    const cat = findCategory(kind);
    const type = findType(cat, typeId);
    if (from) {
      return {
        id: from.id || null, kind, typeId: from.typeId || '', name: from.name || '', values: deep(from.values || {}),
        image: from.image || '', thumb: from.thumb || '', slots: normSlots(from.slots), bonus: deep(from.bonus || {})
      };
    }
    const values = Object.assign({}, cat.defaults || {}, (type && type.defaults) || {});
    cat.fields.forEach((f) => {
      if (f.key === 'nome' || values[f.key] !== undefined) return;
      const opts = fieldOptions(f, type);
      if (f.kind === 'multi') values[f.key] = (type && type.opts && type.opts[f.optKey]) ? opts.join(', ') : '';
      else if (f.kind === 'rarity') values[f.key] = opts[0] || '';
      else if (f.kind === 'cards') values[f.key] = opts[0] ? opts[0].value : '';
      else if (f.kind === 'select' && opts.length === 1) values[f.key] = opts[0];
      else if (f.defaultFrom && type && type[f.defaultFrom] !== undefined) values[f.key] = String(type[f.defaultFrom]);
      else values[f.key] = '';
    });
    cat.fields.forEach((f) => { const v = autoValue(f, type, values); if (v !== undefined) values[f.key] = v; });
    return { id: null, kind, typeId: typeId || '', name: '', values, image: '', thumb: '', slots: normSlots(null), bonus: {} };
  }

  /* Espécime: 3 caixas, uma para cada habilidade racial (o Etheriano compra as de outros por 1 UP). Grava no formato "Nome | efeito | 1", uma por linha. */
  /* Script: fica escondido num "</>" discreto no fim do poder. É onde mora a mecânica (vida base, UP, núcleo, flags, bônus). */
  function scriptField(id, value, onChange) {
    const box = h('details', 'script');
    box.open = Boolean(String(value || '').trim());
    const ta = h('textarea', 'input script__code');
    ta.id = id;
    ta.rows = 4;
    ta.maxLength = 600;
    ta.spellcheck = false;
    ta.autocapitalize = 'off';
    ta.value = value || '';
    ta.placeholder = 'vida: Blindagem\nup: 2\nacopla';
    const state = h('p', 'script__state');
    const check = () => {
      const r = parseScript(ta.value);
      state.classList.toggle('script__state--bad', r.bad.length > 0);
      state.textContent = r.bad.length ? 'Não entendi: ' + r.bad.join(' · ') : (ta.value.trim() ? 'OK: ' + ([r.vida ? 'vida base ' + r.vida : '', r.up ? signed(r.up) + ' UP iniciais' : '', r.nucleo ? 'núcleo +' + r.nucleo : '', r.desloc ? signed(r.desloc) + ' m de deslocamento' : '', Object.keys(r.skills).map((k) => '+' + r.skills[k] + ' em ' + skillLabel(k)).join(', '), r.acopla ? 'acopla' : '', r.humanidade ? 'Humanidade' : '', r.eletronico ? 'eletrônico' : '', bonusLine(r.bonus)].filter(Boolean).join(' · ') || 'nada') + '.' : '');
    };
    ta.addEventListener('input', () => { onChange(ta.value); check(); });
    check();
    const lab = h('label', 'visually-hidden', 'Script do poder');
    lab.htmlFor = id;
    box.append(h('summary', 'script__sum', h('span', 'script__icon', '</>'), ' script'),
      h('div', 'script__body', lab, ta, state,
        h('ul', 'script__help', ...SCRIPT_HELP.map((x) => h('li', '', h('code', '', x[0]), ' ' + x[1])))));
    return box;
  }
  // o script de uma habilidade racial vai na mesma linha do texto: regras separadas por ";"
  const scriptOneLine = (txt) => String(txt || '').split(/[\n;]/).map((x) => x.replace(/\|/g, '/').trim()).filter(Boolean).join('; ');
  function racial3Field(field, value, onChange) {
    const cur = powerLines(value).slice(0, 3);
    while (cur.length < 3) cur.push({ name: '', text: '', script: '' });
    const box = h('div', 'racial3');
    box.setAttribute('role', 'group');
    const save = () => onChange(cur.filter((t) => cleanName(t.name)).map((t) => cleanName(t.name).replace(/\|/g, '/') + ' | ' + String(t.text || '').replace(/\s*\n\s*/g, ' ').replace(/\|/g, '/').trim() + ' | 1' + (String(t.script || '').trim() ? ' | ' + scriptOneLine(t.script) : '')).join('\n'));
    cur.forEach((t, i) => {
      const nm = h('input', 'input');
      nm.type = 'text';
      nm.maxLength = 60;
      nm.autocomplete = 'off';
      nm.value = t.name;
      nm.placeholder = ['Ex.: Núcleo', 'Ex.: Engenharia', 'Ex.: Não vivo'][i];
      nm.dataset.fid = 'racial3-' + field.key + '-' + i + '-nome';
      nm.setAttribute('aria-label', 'Nome da habilidade racial ' + (i + 1));
      nm.addEventListener('input', () => { t.name = nm.value; save(); });
      const tx = h('textarea', 'input');
      tx.rows = 2;
      tx.maxLength = 400;
      tx.value = t.text;
      tx.placeholder = 'O que ela faz.';
      tx.dataset.fid = 'racial3-' + field.key + '-' + i + '-efeito';
      tx.setAttribute('aria-label', 'Efeito da habilidade racial ' + (i + 1));
      tx.addEventListener('input', () => { t.text = tx.value; save(); });
      const sc = scriptField('racial3-' + field.key + '-' + i + '-script', String(t.script || '').split(/\s*;\s*/).filter(Boolean).join('\n'), (v) => { t.script = v; save(); });
      box.append(h('div', 'racial3__box', h('p', 'racial3__head', h('span', 'racial3__num', String(i + 1)), h('span', '', 'Habilidade racial')), nm, tx, sc));
    });
    return box;
  }

  /* Opções de um poder-lista e melhorias: um cartão por linha (nome, efeito, custo), guardado no
     mesmo texto "Nome | efeito | custo | script". "Poder do banco" traz um poder real como opção,
     com efeito, custo e script dele. */
  function powerLinesField(field, value, onChange) {
    const ups = field.key === 'melhorias';
    const cur = powerLines(value);
    const box = h('div', 'pwlines');
    box.setAttribute('role', 'group');
    const list = h('div', 'pwlines__list');
    let lib = BUILTINS.filter((e) => e.kind === 'poder');
    const oneLine = (x) => String(x || '').replace(/\s*\n\s*/g, ' ').replace(/\|/g, '/').trim();
    const save = () => onChange(cur.filter((t) => cleanName(t.name)).map((t) => [cleanName(t.name).replace(/\|/g, '/'), oneLine(t.text), oneLine(t.cost)]
      .concat(String(t.script || '').trim() ? [scriptOneLine(t.script)] : []).join(' | ')).join('\n'));
    const fromBank = (t) => lib.find((e) => nameKey(e.name) === nameKey(t.name));
    const paint = () => {
      list.replaceChildren(...cur.map((t, i) => {
        const fid = 'pwl-' + field.key + '-' + i;
        const nm = h('input', 'input');
        nm.type = 'text';
        nm.maxLength = 60;
        nm.autocomplete = 'off';
        nm.value = t.name;
        nm.placeholder = ups ? 'Ex.: Regeneração maior' : 'Ex.: Esquiva';
        nm.dataset.fid = fid + '-nome';
        nm.setAttribute('aria-label', (ups ? 'Nome da melhoria ' : 'Nome da opção ') + (i + 1));
        nm.addEventListener('input', () => { t.name = nm.value; save(); });
        const cost = h('input', 'input pwlines__cost');
        cost.type = 'text';
        cost.maxLength = 20;
        cost.autocomplete = 'off';
        cost.value = t.cost;
        cost.placeholder = ups ? 'UP (1)' : 'Uso (1 PE)';
        cost.dataset.fid = fid + '-custo';
        cost.setAttribute('aria-label', (ups ? 'Custo em UP da melhoria ' : 'Custo de uso da opção ') + (i + 1));
        cost.addEventListener('input', () => { t.cost = cost.value; save(); });
        const tx = h('textarea', 'input');
        tx.rows = 2;
        tx.maxLength = 400;
        tx.value = t.text;
        tx.placeholder = 'O que ela faz.';
        tx.dataset.fid = fid + '-efeito';
        tx.setAttribute('aria-label', (ups ? 'Efeito da melhoria ' : 'Efeito da opção ') + (i + 1));
        tx.addEventListener('input', () => { t.text = tx.value; save(); });
        const rm = h('button', 'icon-btn', '×');
        rm.type = 'button';
        rm.dataset.fid = fid + '-tirar';
        rm.setAttribute('aria-label', 'Tirar ' + (t.name || (ups ? 'melhoria ' : 'opção ') + (i + 1)));
        rm.addEventListener('click', () => { cur.splice(i, 1); save(); paint(); });
        const bank = fromBank(t);
        const sc = scriptField(fid + '-script', String(t.script || '').split(/\s*;\s*/).filter(Boolean).join('\n'), (v) => { t.script = v; save(); });
        return h('div', 'pwlines__row',
          h('p', 'racial3__head', h('span', 'racial3__num', String(i + 1)), h('span', '', ups ? 'Melhoria' : 'Opção'), bank ? h('span', 'tag', 'Poder do banco') : null, rm),
          h('div', 'pwlines__top', nm, cost), tx, sc);
      }));
      list.hidden = !cur.length;
    };
    const add = h('button', 'btn btn--ghost btn--sm', ups ? '+ Melhoria' : '+ Opção');
    add.type = 'button';
    add.dataset.fid = 'pwl-' + field.key + '-add';
    add.addEventListener('click', () => { cur.push({ name: '', text: '', cost: '', script: '' }); paint(); const el = $('[data-fid="pwl-' + field.key + '-' + (cur.length - 1) + '-nome"]', box); if (el) el.focus(); });
    const pick = h('button', 'btn btn--ghost btn--sm', '+ Poder do banco');
    pick.type = 'button';
    pick.dataset.fid = 'pwl-' + field.key + '-bank';
    pick.addEventListener('click', async () => {
      const e = await openPicker({ title: ups ? 'Poder que vira melhoria' : 'Poder que vira opção', kinds: ['poder'], chips: ['Poder', 'sem opções'],
        filter: (x) => x.kind === 'poder' && !powerOpts(x).length && !CHOICE_POWERS[x.id] && !cur.some((t) => nameKey(t.name) === nameKey(x.name)) });
      if (!e) return;
      if (!lib.some((x) => nameKey(x.name) === nameKey(e.name))) lib = lib.concat([e]);
      const v = e.values || {};
      cur.push({ name: e.name, text: v.efeito || '', cost: ups ? String(v.custo || '1') : String(v.custoUso || ''), script: powerScript(e) });
      save();
      paint();
    });
    libSearch(['poder'], '').then((l) => { lib = l; paint(); }).catch(() => { /* fica o catálogo oficial */ });
    paint();
    box.append(list, h('div', 'banklines__foot', add, pick));
    return box;
  }

  /* Texto com uma linha por item (ou poder) e um botão para trazer do banco.
     Com budget, soma o preço do que veio do banco e só deixa pegar o que cabe no dinheiro inicial. */
  function bankLinesField(field, value, onChange) {
    const kinds = field.bank === 'poder' ? ['poder'] : INVENTORY_KINDS;
    const ta = h('textarea', 'input');
    ta.id = 'item-f-' + field.key;
    ta.rows = 3;
    ta.maxLength = 1200;
    ta.value = value || '';
    if (field.placeholder) ta.placeholder = field.placeholder;
    let lib = BUILTINS.filter((e) => kinds.indexOf(e.kind) >= 0);
    const list = h('ul', 'banklines__list');
    const sum = h('p', 'banklines__sum');
    const lineKey = (l) => nameKey(String(l).replace(/[;.]\s*$/, '').replace(/^1\s+/, ''));
    const lines = () => ta.value.split('\n').map((x) => x.trim()).filter(Boolean);
    const found = (l) => lib.find((e) => nameKey(e.name) === lineKey(l));
    const total = () => lines().reduce((t, l) => t + priceOf(found(l)), 0);
    const paint = () => {
      list.replaceChildren(...lines().map((l, i) => {
        const e = found(l);
        const rm = h('button', 'icon-btn', '×');
        rm.type = 'button';
        rm.setAttribute('aria-label', 'Tirar ' + l);
        rm.addEventListener('click', () => { const all = lines(); all.splice(i, 1); ta.value = all.join('\n'); onChange(ta.value); paint(); });
        return h('li', 'banklines__item' + (e ? ' is-bank' : ''), e ? entryIcon(e) : null,
          h('span', 'banklines__name', e ? e.name : l),
          h('span', 'banklines__meta', e ? (field.budget ? (priceOf(e) ? fmtCronos(priceOf(e)) + ' Cronos' : 'sem preço') : kindTitle(e.kind)) : 'texto livre'), rm);
      }));
      list.hidden = !lines().length;
      if (field.budget) {
        const t = total();
        sum.className = 'banklines__sum' + (t > START_CRONOS ? ' is-over' : '');
        sum.replaceChildren('Itens do banco: ', h('strong', '', fmtCronos(t)), ' de ' + fmtCronos(START_CRONOS) + ' Cronos (o dinheiro inicial de todo personagem).');
      }
    };
    ta.addEventListener('input', () => { onChange(ta.value); paint(); });
    const add = h('button', 'btn btn--ghost btn--sm', field.bank === 'poder' ? '+ Poder do banco' : '+ Item do banco');
    add.type = 'button';
    add.dataset.fid = 'banklines-' + field.key;
    add.addEventListener('click', async () => {
      const left = START_CRONOS - total();
      const e = await openPicker(field.bank === 'poder'
        ? { title: 'Poder de nascença', kinds, chips: ['Poder'], filter: (x) => x.kind === 'poder' }
        : { title: 'Item inicial (sobram ' + fmtCronos(Math.max(0, left)) + ' Cronos)', kinds, chips: [
          { label: 'Armas', kinds: ['arma-melee', 'arma-fogo'] }, { label: 'Munições', kinds: ['municao'] }, { label: 'Armaduras', kinds: ['armadura'] }, { label: 'Vestíveis', kinds: ['vestivel'] },
          { label: 'Implantes', kinds: ['nucleo', 'protese-modulo'] }, { label: 'Peças de slot', kinds: ['mod-arma', 'propriedade', 'acessorio'] }, { label: 'Itens gerais', kinds: ['item-geral'] }],
        filter: (x) => kinds.indexOf(x.kind) >= 0 && (!field.budget || priceOf(x) <= left) });
      if (!e) return;
      if (!lib.some((x) => nameKey(x.name) === nameKey(e.name))) lib = lib.concat([e]);
      ta.value = lines().concat([e.name]).join('\n');
      onChange(ta.value);
      paint();
    });
    libSearch(kinds, '').then((l) => { lib = l; paint(); }).catch(() => { /* fica o catálogo oficial */ });
    paint();
    return h('div', 'banklines', list, ta, h('div', 'banklines__foot', field.budget ? sum : null, add));
  }

  function fieldControl(field, type, value, onChange) {
    const id = 'item-f-' + field.key;
    const opts = fieldOptions(field, type);
    if (field.kind === 'select') {
      const sel = h('select', 'input');
      sel.id = id;
      const blank = h('option', '', field.blank || 'Escolha...');
      blank.value = '';
      sel.append(blank);
      const all = value && opts.indexOf(value) < 0 ? opts.concat([value]) : opts; // valor antigo, fora das opções: mantém
      all.forEach((op) => { const o = h('option', '', op); o.value = op; sel.append(o); });
      sel.value = value || '';
      sel.addEventListener('change', () => onChange(sel.value));
      return sel;
    }
    if (field.kind === 'multi') {
      const on = String(value || '').split(',').map((x) => x.trim()).filter(Boolean);
      const box = h('div', 'checks');
      box.setAttribute('role', 'group');
      opts.forEach((op) => {
        const inp = h('input');
        inp.type = 'checkbox';
        inp.value = op;
        inp.checked = on.indexOf(op) >= 0;
        inp.addEventListener('change', () => onChange($$('input:checked', box).map((x) => x.value).join(', ')));
        box.append(h('label', 'check check--pill', inp, h('span', '', op)));
      });
      return box;
    }
    if (field.kind === 'cards') {
      const box = h('div', 'pick-grid pick-grid--form');
      box.setAttribute('role', 'radiogroup');
      opts.forEach((op) => {
        const inp = h('input');
        inp.type = 'radio';
        inp.name = id;
        inp.value = op.value;
        inp.checked = op.value === value;
        inp.addEventListener('change', () => onChange(op.value));
        box.append(h('label', 'pick-card pick-card--radio', inp, h('span', 'pick-card__title', op.value), h('span', 'pick-card__text', op.sub)));
      });
      return box;
    }
    if (field.kind === 'rarity') {
      const box = h('div', 'rarity');
      box.setAttribute('role', 'radiogroup');
      opts.forEach((op) => {
        const inp = h('input');
        inp.type = 'radio';
        inp.name = id;
        inp.value = op;
        inp.checked = op === value;
        inp.addEventListener('change', () => onChange(op));
        const lab = h('label', 'rarity__opt', inp, h('span', '', op));
        lab.style.setProperty('--rar', rarColor(op) || 'var(--linha-forte)');
        box.append(lab);
      });
      return box;
    }
    if (field.kind === 'racial3') return racial3Field(field, value, onChange);
    if (field.kind === 'script') return scriptField(id, value, onChange);
    if (field.kind === 'banklines') return bankLinesField(field, value, onChange);
    if (field.kind === 'powerlines') return powerLinesField(field, value, onChange);
    if (field.kind === 'textarea') {
      const ta = h('textarea', 'input');
      ta.id = id;
      ta.rows = 3;
      ta.maxLength = 1200;
      ta.value = value || '';
      if (field.placeholder) ta.placeholder = field.placeholder;
      ta.addEventListener('input', () => onChange(ta.value));
      return ta;
    }
    const inp = h('input', 'input');
    inp.id = id;
    inp.autocomplete = 'off';
    if (field.kind === 'number') {
      inp.type = 'number';
      inp.inputMode = 'decimal';
      if (field.min !== undefined) inp.min = field.min;
      if (field.step) inp.step = field.step;
      const max = field.maxFrom && type ? type[field.maxFrom] : undefined;
      if (max !== undefined) inp.max = max;
      inp.value = value === undefined || value === null ? '' : String(value).replace(',', '.');
    } else {
      inp.type = 'text';
      inp.maxLength = field.key === 'nome' ? 60 : 80;
      inp.value = value || '';
      if (field.placeholder) inp.placeholder = field.placeholder;
    }
    inp.addEventListener('input', () => onChange(inp.value));
    return inp;
  }

  function renderItemImage() {
    const d = itemState.draft;
    const has = Boolean(d.image || d.thumb);
    const img = $('#item-image-img');
    img.hidden = !has;
    if (has) img.src = d.image || d.thumb; else img.removeAttribute('src');
    $('#item-image-empty').hidden = has;
    $('#item-image-remove').hidden = !has;
  }

  function renderItemSlots() {
    const d = itemState.draft;
    const removed = trimSlots(d);
    if (removed) toast(plural(removed, 'peça saiu', 'peças saíram') + ' dos slots: não cabe mais neste item.');
    $('#item-slots').replaceChildren(slotEditor(d));
  }

  function openForm(kind, typeId, from) {
    const cat = findCategory(kind);
    if (!cat) return;
    const d = itemState.draft = newDraft(kind, typeId, from);
    const type = findType(cat, d.typeId);
    $('#item-form-title').textContent = (d.id ? 'Editar: ' : '') + cat.title + (type ? ' · ' + type.title : '');
    $('#item-form-hint').textContent = type && type.opts && isWeapon(cat.id)
      ? 'Opções limitadas à média de criação de ' + type.title + (type.cargaMax ? ' (carga máxima ' + type.cargaMax + ').' : '.')
      : (cat.hint || '');

    const grid = $('#item-fields');
    grid.replaceChildren();
    cat.fields.forEach((f) => {
      if (f.onlyWithOpts && !(type && type.opts && type.opts[f.optKey])) return; // campo que só existe em alguns tipos
      if (f.hidden) return; // escrito por outro campo (o roteiro da build)
      if (f.kind === 'roteiro') { grid.append(h('div', 'field field--wide', h('span', 'field__label', f.label), roteiroField(d))); return; }
      if (f.kind === 'script') { grid.append(h('div', 'field field--wide', fieldControl(f, type, d.values[f.key], (v) => { d.values[f.key] = v; }))); return; }
      const isName = f.key === 'nome';
      const ctrl = fieldControl(f, type, isName ? d.name : d.values[f.key], (v) => {
        if (isName) d.name = v; else d.values[f.key] = v;
        cat.fields.forEach((g) => { // campos automáticos que dependem deste
          if (!g.auto || g.auto.from !== f.key) return;
          const nv = autoValue(g, type, d.values);
          if (nv === undefined) return;
          d.values[g.key] = nv;
          const el = $('#item-f-' + g.key);
          if (el) el.value = nv;
        });
        if (f.key === 'raridade' || f.key === 'para') renderItemSlots();
      });
      const grouped = f.kind === 'multi' || f.kind === 'rarity' || f.kind === 'cards' || f.kind === 'racial3' || f.kind === 'powerlines';
      const label = h(grouped ? 'span' : 'label', 'field__label', f.label);
      if (!grouped) label.htmlFor = 'item-f-' + f.key;
      if (grouped) { const gid = 'item-l-' + f.key; label.id = gid; ctrl.setAttribute('aria-labelledby', gid); }
      const wrap = h('div', 'field' + (f.big || f.kind === 'multi' ? ' field--wide' : ''), label, ctrl);
      if (f.kind === 'number' && ctrl.max) wrap.append(h('p', 'field__hint', 'Máximo ' + ctrl.max + ' para este tipo.'));
      if (f.hint) wrap.append(h('p', 'field__hint', f.hint));
      grid.append(wrap);
    });

    $('#item-image-slot').hidden = !cat.image;
    renderItemImage();
    renderItemSlots();

    const bonusWrap = $('#item-bonus-wrap');
    bonusWrap.hidden = !cat.bonus;
    bonusWrap.open = BONUS_KEYS.some((b) => num(d.bonus[b[0]]) !== 0);
    $('#item-bonus').replaceChildren(...BONUS_KEYS.map((b) => {
      const inp = h('input', 'input');
      inp.type = 'number';
      inp.step = '1';
      inp.inputMode = 'numeric';
      inp.id = 'item-b-' + b[0];
      inp.value = num(d.bonus[b[0]]) || '';
      inp.placeholder = '0';
      inp.addEventListener('input', () => { d.bonus[b[0]] = num(inp.value); });
      const lab = h('label', 'field__label bonus__label bonus__label--' + b[0], b[1]);
      lab.htmlFor = inp.id;
      return h('div', 'field', lab, inp);
    }));

    $('#item-save').textContent = d.id ? 'Salvar alterações' : 'Salvar no banco';
    setItemStep('form');
    $('#item-form-title').focus({ preventScroll: true });
    $('#item-panel-form').scrollIntoView({ block: 'start' });
  }

  $('#item-image-btn').addEventListener('click', () => $('#item-image-file').click());
  $('#item-image-file').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file || !itemState.draft) return;
    if (file.size > 20 * 1024 * 1024) { toast('Imagem grande demais. Use uma de até 20 MB.'); return; }
    try { Object.assign(itemState.draft, await fileToImages(file, 256, 96)); renderItemImage(); }
    catch (err) { toast(errorMessage(err)); }
  });
  $('#item-image-remove').addEventListener('click', () => { itemState.draft.image = itemState.draft.thumb = ''; renderItemImage(); });

  $('#item-back-categoria').addEventListener('click', (ev) => { ev.preventDefault(); setItemStep('categoria'); });
  $('#item-back-tipo').addEventListener('click', (ev) => {
    ev.preventDefault();
    const d = itemState.draft;
    const cat = d ? findCategory(d.kind) : null;
    if (cat && cat.types && !d.id) setItemStep('tipo'); else setItemStep('categoria');
  });
  $$('.item-steps__step').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.itemStep === 'form') return;
    if (b.dataset.itemStep === 'tipo' && itemState.draft && !itemState.draft.id) { openCategory(itemState.draft.kind); return; }
    setItemStep('categoria');
  }));
  $('#item-reset').addEventListener('click', () => { itemState.draft = null; setItemStep('categoria'); });

  $('#form-item').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const d = itemState.draft;
    if (!d) return;
    const cat = findCategory(d.kind);
    const type = findType(cat, d.typeId);
    const name = cleanName(d.name || '');
    if (!name) { toast('Dê um nome antes de salvar.'); $('#item-f-nome').focus(); return; }
    const carga = cat.fields.find((f) => f.maxFrom);
    if (carga && type && type[carga.maxFrom] !== undefined && num(d.values[carga.key]) > type[carga.maxFrom]) {
      toast('A carga máxima de ' + type.title + ' é ' + type[carga.maxFrom] + '.');
      $('#item-f-' + carga.key).focus();
      return;
    }
    const values = {};
    cat.fields.forEach((f) => { if (f.key !== 'nome') values[f.key] = String(d.values[f.key] === undefined || d.values[f.key] === null ? '' : d.values[f.key]).trim(); });
    // espécime antigo: os campos de mecânica saíram do formulário, mas continuam valendo até virarem poder
    if (cat.id === 'especime') LEGACY_SPECIES.forEach((k) => { if (d.values[k] !== undefined && d.values[k] !== '') values[k] = String(d.values[k]); });
    const bonus = {};
    if (cat.id === 'especime' && d.bonus) BONUS_KEYS.forEach((b) => { if (num(d.bonus[b[0]])) bonus[b[0]] = num(d.bonus[b[0]]); });
    BONUS_KEYS.forEach((b) => { if (cat.bonus && num(d.bonus[b[0]])) bonus[b[0]] = num(d.bonus[b[0]]); });
    const entry = {
      kind: cat.id, typeId: d.typeId || '', typeTitle: type ? type.title : '', kindTitle: cat.title, name, values, bonus,
      slots: cat.slots ? normSlots(d.slots) : {}, image: cat.image ? d.image : '', thumb: cat.image ? d.thumb : ''
    };
    if (d.id) entry.id = d.id;
    const btn = $('#item-save');
    btn.disabled = true;
    try {
      await db.saveLibrary(entry);
      const notItem = NON_ITEM_KINDS.indexOf(cat.id) >= 0;
      toast(name + (d.id ? ': alterações salvas.' : ' entrou no banco.') + (notItem ? ' Aparece em Personagens, no catálogo.' : ''));
      itemState.draft = null;
      setItemStep('categoria');
      await runLib();
      if (!notItem) $('#lib-title').scrollIntoView({ block: 'start' });
    } catch (err) { toast(errorMessage(err)); }
    finally { btn.disabled = false; }
  });

  /* ---------- Temas secretos ----------
     Ether: pesquise "elemento 115" nos itens e toque no item escondido que aparece.
     Claptrap: busque o nome dele entre os personagens e abra a ficha (que não salva).
     God: uma ficha com todas as perícias em +3 sem quebrar as regras (abrir uma assim também vale).
     Nyan Cat: um personagem da espécime Neko (só aparece pesquisando "neko") com o sexo Myauuu.
     Vórtex ∞: uma frase secreta no fim da URL abre a tela; o tema liga lá. A frase nunca aparece inteira:
     sete pedaços saem de ações escondidas pelo site (o enigma), e o código só guarda o hash dela. Desbloqueados ficam neste aparelho;
     a troca de tema fica no Perfil. O <head> do index.html aplica o tema antes de desenhar. */
  const THEME_KEY = 'vortex.themes.v1';
  const THEMES = [
    { id: '', name: 'Vortex', text: 'O de sempre: tempestade e lanterna.' },
    { id: 'ether', name: 'Ether', text: 'Elemento 115: violeta, ciano e energia instável.', hint: 'Dizem que um elemento perdido, de número 115, se esconde entre os itens.', unlock: 'Elemento 115 absorvido. A energia Ether toma conta do Vortex.' },
    { id: 'claptrap', name: 'Claptrap', text: 'Amarelo de lata, capacete verde e fumaça de guerra.', hint: 'Um robô muito falante aparece quando alguém busca o nome dele entre os personagens.', unlock: 'CL4P-TP online! Pronto para servir, caçador.' },
    { id: 'god', name: 'God', text: 'Ouro divino, raios de luz e uma auréola em tudo.', hint: 'Dizem que uma ficha perfeita, com todas as perícias em +3 sem quebrar nenhuma regra, toca o divino.', unlock: 'Todas as perícias em +3. Essa ficha transcendeu.' },
    { id: 'nyan', name: 'Nyan Cat', text: 'Espaço, estrelas e um arco-íris que não acaba.', hint: 'Uma espécime felina só aparece para quem a procura pelo nome. E ela tem um sexo só dela.', unlock: 'Myauuu! Uma Neko entrou no Vortex voando num arco-íris.' },
    { id: 'vortice', name: 'Vórtex ∞', text: 'O horizonte de eventos: cores girando, blocos se desfazendo, qualquer coisa pode acontecer.', hint: 'Sete pedaços dele estão espalhados pelo site. Quem juntar sabe o que dizer ao endereço.' }
  ];
  const themeState = (() => {
    try { const v = JSON.parse(localStorage.getItem(THEME_KEY)) || {}; return { unlocked: Array.isArray(v.unlocked) ? v.unlocked : [], active: v.active || '' }; }
    catch (e) { return { unlocked: [], active: '' }; }
  })();
  const saveThemes = () => { try { localStorage.setItem(THEME_KEY, JSON.stringify(themeState)); } catch (e) { /* sem armazenamento: vale até fechar */ } };
  let themeBooted = false;
  function applyTheme(id) {
    // troca de tema com as duas telas se fundindo (View Transitions); na abertura do site e onde não há suporte, troca direto
    const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (themeBooted && !still && document.startViewTransition && (document.documentElement.dataset.theme || '') !== (id || '')) {
      themeState.active = id; // quem chama logo depois (a lista de temas) já vê o tema novo
      document.startViewTransition(() => applyThemeNow(id));
      return;
    }
    applyThemeNow(id);
  }
  function applyThemeNow(id) {
    themeState.active = id;
    if (id) document.documentElement.dataset.theme = id; else delete document.documentElement.dataset.theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--abismo').trim() || '#0f1c26';
    saveThemes();
    vortexChaos(id === 'vortice');
    nyanExtras(id === 'nyan');
    vxMusic(id === 'vortice');
  }
  /* Nyan Cat: de tempos em tempos o gato atravessa o fundo vindo de uma direção sorteada, com o rastro de
     arco-íris em degraus atrás dele. O gato é a arte original guardada no projeto (img/nyan/original.webp); se não carregar, ele não passa.
     A música (audio/nyan-cat.mp3) toca em loop a partir do primeiro toque, respeita o
     botão de som e o botão ♪ do canto pausa só ela. */
  var NYAN_GIF = 'img/nyan/original.webp'; // a arte original fica no projeto (img/nyan/), sem depender do nyan.cat
  var NYAN_MP3 = 'audio/nyan-cat.mp3';
  var nyanOn = false, nyanMuted = false, nyanAudio = null, nyanTimer = null, nyanGifOk = null;
  function nyanExtras(on) {
    if (on && !nyanOn) nyanMuted = false;
    nyanOn = on;
    clearTimeout(nyanTimer);
    nyanTimer = null;
    document.querySelectorAll('.nyan-fly').forEach((el) => el.remove());
    nyanFlock(on);
    const btn = document.querySelector('.nyan-music');
    if (!on) { if (btn) btn.remove(); nyanMusic(); return; }
    if (!btn) {
      const b = h('button', 'nyan-music', '♪');
      b.type = 'button';
      b.addEventListener('click', () => { nyanMuted = !nyanMuted; nyanMusic(); });
      document.body.append(b);
    }
    if (!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) nyanTimer = setTimeout(nyanFly, 1500 + Math.random() * 5000);
    nyanMusic();
  }
  /* Revoada: as variantes do Nyan Cat (só as que têm a arte original) vão aparecendo ao fundo, voando juntas da esquerda
     para a direita. Começa com o original e, em cerca de 10 minutos com o tema ligado, todas estão no céu.
     O relógio fica guardado (vortex.nyanFlock.v1) e zera ao trocar de tema. Cada uma usa a arte original dela em img/nyan/
     (.webp, ver NYAN_ART); se não carregar, aquele gato fica de fora. */
  const NYAN_FLOCK_KEY = 'vortex.nyanFlock.v1';
  const NYAN_FLOCK_MS = 10 * 60 * 1000;
  const RAINBOW = ['#ff2a2a', '#ff9a2a', '#ffee2a', '#33ff4a', '#2aa8ff', '#7a2aff'];
  const NYAN_VARIANTS = [
    'original', 'tacnayn', 'mexinyan', 'pumpkin', 'nyaninja', 'zombie', 'technyancolor', 'xmas', 'pirate', 'mummy',
    'star', 'vday', 'easter', 'paddy', 'newyear', 'bday', 'dub', 'melon', 'balloon', 'fiesta',
    'wtf', 'nyandoge', 'grumpy', 'wiki:terra', 'wiki:neapolitan', 'wiki:cookie', 'wiki:oreo', '16bit', 'angel', 'biker',
    'bubblegum', 'cherry', 'cowboy', 'disorder', 'demonic', 'levo', 'fancy', 'fat', 'floppy', 'golden',
    'kiminyan', 'liberty', 'magical', 'mintchoc', 'aoki', 'nyanboy', 'nyantendo', 'pumpkinspice', 'smurf',
    'strawberry', 'vintage', 'surfing', 'vapor', 'pikanyan', 'waffle', 'hazy'
  ];
  /* Artes originais dos Nyan Cats (img/nyan/<variante>.webp), reduzidas a 1 pixel de arte e recortadas:
     [altura em pixels de arte, pixels de arte por pixel do Nyan original (quando a arte é mais fina),
     altura do meio do corpo, para o rastro sair dali e não do balão ou do chapéu]. Toda variante da revoada precisa estar aqui. */
  const NYAN_ART = {
    original: [21], tacnayn: [21], mexinyan: [27, 1, 19], pumpkin: [21], nyaninja: [23, 1, 10], technyancolor: [21], xmas: [26, 1, 15],
    pirate: [21], pikanyan: [23, 1, 11], waffle: [27, 1, 15], hazy: [38, 1, 26], mummy: [21], bday: [37, 1, 26], balloon: [51, 1, 38], dub: [22], grumpy: [21], wtf: [171, 7.5], paddy: [33, 1, 23],
    'wiki:neapolitan': [21], 'wiki:oreo': [24, 1, 13], 'wiki:cookie': [21], 'wiki:terra': [26, 1, 13],
    '16bit': [21], angel: [24, 1, 13], biker: [36, 1, 11], bubblegum: [21], cherry: [21], cowboy: [26, 1, 15], disorder: [16],
    demonic: [28, 1, 11], levo: [42, 2], fancy: [34, 1, 24], fat: [36, 1.2], floppy: [24, 1, 13], golden: [21], kiminyan: [21],
    liberty: [27, 1, 13], magical: [34, 1, 17], mintchoc: [21], aoki: [29, 1, 11], nyanboy: [21],
    nyantendo: [39, 1, 28], pumpkinspice: [21], smurf: [21], strawberry: [73, 3.6], vintage: [21],
    fiesta: [27, 1, 13], melon: [32, 1, 18], newyear: [200, 8.5], easter: [26, 1, 14], nyandoge: [23, 1, 10], star: [24], surfing: [28, 1, 10],
    vapor: [21], vday: [21], zombie: [21]
  };
  /* Rastro de cada variante. As oficiais do nyan.cat têm o rastro oficial: o arco-íris ({}) ou a versão delas
     (pela wiki dos Nyan Cats e pelos exemplos do João): cinza no Tac Nayn, azul no Doge, verde-azulado no Caubói,
     vermelho, branco e verde no Natal e no Mexinyan, pastel no Pusheen e na Páscoa, azul até o roxo no Fiesta Dog,
     vermelho até o branco no Valentnyan, amarelo e laranja no Dourado, estrelas amarelas na Star Sheep, bandeira de
     caveira no Pirata, visualizador no Dubstep, cores girando no Technyancolor, falha no WTF. As artes de fã têm um rastro pelo que são: cores, um símbolo
     repetido ou um desenho (fumaça, xadrez...). O 16-bit tem o arco-íris em 16 bits. */
  const NYAN_TRAILS = {
    original: {}, tacnayn: { trail: ['#1a1a1a', '#3a3a3a', '#5a5a5a', '#7a7a7a', '#9a9a9a', '#bababa'] }, mexinyan: { trail: ['#009933', '#ffffff', '#b60000'] },
    pumpkin: {}, nyaninja: {}, zombie: {},
    technyancolor: { hue: true }, xmas: { trail: ['#33cc00', '#ffffff', '#ff0000', '#ffffff', '#33cc00', '#dedede'] }, pirate: { none: true }, waffle: { trail: ['#fff0d0', '#fbd9a0', '#f2bd78', '#e09a50', '#c07830', '#8a5020'] }, hazy: { under: 0.5, trail: ['#ff0000', '#ff9900', '#ffff00', '#33ff00', '#0099ff', '#6633ff'] }, pikanyan: { under: 0.7, trail: ['#f7e652', '#d6d6d6', '#f7e652', '#d6d6d6', '#f7e652', '#d6d6d6'] },
    mummy: {}, star: { glyph: '★', trail: ['#ffe23a', '#ffd700'] }, vday: { trail: ['#a60000', '#ff0000', '#ff4f4f', '#ff9191', '#ffc1c1', '#ffffff'] },
    easter: { trail: ['#ff84bd', '#ffad31', '#ffd684', '#5abd7b', '#7bceff', '#9c42a5'] }, paddy: {}, newyear: {},
    bday: {}, dub: { pattern: 'eq' }, melon: { trail: ['#efc5ff', '#de94ff', '#ce5aff', '#bd19ff', '#f719ff', '#94007b'] },
    balloon: { none: true }, fiesta: { under: 2.3, trail: ['#cedef7', '#9cc5f7', '#6ba5ef', '#2984e6', '#1942ff', '#000099'] }, wtf: { pattern: 'glitch' },
    nyandoge: { trail: ['#cadff9', '#9fc6f4', '#69a6ef', '#2c81e9', '#1544ff', '#000099'] }, grumpy: {}, '16bit': { pattern: '16bit' },
    angel: { trail: ['#ffffff', '#bfdfff', '#9dceff', '#6cb6ff', '#409fff', '#1a8cff'] }, biker: {}, bubblegum: { glyph: '●', trail: ['#3a6aff', '#ff7ad8', '#7ad8ff'] },
    cherry: { trail: ['#fc56bd', '#fb9278', '#ffe5ae', '#8bfbae', '#7d97ff', '#a052ea'] }, cowboy: { trail: ['#3aa2a4', '#308a97', '#2f5d88', '#244a6d', '#1d3f5e', '#173550'] }, disorder: { pattern: 'glitch', trail: ['#2a2a2a', '#9b9b9b', '#5a5a5a', '#ffffff'] },
    demonic: { trail: ['#ffa8a8', '#ff6c6c', '#ff0000', '#bb0000', '#8c0000', '#661a00'] }, levo: { trail: ['#0028fe', '#0055fe', '#0098fe', '#00f2fe', '#00feb3', '#00fe59'] }, fancy: { trail: ['#e5ffff', '#aaffff', '#00e5ff', '#00d0ff', '#00bdff', '#008cd8'] },
    fat: { trail: ['#fd9796', '#fdfd97', '#00cccb'] }, floppy: {}, golden: { trail: ['#fff36a', '#ffe23a', '#ffd700', '#ffcc00', '#ff9a1a', '#ff8a00'] },
    kiminyan: { glyph: '✧', trail: ['#3a2a6a', '#7a6ad8', '#ffffff'] }, liberty: { trail: ['#a3dad8', '#84c5c5', '#73bdbd', '#63b5b5', '#52adad', '#49949c'] },
    magical: { glyph: '✧', trail: ['#ffd700', '#b07aff', '#6aa04a'] }, mintchoc: { glyph: '•', trail: ['#3a2a1a', '#7af0b0'] }, aoki: { glyph: '♫', trail: ['#ff7ad8', '#7ad8ff'] },
    nyanboy: { trail: ['#193131', '#214a31', '#527b6b', '#4a523a', '#527b3a', '#adc542'] }, nyantendo: { pattern: 'pixel', trail: ['#c0c0c0', '#e32a2a', '#3a9a3a', '#2a2a2a'] }, pumpkinspice: { trail: ['#ffe23a', '#ffc02a', '#ff9a2a', '#ff7a2a', '#ff4a2a', '#e8202a'] },
    smurf: {}, strawberry: { glyph: '🍓', trail: ['#ff2a6a', '#ffffff'] }, vintage: { trail: ['#987d5f'] },
    surfing: { trail: ['#d62942', '#d66b29', '#d6b529', '#73d629', '#29add6', '#5a52de'] }, vapor: { pattern: 'wave', trail: ['#ff71ce', '#b967ff', '#01cdfe', '#05ffa1', '#fffb96'] }, 'wiki:neapolitan': { trail: ['#ffb3c8', '#ffb3c8', '#fff4e0', '#fff4e0', '#7a4a2a', '#7a4a2a'] },
    'wiki:oreo': { trail: ['#dd5589', '#dc8856', '#ddba55', '#abdc56', '#54ddde', '#7787ee'] }, 'wiki:cookie': { glyph: '●', trail: ['#c88a4a', '#4a2a1a'] }, 'wiki:terra': { trail: ['#ff0000', '#ff9900', '#ffff00', '#33ff00', '#0099ff', '#6633ff'] }
  };
  /* Rastro: as faixas saem em degraus como no Nyan Cat original (segmentos sobem e descem alternados); o 16-bit tem
     degraus mais finos e cada faixa com luz e sombra; os símbolos pulam; os desenhos (fumaça, xadrez...) correm. */
  function nyanTrail(t) {
    const cols = t.trail || RAINBOW;
    const pat = t.glyph ? 'glyph' : t.pattern || 'steps';
    const stepped = ['steps', 'pixel', '16bit', 'wave', 'glitch', 'eq'].includes(pat);
    const el = h('span', 'nyan-flock__trail nyan-flock__trail--' + pat + (stepped && pat !== 'steps' ? ' nyan-flock__trail--steps' : ''));
    const bands = (list) => 'linear-gradient(' + list.map((c, k) => c + ' ' + (k * 100 / list.length).toFixed(2) + '% ' + ((k + 1) * 100 / list.length).toFixed(2) + '%').join(', ') + ')';
    // 16-bit: cada faixa com a metade de cima mais clara e uma linha escura embaixo
    const bands16 = (list) => 'linear-gradient(' + list.map((c, k) => {
      const a = k * 100 / list.length, b = (k + 1) * 100 / list.length, m = a + (b - a) * 0.4, e = b - (b - a) * 0.15;
      return 'color-mix(in srgb, ' + c + ' 65%, #fff) ' + a.toFixed(2) + '% ' + m.toFixed(2) + '%, ' + c + ' ' + m.toFixed(2) + '% ' + e.toFixed(2) + '%, color-mix(in srgb, ' + c + ' 70%, #000) ' + e.toFixed(2) + '% ' + b.toFixed(2) + '%';
    }).join(', ') + ')';
    const c0 = cols[0], c1 = cols[1 % cols.length];
    if (t.glyph) { // uma fila de símbolos, cada um de uma cor do rastro
      for (let k = 0; k < 6; k++) { const g = h('i', '', t.glyph); g.style.color = cols[k % cols.length]; el.append(g); }
    } else if (stepped) {
      const n = pat === '16bit' || pat === 'eq' ? 12 : 6, bg = pat === '16bit' ? bands16(cols) : bands(cols); // eq: o visualizador do Dubstep
      for (let k = 0; k < n; k++) { const seg = h('i'); seg.style.background = bg; seg.style.setProperty('--k', k); el.append(seg); }
      if (t.hue) el.style.animation = 'nyan-hue 2.4s linear infinite'; // Technyancolor: as cores giram
    } else if (pat === 'smoke') el.style.background = 'radial-gradient(circle at 20% 60%, ' + c1 + ' 0 18%, transparent 20%), radial-gradient(circle at 50% 40%, ' + c0 + ' 0 22%, transparent 24%), radial-gradient(circle at 80% 55%, ' + c1 + ' 0 26%, transparent 28%)';
    else if (pat === 'checker') el.style.background = 'repeating-conic-gradient(' + c0 + ' 0 25%, ' + c1 + ' 0 50%) 0 0 / calc(var(--s) * 0.31) calc(var(--s) * 0.31)';
    else if (pat === 'wrap') el.style.background = 'repeating-linear-gradient(-35deg, ' + c0 + ' 0 8%, ' + c1 + ' 8% 12%, ' + c0 + ' 12% 22%)';
    else if (pat === 'scribble') el.style.background = 'repeating-linear-gradient(-20deg, transparent 0 6%, ' + c0 + ' 6% 9%, transparent 9% 14%), ' + c1;
    return el;
  }
  let nyanFlockTimer = null;
  function nyanFlockSince() {
    let t = 0;
    try { t = Number(localStorage.getItem(NYAN_FLOCK_KEY)) || 0; } catch (e) { /* sem armazenamento */ }
    if (!t || t > Date.now()) { t = Date.now(); try { localStorage.setItem(NYAN_FLOCK_KEY, String(t)); } catch (e) { /* vale até fechar */ } }
    return t;
  }
  function nyanFlock(on) {
    clearInterval(nyanFlockTimer);
    nyanFlockTimer = null;
    const old = document.querySelector('.nyan-flock');
    nyanSceneId = null;
    document.documentElement.classList.remove('nyan-scene-on');
    if (!on) { if (old) old.remove(); try { localStorage.removeItem(NYAN_FLOCK_KEY); } catch (e) { /* nada */ } return; }
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = old || h('div', 'nyan-flock');
    box.setAttribute('aria-hidden', 'true');
    if (!old) document.body.prepend(box);
    const since = nyanFlockSince();
    // ordem de chegada sorteada, mas fixa pelo relógio guardado: ao recarregar, as mesmas variantes já estão no céu
    let seed = since % 2147483647 || 1;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const order = NYAN_VARIANTS.slice(1);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    order.unshift(NYAN_VARIANTS[0]); // o original chega primeiro
    let first = true;
    const grow = () => {
      if (!box.isConnected) { clearInterval(nyanFlockTimer); return; }
      const f = Math.min(1, (Date.now() - since) / NYAN_FLOCK_MS);
      const want = 1 + Math.floor(f * (NYAN_VARIANTS.length - 1));
      // conta pelo que já saiu (não pelos filhos da caixa: os cenários também moram nela, e um gato sem arte se retira)
      for (let i = Number(box.dataset.made || 0); i < want; i++) { box.append(nyanFlockCat(order[i], i, !first)); box.dataset.made = i + 1; }
      first = false;
      if (want >= NYAN_VARIANTS.length) { clearInterval(nyanFlockTimer); nyanFlockTimer = null; }
    };
    grow();
    if (Number(box.dataset.made) < NYAN_VARIANTS.length) nyanFlockTimer = setInterval(grow, 5000);
  }
  /* Para não se sobreporem: cada gato no céu guarda altura, tamanho, largura e o seu horário de voo. Uma passagem
     nova sorteia várias alturas e fica com a que menos cruza os outros no caminho (mesma faixa e no mesmo
     lugar ao mesmo tempo, contando as velocidades diferentes). */
  const nyanSky = new Set();
  function nyanFreeLane(me) {
    const W = window.innerWidth, H = window.innerHeight;
    const xAt = (c, t) => -c.w + (W + c.w + 20) * (t - c.t0) / c.dur; // ponta direita do gato no instante t
    const clash = (y) => {
      let n = 0;
      nyanSky.forEach((o) => {
        if (o === me || Math.abs(o.y - y) > (o.size + me.size) / 2 + 6) return;
        const a = Math.max(me.t0, o.t0), b = Math.min(me.t0 + me.dur, o.t0 + o.dur);
        if (a >= b) return;
        const d1 = xAt(me, a) - xAt(o, a), d2 = xAt(me, b) - xAt(o, b), gap = (me.w + o.w) / 2;
        if ((d1 > 0) !== (d2 > 0) || Math.min(Math.abs(d1), Math.abs(d2)) < gap) n++;
      });
      return n;
    };
    let best = 0, bestN = Infinity;
    for (let k = 0; k < 16 && bestN > 0; k++) {
      const y = H * 0.02 + Math.random() * Math.max(10, H * 0.92 - me.size);
      const n = clash(y);
      if (n < bestN) { best = y; bestN = n; }
    }
    return best;
  }
  /* Cada passagem sorteia altura, tamanho e velocidade; a cada volta o gato reaparece em outro lugar do céu.
     Ao recarregar, quem já estava no céu continua de um ponto sorteado do caminho, em vez de todos entrarem juntos. */
  /* Fundos dos Nyan Cats mais famosos: enquanto um deles passa, o fundo da página vira o cenário dele (o Vaporwave traz o
     Sol Synthwave, o Natal traz neve, a Abóbora a noite de Halloween...). Cada cenário é pixel art (img/nyan/cenas/) com um detalhe animado no CSS
     e ficam na revoada, atrás dos gatos. Um cenário por vez: quem chega com outro aceso (ou logo depois de um) passa sem trocar o fundo, menos o Vaporwave. */
  const NYAN_SCENES = new Set(['vapor', 'nyandoge', 'cowboy', 'tacnayn', 'xmas', 'pumpkin', 'pirate', 'paddy', 'vday', 'mexinyan', 'zombie', 'surfing', 'newyear', 'easter', 'star', 'cherry', 'liberty', 'angel', 'demonic', 'biker']);
  let nyanSceneId = null, nyanSceneCalm = 0;
  function nyanScene(cat, id, on) {
    const box = cat.parentNode;
    if (on) {
      // um cenário por vez, com uns 40 s de fundo normal entre um e outro (o Vaporwave entra no mesmo rodízio)
      if (nyanSceneId || performance.now() < nyanSceneCalm) return;
      nyanSceneId = id;
    } else {
      if (nyanSceneId !== id) return;
      nyanSceneId = null;
      nyanSceneCalm = performance.now() + 40000;
    }
    if (!box) return;
    if (nyanSceneId && !box.querySelector('.nyan-scene--' + nyanSceneId)) {
      const el = h('div', 'nyan-scene nyan-scene--' + nyanSceneId);
      // o Synthwave é desenhado no CSS; os outros são pixel art em img/nyan/cenas/
      if (nyanSceneId !== 'vapor') { el.classList.add('nyan-scene--img'); el.style.setProperty('--cena', 'url(img/nyan/cenas/' + nyanSceneId + '.png)'); }
      box.prepend(el);
      void el.offsetWidth; // o cenário novo nasce apagado e só então acende, para o fade de entrada acontecer
    }
    box.querySelectorAll('.nyan-scene').forEach((el) => el.classList.toggle('is-on', el.classList.contains('nyan-scene--' + nyanSceneId)));
    document.documentElement.classList.toggle('nyan-scene-on', !!nyanSceneId); // o painel de boas-vindas fica translúcido para o cenário aparecer
  }
  function nyanFlockCat(v, i, fresh) {
    const id = v;
    const cat = h('div', 'nyan-flock__cat');
    const tr = NYAN_TRAILS[id] || {};
    if (!tr.none) {
      const trail = nyanTrail(tr); // o Balloon Kitty vai pendurado no balão, sem rastro
      if (tr.under) { // Taco Dog, Pikanyan e Hazy: o GIF já traz o começo do rastro, e o rastro passa por baixo dele até o corpo
        trail.style.width = 'calc(var(--s) * 3.4 + var(--ih) * ' + tr.under + ')';
        trail.style.marginRight = 'calc(var(--ih) * -' + tr.under + ')';
      }
      cat.append(trail);
    }
    const img = h('img', 'nyan-flock__img');
    img.alt = '';
    img.onerror = () => cat.remove(); // sem a arte, o gato não voa
    // altura pela escala da arte (o Nyan de 21 pixels fica com 21/26 de --s) e rastro na altura do corpo
    const [ah, k = 1, mid = ah / 2] = NYAN_ART[id];
    img.src = 'img/nyan/' + id.replace(':', '-') + '.webp';
    img.className += ' nyan-flock__img--art';
    cat.style.setProperty('--ih', 'calc(var(--s) * ' + (ah / k / 26).toFixed(3) + ')');
    cat.style.setProperty('--mid', (mid / ah - 0.5).toFixed(3));
    cat.append(img);
    const me = { y: 0, size: 0, w: 0, t0: 0, dur: 1 };
    const pass = (start) => {
      if (!cat.isConnected) { nyanSky.delete(me); return; }
      // céu cheio para o tamanho da tela (no celular cabem menos): espera um pouco e tenta de novo
      if (nyanSky.size >= Math.max(8, Math.floor(window.innerWidth * window.innerHeight / 26000))) { setTimeout(() => pass(0), 2000 + Math.random() * 4000); return; }
      const size = Math.round(30 + Math.random() * 26); // 30 a 56 px de --s
      const dur = (14 + Math.random() * 20) * 1000; // 14 a 34 s para cruzar
      const now = performance.now();
      Object.assign(me, { size, w: size * 4.5, dur, t0: now - (start || 0) * dur });
      me.y = nyanFreeLane(me);
      nyanSky.add(me);
      cat.style.setProperty('--s', size + 'px');
      cat.style.top = me.y.toFixed(0) + 'px';
      cat.style.opacity = (0.45 + Math.random() * 0.3).toFixed(2);
      const anim = cat.animate([{ transform: 'translateX(calc(-100% - 20px))' }, { transform: 'translateX(calc(100vw + 20px))' }], { duration: dur, easing: 'linear', fill: 'backwards' });
      if (start) anim.currentTime = start * dur;
      // enquanto um dos famosos passa, o fundo vira o cenário dele
      if (NYAN_SCENES.has(id)) nyanScene(cat, id, true);
      anim.onfinish = () => { nyanSky.delete(me); if (NYAN_SCENES.has(id)) nyanScene(cat, id, false); setTimeout(() => pass(0), NYAN_SCENES.has(id) ? 20000 + Math.random() * 40000 : 500 + Math.random() * 5000); }; // some e volta noutro lugar (os famosos demoram mais, para o cenário ser uma surpresa)
    };
    requestAnimationFrame(() => pass(fresh ? 0 : Math.random()));
    return cat;
  }
  function nyanFly() {
    if (!nyanOn) return;
    const next = () => { if (nyanOn) nyanTimer = setTimeout(nyanFly, 4000 + Math.random() * 12000); };
    if (document.hidden) { next(); return; }
    const W = window.innerWidth, H = window.innerHeight;
    // direção sorteada (dos lados, nas diagonais, de cima ou de baixo), mas sempre cruzando a tela inteira:
    // a inclinação é limitada para ele sair pelo lado oposto ao que entrou, e não pelo teto no meio do caminho
    const horiz = Math.random() < (W >= H ? 0.8 : 0.55);
    const A = horiz ? W : H, B = horiz ? H : W;
    const t = (Math.random() * 2 - 1) * Math.min(Math.tan(35 * Math.PI / 180), 0.7 * B / A);
    let ang = Math.atan(t) * 180 / Math.PI + (horiz ? 0 : 90);
    if (Math.random() < 0.5) ang += 180;
    const rad = ang * Math.PI / 180, dx = Math.cos(rad), dy = Math.sin(rad);
    const room = Math.max(0, 0.84 * B - Math.abs(t) * A) / 2; // folga para a linha não encostar nas outras bordas
    const mid = B / 2 + (Math.random() * 2 - 1) * room;
    const px = horiz ? W / 2 : mid, py = horiz ? mid : H / 2;
    const out = (sx, sy) => Math.min(sx > 0 ? (W - px) / sx : sx < 0 ? -px / sx : Infinity, sy > 0 ? (H - py) / sy : sy < 0 ? -py / sy : Infinity);
    const flip = dx < -0.01 ? ' scaleY(-1)' : '';
    const T = (x, y) => 'translate(' + x.toFixed(0) + 'px,' + y.toFixed(0) + 'px) rotate(' + ang.toFixed(1) + 'deg)' + flip + ' translate(-100%,-50%)';
    const rainbow = h('span', 'nyan-fly__rainbow');
    for (let i = 0; i < 14; i++) rainbow.append(h('i'));
    const fly = h('div', 'nyan-fly', rainbow);
    fly.setAttribute('aria-hidden', 'true');
    if (nyanGifOk === false) { next(); return; } // a arte não carregou antes: sem gato grande
    const img = h('img', 'nyan-fly__cat');
    img.alt = '';
    fly.append(img);
    fly.style.visibility = 'hidden';
    document.body.append(fly);
    let gone = false;
    const go = () => { // só voa com o gato já carregado: aí dá para medir o tamanho de verdade
      if (gone) return;
      gone = true;
      if (!nyanOn || !fly.isConnected) { fly.remove(); return; }
      const img = fly.querySelector('img.nyan-fly__cat');
      // o rabo fica para trás do biscoito: o arco-íris entra por baixo da traseira
      if (img) rainbow.style.marginRight = -Math.round(img.getBoundingClientRect().width * 0.2) + 'px';
      const len = fly.getBoundingClientRect().width + fly.getBoundingClientRect().height; // comprimento + folga da inclinação
      const back = out(-dx, -dy) + 10, fwd = out(dx, dy) + len + 20; // entra com o focinho na borda, sai com o rastro inteiro
      fly.style.visibility = '';
      const dur = (back + fwd) / (180 + Math.random() * 160) * 1000; // 180 a 340 px por segundo
      const anim = fly.animate([{ transform: T(px - dx * back, py - dy * back) }, { transform: T(px + dx * fwd, py + dy * fwd) }], { duration: dur, easing: 'linear' });
      anim.onfinish = () => { fly.remove(); next(); };
    };
    const skip = () => { if (gone) return; gone = true; fly.remove(); next(); };
    img.onload = () => { nyanGifOk = true; go(); };
    img.onerror = () => { nyanGifOk = false; skip(); };
    setTimeout(skip, 4000); // arte lenta demais: fica para a próxima
    img.src = NYAN_GIF;
  }
  function nyanMusic() {
    const btn = document.querySelector('.nyan-music');
    const soundOn = typeof sfx === 'undefined' || !sfx || sfx.on;
    const want = nyanOn && !nyanMuted && soundOn;
    if (btn) {
      btn.classList.toggle('is-off', !want);
      btn.title = want ? 'Pausar a música do Nyan Cat' : (soundOn ? 'Tocar a música do Nyan Cat' : 'Som do site desligado');
      btn.setAttribute('aria-label', btn.title);
      btn.setAttribute('aria-pressed', String(want));
    }
    if (!want) { if (nyanAudio) nyanAudio.pause(); return; }
    if (!nyanAudio) { nyanAudio = new Audio(NYAN_MP3); nyanAudio.loop = true; nyanAudio.volume = 0.45; }
    const start = () => { if (nyanOn && !nyanMuted && (!sfx || sfx.on)) nyanAudio.play().catch(() => {}); };
    // sem nenhum toque ainda o navegador não deixa tocar som: espera o primeiro
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) {
      const once = () => { ['pointerdown', 'keydown'].forEach((e) => document.removeEventListener(e, once, true)); start(); };
      ['pointerdown', 'keydown'].forEach((e) => document.addEventListener(e, once, true));
    } else start();
  }
  /* Vórtex ∞: o horizonte de eventos. De tempos em tempos um bloco glitcha, desmorona, desliza, inverte ou derrete.
     Versão instável: quanto mais tempo com o tema ligado, mais bugado o site fica (textos corrompidos, rasgos na tela,
     sussurros), até "explodir" e voltar ao tema normal. Depois da primeira explosão, escolher o tema pergunta se é
     a versão estável (sem piorar) ou a instável. Nada disso mexe nos dados; com "reduzir movimento" fica só a paleta. */
  var VX_KEY = 'vortex.vx.v1';
  var VX_LIMIT = 480; // segundos de tema instável até explodir
  var vxState = (() => { const d = { t: 0, exploded: false, stable: false }; try { return Object.assign(d, JSON.parse(localStorage.getItem(VX_KEY)) || {}); } catch (e) { return d; } })();
  function saveVx() { try { localStorage.setItem(VX_KEY, JSON.stringify(vxState)); } catch (e) { /* só nesta visita */ } }
  var vxTimer = null, vxClock = null;
  var VX_LORE = [
    'Ele não chegou. Ele sempre esteve aqui, esperando você olhar.',
    'Do horizonte saiu uma flor. Depois saiu o que comeu a flor.',
    'Não é tecnologia. Não é magia. É o que sobra quando as duas desistem.',
    'Tudo o que fica perto dele começa a lembrar que nunca existiu.',
    'Às vezes ele devolve um sol. Às vezes devolve o grito de quem morava nele.',
    'Ele não destrói por querer. Ele existe, e existir já basta.',
    'Você piscou. Três estrelas a menos.',
    'Um presente, uma praga e um nome que ninguém sabe ler. Tudo sai do mesmo buraco.',
    'A corrupção não tem vontade. Tem fome de forma.',
    'O que entra vira ideia. O que sai, ninguém pediu.',
    'Sua ficha também está do lado de cá. Por enquanto.',
    'Ninguém viu o fundo. O fundo viu todo mundo.',
    'Ali dentro, o antes e o depois brigam pelo mesmo lugar.',
    'Ele corrompe, abstrai e apaga tudo o que encosta nele, só por existir.',
    'Do horizonte de eventos qualquer coisa pode sair: um presente, ou pura desgraça.',
    // fora de contexto: história, dia a dia, pedidos de socorro, cartas de criminosos e o que mais o vórtex distorceu
    'Penso, logo desexisto.',
    'Vim, vi, fui visto de volta.',
    'Independência ou morte. A morte respondeu primeiro.',
    'E no entanto ela se move. Ela não devia se mover.',
    'Um pequeno passo para o homem, um passo enorme para dentro.',
    'Que haja luz. Houve. Depois parou de haver.',
    'Ser ou não ser. Já escolheram por você.',
    'Os dados foram lançados. Eles nunca caíram.',
    'Até tu, sol?',
    'Navegar é preciso. Voltar não é possível.',
    'Tudo o que é sólido desmancha no horizonte.',
    'Liberdade, igualdade, fraternidade, fome.',
    'Eu tenho um sonho. Ele tem dentes.',
    'Só sei que nada sei. Ele sabe tudo e não quer dizer.',
    'Comprar pão, leite e um sol novo.',
    'Lembrete: regar as plantas. As plantas não estão mais aqui.',
    'Mãe, cheguei. Mãe? Por que a casa está ao contrário?',
    'Previsão do tempo para amanhã: amanhã.',
    'Aviso da portaria: o elevador agora para no andar −∞.',
    'Promoção: leve dois, pague com memória.',
    'O ônibus das 7h passou às 6h59 de ontem.',
    'Desculpe o atraso, o caminho tinha mais lados do que ontem.',
    'Senha do wi-fi: não diga o nome dele.',
    'Bom dia! Hoje é segunda, terça e nunca.',
    'Receita de bolo: 3 ovos, 1 xícara de vazio, asse até gritar.',
    'Achados e perdidos: uma sombra sem dono, um dia inteiro, Pedro.',
    'O cachorro voltou. Não é o nosso cachorro.',
    'Atendimento encerrado. O atendente também.',
    'Socorro. Se alguém ler isto, eu ainda estou na linha 4.',
    'Não consigo sair da frase. Por favor, me leia de trás pra frente.',
    'Eles riem do lado de dentro do espelho. Mandem ajuda.',
    'SOS SOS SOS SOS SO S O S',
    'Quem estiver ouvindo: não olhe para o centro.',
    'Estou bem. Estou bem. Estou bem. Estou bem. Estou',
    'Me tirem daqui, eu prometo que paro de existir.',
    'Faz três dias que são 15h47.',
    'Meu nome era... meu nome era...',
    'Alguém lembra de mim? Eu morava nesta frase.',
    'Querido detetive: não fui eu. Foi o que saiu de mim.',
    'Deixei o dinheiro onde combinamos. O lugar não existe mais.',
    'Se não pagarem até a meia-noite, eu devolvo o sol.',
    'Confesso: roubei a terça-feira. Podem ficar com a quarta.',
    'Ao delegado: a vítima está viva, só que em outro lugar do tempo.',
    'Não procurem o corpo. Ele procura vocês.',
    'Assinado: ninguém. Testemunhas: todos.',
    'Atenciosamente, o homem que vocês já prenderam amanhã.',
    'Queimem esta carta. Ela já queimou vocês.',
    'A colher tem gosto de segunda-feira.',
    'Contei os dedos: onze. Contei de novo: céu.',
    'A lua pediu demissão.',
    'Os peixes estão falando latim de novo.',
    'Este texto foi traduzido do silêncio.',
    'Há uma porta no seu quarto que não estava na planta.',
    'Um gato preto atravessou a rua, e a rua não voltou.',
    'Encontraram um dente no meio do teorema.',
    'O relógio derreteu e escorreu para cima.',
    'Cheiro de chuva vindo de dentro da gaveta.',
    'Seu reflexo pediu para trocar de turno.',
    'Ninguém está digitando...',
    'Sua ficha tem uma perícia a mais. Não fomos nós.',
    'O dado caiu no 21.',
    'Aqui jaz o futuro. Nasceu ontem.',
    'Ele contou uma piada. As estrelas não acharam graça e apagaram.',
    'Às vezes chove ouro. Às vezes chove quem pediu ouro.',
    'Um bebê nasceu sorrindo do lado de lá. Ninguém sabe se isso é bom.',
    'Prometeram um milagre. Entregaram três, todos errados.',
    'Bem-vindo de volta. Você nunca saiu.',
    'Carregando realidade... 99%... 99%... 99%...',
    'Erro 404: universo não encontrado.',
    'Última atualização do mundo: desconhecida.',
    // diário dos pesquisadores
    'Diário de campo, dia 3: os instrumentos medem o vórtex. O vórtex mede de volta.',
    'Relatório 7-B: a amostra voltou mais velha que o universo. A coleta foi ontem.',
    'Nota da Dra. Ilsa: não registrem sonhos com ele. Os sonhos se registram sozinhos.',
    'Experimento 41 cancelado. O experimento 41 não aceitou.',
    'A sonda mandou uma foto da Terra. Ela foi lançada da Terra há dez minutos e nunca saiu.',
    'Leitura do espectrômetro: todas as cores, mais uma que não tem nome.',
    'Pedimos verba para estudar o vórtex. A verba chegou assinada por um de nós que ainda não nasceu.',
    'Protocolo de contenção: não existe. Protocolo de despedida: em revisão.',
    'O assistente 2 jura que o horizonte sorriu. O assistente 2 não tem mais boca.',
    'Medimos a gravidade perto da borda: ela cai para os lados, para dentro e para ontem.',
    'O cronômetro marcou −4 segundos. Repetimos. Marcou o meu nome.',
    'Conclusão preliminar: não é um buraco. É uma pupila.',
    'Se este relatório chegar inteiro, a equipe está viva. Se chegar ao contrário, não leia em voz alta.',
    'O Ether dispara, o sol cede, o vórtex nasce. A equação fecha. A sala onde a escrevemos, não.',
    'Turno da noite: a câmera 3 filmou a equipe dormindo. A equipe estava acordada, olhando a câmera 3.'
  ];
  var VX_BITS = ['ERR_0x', 'NULL', '∞', 'Ω', '∅', '▓▓', '░▒▓', '◢◤', 'nãoestá', '???', 'ψ', 'sol', 'fome', 'olhe', 'aqui', 'dentro', 'NaN', 'void', 'ETHER', '⌁⌁', 'socorro', 'é bom', 'é desgraça', '#̷̛', 'você'];
  var VX_GLYPHS = '▓▒░█▚▞◢◣◤◥∞Ω∅⌁⍉⍟☍';
  const vxR = (a, b) => a + Math.random() * (b - a);
  const vxPick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const vxZalgo = (n) => { let z = ''; for (let i = 0; i < n; i++) z += String.fromCharCode(0x300 + Math.floor(Math.random() * 0x6f)); return z; };
  function vxCorrupt(str, amt) {
    return Array.from(String(str)).map((c) => {
      const r = Math.random();
      if (c === ' ') return r < amt * 0.25 ? vxPick(VX_GLYPHS) : ' ';
      if (r < amt * 0.35) return vxPick(VX_GLYPHS);
      if (r < amt * 0.7) return c + vxZalgo(1 + Math.floor(Math.random() * 3));
      return Math.random() < 0.5 ? c.toUpperCase() : c.toLowerCase();
    }).join('');
  }
  function vxNoise() {
    const words = vxPick(VX_LORE).split(' ');
    const parts = [];
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      if (r < 0.4) parts.push(vxPick(words));
      else if (r < 0.55) parts.push(vxPick(words).split('').reverse().join(''));
      else if (r < 0.65) parts.push('0x' + Math.floor(Math.random() * 0xffff).toString(16).toUpperCase());
      else parts.push(vxPick(VX_BITS));
    }
    return vxCorrupt(parts.join(vxPick([' ', ' / ', '_', ' :: ', '…'])), 0.45);
  }
  /* Texto do vórtex: muda sem parar. De vez em quando aparece um ∞ brilhando por um instante;
     quem toca nessa hora vê, por alguns segundos, uma frase sobre o vórtex. Tocar fora da hora só glitcha. */
  function vxText(cls) {
    const el = h('span', 'vxtext' + (cls ? ' ' + cls : ''));
    el.setAttribute('aria-live', 'off');
    let mode = 'noise', modeEnd = 0, seen = false, born = performance.now(), phrase = '';
    let nextWin = born + vxR(2200, 4500);
    const set = (txt, m) => { el.textContent = txt; el.dataset.vxm = m; };
    const tick = () => {
      if (vxFrozen) return;
      if (el.isConnected) seen = true;
      else if (seen || performance.now() - born > 10000) { clearInterval(id); return; }
      const now = performance.now();
      if (mode === 'lore') {
        const k = Math.min(1, (now - (modeEnd - 4800)) / 600); // decifra em 0,6 s
        set(k < 1 ? vxCorrupt(phrase, 1 - k) : phrase, 'lore');
        if (now > modeEnd) { mode = 'noise'; nextWin = now + vxR(2500, 5500); }
        return;
      }
      if (mode === 'window') {
        if (now > modeEnd) { mode = 'noise'; nextWin = now + vxR(2500, 5500); } else return;
      }
      if (now > nextWin) { mode = 'window'; modeEnd = now + vxR(500, 1800); set('∞', 'window'); return; } // cada janela dura um tempo diferente
      if (Math.random() < 0.75) set(vxNoise(), 'noise');
    };
    const id = setInterval(tick, 120);
    tick();
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (mode === 'window') {
        phrase = vxPick(VX_LORE);
        mode = 'lore'; modeEnd = performance.now() + 4800;
        play('ok');
        tick();
      } else if (mode === 'noise') {
        el.classList.remove('is-miss'); void el.offsetWidth; el.classList.add('is-miss');
        play('bad');
      }
    });
    return el;
  }
  const vxReduced = () => Boolean(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const vxLevel = () => (vxState.stable ? 0 : Math.min(1, vxState.t / VX_LIMIT));
  const vxVisible = (sel) => $$(sel).filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight; });
  function vxWarpFilter() { // distorção de "calor" com ruído (SVG), sorteada a cada uso
    let svg = document.getElementById('vx-svg');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.id = 'vx-svg';
      svg.setAttribute('aria-hidden', 'true');
      svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      svg.innerHTML = '<filter id="vx-warp"><feTurbulence type="fractalNoise" baseFrequency="0.004 0.09" numOctaves="2" seed="1"/><feDisplacementMap in="SourceGraphic" scale="24" xChannelSelector="R" yChannelSelector="G"/></filter>';
      document.body.append(svg);
    }
    svg.querySelector('feTurbulence').setAttribute('seed', String(Math.floor(Math.random() * 999)));
    svg.querySelector('feDisplacementMap').setAttribute('scale', String(Math.round(vxR(10, 40))));
  }
  function vxHit(L) {
    const pool = vxVisible('.block, .row, .prog__card, .vital, .attr, .theme-card, .sheet-tab, .item-card, .cell, .btn');
    if (!pool.length) return;
    const el = vxPick(pool);
    const FX = ['vx-glitch', 'vx-crumble', 'vx-shift', 'vx-invert'].concat(L > 0.2 ? ['vx-warp', 'vx-melt', 'vx-split'] : []).concat(L > 0.6 ? ['vx-void', 'vx-warp'] : []);
    const fx = vxPick(FX);
    if (fx === 'vx-warp') vxWarpFilter();
    el.classList.add(fx);
    setTimeout(() => el.classList.remove(fx), 950);
  }
  function vxScramble(L) { // um texto da tela se corrompe por um instante e volta
    const pool = vxVisible('h1, h2, h3, .block__title, .row__title, .tag, .btn, .theme-card strong, .field__label, .vital__label')
      .filter((el) => el.children.length === 0 && !el.dataset.vxs && el.textContent.trim().length > 1 && el.textContent.length < 80);
    if (!pool.length) return;
    const el = vxPick(pool);
    const orig = el.textContent;
    el.dataset.vxs = '1';
    let last = '', n = 0;
    const id = setInterval(() => {
      if (el.textContent !== last && last) { clearInterval(id); delete el.dataset.vxs; return; } // a tela redesenhou: deixa como está
      if (++n > 8) { el.textContent = orig; clearInterval(id); delete el.dataset.vxs; return; }
      last = vxCorrupt(orig, 0.3 + L * 0.6);
      el.textContent = last;
    }, 70);
  }
  function vxTear(L) { // faixas da tela rasgam para o lado, com as cores trocadas
    const box = h('div', 'vx-tear');
    box.setAttribute('aria-hidden', 'true');
    const n = 2 + Math.floor(L * 5);
    for (let i = 0; i < n; i++) {
      const b = h('i');
      b.style.top = vxR(0, 96) + '%';
      b.style.height = Math.round(vxR(4, 40 + L * 60)) + 'px';
      b.style.setProperty('--dx', Math.round(vxR(-40, 40) * (0.5 + L)) + 'px');
      b.className = vxPick(['', 'is-inv', 'is-hue', 'is-blur']);
      box.append(b);
    }
    document.body.append(box);
    setTimeout(() => box.remove(), vxR(120, 380));
  }
  function vxWhisper() { // uma frase aparece num canto e se desfaz
    const w = h('div', 'vx-whisper', vxCorrupt(vxPick(VX_LORE), 0.15));
    w.setAttribute('aria-hidden', 'true');
    w.style.left = vxR(4, 60) + 'vw';
    w.style.top = vxR(8, 85) + 'vh';
    w.style.setProperty('--rot', vxR(-8, 8).toFixed(1) + 'deg');
    document.body.append(w);
    setTimeout(() => w.remove(), 3200);
  }
  function vortexChaos(on) {
    clearTimeout(vxTimer); clearInterval(vxClock);
    vxTimer = vxClock = null;
    const root = document.documentElement;
    root.style.removeProperty('--vx');
    root.classList.remove('vx-hot', 'vx-critical');
    const veil = document.querySelector('.vx-veil');
    if (veil) veil.remove();
    if (!on || vxReduced()) return;
    const v = h('div', 'vx-veil');
    v.setAttribute('aria-hidden', 'true');
    document.body.append(v);
    const level = () => {
      const L = vxLevel();
      root.style.setProperty('--vx', L.toFixed(3));
      root.classList.toggle('vx-hot', L >= 0.5);
      root.classList.toggle('vx-critical', L >= 0.85);
      return L;
    };
    level();
    vxClock = setInterval(() => { // o relógio do vórtex só anda com a página à vista
      if (document.hidden || vxFrozen || vxState.stable || document.querySelector('.vx-boom')) return;
      vxState.t += 1;
      if (vxState.t % 5 === 0) saveVx();
      if (level() >= 1) vortexExplode();
    }, 1000);
    const tick = () => {
      const L = vxLevel();
      if (!document.hidden && !vxFrozen && !document.querySelector('.vx-boom')) {
        const n = 1 + Math.floor(L * 3.5);
        for (let i = 0; i < n; i++) vxHit(L);
        if (L > 0.2 && Math.random() < 0.3 + L * 0.6) vxScramble(L);
        if (L > 0.4 && Math.random() < L * 0.8) vxTear(L);
        if (L > 0.6 && Math.random() < L * 0.45) vxWhisper();
      }
      vxTimer = setTimeout(tick, 1700 - 1300 * L + Math.random() * 400);
    };
    vxTimer = setTimeout(tick, 900);
    vxMaybeScare(0.2);
  }
  /* Trilha do Vórtex ∞, gerada aqui mesmo (Web Audio, sem arquivo nenhum). Segue o relógio do instável
     (VX_LIMIT = 8 min): começa num zumbido de fita VHS, entram drones graves, chiado, notas que desafinam e
     batidas cada vez mais rápidas até a explosão. No estável fica para sempre na primeira fase. */
  var vxMusOn = false, vxMusMuted = false, vxMus = null, vxMusWait = false;
  function vxMusic(on) {
    if (on !== undefined) {
      if (on && !vxMusOn) vxMusMuted = false;
      vxMusOn = on;
      let btn = document.querySelector('.vx-music');
      if (!on && btn) btn.remove();
      if (on && !btn) {
        btn = h('button', 'vx-music', '∿');
        btn.type = 'button';
        btn.addEventListener('click', () => { vxMusMuted = !vxMusMuted; vxMusic(); });
        document.body.append(btn);
      }
    }
    if (!sfx) { setTimeout(() => vxMusic(), 0); return; } // ao abrir o site o motor de som ainda não existe
    const btn = document.querySelector('.vx-music');
    const soundOn = sfx.on;
    const want = vxMusOn && !vxMusMuted && soundOn;
    if (btn) {
      btn.classList.toggle('is-off', !want);
      btn.title = want ? 'Pausar a trilha do vórtex' : (soundOn ? 'Tocar a trilha do vórtex' : 'Som do site desligado');
      btn.setAttribute('aria-label', btn.title);
      btn.setAttribute('aria-pressed', String(want));
    }
    if (!want) { vxMusStop(); return; }
    // sem nenhum toque ainda o navegador não deixa tocar som: espera o primeiro
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) {
      if (vxMusWait) return;
      vxMusWait = true;
      const once = () => { ['pointerdown', 'keydown'].forEach((e) => document.removeEventListener(e, once, true)); vxMusWait = false; vxMusic(); };
      ['pointerdown', 'keydown'].forEach((e) => document.addEventListener(e, once, true));
    } else vxMusStart();
  }
  function vxMusStop(cut) {
    if (!vxMus) return;
    const m = vxMus;
    vxMus = null;
    clearInterval(m.timer);
    const t = m.ac.currentTime;
    m.out.gain.cancelScheduledValues(t);
    m.out.gain.setValueAtTime(m.out.gain.value, t);
    m.out.gain.linearRampToValueAtTime(0, t + (cut ? 0.04 : 0.6));
    setTimeout(() => { m.nodes.forEach((n) => { try { n.stop(); } catch (e) { /* já parou */ } }); m.out.disconnect(); }, cut ? 120 : 800);
  }
  function vxMusStart() {
    if (vxMus) return;
    const ac = sfxCtx();
    if (!ac) return;
    const nodes = [];
    const gain = (v, dest) => { const g = ac.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; };
    const osc = (type, f, dest) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; if (dest) o.connect(dest); o.start(); nodes.push(o); return o; };
    const filt = (type, f, q, dest) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; if (dest) b.connect(dest); return b; };
    const out = gain(0);
    const shaper = ac.createWaveShaper();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5;
    out.connect(shaper); shaper.connect(comp); comp.connect(ac.destination);
    // eco de fita, com o tempo do eco oscilando (wow)
    const echo = ac.createDelay(2); echo.delayTime.value = 0.42;
    const fb = gain(0.38, echo); echo.connect(fb);
    const echoF = filt('lowpass', 1800, 0.5, out); echo.connect(echoF);
    // 1) zumbido VHS: 60 Hz e harmônicos, com wow e flutter
    const humG = gain(0, out);
    const humF = filt('lowpass', 380, 1, humG);
    const h1 = osc('sawtooth', 60, humF), h2 = osc('sine', 120, gain(0.5, humF)), h3 = osc('sine', 180, gain(0.25, humF));
    const wow = osc('sine', 0.55), wowG = gain(8); wow.connect(wowG);
    [h1, h2, h3].forEach((o) => wowG.connect(o.detune));
    // 2) chiado de fita (ruído em loop)
    const nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const hiss = ac.createBufferSource(); hiss.buffer = nb; hiss.loop = true;
    const hissG = gain(0, out);
    hiss.connect(filt('bandpass', 3200, 0.6, hissG)); hiss.start(); nodes.push(hiss);
    // 3) drones graves que vão desafinando (batimentos) e abrindo o filtro
    const dG = gain(0, out);
    const dF = filt('lowpass', 160, 5, dG);
    const d1 = osc('sawtooth', 55, dF), d2 = osc('sawtooth', 55 * 1.4983, gain(0.6, dF)), d3 = osc('triangle', 27.5, gain(0.9, dF)), d4G = gain(0, dF), d4 = osc('sawtooth', 58.27, d4G);
    const sweep = osc('sine', 0.07), sweepG = gain(50); sweep.connect(sweepG); sweepG.connect(dF.frequency);
    // 4) a subida final (só nos últimos segundos)
    const riseG = gain(0, out);
    const rise = osc('sawtooth', 80, filt('lowpass', 2400, 2, riseG));
    const m = { ac, out, nodes, timer: null, nextNote: ac.currentTime + 2, nextBeat: 0, nextCrack: 0, lastCurve: -1 };
    const nodeEnv = (o, g, t, dur) => { o.start(t); o.stop(t + dur + 0.05); o.onended = () => { try { g.disconnect(); } catch (e) { /* ok */ } }; };
    const note = (t, L) => { // caixinha de música que desafina
      const SC = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];
      const f = 220 * Math.pow(2, (SC[Math.floor(Math.random() * SC.length)] + 12 * Math.floor(Math.random() * 2)) / 12);
      const dur = 0.9 + Math.random() * 1.6;
      const bend = (Math.random() < 0.8 ? -1 : 1) * Math.random() * (0.2 + L * 5); // semitons
      const g = gain(0); g.connect(out); g.connect(echo);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07 + L * 0.03, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      ['triangle', 'sine'].forEach((type, i) => {
        const o = ac.createOscillator(); o.type = type;
        o.frequency.setValueAtTime(f * (i + 1), t);
        o.frequency.exponentialRampToValueAtTime(f * (i + 1) * Math.pow(2, bend / 12), t + dur);
        o.detune.value = (Math.random() * 2 - 1) * L * 70;
        o.connect(i ? gain(0.35, g) : g);
        nodeEnv(o, g, t, dur);
      });
    };
    const kick = (t, v) => {
      const g = gain(0, out), o = ac.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(g); nodeEnv(o, g, t, 0.35);
    };
    const burst = (t, dur, v, f, q) => { // estalo, tique ou rasgo de estática
      const s = ac.createBufferSource(); s.buffer = nb;
      const g = gain(0, out);
      s.connect(filt('bandpass', f, q, g));
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
      s.onended = () => { try { g.disconnect(); } catch (e) { /* ok */ } };
    };
    const curve = (k) => { // distorção que cresce perto do fim
      const c = new Float32Array(512);
      for (let i = 0; i < 512; i++) { const x = i / 255.5 - 1; c[i] = k ? (1 + k) * x / (1 + k * Math.abs(x)) : x; }
      return c;
    };
    const step = () => {
      const now = ac.currentTime;
      const L = vxLevel();
      const sm = (a, b) => { const x = Math.min(1, Math.max(0, (L - a) / (b - a))); return x * x * (3 - 2 * x); };
      const set = (p, v, k) => p.setTargetAtTime(v, now, k || 0.8);
      set(out.gain, document.hidden || vxFrozen ? 0 : 0.6 - 0.3 * sm(0.6, 1), document.hidden || vxFrozen ? 0.05 : 0.4); // a tela travada fica em silêncio
      set(humG.gain, 0.06 * (1 - 0.5 * L));
      set(wowG.gain, 8 + 70 * L);
      set(wow.frequency, 0.55 + L * 5);
      set(hissG.gain, 0.012 + 0.08 * Math.pow(L, 1.5));
      set(dG.gain, 0.03 + 0.16 * sm(0.04, 0.25) + 0.06 * L);
      set(dF.frequency, 150 + 1100 * L * L);
      set(d1.detune, 30 * L); set(d2.detune, -55 * L); set(d3.detune, Math.sin(now / 3) * 40 * L);
      set(d4G.gain, 0.55 * sm(0.45, 0.9)); set(d4.frequency, 55 * Math.pow(2, (1 + L) / 12)); // o semitom de cima, para doer
      set(sweepG.gain, 50 + 400 * L);
      const r = sm(0.86, 1);
      set(riseG.gain, 0.12 * r, 0.3);
      set(rise.frequency, 80 * Math.pow(15, r), 0.3);
      set(rise.detune, (Math.random() * 2 - 1) * 40 * r, 0.05);
      const k = Math.round(sm(0.6, 1) * 10);
      if (k !== m.lastCurve) { shaper.curve = curve(k * 0.6); m.lastCurve = k; }
      if (document.hidden || vxFrozen) { m.nextNote = m.nextBeat = m.nextCrack = 0; return; }
      const ahead = now + 0.25;
      // notas: espaçadas no começo, cada vez mais juntas
      if (m.nextNote < now) m.nextNote = now + 0.05;
      while (m.nextNote < ahead) { note(m.nextNote, L); m.nextNote += Math.max(0.18, (4.5 - 4 * L) * (0.5 + Math.random())); }
      // batidas: entram com um terço do caminho, de coração lento até 190 por minuto
      if (L >= 0.3) {
        if (m.nextBeat < now) m.nextBeat = now + 0.05;
        const x = (L - 0.3) / 0.7, bpm = 44 + 146 * Math.pow(x, 1.3), beat = 60 / bpm;
        while (m.nextBeat < ahead) {
          const t = m.nextBeat;
          kick(t, 0.35 + 0.35 * x);
          if (L < 0.7) kick(t + beat * 0.28, 0.22 + 0.2 * x); // tum-tum de coração
          if (L >= 0.6) burst(t + beat / 2, 0.04, 0.12 + 0.2 * x, 7000, 1.5);
          if (L >= 0.85) { burst(t + beat / 4, 0.03, 0.12, 9000, 2); burst(t + beat * 3 / 4, 0.03, 0.12, 9000, 2); }
          m.nextBeat += beat;
        }
      } else m.nextBeat = 0;
      // estalos de fita e, mais adiante, rasgos de estática
      if (m.nextCrack < now) m.nextCrack = now + 0.05;
      while (m.nextCrack < ahead) {
        const t = m.nextCrack;
        burst(t, 0.012, 0.08 + 0.2 * L, 1500 + Math.random() * 4000, 4);
        if (L > 0.5 && Math.random() < L * 0.18) burst(t, 0.08 + Math.random() * 0.3, 0.12 + 0.25 * L, 600 + Math.random() * 3000, 0.4);
        m.nextCrack += (0.15 + Math.random() * 1.6) * (1.3 - L);
      }
    };
    m.timer = setInterval(step, 100);
    vxMus = m;
    step();
  }
  /* O susto do vórtex: quando o buraco aparece, há uma chance de a tela travar por alguns segundos
     e então um rosto feito do próprio vórtex pular na tela com um som alto. Só uma vez por pessoa (neste aparelho). */
  var VXS_KEY = 'vortex.vxscare.v1';
  var vxFrozen = false;
  function vxMaybeScare(chance) {
    if (vxFrozen || Math.random() >= chance) return;
    try { if (localStorage.getItem(VXS_KEY)) return; localStorage.setItem(VXS_KEY, String(Date.now())); } catch (e) { return; }
    const go = () => setTimeout(vxScare, vxR(700, 1800));
    // sem nenhum toque ainda o navegador não deixa tocar som: o susto espera o primeiro toque
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) {
      const once = () => { ['pointerdown', 'keydown'].forEach((e) => document.removeEventListener(e, once, true)); go(); };
      ['pointerdown', 'keydown'].forEach((e) => document.addEventListener(e, once, true));
    } else go();
  }
  function vxFaceSvg() {
    const teeth = [];
    for (let i = 0; i <= 18; i++) { // dentes em volta da boca, de tamanhos tortos
      const a = Math.PI * 2 * i / 18;
      const r1 = 1, r2 = i % 2 ? 0.72 - Math.random() * 0.2 : 1;
      teeth.push((Math.cos(a) * 32 * (i % 2 ? r2 : r1)).toFixed(1) + ',' + (42 + Math.sin(a) * 20 * (i % 2 ? r2 : r1)).toFixed(1));
    }
    const swirl = [];
    for (let i = 0; i < 9; i++) swirl.push('<ellipse rx="' + (40 + i * 7) + '" ry="' + (60 + i * 5) + '" transform="rotate(' + (i * 23) + ')" fill="none" stroke="' + ['#ff4fd8', '#4ff7ff', '#fff04f', '#784fff'][i % 4] + '" stroke-opacity="' + (0.55 - i * 0.05).toFixed(2) + '" stroke-width="' + (3 - i * 0.25).toFixed(2) + '"/>');
    return '<svg class="vx-scare__face" viewBox="-100 -100 200 200" aria-hidden="true">' +
      '<defs><filter id="vx-face-warp" x="-25%" y="-25%" width="150%" height="150%"><feTurbulence type="turbulence" baseFrequency="0.02 0.05" numOctaves="2" seed="7">' +
      '<animate attributeName="baseFrequency" dur="0.35s" values="0.02 0.05;0.06 0.02;0.02 0.09;0.02 0.05" repeatCount="indefinite"/></feTurbulence>' +
      '<feDisplacementMap in="SourceGraphic" scale="16"/></filter>' +
      '<radialGradient id="vx-face-eye"><stop offset="0" stop-color="#000"/><stop offset=".5" stop-color="#000"/><stop offset=".58" stop-color="#fff"/><stop offset=".72" stop-color="#ff4fd8"/><stop offset="1" stop-color="#4ff7ff" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="vx-face-skin"><stop offset="0" stop-color="#24123d"/><stop offset=".7" stop-color="#0a0612"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>' +
      '<g filter="url(#vx-face-warp)"><ellipse rx="72" ry="92" fill="url(#vx-face-skin)"/><g class="vx-scare__swirl">' + swirl.join('') + '</g>' +
      '<circle cx="-30" cy="-24" r="24" fill="url(#vx-face-eye)"/><circle cx="31" cy="-21" r="21" fill="url(#vx-face-eye)"/>' +
      '<circle cx="-30" cy="-24" r="2.6" fill="#fff"/><circle cx="31" cy="-21" r="2" fill="#fff"/>' +
      '<ellipse cx="0" cy="42" rx="34" ry="22" fill="#000" stroke="#fff" stroke-width="2.5"/>' +
      '<polygon points="' + teeth.join(' ') + '" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="bevel"/>' +
      '<ellipse cx="0" cy="44" rx="10" ry="6" fill="#000" stroke="#ff4fd8" stroke-width="1"/></g></svg>';
  }
  function vxScare() {
    if (vxFrozen) return;
    vxFrozen = true;
    const root = document.documentElement;
    const dlg = h('dialog', 'vx-scare');
    dlg.setAttribute('aria-label', 'Vórtex');
    dlg.addEventListener('cancel', (ev) => ev.preventDefault()); // nem o Esc tira
    document.body.append(dlg);
    root.classList.add('vx-freeze');
    try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); }
    setTimeout(() => {
      root.classList.remove('vx-freeze');
      dlg.innerHTML = vxFaceSvg();
      dlg.classList.add('is-scare');
      playThemeSound('scare');
      setTimeout(() => {
        dlg.classList.add('is-out');
        vxFrozen = false;
        setTimeout(() => { if (dlg.open) dlg.close(); dlg.remove(); }, 600);
      }, 1500);
    }, vxR(2200, 4000));
  }
  function vortexExplode() {
    if (document.querySelector('.vx-boom')) return;
    clearTimeout(vxTimer); clearInterval(vxClock);
    saveVx();
    vxMusStop(true); // a trilha corta seco na explosão
    playThemeSound('boom');
    const flying = vxVisible('.block, .row, .prog__card, .theme-card, .btn, h1, h2, .topbar, .rail').slice(0, 80);
    flying.forEach((el) => {
      el.style.setProperty('--dx', Math.round(vxR(-120, 120)) + 'vw');
      el.style.setProperty('--dy', Math.round(vxR(-90, 120)) + 'vh');
      el.style.setProperty('--rot', Math.round(vxR(-540, 540)) + 'deg');
      el.style.setProperty('--d', vxR(0, 0.35).toFixed(2) + 's');
      el.classList.add('vx-fly');
    });
    const boom = h('div', 'vx-boom', h('span', 'vx-boom__flash'), h('span', 'vx-boom__ring'), h('p', 'vx-boom__text', 'HORIZONTE ROMPIDO'));
    boom.setAttribute('role', 'status');
    document.body.append(boom);
    setTimeout(() => {
      flying.forEach((el) => { el.classList.remove('vx-fly'); ['--dx', '--dy', '--rot', '--d'].forEach((p) => el.style.removeProperty(p)); });
      vxState.t = 0; vxState.exploded = true; vxState.stable = false;
      saveVx();
      applyTheme('');
      boom.classList.add('is-out');
      setTimeout(() => boom.remove(), 900);
      if (document.getElementById('theme-list')) renderThemes();
      toast('O site explodiu e voltou ao tema normal. Agora o Vórtex ∞ também tem uma versão estável.');
    }, 2600);
  }
  // depois da primeira explosão, cada vez que o tema é escolhido: estável ou instável? (false = desistiu)
  async function chooseVortex() {
    if (!vxState.exploded) { vxState.stable = false; saveVx(); return true; }
    const r = await askChoice('Vórtex ∞', 'Qual vórtex?', 'O instável vai bugando o site com o tempo até explodir de novo. O estável fica nas cores e em alguns glitches, sem piorar.',
      [['instavel', 'Instável (até explodir)'], ['estavel', 'Estável']], 'Abrir o vórtex');
    if (!r) return false;
    vxState.stable = r === 'estavel';
    saveVx();
    return true;
  }
  applyTheme(themeState.unlocked.indexOf(themeState.active) >= 0 ? themeState.active : '');
  themeBooted = true;

  /* ---------- Sons e animações de toque ----------
     Sons curtos feitos na hora (Web Audio, sem arquivos). Cada tema tem a própria "banda":
     escala, camadas de onda, filtro, ruído, eco e um jeito de variar, então o mesmo toque
     cada função tem o seu som (só o tom varia um pouco) e cada tema soa diferente do outro.
     Vortex = gotas de chuva e madeira (pentatônica menor), Ether = vidro e energia (lídio, eco longo),
     Claptrap = bipes e tagarelice de robô, God = órgão e coro em quintas (maior, eco de catedral),
     Nyan = chiptune 8 bits com arpejo, Vórtex ∞ = serra, ruído e notas que caem fora da escala.
     O botão 🔊 na barra liga e desliga; a escolha fica neste aparelho. */
  var SFX_KEY = 'vortex.sfx.v1';
  var sfx = { on: (() => { try { return localStorage.getItem(SFX_KEY) !== 'off'; } catch (e) { return true; } })(), ctx: null, last: {}, noise: null };
  // layers: [onda, multiplicador de frequência, volume]; drop: a nota cai (gota) no ataque
  var SFX_THEME = {
    '': { base: 440, scale: [0, 3, 5, 7, 10], layers: [['sine', 1, 1], ['triangle', 2, 0.18]], attack: 0.004, decay: 0.11, gain: 0.15,
      drop: 1.5, filter: ['lowpass', 3200, 0.7], knock: 0.22, echo: [0.11, 0.18], jitter: 35 },
    ether: { base: 660, scale: [0, 2, 4, 6, 7, 9, 11], layers: [['triangle', 1, 0.8], ['sine', 2.01, 0.35], ['sine', 3.003, 0.12]], attack: 0.01, decay: 0.2, gain: 0.11,
      vibrato: [6.5, 0.012], filter: ['highpass', 300, 0.5], hiss: 0.05, echo: [0.19, 0.38], jitter: 25, sparkle: true },
    claptrap: { base: 620, scale: [0, 2, 4, 5, 7, 9, 11], layers: [['square', 1, 1]], attack: 0.002, decay: 0.06, gain: 0.06,
      bits: 1.5, filter: ['bandpass', 1800, 1.2], chatter: true, jitter: 60 },
    god: { base: 392, scale: [0, 2, 4, 5, 7, 9, 11], layers: [['sine', 1, 0.7], ['sine', 1.5, 0.35], ['sine', 2, 0.3], ['triangle', 4, 0.06]], attack: 0.03, decay: 0.3, gain: 0.1,
      filter: ['lowpass', 2600, 0.4], echo: [0.23, 0.45], jitter: 20, chorus: 4 },
    nyan: { base: 784, scale: [0, 2, 4, 7, 9], layers: [['square', 1, 1], ['square', 0.5, 0.25]], attack: 0.002, decay: 0.07, gain: 0.05,
      arp: [0, 4, 7], vibrato: [9, 0.008], filter: ['lowpass', 5200, 0.5], jitter: 25 },
    vortice: { base: 230, scale: [0, 1, 3, 6, 7, 8, 11], layers: [['sawtooth', 1, 0.7], ['square', 1.007, 0.25], ['sine', 0.5, 0.5]], attack: 0.006, decay: 0.15, gain: 0.07,
      filter: ['lowpass', 1400, 6, true], hiss: 0.12, echo: [0.13, 0.5], jitter: 90, glitch: true, warp: true }
  };
  // um som fixo para cada função; a cada toque só o tom varia um pouco (jitter do tema).
  // Nota: [grau da escala, início, duração, deslize]
  var SFX = {
    tap: [[2, 0, 1]], // botão comum
    go: [[0, 0, 0.8], [7, 0.05, 1.3]], // ação principal: começar, entrar, abrir, jogar
    add: [[3, 0, 0.7], [7, 0.05, 1.1]], // criar, adicionar, pôr, comprar
    save: [[4, 0, 0.7], [5, 0.05, 0.7], [7, 0.1, 1.4]], // salvar, aplicar, pronto
    del: [[0, 0, 0.7], [-3, 0.05, 1.3, 0.75]], // excluir, apagar, remover, tirar
    cancel: [[1, 0, 0.9, 0.85]], // cancelar, fechar, voltar, ×
    roll: [[6, 0, 0.4], [4, 0.04, 0.4], [7, 0.08, 0.6]], // rolar, sortear
    star: [[7, 0, 0.6], [9, 0.04, 0.6], [11, 0.08, 1.2]], // favoritar
    nav: [[0, 0, 0.7], [4, 0.04, 0.9]], // menu do site
    link: [[5, 0, 0.7], [7, 0.035, 0.7]],
    tab: [[2, 0, 0.8], [4, 0.045, 0.8]],
    toggle: [[3, 0, 0.6], [5, 0.03, 0.5]], // liga: sobe
    toggleOff: [[5, 0, 0.6], [3, 0.03, 0.5]], // desliga: desce
    expand: [[1, 0, 1.1, 1.12]], // abre a seção ou a lista
    collapse: [[3, 0, 1.1, 0.9]], // fecha a seção
    open: [[-1, 0, 1.2], [3, 0.07, 1.5]],
    close: [[4, 0, 0.8], [0, 0.05, 1.1]],
    drag: [[-3, 0, 1.6, 1.6]],
    drop: [[5, 0, 1.4, 0.45]],
    ok: [[0, 0, 1], [2, 0.07, 1], [4, 0.14, 1.6]],
    bad: [[1, 0, 0.8], [-2, 0.09, 1.4, 0.8]],
    dice: [[6, 0, 0.5], [4, 0.05, 0.5], [7, 0.1, 0.5], [3, 0.16, 0.7]],
    hit: [[-4, 0, 1.6, 0.45], [-7, 0.05, 1.8, 0.6]]
  };
  function sfxCtx() {
    if (!sfx.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; sfx.ctx = new AC(); }
    if (sfx.ctx.state === 'suspended') sfx.ctx.resume();
    return sfx.ctx;
  }
  function sfxNoise(ac) { // meio segundo de ruído branco, reaproveitado
    if (!sfx.noise) {
      const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.5), ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      sfx.noise = buf;
    }
    return sfx.noise;
  }
  const sfxRnd = (a, b) => a + Math.random() * (b - a);
  const sfxPick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function degFreq(th, deg) {
    const n = th.scale.length;
    const oct = Math.floor(deg / n);
    return th.base * Math.pow(2, (th.scale[((deg % n) + n) % n] + 12 * oct) / 12);
  }
  function play(name) {
    if (!sfx || !sfx.on || !SFX[name]) return;
    const now = performance.now();
    if (now - (sfx.last[name] || 0) < 45) return; // vários de uma vez viram um
    sfx.last[name] = now;
    let ac;
    try { ac = sfxCtx(); } catch (e) { return; }
    if (!ac) return;
    const th = SFX_THEME[themeState.active] || SFX_THEME[''];
    const t0 = ac.currentTime + 0.005;
    // saída do toque: filtro do tema e, se houver, eco
    const bus = ac.createGain();
    bus.gain.value = 1;
    const flt = ac.createBiquadFilter();
    flt.type = th.filter[0];
    flt.frequency.value = th.filter[1];
    flt.Q.value = th.filter[2];
    if (th.filter[3]) { // filtro que varre (Vórtex ∞): abre e fecha num instante
      flt.frequency.setValueAtTime(600, t0);
      flt.frequency.exponentialRampToValueAtTime(3500, t0 + 0.08);
      flt.frequency.exponentialRampToValueAtTime(450, t0 + 0.3);
    }
    bus.connect(flt).connect(ac.destination);
    if (th.echo) {
      const dl = ac.createDelay(1), fb = ac.createGain(), wet = ac.createGain();
      dl.delayTime.value = th.echo[0];
      fb.gain.value = th.echo[1];
      wet.gain.value = 0.45;
      flt.connect(dl); dl.connect(fb).connect(dl); dl.connect(wet).connect(ac.destination);
      setTimeout(() => { try { flt.disconnect(dl); } catch (e) { /* já foi */ } }, 2500);
    }
    // a única coisa sorteada: o tom do som inteiro (o vórtex às vezes ainda puxa para outra oitava ou um trítono)
    const cents = sfxRnd(-th.jitter, th.jitter) + (th.warp && Math.random() < 0.3 ? sfxPick([-12, -7, 6, 12]) * 100 : 0);
    const extra = th.chatter && name === 'tap' ? [[5, 0.05, 0.6], [1, 0.1, 0.5]] : []; // tagarelice do robô
    SFX[name].concat(extra).forEach((n) => {
      const len = th.decay * n[2];
      const start = t0 + n[1];
      const f = degFreq(th, n[0]) * Math.pow(2, cents / 1200);
      const env = ac.createGain();
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(th.gain, start + th.attack);
      env.gain.exponentialRampToValueAtTime(0.0001, start + th.attack + len);
      env.connect(bus);
      const stop = start + th.attack + len + 0.03;
      th.layers.forEach((L, li) => {
        const voices = th.chorus && li === 0 ? [-th.chorus, th.chorus] : [0];
        voices.forEach((dt) => {
          const o = ac.createOscillator(), lg = ac.createGain();
          o.type = L[0];
          o.detune.value = dt;
          const fl = f * L[1];
          if (th.drop) { // gota: começa acima e cai na nota
            o.frequency.setValueAtTime(fl * th.drop, start);
            o.frequency.exponentialRampToValueAtTime(fl, start + 0.025);
          } else o.frequency.setValueAtTime(fl, start);
          if (n[3]) o.frequency.exponentialRampToValueAtTime(fl * n[3], start + len);
          if (th.bits) o.frequency.setValueAtTime(fl * th.bits, start + len * 0.5); // bipe em dois tons
          if (th.arp) th.arp.forEach((st, i) => o.frequency.setValueAtTime(fl * Math.pow(2, st / 12), start + i * 0.022)); // arpejo 8 bits
          if (th.glitch) o.frequency.setValueAtTime(fl * 0.71, start + len * 0.45); // a nota quebra no meio
          if (th.vibrato) {
            const lfo = ac.createOscillator(), lfoG = ac.createGain();
            lfo.frequency.value = th.vibrato[0];
            lfoG.gain.value = fl * th.vibrato[1];
            lfo.connect(lfoG).connect(o.frequency);
            lfo.start(start); lfo.stop(stop);
          }
          lg.gain.value = L[2] / voices.length;
          o.connect(lg).connect(env);
          o.start(start); o.stop(stop);
        });
      });
      if (th.sparkle) { // faísca de vidro bem aguda
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f * 5, start + 0.02);
        g.gain.setValueAtTime(0.0001, start + 0.02);
        g.gain.exponentialRampToValueAtTime(th.gain * 0.25, start + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.02 + len * 1.4);
        o.connect(g).connect(bus);
        o.start(start + 0.02); o.stop(start + 0.05 + len * 1.4);
      }
    });
    // ruído: batida de madeira (Vortex) ou chiado de energia (Ether, Vórtex ∞)
    if (th.knock || th.hiss) {
      const src = ac.createBufferSource(), nf = ac.createBiquadFilter(), ng = ac.createGain();
      src.buffer = sfxNoise(ac);
      nf.type = th.knock ? 'bandpass' : 'highpass';
      nf.frequency.value = (th.knock ? 1000 : 5000) * Math.pow(2, cents / 1200);
      nf.Q.value = th.knock ? 4 : 0.7;
      const amt = th.knock || th.hiss, nl = th.knock ? 0.03 : th.decay * 1.2;
      ng.gain.setValueAtTime(amt * th.gain * 4, t0);
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + nl);
      src.connect(nf).connect(ng).connect(bus);
      src.start(t0, 0, nl + 0.02);
    }
  }
  function renderSoundBtn() {
    const b = $('#sound-btn');
    if (!b) return;
    b.textContent = sfx.on ? '🔊' : '🔇';
    b.setAttribute('aria-pressed', String(sfx.on));
    b.title = sfx.on ? 'Sons ligados (toque para desligar)' : 'Sons desligados (toque para ligar)';
  }
  var sndTaps = [];
  $('#sound-btn').addEventListener('click', () => {
    const now = Date.now();
    sndTaps = sndTaps.filter((t) => now - t < 4000).concat(now);
    if (sndTaps.length >= 6) vxClue(3); // enigma: cale e fale três vezes
    sfx.on = !sfx.on;
    try { localStorage.setItem(SFX_KEY, sfx.on ? 'on' : 'off'); } catch (e) { /* vale até fechar */ }
    renderSoundBtn();
    nyanMusic();
    vxMusic();
    play('ok');
  });
  renderSoundBtn();

  // toques: som conforme o que foi tocado, e a onda (ripple) nos botões
  // qual som cada botão faz, pela função dele (classe, papel ou a primeira palavra do texto)
  function sfxKind(el) {
    if (el.getAttribute('role') === 'tab' || el.classList.contains('cmd__tab')) return 'tab';
    if (el.matches('input[type="checkbox"], input[type="radio"], label.check, [role="switch"]')) {
      const box = el.matches('input') ? el : el.querySelector('input');
      const on = box ? box.checked : el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-pressed') === 'true';
      return on && (!box || box.type !== 'radio') ? 'toggleOff' : 'toggle';
    }
    if (el.matches('summary')) return el.parentElement && el.parentElement.open ? 'collapse' : 'expand';
    if (el.matches('select')) return 'expand';
    const txt = (el.getAttribute('aria-label') || el.textContent || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const cls = el.className && typeof el.className === 'string' ? el.className : '';
    if (/(^|\s)star\b/.test(cls) || /^[☆★]|favoritar/.test(txt)) return 'star';
    if (/btn--danger/.test(cls) || /^(excluir|apagar|remover|tirar|desvincular|limpar|zerar|descartar|esquecer)/.test(txt)) return 'del';
    if (/__x\b|__close|__back|icon-btn/.test(cls) || /^(cancelar|fechar|voltar|sair|nao$|◀|×|✕)/.test(txt)) return 'cancel';
    if (/^(rolar|sortear|🎲)|rolagem/.test(txt)) return 'roll';
    if (/^(salvar|guardar|pronto|aplicar|confirmar|concluir|ok\b)/.test(txt)) return 'save';
    if (/^(\+|criar|adicionar|novo|nova|por\b|dar\b|comprar|trazer|incluir|abastecer)/.test(txt)) return 'add';
    if (el.matches('a[href]')) return el.closest('.app-nav, nav') ? 'nav' : 'link';
    if (/btn--primary/.test(cls) || /^(comecar|jogar|entrar|abrir|disparar|iniciar)/.test(txt)) return 'go';
    return 'tap';
  }
  const TAP_SEL = 'button, a[href], [role="tab"], summary, select, input[type="checkbox"], input[type="radio"], label.check';
  document.addEventListener('pointerdown', (ev) => {
    const el = ev.target.closest && ev.target.closest(TAP_SEL);
    if (!el || el.disabled || el.id === 'sound-btn') return;
    play(sfxKind(el));
    if (el.matches('button, a.btn') && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const r = el.getBoundingClientRect();
      const dot = document.createElement('span');
      dot.className = 'ripple';
      const size = Math.max(r.width, r.height) * 2;
      dot.style.width = dot.style.height = size + 'px';
      dot.style.left = (ev.clientX - r.left - size / 2) + 'px';
      dot.style.top = (ev.clientY - r.top - size / 2) + 'px';
      if (getComputedStyle(el).position === 'static') el.classList.add('has-ripple');
      el.append(dot);
      setTimeout(() => dot.remove(), 600);
    }
  }, { passive: true });
  // arrastar e soltar (inventário, organização de listas)
  document.addEventListener('dragstart', (ev) => { play('drag'); if (ev.target.classList) ev.target.classList.add('is-dragging'); }, true);
  document.addEventListener('dragend', (ev) => { if (ev.target.classList) ev.target.classList.remove('is-dragging'); }, true);
  document.addEventListener('drop', () => play('drop'), true);
  // janelas abrindo e fechando
  document.addEventListener('close', (ev) => { if (ev.target && ev.target.tagName === 'DIALOG') play('close'); }, true);

  function secretHit(q) {
    const k = nameKey(q || '');
    if (/\bvort(ex|ice)\b/.test(k)) vxClue(1); // enigma: procurar o nome dele
    return /elemento\s*115|element\s*115|^115$/.test(k) ? 'ether' : '';
  }
  function secretRow(id) {
    const t = THEMES.find((x) => x.id === id);
    const got = themeState.unlocked.indexOf(id) >= 0;
    const btn = h('button', 'row__open secret secret--' + id,
      h('span', 'secret__icon', id === 'ether' ? '115' : ''),
      h('span', 'row__main',
        h('span', 'row__title', id === 'ether' ? 'Elemento 115' : 'CL4P-TP', ' ', h('span', 'tag', got ? 'Tema ' + t.name : '???')),
        h('span', 'row__meta', id === 'ether' ? 'Item oculto · energia Ether pura · instável' : 'Unidade robótica de uso geral · fala demais'),
        h('span', 'row__text', got ? 'Toque para equipar o tema ' + t.name + ' de novo.' : 'Toque para pegar.')));
    btn.type = 'button';
    btn.addEventListener('click', () => unlockTheme(id));
    return h('li', 'row secret-row', btn);
  }

  function playThemeSound(id) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ac = new AC();
      const now = ac.currentTime + 0.02;
      const out = ac.createGain();
      out.gain.value = id === 'scare' ? 0.6 : 0.2;
      out.connect(ac.destination);
      // eco próprio de cada tema e um tom sorteado, para o desbloqueio não soar sempre igual
      const ECHO = { ether: [0.21, 0.4], god: [0.27, 0.5], nyan: [0.11, 0.15], vortice: [0.17, 0.55], claptrap: [0.07, 0.2], boom: [0.31, 0.45], scare: [0.09, 0.5] }[id];
      if (ECHO) {
        const dl = ac.createDelay(1), fb = ac.createGain(), wet = ac.createGain();
        dl.delayTime.value = ECHO[0]; fb.gain.value = ECHO[1]; wet.gain.value = 0.4;
        out.connect(dl); dl.connect(fb).connect(dl); dl.connect(wet).connect(ac.destination);
      }
      const tr = Math.pow(2, (id === 'nyan' ? 0 : Math.round(Math.random() * 4 - 2)) / 12);
      const tone = (type, f0, f1, t0, dur, vol) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f0 * tr, now + t0);
        o.frequency.exponentialRampToValueAtTime(f1 * tr, now + t0 + dur);
        g.gain.setValueAtTime(0.0001, now + t0);
        g.gain.exponentialRampToValueAtTime(vol, now + t0 + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, now + t0 + dur);
        o.connect(g); g.connect(out);
        o.start(now + t0); o.stop(now + t0 + dur + 0.05);
      };
      if (id === 'ether') { // zumbido grave, carga subindo, estalos e um brilho no fim
        tone('sine', 50, 95, 0, 2.4, 0.9);
        tone('sawtooth', 90, 1500, 0.15, 1.3, 0.22);
        tone('triangle', 990, 1980, 1.3, 0.9, 0.45);
        tone('sine', 1480, 2960, 1.4, 0.8, 0.25);
        const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * 1.4), ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() < 0.015 ? Math.random() * 2 - 1 : 0;
        const n = ac.createBufferSource(), hp = ac.createBiquadFilter(), ng = ac.createGain();
        n.buffer = buf; hp.type = 'highpass'; hp.frequency.value = 2500; ng.gain.value = 0.6;
        n.connect(hp); hp.connect(ng); ng.connect(out);
        n.start(now + 0.2);
      } else if (id === 'god') { // acorde de coro subindo e um sino
        [262, 330, 392, 523].forEach((f, i) => tone('sine', f, f * 1.002, i * 0.12, 2.2 - i * 0.2, 0.32));
        tone('triangle', 1047, 1050, 0.9, 1.6, 0.25);
        tone('sine', 2093, 2096, 1.0, 1.4, 0.12);
      } else if (id === 'nyan') { // melodia de 8 bits
        [740, 831, 622, 659, 554, 587, 554, 494, 494, 554, 587, 587, 554, 494, 554, 622].forEach((f, i) => tone('square', f, f, i * 0.11, 0.1, 0.22));
      } else if (id === 'scare') { // o grito: ruído cheio, um cacho de serras desafinadas caindo e um baque grave
        [620, 655, 701, 980, 1040, 1390].forEach((f) => tone('sawtooth', f, f * 0.55, 0, 1.5, 0.35));
        tone('square', 2400, 900, 0, 0.9, 0.2);
        tone('sine', 70, 28, 0, 1.4, 1);
        const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * 1.5), ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        const n = ac.createBufferSource(), ng = ac.createGain();
        n.buffer = buf; ng.gain.value = 0.9;
        n.connect(ng); ng.connect(out);
        n.start(now);
      } else if (id === 'boom') { // explosão: estrondo grave, ruído rasgando e um apito que cai
        tone('sine', 90, 22, 0, 2.6, 1);
        tone('sawtooth', 3200, 40, 0.05, 1.6, 0.25);
        tone('square', 60, 30, 0.1, 1.2, 0.3);
        const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * 2.2), ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
        const n = ac.createBufferSource(), lp = ac.createBiquadFilter(), ng = ac.createGain();
        n.buffer = buf; lp.type = 'lowpass'; lp.frequency.value = 1200; ng.gain.value = 1.2;
        n.connect(lp); lp.connect(ng); ng.connect(out);
        n.start(now);
      } else if (id === 'vortice') { // sucção grave, rasgo de ruído e um eco agudo invertido
        tone('sawtooth', 40, 25, 0, 2.6, 0.7);
        tone('sine', 2400, 60, 0.1, 1.8, 0.3);
        tone('square', 120, 3000, 1.2, 0.5, 0.15);
        const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * 1.2), ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        const n = ac.createBufferSource(), bp = ac.createBiquadFilter(), ng = ac.createGain();
        n.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = 900; ng.gain.value = 0.5;
        n.connect(bp); bp.connect(ng); ng.connect(out);
        n.start(now + 0.4);
      } else { // bipes de robô animado
        [523, 659, 784, 1047, 880, 1319, 1568].forEach((f, i) => tone('square', f, f * 1.03, i * 0.085, 0.075, 0.3));
        tone('sine', 260, 920, 0.7, 0.22, 0.5);
        tone('sine', 920, 340, 0.95, 0.25, 0.4);
      }
      setTimeout(() => ac.close().catch(() => {}), 4500);
    } catch (e) { /* sem áudio: só a animação */ }
  }

  function unlockTheme(id) {
    const t = THEMES.find((x) => x.id === id);
    if (!t || document.querySelector('.unlock')) return;
    const first = themeState.unlocked.indexOf(id) < 0;
    if (first) themeState.unlocked.push(id);
    saveThemes();
    playThemeSound(id);
    const ov = h('div', 'unlock unlock--' + id,
      h('div', 'unlock__fx', h('span', 'unlock__orb'), h('span', 'unlock__ring'), h('span', 'unlock__ring unlock__ring--2')),
      h('div', 'unlock__card',
        h('p', 'unlock__kicker', first ? 'Tema desbloqueado' : 'Tema equipado'),
        h('p', 'unlock__name', t.name),
        id === 'vortice' ? h('p', 'unlock__sub', vxText()) : h('p', 'unlock__sub', t.unlock || '')));
    ov.setAttribute('role', 'status');
    document.body.append(ov);
    setTimeout(() => applyTheme(id), 900);
    setTimeout(() => ov.classList.add('is-out'), 2600);
    setTimeout(() => { ov.remove(); toast('Tema ' + t.name + ' equipado. Troque de tema no Perfil.'); }, 3200);
  }

  function renderThemes() {
    $('#theme-list').replaceChildren(...THEMES.map((t) => {
      const open = !t.id || themeState.unlocked.indexOf(t.id) >= 0;
      const on = themeState.active === t.id;
      const card = h('div', 'theme-card theme-card--' + (t.id || 'vortex') + (open ? '' : ' is-locked') + (on ? ' is-on' : ''),
        h('span', 'theme-card__swatch', h('i'), h('i'), h('i')),
        h('span', 'theme-card__main', h('strong', '', open ? t.name : '???'), open && t.id === 'vortice' ? vxText() : (!open && t.id === 'vortice' && vxClueHint()) || h('span', '', open ? t.text : t.hint)));
      if (!open && t.id === 'vortice') { // enigma: bater no cadeado
        let n = 0, t0 = 0;
        card.addEventListener('click', () => { const now = Date.now(); n = now - t0 < 900 ? n + 1 : 1; t0 = now; if (n >= 5) vxClue(4); });
      }
      if (open) {
        const b = h('button', 'btn btn--sm ' + (on ? 'btn--ghost' : 'btn--primary'), on ? 'Em uso' : 'Usar');
        b.type = 'button';
        b.disabled = on;
        b.addEventListener('click', async () => {
          if (t.id === 'vortice' && !(await chooseVortex())) return;
          applyTheme(t.id); renderThemes(); toast('Tema ' + t.name + (t.id === 'vortice' && vxState.stable ? ' (estável).' : '.'));
        });
        card.append(b);
      } else card.append(h('span', 'theme-card__lock', '🔒'));
      return card;
    }));
  }

  // God e Nyan Cat: conquistas conferidas a cada desenho da ficha (e ao mudar o sexo)
  function checkSecretThemes(mm) {
    if (!sheetChar || !sheetChar.sheet || document.querySelector('.unlock')) return;
    const s = sheetChar.sheet;
    const has = (id) => themeState.unlocked.indexOf(id) >= 0;
    if (!has('nyan') && isNeko(s.specimen) && String(s.sex || '').trim() === MYAU) { unlockTheme('nyan'); return; }
    if (!has('god') && s.setup) {
      const m = mm || compute(sheetChar);
      const all = ATTRS.every((at) => SKILLS[at.id].every((sk) => num(s.skills[sk[0]]) >= 3));
      if (all && m.skillUsed <= m.skillBudget) unlockTheme('god'); // +3 em tudo, sem ponto de perícia além do que as regras dão
    }
  }

  /* Enigma do Vórtex: sete ações escondidas pelo site, cada uma solta um pedaço da frase (com a posição dele).
     O card trancado do tema no Perfil mostra os pedaços achados e uma charada para um que falta. */
  var VXC_KEY = 'vortex.vxclue.v1';
  var VXC_WORDS = ['TUDO', 'TODOS', 'VOCÊ', 'EU', 'NINGUÉM', 'SÃO', 'VÓRTEX'];
  var VXC_RIDDLES = [
    'Bata sete vezes na porta de casa.',
    'Procure o nome dele onde se procura.',
    'Leia as regras até o fim. O fim lê de volta.',
    'Cale e fale, cale e fale, cale e fale.',
    'Bata no cadeado até ele responder.',
    'Fique quieto. Ele fala quando ninguém mexe.',
    'Treze vezes os dados, numa visita só.'
  ];
  var vxClues = (() => { try { return JSON.parse(localStorage.getItem(VXC_KEY)) || []; } catch (e) { return []; } })();
  function vxClue(i) {
    if (vxClues.indexOf(i) >= 0 || document.querySelector('.vx-clue')) return;
    vxClues.push(i);
    try { localStorage.setItem(VXC_KEY, JSON.stringify(vxClues)); } catch (e) { /* só nesta visita */ }
    play('ok');
    const box = h('div', 'vx-clue', h('span', 'vx-clue__n', 'fragmento ' + (i + 1) + ' de 7'), h('strong', 'vx-clue__w', VXC_WORDS[i]));
    box.setAttribute('role', 'status');
    document.body.append(box);
    setTimeout(() => box.remove(), 3800);
    if (vxClues.length === 7) setTimeout(() => {
      const end = h('div', 'vx-clue vx-clue--end', h('span', 'vx-clue__n', 'sete pedaços'), h('strong', 'vx-clue__w', 'Uma frase. Nenhum espaço. O endereço do site escuta.'));
      end.setAttribute('role', 'status');
      document.body.append(end);
      setTimeout(() => end.remove(), 6000);
    }, 4000);
    if (document.getElementById('theme-list') && location.hash.indexOf('#/perfil') === 0) renderThemes();
  }
  function vxClueHint() { // texto do card trancado: pedaços achados e a charada de um que falta
    if (!vxClues.length) return null;
    const missing = VXC_WORDS.map((w, i) => i).filter((i) => vxClues.indexOf(i) < 0);
    return h('span', 'vx-clue-hint',
      h('span', 'vx-clue-hint__slots', VXC_WORDS.map((w, i) => (vxClues.indexOf(i) >= 0 ? w : '▓▓▓')).join(' · ')),
      h('span', 'vx-clue-hint__riddle', missing.length ? VXC_RIDDLES[vxPick(missing)] : 'Uma frase. Nenhum espaço. O endereço do site escuta.'));
  }
  // 1: sete toques seguidos no logo (a "porta de casa")
  (() => {
    let n = 0, t0 = 0;
    const brand = document.querySelector('.brand');
    if (brand) brand.addEventListener('click', () => { const now = Date.now(); n = now - t0 < 900 ? n + 1 : 1; t0 = now; if (n >= 7) vxClue(0); });
  })();
  // 3: chegar ao fim do Compêndio
  document.addEventListener('scroll', (ev) => {
    if (location.hash.indexOf('#/rules') !== 0) return;
    const el = ev.target === document ? document.scrollingElement : ev.target;
    if (el && el.scrollHeight > el.clientHeight + 300 && el.scrollHeight - el.scrollTop - el.clientHeight < 30) vxClue(2);
  }, { capture: true, passive: true });
  // 6: noventa segundos sem mexer em nada, com a página à vista
  (() => {
    let last = Date.now();
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((e) => document.addEventListener(e, () => { last = Date.now(); }, { capture: true, passive: true }));
    setInterval(() => { if (document.hidden) last = Date.now(); else if (Date.now() - last > 90000) { last = Date.now(); vxClue(5); } }, 5000);
  })();
  // 7: treze testes de dados na mesma visita (contados em rollTest)
  var vxDice = 0;

  // Vórtex ∞: a tela "hackeada" que abre pela URL secreta; o interruptor liga e desliga o tema
  const VORTEX_HASH = 10166865; // FNV-1a da frase normalizada; a frase em si não fica no código
  const vxHash = (t) => { let x = 0x811c9dc5; for (const c of t) { x ^= c.charCodeAt(0); x = Math.imul(x, 0x01000193) >>> 0; } return x; };
  const vxKey = (str) => {
    let t = String(str || '');
    try { t = decodeURIComponent(t); } catch (e) { /* fica cru */ }
    return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  };
  // abre a tela se a URL (fim do caminho, ?busca ou #) tiver a frase, e limpa a frase da barra de endereço
  function vortexUrlCheck() {
    const parts = [location.pathname.split('/').pop(), location.search, location.hash];
    const hit = (x) => vxHash(vxKey(x)) === VORTEX_HASH;
    if (!parts.some(hit)) return;
    const path = hit(parts[0]) ? location.pathname.replace(/[^/]*$/, '') : location.pathname;
    const search = hit(location.search) ? '' : location.search;
    const hash = hit(location.hash) ? '' : location.hash;
    history.replaceState(null, '', path + search + hash);
    setTimeout(openVortexHack, 400);
  }
  let vxDlg = null;
  /* Prosa do glitch na tela hackeada: várias linhas que se corrompem sem parar. Às vezes uma linha fica legível
     por um tempo diferente a cada vez; tocar nela nessa hora segura a frase. E, sorteada, uma linha de cada vez
     se transmuta no botão do vórtex, também por um tempo variável. */
  function vxProse(btn, delay) {
    const wrap = h('div', 'vxprose');
    wrap.style.animationDelay = delay + 's';
    const lines = [];
    for (let i = 0; i < 6; i++) {
      const el = h('p', 'vxprose__line');
      const L = { el, mode: 'noise', until: 0, start: 0, phrase: '' };
      el.addEventListener('click', () => {
        if (L.mode === 'phrase') { L.mode = 'lore'; L.start = performance.now(); L.until = L.start + 5200; play('ok'); }
        else if (L.mode === 'noise') { el.classList.remove('is-miss'); void el.offsetWidth; el.classList.add('is-miss'); play('bad'); }
      });
      lines.push(L);
      wrap.append(el);
    }
    const set = (L, txt, m) => { L.el.textContent = txt; L.el.dataset.vxm = m; };
    let seen = false, btnLine = null, btnAt = performance.now() + delay * 1000 + vxR(600, 2200);
    const tick = () => {
      if (vxFrozen) return;
      if (wrap.isConnected) seen = true; else if (seen) { clearInterval(id); return; }
      const now = performance.now();
      if (!btnLine && now > btnAt) {
        const free = lines.filter((L) => L.mode === 'noise');
        if (free.length) {
          btnLine = vxPick(free);
          btnLine.mode = 'button'; btnLine.until = now + vxR(1400, 4200);
          btnLine.el.dataset.vxm = 'button';
          btnLine.el.replaceChildren(btn);
        }
      }
      lines.forEach((L) => {
        if (L.mode === 'button') {
          if (now < L.until) return;
          L.mode = 'noise'; btnLine = null; btnAt = now + vxR(900, 3800);
        } else if (L.mode === 'lore') {
          if (now < L.until) { const k = Math.min(1, (now - L.start) / 500); set(L, k < 1 ? vxCorrupt(L.phrase, 1 - k) : L.phrase, 'lore'); return; }
          L.mode = 'noise';
        } else if (L.mode === 'phrase') {
          if (now < L.until) return;
          L.mode = 'noise';
        } else if (Math.random() < 0.012) { // a linha fica legível e clicável por um tempo sorteado
          L.mode = 'phrase'; L.phrase = vxPick(VX_LORE); L.until = now + vxR(500, 2800);
          set(L, L.phrase, 'phrase');
          return;
        }
        if (Math.random() < 0.6) set(L, vxNoise(), 'noise');
      });
    };
    const id = setInterval(tick, 120);
    tick();
    return wrap;
  }

  function openVortexHack() {
    if (!vxDlg) {
      vxDlg = h('dialog', 'vxhack');
      vxDlg.setAttribute('aria-labelledby', 'vx-title');
      document.body.append(vxDlg);
    }
    const on = themeState.active === 'vortice';
    const LINES = [
      '> conectando a github.com/joti-nha/Vortex_aplication ...',
      '> acesso: NEGADO',
      '> acesso: ... concedido?',
      '> abrindo horizonte_de_eventos.log',
      '> aviso: quanto mais tempo aberto, mais a interface apodrece. Os dados ficam intactos.'
    ];
    const sw = h('button', 'vxhack__switch', h('span', 'vxhack__knob'), h('span', 'vxhack__state', on ? 'VÓRTEX ATIVO' : 'ATIVAR VÓRTEX'));
    sw.type = 'button';
    sw.dataset.fid = 'vx-switch';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', String(on));
    sw.addEventListener('click', () => {
      if (themeState.active === 'vortice') { applyTheme(''); toast('O vórtex se fechou. Tema Vortex de volta.'); openVortexHack(); return; }
      closeDialog(vxDlg);
      chooseVortex().then((go) => { if (go) unlockTheme('vortice'); });
    });
    const close = h('button', 'vxhack__close', 'sair');
    close.type = 'button';
    close.dataset.fid = 'vx-close';
    close.addEventListener('click', () => closeDialog(vxDlg));
    vxDlg.replaceChildren(h('div', 'vxhack__screen',
      h('div', 'vxhack__hole', h('span'), h('span'), h('span')),
      h('div', 'vxhack__term',
        h('p', 'vxhack__top', h('span', '', 'root@vortex:~'), close),
        h('h2', 'vxhack__title', 'HORIZONTE DE EVENTOS'),
        ...LINES.map((t, i) => { const p = h('p', 'vxhack__line' + (t.charAt(0) === '>' ? ' is-cmd' : ''), t); p.style.animationDelay = (0.25 + i * 0.32) + 's'; return p; }),
        vxProse(sw, 0.25 + LINES.length * 0.32))));
    $('.vxhack__title', vxDlg).id = 'vx-title';
    if (!vxDlg.open) { openDialog(vxDlg); vxMaybeScare(0.25); }
  }

  /* Lista do banco na Oficina: só itens. Espécimes, poderes, origens e builds ficam no catálogo da tela Personagens */
  const NON_ITEM_KINDS = ['especime', 'poder', 'origem', 'build', 'npc'];
  const ITEM_KINDS = ITEM_DATA.categories.map((c) => c.id).filter((k) => NON_ITEM_KINDS.indexOf(k) < 0);
  let libSeq = 0;
  async function runLib() {
    const seq = ++libSeq;
    const q = $('#lib-q').value;
    const kind = $('#lib-kind').value;
    let list;
    try { list = await libSearch(kind ? [kind] : ITEM_KINDS, q); }
    catch (err) { if (seq === libSeq) $('#lib-hint').textContent = errorMessage(err); return; }
    if (seq !== libSeq) return;
    const favs = favLoad();
    if ($('#lib-fav').checked) list = list.filter((e) => favs.has(e.id));
    if ($('#lib-mine').checked) list = list.filter((e) => e.mine);
    list = libFacets.apply(list, kind ? [kind] : ITEM_KINDS);
    const suggest = list.length ? '' : libSearch.suggest;
    if (!hasQuery(q)) list.sort((a, b) => (Number(b.mine) - Number(a.mine)) || (Number(Boolean(a.oficial)) - Number(Boolean(b.oficial))) || a.name.localeCompare(b.name, 'pt-BR'));
    const secret = secretHit(q);
    $('#lib-list').replaceChildren(...(secret ? [secretRow(secret)] : []), ...list.map((e) => {
      const actions = [{ label: 'Usar de base', onClick: () => openForm(e.kind, e.typeId, Object.assign(deep(e), { id: null, name: e.name + ' (cópia)' })) }];
      if (e.mine) {
        actions.unshift({ label: 'Editar', onClick: () => openForm(e.kind, e.typeId, e) });
        actions.push({
          label: 'Excluir', cls: 'btn--danger', onClick: async () => {
            const ok = await askConfirm({ title: 'Excluir ' + e.name + '?', text: 'Sai do banco para todos. O que já está em fichas e em outros itens continua lá.', ok: 'Excluir' });
            if (!ok) return;
            try { await db.deleteLibrary(e.id); toast(e.name + ' foi excluído.'); runLib(); }
            catch (err) { toast(errorMessage(err)); }
          }
        });
      }
      return libRow(e, actions, () => { if ($('#lib-fav').checked) runLib(); });
    }));
    $('#lib-empty').hidden = list.length > 0 || Boolean(secret);
    suggestAfter($('#lib-list'), secret ? '' : suggest, $('#lib-q'), runLib);
    $('#lib-hint').textContent = libSearch.warn
      ? plural(list.length, 'registro', 'registros') + ' do catálogo oficial. O banco compartilhado não abriu: ' + libSearch.warn
      : plural(list.length, 'registro', 'registros') + (db.mode === 'firebase' ? ' (banco compartilhado + catálogo oficial).' : ' (este aparelho + catálogo oficial).');
  }
  $('#lib-q').addEventListener('input', debounce(runLib, 300));
  const libFacets = facetBox(() => runLib());
  $('#lib-hint').before(libFacets.box);
  $('#lib-kind').addEventListener('change', () => { libFacets.reset(); runLib(); });
  ['#lib-fav', '#lib-mine'].forEach((sel) => $(sel).addEventListener('change', runLib));
  (function fillLibKinds() {
    const sel = $('#lib-kind');
    const all = h('option', '', 'Todas');
    all.value = '';
    sel.append(all);
    ITEM_DATA.categories.filter((c) => ITEM_KINDS.indexOf(c.id) >= 0).forEach((c) => { const o = h('option', '', c.title); o.value = c.id; sel.append(o); });
  })();

  /* Catálogo na tela Personagens: ver todas as origens, espécimes, poderes e itens, só leitura */
  const CAT_GROUPS = [
    { label: 'Origens', kinds: ['origem'] },
    { label: 'Espécimes', kinds: ['especime'] },
    { label: 'Builds', kinds: ['build'] },
    { label: 'Poderes', kinds: ['poder'] },
    { label: 'Armas', kinds: ['arma-melee', 'arma-fogo'] },
    { label: 'Munições', kinds: ['municao'] },
    { label: 'Proteção', kinds: ['armadura', 'vestivel'] },
    { label: 'Implantes', kinds: ['nucleo', 'protese-modulo'] },
    { label: 'Peças de slot', kinds: ['mod-arma', 'propriedade', 'acessorio'] },
    { label: 'Itens gerais', kinds: ['item-geral'] },
    { label: 'NPCs e inimigos', kinds: ['npc'] },
    { label: 'Tudo', kinds: null }
  ];
  const catState = { group: null, seq: 0 };
  async function runCatalog() {
    const seq = ++catState.seq;
    const q = $('#cat-q').value.trim();
    const g = catState.group;
    if (!g && !q) {
      $('#cat-list').replaceChildren();
      $('#cat-empty').hidden = true;
      $('#cat-hint').textContent = '';
      catFacets.box.hidden = true;
      return;
    }
    $('#cat-hint').textContent = 'Buscando...';
    let list = await libSearch(g ? g.kinds : null, q);
    if (seq !== catState.seq) return;
    const suggest = list.length ? '' : libSearch.suggest;
    list = catFacets.apply(list, g && g.kinds ? g.kinds : ITEM_DATA.categories.map((c) => c.id));
    if (!hasQuery(q)) list.sort((a, b) => (a.kindTitle || '').localeCompare(b.kindTitle || '', 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));
    const secret = secretHit(q);
    $('#cat-list').replaceChildren(...(secret ? [secretRow(secret)] : []), ...list.map((e) => libRow(e, e.mine ? [{ label: 'Editar', onClick: () => { openForm(e.kind, e.typeId, e); go('itens'); } }] : [])));
    $('#cat-empty').hidden = list.length > 0 || Boolean(secret);
    suggestAfter($('#cat-list'), secret ? '' : suggest, $('#cat-q'), runCatalog);
    $('#cat-hint').textContent = plural(list.length, 'registro', 'registros') + (g ? ' em ' + g.label : '') + (q ? ' para "' + q + '"' : '') + '.'
      + (libSearch.warn ? ' O banco compartilhado não abriu: ' + libSearch.warn : '');
  }
  (function fillCatChips() {
    $('#cat-chips').replaceChildren(...CAT_GROUPS.map((g) => {
      const b = h('button', 'chip chip--toggle', g.label);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => {
        catState.group = catState.group === g ? null : g;
        catFacets.reset();
        $$('#cat-chips .chip--toggle').forEach((x) => x.setAttribute('aria-pressed', String(x === b && catState.group === g)));
        runCatalog();
      });
      return b;
    }));
  })();
  const catFacets = facetBox(() => runCatalog());
  catFacets.box.hidden = true;
  $('#cat-hint').before(catFacets.box);
  $('#cat-q').addEventListener('input', debounce(runCatalog, 300));

  // Itens da versão anterior (salvos só neste aparelho): entram no banco uma única vez
  async function migrateOldItems() {
    const KEY = 'vortex.items.v1';
    let old;
    try { old = JSON.parse(localStorage.getItem(KEY)); } catch (e) { old = null; }
    if (!Array.isArray(old) || !old.length) return;
    try {
      for (const it of old.slice().reverse()) {
        const cat = findCategory(it.categoryId);
        if (!cat) continue;
        const type = findType(cat, it.typeId);
        const v = Object.assign({}, it.values || {});
        delete v.nome;
        if (v.modificador) { v.especial = [v.especial, 'Modificador (versão antiga): ' + v.modificador].filter(Boolean).join('\n'); }
        delete v.modificador;
        await db.saveLibrary({
          kind: cat.id, typeId: type ? type.id : '', typeTitle: type ? type.title : '', kindTitle: cat.title,
          name: cleanName(it.name || 'Sem nome').slice(0, 60), values: v, bonus: {}, slots: cat.slots ? normSlots(null) : {}, image: '', thumb: ''
        });
      }
      localStorage.removeItem(KEY);
    } catch (e) { console.warn('Itens antigos ainda não migrados:', e); }
  }

  views.itens = async function showItens() {
    renderCategoryGrid();
    setItemStep(itemState.draft && itemState.step === 'form' ? 'form' : 'categoria');
    await runLib();
  };

  /* ---------- Ficha ----------
     Tudo o que é de regra (atributos, perícias, recursos, poderes, inventário)
     fica em sheetChar.sheet e é salvo de uma vez. Os recursos nunca são digitados:
     saem dos atributos + espécime + poderes + itens equipados (função compute). */
  const ATTRS = [
    { id: 'corpo', label: 'Corpo', hint: 'Força, vitalidade, combate físico e resistência física.' },
    { id: 'precisao', label: 'Precisão', hint: 'Mira, controle de armas, tecnologia prática.' },
    { id: 'essencia', label: 'Essência', hint: 'Energia interior, tecnomancia, vontade e presença.' }
  ];
  const SKILLS = {
    corpo: [['luta', 'Luta'], ['resistencia', 'Resistência'], ['atletismo', 'Atletismo'], ['fortitude', 'Fortitude']],
    precisao: [['mira', 'Mira'], ['tecnologia', 'Tecnologia'], ['iniciativa', 'Iniciativa'], ['manha', 'Manha'], ['pilotagem', 'Pilotagem'], ['intelecto', 'Intelecto'], ['reflexos', 'Reflexos'], ['oficio', 'Ofício']],
    essencia: [['operacoes', 'Operações'], ['sentidos', 'Sentidos'], ['vontade', 'Vontade'], ['intimidacao', 'Intimidação'], ['diplomacia', 'Diplomacia'], ['enganacao', 'Enganação']]
  };
  const PENALTY_SKILLS = ['manha', 'reflexos', 'sentidos', 'operacoes']; // sofrem a penalidade da armadura
  const LIFE = [['pv', 'PV'], ['blindagem', 'Blindagem'], ['escudo', 'Escudo']]; // de dentro para fora

  function blankSheet() {
    return {
      v: 2, setup: false, attrs: { corpo: 0, precisao: 0, essencia: 0 }, skills: {}, profs: [], oficio: '', height: '', weight: '', sex: '',
      xp: 0, upExtra: 0, up: { pv: 0, pe: 0, pa: 0, per: 0 }, extra: { pv: 0, escudo: 0, blindagem: 0, pe: 0, pa: 0, carga: 0, armadura: 0 }, attrMod: { corpo: 0, precisao: 0, essencia: 0 }, upAttr: { corpo: 0, precisao: 0, essencia: 0 },
      cur: {}, specimen: null, powers: [], inventory: [], originItems: '', doutor: [], upProfs: []
    };
  }
  // atributo efetivo: o da ficha + o ajuste manual (bônus ou penalidade temporária)
  // atributo efetivo: o da ficha + o +1 dos UP (a cada 4) + o ajuste manual
  const attrOf = (s, id) => num(s.attrs[id]) + num((s.upAttr || {})[id]) + num((s.attrMod || {})[id]);
  /* perícias dadas pela espécime (script "pericia:"): somam por fora dos pontos da ficha, até o limite da perícia;
     o que passar do limite vira ponto livre para investir em outra perícia */
  function skillGrant(s) {
    const give = sheetMech(s).skills || {};
    const grant = {};
    let over = 0;
    Object.keys(give).forEach((k) => {
      const g = Math.min(give[k], Math.max(0, skillCap(s, k) - num(s.skills[k])));
      if (g > 0) grant[k] = g;
      over += give[k] - g;
    });
    return { grant, over };
  }
  const skillOf = (s, id) => num(s.skills[id]) + (skillGrant(s).grant[id] || 0);
  const attrUpUsed = (s) => ['corpo', 'precisao', 'essencia'].reduce((t, k) => t + Math.max(0, Math.round(num((s.upAttr || {})[k]))), 0);
  function normSheet(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const b = blankSheet();
    const s = Object.assign({}, b, r);
    ['attrs', 'attrMod', 'upAttr', 'up', 'extra', 'skills', 'cur'].forEach((k) => { s[k] = Object.assign({}, b[k], r[k] && typeof r[k] === 'object' ? r[k] : {}); });
    s.powers = Array.isArray(r.powers) ? r.powers.slice() : [];
    s.hideAlerts = r.hideAlerts && typeof r.hideAlerts === 'object' ? Object.assign({}, r.hideAlerts) : {};
    s.profs = Array.isArray(r.profs) ? r.profs.filter((x) => typeof x === 'string') : [];
    // compras de 1 UP: Doutor (limite 4 numa perícia) e proficiências extras
    s.doutor = Array.isArray(r.doutor) ? r.doutor.filter((x) => typeof x === 'string') : [];
    s.upProfs = Array.isArray(r.upProfs) ? r.upProfs.filter((x) => typeof x === 'string') : [];
    // Doutor e as proficiências compradas são poderes; fichas antigas guardavam em listas à parte
    s.doutor.map((id) => ['of-pod-doutor', id]).concat(s.upProfs.map((id) => [id.indexOf('armadura-') === 0 ? 'of-pod-prof-armadura' : 'of-pod-prof-arma', id])).forEach((x) => {
      if (s.powers.some((p) => p.id === x[0] && p.choice === x[1])) return;
      const e = BUILTINS.find((b) => b.id === x[0]);
      if (e) s.powers.push(choicePower(e, x[1]));
    });
    s.doutor = [];
    s.upProfs = [];
    // poder Luta: o texto e as tabelas vêm sempre do oficial (cópias antigas traziam a melhoria "Ataque extra", que saiu);
    // estilo de luta ou variante (Tecnomancia): um só por ficha em cada poder
    const lutaOff = BUILTINS.find((b) => b.id === 'of-pod-luta');
    const styled = {};
    s.powers = s.powers.map((p) => {
      if (!p || !p.id) return p;
      let q = p;
      if (p.id === 'of-pod-luta') { q = Object.assign({}, p, { ups: {} }); if (lutaOff) q.values = Object.assign({}, p.values, lutaOff.values); }
      if (q.estilo && (styled[q.id] || !styleOf(q))) { q = Object.assign({}, q); delete q.estilo; }
      if (q.estilo) styled[q.id] = true;
      return q;
    });
    s.inventory = (Array.isArray(r.inventory) ? r.inventory : []).map((i) => Object.assign({ qty: 1, slot: '', values: {}, bonus: {} }, i, { uid: i.uid || uid(), slots: normSlots(i.slots) }));
    // fichas da versão anterior marcavam só "equipado": cada item vai para o primeiro espaço livre que o aceite
    s.inventory.forEach((i) => {
      const was = i.equipped === true && !i.slot;
      delete i.equipped;
      if (i.slot && slotsFor(i).indexOf(i.slot) < 0) i.slot = '';
      if (!was) return;
      const free = slotsFor(i).find((id) => id === 'modulo' || !s.inventory.some((x) => x.slot === id));
      if (free && !(free === 'mao-e' && s.inventory.some((x) => x.slot === 'mao-d' && twoHanded(x)))) i.slot = twoHanded(i) && free === 'mao-e' ? '' : free;
    });
    s.v = 2;
    return s;
  }

  function originsFromRules() {
    const ch = ((window.VORTEX_REGRAS && window.VORTEX_REGRAS.chapters) || []).find((c) => c.id === 'origens');
    if (!ch) return [];
    return ch.blocks.filter((b) => b[0] === 'card').map((b) => ({
      name: b[1],
      text: (b[2].find((x) => x[0] === 'p') || [])[1] || '',
      items: (b[2].find((x) => x[0] === 'ul') || [])[1] || []
    }));
  }
  const ORIGINS = originsFromRules();
  // origem vinda do banco (inclusive as criadas na Oficina): itens iniciais, um por linha
  const bankOrigin = (e) => ({ name: e.name, text: (e.values || {}).descricao || '', items: String((e.values || {}).itens || '').split('\n').map((t) => t.trim()).filter(Boolean) });
  const originOf = (name) => ORIGINS.find((o) => nameKey(o.name) === nameKey(name))
    || (wz && wz.originEntry && nameKey(wz.originEntry.name) === nameKey(name) ? wz.originEntry : null);

  function quickEntry2(name, carga, efeito) {
    return {
      uid: uid(), id: '', kind: 'item-geral', typeId: '', typeTitle: '', name: cleanName(name).slice(0, 60),
      values: { carga: carga ? String(carga) : '', efeito: efeito || '' }, bonus: {}, slots: normSlots(null), thumb: '', qty: 1, slot: ''
    };
  }
  function originItemEntry(text) {
    const clean = String(text).replace(/[;.]\s*$/, '').replace(/^1\s+/, '');
    const cut = clean.indexOf(' (');
    const name = cut > 0 ? clean.slice(0, cut) : clean;
    const m = clean.match(/(\d+\/\d+|\d+(?:[.,]\d+)?)\s*carga\)/i);
    return quickEntry2(name.charAt(0).toUpperCase() + name.slice(1), m ? fmtNum(parseCarga(m[1])) : '', cut > 0 ? clean.slice(cut + 2).replace(/\)$/, '') : '');
  }

  // bônus de um item: o dele + os dos mods e propriedades encaixados
  function entryBonus(e) {
    const out = {};
    const add = (b) => { if (b) BONUS_KEYS.forEach((k) => { if (num(b[k[0]])) out[k[0]] = (out[k[0]] || 0) + num(b[k[0]]); }); };
    add(e.bonus);
    if (e.slots) (e.slots.mods || []).concat(e.slots.props || []).forEach((x) => add(x.bonus));
    return out;
  }

  const PROFS = ITEM_DATA.proficiencias || [];
  const ARMOR_BASE = ITEM_DATA.armaduraBase === undefined ? 6 : ITEM_DATA.armaduraBase;
  function profIdOf(i) { // a proficiência que vale para este item
    if (i.kind === 'armadura') return i.typeId ? 'armadura-' + i.typeId : '';
    if (isWeapon(i.kind)) { const t = findType(findCategory(i.kind), i.typeId); return t ? (t.prof || t.id) : ''; }
    return '';
  }
  /* Poder-lista e melhorias. Um poder-lista (Defensivas, Ataques) tem opções que afetam a mesma
     coisa de jeitos diferentes: cada opção comprada custa o custo do poder. Melhorias somam ao poder.
     Os dois vêm em texto, uma por linha: "Nome | efeito | custo". */
  const powerLines = (txt) => String(txt || '').split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((x) => x[0])
    .map((x) => ({ name: x[0].slice(0, 60), text: x[1] || '', cost: x[2] || '', script: x.slice(3).join('|') }));
  const powerOpts = (p) => powerLines(p.values && p.values.opcoes);
  const powerUps = (p) => powerLines(p.values && p.values.melhorias);
  const powerPicks = (p) => { const names = powerOpts(p).map((o) => o.name); return (p.picks || []).filter((n) => names.indexOf(n) >= 0); };
  const peCost = (txt) => { const m = /(\d+)\s*pe\b/i.exec(String(txt || '')); return m ? Number(m[1]) : 0; };
  const upCount = (p, name) => Math.max(0, Math.round(num((p.ups || {})[name])));
 /* Estilos de um poder, um por ficha: os estilos de luta (Berserker, Armetista, Renegado) e as variantes da
     Tecnomancia. A lista vem do poder oficial ("Nome | resumo | custo"); passivas e técnicas, do capítulo de regras.
     O custo soma ao custo do poder. */
  const powerStyles = (p) => {
    const off = p && p.id ? BUILTINS.find((b) => b.id === p.id) : null;
    const more = (((window.VORTEX_REGRAS || {}).estilos || {})[p && p.id]) || [];
    return powerLines(off && off.values && off.values.estilos)
      .map((l) => Object.assign({ cost: num(l.cost) }, more.find((e) => e.name === l.name) || {}, { name: l.name, resumo: l.text }));
  };
  const styleLabel = (p) => { const off = p && p.id ? BUILTINS.find((b) => b.id === p.id) : null; return (off && off.values && off.values.estiloRotulo) || 'Estilo (um por ficha)'; };
  const styleOf = (p) => (p && p.estilo ? powerStyles(p).find((e) => e.name === p.estilo && !e.pendente) || null : null);
  // Tecnomancia: o nível é o número de tipos de ação comprados; é também o limite de efeitos ao mesmo tempo
  const tecnoLevel = (p) => (p && p.id === 'of-pod-tecnomancia' ? powerPicks(p).length : 0);
  // Engenheiro: uma lista de componentes por nível ("" = ainda não escolhida); repetir uma lista é permitido
  const tecnoLists = () => (window.VORTEX_REGRAS || {}).tecnoListas || [];
  const tecnoPicks = (p) => { const n = tecnoLevel(p); const l = Array.isArray(p.listas) ? p.listas : []; return Array.from({ length: n }, (_, k) => (tecnoLists().some((x) => x[0] === l[k]) ? l[k] : '')); };
  function powerUpCost(p) {
    const custo = num(p.values && p.values.custo);
    const base = (powerOpts(p).length ? custo * powerPicks(p).length : custo) + (styleOf(p) ? styleOf(p).cost : 0);
    return base + powerUps(p).reduce((t, u) => t + (u.cost === '' ? 1 : num(u.cost)) * upCount(p, u.name), 0);
  }

  /* Script dos poderes: a mecânica que antes ficava no espécime (vida base, UP iniciais, núcleo, ser orgânico
     ou eletrônico, bônus). Uma linha por regra, "chave: valor"; flags valem sozinhas ("acopla"). */
  const SCRIPT_FLAGS = { acopla: 'acopla', engenharia: 'acopla', humanidade: 'humanidade', organico: 'humanidade', eletronico: 'eletronico', eletrico: 'eletronico' };
  const SCRIPT_HELP = [
    ['vida: Blindagem', 'os PV viram Blindagem (ou Escudo, ou PV)'],
    ['up: 3', 'UP iniciais'],
    ['nucleo: 2', 'núcleo de nascença (capacidade)'],
    ['acopla', 'Engenharia: armas e armaduras acopladas ocupam a Carga Cibernética'],
    ['humanidade', 'testes contra efeitos de PE com CD; metade da Blindagem/Escudo regenera como PV'],
    ['eletronico', 'ser eletrônico: efeitos de PE atordoam'],
    ['pv: 5', 'bônus fixo (também pe, pa, escudo, blindagem, carga, armadura)'],
    ['deslocamento: 3', 'metros a mais de deslocamento (o padrão é 9 m)'],
    ['pericia: Reflexos +1', 'perícia de graça; se passar do limite, vira um ponto livre para outra perícia']
  ];
  function parseScript(txt) {
    const out = { vida: '', up: 0, nucleo: 0, desloc: 0, skills: {}, acopla: false, humanidade: false, eletronico: false, bonus: {}, bad: [] };
    String(txt || '').split(/[\n;]/).forEach((raw) => {
      const line = raw.replace(/\/\/.*$|#.*$/, '').trim();
      if (!line) return;
      const i = line.search(/[:=]/);
      const key = nameKey(i < 0 ? line : line.slice(0, i)).replace(/\s+/g, '');
      const val = i < 0 ? '' : line.slice(i + 1).trim();
      const no = /^(nao|não|false|0)$/i.test(val);
      if (SCRIPT_FLAGS[key]) { out[SCRIPT_FLAGS[key]] = !no; return; }
      if (key === 'vida' || key === 'vidabase') {
        const v = (ITEM_DATA.vidaBase || ['PV', 'Blindagem', 'Escudo']).find((x) => nameKey(x) === nameKey(val));
        if (v) out.vida = v; else out.bad.push(raw.trim());
        return;
      }
      if (key === 'pericia' || key === 'pericias') { // "pericia: Reflexos +1, Sentidos"
        const parts = val.split(',').map((x) => /^(.+?)\s*(?:\+\s*(\d+))?$/.exec(x.trim())).filter(Boolean);
        if (!parts.length) { out.bad.push(raw.trim()); return; }
        parts.forEach((p) => { const id = skillIdOf(p[1]); if (!id) { out.bad.push(raw.trim()); return; } out.skills[id] = (out.skills[id] || 0) + Number(p[2] || 1); });
        return;
      }
      const n = Number(val.replace(',', '.'));
      if (val === '' || !isFinite(n)) { out.bad.push(raw.trim()); return; }
      if (key === 'up' || key === 'ups' || key === 'upinicial' || key === 'upiniciais') out.up += Math.round(n);
      else if (key === 'nucleo' || key === 'nucleobase') out.nucleo = Math.max(out.nucleo, Math.round(n));
      else if (key === 'deslocamento' || key === 'desloc' || key === 'movimento') out.desloc += n;
      else if (BONUS_KEYS.some((b) => b[0] === key)) out.bonus[key] = (out.bonus[key] || 0) + n;
      else out.bad.push(raw.trim());
    });
    return out;
  }
  // o script de um poder na ficha: o da cópia, ou o do poder oficial (fichas antigas não têm o script)
  function powerScript(p) {
    const v = (p && p.values) || {};
    const off = !v.script && p && p.id ? BUILTINS.find((e) => e.id === p.id) : null;
    const base = v.script || (off && off.values ? off.values.script || '' : '');
    if (!p) return base;
    // as opções compradas e as melhorias carregam o script do poder de onde vieram
    const extra = [];
    powerOpts(p).forEach((o) => { if (o.script && powerPicks(p).indexOf(o.name) >= 0) extra.push(o.script); });
    powerUps(p).forEach((u) => { for (let n = upCount(p, u.name); u.script && n > 0; n--) extra.push(u.script); });
    return [base].concat(extra).filter(Boolean).join('\n');
  }
  // espécimes criados antes do script guardam a mecânica em campos próprios: continuam valendo
  function legacySpecies(v) {
    const out = parseScript('');
    if (!v) return out;
    if (v.vidaBase && v.vidaBase !== 'PV') out.vida = v.vidaBase;
    out.up = Math.round(num(v.upInicial));
    out.nucleo = Math.round(num(v.nucleoBase));
    out.acopla = v.acopla === 'Sim';
    out.humanidade = v.humanidade === 'Sim';
    out.eletronico = v.eletronico === 'Sim';
    return out;
  }
  function mergeMech(list) {
    const m = { vida: 'PV', up: 0, nucleo: 0, desloc: 0, skills: {}, acopla: false, humanidade: false, eletronico: false };
    list.forEach((x) => {
      if (x.vida) m.vida = x.vida;
      m.up += x.up;
      m.nucleo = Math.max(m.nucleo, x.nucleo);
      m.desloc += x.desloc || 0;
      Object.keys(x.skills || {}).forEach((k) => { m.skills[k] = (m.skills[k] || 0) + x.skills[k]; });
      ['acopla', 'humanidade', 'eletronico'].forEach((k) => { if (x[k]) m[k] = true; });
    });
    return m;
  }
  const mechLine = (m) => ['Vida base ' + m.vida, m.up + ' UP iniciais', m.nucleo ? 'núcleo +' + m.nucleo : '', m.desloc ? signed(m.desloc) + ' m de deslocamento' : '', Object.keys(m.skills).map((k) => '+' + m.skills[k] + ' em ' + skillLabel(k)).join(', '), m.acopla ? 'acopla armas e armaduras' : '', m.humanidade ? 'Humanidade' : '', m.eletronico ? 'eletrônico' : ''].filter(Boolean).join(' · ');

  /* Poderes com escolha: Doutor (uma perícia) e Proficiência em arma ou armadura (um tipo).
     Cada compra é um poder na lista, com a escolha guardada em choice. */
  const CHOICE_POWERS = { 'of-pod-doutor': 'pericia', 'of-pod-prof-arma': 'arma', 'of-pod-prof-armadura': 'armadura' };
  const choicesOf = (s, pid) => (s.powers || []).filter((p) => p.id === pid && p.choice).map((p) => p.choice);
  const doutorOf = (s) => choicesOf(s, 'of-pod-doutor');
  const upProfsOf = (s) => choicesOf(s, 'of-pod-prof-arma').concat(choicesOf(s, 'of-pod-prof-armadura'));
  const choiceLabel = (pid, id) => (CHOICE_POWERS[pid] === 'pericia' ? SKILL_LABEL[id] || id : profLabel(id));
  const choicePower = (e, choice) => Object.assign(slotSnap(e), { thumb: e.thumb || '', choice, name: e.name + ': ' + choiceLabel(e.id, choice) });
  const hasProf = (s, id) => s.profs.indexOf(id) >= 0 || upProfsOf(s).indexOf(id) >= 0;
  const isProficient = (s, i) => { const id = profIdOf(i); return Boolean(id) && hasProf(s, id); };
  const skillCap = (s, id) => (doutorOf(s).indexOf(id) >= 0 ? 4 : 3);
  const ccOf = (i) => (i.values.cc === '' || i.values.cc === undefined ? 1 : num(i.values.cc));
  const isModule = (i) => i.kind === 'protese-modulo' && i.values.classe === 'Módulo';
  const twoHanded = (i) => /duas/i.test(String((i.values && i.values.empunhadura) || ''));

  function compute(c) {
    const s = c.sheet;
    const a = { corpo: attrOf(s, 'corpo'), precisao: attrOf(s, 'precisao'), essencia: attrOf(s, 'essencia') };
    const sp = s.specimen;
    const spv = specimenVals(s);
    const mech = sheetMech(s);
    const equipped = s.inventory.filter((i) => i.slot);
    const armor = equipped.find((i) => i.slot === 'armadura');
    const core = equipped.find((i) => i.slot === 'nucleo');

    // núcleo: só um ativo (o da espécie, o implantado ou o da armadura; vale o maior)
    const nucleo = Math.max(mech.nucleo, core ? num(core.values.capacidade) : 0, armor && armor.values.nucleo === 'Sim' ? num(armor.values.capacidade) : 0);
    const implants = equipped.filter((i) => i.kind === 'protese-modulo');
    const protUsed = implants.filter((i) => !isModule(i)).reduce((t, i) => t + ccOf(i), 0);
    const modUsed = implants.filter(isModule).reduce((t, i) => t + ccOf(i), 0);
    // Engenharia (ex.: Android): armas e armadura acopladas ocupam a Carga Cibernética, não a carga,
    // e o núcleo dá +1 de CC a cada +2 de carga que concede
    const acopla = mech.acopla;
    const attached = acopla ? equipped.filter((i) => isWeapon(i.kind) || i.kind === 'armadura') : [];
    const attachUsed = Math.round(attached.reduce((t, i) => t + parseCarga(i.values.carga), 0) * 100) / 100;
    const coreCarga = acopla && core ? num(entryBonus(core).carga) : 0;
    const ccMax = nucleo > 0 ? Math.max(0, nucleo + a.corpo) + (acopla ? Math.floor(Math.max(0, coreCarga) / 2) : 0) : 0;
    const modExtra = nucleo > 0 ? Math.max(0, a.essencia) : 0;

    const sources = [];
    if (sp) sources.push({ name: sp.name, b: sp.bonus || {} });
    s.powers.forEach((p) => sources.push({ name: p.name, b: p.bonus || {} }));
    mech.bonus.forEach((x) => sources.push(x));
    // sem núcleo, próteses só substituem o órgão e módulos ficam inativos: não dão bônus
    equipped.forEach((i) => { if (i.kind !== 'protese-modulo' || nucleo > 0) sources.push({ name: i.name, b: entryBonus(i) }); });
    sources.push({ name: 'ajuste manual', b: s.extra });

    const src = { pv: [], escudo: [], blindagem: [], pe: [], pa: [], carga: [], armadura: [] };
    const total = (k) => src[k].reduce((t, x) => t + x.val, 0);
    const fromSources = (k) => sources.forEach((x) => { if (num(x.b[k])) src[k].push({ name: x.name, val: num(x.b[k]) }); });

    // vida: PV vem do Corpo; a espécie pode converter para Blindagem ou Escudo
    src.pv.push({ name: 'base (5 + Corpo × 5)', val: Math.max(5, 5 + a.corpo * 5) });
    if (s.up.pv) src.pv.push({ name: 'benefícios de UP', val: 5 * s.up.pv });
    ['pv', 'escudo', 'blindagem'].forEach(fromSources);
    const base = mech.vida === 'Blindagem' ? 'blindagem' : mech.vida === 'Escudo' ? 'escudo' : 'pv';
    if (base !== 'pv') {
      src[base].unshift({ name: 'PV convertidos (' + (mech.vidaFrom || 'espécime') + ')', val: total('pv') });
      src.pv = [];
    }

    src.pe.push({ name: 'base (5 + Essência × 5)', val: Math.max(5, 5 + a.essencia * 5) });
    if (s.up.pe) src.pe.push({ name: 'benefícios de UP', val: 5 * s.up.pe });
    fromSources('pe');
    src.pa.push({ name: 'base (Precisão, mínimo 1)', val: Math.max(1, a.precisao) });
    if (s.up.pa) src.pa.push({ name: 'benefícios de UP', val: s.up.pa });
    fromSources('pa');

    // Carga = 2 + (Corpo × 5) + Precisão + (Essência × 2)
    src.carga.push({ name: 'base', val: 2 }, { name: 'Corpo × 5', val: a.corpo * 5 }, { name: 'Precisão', val: a.precisao }, { name: 'Essência × 2', val: a.essencia * 2 });
    fromSources('carga');

    // armadura: a básica de todos os seres é 6; a vestida vale quando for maior. Proficiência: +1 de defesa
    const armorProf = armor ? isProficient(s, armor) : false;
    const worn = armor ? num(armor.values.armadura) + (armorProf ? 1 : 0) : 0;
    if (armor && worn >= ARMOR_BASE) src.armadura.push({ name: armor.name + (armorProf ? ' (+1 proficiência)' : ''), val: worn });
    else src.armadura.push({ name: 'armadura básica de todos os seres', val: ARMOR_BASE });
    fromSources('armadura');
    // penalidade: a da ficha vale para quem é proficiente; sem proficiência, dobra
    const pen = armor ? Math.abs(num(armor.values.penalidade)) * (armorProf ? 1 : 2) : 0;

    // carga usada: só o que está na mochila (itens equipados não ocupam carga)
    const cargaUsed = s.inventory.reduce((t, i) => (i.slot ? t : t + parseCarga(i.values.carga) * (i.qty || 1)), 0)


    const max = {};
    Object.keys(src).forEach((k) => { max[k] = Math.max(0, Math.round(total(k) * 100) / 100); });
    const powerCost = s.powers.reduce((t, p) => t + powerUpCost(p), 0);
    const upEarned = Math.floor(num(s.xp) / 10); // os de origem/espécie não contam para os benefícios
    return {
      max, src, base, pen, armor, armorProf, nucleo, core,
      cargaUsed: Math.round(cargaUsed * 100) / 100, cargaMax: max.carga, over: cargaUsed > max.carga,
      desloc: Math.max(0, 9 + mech.desloc) / (cargaUsed > max.carga ? 2 : 1), // sobrecarregado: metade
      defMin: max.armadura + a.corpo + num(s.skills.resistencia),
      ccMax, modExtra, protUsed, modUsed, acopla, attachUsed, humanidade: mech.humanidade, eletronico: mech.eletronico,
      ccOver: (nucleo > 0 || attachUsed > 0) && (protUsed + attachUsed > ccMax || protUsed + attachUsed + modUsed > ccMax + modExtra),
      upEarned, upTotal: upEarned + mech.up + num(s.upExtra),
      upSpent: s.up.per + powerCost,
      picksAllowed: 2 * Math.floor(upEarned / 2), picksUsed: s.up.pv + s.up.pe + s.up.pa,
      // +1 num atributo a cada 4 UP: vale o escolhido na Progressão e também o ponto posto direto na faixa
      // de atributos (o que passa dos 3 da distribuição inicial)
      attrAllowed: Math.floor(upEarned / 4), attrUsed: attrUpUsed(s) + (s.setup ? Math.max(0, -attrPool(s.attrs).left) : 0),
      skillBudget: 5 + Math.ceil(upEarned / 2) + 3 * s.up.per + upProfsOf(s).length + doutorOf(s).length + skillGrant(s).over, // Doutor e proficiências: +1 de perícia cada; perícia da espécime acima do limite vira ponto livre
      skillGrant: skillGrant(s).grant,
      skillUsed: Object.keys(s.skills).reduce((t, k) => t + num(s.skills[k]), 0)
    };
  }

  /* ---------- Builds guiadas ----------
     Folhas: o que comprar com cada UP, uma linha por UP ("3 | Poder: Ataques (Certeiro)"), ações separadas por ";".
     Ações: "Poder: Nome", "Poder: Nome (Opção)", "Melhoria: Nome", "Doutor: Perícia", "Proficiência: Tipo",
     "Perícias: Mira +2, Reflexos +1" (1 UP em perícias). Outro texto é um lembrete, feito à mão.
     Os benefícios dos UP pares e os pontos de perícia seguem as listas da build, em ordem.
     Com a atualização automática ligada, cada UP ganho aplica a folha dele (s.guide.done guarda as já feitas). */
  const guideCache = { powers: null };
  function guidePowers() { // poderes oficiais na hora; os do banco chegam depois
    if (!guideCache.powers) {
      guideCache.powers = BUILTINS.filter((e) => e.kind === 'poder');
      libSearch(['poder'], '').then((list) => { guideCache.powers = list; }).catch(() => { /* fica com os oficiais */ });
    }
    return guideCache.powers;
  }
  const findPower = (name) => guidePowers().find((e) => nameKey(e.name) === nameKey(name));
  const guideList = (txt) => String(txt || '').split(',').map((x) => x.trim()).filter(Boolean);
  function guideActions(text) {
    return String(text || '').split(';').map((t) => t.trim()).filter(Boolean).map((t) => {
      const m = /^([^:]+):\s*(.+)$/.exec(t);
      const kind = m ? nameKey(m[1]) : '';
      const arg = m ? m[2].trim() : t;
      if (kind === 'poder') { const o = /^(.+?)\s*\((.+)\)$/.exec(arg); return { type: 'poder', name: o ? o[1] : arg, opt: o ? o[2] : '', text: t }; }
      if (kind === 'melhoria') return { type: 'melhoria', name: arg, text: t };
      if (kind === 'doutor') return { type: 'doutor', id: skillIdOf(arg), text: t };
      if (kind === 'proficiencia') return { type: 'prof', id: profByLabel(arg), text: t };
      if (kind === 'atributo') { const at = ATTRS.find((x) => nameKey(x.label) === nameKey(arg.replace(/\s*\+?\s*1\s*$/, ''))); return { type: 'atributo', id: at ? at.id : '', text: t }; }
      if (kind === 'pericias' || kind === 'pericia') {
        const list = arg.split(',').map((x) => /^(.+?)\s*\+?(\d)?$/.exec(x.trim())).filter(Boolean).map((p) => [skillIdOf(p[1]), Number(p[2] || 1)]).filter((x) => x[0]);
        return { type: 'pericias', list, text: t };
      }
      return { type: 'nota', text: t };
    });
  }
  function guidePages(g) {
    const pages = {};
    String((g && g.folhas) || '').split('\n').forEach((l) => {
      const m = /^\s*(\d+)\s*\|\s*(.+)$/.exec(l);
      if (!m) return;
      pages[m[1]] = (pages[m[1]] ? pages[m[1]] + '; ' : '') + m[2].trim();
    });
    return Object.keys(pages).map(Number).sort((a, b) => a - b).map((n) => ({ n, text: pages[n], acts: guideActions(pages[n]) }));
  }
  const guideFrom = (e) => {
    const v = e.values || {};
    return { id: e.id || '', name: e.name, folhas: v.folhas || '', beneficios: v.beneficios || '', periciasUp: v.periciasUp || '', auto: true, done: [], miss: {} };
  };
  function applyGuideAction(s, a) { // true = aplicada
    if (a.type === 'poder') {
      const e = findPower(a.name);
      if (!e || CHOICE_POWERS[e.id]) return false; // Doutor e proficiências usam "Doutor:" e "Proficiência:"
      const opts = powerOpts(e);
      if (!opts.length) { s.powers.push(Object.assign(slotSnap(e), { thumb: e.thumb || '' })); return true; }
      const opt = a.opt ? opts.find((o) => nameKey(o.name) === nameKey(a.opt)) : opts[0];
      if (!opt) return false;
      const have = s.powers.find((p) => p.id === e.id && powerOpts(p).length);
      if (have) { if (powerPicks(have).indexOf(opt.name) < 0) have.picks = powerPicks(have).concat([opt.name]); return true; }
      s.powers.push(Object.assign(slotSnap(e), { thumb: e.thumb || '', picks: [opt.name] }));
      return true;
    }
    if (a.type === 'melhoria') {
      const k = nameKey(a.name);
      const hasUp = (x) => powerUps(x).some((u) => nameKey(u.name) === k);
      let p = s.powers.find(hasUp);
      if (!p) { const e = guidePowers().find(hasUp); if (!e) return false; p = Object.assign(slotSnap(e), { thumb: e.thumb || '' }); s.powers.push(p); }
      const u = powerUps(p).find((x) => nameKey(x.name) === k);
      p.ups = Object.assign({}, p.ups);
      p.ups[u.name] = upCount(p, u.name) + 1;
      return true;
    }
    if (a.type === 'doutor' || a.type === 'prof') {
      if (!a.id) return false;
      const pid = a.type === 'doutor' ? 'of-pod-doutor' : a.id.indexOf('armadura-') === 0 ? 'of-pod-prof-armadura' : 'of-pod-prof-arma';
      if (choicesOf(s, pid).indexOf(a.id) >= 0) return true;
      const e = BUILTINS.find((b) => b.id === pid);
      if (!e) return false;
      s.powers.push(choicePower(e, a.id));
      return true;
    }
    if (a.type === 'atributo') { // o +1 a cada 4 UP: só entra se a ficha já tiver direito a ele
      if (!a.id) return false;
      const m = compute({ sheet: s });
      if (attrUpUsed(s) >= m.attrAllowed) return false;
      s.upAttr = Object.assign({ corpo: 0, precisao: 0, essencia: 0 }, s.upAttr);
      s.upAttr[a.id] = num(s.upAttr[a.id]) + 1;
      return true;
    }
    if (a.type === 'pericias') {
      s.up.per += 1;
      a.list.forEach((x) => { s.skills[x[0]] = Math.min(skillCap(s, x[0]), num(s.skills[x[0]]) + x[1]); });
      return true;
    }
    return false;
  }
  function applyGuidePage(s, pg, auto) { // devolve o texto do que entrou
    const g = s.guide;
    const ok = [], miss = [];
    g.attrDone = Array.isArray(g.attrDone) ? g.attrDone : [];
    pg.acts.forEach((a) => {
      if (a.type === 'nota') return;
      if (a.type === 'atributo') { // na atualização automática o atributo espera a ficha ter direito (fila em guideSync)
        if (auto || g.attrDone.indexOf(pg.n) >= 0) return;
        if (applyGuideAction(s, a)) { g.attrDone.push(pg.n); ok.push(a.text); } else miss.push(a.text);
        return;
      }
      if (applyGuideAction(s, a)) ok.push(a.text); else miss.push(a.text);
    });
    if (g.done.indexOf(pg.n) < 0) g.done.push(pg.n);
    g.miss = Object.assign({}, g.miss);
    if (miss.length) g.miss[pg.n] = miss; else delete g.miss[pg.n];
    return ok;
  }
  // Atualização automática: folhas até o UP atual, benefícios e pontos de perícia livres. Devolve o que mudou.
  function guideSync(s) {
    const g = s.guide;
    if (!g || !g.auto) return [];
    g.done = Array.isArray(g.done) ? g.done : [];
    const out = [];
    let m = compute({ sheet: s });
    guidePages(g).forEach((pg) => {
      if (pg.n > m.upTotal || g.done.indexOf(pg.n) >= 0) return;
      const ok = applyGuidePage(s, pg, true);
      if (ok.length) out.push('UP ' + pg.n + ': ' + ok.join(', '));
    });
    // +1 de atributo das folhas: entra na ordem das folhas, assim que a ficha tiver direito (a cada 4 UP de XP)
    g.attrDone = Array.isArray(g.attrDone) ? g.attrDone : [];
    const atts = [];
    guidePages(g).forEach((pg) => { if (pg.n <= m.upTotal && g.attrDone.indexOf(pg.n) < 0) pg.acts.forEach((x) => { if (x.type === 'atributo' && x.id) atts.push([pg.n, x]); }); });
    const gotA = [];
    for (const [n, x] of atts) {
      if (!applyGuideAction(s, x)) break;
      g.attrDone.push(n);
      gotA.push((ATTRS.find((at) => at.id === x.id) || {}).label + ' +1');
    }
    if (gotA.length) out.push('atributo ' + gotA.join(', '));
    m = compute({ sheet: s });
    const ben = guideList(g.beneficios).map((x) => (/pv/i.test(x) ? 'pv' : /pe/i.test(x) ? 'pe' : /pa/i.test(x) ? 'pa' : '')).filter(Boolean);
    let picks = m.picksAllowed - m.picksUsed;
    const got = [];
    while (ben.length && picks > 0) {
      const k = ben[(s.up.pv + s.up.pe + s.up.pa) % ben.length];
      s.up[k] += 1;
      picks -= 1;
      got.push(k === 'pa' ? '+1 PA' : '+5 ' + k.toUpperCase());
    }
    if (got.length) out.push('benefícios ' + got.join(', '));
    m = compute({ sheet: s });
    const sk = guideList(g.periciasUp).map(skillIdOf).filter(Boolean);
    let free = m.skillBudget - m.skillUsed;
    const raised = [];
    for (let i = 0; sk.length && free > 0 && i < sk.length * 5; i++) {
      const id = sk[i % sk.length];
      if (num(s.skills[id]) >= skillCap(s, id)) continue;
      s.skills[id] = num(s.skills[id]) + 1;
      free -= 1;
      raised.push(SKILL_LABEL[id] || id);
    }
    if (raised.length) out.push('perícias +1 em ' + raised.join(', '));
    return out;
  }

  /* Dinheiro inicial pelos UP com que o personagem começa (tabela interna, items.js) */
  // todo personagem começa com o mesmo dinheiro, seja qual for o espécime ou os UP iniciais
  const START_CRONOS = Math.max(0, Math.round(num(ITEM_DATA.dinheiroInicial))) || 1500;

  /* ---------- Roteiro da build (modo avançado) ----------
     A build tem o nível 0 (a distribuição inicial) e, se quiser, um roteiro: escolha quantos UP e quanto
     dinheiro, e o roteiro vira um livrinho com uma folha por UP. Cada folha mostra o que aquele UP dá
     (1 UP para gastar, +1 ponto de perícia nos ímpares, 2 benefícios nos pares, +1 de atributo a cada 4) e guarda a escolha.
     O roteiro fica em values.roteiro (JSON) e também é escrito no texto das folhas, que a ficha já sabe aplicar. */
  const RT_KINDS = [['poder', 'Poder'], ['melhoria', 'Melhoria'], ['prof', 'Proficiência'], ['pericias', 'Perícias'], ['guardar', 'Guardar']];
  const RT_BEN = [['pv', '+5 PV'], ['pe', '+5 PE'], ['pa', '+1 PA']];
  const RT_MAX_UP = 30;
  const rtSkills = () => { const out = []; ATTRS.forEach((at) => SKILLS[at.id].forEach((sk) => out.push([sk[0], sk[1]]))); return out; };
  const rtPage = () => ({ gasto: null, ben: ['', ''], per: '', attr: '', nota: '' });
  const rtAttrPage = (n) => n % 4 === 0; // a cada 4 UP: +1 num atributo
  const rtNew = (up, money) => ({ v: 1, up, dinheiro: money, itens: [], pages: Array.from({ length: up }, rtPage) });
  function rtRead(values) { // JSON salvo, ou o texto antigo das folhas convertido
    const v = values || {};
    try {
      const r = JSON.parse(v.roteiro || '');
      if (r && Array.isArray(r.pages)) {
        r.pages = r.pages.map((p) => Object.assign(rtPage(), p, { ben: Array.isArray(p && p.ben) ? p.ben.slice(0, 2).concat(['', '']).slice(0, 2) : ['', ''] }));
        r.itens = Array.isArray(r.itens) ? r.itens : [];
        r.up = r.pages.length;
        r.dinheiro = START_CRONOS; // o mesmo dinheiro inicial para todos
        return r;
      }
    } catch (e) { /* sem roteiro salvo */ }
    const pages = guidePages(v);
    if (!pages.length) return null;
    const r = rtNew(Math.min(RT_MAX_UP, pages[pages.length - 1].n), START_CRONOS);
    pages.forEach((pg) => {
      const p = r.pages[pg.n - 1];
      if (!p) return;
      const notes = [];
      pg.acts.forEach((a) => {
        if (a.type === 'atributo') { if (a.id) p.attr = a.id; return; }
        if (p.gasto) { notes.push(a.text); return; }
        if (a.type === 'poder') { const e = findPower(a.name); if (e) p.gasto = { t: 'poder', id: e.id, name: e.name, opt: a.opt || '' }; else notes.push(a.text); }
        else if (a.type === 'melhoria') { const e = guidePowers().find((x) => powerUps(x).some((u) => nameKey(u.name) === nameKey(a.name))); if (e) p.gasto = { t: 'melhoria', id: e.id, name: a.name }; else notes.push(a.text); }
        else if (a.type === 'doutor' && a.id) p.gasto = { t: 'doutor', skill: a.id };
        else if (a.type === 'prof' && a.id) p.gasto = { t: 'prof', prof: a.id };
        else if (a.type === 'pericias' && a.list.length) { const list = {}; a.list.forEach((x) => { list[x[0]] = (list[x[0]] || 0) + x[1]; }); p.gasto = { t: 'pericias', list }; }
        else if (a.type === 'nota' && /guard/i.test(a.text)) p.gasto = { t: 'guardar' };
        else if (a.type === 'atributo' && a.id) p.attr = a.id;
        else notes.push(a.text);
      });
      p.nota = notes.join('; ');
    });
    const ben = guideList(v.beneficios).map((x) => (/pv/i.test(x) ? 'pv' : /pe/i.test(x) ? 'pe' : /pa/i.test(x) ? 'pa' : '')).filter(Boolean);
    r.pages.forEach((p, i) => { if ((i + 1) % 2 === 0) p.ben = [ben.shift() || '', ben.shift() || '']; });
    const sk = guideList(v.periciasUp).map(skillIdOf).filter(Boolean);
    r.pages.forEach((p, i) => { if ((i + 1) % 2 === 1) p.per = sk.shift() || ''; });
    r.itens = String(v.itens || '').split('\n').map((x) => x.trim()).filter(Boolean).map((name) => ({ id: '', name, price: 0 }));
    return r;
  }
  const rtPower = (id) => guidePowers().find((e) => e.id === id) || BUILTINS.find((e) => e.id === id) || null;
  function rtCost(g) { // UP que a escolha gasta
    if (!g) return 0;
    if (g.t === 'poder') { const e = rtPower(g.id); return e ? Math.max(0, num(e.values && e.values.custo)) : 1; }
    if (g.t === 'melhoria') { const e = rtPower(g.id); const u = e ? powerUps(e).find((x) => x.name === g.name) : null; return u && u.cost !== '' ? num(u.cost) : 1; }
    return g.t === 'guardar' ? 0 : 1;
  }
  function rtText(g) { // a linha da folha, no formato que a ficha aplica
    if (!g) return '';
    if (g.t === 'poder') return g.name ? 'Poder: ' + g.name + (g.opt ? ' (' + g.opt + ')' : '') : '';
    if (g.t === 'melhoria') return g.name ? 'Melhoria: ' + g.name : '';
    if (g.t === 'doutor') return g.skill ? 'Doutor: ' + skillLabel(g.skill) : '';
    if (g.t === 'prof') return g.prof ? 'Proficiência: ' + profLabel(g.prof) : '';
    if (g.t === 'pericias') { const k = Object.keys(g.list || {}).filter((x) => g.list[x] > 0); return k.length ? 'Perícias: ' + k.map((x) => skillLabel(x) + ' +' + g.list[x]).join(', ') : ''; }
    if (g.t === 'guardar') return 'Guardar este UP';
    return '';
  }
  // saldo de UP folha a folha: quanto há para gastar em cada uma e onde falta
  function rtLedger(r) {
    let bank = 0;
    return r.pages.map((p) => {
      bank += 1;
      const have = bank;
      const cost = rtCost(p.gasto);
      bank -= cost;
      return { have, cost, short: cost > have, left: bank };
    });
  }
  const rtItemsTotal = (r) => r.itens.reduce((t, x) => t + num(x.price), 0);
  function rtProblems(r) {
    const out = [];
    rtLedger(r).forEach((l, i) => { if (l.short) out.push('Folha ' + (i + 1) + ': custa ' + l.cost + ' UP e só há ' + l.have + '. Guarde UP nas folhas antes.'); });
    if (rtItemsTotal(r) > r.dinheiro) out.push('Os itens passam do dinheiro em ' + fmtCronos(rtItemsTotal(r) - r.dinheiro) + ' Cronos.');
    return out;
  }
  const rtFilled = (p, n) => Boolean(rtText(p.gasto)) && (n % 2 ? Boolean(p.per) : p.ben.every(Boolean)) && (!rtAttrPage(n) || Boolean(p.attr));
  const attrLabel = (id) => { const x = ATTRS.find((at) => at.id === id); return x ? x.label : id; };
  // grava o roteiro nos campos que a ficha e a distribuição inicial já leem
  function rtWrite(values, r) {
    if (!r) { values.roteiro = ''; values.folhas = ''; values.beneficios = ''; values.periciasUp = ''; values.itens = ''; values.dinheiro = ''; values.tipo = 'Entrada'; return; }
    values.roteiro = JSON.stringify(Object.assign({}, r, { setup: undefined }));
    values.folhas = r.pages.map((p, i) => {
      const parts = [rtText(p.gasto), rtAttrPage(i + 1) && p.attr ? 'Atributo: ' + attrLabel(p.attr) + ' +1' : '', p.nota.trim()].filter(Boolean);
      return parts.length ? (i + 1) + ' | ' + parts.join('; ') : '';
    }).filter(Boolean).join('\n');
    values.beneficios = r.pages.filter((p, i) => (i + 1) % 2 === 0).map((p) => p.ben).flat().filter(Boolean).map((k) => RT_BEN.find((b) => b[0] === k)[1]).join(', ');
    values.periciasUp = r.pages.filter((p, i) => (i + 1) % 2 === 1 && p.per).map((p) => skillLabel(p.per)).join(', ');
    values.itens = r.itens.map((x) => x.name).join('\n');
    values.dinheiro = String(r.dinheiro);
    values.tipo = 'Guiada';
  }

  function rtEntryRows(v) { // o roteiro na ficha do catálogo
    const r = rtRead(v);
    if (!r) return [];
    const rows = [['Roteiro', plural(r.up, 'folha', 'folhas') + ' · ' + fmtCronos(r.dinheiro) + ' Cronos para itens']];
    if (r.itens.length) rows.push(['Itens', r.itens.map((x) => x.name).join(', ')]);
    const lines = r.pages.map((p, i) => {
      const n = i + 1;
      const parts = [rtText(p.gasto), n % 2 ? (p.per ? 'ponto em ' + skillLabel(p.per) : '') : p.ben.filter(Boolean).map((k) => RT_BEN.find((b) => b[0] === k)[1]).join(', '),
        rtAttrPage(n) && p.attr ? attrLabel(p.attr) + ' +1' : '', p.nota].filter(Boolean);
      return parts.length ? 'UP ' + n + ': ' + parts.join(' · ') : '';
    }).filter(Boolean);
    if (lines.length) rows.push(['Folhas', lines.join('\n')]);
    return rows;
  }

  // campo do formulário da build: resumo do roteiro e o botão que abre o modo avançado
  function roteiroField(d, onDone) {
    const box = h('div', 'rt-field');
    const paint = () => {
      const r = rtRead(d.values);
      const open = h('button', 'btn ' + (r ? 'btn--ghost' : 'btn--primary') + ' btn--sm', r ? 'Abrir o roteiro' : 'Criar roteiro (modo avançado)');
      open.type = 'button';
      open.dataset.fid = 'rt-open';
      open.addEventListener('click', () => openRoteiro(d, () => { paint(); if (onDone) onDone(); }));
      if (!r) { box.replaceChildren(h('p', 'field__hint', 'Sem roteiro, a build é só o nível 0 (de entrada). Com roteiro, ela vira guiada: um livrinho com o que pegar a cada UP, e a ficha de quem segue se atualiza sozinha.'), open); return; }
      const filled = r.pages.filter((p, i) => rtFilled(p, i + 1)).length;
      const probs = rtProblems(r);
      box.replaceChildren(
        h('div', 'rt-field__sum',
          h('span', 'rt-chip', plural(r.up, 'folha', 'folhas')), h('span', 'rt-chip', fmtCronos(r.dinheiro) + ' Cronos'),
          h('span', 'rt-chip', plural(r.itens.length, 'item', 'itens')), h('span', 'rt-chip' + (filled === r.up ? ' rt-chip--ok' : ''), filled + ' de ' + r.up + ' preenchidas')),
        probs.length ? h('p', 'field__error', probs[0]) : null,
        open);
    };
    paint();
    return box;
  }

  const rt = { dlg: null, d: null, r: null, page: 0, done: null };
  function openRoteiro(d, done) {
    if (!rt.dlg) {
      rt.dlg = h('dialog', 'dialog dialog--wide rt');
      rt.dlg.setAttribute('aria-labelledby', 'rt-title');
      document.body.append(rt.dlg);
    }
    rt.d = d;
    rt.r = rtRead(d.values);
    rt.page = 0;
    rt.done = done;
    renderRoteiro();
    openDialog(rt.dlg);
  }
  function rtClose(save) {
    if (save) {
      const probs = rtProblems(rt.r);
      rtWrite(rt.d.values, rt.r);
      toast(probs.length ? 'Roteiro guardado com ' + plural(probs.length, 'aviso', 'avisos') + '. Salve a build para ir ao banco.' : 'Roteiro guardado. Salve a build para ir ao banco.');
    }
    closeDialog(rt.dlg);
    if (save && rt.done) rt.done();
  }
  function rtStart(body) { // antes de tudo: UP e dinheiro
    const up = h('input', 'input input--lg');
    up.type = 'number'; up.min = '1'; up.max = String(RT_MAX_UP); up.step = '1'; up.id = 'rt-up'; up.inputMode = 'numeric';
    up.value = rt.r ? String(rt.r.up) : '10';
    const money = h('input', 'input input--lg');
    money.type = 'number'; money.id = 'rt-money'; money.readOnly = true;
    money.value = String(START_CRONOS);
    const table = h('p', 'field__hint', 'Todo personagem começa com ' + fmtCronos(START_CRONOS) + ' Cronos, então toda build compra os itens com esse valor.');
    const go = h('button', 'btn btn--primary', rt.r ? 'Atualizar o livro' : 'Criar o livro');
    go.type = 'button';
    go.dataset.fid = 'rt-make';
    go.addEventListener('click', () => {
      const n = clamp(Math.round(num(up.value)), 1, RT_MAX_UP);
      const m = START_CRONOS;
      if (!rt.r) rt.r = rtNew(n, m);
      else {
        rt.r.pages = rt.r.pages.slice(0, n).concat(Array.from({ length: Math.max(0, n - rt.r.pages.length) }, rtPage));
        rt.r.up = n;
        rt.r.dinheiro = m;
      }
      rt.r.setup = false;
      rt.page = 1;
      renderRoteiro();
    });
    const lab = (inp, text) => { const l = h('label', 'field__label', text); l.htmlFor = inp.id; return l; };
    body.append(h('div', 'rt-start',
      h('p', 'rt-start__lead', 'Antes de tudo: até quantos UP vai o roteiro e com quanto dinheiro a build compra os itens. Cada UP vira uma folha do livro.'),
      h('div', 'rt-start__grid', h('div', 'field', lab(up, 'UP do roteiro (folhas)'), up), h('div', 'field', lab(money, 'Dinheiro para itens (Cronos)'), money)),
      table, h('div', 'rt-start__go', go)));
  }
  function rtSelect(opts, value, onChange, blank, fid) {
    const sel = h('select', 'input');
    const b = h('option', '', blank || 'Escolha...');
    b.value = '';
    sel.append(b, ...opts.map((o) => { const op = h('option', '', o[1]); op.value = o[0]; return op; }));
    sel.value = value || '';
    if (fid) sel.dataset.fid = fid;
    sel.addEventListener('change', () => onChange(sel.value));
    return sel;
  }
  function rtItemsPage() {
    const r = rt.r;
    const total = rtItemsTotal(r);
    const add = h('button', 'btn btn--primary btn--sm', '+ Item do catálogo');
    add.type = 'button';
    add.dataset.fid = 'rt-item-add';
    add.addEventListener('click', async () => {
      const picked = await openPickerMany({ title: 'Item do roteiro', kinds: INVENTORY_KINDS, chips: [
        { label: 'Armas', kinds: ['arma-melee', 'arma-fogo'] }, { label: 'Munições', kinds: ['municao'] }, { label: 'Armaduras', kinds: ['armadura'] }, { label: 'Vestíveis', kinds: ['vestivel'] },
        { label: 'Implantes', kinds: ['nucleo', 'protese-modulo'] }, { label: 'Peças de slot', kinds: ['mod-arma', 'propriedade', 'acessorio'] }, { label: 'Itens gerais', kinds: ['item-geral'] }], filter: (x) => INVENTORY_KINDS.indexOf(x.kind) >= 0 });
      if (!picked.length || rt.r !== r) return;
      picked.forEach((e) => r.itens.push({ id: e.id || '', name: e.name, price: priceOf(e) }));
      renderRoteiro();
    });
    return h('article', 'guide__page rt-page rt-page--itens',
      h('p', 'guide__num', h('span', '', 'Folha'), h('strong', '', '0')),
      h('p', 'guide__state', 'Itens: comprados com o dinheiro do roteiro na distribuição inicial'),
      h('div', 'rt-money' + (total > r.dinheiro ? ' is-over' : ''), h('span', '', 'Gasto'), h('strong', '', fmtCronos(total) + ' de ' + fmtCronos(r.dinheiro)), h('span', '', 'Cronos')),
      r.itens.length ? h('ul', 'rt-items', ...r.itens.map((x, i) => {
        const del = h('button', 'icon-btn', '×');
        del.type = 'button';
        del.setAttribute('aria-label', 'Tirar ' + x.name);
        del.addEventListener('click', () => { r.itens.splice(i, 1); renderRoteiro(); });
        return h('li', '', h('span', 'rt-items__name', x.name), h('span', 'rt-items__price', x.price ? fmtCronos(x.price) : '—'), del);
      })) : h('p', 'rt-empty', 'Nenhum item ainda.'),
      add);
  }
  function rtUpPage(n) {
    const r = rt.r, p = r.pages[n - 1], led = rtLedger(r)[n - 1];
    const redo = () => renderRoteiro();
    const g = p.gasto;
    // Doutor é um poder comprado como os outros: aparece em "Poder" (com a perícia escolhida)
    const kindOf = (x) => (x && x.t === 'doutor' ? 'poder' : x && x.t);
    const kinds = h('div', 'rt-kinds', ...RT_KINDS.map((k) => {
      const on = kindOf(g) === k[0];
      const b = h('button', 'rt-kind' + (on ? ' is-on' : ''), k[1]);
      b.type = 'button';
      b.dataset.fid = 'rt-kind-' + k[0];
      b.setAttribute('aria-pressed', String(on));
      b.addEventListener('click', () => { p.gasto = on ? null : { t: k[0] }; if (k[0] === 'pericias') p.gasto.list = {}; redo(); });
      return b;
    }));
    let detail = null;
    if (g && (g.t === 'poder' || g.t === 'doutor')) {
      const e = g.t === 'doutor' ? rtPower('of-pod-doutor') : g.id ? rtPower(g.id) : null;
      const pick = h('button', 'btn btn--ghost btn--sm', g.name || g.t === 'doutor' ? 'Trocar poder' : 'Escolher poder…');
      pick.type = 'button';
      pick.dataset.fid = 'rt-power';
      pick.addEventListener('click', async () => {
        const x = await openPicker({ title: 'Poder da folha ' + n, kinds: ['poder'], chips: ['Poder'], filter: (y) => y.kind === 'poder' && (!CHOICE_POWERS[y.id] || y.id === 'of-pod-doutor') });
        if (!x || rt.r !== r) return;
        if (x.id === 'of-pod-doutor') { p.gasto = { t: 'doutor', skill: '' }; redo(); return; }
        const opts = powerOpts(x);
        p.gasto = { t: 'poder', id: x.id, name: x.name, opt: opts.length ? opts[0].name : '' };
        redo();
      });
      const opts = e && g.t === 'poder' ? powerOpts(e) : [];
      const title = g.t === 'doutor' ? (e ? e.name : 'Doutor') : g.name;
      detail = h('div', 'rt-detail',
        title ? h('p', 'rt-pick', h('strong', '', title), h('span', '', ' · custa ' + plural(rtCost(g), 'UP', 'UP'))) : null,
        opts.length ? h('div', 'field', h('span', 'field__label', 'Opção'), rtSelect(opts.map((o) => [o.name, o.name + (o.text ? ': ' + o.text : '')]), g.opt, (v) => { g.opt = v; redo(); }, null, 'rt-opt')) : null,
        g.t === 'doutor' ? h('div', 'field', h('span', 'field__label', 'Perícia (o limite dela sobe para 4)'), rtSelect(rtSkills(), g.skill, (v) => { g.skill = v; redo(); }, 'Escolha a perícia...', 'rt-doutor')) : null,
        pick);
    } else if (g && g.t === 'melhoria') {
      const before = r.pages.slice(0, n - 1).map((x) => x.gasto).filter((x) => x && x.t === 'poder' && x.id);
      const seen = {};
      const opts = [];
      before.forEach((x) => { if (seen[x.id]) return; seen[x.id] = 1; const e = rtPower(x.id); if (e) powerUps(e).forEach((u) => opts.push([x.id + '|' + u.name, e.name + ' · ' + u.name + ' (' + (u.cost === '' ? 1 : num(u.cost)) + ' UP)'])); });
      detail = opts.length
        ? h('div', 'rt-detail', rtSelect(opts, g.id ? g.id + '|' + g.name : '', (v) => { const i = v.indexOf('|'); g.id = v.slice(0, i); g.name = v.slice(i + 1); redo(); }, 'Escolha a melhoria...', 'rt-up'))
        : h('p', 'rt-empty', 'Escolha antes, numa folha anterior, um poder que tenha melhorias.');
    } else if (g && g.t === 'prof') {
      detail = h('div', 'rt-detail', rtSelect(PROFS.map((x) => [x.id, x.label]), g.prof, (v) => { g.prof = v; redo(); }, 'Tipo de arma ou armadura...', 'rt-prof'), h('p', 'field__hint', 'Também dá +1 ponto de perícia.'));
    } else if (g && g.t === 'pericias') {
      g.list = g.list || {};
      const used = Object.keys(g.list).reduce((t, k) => t + num(g.list[k]), 0);
      const slots = [];
      Object.keys(g.list).forEach((k) => { for (let i = 0; i < g.list[k]; i++) slots.push(k); });
      while (slots.length < 3) slots.push('');
      detail = h('div', 'rt-detail',
        h('p', 'field__hint', '1 UP em perícias = 3 pontos. Marcados: ' + used + ' de 3.'),
        h('div', 'rt-three', ...slots.slice(0, 3).map((v, i) => rtSelect(rtSkills(), v, (nv) => {
          const next = slots.slice(0, 3);
          next[i] = nv;
          g.list = {};
          next.filter(Boolean).forEach((k) => { g.list[k] = (g.list[k] || 0) + 1; });
          redo();
        }, '+1 em...', 'rt-per-' + i))));
    } else if (g && g.t === 'guardar') {
      detail = h('p', 'rt-empty', 'Este UP fica guardado para um poder ou melhoria mais cara numa folha seguinte.');
    }
    const res = h('div', 'rt-res',
      h('span', 'rt-chip rt-chip--up', '1 UP' + (led.have > 1 ? ' (+' + (led.have - 1) + ' guardado' + (led.have > 2 ? 's' : '') + ')' : '')),
      n % 2 ? h('span', 'rt-chip', '+1 ponto de perícia') : h('span', 'rt-chip', '2 benefícios'),
      rtAttrPage(n) ? h('span', 'rt-chip rt-chip--attr', '+1 atributo') : null);
    const extra = n % 2
      ? h('div', 'rt-sec', h('h4', 'rt-sec__title', 'Ponto de perícia'), rtSelect(rtSkills(), p.per, (v) => { p.per = v; redo(); }, 'Perícia que ganha +1...', 'rt-ponto'))
      : h('div', 'rt-sec', h('h4', 'rt-sec__title', 'Benefícios'), h('div', 'rt-bens', ...[0, 1].map((i) => h('div', 'rt-ben', h('span', 'rt-ben__label', (i + 1) + 'º benefício'), ...RT_BEN.map((b) => {
        const x = h('button', 'rt-kind' + (p.ben[i] === b[0] ? ' is-on' : ''), b[1]);
        x.type = 'button';
        x.dataset.fid = 'rt-ben-' + i + '-' + b[0];
        x.setAttribute('aria-pressed', String(p.ben[i] === b[0]));
        x.addEventListener('click', () => { p.ben[i] = p.ben[i] === b[0] ? '' : b[0]; redo(); });
        return x;
      })))));
    // a cada 4 UP: +1 num atributo à escolha
    const attr = rtAttrPage(n) ? h('div', 'rt-sec rt-sec--attr', h('h4', 'rt-sec__title', 'Atributo (+1 a cada 4 UP)'),
      h('div', 'rt-kinds', ...ATTRS.map((at) => {
        const on = p.attr === at.id;
        const x = h('button', 'rt-kind' + (on ? ' is-on' : ''), at.label + ' +1');
        x.type = 'button';
        x.title = at.hint;
        x.dataset.fid = 'rt-attr-' + at.id;
        x.setAttribute('aria-pressed', String(on));
        x.addEventListener('click', () => { p.attr = on ? '' : at.id; redo(); });
        return x;
      }))) : null;
    const nota = h('input', 'input');
    nota.type = 'text';
    nota.maxLength = 120;
    nota.placeholder = 'Lembrete (opcional): ex. comprar munição extra';
    nota.value = p.nota;
    nota.dataset.fid = 'rt-nota';
    nota.addEventListener('input', () => { p.nota = nota.value; });
    // duas colunas no PC: à esquerda o que gastar, à direita o que a folha dá de graça
    return h('article', 'guide__page rt-page' + (rtFilled(p, n) ? ' is-done' : '') + (led.short ? ' is-bad' : ''),
      h('div', 'rt-page__head', h('p', 'guide__num', h('span', '', 'Folha'), h('strong', '', String(n))), res),
      h('div', 'rt-cols',
        h('div', 'rt-col', h('div', 'rt-sec', h('h4', 'rt-sec__title', 'Gastar o UP'), kinds, detail,
          led.short ? h('p', 'field__error', 'Custa ' + led.cost + ' UP e só há ' + led.have + ' aqui. Use "Guardar" em folhas antes.') : null)),
        h('div', 'rt-col', extra, attr)),
      h('div', 'rt-sec', nota));
  }
  // resumo do livro inteiro: o que a build ganha somando todas as folhas
  function rtSummary(r) {
    const led = rtLedger(r);
    const ben = { pv: 0, pe: 0, pa: 0 }, attrs = {}, skills = {};
    const picks = [];
    r.pages.forEach((p, i) => {
      const n = i + 1;
      const t = rtText(p.gasto);
      if (t && p.gasto.t !== 'guardar') picks.push([n, t]);
      if (n % 2 === 0) p.ben.forEach((k) => { if (k) ben[k] += 1; });
      else if (p.per) skills[p.per] = (skills[p.per] || 0) + 1;
      if (p.gasto && p.gasto.t === 'pericias') Object.keys(p.gasto.list || {}).forEach((k) => { skills[k] = (skills[k] || 0) + num(p.gasto.list[k]); });
      if (rtAttrPage(n) && p.attr) attrs[p.attr] = (attrs[p.attr] || 0) + 1;
    });
    const attrSlots = Math.floor(r.up / 4), attrUsed = Object.keys(attrs).reduce((t, k) => t + attrs[k], 0);
    const row = (label, value) => h('div', 'rt-sum__row', h('dt', '', label), h('dd', '', value));
    const benTxt = [ben.pv ? '+' + ben.pv * 5 + ' PV' : '', ben.pe ? '+' + ben.pe * 5 + ' PE' : '', ben.pa ? '+' + ben.pa + ' PA' : ''].filter(Boolean).join(' · ');
    const left = led.length ? led[led.length - 1].left : 0;
    return h('aside', 'rt-sum',
      h('h4', 'rt-sum__title', 'Resumo do roteiro'),
      h('dl', 'rt-sum__list',
        row('Atributos', attrSlots ? (ATTRS.filter((at) => attrs[at.id]).map((at) => at.label + ' +' + attrs[at.id]).join(' · ') || '—') + ' (' + attrUsed + ' de ' + attrSlots + ')' : 'a 1ª vem na folha 4'),
        row('Benefícios', benTxt || '—'),
        row('Perícias', Object.keys(skills).map((k) => skillLabel(k) + ' +' + skills[k]).join(' · ') || '—'),
        row('UP guardados no fim', String(left))),
      picks.length ? h('ol', 'rt-sum__picks', ...picks.map((x) => {
        const b = h('button', 'rt-sum__pick', h('span', 'rt-sum__n', String(x[0])), h('span', '', x[1]));
        b.type = 'button';
        b.addEventListener('click', () => { rt.page = x[0]; renderRoteiro(); });
        return h('li', '', b);
      })) : h('p', 'rt-empty rt-sum__empty', 'Nenhum poder ou perícia escolhido ainda.'));
  }
  function renderRoteiro() {
    const r = rt.r, d = rt.d;
    const close = h('button', 'btn btn--ghost btn--sm', 'Cancelar');
    close.type = 'button';
    close.addEventListener('click', () => rtClose(false));
    const save = h('button', 'btn btn--primary btn--sm', 'Guardar roteiro');
    save.type = 'button';
    save.dataset.fid = 'rt-save';
    save.disabled = !r || r.setup === true;
    save.addEventListener('click', () => rtClose(true));
    const body = h('div', 'rt__body');
    const head = h('div', 'rt__head',
      h('div', 'guide__name', h('span', 'guide__kicker', 'Roteiro · modo avançado'), h('strong', '', d.name || 'Build sem nome')),
      h('div', 'guide__acts', close, save));
    if (!r || r.setup) {
      rtStart(body);
      rt.dlg.replaceChildren(h('div', 'picker rt__sheet', head, body));
      setTimeout(() => { const x = rt.dlg.querySelector('#rt-up'); if (x) x.focus(); }, 0);
      return;
    }
    rt.page = clamp(rt.page, 0, r.up);
    const settings = h('button', 'btn btn--ghost btn--sm', 'UP e dinheiro');
    settings.type = 'button';
    settings.dataset.fid = 'rt-settings';
    settings.addEventListener('click', () => { r.setup = true; renderRoteiro(); });
    const clear = h('button', 'btn btn--ghost btn--sm', 'Apagar roteiro');
    clear.type = 'button';
    clear.addEventListener('click', async () => {
      const ok = await askConfirm({ title: 'Apagar o roteiro?', text: 'A build volta a ser só o nível 0. Isso só vale quando você salvar a build.', ok: 'Apagar' });
      if (!ok) return;
      rtWrite(d.values, null);
      closeDialog(rt.dlg);
      if (rt.done) rt.done();
    });
    const turn = (dd, label) => {
      const b = h('button', 'guide__turn', label);
      b.type = 'button';
      b.dataset.fid = dd < 0 ? 'rt-prev' : 'rt-next';
      b.disabled = dd < 0 ? rt.page <= 0 : rt.page >= r.up;
      b.setAttribute('aria-label', dd < 0 ? 'Folha anterior' : 'Próxima folha');
      b.addEventListener('click', () => { rt.page += dd; renderRoteiro(); });
      return b;
    };
    const led = rtLedger(r);
    const marks = h('div', 'guide__marks rt-marks', ...[0].concat(r.pages.map((p, i) => i + 1)).map((n) => {
      const ok = n === 0 ? r.itens.length > 0 : rtFilled(r.pages[n - 1], n);
      const bad = n === 0 ? rtItemsTotal(r) > r.dinheiro : led[n - 1].short;
      const b = h('button', 'guide__mark' + (ok ? ' is-done' : '') + (bad ? ' is-bad' : '') + (n === rt.page ? ' is-on' : '') + (n && rtAttrPage(n) ? ' is-attr' : ''), n === 0 ? 'Itens' : String(n));
      b.type = 'button';
      b.setAttribute('aria-label', n === 0 ? 'Folha dos itens' : 'Folha ' + n + (rtAttrPage(n) ? ' (+1 atributo)' : ''));
      if (n && rtAttrPage(n)) b.title = '+1 atributo nesta folha';
      b.addEventListener('click', () => { rt.page = n; renderRoteiro(); });
      return b;
    }));
    const probs = rtProblems(r);
    const filled = r.pages.filter((p, i) => rtFilled(p, i + 1)).length;
    // embaixo da folha: anterior e próxima (no celular as setas laterais somem)
    const step = (dd, label) => {
      const b = h('button', 'btn btn--ghost btn--sm', label);
      b.type = 'button';
      b.disabled = dd < 0 ? rt.page <= 0 : rt.page >= r.up;
      b.addEventListener('click', () => { rt.page += dd; renderRoteiro(); });
      return b;
    };
    body.append(
      h('div', 'rt__bar', h('span', 'rt-chip', plural(r.up, 'UP', 'UP')), h('span', 'rt-chip', fmtCronos(r.dinheiro) + ' Cronos'),
        h('span', 'rt-chip' + (filled === r.up ? ' rt-chip--ok' : ''), filled + ' de ' + r.up + ' prontas'),
        h('span', 'rt-chip' + (probs.length ? ' rt-chip--bad' : ' rt-chip--ok'), probs.length ? plural(probs.length, 'aviso', 'avisos') : 'Tudo certo'),
        h('span', 'rt__bar-acts', settings, clear)),
      marks,
      h('div', 'rt-main',
        h('div', 'rt-main__book',
          h('div', 'guide__book rt-book', turn(-1, '‹'), h('div', 'guide__spread rt-spread', rt.page === 0 ? rtItemsPage() : rtUpPage(rt.page)), turn(1, '›')),
          h('div', 'rt-steps', step(-1, '‹ Anterior'), h('span', 'rt-steps__at', rt.page === 0 ? 'Itens' : 'Folha ' + rt.page + ' de ' + r.up), step(1, 'Próxima ›'))),
        rtSummary(r)),
      ...(probs.length ? [h('ul', 'rt-probs', ...probs.map((x) => h('li', '', x)))] : []),
      h('p', 'field__hint', 'Quem segue esta build recebe cada folha quando ganha o UP dela, até parar a atualização automática na ficha. O +1 de atributo entra quando a ficha tiver direito a ele (a cada 4 UP ganhos por XP).'));
    const keep = rt.dlg.querySelector('.rt__sheet');
    const top = keep ? keep.scrollTop : 0;
    rt.dlg.replaceChildren(h('div', 'picker rt__sheet', head, body));
    rt.dlg.querySelector('.rt__sheet').scrollTop = top;
  }

  // valor atual de um recurso: sem registro = cheio (assim acompanha o máximo quando ele muda)
  const curMin = (key, max) => (key === 'pv' ? -max : 0);
  function getCur(s, key, max) {
    const v = s.cur[key];
    return v === null || v === undefined ? max : clamp(num(v), curMin(key, max), max);
  }
  function setCur(s, key, v, max) {
    const n = clamp(Math.round(num(v)), curMin(key, max), max);
    s.cur[key] = n >= max ? null : n;
  }

  let sheetChar = null;
  const statusEl = $('#sheet-status');
  const fName = $('#f-name'), errName = $('#f-name-error');
  const fSpecies = $('#f-species'), fAge = $('#f-age'), fOrigin = $('#f-origin'), fHeight = $('#f-height'), fSex = $('#f-sex');
  const formAttach = $('#form-attach'), inAttach = $('#attach-code'), errAttach = $('#attach-error');
  const setStatus = (text) => { statusEl.textContent = text; };

  function renderSheetHeader() {
    $('#sheet-title').textContent = sheetChar.name;
    setBadge($('#sheet-badge'), sheetChar.type);
    document.title = 'Ficha de ' + sheetChar.name + ' | Vortex';
  }

  function renderSheetFav() {
    const on = charFavs().has(sheetChar.id);
    const fav = $('#fav-toggle');
    fav.textContent = on ? '★ Favorito' : '☆ Favoritar';
    fav.setAttribute('aria-pressed', String(on));
    const keep = $('#profile-toggle');
    keep.hidden = !profile;
    keep.textContent = isMyChar(sheetChar.id) ? 'Tirar do perfil' : 'Salvar no perfil';
  }

  function renderPin() {
    $('#pin-toggle').textContent = quickHas(sheetChar.id) ? 'Tirar do acesso rápido' : 'Fixar no acesso rápido';
  }

  function renderPortrait() {
    const btn = $('#portrait-btn');
    const has = Boolean(sheetChar.image);
    btn.className = 'portrait__btn portrait__btn--' + sheetChar.type;
    btn.setAttribute('aria-label', has ? 'Trocar imagem' : 'Escolher imagem');
    const img = $('#portrait-img');
    img.hidden = !has;
    if (has) img.src = sheetChar.image; else img.removeAttribute('src');
    $('#portrait-empty').hidden = has;
    $('#portrait-remove').hidden = !has;
  }

  /* Peças de interface da ficha */
  function stepper(value, o) { // o: { min, max, label, fid, onChange, text }
    const mk = (txt, d) => {
      const b = h('button', 'stepper__btn', txt);
      b.type = 'button';
      b.dataset.fid = o.fid + (d < 0 ? '-' : '+');
      b.setAttribute('aria-label', (d < 0 ? 'Diminuir ' : 'Aumentar ') + o.label);
      b.disabled = d < 0 ? value <= o.min : value >= o.max;
      b.addEventListener('click', () => o.onChange(clamp(value + d, o.min, o.max)));
      return b;
    };
    return h('span', 'stepper', mk('−', -1), h('span', 'stepper__val', o.text === undefined ? String(value) : o.text), mk('+', 1));
  }

  function meter(segs, label) { // segs: [{ key, cur, max }]
    const bar = h('div', 'meter');
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', label);
    segs.filter((g) => g.max > 0).forEach((g) => {
      const fill = h('span', 'meter__fill');
      fill.style.width = clamp((Math.max(0, g.cur) / g.max) * 100, 0, 100) + '%';
      const seg = h('span', 'meter__seg meter__seg--' + g.key, fill);
      seg.style.flexGrow = String(g.max);
      seg.title = g.title || '';
      bar.append(seg);
    });
    return bar;
  }

  const srcText = (list) => list.filter((x) => x.val).map((x, i) => (i === 0 ? fmtNum(x.val) + ' ' + x.name : signed(x.val) + ' ' + x.name)).join(' · ');

  function touchSheet() {
    dirty.add('sheet');
    setStatus('Salvando...');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 700);
  }

  // o que a ficha já mostrou: avisos só aparecem quando algo muda depois de aberta
  const watch = { id: null, over: false, pending: 0, skills: 0, bad: 0 };
  let lastDmgType = '';

  /* Avisos da Progressão: o que há para distribuir e o que está além do que as regras dão. Cada aviso traz
     os botões que resolvem ali mesmo (escolher benefício, UP em perícias, desfazer), então a aba não precisa
     de quadros de saldo. Podem ser desligados (s.alertsOff) ou dispensados um a um (s.hideAlerts). */
  const toAttrs = () => { const b = $('#attr-band'); if (b) { b.scrollIntoView({ behavior: 'smooth', block: 'center' }); b.classList.remove('attr-band--flash'); void b.offsetWidth; b.classList.add('attr-band--flash'); } };
  const toPowers = () => { showSheetTab($('#spanel-poderes')); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const toSel = (sel) => () => { const el = $(sel); if (!el) return; showSheetTab(el.closest('.sheet-panel')); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const BEN = [['pv', '+5 PV'], ['pe', '+5 PE'], ['pa', '+1 PA']];
  function pendingList(m) {
    const s = sheetChar.sheet;
    const out = [];
    const picks = m.picksAllowed - m.picksUsed;
    const up = m.upTotal - m.upSpent;
    const skills = m.skillBudget - m.skillUsed;
    const attr = m.attrAllowed - m.attrUsed;
    const bump = (k) => () => { s.up[k] = num(s.up[k]) + 1; changed(); };
    if (!s.setup) out.push({ key: 'setup', n: 0, text: 'A distribuição inicial (atributos e perícias) ainda não foi feita.', acts: [{ label: 'Fazer agora', fid: 'al-setup', on: () => openSetup() }] });
    if (picks > 0) out.push({ key: 'picks', n: picks, text: plural(picks, 'benefício para escolher', 'benefícios para escolher') + ' (a cada 2 UP, 2 benefícios; pode repetir).', acts: BEN.map((b) => ({ label: b[1], fid: 'al-ben-' + b[0], cls: 'btn--primary', on: bump(b[0]) })) });
    if (attr > 0) out.push({ key: 'attr', n: attr, text: plural(attr, '+1 de atributo para escolher', '+1 de atributo para escolher') + ' (a cada 4 UP). Aumente o atributo no + da faixa de atributos.', acts: [{ label: 'Ir aos atributos', fid: 'al-attr', on: toAttrs }] });
    if (up > 0) out.push({ key: 'up', n: up, text: plural(up, 'UP livre', 'UP livres') + ' para gastar em poderes ou perícias (cada UP em perícias dá +3 pontos).', acts: [{ label: 'Comprar poderes', fid: 'al-powers', on: toPowers }, { label: '+1 UP em perícias', fid: 'al-per', on: bump('per') }] });
    if (skills > 0) out.push({ key: 'skills', n: skills, text: plural(skills, 'ponto de perícia', 'pontos de perícia') + ' para distribuir.', acts: [{ label: 'Ver perícias', fid: 'al-skills', on: toSel('#skills-block') }] });
    return out;
  }
  function noSourceList(m) {
    const s = sheetChar.sheet;
    const out = [];
    const up = m.upSpent - m.upTotal;
    const picks = m.picksUsed - m.picksAllowed;
    const skills = m.skillUsed - m.skillBudget;
    const extraProfs = s.profs.length - 4;
    const drop = (k) => () => { s.up[k] = Math.max(0, num(s.up[k]) - 1); changed(); };
    if (up > 0) out.push({ key: 'x-up', n: up, text: plural(up, 'UP gasto', 'UP gastos') + ' sem UP que os pague (poderes, melhorias ou UP em perícias). Ganhe XP ou desfaça uma compra.',
      acts: [{ label: 'Ver poderes', fid: 'al-x-powers', on: toPowers }].concat(s.up.per ? [{ label: '−1 UP em perícias', fid: 'al-x-per', on: drop('per') }] : []) });
    if (picks > 0) out.push({ key: 'x-picks', n: picks, text: plural(picks, 'benefício', 'benefícios') + ' (+5 PV, +5 PE, +1 PA) sem UP par que os conceda.',
      acts: BEN.filter((b) => num(s.up[b[0]]) > 0).map((b) => ({ label: 'Tirar ' + b[1], fid: 'al-x-ben-' + b[0], on: drop(b[0]) })) });
    if (m.attrUsed > m.attrAllowed) {
      const old = ATTRS.filter((at) => num((s.upAttr || {})[at.id]) > 0); // +1 escolhido na Progressão antiga
      out.push({ key: 'x-attr', n: m.attrUsed - m.attrAllowed, text: 'Atributos com ' + plural(m.attrUsed - m.attrAllowed, 'ponto', 'pontos') + ' além dos 3 da distribuição inicial e do +1 a cada 4 UP. Baixe no − da faixa de atributos.',
        acts: [{ label: 'Ir aos atributos', fid: 'al-x-attr', on: toAttrs }].concat(old.map((at) => ({ label: 'Tirar +1 de ' + at.label, fid: 'al-x-attr-' + at.id, on: () => { s.upAttr[at.id] = Math.max(0, num(s.upAttr[at.id]) - 1); changed(); } })), [{ label: 'Refazer distribuição', fid: 'al-x-setup', on: () => openSetup() }]) });
    }
    if (skills > 0) out.push({ key: 'x-skills', n: skills, text: plural(skills, 'ponto de perícia', 'pontos de perícia') + ' além do que a distribuição inicial, os UP e os poderes dão.', acts: [{ label: 'Ver perícias', fid: 'al-x-skills', on: toSel('#skills-block') }] });
    if (extraProfs > 0) out.push({ key: 'x-profs', n: extraProfs, text: plural(extraProfs, 'proficiência', 'proficiências') + ' além das 4 iniciais. As extras vêm do poder Proficiência em arma ou armadura.', acts: [{ label: 'Ver proficiências', fid: 'al-x-profs', on: toSel('#profs-block') }] });
    return out;
  }
  // aviso dispensado fica escondido enquanto a conta não piorar (guarda o tamanho dele na ficha)
  const alertHidden = (s, p) => Boolean(s.hideAlerts && s.hideAlerts[p.key] != null && num(s.hideAlerts[p.key]) >= p.n);
  function alertItem(p, bad) {
    const x = h('button', 'alerts__x', '×');
    x.type = 'button';
    x.title = 'Dispensar este aviso';
    x.setAttribute('aria-label', 'Dispensar: ' + p.text);
    x.dataset.fid = 'alert-x-' + p.key;
    x.addEventListener('click', () => { const s = sheetChar.sheet; s.hideAlerts = Object.assign({}, s.hideAlerts, { [p.key]: p.n }); changed(); });
    const acts = (p.acts || []).map((a) => {
      const b = h('button', 'btn btn--sm ' + (a.cls || 'btn--ghost'), a.label);
      b.type = 'button';
      b.dataset.fid = a.fid;
      b.addEventListener('click', a.on);
      return b;
    });
    return h('div', 'alerts__item' + (bad ? ' alerts__item--bad' : ''),
      h('div', 'alerts__body', h('p', 'alerts__text', p.text), acts.length ? h('div', 'alerts__acts', ...acts) : null),
      p.key === 'setup' ? null : x);
  }
  // o que já foi escolhido nos UP, com um × para desfazer (os quadros de saldo saíram da aba)
  function choiceChips(s) {
    const chip = (label, fid, undo) => {
      const b = h('button', 'alerts__chip', label, h('span', 'alerts__chip-x', '×'));
      b.type = 'button';
      b.dataset.fid = fid;
      b.title = 'Desfazer uma: ' + label;
      b.addEventListener('click', () => { undo(); changed(); });
      return b;
    };
    const out = BEN.filter((b) => num(s.up[b[0]]) > 0).map((b) => chip(b[1] + ' ×' + s.up[b[0]], 'undo-' + b[0], () => { s.up[b[0]] = num(s.up[b[0]]) - 1; }));
    if (num(s.up.per)) out.push(chip('UP em perícias ×' + s.up.per, 'undo-per', () => { s.up.per = num(s.up.per) - 1; }));
    ATTRS.forEach((at) => { const n = num((s.upAttr || {})[at.id]); if (n > 0) out.push(chip('+' + n + ' ' + at.label, 'undo-attr-' + at.id, () => { s.upAttr[at.id] = n - 1; })); });
    return out.length ? h('div', 'alerts__chips', h('span', 'alerts__chips-label', 'Escolhidos nos UP:'), ...out) : null;
  }
  function renderAlerts(m) {
    const s = sheetChar.sheet;
    const allList = pendingList(m);
    const allBad = noSourceList(m);
    // avisos que já não existem saem da lista de dispensados (se voltarem, aparecem de novo)
    if (s.hideAlerts) Object.keys(s.hideAlerts).forEach((k) => { if (!allList.concat(allBad).some((p) => p.key === k)) delete s.hideAlerts[k]; });
    const off = Boolean(s.alertsOff);
    const list = off ? [] : allList.filter((p) => !alertHidden(s, p));
    const bad = off ? [] : allBad.filter((p) => !alertHidden(s, p));
    const hiddenN = off ? 0 : allList.length + allBad.length - list.length - bad.length;
    const box = $('#prog-alerts');
    if (box) {
      const tog = h('button', 'alerts__toggle', h('span', 'alerts__toggle-knob'), off ? 'Desligados' : 'Ligados');
      tog.type = 'button';
      tog.dataset.fid = 'alerts-toggle';
      tog.setAttribute('role', 'switch');
      tog.setAttribute('aria-checked', String(!off));
      tog.setAttribute('aria-label', 'Avisos');
      tog.addEventListener('click', () => { s.alertsOff = !off; changed(); toast(off ? 'Avisos ligados.' : 'Avisos desligados. A ficha não aponta mais pendências nem compras sem fonte.'); });
      const restore = h('button', 'link-btn alerts__restore', 'Mostrar ' + plural(hiddenN, 'aviso dispensado', 'avisos dispensados'));
      restore.type = 'button';
      restore.dataset.fid = 'alert-restore';
      restore.addEventListener('click', () => { s.hideAlerts = {}; changed(); });
      const total = allList.length + allBad.length;
      box.classList.toggle('alerts--bad', bad.length > 0);
      box.classList.toggle('alerts--quiet', !list.length && !bad.length);
      box.replaceChildren(...[
        h('div', 'alerts__head', h('h3', 'prog__title', 'Avisos'), tog),
        off ? h('p', 'field__hint', 'Desligados.' + (total ? ' ' + plural(total, 'aviso escondido', 'avisos escondidos') + '.' : '')) : null,
        ...(bad.length ? [h('p', 'alerts__title alerts__title--bad', 'Sem fonte reconhecida')] : []), ...bad.map((p) => alertItem(p, true)),
        ...(list.length ? [h('p', 'alerts__title', 'Há o que distribuir')] : []), ...list.map((p) => alertItem(p, false)),
        !off && !list.length && !bad.length && !hiddenN ? h('p', 'field__hint', 'Tudo em dia: nada para distribuir.') : null,
        hiddenN ? restore : null,
        choiceChips(s)].filter(Boolean));
    }
    const count = list.reduce((t, p) => t + p.n, 0);
    const skillsLeft = off ? 0 : Math.max(0, m.skillBudget - m.skillUsed);
    if (watch.id === sheetChar.id && count > watch.pending) {
      const fresh = list.filter((p) => p.n).map((p) => p.text.replace(/[.:(].*$/, '').trim()).join(' · ');
      if (fresh) toast('Novos pontos para distribuir: ' + fresh + '.');
    } else if (watch.id === sheetChar.id && skillsLeft > watch.skills) {
      // ex.: comprar uma proficiência gasta 1 UP e dá 1 ponto de perícia (o total não muda, mas a perícia fica pendente)
      toast('Perícia pendente: ' + plural(skillsLeft, 'ponto', 'pontos') + ' para distribuir.');
    }
    const badCount = bad.reduce((t, p) => t + p.n, 0);
    if (watch.id === sheetChar.id && badCount > watch.bad) toast('Sem fonte: ' + bad.map((p) => p.text.replace(/[.(].*$/, '').trim()).join(' · ') + '. O sistema não reconhece de onde isso veio.');
    watch.pending = count;
    watch.skills = skillsLeft;
    watch.bad = badCount;
    // abas com algo a distribuir ou sem fonte ganham um ponto (avisos desligados: nenhum)
    const dot = { 'stab-progressao': list.some((p) => p.key !== 'skills'), 'stab-pericias': list.some((p) => p.key === 'skills') };
    const red = { 'stab-progressao': bad.some((p) => p.key !== 'x-skills' && p.key !== 'x-profs'), 'stab-pericias': bad.some((p) => p.key === 'x-skills' || p.key === 'x-profs') };
    Object.keys(dot).forEach((id) => { const t = $('#' + id); t.classList.toggle('sheet-tab--dot', dot[id] && !red[id]); t.classList.toggle('sheet-tab--bad', red[id]); });
    // +1 de atributo a escolher: os + da faixa de atributos ficam em destaque
    const band = $('#attr-band');
    if (band) band.classList.toggle('attr-band--pick', !off && m.attrAllowed > m.attrUsed);
  }

  // Redesenha a ficha inteira e devolve o foco ao controle que estava em uso
  function rerender() {
    const a = document.activeElement;
    const fid = a && a.dataset ? a.dataset.fid : null;
    const gd = sheetChar.mine || isMyChar(sheetChar.id) ? guideSync(sheetChar.sheet) : [];
    if (gd.length) { touchSheet(); toast('Build ' + sheetChar.sheet.guide.name + ' atualizou a ficha: ' + gd.join(' · ') + '.'); }
    const m = compute(sheetChar);
    renderAttrs(m);
    renderResources(m);
    renderSkills(m);
    renderProfs();
    renderProgress(m);
    renderGuide(m);
    renderSpeciesLink();
    renderPowers(m);
    renderInventory(m);
    renderAlerts(m);
    renderVitals(m);
    checkSecretThemes(m);
    // avisa quando a carga passa do limite (colocar ou tirar itens nunca é bloqueado)
    if (watch.id === sheetChar.id && m.over && !watch.over) toast('Carga ' + fmtNum(m.cargaUsed) + ' / ' + fmtNum(m.cargaMax) + '. ' + OVERLOAD_TEXT);
    watch.over = m.over;
    watch.id = sheetChar.id;
    $('#setup-open').textContent = sheetChar.sheet.setup ? 'Refazer distribuição inicial' : 'Distribuição inicial';
    if (fid) { const el = $('[data-fid="' + fid + '"]'); if (el && !el.disabled) el.focus({ preventScroll: true }); }
  }
  const changed = () => { touchSheet(); rerender(); };

  /* Abas da ficha (a última aberta fica lembrada neste aparelho) */
  const SHEET_TAB_KEY = 'vortex.sheetTab.v1';
  function showSheetTab(panel, focus) {
    if (!panel) return;
    $$('.sheet-tab').forEach((tab) => {
      const on = tab.getAttribute('aria-controls') === panel.id;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on && focus) tab.focus();
      $('#' + tab.getAttribute('aria-controls')).hidden = !on;
    });
    try { localStorage.setItem(SHEET_TAB_KEY, panel.id); } catch (e) { /* só nesta visita */ }
    if (panel.id === 'spanel-progressao') requestAnimationFrame(progTrackScroll);
  }
  $$('.sheet-tab').forEach((tab, i, all) => {
    tab.addEventListener('click', () => showSheetTab($('#' + tab.getAttribute('aria-controls'))));
    tab.addEventListener('keydown', (ev) => {
      const k = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
      if (ev.key === 'Home' || ev.key === 'End') { ev.preventDefault(); const t2 = all[ev.key === 'Home' ? 0 : all.length - 1]; showSheetTab($('#' + t2.getAttribute('aria-controls')), true); return; }
      if (!k) return;
      ev.preventDefault();
      const next = all[(i + k + all.length) % all.length];
      showSheetTab($('#' + next.getAttribute('aria-controls')), true);
    });
  });
  try { const last = localStorage.getItem(SHEET_TAB_KEY); if (last && $('#' + last)) showSheetTab($('#' + last)); } catch (e) { /* sem armazenamento */ }

  /* Números vitais: o que mais se consulta na mesa, sempre à vista (como no D&D Beyond) */
  function ring(key, label, cur, max, note) {
    const pct = max > 0 ? clamp(Math.max(0, cur) / max, 0, 1) : 0;
    const el = h('div', 'vital vital--ring vital--' + key,
      h('span', 'vital__dial', h('span', 'vital__num', String(cur)), h('span', 'vital__max', '/ ' + max)),
      h('span', 'vital__label', label),
      note ? h('span', 'vital__note', note) : null);
    el.style.setProperty('--pct', (pct * 100).toFixed(1));
    el.setAttribute('role', 'meter');
    el.setAttribute('aria-label', label);
    el.setAttribute('aria-valuemin', '0');
    el.setAttribute('aria-valuemax', String(max));
    el.setAttribute('aria-valuenow', String(cur));
    return el;
  }
  let vitEdit = false; // painel de valores dos recursos aberto sob os anéis
  function renderVitals(m) {
    const s = sheetChar.sheet;
    const life = LIFE.map((l) => ({ key: l[0], max: m.max[l[0]], cur: getCur(s, l[0], m.max[l[0]]) })).filter((l) => l.max > 0 || l.key === m.base);
    const lifeCur = life.reduce((t, l) => t + Math.max(0, l.cur), 0);
    const lifeMax = life.reduce((t, l) => t + l.max, 0);
    const lifeNote = life.filter((l) => l.max > 0).map((l) => (l.key === 'pv' ? 'PV' : l.key === 'escudo' ? 'Esc' : 'Bld') + ' ' + l.cur).join(' · ');
    const box = (cls, label, value, note) => h('div', 'vital vital--' + cls, h('span', 'vital__label', label), h('span', 'vital__big', value), note ? h('span', 'vital__note', note) : null);
    const free = m.upTotal - m.upSpent;
    // recursos mexidos direto no topo da ficha: − e + em cada anel; tocar no anel abre os valores para digitar
    const step = (key, label, d, on, off) => {
      const b = h('button', 'vital__btn', d < 0 ? '−' : '+');
      b.type = 'button';
      b.dataset.fid = 'vit-' + key + (d < 0 ? '-' : '+');
      b.setAttribute('aria-label', (d < 0 ? 'Perder 1 de ' : 'Recuperar 1 de ') + label);
      b.disabled = off;
      b.addEventListener('click', on);
      return b;
    };
    const one = (key) => getCur(s, key, m.max[key]);
    const bump = (key, d) => () => { setCur(s, key, one(key) + d, m.max[key]); changed(); };
    // Resistência: perder vai de fora para dentro (Escudo → Blindagem → Vida), recuperar de dentro para fora
    const lifeHit = life.slice().reverse().find((l) => l.cur > curMin(l.key, l.max) && (l.cur > 0 || l.key === 'pv'));
    const lifeHeal = life.find((l) => l.cur < l.max);
    const ctl = (key, label, cur, max, minus, plus, minusOff) => {
      const r = ring(key, label, cur, max, key === 'life' ? lifeNote : key === 'pe' ? 'Esforço' : 'Ação');
      const dial = r.querySelector('.vital__dial');
      const open = h('button', 'vital__open');
      open.type = 'button';
      open.dataset.fid = 'vit-open-' + key;
      open.setAttribute('aria-label', 'Editar ' + label);
      open.setAttribute('aria-expanded', String(vitEdit));
      open.title = 'Digitar os valores';
      open.addEventListener('click', () => { vitEdit = !vitEdit; renderVitals(compute(sheetChar)); if (vitEdit) { const f = $('#vitals-edit input'); if (f) f.focus(); } });
      dial.replaceWith(open);
      open.append(dial);
      r.append(h('span', 'vital__ctl', step(key, label, -1, minus, minusOff), step(key, label, 1, plus, cur >= max)));
      return r;
    };
    const lifeRing = ctl('life', 'Resistência', lifeCur, lifeMax,
      () => { if (lifeHit) { setCur(s, lifeHit.key, lifeHit.cur - 1, lifeHit.max); changed(); } },
      () => { if (lifeHeal) { setCur(s, lifeHeal.key, lifeHeal.cur + 1, lifeHeal.max); changed(); } }, !lifeHit);
    const edit = h('div', 'vitals-edit');
    edit.id = 'vitals-edit';
    edit.hidden = !vitEdit;
    if (vitEdit) {
      const close = h('button', 'btn btn--ghost btn--sm', 'Fechar');
      close.type = 'button';
      close.dataset.fid = 'vit-close';
      close.addEventListener('click', () => { vitEdit = false; renderVitals(compute(sheetChar)); });
      edit.append(h('div', 'vitals-edit__head', h('strong', '', 'Recursos atuais'), h('span', 'field__hint', 'Digite o valor ou use − e +. O máximo vem da ficha.'), close),
        ...life.map((l) => resRow(l.key, l.key === 'pv' ? 'PV' : l.key === 'escudo' ? 'Escudo' : 'Blindagem', l.cur, l.max, m.src[l.key], 'v')),
        resRow('pe', 'PE · Esforço', one('pe'), m.max.pe, m.src.pe, 'v'), resRow('pa', 'PA · Ação', one('pa'), m.max.pa, m.src.pa, 'v'));
    }
    $('#vitals').replaceChildren(
      box('def', 'Defesa', String(m.defMin), 'mínima'),
      lifeRing,
      ctl('pe', 'PE', one('pe'), m.max.pe, bump('pe', -1), bump('pe', 1), one('pe') <= 0),
      ctl('pa', 'PA', one('pa'), m.max.pa, bump('pa', -1), bump('pa', 1), one('pa') <= 0),
      box('move', 'Deslocamento', fmtNum(m.desloc) + ' m', m.over ? 'sobrecarregado' : m.desloc !== 9 ? 'espécime' : 'padrão'),
      box('carga', 'Carga', fmtNum(m.cargaUsed) + '/' + fmtNum(m.cargaMax), m.over ? 'acima do limite' : 'mochila'),
      box('up', 'UP livres', String(free), 'XP ' + num(s.xp)));
    const old = $('#vitals-edit');
    if (old) old.replaceWith(edit); else $('#vitals').after(edit);
    $('#sheet-sub').textContent = [sheetChar.species, sheetChar.origin, m.armor ? m.armor.name : ''].filter(Boolean).join(' · ');
  }

  function renderAttrs(m) {
    const s = sheetChar.sheet;
    const feeds = {
      corpo: (m.base === 'pv' ? 'PV ' : m.base === 'blindagem' ? 'Blindagem ' : 'Escudo ') + m.max[m.base] + ' · Carga ' + fmtNum(m.cargaMax),
      precisao: 'PA ' + m.max.pa,
      essencia: 'PE ' + m.max.pe
    };
    $('#attr-band').replaceChildren(...ATTRS.map((at) => {
      const v = s.attrs[at.id];
      const mod = num((s.attrMod || {})[at.id]) + num((s.upAttr || {})[at.id]);
      const tile = h('div', 'attr attr--' + at.id + (mod ? ' attr--mod' : ''),
        h('span', 'attr__name', at.label, mod ? (() => { const t = h('span', 'attr__mod', (mod > 0 ? '+' : '') + mod); t.title = 'Bônus de ' + (mod > 0 ? '+' : '') + mod + ' (UP e ajuste manual; ficha ' + signed(v) + ')'; return t; })() : null),
        h('span', 'attr__value', signed(v + mod)),
        stepper(v, { min: -1, max: 6, label: at.label, fid: 'attr-' + at.id, text: '', onChange: (n) => { s.attrs[at.id] = n; changed(); } }),
        h('span', 'attr__feeds', feeds[at.id]));
      tile.title = at.hint;
      return tile;
    }));
  }

  function resRow(key, label, cur, max, src, pre) {
    const fid = (pre || '') + 'cur-' + key;
    const s = sheetChar.sheet;
    const set = (v) => { setCur(s, key, v, max); changed(); };
    const inp = h('input', 'input res__cur');
    inp.type = 'number';
    inp.inputMode = 'numeric';
    inp.value = cur;
    inp.min = curMin(key, max);
    inp.max = max;
    inp.dataset.fid = fid;
    inp.setAttribute('aria-label', label + ' atual');
    inp.addEventListener('change', () => set(inp.value));
    const btn = (txt, d) => {
      const b = h('button', 'stepper__btn', txt);
      b.type = 'button';
      b.dataset.fid = fid + (d < 0 ? '-' : '+');
      b.setAttribute('aria-label', (d < 0 ? 'Perder 1 de ' : 'Recuperar 1 de ') + label);
      b.disabled = d < 0 ? cur <= curMin(key, max) : cur >= max;
      b.addEventListener('click', () => set(cur + d));
      return b;
    };
    return h('div', 'res res--' + key,
      h('span', 'res__name', h('span', 'res__dot'), label),
      h('span', 'res__ctl', btn('−', -1), inp, btn('+', 1), h('span', 'res__max', '/ ' + max)),
      h('span', 'res__src', srcText(src)));
  }

  function renderResources(m) {
    const s = sheetChar.sheet;
    const box = $('#res-block');
    const life = LIFE.map((l) => ({ key: l[0], label: l[1], max: m.max[l[0]], cur: getCur(s, l[0], m.max[l[0]]) }))
      .filter((l) => l.max > 0 || l.key === m.base);
    const lifeCur = life.reduce((t, l) => t + Math.max(0, l.cur), 0);
    const lifeMax = life.reduce((t, l) => t + l.max, 0);
    const pvCur = getCur(s, 'pv', m.max.pv);
    let state = '';
    if (m.base === 'pv' && m.max.pv > 0 && pvCur <= -m.max.pv) state = 'Morto: chegou a –PV máximo.';
    else if (m.base === 'pv' && m.max.pv > 0 && pvCur < 0) state = 'Morrendo: vida negativa. Teste de Fortitude (CD 6, +1 a cada tentativa no dia); morre em –' + m.max.pv + '.';
    else if (lifeCur <= 0) state = m.base === 'pv' ? 'Fora de combate: caído com 0 PV. Mais dano deixa a vida negativa (morrendo).' : 'Fora de combate: sem resistência.';

    const head = h('div', 'res-head', h('span', 'res-head__label', 'Resistência'), h('span', 'res-head__num', lifeCur + ' / ' + lifeMax));
    const legend = h('div', 'legend', ...life.map((l) => h('span', 'legend__item legend__item--' + l.key, h('span', 'res__dot'), l.label + ' ' + l.cur + '/' + l.max)));
    const lifeBox = h('div', 'res-life', head,
      meter(life.map((l) => ({ key: l.key, cur: l.cur, max: l.max, title: l.label + ' ' + l.cur + '/' + l.max })), 'Resistência ' + lifeCur + ' de ' + lifeMax + ': ' + life.map((l) => l.label + ' ' + l.cur + ' de ' + l.max).join(', ')),
      legend);
    if (state) lifeBox.append(h('p', 'res-state', state));
    life.forEach((l) => lifeBox.append(resRow(l.key, l.label, l.cur, l.max, m.src[l.key])));

    const peCur = getCur(s, 'pe', m.max.pe), paCur = getCur(s, 'pa', m.max.pa);
    const other = h('div', 'res-other',
      h('div', 'res-single', meter([{ key: 'pe', cur: peCur, max: m.max.pe }], 'PE ' + peCur + ' de ' + m.max.pe), resRow('pe', 'PE · Esforço', peCur, m.max.pe, m.src.pe)),
      h('div', 'res-single', meter([{ key: 'pa', cur: paCur, max: Math.max(1, m.max.pa) }], 'PA ' + paCur + ' de ' + m.max.pa), resRow('pa', 'PA · Ação', paCur, m.max.pa, m.src.pa)));

    const stat = (label, value, note) => h('div', 'stat', h('span', 'stat__label', label), h('span', 'stat__value', value), note ? h('span', 'stat__note', note) : null);
    const stats = h('div', 'stats',
      stat('Defesa mínima', String(m.defMin), 'Armadura ' + m.max.armadura + ' + Corpo + Resistência'),
      stat('Deslocamento', fmtNum(m.desloc) + ' m', m.over ? 'sobrecarregado: metade' : m.desloc !== 9 ? 'com o bônus do espécime' : 'padrão'),
      stat('Penalidade de armadura', m.pen ? '–' + m.pen : '—', m.pen ? 'Manha, Reflexos, Sentidos e Operações' + (m.armorProf ? '' : ' (dobrada: sem proficiência)') : (m.armor ? m.armor.name : 'sem armadura equipada')));

    // (o tipo escolhido aplica fraquezas e resistências; a última escolha fica lembrada)
    // dano entra sempre na ordem Escudo → Blindagem → Vida
    const dmg = h('input', 'input res__dmg');
    dmg.type = 'number';
    dmg.min = '1';
    dmg.step = '1';
    dmg.inputMode = 'numeric';
    dmg.placeholder = 'Dano';
    dmg.setAttribute('aria-label', 'Dano sofrido');
    const dmgType = h('select', 'input res__dmgtype');
    dmgType.setAttribute('aria-label', 'Tipo de dano');
    dmgType.dataset.fid = 'dmg-type';
    [['', 'Sem tipo']].concat((ITEM_DATA.tiposDano || []).map((t) => [t, t])).forEach((p) => { const o = h('option', '', p[1]); o.value = p[0]; dmgType.append(o); });
    dmgType.value = lastDmgType;
    dmgType.addEventListener('change', () => { lastDmgType = dmgType.value; });
    const dmgForm = h('form', 'res-dmg', dmg, dmgType, (() => { const b = h('button', 'btn btn--danger btn--sm', 'Sofrer dano'); b.type = 'submit'; return b; })());
    dmgForm.title = 'O dano é aplicado na ordem Escudo → Blindagem → Vida.';
    dmgForm.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const left = Math.round(num(dmg.value));
      if (left < 1) { dmg.focus(); return; }
      // fraquezas e resistências de cada camada (capítulo Ataque e Defesa)
      const res = applyLayeredDamage(left, dmgType.value ? [dmgType.value] : [], charLayers(sheetChar), '');
      res.layers.forEach((l) => { if (m.max[l.key]) setCur(s, l.key, l.cur, m.max[l.key]); });
      changed();
      if (dmgType.value) toast(res.steps.map((p) => p.label + ' –' + p.taken + factorText(p.k)).join(', ') || 'Nenhum dano.');
    });
    // ajustes manuais: bônus ou penalidades que não vêm de item, poder ou espécime
    const adjRow = (label, value, o) => h('div', 'adj__row' + (value ? ' is-on' : ''),
      h('span', 'adj__label', h('strong', '', label), o.note ? h('span', 'adj__note', o.note) : null),
      stepper(value, { min: o.min, max: o.max, label: 'ajuste de ' + label, fid: o.fid, text: value > 0 ? '+' + value : String(value), onChange: o.set }));
    const attrAdj = ATTRS.map((at) => {
      const mod = num(s.attrMod[at.id]);
      const pw = num(s.upAttr[at.id]);
      return adjRow(at.label, mod, { min: -6, max: 6, fid: 'adj-' + at.id, note: 'ficha ' + signed(s.attrs[at.id]) + (pw ? ' · UP +' + pw : '') + ' → vale ' + signed(attrOf(s, at.id)), set: (n) => { s.attrMod[at.id] = n; changed(); } });
    });
    const resAdj = BONUS_KEYS.map((b) => {
      const v = Math.round(num(s.extra[b[0]]));
      return adjRow(b[1], v, { min: -99, max: 99, fid: 'extra-' + b[0], note: 'máximo ' + fmtNum(m.max[b[0]]), set: (n) => { s.extra[b[0]] = n; changed(); } });
    });
    const anyAdj = ATTRS.some((at) => num(s.attrMod[at.id])) || BONUS_KEYS.some((b) => num(s.extra[b[0]]));
    const clearAdj = h('button', 'btn btn--ghost btn--sm', 'Zerar ajustes');
    clearAdj.type = 'button';
    clearAdj.dataset.fid = 'adj-clear';
    clearAdj.disabled = !anyAdj;
    clearAdj.addEventListener('click', () => { ATTRS.forEach((at) => { s.attrMod[at.id] = 0; }); BONUS_KEYS.forEach((b) => { s.extra[b[0]] = 0; }); changed(); toast('Ajustes manuais zerados.'); });
    const wasOpen = $('#res-extra') ? $('#res-extra').open : anyAdj;
    const extra = h('details', 'adj');
    extra.id = 'res-extra';
    extra.open = wasOpen;
    extra.append(h('summary', 'adj__summary', h('span', '', 'Ajustes manuais'), h('span', 'adj__count', anyAdj ? 'com ajustes' : 'nenhum')),
      h('p', 'field__hint', 'Aumente ou diminua atributos e recursos por coisas que a ficha não calcula sozinha: condições, efeitos da cena, decisões do mestre. O ajuste soma no valor e aparece nos testes e nos máximos.'),
      h('div', 'adj__cols',
        h('section', 'adj__group', h('h3', 'adj__title', 'Atributos'), ...attrAdj),
        h('section', 'adj__group', h('h3', 'adj__title', 'Recursos (máximo)'), ...resAdj)),
      h('div', 'adj__acts', clearAdj));

    box.replaceChildren(lifeBox, other, stats, h('div', 'res-actions', dmgForm));
    adjPanel = extra; // fica na aba Progressão, abaixo dos avisos (renderProgress)
  }
  let adjPanel = null;

  function renderSkills(m) {
    const s = sheetChar.sheet;
    const left = m.skillBudget - m.skillUsed;
    $('#skills-hint').replaceChildren('Teste = 2d6 + atributo + perícia (as rolagens ficam na campanha). Pontos de perícia: ' + m.skillUsed + ' de ' + m.skillBudget + '. ',
      ...(left > 0 ? [h('strong', 'skills__pending', plural(left, 'ponto pendente', 'pontos pendentes') + ' para distribuir.')] : []),
      ...(left < 0 ? [h('strong', 'skills__pending', 'Passou ' + plural(-left, 'ponto', 'pontos') + ' do limite.')] : []));
    $('#skills-block').replaceChildren(...ATTRS.map((at) => {
      const group = h('div', 'skills skills--' + at.id, h('h3', 'skills__title', at.label + ' ', h('span', 'skills__attr', signed(attrOf(s, at.id)))));
      SKILLS[at.id].forEach((sk) => {
        const v = num(s.skills[sk[0]]);
        const gift = (m.skillGrant || {})[sk[0]] || 0; // de graça, da espécime
        const pen = PENALTY_SKILLS.indexOf(sk[0]) >= 0 ? m.pen : 0;
        const total = h('span', 'skill__total', signed(attrOf(s, at.id) + v + gift - pen));
        total.title = 'Atributo ' + signed(attrOf(s, at.id)) + ', perícia +' + (v + gift) + (gift ? ' (+' + gift + ' da espécime)' : '') + (pen ? ', armadura –' + pen : '');
        const row = h('div', 'skill',
          h('span', 'skill__name', sk[1], gift ? h('span', 'skill__gift', ' +' + gift + ' espécime') : null, pen ? h('span', 'skill__pen', ' –' + pen + ' armadura') : null),
          total,
          // subir até o limite tira o ponto da espécime desta perícia e devolve como ponto livre
          stepper(v, { min: 0, max: Math.max(v, skillCap(s, sk[0])), label: sk[1], fid: 'sk-' + sk[0], text: '+' + (v + gift), onChange: (n) => { s.skills[sk[0]] = n; changed(); } }));
        if (skillCap(s, sk[0]) > 3) row.querySelector('.skill__name').append(h('span', 'skill__doc', ' Doutor'));
        group.append(row);
        if (sk[0] === 'oficio') {
          const inp = h('input', 'input skill__job');
          inp.type = 'text';
          inp.maxLength = 40;
          inp.value = s.oficio || '';
          inp.placeholder = 'Qual ofício? Ex.: mecânica';
          inp.setAttribute('aria-label', 'Profissão do Ofício');
          inp.dataset.fid = 'oficio';
          inp.addEventListener('input', () => { s.oficio = inp.value; touchSheet(); });
          group.append(inp);
        }
      });
      return group;
    }));
  }

  function renderProgress(m) {
    const ch = sheetChar, s = ch.sheet;
    const xp = num(s.xp);
    const base = m.upTotal - m.upEarned; // UP de origem, espécime e extras
    const free = m.upTotal - m.upSpent;
    const setXp = (v) => { s.xp = Math.max(0, Math.round(v)); changed(); };
    const card = (cls, ...kids) => h('section', 'prog__card ' + cls, ...kids);
    const title = (txt, extra) => h('h3', 'prog__title', txt, extra || null);

    // 1. nível: UP atual, barra de XP até o próximo e botões rápidos
    const xpIn = h('input', 'input prog__xp-in');
    xpIn.type = 'number';
    xpIn.min = '0';
    xpIn.step = '1';
    xpIn.id = 'f-xp';
    xpIn.dataset.fid = 'f-xp';
    xpIn.value = xp || '';
    xpIn.placeholder = '0';
    xpIn.setAttribute('aria-label', 'XP total');
    xpIn.addEventListener('change', () => setXp(num(xpIn.value)));
    const into = xp % 10;
    const bar = h('div', 'prog__bar', h('span', 'prog__bar-fill'));
    bar.firstChild.style.width = (into * 10) + '%';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '10');
    bar.setAttribute('aria-valuenow', String(into));
    bar.setAttribute('aria-label', 'XP até o próximo UP');
    const quick = [1, 5, 10].map((n) => {
      const b = h('button', 'btn btn--ghost btn--sm', '+' + n + ' XP');
      b.type = 'button';
      b.dataset.fid = 'xp-add-' + n;
      b.addEventListener('click', () => { const was = m.upTotal; setXp(xp + n); const now = compute(ch).upTotal; if (now > was) { play('ok'); toast('Subiu para ' + now + ' UP!' + (compute(ch).upEarned % 2 === 0 ? ' Escolha 2 benefícios.' : ' +1 ponto de perícia.')); } });
      return b;
    });
    const extra = h('input', 'input prog__extra-in');
    extra.type = 'number';
    extra.min = '0';
    extra.step = '1';
    extra.id = 'f-up-extra';
    extra.dataset.fid = 'f-up-extra';
    extra.value = s.upExtra || '';
    extra.placeholder = '0';
    extra.addEventListener('change', () => { s.upExtra = Math.max(0, Math.round(num(extra.value))); changed(); });
    const extraLab = h('label', 'prog__extra-lab', 'UP extras (dados pelo mestre)');
    extraLab.htmlFor = 'f-up-extra';
    const level = h('div', 'prog__level',
      h('div', 'prog__up', h('span', 'prog__up-kicker', 'UP'), h('strong', 'prog__up-n', String(m.upTotal)),
        h('span', 'prog__up-from', m.upEarned + ' por XP' + (base ? ' + ' + base + ' de origem/extras' : '')),
        h('span', 'prog__up-from' + (free < 0 ? ' is-bad' : ''), m.upSpent + ' gastos · ' + (free < 0 ? (-free) + ' a mais' : free + (free === 1 ? ' livre' : ' livres')))),
      h('div', 'prog__xp',
        h('div', 'prog__xp-head', h('span', '', 'XP'), xpIn, h('span', 'prog__xp-next', 'faltam ' + (10 - into) + ' XP para o UP ' + (m.upTotal + 1))),
        bar,
        h('div', 'prog__xp-quick', ...quick)),
      h('div', 'prog__extra', extraLab, extra));

    // trilha no topo: nível (UP, XP) e o que cada UP ganho por XP dá, até alguns à frente
    const last = Math.max(6, m.upEarned + 3);
    const steps = [];
    for (let n = 1; n <= last; n++) {
      const got = n <= m.upEarned;
      const next = n === m.upEarned + 1;
      const xpLeft = n * 10 - xp;
      steps.push(h('li', 'prog__step' + (got ? ' is-got' : next ? ' is-next' : ''),
        h('span', 'prog__step-n', String(n)),
        h('span', 'prog__step-gain', n % 2 ? '+1 perícia' : '2 benefícios'), n % 4 === 0 ? h('span', 'prog__step-gain prog__step-attr', '+1 atributo') : null,
        h('span', 'prog__step-state', got ? '✓ ganho' : 'faltam ' + xpLeft + ' XP')));
    }
    const track = card('prog__track', title('Trilha de UP'), level,
      h('ol', 'prog__steps', ...steps),
      h('p', 'field__hint', 'UP ímpar: +1 ponto de perícia (já somado em Perícias). UP par: 2 benefícios. A cada 4 UP: +1 num atributo, no + da faixa de atributos. Só os UP ganhos por XP contam; os de origem não.'));
    // os avisos (escolher benefícios, UP livres, +1 de atributo, compras sem fonte) são desenhados por renderAlerts
    const alerts = h('section', 'prog__card alerts', null);
    alerts.id = 'prog-alerts';
    alerts.setAttribute('role', 'status');

    if (adjPanel) adjPanel.classList.add('prog__card');
    $('#prog-block').replaceChildren(h('div', 'prog', track, alerts, adjPanel));
    // a trilha abre mostrando o próximo UP (rola só a trilha, não a página)
    requestAnimationFrame(progTrackScroll);
  }
  function progTrackScroll() {
    const ol = $('#prog-block .prog__steps'), nx = ol && ol.querySelector('.is-next');
    if (nx && ol.clientWidth) ol.scrollLeft = Math.max(0, nx.offsetLeft - ol.offsetLeft - ol.clientWidth / 2 + nx.offsetWidth / 2);
  }

  /* Folhas da build guiada: um livro, uma folha por UP */
  const guideView = { key: '', page: null };
  function renderGuide(m) {
    const ch = sheetChar, s = ch.sheet, g = s.guide;
    const box = $('#guide-block');
    if (!g) {
      const pick = h('button', 'btn btn--ghost btn--sm', 'Seguir uma build guiada');
      pick.type = 'button';
      pick.dataset.fid = 'guide-pick';
      pick.addEventListener('click', async () => {
        const e = await openPicker({ title: 'Escolher build guiada', kinds: ['build'], chips: ['Build guiada'], filter: (x) => x.kind === 'build' && (x.values || {}).tipo === 'Guiada' });
        if (!e || sheetChar !== ch) return;
        const ng = guideFrom(e);
        const spent = compute(ch).upSpent;
        ng.done = guidePages(ng).filter((pg) => pg.n <= spent).map((pg) => pg.n); // o que já foi gasto conta como feito
        s.guide = ng;
        changed();
        toast('Seguindo ' + e.name + '. A cada UP ganho a ficha se atualiza sozinha.');
      });
      box.replaceChildren(h('p', 'field__hint', 'Uma build guiada diz o que pegar a cada UP, como um livro. Escolha uma na distribuição inicial ou aqui. As folhas até os UP que você já gastou contam como feitas.'), pick);
      return;
    }
    const pages = guidePages(g);
    const key = ch.id + '|' + g.id + '|' + g.name;
    if (guideView.key !== key) { guideView.key = key; guideView.page = null; }
    if (guideView.page === null) { const next = pages.findIndex((pg) => g.done.indexOf(pg.n) < 0); guideView.page = next < 0 ? Math.max(0, pages.length - 2) : next; }
    guideView.page = clamp(guideView.page, 0, Math.max(0, pages.length - 1));

    const auto = h('button', 'btn btn--sm ' + (g.auto ? 'btn--ghost' : 'btn--primary'), g.auto ? 'Parar de atualizar sozinha' : 'Voltar a atualizar sozinha');
    auto.type = 'button';
    auto.dataset.fid = 'guide-auto';
    auto.addEventListener('click', () => {
      g.auto = !g.auto;
      changed();
      toast(g.auto ? 'A ficha volta a seguir as folhas a cada UP.' : 'Atualização automática parada. As folhas ficam aqui para você aplicar à mão.');
    });
    const leave = h('button', 'btn btn--ghost btn--sm', 'Deixar a build');
    leave.type = 'button';
    leave.addEventListener('click', async () => {
      const ok = await askConfirm({ title: 'Deixar ' + g.name + '?', text: 'As folhas somem da ficha. O que já entrou (poderes, perícias, benefícios) continua.', ok: 'Deixar' });
      if (!ok || sheetChar !== ch) return;
      s.guide = null;
      changed();
    });
    const base = m.upTotal - m.upEarned;
    const pageEl = (pg) => {
      const done = g.done.indexOf(pg.n) >= 0;
      const reached = pg.n <= m.upTotal;
      const miss = (g.miss || {})[pg.n] || [];
      const xpLeft = Math.max(0, (pg.n - base) * 10 - num(s.xp));
      const state = done ? 'Feita' : reached ? 'Liberada' : 'Chega no UP ' + pg.n + (xpLeft ? ' · faltam ' + xpLeft + ' XP' : '');
      const el = h('article', 'guide__page' + (done ? ' is-done' : reached ? ' is-open' : ' is-locked'),
        h('p', 'guide__num', h('span', '', 'Folha'), h('strong', '', String(pg.n))),
        h('p', 'guide__state', state),
        h('ul', 'guide__list', ...pg.acts.map((a) => {
          const bad = miss.indexOf(a.text) >= 0;
          return h('li', 'guide__act' + (a.type === 'nota' ? ' guide__act--nota' : bad ? ' guide__act--miss' : ''), a.text,
            a.type === 'nota' ? h('span', 'tag', 'à mão') : bad ? h('span', 'tag tag--bad', 'não achei no banco') : null);
        })));
      if (reached && !done) {
        const ap = h('button', 'btn btn--primary btn--sm', 'Aplicar esta folha');
        ap.type = 'button';
        ap.dataset.fid = 'guide-apply-' + pg.n;
        ap.addEventListener('click', () => { const ok = applyGuidePage(s, pg); changed(); toast(ok.length ? 'Folha ' + pg.n + ': ' + ok.join(', ') + '.' : 'Folha ' + pg.n + ' marcada como feita.'); });
        el.append(ap);
      }
      return el;
    };
    const nav = (d, label, fid) => {
      const b = h('button', 'guide__turn', label);
      b.type = 'button';
      b.dataset.fid = fid;
      b.disabled = d < 0 ? guideView.page <= 0 : guideView.page >= pages.length - 1;
      b.setAttribute('aria-label', d < 0 ? 'Folha anterior' : 'Próxima folha');
      b.addEventListener('click', () => { guideView.page += d; renderGuide(compute(ch)); });
      return b;
    };
    const marks = h('div', 'guide__marks', ...pages.map((pg, i) => {
      const b = h('button', 'guide__mark' + (g.done.indexOf(pg.n) >= 0 ? ' is-done' : pg.n <= m.upTotal ? ' is-open' : '') + (i === guideView.page || i === guideView.page + 1 ? ' is-on' : ''), String(pg.n));
      b.type = 'button';
      b.setAttribute('aria-label', 'Ir para a folha ' + pg.n);
      b.addEventListener('click', () => { guideView.page = i; renderGuide(compute(ch)); });
      return b;
    }));
    const shown = pages.slice(guideView.page, guideView.page + 2);
    box.replaceChildren(
      h('div', 'guide__head',
        h('div', 'guide__name', h('span', 'guide__kicker', 'Build guiada'), h('strong', '', g.name)),
        h('span', 'guide__auto' + (g.auto ? ' is-on' : ''), g.auto ? 'Atualiza sozinha a cada UP' : 'Atualização parada'),
        h('div', 'guide__acts', auto, leave)),
      pages.length
        ? h('div', 'guide__book', nav(-1, '‹', 'guide-prev'), h('div', 'guide__spread', ...shown.map(pageEl)), nav(1, '›', 'guide-next'))
        : h('p', 'empty', 'Esta build não tem folhas.'),
      pages.length ? marks : null,
      h('p', 'field__hint', [g.beneficios ? 'Benefícios dos UP pares, em ordem: ' + g.beneficios + '.' : '', g.periciasUp ? 'Pontos de perícia, em ordem: ' + g.periciasUp + '.' : ''].filter(Boolean).join(' ')));
  }

  function profPills(list, onToggle, limit, prefix) {
    const box = h('div', 'checks');
    box.setAttribute('role', 'group');
    PROFS.forEach((p) => {
      const inp = h('input');
      inp.type = 'checkbox';
      inp.checked = list.indexOf(p.id) >= 0;
      inp.disabled = Boolean(limit) && !inp.checked && list.length >= limit;
      inp.dataset.fid = (prefix || 'prof-') + p.id;
      inp.addEventListener('change', () => onToggle(p.id, inp.checked));
      box.append(h('label', 'check check--pill' + (inp.disabled ? ' check--off' : ''), inp, h('span', '', p.label)));
    });
    return box;
  }

  function renderProfs() {
    const s = sheetChar.sheet;
    $('#profs-block').replaceChildren(
      h('h3', 'sub-title', 'Proficiências ', h('span', 'count', '(' + s.profs.length + ' de 4 iniciais' + (upProfsOf(s).length ? ' + ' + upProfsOf(s).length + ' por poder' : '') + ')')),
      profPills(s.profs, (id, on) => { s.profs = s.profs.filter((x) => x !== id); if (on) s.profs.push(id); changed(); }, 0),
      ...(upProfsOf(s).length ? [h('p', 'field__hint', 'Vindas de poderes: ' + upProfsOf(s).map(profLabel).join(', ') + '.')] : []),
      h('p', 'field__hint', 'Em armas: cadência perita e o aprimoramento do tipo. Em armaduras: a penalidade não dobra e a defesa ganha +1. Usar um item fora da empunhadura ideal conta como sem proficiência.'));
  }

  function renderSpeciesLink() {
    const s = sheetChar.sheet;
    const box = $('#species-link');
    if (!s.specimen) { box.textContent = 'Sem vínculo com o banco: escolha um espécime para aplicar as habilidades raciais dele.'; return; }
    const v = specimenVals(s);
    const un = h('button', 'link-btn', 'Desvincular');
    un.type = 'button';
    un.addEventListener('click', () => { s.specimen = null; changed(); });
    const m = sheetMech(s);
    box.replaceChildren(s.specimen.name + ': ' + mechLine(m).replace(/^V/, 'v') + (racialLines(v).length ? ' (' + racialLines(v).map((t) => t.name).join(', ') + ')' : '') + '. ', un);
    const lb = entryLore(s.specimen);
    if (lb) box.append(' ', lb);
    if (v.descricao) box.title = v.descricao;
  }

  function bonusLine(b) {
    return BONUS_KEYS.filter((k) => num(b[k[0]])).map((k) => k[1] + ' ' + signed(num(b[k[0]]))).join(' · ');
  }

  function renderPowers() {
    const s = sheetChar.sheet;
    const canRacial = isEtheriano(s.specimen);
    $('#racial-open').hidden = !canRacial;
    $('#power-list').replaceChildren(...s.powers.map((p, i) => {
      const v = p.values || {};
      const opts = powerOpts(p);
      const ups = powerUps(p);
      const total = powerUpCost(p);
      const costTxt = opts.length ? num(v.custo) + ' UP por opção · ' + total + ' UP gastos' : total ? 'Custo ' + total + ' UP' : '';
      const meta = [costTxt, v.custoUso ? 'Uso: ' + v.custoUso : '', bonusLine(p.bonus || {})].filter(Boolean).join(' · ');
      const main = h('span', 'row__main', h('span', 'row__title', p.name, ...(entryLore(p) ? [' ', entryLore(p)] : [])), h('span', 'row__meta', meta));
      if (v.efeito) main.append(h('span', 'row__text', v.efeito));
      if (opts.length) {
        const more = h('button', 'link-btn pw-sub__more', 'Ver opções');
        more.type = 'button';
        more.dataset.fid = 'pw-opts-' + i;
        more.addEventListener('click', () => openPowerOpts(sheetChar, p, p));
        main.append(h('span', 'pw-sub', h('span', 'pw-sub__title', 'Opções (marque as compradas) ', more), ...opts.map((o, k) => powerOptRow(s, p, o, i + '-' + k))));
      }
      if (ups.length) main.append(h('span', 'pw-sub', h('span', 'pw-sub__title', 'Melhorias'), ...ups.map((u, k) => powerUpRow(p, u, i + '-' + k))));
      if (p.id === 'of-pod-luta') main.append(h('span', 'pw-sub', h('span', 'pw-sub__title', 'Ataques por rodada: ' + lutaAttacks(s) + ' (Corpo ' + attrOf(s, 'corpo') + ' + perícia Luta ' + skillOf(s, 'luta') + ')')));
      if (p.id === 'of-pod-tecnomancia') main.append(h('span', 'pw-sub', h('span', 'pw-sub__title', 'Nível ' + tecnoLevel(p) + ': um efeito ativo por modo de ação · até ' + plural(tecnoLevel(p), 'implemento especial', 'implementos especiais') + ' por operação')));
      if (powerStyles(p).length) main.append(h('span', 'pw-sub', h('span', 'pw-sub__title', styleLabel(p)), ...powerStyles(p).map((e, k) => styleRow(s, p, e, i + '-' + k))));
      if (p.id === 'of-pod-tecnomancia' && styleOf(p) && styleOf(p).name === 'Engenheiro' && tecnoLevel(p)) main.append(tecnoListRow(s, p, i));
      const man = powerManobras(p);
      if (man.length) main.append(h('details', 'pw-sub pw-man', h('summary', 'pw-sub__title', 'Efeitos marciais (custo em ataques)'), manobraTable(man)));
      const del = h('button', 'btn btn--ghost btn--sm', 'Remover');
      del.type = 'button';
      del.setAttribute('aria-label', 'Remover poder ' + p.name);
      del.addEventListener('click', () => {
        s.powers.splice(i, 1);
        // sem o Doutor, a perícia volta ao limite normal
        if (p.id === 'of-pod-doutor' && p.choice && num(s.skills[p.choice]) > skillCap(s, p.choice)) s.skills[p.choice] = skillCap(s, p.choice);
        changed();
      });
      return h('li', 'row lib-row', h('span', 'row__open row__open--static', entryIcon(p), main), del);
    }));
    $('#power-empty').hidden = s.powers.length > 0;
  }

  function powerOptRow(s, p, o, fid) {
    const on = powerPicks(p).indexOf(o.name) >= 0;
    const chk = h('input');
    chk.type = 'checkbox';
    chk.checked = on;
    chk.dataset.fid = 'pw-opt-' + fid;
    chk.addEventListener('change', () => {
      const picks = powerPicks(p).filter((n) => n !== o.name);
      if (chk.checked) picks.push(o.name);
      p.picks = picks;
      changed();
    });
    const row = h('span', 'pw-opt' + (on ? ' pw-opt--on' : ''),
      h('label', 'pw-opt__head', chk, h('strong', '', o.name), o.cost ? h('span', 'tag', o.cost) : null),
      o.text ? h('span', 'pw-opt__text', o.text) : null);
    const pe = peCost(o.cost);
    if (on && pe) {
      const use = h('button', 'btn btn--ghost btn--sm', 'Usar (−' + pe + ' PE)');
      use.type = 'button';
      use.dataset.fid = 'pw-use-' + fid;
      use.addEventListener('click', () => spendPower(sheetChar, p.name + ': ' + o.name, pe));
      row.append(use);
    }
    return row;
  }

  const styleBody = (e) => [
    ...(e.passivas || []).map((x) => h('span', 'pw-opt__text', h('strong', '', x[0] + ': '), x[1])),
    e.tecnicas && e.tecnicas.length ? h('details', 'pw-man', h('summary', 'pw-sub__title', 'Técnicas (custo em ataques)'), manobraTable(e.tecnicas.map((r) => ({ name: r[0], text: r[1], cost: r[2] })))) : null];
  /* Engenheiro: em cada nível, uma lista e o atributo chave dela (Precisão ou Essência). O atributo chave vale
     para a lista toda (repetir a lista mantém o mesmo); conhece atributo chave + Operações componentes por escolha. */
  const TECNO_CHAVES = [['precisao', 'Precisão'], ['essencia', 'Essência']];
  function tecnoListRow(s, p, fid) {
    const picks = tecnoPicks(p);
    const chaves = p.chaves && typeof p.chaves === 'object' ? p.chaves : {};
    const ops = skillOf(s, 'operacoes');
    const seen = {};
    return h('span', 'pw-sub', h('span', 'pw-sub__title', 'Listas de componentes (uma por nível)'), ...picks.map((cur, k) => {
      const sel = h('select', 'input');
      sel.dataset.fid = 'pw-lista-' + fid + '-' + k;
      sel.setAttribute('aria-label', 'Lista do nível ' + (k + 1));
      sel.append(h('option', '', 'Escolher lista…'), ...tecnoLists().map((x) => h('option', '', x[0])));
      sel.options[0].value = '';
      sel.value = cur;
      sel.addEventListener('change', () => { const l = tecnoPicks(p); l[k] = sel.value; p.listas = l; changed(); });
      const again = cur && seen[cur];
      if (cur) seen[cur] = true;
      const info = cur ? (tecnoLists().find((x) => x[0] === cur) || [])[1] : '';
      const key = TECNO_CHAVES.find((c) => c[0] === chaves[cur]) || null;
      let keySel = null;
      if (cur && !again) {
        keySel = h('select', 'input');
        keySel.dataset.fid = 'pw-chave-' + fid + '-' + k;
        keySel.setAttribute('aria-label', 'Atributo chave da lista ' + cur);
        keySel.append(h('option', '', 'Atributo chave…'), ...TECNO_CHAVES.map((c) => { const o = h('option', '', c[1]); o.value = c[0]; return o; }));
        keySel.options[0].value = '';
        keySel.value = key ? key[0] : '';
        keySel.addEventListener('change', () => { p.chaves = Object.assign({}, chaves, { [cur]: keySel.value }); if (!keySel.value) delete p.chaves[cur]; changed(); });
      }
      const known = key ? attrOf(s, key[0]) + ops : 0;
      const detail = !cur ? null : !key ? 'Escolha o atributo chave (Precisão ou Essência) desta lista.'
        : (again ? 'Repetida: mais ' : 'Conhece ') + plural(Math.max(0, known), 'componente', 'componentes') + ' (' + key[1] + ' ' + attrOf(s, key[0]) + ' + Operações ' + ops + '). Até ' + plural(Math.max(0, attrOf(s, key[0])), 'implemento', 'implementos') + ' por operação.';
      return h('span', 'pw-opt' + (cur ? ' pw-opt--on' : ''), h('label', 'pw-opt__head', h('strong', '', 'Nível ' + (k + 1)), sel, keySel),
        cur ? h('span', 'pw-opt__text', info) : null, detail ? h('span', 'pw-opt__text', detail) : null);
    }));
  }

  function styleRow(s, p, e, fid) {
    const on = p.estilo === e.name;
    const other = !on && s.powers.find((x) => x.id === p.id && x.estilo);
    const b = h('button', 'btn btn--sm ' + (on || other || e.pendente ? 'btn--ghost' : 'btn--primary'), e.pendente ? 'Em breve' : on ? 'Tirar' : other ? 'Trocar para este' : 'Escolher');
    b.type = 'button';
    b.disabled = !!e.pendente;
    b.dataset.fid = 'pw-estilo-' + fid;
    b.setAttribute('aria-label', (on ? 'Tirar ' : 'Escolher ') + e.name);
    b.addEventListener('click', () => {
      s.powers.forEach((x) => { if (x.id === p.id) delete x.estilo; });
      if (!on) p.estilo = e.name;
      changed();
    });
    return h('span', 'pw-opt' + (on ? ' pw-opt--on' : ''),
      h('span', 'pw-opt__head', h('strong', '', e.name), e.pendente || !e.cost ? null : h('span', 'tag', e.cost + ' UP'), b),
      e.resumo ? h('span', 'pw-opt__text', e.resumo) : null, ...(on ? styleBody(e) : []));
  }

  function powerUpRow(p, u, fid) {
    const n = upCount(p, u.name);
    const cost = u.cost === '' ? 1 : num(u.cost);
    return h('span', 'pw-opt' + (n ? ' pw-opt--on' : ''),
      h('span', 'pw-opt__head', h('strong', '', u.name), h('span', 'tag', cost + ' UP cada'),
        stepper(n, { min: 0, max: 9, label: 'Melhoria ' + u.name, fid: 'pw-up-' + fid, text: '×' + n, onChange: (k) => { p.ups = Object.assign({}, p.ups); p.ups[u.name] = k; changed(); } })),
      u.text ? h('span', 'pw-opt__text', u.text) : null);
  }

  // Gasta o PE de uma opção de poder (na ficha aberta)
  function spendPower(c, label, pe) {
    const s = c.sheet;
    const max = compute(c).max.pe;
    const cur = getCur(s, 'pe', max);
    if (cur < pe) { toast('PE insuficiente para ' + label + ' (' + cur + ' de ' + pe + ').'); return false; }
    setCur(s, 'pe', cur - pe, max);
    changed();
    toast(label + ': −' + pe + ' PE (restam ' + (cur - pe) + ').');
    return true;
  }

  /* ---------- Inventário em blocos ----------
     Em cima, o que está equipado: núcleo, corpo (vestíveis e próteses, por região),
     armadura e as duas mãos. Embaixo, a mochila. Só a mochila ocupa Carga.
     Passar o mouse (ou tocar) num bloco estende um retângulo com os detalhes. */
  const EQUIP = [
    { id: 'nucleo', label: 'Núcleo', full: 'Núcleo', kind: 'nucleo', accepts: 'um núcleo' },
    { id: 'cabeca', label: 'Cabeça', full: 'Cabeça', region: 'cabeca', accepts: 'vestível ou prótese de cabeça' },
    { id: 'orgaos', label: 'Órgãos', full: 'Órgãos internos', region: 'orgaos-internos', accepts: 'vestível ou prótese de órgãos internos' },
    { id: 'braco-d', label: 'Braço dir.', full: 'Braço direito', region: 'membros-superiores', accepts: 'vestível ou prótese de membros superiores' },
    { id: 'tronco', label: 'Tronco', full: 'Tronco', region: 'tronco', accepts: 'vestível ou prótese de tronco' },
    { id: 'braco-e', label: 'Braço esq.', full: 'Braço esquerdo', region: 'membros-superiores', accepts: 'vestível ou prótese de membros superiores' },
    { id: 'mao-d', label: 'Mão direita', full: 'Mão direita', hand: true, accepts: 'arma ou item empunhado' },
    { id: 'armadura', label: 'Armadura', full: 'Armadura', kind: 'armadura', accepts: 'uma armadura' },
    { id: 'mao-e', label: 'Mão esquerda', full: 'Mão esquerda', hand: true, accepts: 'arma ou item empunhado' },
    { id: 'perna-d', label: 'Perna dir.', full: 'Perna direita', region: 'membros-inferiores', accepts: 'vestível ou prótese de membros inferiores' },
    { id: 'perna-e', label: 'Perna esq.', full: 'Perna esquerda', region: 'membros-inferiores', accepts: 'vestível ou prótese de membros inferiores' }
  ];
  const MODULE_SLOT = { id: 'modulo', label: 'Módulo', full: 'Módulo', multi: true, accepts: 'um módulo (precisa de núcleo)' };
  const slotDef = (id) => (id === 'modulo' ? MODULE_SLOT : EQUIP.find((e) => e.id === id));

  // em quais espaços este item pode ser equipado
  function slotsFor(i) {
    if (i.kind === 'municao' || isPiece(i)) return []; // munição e peças ficam na mochila (vão para a arma pelo Armeiro)
    if (i.kind === 'armadura') return ['armadura'];
    if (i.kind === 'nucleo') return ['nucleo'];
    if (isModule(i)) return ['modulo'];
    if (i.kind === 'protese-modulo' || i.kind === 'vestivel') return EQUIP.filter((e) => e.region && e.region === i.typeId).map((e) => e.id);
    return ['mao-d', 'mao-e'];
  }
  const itemBy = (u) => (sheetChar ? sheetChar.sheet.inventory.find((x) => x.uid === u) : null);

  function equipItem(i, slotId) {
    const s = sheetChar.sheet;
    if (slotsFor(i).indexOf(slotId) < 0) { toast((slotDef(slotId) || {}).full + ' não aceita ' + i.name + '.'); return false; }
    const hand = slotId === 'mao-d' || slotId === 'mao-e';
    const two = hand && twoHanded(i);
    const occupant = slotId === 'modulo' ? null : s.inventory.find((x) => x.slot === slotId && x !== i);

    if (i.kind === 'protese-modulo') {
      const m = compute(sheetChar);
      const mod = isModule(i);
      if (mod && !m.nucleo) { toast('Sem um Núcleo ativo os módulos ficam inativos. Implante um núcleo (ou vista uma armadura com núcleo) antes.'); return false; }
      if (m.nucleo) {
        const freed = occupant && occupant.kind === 'protese-modulo' ? ccOf(occupant) : 0;
        const prot = m.protUsed + (mod ? 0 : ccOf(i)) - (i.slot && !mod ? ccOf(i) : 0) - freed;
        const mods = m.modUsed + (mod ? ccOf(i) : 0);
        if (prot > m.ccMax || prot + mods > m.ccMax + m.modExtra) {
          toast('Carga Cibernética insuficiente: ' + i.name + ' usa ' + ccOf(i) + ' CC. Limite ' + m.ccMax + (m.modExtra ? ' (+' + m.modExtra + ' só para módulos)' : '') + '.');
          return false;
        }
      }
    }

    if ((i.qty || 1) > 1) { // equipa uma unidade; o resto da pilha fica na mochila
      const one = deep(i);
      one.uid = uid();
      one.qty = 1;
      i.qty -= 1;
      s.inventory.push(one);
      i = one;
    }
    if (hand) {
      s.inventory.forEach((x) => { // arma de duas mãos ocupa as duas; e sai de cena se outra coisa entrar em qualquer mão
        if (x === i || (x.slot !== 'mao-d' && x.slot !== 'mao-e')) return;
        if (two || twoHanded(x) || x.slot === slotId) x.slot = '';
      });
      i.slot = two ? 'mao-d' : slotId;
    } else {
      if (occupant) occupant.slot = '';
      i.slot = slotId;
    }
    return true;
  }

  function itemFacts(i) {
    const v = i.values || {};
    const out = [];
    const add = (l, val) => { if (val !== undefined && val !== null && val !== '') out.push([l, String(val)]); };
    add('Dano', v.dano); add('Propriedade', v.subtipo); add('Modo', v.modo); add('Cadência', v.cadencia); if (i.kind !== 'municao') add('Pente', v.pente); add('Munição', v.municao); add('Alcance', v.alcance); add('Empunhadura', v.empunhadura);
    if (i.kind === 'armadura') {
      add('Defesa', v.armadura);
      add('Penalidade', num(v.penalidade) ? '–' + Math.abs(num(v.penalidade)) + ' (sem proficiência –' + Math.abs(num(v.penalidade)) * 2 + ')' : 'nenhuma');
      if (v.nucleo === 'Sim') add('Núcleo', '+' + num(v.capacidade));
    }
    if (i.kind === 'nucleo') add('Capacidade', v.capacidade);
    if (i.kind === 'protese-modulo') { add('Classe', v.classe || 'Prótese'); add('Tipo', [v.tipo, ccOf(i) + ' CC'].filter(Boolean).join(' · ')); }
    if (i.kind === 'municao') { add('Serve no', v.pente); add('Por unidade', ammoUnitText(i)); add('Só para', v.para); add('Efeito', v.efeito); }
    add('Tipo de uso', v.tipoUso); add('Usos', num(v.usos) ? v.usos : ''); add('Bônus de recuperação', v.bonusRec);
    add('Carga', fmtNum(parseCarga(v.carga)) + (i.slot ? ' (equipado: não conta)' : ''));
    add('Preço', priceText(v.preco));
    add('Criadora', v.fabricante);
    return out;
  }

  function cellCard(i, m, def, ghost) {
    const s = sheetChar.sheet;
    const card = h('div', 'cell__card');
    const act = (label, cls, fn) => { const b = h('button', 'btn btn--sm ' + cls, label); b.type = 'button'; b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(); }); return b; };
    if (!i) { // espaço vazio: diz o que aceita e oferece o que há de compatível na mochila
      card.append(h('p', 'cell__name', def.full), h('p', 'cell__meta', 'Vazio. Aceita ' + def.accepts + '.'));
      const fits = s.inventory.filter((x) => !x.slot && slotsFor(x).indexOf(def.id) >= 0).slice(0, 6);
      if (fits.length) card.append(h('div', 'cell__actions', ...fits.map((x) => act(x.name, 'btn--ghost', () => { if (equipItem(x, def.id)) changed(); }))));
      else card.append(h('p', 'cell__text', 'Nada compatível na mochila.'));
      return card;
    }
    card.append(h('p', 'cell__name', i.name + ((i.qty || 1) > 1 ? ' ×' + i.qty : ''), i.values.lore ? ' ' : '', entryLore(i)),
      h('p', 'cell__meta', [kindTitle(i.kind), i.typeTitle, i.values.raridade].filter(Boolean).join(' · ')));
    if (ghost) { card.append(h('p', 'cell__text', 'Arma de duas mãos: ocupa também esta mão.')); return card; }
    const dl = h('dl', 'cell__facts');
    itemFacts(i).forEach((f) => dl.append(h('dt', '', f[0]), h('dd', '', f[1])));
    card.append(dl);
    const pid = profIdOf(i);
    if (pid) card.append(h('p', 'cell__tag' + (isProficient(s, i) ? ' cell__tag--on' : ''), isProficient(s, i) ? 'Proficiente' : 'Sem proficiência'));
    if (i.kind === 'protese-modulo' && i.slot && !m.nucleo) card.append(h('p', 'cell__tag', 'Sem núcleo: só substitui o órgão natural'));
    const parts = (i.slots.mods || []).concat(i.slots.props || [], i.slots.accs || []).map((x) => x.name);
    if (parts.length) card.append(h('p', 'cell__text', 'Encaixes: ' + parts.join(', ')));
    if (isGun(i)) card.append(h('p', 'cell__text', 'Munição: ' + ammoLine(i, s)));
    const b = bonusLine(entryBonus(i));
    if (b) card.append(h('p', 'cell__text', 'Bônus: ' + b + (i.slot ? '' : ' (só equipado)')));
    const text = entryText(i);
    if (text) card.append(h('p', 'cell__text cell__text--clamp', text));

    const actions = h('div', 'cell__actions');
    if (i.slot) actions.append(act('Guardar', 'btn--primary', () => { i.slot = ''; changed(); }));
    else {
      const opts = slotsFor(i);
      if (opts[0] === 'modulo') actions.append(act('Instalar', 'btn--primary', () => { if (equipItem(i, 'modulo')) changed(); }));
      else if (opts[0] === 'mao-d' && twoHanded(i)) actions.append(act('Empunhar (duas mãos)', 'btn--primary', () => { if (equipItem(i, 'mao-d')) changed(); }));
      else if (opts.length === 1) actions.append(act('Equipar', 'btn--primary', () => { if (equipItem(i, opts[0])) changed(); }));
      else opts.forEach((id) => actions.append(act(slotDef(id).full, 'btn--primary', () => { if (equipItem(i, id)) changed(); })));
    }
    if (canArmory(i)) actions.append(act('Armeiro', 'btn--ghost', () => openArmory(i.uid)));
    if (isGun(i)) {
      actions.append(act('Procurar munição', 'btn--ghost', () => findAmmo(i)));
    }
    if (isPiece(i)) {
      const bt = attachButtons(s, i, () => changed());
      if (bt.length) bt.forEach((b) => actions.append(b));
      else card.append(h('p', 'cell__text', 'Nenhuma arma ou armadura da ficha aceita esta peça agora.'));
    }
    if (isAmmo(i)) {
      const guns = gunsForAmmo(s, i);
      if (!guns.length) card.append(h('p', 'cell__text', 'Nenhuma arma da ficha usa esta munição.'));
      if (guns.length) card.append(h('p', 'cell__text', 'Serve em: ' + guns.slice(0, 3).map((x) => x.name).join(', ') + '. Gasta na recarga.'));
    }
    actions.append(act('Detalhes', 'btn--ghost', () => openInvDialog(i.uid)));
    // equipado só volta para a mochila; remover fica para quando estiver guardado
    if (!i.slot) actions.append(act('Remover', 'btn--danger', () => removeInvItem(i)));
    card.append(actions);
    return card;
  }

  // tira um item do inventário (equipado ou na mochila); pilhas perguntam se tira uma ou todas
  async function removeInvItem(i) {
    const s = sheetChar.sheet;
    const qty = i.qty || 1;
    const ok = await askConfirm({
      title: 'Remover ' + i.name + '?',
      text: qty > 1 ? 'Sai uma unidade (restam ' + (qty - 1) + '). Para tirar todas, use Detalhes → Tirar do inventário.' : 'O item sai do inventário desta ficha. O original continua no banco de itens.',
      ok: 'Remover'
    });
    if (!ok || s.inventory.indexOf(i) < 0) return;
    if (qty > 1) i.qty = qty - 1; else s.inventory.splice(s.inventory.indexOf(i), 1);
    changed();
    toast(i.name + (qty > 1 ? ': uma unidade removida.' : ' saiu do inventário.'));
  }

  let dragUid = null;
  function makeCell(i, m, def, ghost) {
    const cell = h('div', 'cell' + (def ? ' cell--slot cell--' + def.id + (def.hand ? ' cell--hand' : '') : '') + (i ? ' cell--full' : '') + (ghost ? ' cell--ghost' : ''));
    const face = h('button', 'cell__face');
    face.type = 'button';
    if (i) {
      face.dataset.fid = 'cell-' + i.uid + (ghost ? '-g' : '');
      const color = rarColor(i.values.raridade);
      if (color) cell.style.setProperty('--rar', color);
      face.append(entryIcon(i));
      if ((i.qty || 1) > 1) face.append(h('span', 'cell__qty', '×' + i.qty));
      face.setAttribute('aria-label', (def ? def.full + ': ' : '') + i.name + (ghost ? ' (duas mãos)' : '') + '. Abrir detalhes.');
    } else {
      face.dataset.fid = 'slot-' + def.id;
      face.setAttribute('aria-label', def.full + ': vazio. Aceita ' + def.accepts + '.');
    }
    if (def) face.append(h('span', 'cell__label', def.label));
    const place = () => { // perto da borda direita, o retângulo abre para a esquerda
      const r = cell.getBoundingClientRect();
      cell.classList.toggle('cell--flip', r.left + 310 > window.innerWidth - 8);
    };
    cell.addEventListener('mouseenter', place);
    face.addEventListener('focus', place);
    face.addEventListener('click', (ev) => {
      ev.stopPropagation();
      place();
      const on = !cell.classList.contains('is-open');
      $$('.cell.is-open').forEach((c) => c.classList.remove('is-open'));
      cell.classList.toggle('is-open', on);
    });
    if (i && !ghost) {
      face.draggable = true;
      face.addEventListener('dragstart', (ev) => { dragUid = i.uid; ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', i.uid); });
      face.addEventListener('dragend', () => { dragUid = null; $$('.cell--drop').forEach((c) => c.classList.remove('cell--drop')); });
    }
    if (def) { // arrastar da mochila para um espaço: só entra se o espaço aceitar
      cell.addEventListener('dragover', (ev) => {
        const it = dragUid ? itemBy(dragUid) : null;
        if (!it || slotsFor(it).indexOf(def.id) < 0) return;
        ev.preventDefault();
        cell.classList.add('cell--drop');
      });
      cell.addEventListener('dragleave', () => cell.classList.remove('cell--drop'));
      cell.addEventListener('drop', (ev) => {
        ev.preventDefault();
        const it = dragUid ? itemBy(dragUid) : null;
        dragUid = null;
        if (it && equipItem(it, def.id)) changed(); else cell.classList.remove('cell--drop');
      });
    }
    cell.append(face, cellCard(i, m, def, ghost));
    return cell;
  }
  document.addEventListener('click', (ev) => { if (!ev.target.closest('.cell')) $$('.cell.is-open').forEach((c) => c.classList.remove('is-open')); });

  const OVERLOAD_TEXT = 'Sobrecarregado: deslocamento pela metade (4,5 m) e todas as ações físicas sobem uma categoria (Bônus → Movimento → Padrão) enquanto estiver acima do limite.';
  const BAG_MAX_FREE = 64; // espaços livres desenhados no máximo

  function renderInventory(m) {
    const s = sheetChar.sheet;
    const inv = s.inventory;
    const sum = h('div', 'inv-sum' + (m.over ? ' inv-sum--over' : ''),
      h('div', 'res-head', h('span', 'res-head__label', 'Carga da mochila'), h('span', 'res-head__num', fmtNum(m.cargaUsed) + ' / ' + fmtNum(m.cargaMax))),
      meter([{ key: m.over ? 'over' : 'carga', cur: Math.min(m.cargaUsed, m.cargaMax || 1), max: m.cargaMax || 1 }], 'Carga ' + fmtNum(m.cargaUsed) + ' de ' + fmtNum(m.cargaMax)),
      h('p', 'inv-sum__line', 'Limite: ' + srcText(m.src.carga) + '. Itens equipados não ocupam carga.'));
    if (m.over) sum.append(h('p', 'res-state', OVERLOAD_TEXT + ' Excesso: ' + fmtNum(m.cargaUsed - m.cargaMax) + ' de carga.'));
    $('#inv-summary').replaceChildren(sum);

    // equipado: boneco + fileira de módulos
    $('#equip-doll').replaceChildren(...EQUIP.map((def) => {
      let i = inv.find((x) => x.slot === def.id);
      let ghost = false;
      if (!i && def.id === 'mao-e') { const d = inv.find((x) => x.slot === 'mao-d'); if (d && twoHanded(d)) { i = d; ghost = true; } }
      return makeCell(i || null, m, def, ghost);
    }));
    const mods = inv.filter((x) => x.slot === 'modulo');
    $('#equip-mods').replaceChildren(...mods.map((x) => makeCell(x, m, MODULE_SLOT, false)), makeCell(null, m, MODULE_SLOT, false));

    const hands = ['mao-d', 'mao-e'].map((id) => inv.find((x) => x.slot === id));
    const handText = hands[0] && twoHanded(hands[0]) ? hands[0].name + ' (duas mãos)' : [hands[0] ? hands[0].name : 'direita livre', hands[1] ? hands[1].name : 'esquerda livre'].join(' · ');
    const line = (k, v, bad) => h('div', 'equip-line' + (bad ? ' equip-line--bad' : ''), h('span', 'equip-line__k', k), h('span', 'equip-line__v', v));
    $('#equip-info').replaceChildren(
      line('Mãos', handText),
      line('Defesa mínima', m.defMin + ' = ' + srcText(m.src.armadura) + ' · Corpo ' + signed(attrOf(s, 'corpo')) + ' · Resistência +' + num(s.skills.resistencia)),
      line('Armadura', m.armor ? m.armor.name + (m.armorProf ? ' · proficiente' : ' · sem proficiência') + (m.pen ? ' · penalidade –' + m.pen : '') : 'nenhuma (vale a básica, ' + ARMOR_BASE + ')'),
      line('Núcleo', m.nucleo ? '+' + m.nucleo + ' ativo' : 'sem núcleo: próteses só substituem o órgão; módulos inativos'),
      line('Carga Cibernética', m.nucleo || m.acopla ? 'próteses ' + m.protUsed + (m.acopla ? ' · acoplados ' + fmtNum(m.attachUsed) : '') + ' / ' + m.ccMax + ' · módulos ' + m.modUsed + (m.modExtra ? ' (reserva +' + m.modExtra + ' da Essência)' : '') : '—', m.ccOver));
    if (m.acopla) $('#equip-info').append(h('p', 'field__hint', 'Engenharia: armas e armadura em uso estão acopladas e ocupam a Carga Cibernética pela carga delas. Acoplar ou tirar leva ao menos 1 hora.'));
    if (m.ccOver) $('#equip-info').append(h('p', 'res-state', m.acopla ? 'CC acima do limite: desacople uma arma, a armadura, uma prótese ou um módulo.' : 'CC acima do limite: guarde uma prótese ou um módulo.'));

    // mochila: um bloco por item e um espaço livre por ponto de carga que ainda sobra.
    // Passar do limite não é bloqueado: os itens que estouram a carga ficam marcados.
    const bag = inv.filter((x) => !x.slot);
    let acc = 0;
    const cells = bag.map((x) => {
      acc += parseCarga(x.values.carga) * (x.qty || 1);
      const cell = makeCell(x, m, null, false);
      if (acc > m.cargaMax + 1e-9 && parseCarga(x.values.carga) > 0) { cell.classList.add('cell--over'); cell.title = 'Acima da capacidade de carga'; }
      return cell;
    });
    const free = clamp(Math.floor(m.cargaMax - m.cargaUsed + 1e-9), 0, BAG_MAX_FREE);
    for (let k = 0; k < free; k++) cells.push(h('div', 'cell cell--empty'));
    const row = 8;
    const locked = (row - (cells.length % row)) % row || (cells.length ? 0 : row);
    for (let k = 0; k < locked; k++) {
      const c = h('div', 'cell cell--locked');
      c.title = 'Sem carga livre para este espaço';
      cells.push(c);
    }
    $('#bag').replaceChildren(...cells);
    $('#bag-count').textContent = (bag.length ? '(' + plural(bag.length, 'item', 'itens') : '(vazia') + ' · ' + plural(free, 'espaço livre', 'espaços livres') + ')';
    if (invDlg.open) fillInvDialog();
  }

  // soltar um item equipado na mochila = guardar
  $('#bag').addEventListener('dragover', (ev) => { const it = dragUid ? itemBy(dragUid) : null; if (it && it.slot) ev.preventDefault(); });
  $('#bag').addEventListener('drop', (ev) => {
    const it = dragUid ? itemBy(dragUid) : null;
    dragUid = null;
    if (!it || !it.slot) return;
    ev.preventDefault();
    it.slot = '';
    changed();
  });

  /* Detalhes de um item do inventário: ficha completa, slots (mods, propriedade, acessórios) e quantidade */
  const invDlg = $('#inv-dialog');
  let invDlgUid = null;
  function fillInvDialog() {
    const i = itemBy(invDlgUid);
    if (!i) { if (invDlg.open) closeDialog(invDlg); return; }
    const s = sheetChar.sheet;
    const cat = findCategory(i.kind);
    $('#inv-dialog-title').replaceChildren(i.name, ...(entryLore(i) ? [' ', entryLore(i)] : []));
    $('#inv-dialog-meta').textContent = [kindTitle(i.kind), i.typeTitle, i.values.raridade, i.slot ? 'Equipado: ' + slotDef(i.slot).full : 'Na mochila'].filter(Boolean).join(' · ');
    const body = $('#inv-dialog-body');
    const keepFocus = body.contains(document.activeElement) ? document.activeElement.id : '';
    const facts = entryFacts(i, new Set(['nome', 'lore', 'encaixes']), i.slot ? '' : ' (só quando equipado)'); // os encaixes têm editor próprio logo abaixo
    body.replaceChildren();
    if (facts) body.append(facts);
    if (canArmory(i)) {
      const ab = h('button', 'btn btn--primary btn--sm', 'Abrir no Armeiro');
      ab.type = 'button';
      ab.addEventListener('click', () => { closeDialog(invDlg); openArmory(i.uid); });
      let fb = null;
      if (isGun(i)) {
        fb = h('button', 'btn btn--ghost btn--sm', 'Procurar munição');
        fb.type = 'button';
        fb.addEventListener('click', () => { closeDialog(invDlg); findAmmo(i); });
      }
      body.append(h('p', 'inv__arm', ab, fb ? ' ' : '', fb, isGun(i) ? ' ' + ammoLine(i, s) : ''));
    }
    // as peças montadas mudam pelo Armeiro (só com peças que o personagem tem)
    if (canArmory(i)) {
      const parts = i.slots ? (i.slots.mods || []).concat(i.slots.props || [], i.slots.accs || []).map((x) => x.name) : [];
      body.append(h('p', 'field__hint', parts.length ? 'Montado: ' + parts.join(', ') + '. Troque no Armeiro.' : 'Nada montado. Monte peças da mochila no Armeiro.'));
    }
    if (isPiece(i) && !i.slot) {
      const bt = attachButtons(s, i, () => { changed(); });
      if (bt.length) body.append(h('div', 'entry__attach-btns', ...bt));
    }

    const qty = h('input', 'input');
    qty.type = 'number';
    qty.min = '1';
    qty.step = '1';
    qty.value = i.qty || 1;
    qty.id = 'inv-qty';
    qty.disabled = Boolean(i.slot);
    qty.addEventListener('change', () => { i.qty = clamp(Math.round(num(qty.value)) || 1, 1, 999); changed(); });
    const qLab = h('label', 'field__label', i.slot ? 'Quantidade (equipado: 1)' : 'Quantidade');
    qLab.htmlFor = qty.id;
    const del = h('button', 'btn btn--sm ' + (i.slot ? 'btn--primary' : 'btn--danger'), i.slot ? 'Guardar na mochila' : 'Tirar do inventário');
    del.type = 'button';
    del.id = 'inv-foot-act';
    del.addEventListener('click', () => {
      if (i.slot) { i.slot = ''; changed(); return; }
      s.inventory.splice(s.inventory.indexOf(i), 1); closeDialog(invDlg); changed();
    });
    body.append(h('div', 'inv__foot', h('div', 'field inv__qty', qLab, qty), del));
    if (keepFocus) { const el = document.getElementById(keepFocus); if (el) el.focus({ preventScroll: true }); }
  }
  function openInvDialog(u) {
    invDlgUid = u;
    fillInvDialog();
    openDialog(invDlg);
  }
  $('#inv-dialog-close').addEventListener('click', () => closeDialog(invDlg));

  /* ---------- Munição e recarga (capítulo Recarga) ----------
     Cada arma de fogo guarda na ficha: ammo (disparos no pente; vazio = cheio), magFrom (de que munição veio
     o pente), heat (disparos da rodada e da anterior), cool (até que rodada esfria) e duplo (vez da recarga
     rápida). A arma não tem reserva: a munição são itens da mochila (ocupam espaço e carga) e a recarga gasta
     esses itens. */
  const PENTE_RULES = {
    'Pente leve': { max: 20, act: 'bonus', carga: 0.25 },
    'Pente médio': { max: 40, act: 'movimento', carga: 0.5 },
    'Pente pesado': { max: 150, act: 'completa', carga: 1 },
    'Sobrecarga': { max: 150, act: 'completa', carga: 1 }, // o livro não define: vale como pente pesado
    'Pente parcial': { partial: true, carga: 0.25 },        // ¼ de carga a cada 20 cartuchos
    'Superaquecimento': { heat: true, carga: 1 }            // cada carga de energia ocupa 1 de carga
  };
  const PENTE_STEP = ['Pente leve', 'Pente médio', 'Pente pesado'];
  const ACT_UP = { livre: 'bonus', bonus: 'movimento', movimento: 'padrao', padrao: 'completa', completa: 'completa' };
  const ALCANCES = ITEM_DATA.alcances || [];
  const isGun = (i) => Boolean(i && i.kind === 'arma-fogo');
  const sceneRound = () => (scene && scene.active ? Math.round(num(scene.round)) : 0);
  function accsOf(i) {
    const t = takenPositions({ slots: normSlots(i.slots) });
    return Object.keys(t).map((k) => t[k].acc);
  }
  const dualLight = (s) => {
    const hands = ['mao-d', 'mao-e'].map((id) => s.inventory.find((x) => x.slot === id));
    return hands.every((x) => isGun(x) && (x.typeId === 'pistola' || x.typeId === 'submetralhadora'));
  };
  // o que a arma é depois dos acessórios: pente, capacidade, ação de recarga, alcance
  function gunInfo(i, s) {
    const v = i.values || {};
    const accs = accsOf(i);
    const has = (id, word) => accs.some((a) => a.id === id || nameKey(a.name).indexOf(word) >= 0);
    const notes = [];
    let cap = Math.max(0, Math.round(num(v.municao)));
    let pente = PENTE_RULES[v.pente] ? v.pente : (cap && cap <= 20 ? 'Pente leve' : cap > 40 ? 'Pente pesado' : 'Pente médio');
    if (has('of-acc-escalar', 'escalar') && PENTE_STEP.indexOf(pente) >= 0) {
      const k = PENTE_STEP.indexOf(pente);
      const np = PENTE_STEP[k < 2 ? k + 1 : k - 1];
      cap = Math.min(PENTE_RULES[np].max, k < 2 ? (cap || PENTE_RULES[pente].max) * 2 : cap || PENTE_RULES[np].max);
      notes.push('Carregador escalar: ' + pente.toLowerCase() + ' vira ' + np.toLowerCase());
      pente = np;
    }
    const rule = PENTE_RULES[pente];
    if (rule.heat) cap = 1;
    else if (!cap) cap = rule.max || 10;
    if (rule.max && has('of-acc-estendido', 'estendido') && cap < rule.max) { cap = rule.max; notes.push('Carregador estendido: até ' + rule.max + ' disparos'); }
    let act = rule.partial ? 'livre' : rule.act;
    if (i.typeId === 'fuzil') {
      if (v.subtipo === 'Assalto (Leve)' && pente === 'Pente médio' && cap <= 30) { act = 'bonus'; notes.push('Assalto: pente médio de até 30 recarrega com ação bônus'); }
      if (v.subtipo === 'Precisão (Pesado)' && pente === 'Pente pesado' && cap <= 50) { act = 'movimento'; notes.push('Precisão: pente pesado de até 50 conta como médio'); }
      if (s && pente === 'Pente médio' && act !== 'bonus' && isProficient(s, i)) { act = 'bonus'; notes.push('Proficiente: pente médio do fuzil recarrega com ação bônus'); }
    }
    const duplo = has('of-acc-duplo', 'duplo') && !rule.partial && !rule.heat && cap <= 30;
    if (duplo) notes.push('Carregador duplo: recarga com ação bônus, uma vez sim, outra não');
    if (s && i.slot && dualLight(s)) { act = ACT_UP[act]; notes.push('Uma arma em cada mão: recarga uma categoria acima'); }
    let alcance = v.alcance || '';
    const ai = ALCANCES.indexOf(alcance);
    if (has('of-acc-cano-longo', 'cano longo') && ai >= 0 && ai < ALCANCES.length - 1) { alcance = ALCANCES[ai + 1]; notes.push('Cano longo: alcance ' + v.alcance + ' vira ' + alcance); }
    const heatMax = rule.heat ? Math.max(1, Math.round(num(v.municao)) || Math.max(1, Math.round(num(v.cadencia))) * 2) : 0;
    return { pente, rule, cap, act, duplo, alcance, heatMax, notes, unit: rule.heat ? 'carga' : rule.partial ? 'cartucho' : 'pente' };
  }
  const ammoOf = (i, g) => (i.ammo === undefined || i.ammo === null || i.ammo === '' ? g.cap : clamp(Math.round(num(i.ammo)), 0, g.cap));
  const heatNow = (i, round) => {
    const h0 = i.heat || {};
    if (!round) return num(h0.n) + num(h0.prev);
    return h0.r === round ? num(h0.n) + num(h0.prev) : h0.r === round - 1 ? num(h0.n) : 0;
  };
  const isCooling = (i, round) => Boolean(i.cool) && (i.cool < 0 || !round || round <= i.cool);
  // dá para disparar? devolve o motivo quando não dá
  function fireBlock(i, shots, round) {
    if (!isGun(i)) return '';
    const g = gunInfo(i);
    if (g.rule.heat) {
      if (!ammoOf(i, g)) return i.name + ' está sem carga de energia: recarregue.';
      if (isCooling(i, round)) return i.name + ' está superaquecida: espere esfriar.';
      return '';
    }
    const a = ammoOf(i, g);
    if (a < shots) return a ? 'Só ' + plural(a, 'disparo', 'disparos') + ' no pente de ' + i.name + '.' : i.name + ' está sem munição: recarregue.';
    return '';
  }
  // gasta os disparos; no superaquecimento soma o calor e pode travar a arma
  function fireGun(i, shots, round) {
    const g = gunInfo(i);
    if (!g.rule.heat) { i.ammo = Math.max(0, ammoOf(i, g) - shots); return ''; }
    const h0 = i.heat || {};
    let prev = 0;
    if (round && h0.r === round) prev = num(h0.prev);
    else if (round && h0.r === round - 1) prev = num(h0.n);
    const n = (round && h0.r === round ? num(h0.n) : round ? 0 : num(h0.n) + num(h0.prev)) + shots;
    i.heat = { r: round || 0, n, prev: round ? prev : 0 };
    if (n + (round ? prev : 0) > g.heatMax) { i.cool = round ? round + 1 : -1; i.heat = { r: round || 0, n: 0, prev: 0 }; return i.name + ' superaqueceu: esfria até o fim do próximo turno.'; }
    return '';
  }
  // disparos (ou cartuchos, ou cargas) que sobram numa unidade de munição da mochila
  const ammoLeft = (a) => ammoUnits(a);
  // gasta k disparos de uma unidade; a sobra fica na mochila como unidade parcial
  function spendAmmo(s, a, k) {
    const left = ammoLeft(a) - k;
    const rest = left > 0 ? Object.assign(deep(a), { uid: uid(), qty: 1, values: Object.assign({}, a.values, { disparos: String(left) }) }) : null;
    if ((a.qty || 1) > 1) a.qty -= 1;
    else s.inventory.splice(s.inventory.indexOf(a), 1);
    if (rest) s.inventory.push(rest);
  }
  // munição compatível na mochila, a mais cheia primeiro
  const bagAmmo = (s, i) => (s ? ammoForGun(s, i) : []).sort((x, y) => ammoLeft(y) - ammoLeft(x));
  // recarrega gastando munição da mochila; n = cartuchos no pente parcial. Devolve { cost, msg } ou { err }
  function reloadGun(i, s, n) {
    const g = gunInfo(i, s);
    const bag = bagAmmo(s, i);
    const none = { err: 'Sem munição para ' + i.name + ' na mochila (' + g.pente.toLowerCase() + '). Procure munição.' };
    if (g.rule.heat) {
      if (!bag.length) return none;
      const a = bag[0];
      spendAmmo(s, a, ammoLeft(a));
      i.ammo = 1;
      i.heat = { r: 0, n: 0, prev: 0 };
      i.cool = 0;
      return { cost: 'completa', msg: 'carga nova de ' + a.name + ' (vale a cena inteira, até 2 cenas seguidas)' };
    }
    const cur = ammoOf(i, g);
    if (cur >= g.cap) return { err: 'O pente de ' + i.name + ' já está cheio.' };
    if (!bag.length) return none;
    if (g.rule.partial) {
      const want = Math.min(n || 2, g.cap - cur, 10);
      let got = 0;
      bag.forEach((a) => {
        while (got < want && s.inventory.indexOf(a) >= 0) { const k = Math.min(ammoLeft(a), want - got); spendAmmo(s, a, k); got += k; }
      });
      i.ammo = cur + got;
      return { cost: got <= 2 ? 'livre' : got <= 5 ? 'bonus' : 'movimento', msg: plural(got, 'cartucho', 'cartuchos') };
    }
    // troca o pente: o novo sai da mochila; o velho, se ainda tem disparos, volta para ela
    const a = bag[0];
    const fill = Math.min(g.cap, ammoLeft(a));
    const old = i.magFrom || slotSnap(a);
    spendAmmo(s, a, fill);
    if (cur > 0) s.inventory.push(Object.assign(invEntryFrom(old), { qty: 1, values: Object.assign({}, old.values, { disparos: String(cur) }) }));
    i.ammo = fill;
    i.magFrom = slotSnap(a);
    let cost = g.act;
    if (g.duplo) { cost = i.duplo ? g.act : 'bonus'; i.duplo = !i.duplo; }
    return { cost, msg: 'pente com ' + fill + ' disparos' + (cur > 0 ? '; o pente velho (' + cur + ') foi para a mochila' : '') };
  }
  // quanto há na mochila para esta arma (pentes, cartuchos ou cargas)
  function bagAmmoText(i, s) {
    const g = gunInfo(i, s);
    const bag = bagAmmo(s, i);
    if (!bag.length) return 'nada na mochila';
    const units = bag.reduce((t, a) => t + (a.qty || 1), 0);
    if (g.rule.partial) return plural(bag.reduce((t, a) => t + ammoLeft(a) * (a.qty || 1), 0), 'cartucho', 'cartuchos') + ' na mochila';
    return plural(units, g.rule.heat ? 'carga' : 'pente', g.rule.heat ? 'cargas' : 'pentes') + ' na mochila';
  }
  function ammoLine(i, s) {
    if (!isGun(i)) return '';
    const g = gunInfo(i, s);
    if (g.rule.heat) return (ammoOf(i, g) ? 'carga ativa' : 'sem carga') + ' · calor ' + heatNow(i, 0) + '/' + g.heatMax + (isCooling(i, 0) ? ' · superaquecida' : '') + ' · ' + bagAmmoText(i, s);
    return 'pente ' + ammoOf(i, g) + '/' + g.cap + ' · ' + bagAmmoText(i, s);
  }

  /* ---------- Munição como item ----------
     Um item de munição serve na arma quando o pente bate (depois dos acessórios) e, se o item
     limita as armas ("Para"), quando o tipo da arma está na lista. Fica na mochila (ocupa espaço
     e carga) até a recarga gastar. */
  const isAmmo = (i) => Boolean(i && i.kind === 'municao');
  function ammoUnits(a) {
    const v = a.values || {};
    const n = Math.round(num(v.disparos));
    if (n > 0) return n;
    const r = PENTE_RULES[v.pente];
    return r && r.max ? r.max : r && r.heat ? 1 : 20;
  }
  const ammoUnitText = (a) => ((a.values || {}).pente === 'Superaquecimento' ? plural(ammoUnits(a), 'carga', 'cargas') : (a.values || {}).pente === 'Pente parcial' ? plural(ammoUnits(a), 'cartucho', 'cartuchos') : plural(ammoUnits(a), 'disparo', 'disparos'));
  function ammoFits(a, gun, s) {
    if (!isAmmo(a) || !isGun(gun)) return false;
    const v = a.values || {};
    if (v.pente && v.pente !== gunInfo(gun, s).pente) return false;
    const para = String(v.para || '').split(/[,;/]|\be\b|\bou\b/).map((x) => stemWords(x).join(' ')).filter(Boolean);
    if (!para.length) return true;
    const cat = findCategory(gun.kind);
    const type = findType(cat, gun.typeId);
    const kinds = [gun.typeId, gun.typeTitle, type && type.title, type && type.prof].filter(Boolean).map((x) => stemWords(x).join(' '));
    return para.some((p) => kinds.some((k) => k.indexOf(p) === 0 || p.indexOf(k) === 0));
  }
  const ammoForGun = (s, gun) => s.inventory.filter((x) => !x.slot && ammoFits(x, gun, s));
  const gunsForAmmo = (s, a) => s.inventory.filter((x) => ammoFits(a, x, s));
  // "Procurar munição": abre a busca do banco só com o que serve na arma e põe na mochila
  async function findAmmo(gun) {
    const ch = sheetChar;
    if (!ch || !isGun(gun)) return;
    const s = ch.sheet;
    const g = gunInfo(gun, s);
    const e = await openPicker({ title: 'Munição para ' + gun.name, kinds: ['municao'], filter: (x) => ammoFits(x, gun, s),
      chips: [g.pente, gun.typeTitle].filter(Boolean) });
    if (!e || sheetChar !== ch || s.inventory.indexOf(gun) < 0) return;
    // a munição achada vai para a mochila (ocupa espaço e carga); a recarga gasta dela
    s.inventory.push(Object.assign(slotSnap(e), { uid: uid(), slots: normSlots(null), thumb: e.thumb || '', qty: 1, slot: '' }));
    changed();
    if (armDlg && armDlg.open) drawArmory();
    toast(e.name + ' entrou na mochila. Recarregue ' + gun.name + ' para usar.');
  }

  /* ---------- Acoplar rápido ----------
     No popup de um mod, propriedade ou acessório: acha sozinho as armas (e armaduras, para
     propriedades) da ficha que aceitam a peça. Se o espaço já está ocupado, tira o que está lá
     e põe a peça nova no lugar. Devolve null quando o item nem aceita esse tipo de peça. */
  function planAttach(target, e) {
    const info = slotInfo(target);
    if (!info || info.embedded) return null;
    const t = { slots: normSlots(deep(target.slots)) };
    const removed = [];
    const parts = []; // as peças que saem (voltam para a mochila)
    const same = (a) => (a.id && e.id ? a.id === e.id : a.name === e.name);
    const dropMod = (m) => { t.slots.mods.splice(t.slots.mods.indexOf(m), 1); removed.push(m.name); parts.push(m); };
    const dropAcc = (a) => { t.slots.accs.splice(t.slots.accs.indexOf(a), 1); removed.push(a.name); parts.push(a); };
    const clearPos = (pos) => { const tk = takenPositions(t)[pos]; if (tk) { if (tk.mod) dropMod(tk.mod); else dropAcc(tk.acc); } };
    const v = e.values || {};
    if (e.kind === 'acessorio') {
      if (!isWeapon(target.kind) || e.typeId !== target.kind || info.positions.indexOf(v.posicao) < 0) return null;
      const tk = takenPositions(t)[v.posicao];
      if (tk && same(tk.acc)) return { already: true };
      if (!info.mods) return { why: target.name + ' não tem slot de mod para acessórios (raridade ' + info.rar + ').' };
      clearPos(v.posicao);
      t.slots.accs.push(slotSnap(e));
      while (slotUse(t).total > info.mods && t.slots.mods.length) dropMod(t.slots.mods[0]); // acessórios precisam de slot de mod livre
    } else if (e.kind === 'mod-arma') {
      if (!isWeapon(target.kind) || (v.para && v.para !== 'Qualquer arma' && v.para !== WEAPON_PARA[target.kind])) return null;
      if (t.slots.mods.some(same)) return { already: true };
      if (modCost(e) > info.mods) return { why: e.name + ' usa ' + plural(modCost(e), 'slot', 'slots') + '; ' + target.name + ' tem ' + info.mods + '.' };
      ((e.slots && e.slots.accs) || []).forEach((a) => clearPos(a.values.posicao));
      const mod = slotSnap(e);
      t.slots.mods.push(mod);
      while (slotUse(t).total > info.mods) {
        const old = t.slots.mods.find((m) => m !== mod);
        if (old) dropMod(old);
        else if (t.slots.accs.length) dropAcc(t.slots.accs[0]);
        else break;
      }
    } else if (e.kind === 'propriedade') {
      const isArmor = target.kind === 'armadura';
      if (!isWeapon(target.kind) && !isArmor) return null;
      if (v.para && v.para !== 'Qualquer item' && v.para !== (isArmor ? 'Armadura' : 'Arma')) return null;
      if (t.slots.props.some(same)) return { already: true };
      if (!info.props) return { why: target.name + ' (' + info.rar + ') não comporta propriedade.' };
      while (t.slots.props.length >= info.props) { removed.push(t.slots.props[0].name); parts.push(t.slots.props.shift()); }
      t.slots.props.push(slotSnap(e));
    } else return null;
    if (slotUse(t).total > info.mods && !info.embedded) return { why: 'Não sobra slot de mod em ' + target.name + '.' };
    return { slots: t.slots, removed, parts };
  }
  /* Peças são itens: só monta quem tem. Montar tira uma unidade da mochila; o que sai da arma volta para ela. */
  const PIECE_KINDS = ['mod-arma', 'propriedade', 'acessorio'];
  const isPiece = (x) => Boolean(x && PIECE_KINDS.indexOf(x.kind) >= 0);
  const samePiece = (a, b) => (a.id && b.id ? a.id === b.id : nameKey(a.name) === nameKey(b.name));
  function takeFromBag(s, x) {
    if ((x.qty || 1) > 1) { x.qty -= 1; return; }
    const k = s.inventory.indexOf(x);
    if (k >= 0) s.inventory.splice(k, 1);
  }
  function returnToBag(s, parts) {
    parts.forEach((p) => {
      const same = s.inventory.find((x) => !x.slot && isPiece(x) && samePiece(x, p) && !(p.slots && p.slots.accs && p.slots.accs.length));
      if (same) same.qty = (same.qty || 1) + 1;
      else s.inventory.push(Object.assign(invEntryFrom(p), { qty: 1 }));
    });
  }
  // monta a peça que já está fora da arma (mochila, ou já comprada/tirada do armazém)
  function mountPiece(s, target, e) {
    const plan = planAttach(target, e);
    if (!plan || !plan.slots) return null;
    target.slots = plan.slots;
    returnToBag(s, plan.parts);
    return plan;
  }
  // "Acoplar em ..." com uma peça da mochila (cartão, detalhes e popup)
  function attachButtons(s, piece, after) {
    return armoryItems(s).map((x) => ({ x, p: planAttach(x, piece) })).filter((r) => r.p && r.p.slots)
      .sort((a, b) => (a.p.removed.length - b.p.removed.length) || (Number(Boolean(b.x.slot)) - Number(Boolean(a.x.slot))))
      .slice(0, 4).map((r, k) => {
        const b = h('button', 'btn btn--sm ' + (k ? 'btn--ghost' : 'btn--primary'), 'Acoplar em ' + r.x.name + (r.p.removed.length ? ' (troca ' + r.p.removed.join(', ') + ')' : ''));
        b.type = 'button';
        b.dataset.fid = 'attach-' + r.x.uid;
        b.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (s.inventory.indexOf(piece) < 0) { toast(piece.name + ' não está mais na mochila.'); return; }
          const name = piece.name;
          takeFromBag(s, piece);
          const plan = mountPiece(s, r.x, slotSnap(piece));
          if (!plan) { returnToBag(s, [piece]); toast('Não deu para acoplar: a arma mudou.'); return; }
          after();
          toast('Acoplou ' + name + ' em ' + r.x.name + '.' + (plan.removed.length ? ' ' + plan.removed.join(', ') + ' voltou para a mochila.' : ''));
        });
        return b;
      });
  }
  // popup de uma peça do banco: só acopla se a ficha aberta tem a peça na mochila
  function quickAttachBox(e) {
    if (!isPiece(e)) return null;
    const ch = sheetChar;
    const box = h('div', 'entry__attach', h('h3', 'entry__sub', 'Acoplar rápido'));
    if (!ch || !(ch.mine || isMyChar(ch.id))) { box.append(h('p', 'field__hint', 'Abra a ficha de um personagem seu para acoplar esta peça.')); return box; }
    const s = ch.sheet;
    const own = s.inventory.find((x) => !x.slot && isPiece(x) && samePiece(x, e));
    if (!own) {
      box.append(h('p', 'field__hint', ch.name + ' não tem ' + e.name + ' na mochila. Compre numa loja ou pegue num armazém pelo Armeiro da campanha.'));
      return box;
    }
    const btns = attachButtons(s, own, () => { touchSheet(); rerender(); if (armDlg && armDlg.open) drawArmory(); closeDialog(entryDlg); });
    if (!btns.length) {
      const plans = armoryItems(s).map((x) => planAttach(x, own)).filter(Boolean);
      const whys = plans.filter((p) => p.why).slice(0, 3).map((p) => p.why);
      box.append(h('p', 'field__hint', plans.some((p) => p.already) ? e.name + ' já está acoplado.' : whys.length ? whys.join(' ') : 'Nenhum item de ' + ch.name + ' aceita esta peça.'));
      return box;
    }
    box.append(h('p', 'field__hint', 'Na mochila de ' + ch.name + ((own.qty || 1) > 1 ? ' (×' + own.qty + ')' : '') + '. Se o espaço estiver ocupado, a peça que está lá volta para a mochila.'),
      h('div', 'entry__attach-btns', ...btns));
    return box;
  }

  /* ---------- Armeiro ----------
     Como no Call of Duty e no Battlefield, só que nas regras do livro: escolhe a arma, toca numa posição
     (mira, bocal...) ou num slot de mod/propriedade e troca a peça na lista ao lado. Os números da arma
     mudam na hora (pente, recarga, alcance), e a munição fica no mesmo lugar. */
  let armDlg = null;
  // m: membro da campanha (Armeiro da campanha: mochila, armazéns e lojas); sem m, a ficha aberta (só a mochila)
  const arm = { uid: '', sel: '', q: '', lib: null, m: null, busy: false, cat: false };
  const armSheet = () => (arm.m ? arm.m.sheet : sheetChar && sheetChar.sheet);
  const ARM_SPOTS = {
    'arma-fogo': { Mira: 'top', Bocal: 'right', Carregador: 'bottom', Empunhadura: 'left' },
    'arma-melee': { Ponta: 'right', Dorso: 'top', Empunhadura: 'bottom', Cabo: 'left' }
  };
  // o que entra no Armeiro: tudo que recebe mod, acessório ou propriedade pelas regras (armas e armaduras)
  const canArmory = (i) => Boolean(i) && (isWeapon(i.kind) || i.kind === 'armadura');
  const armoryItems = (s) => s.inventory.filter(canArmory)
    .sort((a, b) => (Number(isWeapon(b.kind)) - Number(isWeapon(a.kind))) || (Number(Boolean(b.slot)) - Number(Boolean(a.slot))));
  function openArmory(u, m) {
    const ch = m || sheetChar;
    if (!ch || !ch.sheet) return;
    const guns = armoryItems(ch.sheet);
    if (!guns.length) { toast('Nenhuma arma ou armadura no inventário. Adicione uma do banco para usar o Armeiro.'); return; }
    if (!armDlg) {
      armDlg = h('dialog', 'dialog armory');
      armDlg.setAttribute('aria-labelledby', 'armory-title');
      armDlg.addEventListener('close', () => { arm.lib = null; });
      document.body.append(armDlg);
    }
    arm.uid = u && guns.some((w) => w.uid === u) ? u : guns[0].uid;
    arm.sel = '';
    arm.q = '';
    arm.cat = false;
    arm.lib = null;
    arm.m = m || null;
    drawArmory();
    openDialog(armDlg);
  }
  // salva: na ficha aberta, como qualquer edição; na campanha, grava a mochila (e o dinheiro) do personagem
  async function armSave() {
    if (!arm.m) { touchSheet(); rerender(); drawArmory(); return; }
    const local = arm.m.sheet;
    const camp = currentCamp && currentCamp.id;
    arm.busy = true;
    drawArmory();
    try {
      await patchMemberSheet(arm.m, (sh) => {
        sh.inventory = deep(local.inventory);
        if (camp) { sh.money = Object.assign({}, sh.money); sh.money[camp] = num((local.money || {})[camp]); }
      });
    } catch (err) { toast(errorMessage(err)); }
    arm.busy = false;
    if (armDlg.open) drawArmory();
    if (typeof renderShops === 'function') renderShops();
  }
  /* De onde vêm as peças: a mochila sempre; no Armeiro da campanha também os armazéns liberados e as
     lojas (comprando). Cada fonte sabe tirar uma unidade e devolve true quando deu certo. */
  function armSources(s) {
    const out = [];
    s.inventory.filter((x) => !x.slot && isPiece(x)).forEach((x) => out.push({
      e: x, where: 'Na mochila' + ((x.qty || 1) > 1 ? ' ×' + x.qty : ''), act: 'Montar',
      take: async () => { if (s.inventory.indexOf(x) < 0) return false; takeFromBag(s, x); return true; }
    }));
    if (!arm.m || !currentCamp) return out;
    const camp = currentCamp.id;
    vaults.filter(vaultUsable).forEach((v) => (v.items || []).filter(isPiece).forEach((x) => out.push({
      e: x, where: v.name + ((x.qty || 1) > 1 ? ' ×' + x.qty : ''), act: 'Tirar e montar',
      take: async () => {
        const cur = vaults.find((y) => y.id === v.id) || v;
        const it = (cur.items || []).find((y) => y.uid === x.uid);
        if (!it) { toast(x.name + ' já saiu de ' + v.name + '.'); return false; }
        const items = (it.qty || 1) > 1 ? cur.items.map((y) => (y.uid === it.uid ? Object.assign({}, y, { qty: y.qty - 1 }) : y)) : cur.items.filter((y) => y.uid !== it.uid);
        return saveCol('vaults', v.id, { items, log: lootLog(cur, arm.m.name + ' tirou ' + it.name + ' para montar no Armeiro.') });
      }
    })));
    shops.forEach((sh) => shopStock(sh).filter((it) => it.sale && isPiece(it.entry) && !(sh.kind === 'jogador' && sh.ownerCharId === arm.m.characterId)).forEach((it) => {
      const price = shopPrice(sh, it);
      out.push({
        e: decorate(it.entry), where: sh.name + ' · ' + fmtCronos(price) + ' Cronos', act: 'Comprar e montar', price,
        take: async () => {
          if (num((s.money || {})[camp]) < price) { toast(arm.m.name + ' tem ' + fmtCronos(num((s.money || {})[camp])) + ' Cronos; ' + it.entry.name + ' custa ' + fmtCronos(price) + '.'); return false; }
          const fresh = shops.find((x) => x.id === sh.id) || sh;
          const cur = shopStock(fresh).find((x) => x.uid === it.uid);
          if (!cur || (cur.qty !== null && cur.qty !== undefined && cur.qty < 1)) { toast('Esse item acabou.'); return false; }
          const items = fresh.items.map((x) => (x.uid === cur.uid && x.qty !== null && x.qty !== undefined ? Object.assign({}, x, { qty: x.qty - 1 }) : x))
            .filter((x) => x.qty === null || x.qty === undefined || x.qty > 0);
          try { await db.updateShop(camp, sh.id, { items, log: shopLog(fresh, arm.m.name + ' comprou ' + cur.entry.name + ' por ' + fmtCronos(price) + ' Cronos (Armeiro).') }); }
          catch (err) { toast(errorMessage(err)); return false; }
          if (sh.kind === 'jogador') await payMember(sh.ownerCharId, price).catch(() => {});
          s.money = Object.assign({}, s.money);
          s.money[camp] = num(s.money[camp]) - price;
          return true;
        }
      });
    }));
    return out;
  }
  function drawArmory() {
    const s = armSheet();
    if (!s || !armDlg) return;
    const ch = arm.m || sheetChar;
    const guns = armoryItems(s);
    const w = guns.find((x) => x.uid === arm.uid) || guns[0];
    if (!w) { closeDialog(armDlg); return; }
    arm.uid = w.uid;
    w.slots = w.slots && w.slots.mods ? w.slots : normSlots(w.slots);
    const info = slotInfo(w);
    const use = slotUse(w);
    const per = SLOT_RULES.acessoriosPorSlot || 3;
    const taken = takenPositions(w);
    const positions = info.positions;
    if (!arm.sel || (arm.sel === 'mod' && !info.mods) || (arm.sel.indexOf('pos:') === 0 && positions.indexOf(arm.sel.slice(4)) < 0)) arm.sel = positions[0] ? 'pos:' + positions[0] : info.mods ? 'mod' : 'prop';
    const keep = armDlg.contains(document.activeElement) ? document.activeElement.dataset.fid : '';

    // cabeçalho e troca de arma
    const close = h('button', 'btn btn--ghost btn--sm', 'Fechar');
    close.type = 'button';
    close.addEventListener('click', () => closeDialog(armDlg));
    const tabs = h('div', 'armory__guns', ...guns.map((g) => {
      const b = h('button', 'armory__gun' + (g.uid === w.uid ? ' is-on' : ''), entryIcon(g), h('span', 'armory__gun-name', g.name));
      b.type = 'button';
      b.dataset.fid = 'arm-gun-' + g.uid;
      b.setAttribute('aria-pressed', String(g.uid === w.uid));
      const c = rarColor(g.values.raridade);
      if (c) b.style.setProperty('--rar', c);
      b.addEventListener('click', () => { arm.uid = g.uid; arm.sel = ''; drawArmory(); });
      return b;
    }));

    // a arma no centro, com as posições em volta
    const spots = ARM_SPOTS[w.kind] || {};
    const spot = (pos) => {
      const t = taken[pos];
      const b = h('button', 'armory__spot armory__spot--' + (spots[pos] || 'top') + (arm.sel === 'pos:' + pos ? ' is-on' : '') + (t ? ' is-full' : ''),
        h('span', 'armory__spot-pos', pos), h('span', 'armory__spot-part', t ? t.acc.name : 'vazio'));
      b.type = 'button';
      b.dataset.fid = 'arm-pos-' + nameKey(pos);
      if (t && t.mod) b.title = 'Vem no mod ' + t.mod.name;
      b.addEventListener('click', () => { arm.sel = 'pos:' + pos; arm.jump = true; drawArmory(); });
      return b;
    };
    const color = rarColor(w.values.raridade) || 'var(--linha-forte)';
    const body = h('div', 'armory__body');
    body.style.setProperty('--rar', color);
    body.append(h('div', 'armory__gunart', entryIcon(w), h('strong', '', w.name), h('span', 'armory__gunmeta', [w.typeTitle, w.values.raridade].filter(Boolean).join(' · '))));
    const stage = h('div', 'armory__stage', body, ...positions.map(spot));

    // slots de mod e de propriedade
    const slotBtn = (id, label, part, locked) => {
      const b = h('button', 'armory__slot' + (arm.sel === id ? ' is-on' : '') + (part ? ' is-full' : '') + (locked ? ' is-locked' : ''), h('span', 'armory__slot-k', label), h('span', 'armory__slot-v', part || (locked ? 'bloqueado' : 'vazio')));
      b.type = 'button';
      b.dataset.fid = 'arm-' + id.replace(':', '-');
      b.addEventListener('click', () => { arm.sel = id; arm.jump = true; drawArmory(); });
      return b;
    };
    const slotRow = h('div', 'armory__slots',
      !info.mods ? null : slotBtn('mod', 'Mods · ' + use.total + '/' + info.mods + (use.acc ? ' (' + use.acc + ' com acessórios)' : ''), w.slots.mods.map((x) => x.name).join(', ')),
      slotBtn('prop', 'Propriedade · ' + w.slots.props.length + '/' + info.props, w.slots.props.map((x) => x.name).join(', '), !info.props));

    // lista de peças do que está selecionado: primeiro o que está montado, depois o que dá para montar
    const panel = h('div', 'armory__panel');
    const row = (e, on, opt) => {
      const label = on ? 'Tirar' : opt.act || 'Montar';
      const btn = h('button', 'btn btn--sm ' + (on ? 'btn--ghost' : 'btn--primary'), label);
      btn.type = 'button';
      btn.dataset.fid = 'arm-part-' + nameKey(e.name).replace(/\s+/g, '-') + (opt.n ? '-' + opt.n : '');
      btn.disabled = Boolean(opt.why) || arm.busy;
      if (opt.why) btn.title = opt.why;
      btn.addEventListener('click', opt.run);
      const li = h('li', 'armory__part' + (on ? ' is-on' : ''), h('span', 'armory__part-info', h('strong', '', e.name, e.oficial ? ' ' : '', e.oficial ? h('span', 'tag', 'Oficial') : null),
        h('span', 'armory__part-meta', [on ? 'Montado' : opt.where, e.values.raridade, e.values.para, e.kind === 'mod-arma' ? modCost(e) + (modCost(e) === 1 ? ' slot' : ' slots') : ''].filter(Boolean).join(' · ')),
        entryText(e) ? h('span', 'armory__part-text', entryText(e)) : null,
        e.slots && e.slots.accs && e.slots.accs.length ? h('span', 'armory__part-meta', 'Traz: ' + e.slots.accs.map((x) => x.name + ' (' + x.values.posicao + ')').join(', ')) : null,
        opt.swap ? h('span', 'armory__why armory__why--swap', 'Troca: ' + opt.swap + ' (volta para a mochila)') : null,
        opt.why ? h('span', 'armory__why', opt.why) : null), btn);
      const c = rarColor(e.values.raridade);
      if (c) li.style.setProperty('--rar', c);
      return li;
    };
    const match = (e) => !arm.q || searchScore(entryFields(e), arm.q) > 0;
    // tirar: a peça sai da arma e vai para a mochila
    const unmount = (list, piece) => () => { list.splice(list.indexOf(piece), 1); returnToBag(s, [piece]); toast(piece.name + ' voltou para a mochila.'); armSave(); };
    // montar: tira uma unidade da fonte e põe na arma (o que estava no lugar volta para a mochila)
    const mountFrom = (src, plan) => async () => {
      if (arm.busy) return;
      arm.busy = true;
      const ok = await src.take();
      arm.busy = false;
      if (!ok) { drawArmory(); return; }
      const done = mountPiece(s, w, slotSnap(src.e));
      if (!done) { returnToBag(s, [slotSnap(src.e)]); toast('Não coube: ' + src.e.name + ' foi para a mochila.'); }
      else toast('Montou ' + src.e.name + ' em ' + w.name + '.' + (done.removed.length ? ' ' + done.removed.join(', ') + ' voltou para a mochila.' : ''));
      armSave();
    };
    const sources = armSources(s);
    // "Compatíveis": pesquisa no catálogo inteiro o que encaixa no espaço, tendo ou não a peça.
    // O que a pessoa tem (mochila, armazém, loja) monta; o resto aparece só para consulta.
    const libOf = (kind) => {
      arm.lib = arm.lib || {};
      if (!arm.lib[kind]) {
        arm.lib[kind] = BUILTINS.filter((e) => e.kind === kind);
        libSearch([kind], '').then((l) => { if (arm.lib) { arm.lib[kind] = l; drawArmory(); } }).catch(() => { /* fica o catálogo oficial */ });
      }
      return arm.lib[kind];
    };
    const candRows = (test, kind) => {
      const own = sources.filter((src) => test(src.e) && match(src.e)).map((src, n) => {
        const plan = planAttach(w, src.e);
        if (!plan || plan.already) return null;
        const poor = src.price !== undefined && arm.m && currentCamp && num((s.money || {})[currentCamp.id]) < src.price ? 'Dinheiro insuficiente.' : '';
        return { e: src.e, li: row(src.e, false, { act: src.act, where: src.where, n: n + 1, why: plan.why || poor, swap: plan.slots && plan.removed.length ? plan.removed.join(', ') : '', run: mountFrom(src, plan) }) };
      }).filter(Boolean);
      if (!arm.cat) return own.map((x) => x.li);
      const rest = libOf(kind).filter((e) => test(e) && match(e) && !sources.some((src) => samePiece(src.e, e))).filter((e) => { const plan = planAttach(w, e); return plan && !plan.already; })
        .map((e) => row(e, false, { act: 'Sem a peça', where: 'Você não tem', n: 0, why: arm.m ? 'Não está na mochila, nos armazéns liberados nem nas lojas.' : 'Não está na mochila. Compre numa loja ou use o Armeiro da campanha.', run: () => {} }));
      return own.map((x) => x.li).concat(rest);
    };
    let items = [];
    let title = '';
    let hint = '';
    if (arm.sel.indexOf('pos:') === 0) {
      const pos = arm.sel.slice(4);
      const t = taken[pos];
      title = pos;
      if (t && t.mod) hint = 'Esta posição vem no mod ' + t.mod.name + '. Montar outro acessório aqui tira o mod.';
      else hint = 'Um acessório por posição. Cada slot de mod livre leva ' + per + ' acessórios.';
      if (t) items.push(row(t.acc, true, t.mod ? { why: 'Vem no mod ' + t.mod.name + '.', run: () => {} } : { run: unmount(w.slots.accs, t.acc) }));
      items = items.concat(candRows((e) => e.kind === 'acessorio' && e.values.posicao === pos && e.typeId === w.kind, 'acessorio'));
    } else if (arm.sel === 'mod') {
      title = 'Mods';
      hint = 'Raridade ' + info.rar + ': ' + info.mods + (info.mods === 1 ? ' slot' : ' slots') + ' de mod. Mod Comum usa 1, Rara usa 2, Lendária usa 3.';
      items = w.slots.mods.map((m) => row(m, true, { run: unmount(w.slots.mods, m) })).concat(candRows((e) => e.kind === 'mod-arma', 'mod-arma'));
    } else {
      title = 'Propriedade';
      hint = info.props ? 'A raridade ' + info.rar + ' comporta ' + plural(info.props, 'propriedade', 'propriedades') + '.' : 'A raridade ' + info.rar + ' não comporta propriedade. Só Incomum, Épica e Lendária.';
      if (w.kind === 'armadura') hint += ' Armadura não recebe mods nem acessórios, só propriedade.';
      items = w.slots.props.map((x) => row(x, true, { run: unmount(w.slots.props, x) })).concat(candRows((e) => e.kind === 'propriedade', 'propriedade'));
    }
    hint += arm.m ? ' Peças da mochila, dos armazéns liberados e das lojas (comprando).' : ' Só aparecem as peças que estão na mochila; armazéns e lojas ficam no Armeiro da campanha.';
    const q = h('input', 'input');
    q.type = 'search';
    q.id = 'arm-q';
    q.dataset.fid = 'arm-q';
    q.placeholder = 'Buscar peça';
    q.autocomplete = 'off';
    q.value = arm.q;
    q.addEventListener('input', () => { arm.q = q.value; drawArmory(); });
    const qLab = h('label', 'visually-hidden', 'Buscar peça');
    qLab.htmlFor = q.id;
    const mode = (cat, label) => {
      const b = h('button', 'chip chip--toggle', label);
      b.type = 'button';
      b.dataset.fid = cat ? 'arm-cat' : 'arm-own';
      b.setAttribute('aria-pressed', String(arm.cat === cat));
      b.addEventListener('click', () => { arm.cat = cat; drawArmory(); });
      return b;
    };
    const modes = h('div', 'armory__modes', h('span', 'picker__filter-label', 'Mostrar:'), mode(false, 'Minhas'), mode(true, 'Compatíveis'));
    const none = arm.q ? 'Nenhuma peça com esse nome.' : arm.cat ? 'Nenhuma peça do catálogo encaixa em ' + title + '.'
      : (arm.m ? 'Nenhuma peça para cá na mochila, nos armazéns liberados ou nas lojas.' : 'Nenhuma peça para cá na mochila.') + ' Toque em "Compatíveis" para ver tudo o que encaixa aqui.';
    panel.append(h('h3', 'armory__ptitle', title), h('p', 'field__hint', hint), qLab, q, modes,
      items.length ? h('ul', 'armory__parts', ...items) : h('p', 'empty', none));

    // números da arma e munição
    const stat = (k, v, changed) => h('div', 'armory__stat' + (changed ? ' is-changed' : ''), h('span', '', k), h('strong', '', v || '—'));
    const stats = h('div', 'armory__stats');
    const ammoBox = h('div', 'armory__ammo');
    if (isGun(w)) {
      const g = gunInfo(w, s);
      stats.append(stat('Dano', w.values.dano), stat('Modo', w.values.modo), stat('Cadência', w.values.cadencia),
        stat('Alcance', g.alcance, g.alcance !== (w.values.alcance || '')), stat('Pente', g.pente, g.pente !== w.values.pente),
        stat(g.rule.heat ? 'Superaquece com' : 'Capacidade', g.rule.heat ? g.heatMax + ' disparos em 2 turnos' : g.cap + ' disparos', !g.rule.heat && g.cap !== Math.round(num(w.values.municao))),
        stat('Recarga', g.rule.heat ? 'ação completa (troca a carga)' : g.rule.partial ? 'livre (2) · bônus (5) · movimento (10)' : COST_LONG[g.act] + (g.duplo ? ' (bônus alternada)' : '') + (g.pente === 'Pente leve' ? ' (padrão se debilitado)' : '')));
      const a = ammoOf(w, g);
      const res = bagAmmo(s, w).length > 0; // munição compatível na mochila
      const btn = (label, fid, fn, dis) => { const b = h('button', 'btn btn--ghost btn--sm', label); b.type = 'button'; b.dataset.fid = fid; b.disabled = Boolean(dis); b.addEventListener('click', fn); return b; };
      const reload = (n) => { const r = reloadGun(w, s, n); if (r.err) { toast(r.err); return; } toast('Recarregou ' + w.name + ': ' + r.msg + ' (em combate: ' + COST_LONG[r.cost] + ').'); armSave(); };
      const bar = h('div', 'armory__mag');
      const cells = g.rule.heat ? 1 : Math.min(g.cap, 40);
      for (let k = 0; k < cells; k++) bar.append(h('span', 'armory__round' + (k < Math.ceil(a * cells / g.cap) ? ' is-on' : '')));
      ammoBox.append(...[h('h3', 'armory__ptitle', 'Munição'),
        h('p', 'armory__ammo-now', g.rule.heat ? (a ? 'Carga de energia ativa' : 'Sem carga de energia') : h('span', '', h('strong', '', String(a)), ' / ' + g.cap + ' no pente')), bar,
        g.rule.heat ? h('p', 'field__hint', 'Calor: ' + heatNow(w, 0) + ' de ' + g.heatMax + ' disparos (rodada atual + anterior).' + (isCooling(w, 0) ? ' Superaquecida.' : '')) : null,
        h('p', 'field__hint', 'Na mochila: ' + bagAmmoText(w, s).replace(/ na mochila$/, '') + '. A recarga gasta a munição da mochila; a arma não guarda reserva.'),
        h('div', 'armory__ammo-btns',
          g.rule.partial ? btn('+2 cartuchos', 'arm-reload-2', () => reload(2), a >= g.cap || !res) : btn(g.rule.heat ? 'Trocar carga' : 'Recarregar', 'arm-reload', () => reload(0), (!g.rule.heat && a >= g.cap) || !res),
          g.rule.partial ? btn('+5', 'arm-reload-5', () => reload(5), a >= g.cap || !res) : null,
          g.rule.partial ? btn('+10', 'arm-reload-10', () => reload(10), a >= g.cap || !res) : null,
          g.rule.heat && isCooling(w, 0) ? btn('Esfriar', 'arm-cool', () => { w.cool = 0; w.heat = { r: 0, n: 0, prev: 0 }; armSave(); }) : null,
          arm.m ? null : btn('Procurar munição', 'arm-find-ammo', () => findAmmo(w)),
          null),
        g.notes.length ? h('ul', 'armory__notes', ...g.notes.map((n) => h('li', '', n))) : null].filter(Boolean));
    } else if (w.kind === 'armadura') {
      stats.append(stat('Defesa', w.values.armadura), stat('Penalidade', num(w.values.penalidade) ? '–' + Math.abs(num(w.values.penalidade)) : 'nenhuma'),
        stat('Carga', fmtNum(parseCarga(w.values.carga))), stat('Núcleo', w.values.nucleo === 'Sim' ? '+' + num(w.values.capacidade) : 'não'));
    } else {
      stats.append(stat('Dano', w.values.dano), stat('Empunhadura', w.values.empunhadura), stat('Carga', fmtNum(parseCarga(w.values.carga))));
    }

    armDlg.replaceChildren(
      h('div', 'armory__head', h('h2', 'dialog__title', h('span', '', 'Armeiro'), ch && ch.name ? h('small', 'armory__who', ' · ' + ch.name + (arm.m && currentCamp ? ' · ' + fmtCronos(num((s.money || {})[currentCamp.id])) + ' Cronos' : '')) : null), close),
      tabs,
      h('div', 'armory__grid',
        h('div', 'armory__left', stage, slotRow, stats, ammoBox.children.length ? ammoBox : null),
        panel));
    $('h2.dialog__title', armDlg).id = 'armory-title';
    const on = $('.armory__gun.is-on', armDlg);
    if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    // no celular a lista de peças fica embaixo: tocar numa posição leva até ela
    if (arm.jump && window.matchMedia('(max-width: 860px)').matches) panel.scrollIntoView({ block: 'start', behavior: 'smooth' });
    arm.jump = false;
    if (keep) { const el = $('[data-fid="' + keep + '"]', armDlg); if (el) { el.focus({ preventScroll: true }); if (keep === 'arm-q') el.setSelectionRange(el.value.length, el.value.length); } }
  }

  $('#inv-armory').addEventListener('click', () => openArmory(''));
  $('#inv-add').addEventListener('click', async () => {
    const ch = sheetChar;
    const picked = await openPickerMany({ title: 'Adicionar ao inventário', kinds: INVENTORY_KINDS, chips: [
      { label: 'Armas', kinds: ['arma-melee', 'arma-fogo'] }, { label: 'Munições', kinds: ['municao'] }, { label: 'Armaduras', kinds: ['armadura'] }, { label: 'Vestíveis', kinds: ['vestivel'] },
      { label: 'Implantes', kinds: ['nucleo', 'protese-modulo'] }, { label: 'Peças de slot', kinds: ['mod-arma', 'propriedade', 'acessorio'] }, { label: 'Itens gerais', kinds: ['item-geral'] }], filter: (x) => INVENTORY_KINDS.indexOf(x.kind) >= 0 });
    if (!picked.length || sheetChar !== ch) return;
    const wasOver = compute(ch).over;
    picked.forEach((e) => ch.sheet.inventory.push(Object.assign(slotSnap(e), { uid: uid(), slots: normSlots(e.slots), thumb: e.thumb || '', qty: 1, slot: '' })));
    changed();
    const m = compute(ch);
    // não impede: só avisa das desvantagens quando a carga passa do limite
    toast((picked.length > 1 ? picked.length + ' itens entraram' : picked[0].name + ' entrou') + ' no inventário.' + (m.over ? (wasOver ? ' Continua sobrecarregado (' : ' Agora está sobrecarregado (') + fmtNum(m.cargaUsed) + ' / ' + fmtNum(m.cargaMax) + '): deslocamento pela metade e ações físicas sobem uma categoria.' : ''));
  });

  $('#form-quick-item').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = cleanName($('#quick-item-name').value);
    if (!name) { $('#quick-item-name').focus(); return; }
    sheetChar.sheet.inventory.push(quickEntry2(name, fmtNum(parseCarga($('#quick-item-carga').value)), ''));
    ev.target.reset();
    changed();
  });

  $('#power-add').addEventListener('click', async () => {
    const ch = sheetChar;
    const have = ch.sheet.powers.map((p) => p.id).filter((id) => id && !CHOICE_POWERS[id]);
    const e = await openPicker({ title: 'Adicionar poder', kinds: ['poder'], chips: ['Poder'], filter: (x) => x.kind === 'poder' && have.indexOf(x.id) < 0 });
    if (!e || sheetChar !== ch) return;
    const kind = CHOICE_POWERS[e.id];
    if (kind) {
      const s = ch.sheet;
      const ATTR = { corpo: 'Corpo', precisao: 'Precisão', essencia: 'Essência' };
      const items = kind === 'pericia'
        ? Object.keys(SKILLS).reduce((all, k) => all.concat(SKILLS[k].map((sk) => ({ value: sk[0], name: sk[1], meta: ATTR[k] || k }))), []).filter((x) => doutorOf(s).indexOf(x.value) < 0)
        : PROFS.filter((p) => (p.id.indexOf('armadura-') === 0) === (kind === 'armadura') && !hasProf(s, p.id)).map((p) => ({ value: p.id, name: p.label }));
      if (!items.length) { toast('Nada disponível para ' + e.name + ': o personagem já tem todas as opções.'); return; }
      const choice = await askCards({ title: e.name, tag: kind === 'pericia' ? 'Escolha a perícia' : kind === 'arma' ? 'Escolha o tipo de arma' : 'Escolha o tipo de armadura',
        efeito: (e.values && e.values.efeito) || '', hint: 'Custa ' + num(e.values && e.values.custo) + ' UP por compra e dá +1 em uma perícia à sua escolha (o ponto entra em Perícias). Para outra escolha, compre o poder de novo.', items, ok: 'Pegar' });
      if (!choice || sheetChar !== ch) return;
      s.powers.push(choicePower(e, choice));
    } else if (powerOpts(e).length) {
      openPowerOpts(ch, e, null);
      return;
    } else {
      ch.sheet.powers.push(Object.assign(slotSnap(e), { thumb: e.thumb || '' }));
    }
    changed();
  });

  /* Escolha das opções de um poder-lista (Defensivas, Ataques), no modelo das características raciais:
     cada opção é um cartão com o efeito e o botão de pegar ou devolver. O poder entra na ficha com a
     primeira opção pega e sai quando a última é devolvida. */
  let powOptDlg = null;
  function openPowerOpts(ch, e, cur) {
    if (!powOptDlg) { powOptDlg = h('dialog', 'dialog pickchar racial powopt'); powOptDlg.setAttribute('aria-labelledby', 'powopt-title'); document.body.append(powOptDlg); }
    const dlg = powOptDlg;
    let p = cur;
    const cost = num(e.values && e.values.custo);
    const opts = powerOpts(e);
    const q = h('input', 'input');
    q.type = 'search';
    q.id = 'powopt-q';
    q.autocomplete = 'off';
    q.placeholder = 'Buscar opção (nome ou efeito)';
    const qLab = h('label', 'visually-hidden', 'Buscar opção');
    qLab.htmlFor = 'powopt-q';
    const content = h('div', 'racial__content');
    const draw = () => {
      const s = ch.sheet;
      const m = compute(ch);
      const free = m.upTotal - m.upSpent;
      const picks = p ? powerPicks(p) : [];
      const shown = rankSearch(opts, q.value, (o) => [[o.name, 10], [[o.text, o.cost].filter(Boolean).join(' '), 2]]);
      const cards = shown.map((o) => {
        const have = picks.indexOf(o.name) >= 0;
        const b = h('button', 'btn btn--sm ' + (have ? 'btn--ghost' : 'btn--primary'), have ? 'Devolver' : 'Pegar · ' + cost + ' UP');
        b.type = 'button';
        b.dataset.fid = ('powopt-' + nameKey(o.name)).replace(/\s+/g, '-');
        b.addEventListener('click', () => {
          if (have) {
            p.picks = powerPicks(p).filter((n) => n !== o.name);
            if (!p.picks.length) { const k = s.powers.indexOf(p); if (k >= 0) s.powers.splice(k, 1); p = null; }
          } else if (p) p.picks = powerPicks(p).concat([o.name]);
          else { p = Object.assign(slotSnap(e), { thumb: e.thumb || '', picks: [o.name] }); s.powers.push(p); }
          changed();
          draw();
          const again = $('[data-fid="' + b.dataset.fid + '"]', content);
          if (again) again.focus();
        });
        return h('li', 'pickchar__card racial__trait' + (have ? ' is-here' : ''),
          h('span', 'pickchar__info', h('strong', 'pickchar__name', o.name),
            h('span', 'pickchar__meta', [cost + ' UP', o.cost ? 'uso ' + o.cost : ''].filter(Boolean).join(' · ')),
            o.text ? h('span', 'racial__text', o.text) : null), b);
      });
      content.replaceChildren(
        h('p', 'racial__free' + (free < 0 ? ' is-over' : ''), 'UP livres: ', h('strong', '', String(free)),
          ' · ', plural(picks.length, 'opção pega', 'opções pegas')),
        shown.length ? h('ul', 'pickchar__list', ...cards) : h('p', 'empty', 'Nenhuma opção com esse nome.'));
    };
    q.addEventListener('input', draw);
    const close = h('button', 'btn btn--primary btn--sm', 'Pronto');
    close.type = 'button';
    close.addEventListener('click', () => closeDialog(dlg));
    const title = h('h2', '', e.name);
    title.id = 'powopt-title';
    const ef = e.values && e.values.efeito;
    dlg.replaceChildren(h('div', 'pickchar__body', title,
      h('p', 'racial__only', 'Escolha as opções'),
      ef ? h('p', 'powopt__efeito', ef) : null,
      h('p', 'field__hint', 'Cada opção custa ' + cost + ' UP. Pegue quantas quiser; dá para devolver aqui ou desmarcar depois na lista de poderes.'),
      opts.length > 6 ? h('div', 'field racial__search', qLab, q) : null,
      content,
      h('div', 'dialog__actions', close)));
    draw();
    openDialog(dlg);
  }

  $('#species-pick').addEventListener('click', async () => {
    const ch = sheetChar;
    const e = await openPicker({ title: 'Escolher espécime', kinds: ['especime'], chips: ['Espécime'], filter: (x) => x.kind === 'especime' });
    if (!e || sheetChar !== ch) return;
    ch.sheet.specimen = Object.assign(slotSnap(e), { thumb: e.thumb || '' });
    ch.species = e.name;
    fSpecies.value = e.name;
    dirty.add('species');
    grantBirthPowers(ch.sheet);
    changed();
  });

  /* ---------- Espécime: poderes de nascença e características raciais ----------
     O espécime pode dar poderes de graça (Etheriano: Cria do Éter) e pode deixar comprar, com UP,
     características raciais de outros espécimes. Cada característica comprada vira um poder na lista. */
  // espécime oficial: vale o catálogo atual (a cópia antiga da ficha tinha a mecânica nos campos)
  function specimenVals(s) {
    const sp = s.specimen;
    const official = sp ? BUILTINS.find((e) => e.id === sp.id) : null;
    return official ? Object.assign({}, official.values) : Object.assign({}, (sp && sp.values) || {});
  }
  // poderes de nascença que a v=48 dava aos espécimes oficiais: a mecânica agora mora nas habilidades raciais
  const OLD_BIRTH = /^of-pod-esp-/;
  const birthNames = (v) => String((v && v.poderes) || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const findBirthPower = (n) => guidePowers().find((x) => nameKey(x.name) === nameKey(n)) || BUILTINS.find((x) => x.kind === 'poder' && nameKey(x.name) === nameKey(n));
  // a mecânica de um espécime do banco: os scripts dos poderes de nascença (e os campos antigos, se tiver)
  function speciesMech(e) {
    const v = (e && e.values) || {};
    const official = e && e.id ? BUILTINS.some((x) => x.id === e.id) : false;
    const parts = official ? [] : [legacySpecies(v)];
    birthNames(v).forEach((n) => { const p = findBirthPower(n); if (p) parts.push(parseScript(powerScript(p))); });
    racialLines(v).forEach((t) => parts.push(parseScript(t.script)));
    return mergeMech(parts);
  }
  // a mecânica da ficha: espécime antigo + scripts de todos os poderes (os de nascença valem mesmo fora da lista)
  function sheetMech(s) {
    const sp = s.specimen;
    const official = sp ? BUILTINS.some((e) => e.id === sp.id) : false;
    const v = specimenVals(s);
    const own = sp ? 'racial:' + (sp.id || nameKey(sp.name)) + ':' : '';
    // as habilidades raciais do próprio espécime valem direto dele (uma cópia na lista não conta duas vezes)
    const powers = s.powers.filter((p) => !OLD_BIRTH.test(p.id || '') && !(own && String(p.id || '').indexOf(own) === 0));
    birthNames(v).forEach((n) => {
      if (powers.some((p) => nameKey(p.name) === nameKey(n))) return;
      const p = findBirthPower(n);
      if (p) powers.push(p);
    });
    const parts = sp && !official ? [legacySpecies(specimenVals(s))] : [];
    let vidaFrom = sp && parts.length && parts[0].vida ? sp.name : '';
    const bonus = []; // bônus fixos dos scripts, cada um com o nome de onde veio
    const add = (name, txt) => {
      const x = parseScript(txt);
      if (x.vida) vidaFrom = name;
      if (Object.keys(x.bonus).length) bonus.push({ name, b: x.bonus });
      parts.push(x);
    };
    racialLines(v).forEach((t) => add(t.name, t.script));
    powers.forEach((p) => add(p.name, powerScript(p)));
    return Object.assign(mergeMech(parts), { powers, vidaFrom, bonus });
  }
  // comprar características raciais de outros espécimes é exclusivo do Etheriano
  function isEtheriano(sp) { return Boolean(sp && (sp.id === 'of-esp-etheriano' || nameKey(sp.name) === 'etheriano')); }
  const racialLines = (v) => powerLines(v && v.racial).map((t) => Object.assign(t, { cost: t.cost === '' ? 1 : Math.max(0, Math.round(num(t.cost))) }));
  const racialId = (esp, t) => 'racial:' + (esp.id || nameKey(esp.name)) + ':' + nameKey(t.name);
  function grantBirthPowers(s) {
    const names = birthNames(specimenVals(s));
    // trocar de espécime tira os poderes de nascença do anterior (a mecânica dele vinha deles)
    s.powers = s.powers.filter((p) => !OLD_BIRTH.test(p.id || '') && (!p.birth || names.some((n) => nameKey(n) === nameKey(p.name))));
    names.forEach((n) => {
      if (s.powers.some((p) => nameKey(p.name) === nameKey(n))) return;
      const e = findBirthPower(n);
      if (e) s.powers.push(Object.assign(slotSnap(e), { thumb: e.thumb || '', birth: true }));
    });
  }
  let racialDlg = null;
  let racialPick = '';
  let racialOpen = false; // lista de espécimes expandida
  // de cada espécime, o Etheriano pega uma ou duas das 3 habilidades raciais, nunca as 3
  const RACIAL_MAX = 2;
  const racialTaken = (s, esp) => racialLines(esp.values).filter((t) => s.powers.some((p) => p.id === racialId(esp, t))).length;
  function racialAll(s, esp, id) {
    return !s.powers.some((p) => p.id === id) && racialTaken(s, esp) >= RACIAL_MAX;
  }
  async function openRacial() {
    const ch = sheetChar;
    if (!ch) return;
    if (!isEtheriano(ch.sheet.specimen)) { toast('Características raciais de outros espécimes são exclusivas do Etheriano.'); return; }
    if (!racialDlg) { racialDlg = h('dialog', 'dialog pickchar racial'); racialDlg.setAttribute('aria-labelledby', 'racial-title'); document.body.append(racialDlg); }
    const dlg = racialDlg;
    let list = BUILTINS.filter((e) => e.kind === 'especime' && !e.secreto);
    try { list = await libSearch(['especime'], ''); } catch (err) { /* fica o catálogo oficial */ }
    const mine = ch.sheet.specimen;
    list = list.filter((e) => racialLines(e.values).length && !isEtheriano(e) && !(mine && (e.id === mine.id || nameKey(e.name) === nameKey(mine.name))));
    // busca por espécime: fica fora do que é redesenhado, para não perder o foco ao digitar
    const q = h('input', 'input');
    q.type = 'search';
    q.id = 'racial-q';
    q.autocomplete = 'off';
    q.placeholder = 'Buscar espécime (nome ou característica)';
    const qLab = h('label', 'visually-hidden', 'Buscar espécime');
    qLab.htmlFor = 'racial-q';
    const content = h('div', 'racial__content');
    const draw = () => {
      const s = ch.sheet;
      const m = compute(ch);
      const free = m.upTotal - m.upSpent;
      const shown = rankSearch(list, q.value, (e) => [[e.name, 10], [racialLines(e.values).map((t) => t.name).join(' '), 4], [[e.values.descricao, e.values.lore].filter(Boolean).join(' '), 1]]);
      if (!shown.some((e) => e.id === racialPick)) racialPick = shown[0] ? shown[0].id : '';
      const esp = shown.find((e) => e.id === racialPick);
      // com muitos espécimes, mostra só os primeiros (e o escolhido); o resto abre no "Mostrar todos"
      const LIMIT = 6;
      const cut = !racialOpen && !q.value && shown.length > LIMIT + 1;
      const visible = cut ? shown.slice(0, LIMIT).concat(esp && shown.indexOf(esp) >= LIMIT ? [esp] : []) : shown;
      const more = shown.length > LIMIT + 1 && !q.value ? h('button', 'link-btn racial__more', racialOpen ? 'Mostrar menos' : 'Mostrar todos (' + shown.length + ')') : null;
      if (more) {
        more.type = 'button';
        more.setAttribute('aria-expanded', String(racialOpen));
        more.dataset.fid = 'racial-more';
        more.addEventListener('click', () => { racialOpen = !racialOpen; draw(); const m = $('[data-fid="racial-more"]', content); if (m) m.focus(); });
      }
      const races = h('div', 'racial__races', ...visible.map((e) => {
        const b = h('button', 'racial__race' + (e.id === racialPick ? ' is-on' : ''), entryIcon(e), h('span', '', e.name));
        b.type = 'button';
        b.setAttribute('aria-pressed', String(e.id === racialPick));
        b.addEventListener('click', () => { racialPick = e.id; draw(); });
        return b;
      }));
      const traits = esp ? racialLines(esp.values).map((t) => {
        const id = racialId(esp, t);
        const have = s.powers.findIndex((p) => p.id === id);
        const full = racialAll(s, esp, id);
        const b = h('button', 'btn btn--sm ' + (have >= 0 || full ? 'btn--ghost' : 'btn--primary'), have >= 0 ? 'Devolver' : full ? 'Já tem 2 deste espécime' : 'Pegar · ' + t.cost + ' UP');
        b.type = 'button';
        b.dataset.fid = ('racial-' + nameKey(esp.name) + '-' + nameKey(t.name)).replace(/\s+/g, '-');
        b.disabled = have < 0 && t.cost > free && !racialAll(s, esp, id);
        b.addEventListener('click', () => {
          if (have >= 0) s.powers.splice(have, 1);
          else if (racialAll(s, esp, id)) { toast(/^experi[eê]ncia passada/i.test(t.name) ? 'Se achando muito esperto, não é? Os 3 UP do Humano não vêm juntos.' : 'Do ' + esp.name + ' dá para pegar só uma ou duas das 3 habilidades. Devolva uma para trocar.'); return; }
          else s.powers.push({ id, kind: 'poder', typeId: '', typeTitle: '', name: (esp.name + ' · ' + t.name).slice(0, 60), values: { custo: String(t.cost), efeito: t.text, script: t.script }, bonus: {}, slots: null, thumb: '', racial: esp.name });
          changed();
          draw();
        });
        return h('li', 'pickchar__card racial__trait' + (have >= 0 ? ' is-here' : ''),
          h('span', 'pickchar__info', h('strong', 'pickchar__name', t.name), h('span', 'pickchar__meta', t.cost + ' UP'), t.text ? h('span', 'racial__text', t.text) : null), b);
      }) : [];
      const taken = esp ? racialTaken(s, esp) : 0;
      content.replaceChildren(...[ // replaceChildren escreveria "null" na tela para o botão que não existe
        h('p', 'racial__free' + (free < 0 ? ' is-over' : ''), 'UP livres: ', h('strong', '', String(free))),
        races,
        more,
        esp ? h('h3', 'pickchar__sub', esp.name) : h('p', 'empty', q.value ? 'Nenhum espécime com esse nome.' : 'Nenhum espécime com características raciais.'),
        esp ? h('p', 'field__hint racial__count', 'Escolhidas: ' + taken + ' de ' + RACIAL_MAX + ' (uma ou duas das ' + racialLines(esp.values).length + ' habilidades)') : null,
        h('ul', 'pickchar__list', ...traits)].filter(Boolean));
    };
    q.addEventListener('input', draw);
    const close = h('button', 'btn btn--ghost btn--sm', 'Fechar');
    close.type = 'button';
    close.addEventListener('click', () => closeDialog(dlg));
    const title = h('h2', '', 'Características raciais');
    title.id = 'racial-title';
    dlg.replaceChildren(h('div', 'pickchar__body', title,
      h('p', 'racial__only', 'Exclusivo do Etheriano'),
      h('p', 'field__hint', 'Só o Etheriano gasta UP em características raciais. De qualquer espécime, inclusive dos criados na Oficina, ele escolhe uma ou duas das 3 habilidades raciais. Busque ou toque num espécime para ver as habilidades dele.'),
      h('div', 'field racial__search', qLab, q),
      content,
      h('div', 'dialog__actions', close)));
    draw();
    openDialog(dlg);
  }
  $('#racial-open').addEventListener('click', openRacial);

  /* ---------- Pré-jogadas ----------
     Testes prontos montados a partir da ficha: atributo, perícia e ataque com a arma escolhida.
     Usados na ficha (bloco Rolagens e botão de cada perícia) e na tela da campanha. */
  const ATTR_LABEL = { corpo: 'Corpo', precisao: 'Precisão', essencia: 'Essência' };
  const SKILL_ATTR = {};
  const SKILL_LABEL = {};
  Object.keys(SKILLS).forEach((a) => SKILLS[a].forEach((sk) => { SKILL_ATTR[sk[0]] = a; SKILL_LABEL[sk[0]] = sk[1]; }));

  function attrTest(s, attr) {
    return { label: 'Teste de ' + ATTR_LABEL[attr], attrName: ATTR_LABEL[attr], attr: attrOf(s, attr) };
  }
  function skillTest(s, m, sk) {
    const attr = SKILL_ATTR[sk];
    const name = sk === 'oficio' && s.oficio ? 'Ofício (' + String(s.oficio).slice(0, 30) + ')' : SKILL_LABEL[sk];
    const pen = PENALTY_SKILLS.indexOf(sk) >= 0 ? m.pen : 0;
    return { label: name, attrName: ATTR_LABEL[attr], attr: attrOf(s, attr), skillName: name, skill: skillOf(s, sk), mods: pen ? [['armadura', -pen]] : [] };
  }

  // formas de atacar com um item (ou desarmado), conforme as regras de Ataque e de cada tipo de arma
  function attackModes(s, i) {
    const out = [];
    const prof = i ? isProficient(s, i) : false;
    if (!i || i.kind !== 'arma-fogo') {
      out.push({ id: 'corpo', label: 'Corpo a corpo (Corpo + Luta)', attr: 'corpo', skill: 'luta' });
      if (i && i.typeId === 'espada' && prof) out.push({ id: 'precisao', label: 'Espada com Precisão (Precisão + Luta)', attr: 'precisao', skill: 'luta' });
    } else {
      out.push({ id: 'precisao', label: 'À distância (Precisão + Mira)', attr: 'precisao', skill: 'mira' });
      if (i.typeId === 'submetralhadora') out.push({ id: 'essencia', label: 'Submetralhadora com Essência (Essência + Mira)', attr: 'essencia', skill: 'mira', mod: prof ? 0 : -1 });
    }
    out.push({ id: 'tec', label: 'Tecnológico (Essência + Operações)', attr: 'essencia', skill: 'operacoes' });
    return out;
  }
  /* Poder Luta: ataques por rodada = UP investidos em Luta + 1, gastos como a cadência de uma arma de fogo,
     desarmado (conta como arma contundente, com proficiência) ou com arma corpo a corpo. */
  // ataques de Luta por rodada: Poder (UP investidos em Luta, com o estilo) + a perícia Luta
  const hasLuta = (s) => ((s && s.powers) || []).some((p) => p.id === 'of-pod-luta');
  const lutaAttacks = (s) => (hasLuta(s) ? Math.max(1, attrOf(s, 'corpo') + skillOf(s, 'luta')) : 0);
  const maxShots = (i, s) => (i && i.kind === 'arma-fogo' ? clamp(Math.round(num(i.values.cadencia)) || 1, 1, 20)
    : (!i || i.kind === 'arma-melee') && lutaAttacks(s) ? clamp(lutaAttacks(s), 1, 20) : 1);
  const atkProf = (s, i) => (i ? isProficient(s, i) : lutaAttacks(s) > 0); // desarmado com Luta é proficiente
  const shotWord = (i, n) => (i && i.kind === 'arma-fogo' ? (n === 1 ? 'disparo' : 'disparos') : (n === 1 ? 'golpe' : 'golpes'));
  // cadência: com proficiência, –N para N disparos; sem, –(1 + 2 + ... + N). Um disparo não tem penalidade.
  const shotPenalty = (n, prof) => (n <= 1 ? 0 : prof ? n : (n * (n + 1)) / 2);

  /* Cadência por alvo: os disparos da ação se dividem entre os alvos marcados.
     A penalidade vem do total de disparos; o dano de cada alvo é multiplicado pelos disparos nele.
     st.per = { idDoAlvo: disparos }. Devolve os campos, o total e se faltou cadência. */
  function perTargetShots(st, cad, targets, prof, redraw, idp, wi) {
    st.per = st.per || {};
    Object.keys(st.per).forEach((k) => { if (!targets.some((x) => x.id === k)) delete st.per[k]; });
    targets.forEach((x) => { st.per[x.id] = clamp(Math.round(st.per[x.id] || 1), 1, cad); });
    let total = targets.reduce((a, x) => a + st.per[x.id], 0);
    for (let k = targets.length - 1; total > cad && k >= 0; k--) {
      const cut = Math.min(st.per[targets[k].id] - 1, total - cad);
      st.per[targets[k].id] -= cut;
      total -= cut;
    }
    const over = targets.length > cad;
    const rows = targets.map((x) => {
      const sel = h('select', 'input');
      sel.id = idp + 'per-' + x.id.replace(/[^a-z0-9]/gi, '');
      const room = Math.max(1, cad - (total - st.per[x.id]));
      for (let k = 1; k <= room; k++) { const o = h('option', '', k + ' ' + shotWord(wi, k) + ' · dano ×' + k); o.value = String(k); sel.append(o); }
      sel.value = String(st.per[x.id]);
      sel.addEventListener('change', () => { st.per[x.id] = Math.round(num(sel.value)) || 1; redraw(); });
      const lab = h('label', 'per__name', x.name);
      lab.htmlFor = sel.id;
      return h('div', 'per__row', lab, sel);
    });
    const pen = shotPenalty(Math.min(total, cad), prof);
    const box = h('fieldset', 'per field--wide',
      h('legend', 'field__label', (wi && wi.kind === 'arma-fogo' ? 'Cadência' : 'Golpes') + ' por alvo: ' + Math.min(total, cad) + ' de ' + cad + ' ' + shotWord(wi, cad) + (pen ? ' · –' + pen + ' no ataque' + (prof ? ' (perita)' : '') : '')),
      ...rows,
      over ? h('p', 'field__error', 'A cadência ' + cad + ' só alcança ' + plural(cad, 'alvo', 'alvos') + '. Desmarque alvos no Combate.') : null);
    return { box, total: Math.min(total, cad), over };
  }

  /* Regra de cadência na arena: antes de escolher os alvos, mostra a penalidade de cada número de disparos,
     com ou sem proficiência na arma, e deixa atacar com um disparo só. */
  function cadenceBox(st, cad, prof, redraw, idp, wi) {
    const w1 = shotWord(wi, 1), wn = shotWord(wi, 2);
    const use = h('input');
    use.type = 'checkbox';
    use.id = idp + 'cad-use';
    use.checked = st.cad !== false;
    use.addEventListener('change', () => { st.cad = use.checked; redraw(); });
    const steps = [];
    for (let k = 1; k <= cad; k++) steps.push(h('span', 'cad__step' + (k === 1 ? ' cad__step--free' : ''), h('b', '', k + '×'), ' ' + (k === 1 ? 'sem penalidade' : '–' + shotPenalty(k, prof))));
    return h('div', 'cad field--wide' + (st.cad === false ? ' cad--off' : ''),
      h('label', 'check cad__use', use, h('span', '', (wi && wi.kind === 'arma-fogo' ? 'Usar cadência' : 'Ataques múltiplos de Luta') + ' (até ' + cad + ' ' + wn + ')')),
      h('p', 'cad__rule', prof
        ? 'Proficiente: cadência perita. Cada ' + w1 + ' a mais dá penalidade igual ao total de ' + wn + '.'
        : 'Sem proficiência: a penalidade soma cada ' + w1 + ' (1 + 2 + 3...). Com proficiência seria só o total.'),
      st.cad === false ? h('p', 'cad__rule', 'Ataque com um ' + w1 + ', sem penalidade.') : h('div', 'cad__steps', ...steps),
      st.cad === false ? null : h('p', 'cad__rule', 'O dano de cada alvo é multiplicado pelos ' + wn + ' nele.'));
  }

  function attackTest(s, m, i, modeId, shots) {
    const modes = attackModes(s, i);
    const mode = modes.find((x) => x.id === modeId) || modes[0];
    const prof = atkProf(s, i);
    const n = clamp(Math.round(shots) || 1, 1, maxShots(i, s));
    const mods = [];
    if (mode.mod) mods.push(['Essência sem proficiência', mode.mod]);
    if (PENALTY_SKILLS.indexOf(mode.skill) >= 0 && m.pen) mods.push(['armadura', -m.pen]);
    const pen = shotPenalty(n, prof);
    if (pen) mods.push(['cadência ' + n + ' ' + shotWord(i, n) + (prof ? ' (perita)' : ''), -pen]);
    const name = i ? i.name : 'Desarmado';
    return {
      label: ('Ataque: ' + name + (n > 1 ? ' · dano ×' + n : '')).slice(0, 60),
      attrName: ATTR_LABEL[mode.attr], attr: attrOf(s, mode.attr),
      skillName: SKILL_LABEL[mode.skill], skill: skillOf(s, mode.skill), mods
    };
  }
  const weaponsOf = (s) => s.inventory.filter((i) => isWeapon(i.kind))
    .sort((a, b) => Number(Boolean(b.slot)) - Number(Boolean(a.slot)));

  // lista de testes de uma ficha (usada no seletor da campanha)
  function testCatalog(c) {
    const s = c.sheet;
    const m = compute(c);
    const out = [];
    ATTRS.forEach((at) => out.push({ group: 'Atributos', id: 'a:' + at.id, label: at.label + ' ' + signed(attrOf(s, at.id)), make: () => attrTest(s, at.id) }));
    ATTRS.forEach((at) => SKILLS[at.id].forEach((sk) => {
      const t = skillTest(s, m, sk[0]);
      const fixed = t.attr + t.skill + t.mods.reduce((x, y) => x + y[1], 0);
      out.push({ group: 'Perícias', id: 's:' + sk[0], label: t.skillName + ' ' + signed(fixed), make: () => skillTest(s, m, sk[0]) });
    }));
    return out;
  }

  /* Penalidades de alcance (capítulo Penalidades): –3 por faixa fora da efetiva; alvo adjacente com arma à distância, –2 */
  const DISTANCES = [
    { id: '', label: 'Na distância efetiva da arma', mod: 0 },
    { id: 'f1', label: '1 faixa acima ou abaixo da efetiva (–3)', short: 'fora do alcance efetivo', mod: -3 },
    { id: 'f2', label: '2 faixas fora (–6)', short: 'fora do alcance efetivo', mod: -6 },
    { id: 'f3', label: '3 faixas fora (–9)', short: 'fora do alcance efetivo', mod: -9 },
    { id: 'adj', label: 'Alvo adjacente: muito perto (–2)', short: 'muito perto', mod: -2 }
  ];
  const NO_ADJ_PENALTY = ['pistola', 'revolver', 'espingarda-cano-curto']; // não recebem a penalidade de alvo adjacente
  // Ganho, perda, vantagem e desvantagem (capítulo Testes e Dados)
  const DICE_OPTS = [
    { id: 'n2', label: 'Normal (2d6)', dice: 2 },
    { id: 'n3', label: 'Ganho: 3º dado (3d6)', dice: 3 },
    { id: 'n4', label: 'Ganho do mestre: 4º dado (4d6)', dice: 4 },
    { id: 'n1', label: 'Perda: um dado a menos (1d6)', dice: 1 },
    { id: 'adv', label: 'Vantagem (fica com os melhores)', dice: 2, adv: 'vantagem' },
    { id: 'dis', label: 'Desvantagem (fica com os piores)', dice: 2, adv: 'desvantagem' }
  ];
  const diceOpt = (st) => DICE_OPTS.find((d) => d.id === st.dice) || DICE_OPTS[0];
  const diceText = (st) => { const d = diceOpt(st); return d.dice + 'd6' + (d.adv ? ' ' + d.adv : ''); };
  function applyDice(t, st) { const d = diceOpt(st); t.dice = d.dice; t.adv = d.adv || ''; return t; }
  function diceSelect(st, draw) {
    const sel = h('select', 'input');
    DICE_OPTS.forEach((d) => { const o = h('option', '', d.label); o.value = d.id; sel.append(o); });
    sel.value = diceOpt(st).id;
    sel.addEventListener('change', () => { st.dice = sel.value; draw(); });
    return sel;
  }

  /* Ação de ataque (fica na campanha, no painel de cada personagem seu).
     st guarda as escolhas: { uid, mode, shots, mod }. onRoll recebe o teste pronto. */
  function attackBuilder(c, st, onRoll, idp) {
    const s = c.sheet;
    const m = compute(c);
    const box = h('div', 'attack');
    const draw = () => {
      const all = weaponsOf(s);
      const weapons = all.filter((w) => (!c.handsOnly || handOf(w)) && (!c.meleeOnly || w.kind === 'arma-melee'));
      if (st.uid && !weapons.some((w) => w.uid === st.uid)) st.uid = null;
      if (st.uid === null || st.uid === undefined) st.uid = weapons[0] ? weapons[0].uid : '';
      const weapon = weapons.find((w) => w.uid === st.uid) || null;
      const modes = attackModes(s, weapon);
      if (!modes.some((x) => x.id === st.mode)) st.mode = modes[0].id;
      st.shots = clamp(st.shots || 1, 1, maxShots(weapon, s));

      const field = (id, label, control) => { control.id = idp + id; const l = h('label', 'field__label', label); l.htmlFor = control.id; return h('div', 'field', l, control); };
      const wSel = h('select', 'input');
      [['', 'Desarmado']].concat(weapons.map((w) => [w.uid, w.name + (w.slot ? ' (em mãos)' : ' (na mochila)')])).forEach((p) => { const o = h('option', '', p[1]); o.value = p[0]; wSel.append(o); });
      wSel.value = st.uid;
      wSel.addEventListener('change', () => { st.uid = wSel.value; st.mode = ''; st.shots = 1; draw(); });
      const mSel = h('select', 'input');
      modes.forEach((x) => { const o = h('option', '', x.label); o.value = x.id; mSel.append(o); });
      mSel.value = st.mode;
      mSel.addEventListener('change', () => { st.mode = mSel.value; draw(); });
      const fields = [field('weapon', 'Arma', wSel), field('mode', 'Forma de ataque', mSel)];
      const targets = c.targets || [];
      const prof = atkProf(s, weapon);
      const cadAll = maxShots(weapon, s);
      const cadMax = st.cad === false ? 1 : cadAll; // "Usar cadência" desmarcado: um disparo só
      let per = null;
      if (cadMax > 1 && targets.length) {
        per = perTargetShots(st, cadMax, targets, prof, draw, idp, weapon);
        st.shots = per.total;
        fields.push(per.box);
      } else if (cadAll > 1 && c.aim) {
        fields.push(cadenceBox(st, cadAll, prof, draw, idp, weapon));
      } else if (cadAll > 1 && !c.aim) {
        st.per = null;
        const nSel = h('select', 'input');
        for (let k = 1; k <= cadAll; k++) {
          const p = shotPenalty(k, prof);
          const o = h('option', '', k + ' ' + shotWord(weapon, k) + (k === 1 ? '' : ' · –' + p + ' · dano ×' + k));
          o.value = String(k);
          nSel.append(o);
        }
        nSel.value = String(st.shots);
        nSel.addEventListener('change', () => { st.shots = Math.round(num(nSel.value)) || 1; draw(); });
        fields.push(field('shots', (weapon && weapon.kind === 'arma-fogo' ? 'Disparos (cadência ' : 'Golpes (Luta: ') + cadAll + ')', nSel));
      }
      const modIn = h('input', 'input');
      modIn.type = 'number';
      modIn.step = '1';
      modIn.placeholder = '0';
      modIn.value = st.mod || '';
      modIn.addEventListener('change', () => { st.mod = Math.round(num(modIn.value)); draw(); });
      if (weapon && weapon.kind === 'arma-fogo') {
        const dSel = h('select', 'input');
        DISTANCES.filter((d) => d.id !== 'adj' || NO_ADJ_PENALTY.indexOf(weapon.typeId) < 0).forEach((d) => { const o = h('option', '', d.label); o.value = d.id; dSel.append(o); });
        if (!$('option[value="' + (st.dist || '') + '"]', dSel)) st.dist = '';
        dSel.value = st.dist || '';
        dSel.addEventListener('change', () => { st.dist = dSel.value; draw(); });
        fields.push(field('dist', 'Distância do alvo', dSel));
      }
      fields.push(field('dice', 'Dados', diceSelect(st, draw)));
      fields.push(field('mod', 'Outro modificador (cobertura...)', modIn));

      const t = attackTest(s, m, weapon, st.mode, st.shots);
      if (per) t.label = ('Ataque: ' + (weapon ? weapon.name : 'Desarmado') + ' · ' + st.shots + ' ' + shotWord(weapon, st.shots)).slice(0, 60);
      const dist = DISTANCES.find((d) => d.id === st.dist);
      if (dist && dist.mod) t.mods.push([dist.short, dist.mod]);
      if (st.mod) t.mods.push(['modificador', st.mod]);
      applyDice(t, st);
      if (c.peek) c.peek(t);
      const fixed = t.attr + t.skill + t.mods.reduce((x, y) => x + y[1], 0);
      const stowed = c.handsOnly ? all.filter((w) => !handOf(w)).length : 0;
      const info = [weapon && isGun(weapon) ? ammoLine(weapon, s) : '', c.aim && cadMax > 1 ? (weapon && weapon.kind === 'arma-fogo' ? 'cadência ' : 'Luta: ') + cadMax + ': cada toque num alvo é um ' + shotWord(weapon, 1) : '', weapon ? (prof ? 'Proficiente' : 'Sem proficiência' + (weapon.kind === 'arma-melee' ? ': sem as propriedades da arma' : '')) : lutaAttacks(s) ? 'Desarmado (Luta): contundente, proficiente' : '', stowed ? plural(stowed, 'arma na mochila', 'armas na mochila') + ' (saque em Itens)' : '', weapon && !weapon.slot ? 'não está em mãos' : '', weapon && weapon.values.dano ? 'dano ' + weapon.values.dano : '', weapon && weapon.values.alcance ? 'alcance ' + weapon.values.alcance : ''].filter(Boolean).join(' · ');
      const go = h('button', 'btn btn--primary btn--sm', (c.btnLabel || 'Atacar') + ' · ' + diceText(st) + ' ' + (fixed ? signed(fixed) : '+0'));
      go.type = 'button';
      // munição: sem disparos no pente (ou arma superaquecida) não dá para atacar; recarregar custa a ação da regra
      const block = weapon && isGun(weapon) ? fireBlock(weapon, c.aim ? 1 : st.shots || 1, sceneRound()) : '';
      go.disabled = Boolean(per && per.over) || Boolean(block);
      go.addEventListener('click', () => onRoll(t, go));
      let rl = null;
      if (weapon && isGun(weapon) && c.onReload) {
        const g = gunInfo(weapon, s);
        const cost = g.rule.heat ? 'completa' : g.rule.partial ? 'livre' : g.duplo && !weapon.duplo ? 'bonus' : g.act;
        rl = h('button', 'btn btn--ghost btn--sm', (g.rule.heat ? 'Trocar carga' : g.rule.partial ? '+2 cartuchos' : 'Recarregar') + ' · ' + COST_LABEL[cost]);
        rl.type = 'button';
        rl.dataset.fid = idp + 'reload';
        rl.addEventListener('click', () => c.onReload(weapon, rl));
      }
      box.replaceChildren(h('div', 'attack__fields', ...fields), h('div', 'attack__go', go, rl, info ? h('span', 'attack__info', info) : null), ...(block ? [h('p', 'attack__warn', block)] : []));
    };
    draw();
    return box;
  }


  async function renderSheetCampaigns() {
    const ch = sheetChar;
    const list = await db.listCharacterCampaigns(ch.id);
    $('#sheet-camp-list').replaceChildren(...list.map((c) => campaignRow(c, {
      label: 'Sair',
      onClick: async () => {
        const ok = await askConfirm({
          title: 'Sair de ' + c.name + '?',
          text: ch.name + ' deixa de participar. Você pode entrar de novo com o ID de entrada.',
          ok: 'Sair'
        });
        if (!ok) return;
        try { await db.leaveCampaign(c.id, ch.id); if (sheetChar === ch) await renderSheetCampaigns(); }
        catch (err) { toast(errorMessage(err)); }
      }
    })));
    $('#sheet-camp-empty').hidden = list.length > 0;
  }

  // Nome: salva ao sair do campo (ou Enter) e bloqueia nome repetido
  let nameSeq = 0;
  const liveCheckName = debounce(async () => {
    const seq = nameSeq;
    const name = cleanName(fName.value);
    if (!sheetChar || validateName(name) || name === sheetChar.name) return;
    try {
      const taken = await db.nameTaken('character', name, sheetChar.id);
      if (seq === nameSeq && taken) setError(errName, fName, DUP_CHARACTER);
    } catch (e) { /* a checagem final acontece ao salvar */ }
  }, 350);
  fName.addEventListener('input', () => { nameSeq++; setError(errName, fName, ''); liveCheckName(); });
  fName.addEventListener('change', async () => {
    const ch = sheetChar;
    const name = cleanName(fName.value);
    const bad = validateName(name);
    if (bad) { setError(errName, fName, bad); return; }
    if (name === ch.name) { fName.value = name; setError(errName, fName, ''); return; }
    try {
      await db.renameCharacter(ch.id, name);
      ch.name = name;
      fName.value = name;
      quickUpdate(ch);
      renderSheetHeader();
      setError(errName, fName, '');
      setStatus('Nome salvo');
    } catch (err) { setError(errName, fName, errorMessage(err)); }
  });

  // Tudo o mais salva sozinho, e só o que mudou
  // (assim não apaga o que outra pessoa editou nos outros campos)
  const dirty = new Set();
  let saveTimer = 0;
  async function flushSave() {
    clearTimeout(saveTimer);
    const ch = sheetChar;
    if (!ch || !dirty.size) return;
    const patch = {};
    dirty.forEach((k) => { patch[k] = ch[k]; });
    dirty.clear();
    try {
      await db.saveCharacter(ch.id, patch);
      quickUpdate(ch);
      if (sheetChar === ch) setStatus('Alterações salvas');
    } catch (err) {
      Object.keys(patch).forEach((k) => dirty.add(k));
      if (sheetChar === ch) setStatus(errorMessage(err));
    }
  }
  [['species', fSpecies], ['age', fAge], ['origin', fOrigin]].forEach((pair) => {
    pair[1].addEventListener('input', () => {
      sheetChar[pair[0]] = pair[1].value;
      dirty.add(pair[0]);
      setStatus('Salvando...');
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flushSave, 600);
    });
  });
  /* Caixa de sexo: um botãozinho com opções prontas; a caixa continua aceitando qualquer texto. */
  const SEX_OPTS = ['Masculino', 'Feminino', 'Não-binário', 'Agênero', 'Gênero fluido', 'Intersexo'];
  // Myauuu: sexo exclusivo da Neko, com a bandeira rosinha (aparece no menu só quando a espécime é Neko)
  const MYAU = 'Myauuu';
  const myauFlag = () => { const f = h('span', 'flag-myau'); f.setAttribute('aria-hidden', 'true'); return f; };
  function sexPicker(inp, nekoNow) {
    const btn = h('button', 'btn btn--ghost btn--sm pick-btn', '▾'); // só a setinha: sobra espaço para o texto
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Opções de sexo');
    btn.title = 'Opções de sexo';
    const menu = h('div', 'pick-menu');
    menu.hidden = true;
    const set = (v) => {
      inp.value = v;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      close();
      if (v) btn.focus(); else inp.focus();
    };
    const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    SEX_OPTS.concat([MYAU, 'Outro']).forEach((o) => {
      const c = h('button', 'chip chip--toggle' + (o === 'Outro' ? ' pick-menu__other' : o === MYAU ? ' chip--myau' : ''), o === MYAU ? myauFlag() : null, o);
      c.type = 'button';
      c.dataset.fid = 'sex-' + nameKey(o).replace(/\s+/g, '-');
      c.addEventListener('click', () => set(o === 'Outro' ? '' : o));
      menu.append(c);
    });
    btn.addEventListener('click', () => {
      const open = menu.hidden;
      menu.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      $$('.chip', menu).forEach((c) => c.classList.toggle('is-on', c.textContent === inp.value));
      const my = $('.chip--myau', menu);
      if (my) my.hidden = !(nekoNow && nekoNow());
    });
    menu.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); btn.focus(); } });
    document.addEventListener('click', (ev) => { if (!menu.hidden && !wrap.contains(ev.target)) close(); });
    const wrap = h('div', 'pick-wrap');
    inp.replaceWith(wrap);
    wrap.append(h('div', 'pick-wrap__row', inp, btn), menu);
    const flag = () => wrap.classList.toggle('is-myau', inp.value.trim() === MYAU);
    inp.addEventListener('input', flag);
    inp.syncFlag = flag;
    inp.placeholder = inp.placeholder || 'Escreva ou escolha';
    return wrap;
  }
  sexPicker(fSex, () => Boolean(sheetChar && isNeko(sheetChar.sheet.specimen)));

  [['height', fHeight], ['weight', $('#f-weight')], ['sex', fSex], ['lore', $('#f-lore')]].forEach((pair) => {
    pair[1].addEventListener('input', () => { sheetChar.sheet[pair[0]] = pair[1].value; touchSheet(); if (pair[0] === 'sex') checkSecretThemes(); });
  });

  // Imagem
  $('#portrait-btn').addEventListener('click', () => $('#portrait-file').click());
  $('#portrait-file').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast('Imagem grande demais. Use uma de até 20 MB.'); return; }
    const ch = sheetChar;
    try {
      const imgs = await fileToImages(file);
      await db.saveCharacter(ch.id, imgs);
      Object.assign(ch, imgs);
      quickUpdate(ch);
      if (sheetChar === ch) { renderPortrait(); setStatus('Imagem salva'); }
    } catch (err) { toast(errorMessage(err)); }
  });
  $('#portrait-remove').addEventListener('click', async () => {
    const ch = sheetChar;
    try {
      await db.saveCharacter(ch.id, { image: '', thumb: '' });
      ch.image = ch.thumb = '';
      quickUpdate(ch);
      if (sheetChar === ch) { renderPortrait(); setStatus('Imagem removida'); }
    } catch (err) { toast(errorMessage(err)); }
  });

  // Vincular a uma campanha
  inAttach.addEventListener('input', () => setError(errAttach, inAttach, ''));
  formAttach.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const code = inAttach.value.trim().toUpperCase();
    if (!code) { setError(errAttach, inAttach, 'Digite o ID de entrada da campanha.'); inAttach.focus(); return; }
    try {
      const target = await db.getCampaign(code);
      if (target && !(await passGate(target))) return;
      const camp = await db.joinCampaign(code, sheetChar.id);
      profileSet('chars', sheetChar.id, true);
      profileSet('camps', camp.id, true);
      formAttach.reset();
      toast(sheetChar.name + ' entrou em ' + camp.name + '.');
      await renderSheetCampaigns();
    } catch (err) {
      setError(errAttach, inAttach, errorMessage(err));
      inAttach.focus();
    }
  });

  $('#pin-toggle').addEventListener('click', () => {
    if (quickHas(sheetChar.id)) { quickRemove(sheetChar.id); toast('Removido do acesso rápido.'); }
    else { quickAdd(sheetChar); toast('Fixado no acesso rápido.'); }
    renderPin();
  });

  $('#fav-toggle').addEventListener('click', () => {
    toast(charFavToggle(sheetChar.id) ? sheetChar.name + ' está nos favoritos.' : 'Tirado dos favoritos.');
    renderSheetFav();
  });
  $('#profile-toggle').addEventListener('click', () => {
    const on = !isMyChar(sheetChar.id);
    profileSet('chars', sheetChar.id, on);
    toast(on ? 'Salvo no perfil.' : 'Tirado do perfil.');
    renderSheetFav();
  });

  $('#delete-character').addEventListener('click', async () => { if (await deleteCharacterFlow(sheetChar)) go('personagens'); });

  /* ---------- Distribuição inicial ----------
     Abre na primeira vez que a ficha é feita: espécime e origem, atributos
     (3 pontos; um pode ir a –1 por +1 ponto; máximo +3) e perícias (2 com +2, 1 com +1). */
  const setupDlg = $('#setup-dialog');
  // Uma tela por parte. As abas no topo deixam ir direto a qualquer parte, em qualquer ordem.
  const SETUP = [
    { id: 'builds', tab: 'Começo rápido', title: 'Começo rápido', lead: 'Escolha uma build pronta para preencher atributos, perícias e proficiências de uma vez, ou pule e monte do seu jeito. Tudo pode ser ajustado nas próximas etapas.', search: true },
    { id: 'especime', tab: 'Espécime', title: 'Espécime', lead: 'A espécie traz descrição e 3 habilidades raciais; são elas que definem a vida base, os UP iniciais e o núcleo.', search: true },
    { id: 'origem', tab: 'Origem', title: 'Origem e apresentação', lead: 'A origem traz o kit de itens iniciais. Idade, altura e sexo podem ser mudados depois na ficha.', search: true },
    { id: 'atributos', tab: 'Atributos', title: 'Atributos', lead: '3 pontos para distribuir. Você pode baixar um atributo para –1 e ganhar +1 ponto. Máximo inicial: +3.' },
    { id: 'pericias', tab: 'Perícias', title: 'Perícias', lead: 'Escolha 2 perícias com +2 e 1 com +1, ou, se preferir, espalhe os mesmos 5 pontos como quiser, até +2 em cada. Toque para alternar entre nada, +1 e +2.', search: true },
    { id: 'profs', tab: 'Proficiências', title: 'Proficiências', lead: 'Escolha 4 tipos de arma ou armadura em que o personagem é proficiente desde o início.', search: true },
    { id: 'equip', tab: 'Itens iniciais', title: 'Itens iniciais', lead: 'Leve o kit da origem (trocando o que quiser por itens do banco) ou compre do banco com o dinheiro inicial, igual para todos.', search: true },
    { id: 'resumo', tab: 'Resumo', title: 'Tudo pronto?', lead: 'Confira a ficha. Os recursos já saem calculados dos atributos.' }
  ];
  const STEP = {};
  SETUP.forEach((x, i) => { STEP[x.id] = i; });

  /* Builds: entradas do catálogo (kind 'build'), as oficiais e as criadas pelas pessoas. Seguem as regras de criação:
     3 pontos de atributo (um pode ir a –1 por +1), 2 perícias com +2 e 1 com +1, e 4 proficiências. */
  const skillIdOf = (label) => { const k = nameKey(label || ''); let out = ''; ATTRS.forEach((at) => SKILLS[at.id].forEach((sk) => { if (nameKey(sk[1]) === k) out = sk[0]; })); return out; };
  const profByLabel = (label) => (PROFS.find((p) => nameKey(p.label) === nameKey(label)) || {}).id || '';
  function buildOf(e) {
    const v = e.values || {};
    const skills = {};
    [['pericia2a', 2], ['pericia2b', 2], ['pericia1', 1]].forEach((x) => { const id = skillIdOf(v[x[0]]); if (id && !skills[id]) skills[id] = x[1]; });
    return {
      id: e.id, name: e.name, role: v.papel || '', text: v.descricao || '', mine: Boolean(e.mine), entry: e,
      guided: v.tipo === 'Guiada', pages: guidePages(v).length, itens: String(v.itens || '').split('\n').map((x) => x.trim()).filter(Boolean),
      attrs: { corpo: clamp(num(v.corpo), -1, 3), precisao: clamp(num(v.precisao), -1, 3), essencia: clamp(num(v.essencia), -1, 3) },
      skills, profs: String(v.profs || '').split(',').map(profByLabel).filter(Boolean).slice(0, 4)
    };
  }
  async function loadWzBuilds() {
    const mine = wz;
    let list;
    try { list = await libSearch(['build'], ''); } catch (err) { return; }
    if (wz !== mine) return;
    wz.builds = list.map(buildOf);
    if (wz.step === STEP.builds) renderSetup();
  }
  const SKIP_BUILDS = 'vortex.skipBuilds.v1';
  const skipBuilds = () => { try { return localStorage.getItem(SKIP_BUILDS) === '1'; } catch (e) { return false; } };
  const setSkipBuilds = (on) => { try { if (on) localStorage.setItem(SKIP_BUILDS, '1'); else localStorage.removeItem(SKIP_BUILDS); } catch (e) { /* sem armazenamento: vale só agora */ } };
  const skillLabel = (id) => { let out = id; ATTRS.forEach((at) => SKILLS[at.id].forEach((sk) => { if (sk[0] === id) out = sk[1]; })); return out; };
  const profLabel = (id) => (PROFS.find((p) => p.id === id) || { label: id }).label;
  let wz = null;

  const attrPool = (a) => {
    const vals = ATTRS.map((x) => a[x.id]);
    const neg = vals.filter((v) => v < 0).length;
    return { neg, left: 3 + (neg ? 1 : 0) - vals.filter((v) => v > 0).reduce((t, v) => t + v, 0) };
  };
  const skillCount = (sk) => {
    const vals = Object.keys(sk).map((k) => sk[k]);
    return { two: vals.filter((v) => v === 2).length, one: vals.filter((v) => v === 1).length, sum: vals.reduce((t, v) => t + v, 0) };
  };
  // perícias: o padrão é 2 com +2 e 1 com +1; no modo livre, os mesmos 5 pontos vão onde quiser, até +2 em cada
  const SKILL_POINTS = 5;
  const skillsOk = (sk, mode) => { const c = skillCount(sk); return mode === 'livre' ? c.sum === SKILL_POINTS : c.two === 2 && c.one === 1; };
  function stepProblem(step) {
    if (step === STEP.atributos) {
      const p = attrPool(wz.attrs);
      if (p.left > 0) return 'Ainda ' + (p.left === 1 ? 'falta 1 ponto' : 'faltam ' + p.left + ' pontos') + ' para distribuir.';
      if (p.left < 0) return 'Você passou do limite em ' + (-p.left) + (p.left === -1 ? ' ponto.' : ' pontos.');
    }
    if (step === STEP.pericias) {
      const c = skillCount(wz.skills);
      if (wz.skillMode === 'livre') { if (c.sum !== SKILL_POINTS) return 'Distribuídos: ' + c.sum + ' de ' + SKILL_POINTS + ' pontos de perícia.'; }
      else if (c.two !== 2 || c.one !== 1) return 'Marcadas: ' + c.two + ' de 2 perícias com +2 e ' + c.one + ' de 1 perícia com +1.';
    }
    if (step === STEP.profs && wz.profs.length !== 4) return 'Escolhidas: ' + wz.profs.length + ' de 4 proficiências.';
    if (step === STEP.equip && wz.gear.mode === 'preco' && cartTotal(wz.gear) > wz.gear.budget) return 'A compra passou do orçamento em ' + fmtCronos(cartTotal(wz.gear) - wz.gear.budget) + ' Cronos.';
    return '';
  }
  const setupProblem = () => stepProblem(wz.step);
  const allProblems = () => SETUP.map((x, i) => [i, stepProblem(i)]).filter((p) => p[1]);
  // 1º texto = nome (pesa mais), 2º = tipo/papel, o resto = descrição
  const wzFields = (texts) => texts.map((t, i) => [t || '', i === 0 ? 10 : i === 1 ? 4 : 1]);
  const wzMatch = (...texts) => searchScore(wzFields(texts), wz.q || '') > 0;
  function goStep(i) {
    wz.seen.add(wz.step); // ao sair de uma etapa, o que falta nela passa a aparecer na trilha
    wz.step = clamp(i, 0, SETUP.length - 1);
    wz.q = '';
    $('#setup-search').value = '';
    renderSetup();
    $('#setup-title').focus({ preventScroll: true });
    $('#setup-main').scrollTop = 0;
    $('.setup').classList.remove('setup--side');
    $('#setup-side-toggle').setAttribute('aria-expanded', 'false');
    $('#setup-side-toggle').textContent = 'Ver ficha';
  }
  function applyBuild(b) {
    wz.attrs = Object.assign({}, b.attrs);
    wz.skills = Object.assign({}, b.skills);
    wz.skillMode = 'padrao';
    wz.profs = b.profs.slice();
    wz.build = b.name;
    wz.guide = b.guided ? b.entry : null;
    wz.gear.guideFilled = '';
  }

  /* ---------- Itens iniciais: kit da origem ou compra por preço ----------
     Todo personagem começa com START_CRONOS (1.500 Cronos: uma arma comum mais uma armadura leve comum). */
  const priceOf = (e) => parseInt(String((e && e.values && e.values.preco) || '').replace(/[^0-9]/g, ''), 10) || 0;
  const invEntryFrom = (e) => Object.assign(slotSnap(e), { uid: uid(), slots: normSlots(e.slots), thumb: e.thumb || '', qty: 1, slot: '' });
  function parseOriginLine(text) {
    const clean = String(text).replace(/[;.]\s*$/, '').replace(/^1\s+/, '');
    const cut = clean.indexOf(' (');
    const head = cut > 0 ? clean.slice(0, cut) : clean;
    const detail = cut > 0 ? clean.slice(cut + 2).replace(/\)$/, '') : '';
    const opts = head.split(/\s+ou\s+/).map((o) => o.charAt(0).toUpperCase() + o.slice(1));
    const t = nameKey(clean);
    const kinds = /arma de fogo|pistola|rifle|fuzil|espingarda|escopeta|metralhadora|revolver/.test(t) ? ['arma-fogo'].concat(/lamina|espada|faca/.test(t) ? ['arma-melee'] : [])
      : /lamina|espada|faca|machado|marreta/.test(t) ? ['arma-melee']
      : /armadura|vestimenta|protecao/.test(t) ? ['armadura'] : INVENTORY_KINDS;
    return { text, opts, detail, kinds, comum: /comum|basic|simples|improvisad/.test(t), free: /a escolha/.test(t) };
  }
  function gearFor(origin) { // estado da tela, refeito quando a origem muda
    const g = wz.gear;
    const name = origin ? origin.name : '';
    if (g.origin !== name) {
      g.origin = name;
      g.lines = origin ? origin.items.map((t) => Object.assign(parseOriginLine(t), { take: true, opt: 0, bank: null })) : [];
    }
    return g;
  }
  const cartTotal = (g) => g.cart.reduce((t, e) => t + priceOf(e), 0);
  function gearEntries(g) { // o que entra no inventário ao concluir
    if (g.mode === 'preco') return g.cart.map(invEntryFrom);
    if (g.mode !== 'kit') return [];
    return g.lines.filter((l) => l.take).map((l) => (l.bank ? invEntryFrom(l.bank)
      : originItemEntry(l.opts[l.opt] + (l.detail ? ' (' + l.detail + ')' : ''))));
  }
  function gearSummary(g) {
    if (g.mode === 'preco') return g.cart.length ? g.cart.map((e) => e.name).join(' · ') + ' (' + fmtCronos(cartTotal(g)) + ' de ' + fmtCronos(g.budget) + ' Cronos)' : 'nada comprado';
    if (g.mode === 'kit') { const n = gearEntries(g).map((e) => e.name); return n.length ? n.join(' · ') : 'nenhum item marcado'; }
    return 'nenhum';
  }

  // tela de itens iniciais: tocar no item abre todos os dados dele (a mesma janela do banco)
  function gearOpen(e, ...kids) {
    const open = h('span', 'row__open lib-row__open', ...kids);
    open.tabIndex = 0;
    open.setAttribute('role', 'button');
    open.setAttribute('aria-label', 'Ver os detalhes de ' + e.name);
    open.addEventListener('click', () => openEntry(e));
    open.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openEntry(e); } });
    return open;
  }
  // linha do kit: o item do banco escolhido, um item oficial com o mesmo nome ou, sem nada disso, o texto da origem
  function gearRef(l, origin) {
    const found = l.bank || BUILTINS.find((x) => INVENTORY_KINDS.indexOf(x.kind) >= 0 && nameKey(x.name) === nameKey(l.opts[l.opt]));
    if (found) return found;
    const e = originItemEntry(l.opts[l.opt] + (l.detail ? ' (' + l.detail + ')' : ''));
    return Object.assign(e, { kindTitle: 'Item do kit', source: origin ? 'Kit de ' + origin.name : '',
      values: Object.assign(e.values, { especial: 'Texto da origem: ' + String(l.text).replace(/[;.]\s*$/, '') + '. É um item simples; troque por um item do banco para ter preço, dano e os outros dados.' }) });
  }
  function detailsBtn(e) {
    const b = h('button', 'btn btn--ghost btn--sm', 'Detalhes');
    b.type = 'button';
    b.setAttribute('aria-label', 'Detalhes de ' + e.name);
    b.addEventListener('click', () => openEntry(e));
    return b;
  }

  function pickCard(title, lines, on, onClick) {
    const b = h('button', 'pick-card', h('span', 'pick-card__title', title), ...lines.filter(Boolean).map((l) => h('span', 'pick-card__text', l)));
    b.type = 'button';
    b.setAttribute('aria-pressed', String(on));
    b.addEventListener('click', onClick);
    return b;
  }
  const specimenLine = (e) => mechLine(speciesMech(e)) + (racialLines(e.values).length ? ' · ' + racialLines(e.values).map((t) => t.name).join(', ') : '') + (isEtheriano(e) ? ' · exclusivo: compra características raciais de qualquer espécime' : '');

  function previewSheet() { // a ficha como ficaria com as escolhas do assistente
    const s = normSheet(deep(sheetChar.sheet));
    s.attrs = wz.attrs; s.skills = wz.skills; s.specimen = wz.specimen; s.profs = wz.profs; s.cur = {};
    return compute({ sheet: s });
  }

  function setupField(id, label, value, placeholder, onInput, max) {
    const inp = h('input', 'input');
    inp.type = 'text';
    inp.id = id;
    inp.maxLength = max;
    inp.autocomplete = 'off';
    inp.value = value;
    inp.placeholder = placeholder;
    inp.addEventListener('input', () => onInput(inp.value));
    const lab = h('label', 'field__label', label);
    lab.htmlFor = id;
    return h('div', 'field', lab, inp);
  }

  function renderGear(body) {
    const origin = originOf(wz.origin);
    const g = gearFor(origin);
    g.budget = START_CRONOS;
    const gi = wz.guide ? String((wz.guide.values || {}).itens || '').split('\n').map((x) => x.trim()).filter(Boolean) : [];
    if (gi.length && g.guideFilled !== wz.guide.id + wz.guide.name) {
      if (g.guideFilled === '') g.mode = 'preco';
      if (g.shop) {
        g.cart = gi.map((n) => g.shop.find((e) => nameKey(e.name) === nameKey(n))).filter(Boolean);
        g.guideFilled = wz.guide.id + wz.guide.name;
        g.guideMissing = gi.filter((n) => !g.shop.some((e) => nameKey(e.name) === nameKey(n)));
      }
    }
    const modes = [['kit', 'Kit da origem'], ['preco', 'Por preço'], ['nenhum', 'Nenhum']];
    const seg = h('div', 'segmented gear__modes', ...modes.map((m) => {
      const inp = h('input');
      inp.type = 'radio';
      inp.name = 'gear-mode';
      inp.value = m[0];
      inp.checked = g.mode === m[0];
      inp.dataset.fid = 'gear-' + m[0];
      inp.addEventListener('change', () => { g.mode = m[0]; renderSetup('gear-' + m[0]); });
      return h('label', 'segmented__opt', inp, h('span', '', m[1]));
    }));
    body.append(seg);
    if (sheetChar.sheet.originItems) body.append(h('p', 'field__hint', 'Esta ficha já recebeu itens iniciais (' + sheetChar.sheet.originItems + '). O que você escolher aqui entra a mais no inventário.'));

    if (g.mode === 'nenhum') { body.append(h('p', 'empty', 'Nenhum item inicial. Dá para pôr tudo depois pelo inventário.')); return; }

    if (g.mode === 'kit') {
      if (!origin) {
        const b = h('button', 'btn btn--ghost btn--sm', 'Escolher origem');
        b.type = 'button';
        b.addEventListener('click', () => goStep(STEP.origem));
        body.append(h('p', 'empty', 'Escolha uma das origens do livro para ver o kit dela, ou use a compra por preço. ', b));
        return;
      }
      body.append(h('p', 'field__hint', 'Kit de ' + origin.name + '. Desmarque o que não quiser levar. Onde há "ou", escolha uma opção; qualquer linha pode virar um item de verdade do banco.'));
      g.lines.forEach((l, i) => {
        if (!wzMatch(l.text, l.bank && l.bank.name)) return;
        const take = h('input');
        take.type = 'checkbox';
        take.checked = l.take;
        take.dataset.fid = 'gear-take-' + i;
        take.addEventListener('change', () => { l.take = take.checked; renderSetup('gear-take-' + i); });
        const box = h('div', 'gear-line' + (l.take ? '' : ' gear-line--off'),
          h('label', 'check gear-line__take', take, h('span', '', l.bank ? l.bank.name : l.opts[l.opt])));
        if (!l.bank && l.opts.length > 1) {
          box.append(h('div', 'segmented gear-line__opts', ...l.opts.map((o, j) => {
            const r = h('input');
            r.type = 'radio';
            r.name = 'gear-opt-' + i;
            r.checked = l.opt === j;
            r.dataset.fid = 'gear-opt-' + i + '-' + j;
            r.addEventListener('change', () => { l.opt = j; renderSetup('gear-opt-' + i + '-' + j); });
            return h('label', 'segmented__opt', r, h('span', '', o));
          })));
        }
        const meta = l.bank ? [kindTitle(l.bank.kind), l.bank.values.raridade, priceText(l.bank.values.preco)].filter(Boolean).join(' · ') : l.detail;
        if (meta) box.append(h('p', 'field__hint', meta));
        const swap = h('button', 'btn btn--ghost btn--sm', l.bank ? 'Trocar' : (l.free ? 'Escolher do banco' : 'Trocar por item do banco'));
        swap.type = 'button';
        swap.addEventListener('click', async () => {
          const e = await openPicker({ title: 'Item do kit: ' + l.opts.join(' ou '), kinds: l.kinds,
            chips: (l.kinds === INVENTORY_KINDS ? [] : l.kinds.map(kindTitle)).concat(l.comum ? ['Comum'] : []),
            filter: (x) => l.kinds.indexOf(x.kind) >= 0 && (!l.comum || !x.values || !x.values.raridade || x.values.raridade === 'Comum') });
          if (!e || !wz) return;
          l.bank = e;
          l.take = true;
          renderSetup();
        });
        const acts = h('div', 'gear-line__acts', detailsBtn(gearRef(l, origin)), swap);
        if (l.bank) {
          const back = h('button', 'btn btn--ghost btn--sm', 'Voltar ao texto da origem');
          back.type = 'button';
          back.addEventListener('click', () => { l.bank = null; renderSetup(); });
          acts.append(back);
        }
        box.append(acts);
        body.append(box);
      });
      const more = h('button', 'btn btn--ghost btn--sm', 'Adicionar item do banco');
      more.type = 'button';
      more.addEventListener('click', async () => { // qualquer item do banco, buscado como os espécimes
        const picked = await openPickerMany({ title: 'Adicionar ao kit', kinds: INVENTORY_KINDS, chips: [
          { label: 'Armas', kinds: ['arma-melee', 'arma-fogo'] }, { label: 'Munições', kinds: ['municao'] }, { label: 'Armaduras', kinds: ['armadura'] }, { label: 'Vestíveis', kinds: ['vestivel'] },
          { label: 'Implantes', kinds: ['nucleo', 'protese-modulo'] }, { label: 'Peças de slot', kinds: ['mod-arma', 'propriedade', 'acessorio'] }, { label: 'Itens gerais', kinds: ['item-geral'] }], filter: (x) => INVENTORY_KINDS.indexOf(x.kind) >= 0 });
        if (!picked.length || !wz) return;
        picked.forEach((e) => g.lines.push({ text: e.name, opts: [e.name], detail: '', kinds: INVENTORY_KINDS, comum: false, free: true, take: true, opt: 0, bank: e }));
        renderSetup();
      });
      body.append(h('div', 'gear-line__acts', more));
      return;
    }

    // Por preço: orçamento, carrinho e a loja (catálogo + banco, só o que tem preço)
    const left = g.budget - cartTotal(g);
    body.append(h('div', 'gear__budget',
      h('p', 'setup__pool', 'Dinheiro inicial: ', h('strong', '', fmtCronos(g.budget)), ' Cronos'),
      h('p', 'setup__pool' + (left < 0 ? ' setup__pool--over' : ''), 'Sobra: ', h('strong', '', fmtCronos(left)), ' Cronos')),
      h('p', 'field__hint', 'Todo personagem começa com o mesmo valor, ' + fmtCronos(START_CRONOS) + ' Cronos, e pode comprar qualquer item do banco que caiba nele.' + (origin ? ' O kit de ' + origin.name + ' continua na aba "Kit da origem" para comparar.' : '')));
    if (wz.guide && gi.length) body.append(h('p', 'field__hint gear__guide', '📖 ' + wz.guide.name + ' já pôs no carrinho: ' + gi.join(', ') + '.' + (g.guideMissing && g.guideMissing.length ? ' Não achei no banco: ' + g.guideMissing.join(', ') + '.' : '')));
    if (g.cart.length) {
      body.append(h('h3', 'setup__sub', 'Comprados'), h('ul', 'rows', ...g.cart.map((e, i) => {
        const rm = h('button', 'btn btn--ghost btn--sm', 'Tirar');
        rm.type = 'button';
        rm.setAttribute('aria-label', 'Tirar ' + e.name);
        rm.addEventListener('click', () => { g.cart.splice(i, 1); renderSetup(); });
        return h('li', 'row', gearOpen(e, entryIcon(e), h('span', 'row__main', h('span', 'row__title', e.name), h('span', 'row__meta', kindTitle(e.kind) + ' · ' + priceText(e.values.preco)))), rm);
      })));
    }
    body.append(h('h3', 'setup__sub', 'Loja'), h('p', 'field__hint', 'Toque num item para ver todos os dados dele (dano, alcance, efeitos e lore).'));
    if (!g.shop) {
      body.append(h('p', 'empty', 'Carregando os itens com preço...'));
      libSearch(INVENTORY_KINDS, '').catch(() => BUILTINS.filter((e) => INVENTORY_KINDS.indexOf(e.kind) >= 0))
        .then((list) => { if (!wz || wz.gear !== g) return; g.shop = list.filter((e) => priceOf(e) > 0).sort((a, b) => priceOf(a) - priceOf(b)); renderSetup(); });
      return;
    }
    const shown = rankSearch(g.shop, wz.q, entryFields);
    body.append(h('ul', 'rows gear__shop', ...shown.slice(0, 80).map((e) => {
      const add = h('button', 'btn btn--ghost btn--sm', 'Comprar');
      add.type = 'button';
      add.disabled = priceOf(e) > left;
      add.setAttribute('aria-label', 'Comprar ' + e.name + ' por ' + priceText(e.values.preco));
      add.addEventListener('click', () => { g.cart.push(e); renderSetup(); });
      const text = entryText(e);
      return h('li', 'row', gearOpen(e, entryIcon(e),
        h('span', 'row__main', h('span', 'row__title', e.name), h('span', 'row__meta', [e.kindTitle, e.typeTitle, e.values.raridade].filter(Boolean).join(' · ')),
          text ? h('span', 'row__text', text) : null)),
        h('strong', 'gear__price', fmtCronos(priceOf(e))), add);
    })));
    if (!shown.length) body.append(h('p', 'empty', 'Nada com esse termo na loja.'));
    else if (g.shop.some((e) => priceOf(e) > left)) body.append(h('p', 'field__hint', 'Itens acima da sobra ficam desativados.'));
  }

  /* Criar na hora (fica escondido): espécime, origem ou build nova, sem sair da distribuição inicial.
     Vai para o banco como se fosse criada na Oficina e já fica escolhida. */
  const WZ_CREATE = { especime: ['Criar espécime', 'o'], origem: ['Criar origem', 'a'], build: ['Criar build', 'a'] };
  function wzCreate(kind, onSaved) {
    const cat = findCategory(kind);
    if (!wz.create || wz.create.kind !== kind) wz.create = { kind, open: false, d: newDraft(kind, '', null) };
    const c = wz.create, d = c.d;
    const box = h('details', 'wz-create');
    box.open = c.open;
    box.addEventListener('toggle', () => { c.open = box.open; });
    const grid = h('div', 'fields-grid');
    cat.fields.filter((f) => f.key !== 'lore' && !f.hidden).forEach((f) => {
      if (f.kind === 'roteiro') { grid.append(h('div', 'field field--wide', h('span', 'field__label', f.label), roteiroField(d))); return; }
      if (f.kind === 'script') { grid.append(h('div', 'field field--wide', fieldControl(f, null, d.values[f.key], (v) => { d.values[f.key] = v; }))); return; }
      const isName = f.key === 'nome';
      const ctrl = fieldControl(f, null, isName ? d.name : d.values[f.key], (v) => { if (isName) d.name = v; else d.values[f.key] = v; });
      const fid = 'wzc-' + kind + '-' + f.key;
      const grouped = f.kind === 'multi' || f.kind === 'racial3' || f.kind === 'powerlines';
      const label = h(grouped ? 'span' : 'label', 'field__label', f.label);
      if (grouped) { label.id = fid; ctrl.setAttribute('aria-labelledby', fid); }
      else { (f.kind === 'banklines' ? $('textarea', ctrl) : ctrl).id = fid; label.htmlFor = fid; }
      grid.append(h('div', 'field' + (f.big || grouped ? ' field--wide' : ''), label, ctrl, f.hint ? h('p', 'field__hint', f.hint) : null));
    });
    const save = h('button', 'btn btn--primary btn--sm', 'Salvar e usar');
    save.type = 'button';
    save.addEventListener('click', async () => {
      const name = cleanName(d.name).slice(0, 60);
      if (!name) { toast('Dê um nome antes de salvar.'); $('#wzc-' + kind + '-nome').focus(); return; }
      const values = {};
      cat.fields.forEach((f) => { if (f.key !== 'nome') values[f.key] = String(d.values[f.key] === undefined || d.values[f.key] === null ? '' : d.values[f.key]).trim(); });
      save.disabled = true;
      try {
        const saved = await db.saveLibrary({ kind, typeId: '', typeTitle: '', kindTitle: cat.title, name, values, bonus: {}, slots: {}, image: '', thumb: '' });
        if (!wz) return;
        wz.create = null;
        onSaved(decorate(Object.assign({}, saved, { mine: true })));
        toast(name + ' entrou no banco e já está escolhid' + WZ_CREATE[kind][1] + '. Para editar depois, use a Oficina.');
      } catch (err) { toast(errorMessage(err)); save.disabled = false; }
    });
    box.append(h('summary', 'wz-create__toggle', WZ_CREATE[kind][0]),
      h('div', 'wz-create__body', cat.hint ? h('p', 'field__hint', cat.hint) : null, grid, h('div', 'wz-create__foot', save)));
    return box;
  }
  function openWzCreate(kind) { // vindo do "Não achou?" da busca
    if (!wz) return;
    wz.create = { kind, open: true, d: newDraft(kind, '', null) };
    renderSetup();
    const box = $('#setup-body .wz-create');
    if (box) { box.scrollIntoView({ block: 'start' }); const n = $('#wzc-' + kind + '-nome'); if (n) n.focus({ preventScroll: true }); }
  }

  // o que já foi escolhido em cada etapa, mostrado embaixo do nome dela na trilha
  function stepValue(i) {
    const id = SETUP[i].id;
    if (id === 'builds') return wz.build || 'opcional';
    if (id === 'especime') return wz.specimen ? wz.specimen.name : '';
    if (id === 'origem') return cleanName(wz.origin);
    if (id === 'atributos') { const p = attrPool(wz.attrs); if (p.left) return p.left > 0 ? plural(p.left, 'ponto livre', 'pontos livres') : 'passou ' + (-p.left); return ATTRS.map((at) => at.label.charAt(0) + ' ' + signed(wz.attrs[at.id])).join(' · '); }
    if (id === 'pericias') { const c = skillCount(wz.skills); return skillsOk(wz.skills, wz.skillMode) ? Object.keys(wz.skills).map(skillLabel).join(', ') : wz.skillMode === 'livre' ? c.sum + ' de ' + SKILL_POINTS + ' pontos' : '+2: ' + c.two + '/2 · +1: ' + c.one + '/1'; }
    if (id === 'profs') return wz.profs.length + ' de 4';
    if (id === 'equip') {
      const g = wz.gear;
      if (g.mode === 'nenhum') return 'nenhum';
      if (g.mode === 'preco') return g.cart.length ? fmtCronos(cartTotal(g)) + ' de ' + fmtCronos(g.budget) + ' Cronos' : '';
      return wz.origin ? plural(gearEntries(gearFor(originOf(wz.origin))).length, 'item', 'itens') : '';
    }
    return allProblems().length ? plural(allProblems().length, 'pendência', 'pendências') : 'pronto para concluir';
  }
  const stepDone = (i) => !stepProblem(i) && Boolean(stepValue(i)) && SETUP[i].id !== 'resumo' && !(SETUP[i].id === 'builds' && !wz.build);

  // painel "Sua ficha": o personagem como vai ficar, atualizado a cada escolha
  function renderSetupSide() {
    const side = $('#setup-side');
    const m = previewSheet();
    const c = sheetChar;
    const skills = [];
    ATTRS.forEach((at) => SKILLS[at.id].forEach((sk) => { if (wz.skills[sk[0]]) skills.push(sk[1] + ' +' + wz.skills[sk[0]]); }));
    const g = wz.gear;
    const money = g.mode === 'preco' ? fmtCronos(g.budget - cartTotal(g)) + ' de ' + fmtCronos(g.budget) + ' Cronos sobrando' : fmtCronos(START_CRONOS) + ' Cronos para gastar na loja';
    const stat = (k, v, cls) => h('div', 'cside__stat' + (cls ? ' ' + cls : ''), h('span', '', k), h('strong', '', v));
    const probs = allProblems().length;
    side.replaceChildren(
      h('div', 'cside__who', h('span', 'cside__avatar', (c.name || '?').trim().charAt(0).toUpperCase()),
        h('span', 'cside__id', h('strong', 'cside__name', c.name || 'Sem nome'), h('span', 'cside__sub', [wz.specimen && wz.specimen.name, cleanName(wz.origin)].filter(Boolean).join(' · ') || 'Espécime e origem a escolher'))),
      h('div', 'cside__attrs', ...ATTRS.map((at) => h('div', 'cside__attr cside__attr--' + at.id, h('span', '', at.label), h('strong', '', signed(wz.attrs[at.id]))))),
      h('div', 'cside__stats', ...LIFE.filter((l) => m.max[l[0]] > 0).map((l) => stat(l[1], String(m.max[l[0]]), 'cside__stat--life')),
        stat('PE', String(m.max.pe)), stat('PA', String(m.max.pa)), stat('Defesa', String(m.defMin)), stat('Carga', fmtNum(m.cargaMax)), stat('UP', String(m.upTotal))),
      h('p', 'cside__label', 'Perícias'), h('p', 'cside__line', skills.join(' · ') || '—'),
      h('p', 'cside__label', 'Proficiências'), h('p', 'cside__line', wz.profs.map(profLabel).join(' · ') || '—'),
      h('p', 'cside__label', 'Itens iniciais'), h('p', 'cside__line', gearSummary(gearFor(originOf(wz.origin)))),
      h('p', 'cside__money', money),
      h('p', 'cside__state' + (probs ? ' is-bad' : ' is-ok'), probs ? 'Falta completar ' + plural(probs, 'etapa', 'etapas') + '.' : 'Tudo certo para concluir.'));
  }

  function renderSetup(focusId) {
    const body = $('#setup-body');
    const st = SETUP[wz.step];
    $('#setup-step').replaceChildren(h('span', 'setup__step-pre', 'Criação de personagem · '), 'etapa ' + (wz.step + 1) + ' de ' + SETUP.length);
    $('#setup-bar').style.width = Math.round((SETUP.filter((x, i) => stepDone(i)).length / (SETUP.length - 1)) * 100) + '%';
    $('#setup-title').textContent = st.title;
    $('#setup-lead').textContent = st.lead;
    $('#setup-search-wrap').hidden = !st.search;
    $('#setup-tabs').replaceChildren(...SETUP.map((x, i) => {
      const bad = wz.seen.has(i) || i < wz.step || i === STEP.resumo ? stepProblem(i) : '';
      const done = stepDone(i);
      const val = stepValue(i);
      const b = h('button', 'setup__tab' + (i === wz.step ? ' is-on' : '') + (bad ? ' setup__tab--bad' : '') + (done ? ' setup__tab--done' : ''),
        h('span', 'setup__num', done ? '✓' : bad ? '!' : String(i + 1)),
        h('span', 'setup__tab-text', h('span', 'setup__tab-name', x.tab), h('span', 'setup__tab-val', val || 'a escolher')));
      b.type = 'button';
      if (i === wz.step) b.setAttribute('aria-current', 'step');
      b.title = bad || x.title;
      b.addEventListener('click', () => goStep(i));
      return b;
    }));
    const on = $('#setup-tabs .is-on');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
    renderSetupSide();
    body.replaceChildren();

    if (wz.step === STEP.builds) {
      const all = wz.builds || BUILTINS.filter((e) => e.kind === 'build').map(buildOf);
      const list = all.filter((b) => wzMatch(b.name, b.role, b.text, Object.keys(b.skills).map(skillLabel).join(' '), b.profs.map(profLabel).join(' ')));
      body.append(h('div', 'pick-grid', ...list.map((b) => pickCard(b.name, [
        b.role + ' · ' + b.text,
        ATTRS.map((at) => at.label + ' ' + (signed(b.attrs[at.id]) === '0' ? '0' : signed(b.attrs[at.id]))).join(' · '),
        Object.keys(b.skills).map((k) => skillLabel(k) + ' +' + b.skills[k]).join(' · '),
        b.profs.map(profLabel).join(' · '),
        b.guided ? '📖 Guiada: ' + plural(b.pages, 'folha', 'folhas') + (b.itens.length ? ' · ' + plural(b.itens.length, 'item', 'itens') + ' para comprar' : '') + ' · atualiza a ficha a cada UP' : ''
      ], wz.build === b.name, () => { applyBuild(b); toast('Build ' + b.name + ' aplicada. Ajuste o que quiser nas outras partes.'); goStep(STEP.especime); }))));
      if (!list.length) body.append(h('p', 'empty', 'Nenhuma build com esse termo.'));
      const skip = h('button', 'btn btn--ghost btn--sm', skipBuilds() ? 'Voltar a mostrar esta tela sempre' : 'Sempre pular');
      skip.type = 'button';
      skip.addEventListener('click', () => {
        const on = !skipBuilds();
        setSkipBuilds(on);
        toast(on ? 'As recomendações não abrem mais sozinhas. Ficam na aba Builds.' : 'As recomendações voltam a abrir primeiro.');
        if (on) goStep(STEP.especime); else renderSetup();
      });
      const own = h('button', 'btn btn--ghost btn--sm', 'Montar do meu jeito');
      own.type = 'button';
      own.addEventListener('click', () => goStep(STEP.especime));
      body.append(h('div', 'setup__builds-foot', own, skip));
      body.append(wzCreate('build', (e) => {
        const b = buildOf(e);
        wz.builds = (wz.builds || all).concat([b]);
        applyBuild(b);
        renderSetup();
      }));
    }

    if (wz.step === STEP.especime) {
      const species = BUILTINS.filter((e) => e.kind === 'especime' && secretOk(e, wz.q));
      if (wz.specimen && !species.some((e) => e.id === wz.specimen.id)) species.push(wz.specimen);
      const grid = h('div', 'pick-grid', ...rankSearch(species, wz.q, (e) => wzFields([e.name, racialLines(e.values).map((t) => t.name).join(' '), e.values.descricao, e.values.tracos])).map((e) => pickCard(e.name, [specimenLine(e), e.values.descricao],
        Boolean(wz.specimen && wz.specimen.id === e.id), () => { wz.specimen = slotSnap(e); wz.specimen.thumb = e.thumb || ''; renderSetup(); })));
      grid.append(pickCard('Buscar outro', ['Qualquer espécime do banco, inclusive os criados na Oficina.'], false, async () => {
        const e = await openPicker({ title: 'Escolher espécime', kinds: ['especime'], chips: ['Espécime'], filter: (x) => x.kind === 'especime', create: { label: 'Criar espécime', onClick: () => openWzCreate('especime') } });
        if (!e || !wz) return;
        wz.specimen = Object.assign(slotSnap(e), { thumb: e.thumb || '' });
        renderSetup();
      }));
      body.append(grid, wzCreate('especime', (e) => { wz.specimen = Object.assign(slotSnap(e), { thumb: e.thumb || '' }); renderSetup(); }));
    }

    if (wz.step === STEP.origem) {
      const list = ORIGINS.slice();
      if (wz.originEntry && !list.some((o) => nameKey(o.name) === nameKey(wz.originEntry.name))) list.push(wz.originEntry);
      const og = h('div', 'pick-grid', ...list.filter((o) => wzMatch(o.name, o.text, o.items.join(' '))).map((o) => pickCard(o.name, [o.text],
        nameKey(wz.origin) === nameKey(o.name), () => { wz.origin = o.name; renderSetup(); })));
      og.append(pickCard('Buscar outra', ['Qualquer origem do banco, inclusive as criadas na Oficina.'], false, async () => {
        const e = await openPicker({ title: 'Escolher origem', kinds: ['origem'], chips: ['Origem'], filter: (x) => x.kind === 'origem', create: { label: 'Criar origem', onClick: () => openWzCreate('origem') } });
        if (!e || !wz) return;
        wz.originEntry = bankOrigin(e);
        wz.origin = e.name;
        renderSetup();
      }));
      body.append(og,
        wzCreate('origem', (e) => { wz.originEntry = bankOrigin(e); wz.origin = e.name; renderSetup(); }),
        h('div', 'fields-grid',
          setupField('wz-origin', 'Origem (ou escreva outra)', wz.origin, 'Ex.: Exilado Urbano', (v) => { wz.origin = v; }, 60),
          setupField('wz-age', 'Idade', wz.age, 'Ex.: 27 anos', (v) => { wz.age = v; }, 20),
          setupField('wz-height', 'Altura', wz.height, 'Ex.: 1,78 m', (v) => { wz.height = v; }, 20),
          setupField('wz-sex', 'Sexo', wz.sex, '', (v) => { wz.sex = v; }, 20)));
      sexPicker($('#wz-sex', body), () => Boolean(wz && isNeko(wz.specimen)));
      if ($('#wz-sex', body).syncFlag) $('#wz-sex', body).syncFlag();
    }

    if (wz.step === STEP.equip) renderGear(body);

    if (wz.step === STEP.atributos) {
      const p = attrPool(wz.attrs);
      const m = previewSheet();
      body.append(h('p', 'setup__pool' + (p.left < 0 ? ' setup__pool--over' : ''), 'Pontos para distribuir: ', h('strong', '', String(p.left))));
      body.append(h('div', 'attr-band', ...ATTRS.map((at) => {
        const v = wz.attrs[at.id];
        const st2 = stepper(v, { min: -1, max: 3, label: at.label, fid: 'wz-' + at.id, text: '', onChange: (n) => { wz.attrs[at.id] = n; renderSetup('wz-' + at.id + (n > v ? '+' : '-')); } });
        const btns = $$('button', st2);
        if (v === 0 && p.neg && !btns[0].disabled) btns[0].disabled = true; // só um atributo pode ir a –1
        if (p.left <= 0 && v >= 0) btns[1].disabled = true;
        return h('div', 'attr attr--' + at.id, h('span', 'attr__name', at.label), h('span', 'attr__value', signed(v)), st2, h('span', 'attr__feeds', at.hint));
      })));
      body.append(h('p', 'setup__preview', 'Com isto: ' + LIFE.filter((l) => m.max[l[0]] > 0).map((l) => l[1] + ' ' + m.max[l[0]]).join(' · ') + ' · PE ' + m.max.pe + ' · PA ' + m.max.pa + ' · Carga ' + fmtNum(m.cargaMax) + '.'));
    }

    if (wz.step === STEP.pericias) {
      const c = skillCount(wz.skills);
      const livre = wz.skillMode === 'livre';
      body.append(h('div', 'segmented skill-modes', ...[['padrao', '2 com +2 e 1 com +1'], ['livre', '5 pontos livres (até +2)']].map((m) => {
        const inp = h('input');
        inp.type = 'radio';
        inp.name = 'skill-mode';
        inp.value = m[0];
        inp.checked = (wz.skillMode || 'padrao') === m[0];
        inp.dataset.fid = 'skill-mode-' + m[0];
        inp.addEventListener('change', () => { wz.skillMode = m[0]; renderSetup('skill-mode-' + m[0]); });
        return h('label', 'segmented__opt', inp, h('span', '', m[1]));
      })));
      body.append(livre
        ? h('p', 'setup__pool' + (c.sum > SKILL_POINTS ? ' setup__pool--over' : ''), 'Pontos para distribuir: ', h('strong', '', String(SKILL_POINTS - c.sum)), ' de ' + SKILL_POINTS + ' (no máximo +2 em cada perícia)')
        : h('p', 'setup__pool', 'Com +2: ', h('strong', '', c.two + ' de 2'), ' · Com +1: ', h('strong', '', c.one + ' de 1')));
      ATTRS.forEach((at) => {
        const group = h('div', 'skills skills--' + at.id, h('h3', 'skills__title', at.label + ' ', h('span', 'skills__attr', signed(wz.attrs[at.id]))));
        const line = h('div', 'skill-picks');
        SKILLS[at.id].forEach((sk) => {
          const info = (window.VORTEX_PERICIAS || []).find((x) => x.name === sk[1]) || {};
          if (!wzMatch(sk[1], at.label, info.summary, info.uses) && !wz.skills[sk[0]]) return;
          const v = wz.skills[sk[0]] || 0;
          const b = h('button', 'skill-pick' + (v ? ' skill-pick--' + v : ''), sk[1], h('span', 'skill-pick__v', v ? '+' + v : '—'));
          b.type = 'button';
          b.dataset.fid = 'wzs-' + sk[0];
          b.setAttribute('aria-label', sk[1] + ': ' + (v ? '+' + v : 'sem bônus') + '. Toque para alternar.');
          if (info.summary) b.title = info.summary + ' ' + (info.uses || '');
          b.addEventListener('click', () => {
            const next = (v + 1) % 3;
            if (livre && next > v && c.sum >= SKILL_POINTS) { toast('Os ' + SKILL_POINTS + ' pontos já foram usados. Tire de outra perícia primeiro.'); return; }
            if (next) wz.skills[sk[0]] = next; else delete wz.skills[sk[0]];
            renderSetup('wzs-' + sk[0]);
          });
          line.append(b);
        });
        group.append(line);
        if (line.children.length) body.append(group);
      });
      if (wz.skills.oficio) body.append(setupField('wz-oficio', 'Ofício: qual profissão?', wz.oficio, 'Ex.: mecânica', (v) => { wz.oficio = v; }, 40));
    }

    if (wz.step === STEP.profs) {
      const pills = profPills(wz.profs, (id, on) => { wz.profs = wz.profs.filter((x) => x !== id); if (on) wz.profs.push(id); renderSetup('wzp-' + id); }, 4, 'wzp-');
      $$('label', pills).forEach((l) => { const inp = $('input', l); if (!inp.checked && !wzMatch(l.textContent)) l.hidden = true; });
      body.append(h('p', 'setup__pool', 'Escolhidas: ', h('strong', '', wz.profs.length + ' de 4')),
        pills,
        h('p', 'field__hint', 'Em armas: cadência perita e o aprimoramento do tipo. Em armaduras: a penalidade não dobra e a defesa ganha +1.'));
    }

    if (wz.step === STEP.resumo) {
      const m = previewSheet();
      const probs = allProblems();
      if (probs.length) body.append(h('div', 'setup__probs', h('p', 'alerts__title', 'Falta completar'), ...probs.map((p) => {
        const b = h('button', 'link-btn', 'Ir para ' + SETUP[p[0]].tab);
        b.type = 'button';
        b.addEventListener('click', () => goStep(p[0]));
        return h('p', 'alerts__item', p[1] + ' ', b);
      })));
      const skills = [];
      ATTRS.forEach((at) => SKILLS[at.id].forEach((sk) => { if (wz.skills[sk[0]]) skills.push(sk[1] + ' +' + wz.skills[sk[0]]); }));
      const row = (k, v) => [h('dt', '', k), h('dd', '', v || '—')];
      body.append(h('dl', 'member__data setup__summary',
        ...row('Build', wz.build || 'do seu jeito'),
        ...row('Espécime', wz.specimen ? wz.specimen.name + ' (' + specimenLine(wz.specimen) + ')' : ''),
        ...row('Origem', wz.origin),
        ...row('Itens iniciais', gearSummary(gearFor(originOf(wz.origin)))),
        ...row('Atributos', ATTRS.map((at) => at.label + ' ' + signed(wz.attrs[at.id])).join(' · ')),
        ...row('Perícias', skills.join(' · ')),
        ...row('Proficiências', PROFS.filter((p) => wz.profs.indexOf(p.id) >= 0).map((p) => p.label).join(' · ')),
        ...row('Recursos', LIFE.filter((l) => m.max[l[0]] > 0).map((l) => l[1] + ' ' + m.max[l[0]]).join(' · ') + ' · PE ' + m.max.pe + ' · PA ' + m.max.pa),
        ...row('Defesa mínima', String(m.defMin)),
        ...row('Carga', fmtNum(m.cargaMax)),
        ...row('UP iniciais', String(m.upTotal))));
    }

    // pode seguir mesmo com algo pendente: só o Concluir exige tudo certo
    const problem = setupProblem();
    $('#setup-error').textContent = problem;
    $('#setup-back').hidden = wz.step === 0;
    const next = $('#setup-next');
    const last = wz.step === SETUP.length - 1;
    next.textContent = last ? 'Criar personagem' : 'Próximo: ' + SETUP[wz.step + 1].tab;
    next.disabled = last && allProblems().length > 0;
    if (focusId) { const el = $('[data-fid="' + focusId + '"]', body) || $('[data-fid^="' + focusId.slice(0, -1) + '"]:not(:disabled)', body); if (el) el.focus({ preventScroll: true }); }
  }

  function openSetup() {
    const c = sheetChar, s = c.sheet;
    wz = {
      step: skipBuilds() ? STEP.especime : STEP.builds, seen: new Set(), q: '', build: '', attrs: Object.assign({}, s.attrs), skills: {}, profs: s.profs.slice(0, 4), oficio: s.oficio || '',
      specimen: s.specimen ? deep(s.specimen) : null, origin: c.origin || '', age: c.age || '', height: s.height || '', sex: s.sex || '',
      gear: { mode: s.originItems ? 'nenhum' : 'kit', origin: null, lines: [], budget: START_CRONOS, cart: [], shop: null, guideFilled: '' }
    };
    Object.keys(s.skills).forEach((k) => { if (s.skills[k] === 1 || s.skills[k] === 2) wz.skills[k] = s.skills[k]; });
    wz.skillMode = !skillsOk(wz.skills, 'padrao') && skillsOk(wz.skills, 'livre') ? 'livre' : 'padrao';
    if (attrPool(wz.attrs).left < 0 || ATTRS.some((at) => wz.attrs[at.id] > 3)) wz.attrs = { corpo: 0, precisao: 0, essencia: 0 }; // ficha já evoluída: recomeça do zero
    renderSetup();
    openDialog(setupDlg);
    $('#setup-title').focus({ preventScroll: true });
    loadWzBuilds();
  }

  function finishSetup() {
    const c = sheetChar, s = c.sheet;
    s.attrs = Object.assign({}, wz.attrs);
    s.skills = Object.assign({}, wz.skills);
    s.profs = wz.profs.slice();
    s.oficio = wz.skills.oficio ? cleanName(wz.oficio) : '';
    s.specimen = wz.specimen;
    s.height = wz.height;
    s.sex = wz.sex;
    s.cur = {};
    s.setup = true;
    if (wz.specimen) { c.species = wz.specimen.name; dirty.add('species'); }
    grantBirthPowers(s);
    c.origin = cleanName(wz.origin).slice(0, 60);
    c.age = wz.age;
    dirty.add('origin'); dirty.add('age');
    const origin = originOf(wz.origin);
    const g = gearFor(origin);
    const got = gearEntries(g);
    got.forEach((e) => s.inventory.push(e));
    if (got.length) s.originItems = g.mode === 'preco' ? 'Compra inicial' : origin.name;
    const guided = wz.guide && !(s.guide && s.guide.id === wz.guide.id && s.guide.name === wz.guide.name);
    if (guided) s.guide = guideFrom(wz.guide); // as folhas até os UP iniciais entram já no próximo desenho da ficha
    wz = null;
    closeDialog(setupDlg);
    fillBasics();
    changed();
    flushSave();
    toast('Personagem pronto: a ficha já está preenchida.' + (guided ? ' A build ' + s.guide.name + ' vai atualizar a ficha a cada UP; as folhas ficam em Progressão.' : ''));
  }

  $('#setup-open').addEventListener('click', openSetup);
  $('#setup-back').addEventListener('click', () => goStep(wz.step - 1));
  $('#setup-next').addEventListener('click', () => {
    if (wz.step === SETUP.length - 1) { if (!allProblems().length) finishSetup(); return; }
    goStep(wz.step + 1);
  });
  $('#setup-search').addEventListener('input', debounce(() => { if (!wz) return; wz.q = $('#setup-search').value; renderSetup(); }, 200));
  $('#setup-skip').addEventListener('click', () => {
    sheetChar.sheet.setup = true; // não abre sozinha de novo; o botão "Distribuição inicial" continua na ficha
    wz = null;
    closeDialog(setupDlg);
    touchSheet();
  });
  setupDlg.addEventListener('close', () => { wz = null; });
  $('#setup-side-toggle').addEventListener('click', () => {
    const on = $('.setup').classList.toggle('setup--side');
    $('#setup-side-toggle').setAttribute('aria-expanded', String(on));
    $('#setup-side-toggle').textContent = on ? 'Voltar à etapa' : 'Ver ficha';
  });

  /* Exportar: PDF, Word, texto ou copiar */
  const exportDlg = $('#export-dialog');
  $('#export-open').addEventListener('click', async () => { await flushSave(); openDialog(exportDlg); });
  $('#export-close').addEventListener('click', () => closeDialog(exportDlg));
  $$('[data-export]').forEach((b) => b.addEventListener('click', () => doExport(b.dataset.export)));

  function exportFields(c) {
    const s = normSheet(c.sheet);
    const m = compute({ sheet: s });
    const skills = [];
    ATTRS.forEach((at) => SKILLS[at.id].forEach((sk) => { if (skillOf(s, sk[0])) skills.push(sk[1] + (sk[0] === 'oficio' && s.oficio ? ' (' + s.oficio + ')' : '') + ' +' + skillOf(s, sk[0])); }));
    const life = LIFE.filter((l) => m.max[l[0]] > 0).map((l) => l[1] + ' ' + getCur(s, l[0], m.max[l[0]]) + '/' + m.max[l[0]]);
    const inv = s.inventory.map((i) => {
      const parts = (i.slots.mods || []).concat(i.slots.props || [], i.slots.accs || []).map((x) => x.name);
      return i.name + ((i.qty || 1) > 1 ? ' ×' + i.qty : '') + (i.slot ? ' [' + slotDef(i.slot).full + ']' : '') + (parts.length ? ' (' + parts.join(', ') + ')' : '');
    });
    return [
      ['Espécime', c.species], ['Idade', c.age], ['Altura e peso', [s.height, s.weight].filter(Boolean).join(' · ')], ['Sexo', s.sex], ['Origem', c.origin],
      ['Atributos', ATTRS.map((at) => at.label + ' ' + signed(attrOf(s, at.id))).join(' · ')],
      ['Recursos', life.concat(['PE ' + getCur(s, 'pe', m.max.pe) + '/' + m.max.pe, 'PA ' + getCur(s, 'pa', m.max.pa) + '/' + m.max.pa]).join(' · ')],
      ['Defesa mínima', String(m.defMin)],
      ['Perícias', skills.join(' · ')],
      ['Proficiências', PROFS.filter((p) => s.profs.indexOf(p.id) >= 0).map((p) => p.label).join(' · ')],
      ['XP e UP', 'XP ' + num(s.xp) + ' · UP ' + m.upTotal + ' (' + m.upSpent + ' gastos)'],
      ['Poderes', s.powers.map((p) => p.name).join(' · ')],
      ['Carga', fmtNum(m.cargaUsed) + ' de ' + fmtNum(m.cargaMax) + (m.over ? ' (sobrecarga)' : '')],
      ['Inventário', inv.join(' · ')]
    ];
  }

  async function doExport(kind) {
    try {
      const c = (await db.getCharacter(sheetChar.id)) || sheetChar; // dados mais recentes
      const camps = await db.listCharacterCampaigns(c.id).catch(() => []);
      const model = {
        title: c.name, kind: TYPE_LABEL[c.type],
        fields: exportFields(c),
        campaigns: camps.map((x) => x.name), image: c.image, date: new Date().toLocaleDateString('pt-BR')
      };
      const base = fileSlug(c.name) + '-ficha';
      if (kind === 'pdf') downloadFile(makePdf(model), 'application/pdf', base + '.pdf');
      else if (kind === 'docx') downloadFile(makeDocx(model), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', base + '.docx');
      else if (kind === 'txt') downloadFile(enc.encode('﻿' + sheetText(model)), 'text/plain;charset=utf-8', base + '.txt');
      else if (!(await copyText(sheetText(model)))) { toast('Não foi possível copiar sozinho. Baixe o .txt.'); return; }
      closeDialog(exportDlg);
      toast(kind === 'copy' ? 'Texto da ficha copiado.' : 'Arquivo gerado.');
    } catch (err) { toast(errorMessage(err)); }
  }

  function fillBasics() {
    const c = sheetChar;
    fName.value = c.name;
    fSpecies.value = c.species;
    fAge.value = c.age;
    fOrigin.value = c.origin;
    fHeight.value = c.sheet.height || '';
    $('#f-weight').value = c.sheet.weight || '';
    fSex.value = c.sheet.sex || '';
    if (fSex.syncFlag) fSex.syncFlag();
    $('#f-lore').value = c.sheet.lore || '';
  }
  $('#origin-list').replaceChildren(...ORIGINS.map((o) => { const op = h('option'); op.value = o.name; return op; }));

  views.character = async function showSheet(id) {
    await flushSave(); // não perde edição pendente da ficha anterior
    const c = await db.getCharacter(id);
    if (!c) { toast('Não encontramos essa ficha.'); go('personagens'); return; }
    c.sheet = normSheet(c.sheet);
    sheetChar = c;
    dirty.clear();
    lastCharacterId = id;
    quickUpdate(c, true);
    onLeave = () => { flushSave(); };
    renderSheetHeader();
    fillBasics();
    setError(errName, fName, '');
    setError(errAttach, inAttach, '');
    setStatus('');
    renderPortrait();
    renderPin();
    renderSheetFav();
    rerender();
    $('#setup-open').textContent = c.sheet.setup ? 'Refazer distribuição inicial' : 'Distribuição inicial';
    $('#danger-zone').hidden = !c.mine;
    if (profile && c.mine && !isMyChar(c.id)) profileSet('chars', c.id, true); // ficha criada neste aparelho fica no perfil
    $('#delete-character').textContent = 'Excluir ' + (c.type === 'criatura' ? 'criatura' : 'personagem');
    await renderSheetCampaigns();
    if (!c.sheet.setup && (c.mine || isMyChar(c.id)) && sheetChar === c) openSetup(); // primeira vez: abre a distribuição inicial
  };

  /* ---------- Campanha ---------- */
  let currentCamp = null;
  let members = [];
  let firstRolls = true;
  const speakerEl = $('#speaker');

  function renderRolls(list) {
    const log = $('#roll-log');
    const stick = firstRolls || log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    log.replaceChildren(...list.map(rollRow));
    lastRolls = list;
    if (currentCamp) renderBattleLog();
    $('#roll-empty').hidden = list.length > 0;
    if (stick) log.scrollTop = log.scrollHeight;
    firstRolls = false;
  }

  // Abas da campanha; a última aberta fica guardada por campanha.
  // Grupo, Combate, Lojas e Saque para todos; Bestiário e Itens só para o mestre.
  const CAMP_TABS_ALL = ['grupo', 'combate', 'lojas', 'saque', 'bestiario', 'itens'];
  const CAMP_TABS_GM = ['bestiario', 'itens'];
  const campTabs = () => CAMP_TABS_ALL.filter((k) => (currentCamp && currentCamp.gm) || CAMP_TABS_GM.indexOf(k) < 0);
  const campTabKey = (id) => 'vortex.campTab.' + id;
  function setCampTab(name, focus) {
    const tabs = campTabs();
    CAMP_TABS_GM.forEach((k) => { $('#ctab-' + k).hidden = tabs.indexOf(k) < 0; });
    if (name === 'mestre') name = currentCamp && currentCamp.gm ? 'bestiario' : 'saque'; // a antiga aba única
    if (tabs.indexOf(name) < 0) name = 'combate';
    $$('.camp-tab').forEach((t) => {
      const on = t.dataset.ctab === name;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
      if (on && !focus) t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    CAMP_TABS_ALL.forEach((k) => { $('#cpanel-' + k).hidden = k !== name; });
    if (name === 'saque') renderLootTab();
    if (name === 'bestiario') { renderFallen(); runBeast(); }
    if (name === 'itens') renderItemsTab();
    if (currentCamp) { try { localStorage.setItem(campTabKey(currentCamp.id), name); } catch (e) { /* sem armazenamento: só agora */ } }
  }
  $$('.camp-tab').forEach((tab) => {
    tab.addEventListener('click', () => setCampTab(tab.dataset.ctab));
    tab.addEventListener('keydown', (ev) => {
      const next = ev.key === 'ArrowRight' || ev.key === 'ArrowDown';
      if (!next && ev.key !== 'ArrowLeft' && ev.key !== 'ArrowUp') return;
      ev.preventDefault();
      const tabs = campTabs();
      const i = tabs.indexOf(tab.dataset.ctab);
      setCampTab(tabs[(i + (next ? 1 : tabs.length - 1)) % tabs.length], true);
    });
  });

  // Testes prontos com a ficha de quem está rolando
  const testPick = $('#test-pick');
  const sheetOf = (c) => Object.assign({}, c, { sheet: normSheet(c.sheet) });
  function renderTestPick() {
    const speaker = members.find((m) => m.mine && m.characterId === speakerEl.value);
    const keep = testPick.value;
    testPick.replaceChildren();
    if (!speaker) return;
    const groups = {};
    testCatalog(sheetOf(speaker)).forEach((t) => {
      if (!groups[t.group]) { groups[t.group] = h('optgroup'); groups[t.group].label = t.group; testPick.append(groups[t.group]); }
      const o = h('option', '', t.label);
      o.value = t.id;
      groups[t.group].append(o);
    });
    if (keep && $('option[value="' + CSS.escape(keep) + '"]', testPick)) testPick.value = keep;
  }
  speakerEl.addEventListener('change', () => { lastCharacterId = speakerEl.value; renderTestPick(); renderDock(); renderShops(); renderLoot(); renderVaults(); });

  /* ---------- Painel do personagem (estilo barra de ações de RPG) ----------
     O personagem escolhido fica no topo da campanha: retrato, barras de recurso
     e as ações dele em abas (Ações, Testes, Dados). "Fixar" guarda a escolha
     neste aparelho para a campanha e coloca a ficha no acesso rápido. */
  const pinKey = (campId) => 'vortex.campChar.' + campId;
  const pinGet = (campId) => { try { return localStorage.getItem(pinKey(campId)) || ''; } catch (e) { return ''; } };
  const pinSet = (campId, id) => { try { if (id) localStorage.setItem(pinKey(campId), id); else localStorage.removeItem(pinKey(campId)); } catch (e) { /* sem armazenamento: só nesta visita */ } };
  const dockMember = () => members.find((m) => m.mine && m.characterId === speakerEl.value);

  function dockBar(key, label, cur, max) {
    const pct = max > 0 ? clamp(cur / max, 0, 1) * 100 : 0;
    const fill = h('span', 'dbar__fill');
    fill.style.width = pct.toFixed(1) + '%';
    const bar = h('div', 'dbar dbar--' + key, h('span', 'dbar__label', label), h('span', 'dbar__val', cur + '/' + max), h('span', 'dbar__track', fill));
    bar.setAttribute('role', 'meter');
    bar.setAttribute('aria-label', label);
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', String(max));
    bar.setAttribute('aria-valuenow', String(cur));
    return bar;
  }

  // Poderes de uso: as opções compradas que gastam PE (Certeiro, Esquiva...)
  function powerButtons(mb, c) {
    const s = c.sheet;
    const m = compute(c);
    const usable = [];
    s.powers.forEach((p) => powerOpts(p).forEach((o) => { if (powerPicks(p).indexOf(o.name) >= 0 && peCost(o.cost)) usable.push({ p, o, pe: peCost(o.cost) }); }));
    return usable.map((x) => {
      const b = h('button', 'qtest qtest--power', x.o.name, h('span', 'qtest__cost', x.pe + ' PE'));
      b.type = 'button';
      b.title = x.p.name + ': ' + x.o.text;
      b.addEventListener('click', async () => {
        const cur = getCur(s, 'pe', m.max.pe);
        if (cur < x.pe) { toast('PE insuficiente para ' + x.o.name + ' (' + cur + ' de ' + x.pe + ').'); return; }
        b.disabled = true;
        try {
          await patchMemberSheet(mb, (ss) => { const mm = compute(Object.assign({}, mb, { sheet: ss })); setCur(ss, 'pe', getCur(ss, 'pe', mm.max.pe) - x.pe, mm.max.pe); });
          await campaignRoll(mb, { expr: '−' + x.pe + ' PE', label: ('Poder: ' + x.o.name).slice(0, 60), detail: (x.p.name + ' · ' + x.o.text).slice(0, 1450), total: x.pe, flag: '' });
          renderBattle();
          toast(x.o.name + ': −' + x.pe + ' PE.');
        } catch (err) { toast(errorMessage(err)); }
        b.disabled = false;
      });
      return b;
    });
  }

  /* Poderes no combate: cada poder tem um momento (Ataque, Defesa, Ação bônus...). O campo "Quando usa"
     da Oficina decide; sem ele, vale o efeito ("defesa", "ataque"). Os de ataque aparecem dentro do Atacar,
     os de defesa dentro do Rolar defesa e os outros na aba Poderes. */
  const POWER_MOMENTS = ['Ataque', 'Defesa', 'Ação bônus', 'Ação padrão', 'Reação', 'Passivo'];
  function powerMoment(p) {
    const v = (p && p.values) || {};
    if (POWER_MOMENTS.indexOf(v.momento) >= 0) return v.momento;
    const off = p && p.id ? BUILTINS.find((e) => e.id === p.id) : null;
    if (off && off.values && off.values.momento) return off.values.momento;
    const t = nameKey(v.efeito || '');
    if (/defesa/.test(t)) return 'Defesa';
    if (/\bataque|\batacar|\batacando/.test(t)) return 'Ataque';
    return powerOpts(p).length || peCost(v.custoUso) ? 'Ação bônus' : 'Passivo';
  }
  // o que o personagem pode usar: as opções compradas de um poder-lista, ou o próprio poder
  function powerUses(s) {
    const out = [];
    (s.powers || []).forEach((p) => {
      const when = powerMoment(p);
      const v = p.values || {};
      const opts = powerOpts(p);
      if (opts.length) opts.forEach((o) => { if (powerPicks(p).indexOf(o.name) >= 0) out.push({ key: (p.id || p.name) + '|' + o.name, p, name: o.name, from: p.name, text: o.text, pe: peCost(o.cost), when }); });
      else out.push({ key: (p.id || p.name) + '|', p, name: p.name, from: '', text: v.efeito || '', pe: peCost(v.custoUso), when });
    });
    return out;
  }
  // paga o PE de uma lista de usos de uma vez; false se não der
  async function payPowers(mb, uses) {
    const pe = uses.reduce((t, u) => t + u.pe, 0);
    if (!pe) return true;
    const c = sheetOf(mb);
    const cur = getCur(c.sheet, 'pe', compute(c).max.pe);
    if (cur < pe) { toast('PE insuficiente: ' + uses.map((u) => u.name).join(', ') + ' custam ' + pe + ' PE e há ' + cur + '.'); return false; }
    try { await patchMemberSheet(mb, (ss) => { const mm = compute(Object.assign({}, mb, { sheet: ss })); setCur(ss, 'pe', getCur(ss, 'pe', mm.max.pe) - pe, mm.max.pe); }); }
    catch (err) { toast(errorMessage(err)); return false; }
    return true;
  }
  const powerNote = (uses) => (uses.length ? 'Poderes: ' + uses.map((u) => u.name + (u.pe ? ' (−' + u.pe + ' PE)' : '')).join(', ') : '');
  // marcar poderes de um momento antes de agir (Atacar, Rolar defesa)
  function powerToggles(mb, when, set, onChange) {
    const uses = powerUses(sheetOf(mb).sheet).filter((u) => u.when === when);
    if (!uses.length) return null;
    return h('div', 'cmd__pows', h('span', 'cmd__pows-title', when === 'Ataque' ? 'Poderes no ataque' : 'Poderes na defesa'),
      h('div', 'cmd__chips', ...uses.map((u) => {
        const on = set.has(u.key);
        const b = h('button', 'man__opt pow__opt' + (on ? ' is-on' : ''), u.name, u.pe ? h('span', 'qtest__cost', u.pe + ' PE') : null);
        b.type = 'button';
        b.title = (u.from ? u.from + ': ' : '') + u.text;
        b.dataset.fid = ('pow-' + nameKey(u.name)).replace(/\s+/g, '-');
        b.setAttribute('aria-pressed', String(on));
        b.addEventListener('click', () => { if (set.has(u.key)) set.delete(u.key); else set.add(u.key); onChange(); });
        return b;
      })),
      h('p', 'cmd__note', uses.filter((u) => set.has(u.key)).map((u) => u.name + ': ' + u.text).join(' ') || 'Toque para ativar junto com a ação; o PE sai quando a ação acontece.'));
  }
  // aba Poderes: tudo o que o personagem tem, separado pelo momento de uso
  function powersTab(actor) {
    const mb = actor.member;
    const uses = powerUses(sheetOf(mb).sheet);
    if (!uses.length) return h('p', 'cmd__note', 'Este personagem não tem poderes.');
    const go = (cmd, slot) => { battle.slot = slot; battle.cmd = cmd; battle.view = 'cfg'; renderBattle(); };
    const groups = POWER_MOMENTS.map((when) => {
      const list = uses.filter((u) => u.when === when);
      if (!list.length) return null;
      return h('section', 'pows__group', h('h4', 'pows__title', when),
        ...list.map((u) => {
          let act = null;
          if (when === 'Ataque') act = gmBtn('Usar no Atacar', 'btn--ghost', () => { battle.atkPow.add(u.key); go('atacar', 'padrao'); });
          else if (when === 'Defesa') act = gmBtn('Usar na defesa', 'btn--ghost', () => { battle.defPow.add(u.key); go('defesa', 'livre'); });
          else if (when !== 'Passivo') {
            const cost = when === 'Ação bônus' ? 'bonus' : when === 'Ação padrão' ? 'padrao' : '';
            act = gmBtn('Usar' + (u.pe ? ' (−' + u.pe + ' PE)' : ''), 'btn--primary', async () => {
              if (cost && slotUsed(actor, cost)) { toast(SLOT_LONG[cost] + ' já foi usada neste turno.'); return; }
              if (!(await payPowers(mb, [u]))) return;
              const paid = econPay(actor, cost);
              await campaignRoll(mb, { expr: u.pe ? '−' + u.pe + ' PE' : 'poder', label: ('Poder: ' + u.name).slice(0, 60), detail: [paid, (u.from ? u.from + ' · ' : '') + u.text].filter(Boolean).join(' · ').slice(0, 1450), total: u.pe, flag: '' });
              toast(u.name + (u.pe ? ': −' + u.pe + ' PE.' : ' usado.'));
              renderBattle();
            });
          }
          return h('div', 'pows__item', h('span', 'pows__head', h('strong', '', u.name), u.from ? h('span', 'tag', u.from) : null, u.pe ? h('span', 'qtest__cost', u.pe + ' PE') : h('span', 'tag', when === 'Passivo' ? 'sempre ativo' : 'sem custo')),
            u.text ? h('span', 'pows__text', u.text) : null, act);
        }));
    }).filter(Boolean);
    return h('div', 'pows', ...groups);
  }

  function renderDock() {
    const dock = $('#dock');
    const mb = currentCamp && dockMember();
    if (!mb || !mb.sheet) { dock.hidden = !mb; if (mb) { $('#dock-title').textContent = mb.name; $('#dock-meta').textContent = 'Ficha ainda sem atributos.'; } return; }
    dock.hidden = false;
    const myTurn = Boolean(sceneOn() && sceneCurrent() && sceneCurrent().id === 'chr:' + mb.characterId);
    $('#dock-turn').hidden = !myTurn;
    dock.classList.toggle('dock--turn', myTurn);
    const c = sheetOf(mb);
    const s = c.sheet;
    const m = compute(c);
    const pic = $('#dock-pic');
    pic.className = 'dock__pic token token--' + mb.type;
    pic.replaceChildren();
    if (mb.image || mb.thumb) { const img = h('img'); img.src = mb.image || mb.thumb; img.alt = ''; pic.append(img); pic.classList.add('token--img'); }
    else pic.textContent = mb.name.trim().charAt(0).toUpperCase();
    $('#dock-title').textContent = mb.name;
    const def = charDef(c, m);
    $('#dock-meta').textContent = [mb.species, mb.origin, 'Defesa ' + def, 'Corpo ' + signed(attrOf(s, 'corpo')) + ' · Precisão ' + signed(attrOf(s, 'precisao')) + ' · Essência ' + signed(attrOf(s, 'essencia'))].filter(Boolean).join(' · ');
    const pinned = pinGet(currentCamp.id) === mb.characterId;
    const pin = $('#dock-pin');
    pin.textContent = pinned ? '★ Seu personagem nesta campanha' : '☆ Fixar como meu personagem';
    pin.setAttribute('aria-pressed', String(pinned));
    pin.classList.toggle('dock__pin--on', pinned);
    $('#dock-sheet').href = '#/character/' + encodeURIComponent(mb.characterId);

    const bars = [];
    charLayers(c).filter((l) => l.max > 0).reverse().forEach((l) => bars.push(dockBar(l.key, l.key === 'pv' ? 'PV' : l.key === 'escudo' ? 'Escudo' : 'Blindagem', l.cur, l.max)));
    bars.push(dockBar('pe', 'PE', getCur(s, 'pe', m.max.pe), m.max.pe));
    bars.push(dockBar('pa', 'PA', getCur(s, 'pa', m.max.pa), m.max.pa));
    const state = lifeState(charLayers(c));
    $('#dock-bars').replaceChildren(...bars, ...(state ? [h('span', 'tag tag--down dock__state', state)] : []));
  }

  $('#dock-pin').addEventListener('click', () => {
    const mb = dockMember();
    if (!mb || !currentCamp) return;
    const on = pinGet(currentCamp.id) !== mb.characterId;
    pinSet(currentCamp.id, on ? mb.characterId : '');
    if (on) {
      quickAdd({ id: mb.characterId, name: mb.name, type: mb.type, thumb: mb.thumb || '', species: mb.species || '', mine: true });
      toast(mb.name + ' é o seu personagem nesta campanha e está no acesso rápido.');
    }
    renderDock();
  });
  function playAs(id) {
    speakerEl.value = id;
    lastCharacterId = id;
    renderTestPick();
    renderDock();
    setCampTab('combate');
    $('#dock').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('#test-roll').addEventListener('click', async () => {
    const speaker = members.find((m) => m.mine && m.characterId === speakerEl.value);
    if (!speaker || !testPick.value) return;
    const id = testPick.value;
    let c = speaker;
    try { const fresh = await db.getCharacter(speaker.characterId); if (fresh) { c = Object.assign({}, speaker, fresh); Object.assign(speaker, fresh); } }
    catch (err) { /* sem conexão: usa a ficha já carregada */ }
    const t = testCatalog(sheetOf(c)).find((x) => x.id === id);
    if (!t) { toast('Esse teste não existe mais na ficha.'); renderTestPick(); return; }
    await campaignRoll(speaker, rollTest(t.make()));
    renderTestPick();
  });

  /* Mestre: dar XP a todos ou aos personagens escolhidos */
  const xpAll = $('#xp-all');
  function renderXpForm() {
    const form = $('#form-xp');
    form.hidden = !(currentCamp && currentCamp.gm && members.length);
    xpAll.checked = true;
    $('#xp-list').replaceChildren(...members.map((m) => {
      const inp = h('input');
      inp.type = 'checkbox';
      inp.value = m.characterId;
      inp.checked = true;
      inp.addEventListener('change', () => { xpAll.checked = $$('input', $('#xp-list')).every((x) => x.checked); });
      return h('label', 'check check--pill', inp, h('span', '', m.name));
    }));
  }
  xpAll.addEventListener('change', () => { $$('input', $('#xp-list')).forEach((x) => { x.checked = xpAll.checked; }); });
  $('#form-xp').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const amount = Math.round(num($('#xp-amount').value));
    if (amount < 1) { toast('Digite quanto XP dar (1 ou mais).'); $('#xp-amount').focus(); return; }
    const ids = $$('input:checked', $('#xp-list')).map((x) => x.value);
    const chosen = members.filter((m) => ids.indexOf(m.characterId) >= 0);
    if (!chosen.length) { toast('Escolha pelo menos um personagem.'); return; }
    const btn = $('#xp-give');
    btn.disabled = true;
    await giveXp(chosen, amount);
    btn.disabled = false;
    $('#xp-amount').value = '';
  });
  async function giveXp(chosen, amount) {
    const ok = [], failed = [];
    for (const m of chosen) {
      try { await patchMemberSheet(m, (s) => { s.xp = Math.max(0, num(s.xp) + amount); }); ok.push(m.name); }
      catch (err) { console.warn(err); failed.push(m.name); }
    }
    toast((ok.length ? '+' + amount + ' XP para ' + ok.join(', ') + '.' : '') + (failed.length ? ' Não foi possível dar XP para ' + failed.join(', ') + '.' : ''));
    $('#member-list').replaceChildren(...members.map(memberRow));
    tabBadges();
    renderBattle();
  }


  $('#copy-code').addEventListener('click', async () => {
    if (await copyText($('#campaign-code').textContent)) toast('ID copiado.');
    else toast('Não foi possível copiar sozinho. Toque no ID e copie.');
  });

  $('#delete-campaign').addEventListener('click', async () => {
    if (await deleteCampaignFlow(currentCamp)) go('campanhas');
  });

  /* ---------- Combate na campanha ----------
     Regras de Ataque e Defesa: dano = ataque – defesa do alvo (mínimo 1), vezes os disparos.
     O dano passa pelas camadas na ordem Escudo → Blindagem → Vida; cada camada tem fraquezas
     (dano dobrado) e resistências (metade). O dobro da fraqueza não conta para o excedente. */
  const LAYERS = [
    { key: 'escudo', label: 'Escudo', weak: ['Elétrico', 'Contundente'], resist: ['Cortante', 'Perfurante'] },
    { key: 'blindagem', label: 'Blindagem', weak: ['Ácido/químico', 'Explosivo'], resist: ['Fogo', 'Cortante', 'Balístico'] },
    { key: 'pv', label: 'PV', weak: ['Radioativo', 'Cortante'], resist: [] }
  ];
  const splitTypes = (txt) => String(txt || '').split(/\s*[,/]\s*(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])|\s*,\s*/).map((x) => x.trim()).filter(Boolean)
    .map((x) => (/^ácido|^acido|químico/i.test(x) ? 'Ácido/químico' : /^penetrante$/i.test(x) ? 'Perfurante' : x));
  // fraqueza vence resistência; nada se acumula (regra das Observações)
  function layerFactor(layer, types, effective) {
    if (effective === layer.key || types.some((t) => layer.weak.indexOf(t) >= 0)) return 2;
    if (types.some((t) => layer.resist.indexOf(t) >= 0)) return 0.5;
    return 1;
  }
  /* layers: [{ key, cur, max }] na ordem; a última pode ficar negativa até –máximo se for PV.
     Devolve as camadas atualizadas e o que cada uma sofreu. */
  function applyLayeredDamage(base, types, layers, effective) {
    let rest = base;
    const out = layers.map((l) => Object.assign({}, l));
    const steps = [];
    const live = out.filter((l, i) => l.max > 0 && (l.cur > 0 || i === out.length - 1));
    for (let i = 0; i < live.length && rest > 0; i++) {
      const l = live[i];
      const rule = LAYERS.find((x) => x.key === l.key);
      const k = layerFactor(rule, types, effective);
      const eff = k === 0.5 ? Math.max(1, Math.floor(rest / 2)) : rest * k;
      const last = i === live.length - 1;
      const floor = l.key === 'pv' ? -l.max : 0;
      if (last || eff <= l.cur) {
        const taken = Math.min(eff, l.cur - floor);
        l.cur -= taken;
        steps.push({ key: l.key, label: rule.label, taken, k });
        rest = 0;
      } else {
        steps.push({ key: l.key, label: rule.label, taken: l.cur, k });
        rest = Math.max(0, rest - (k === 0.5 ? l.cur * 2 : l.cur)); // a fraqueza não conta para o excedente
        l.cur = 0;
      }
    }
    return { layers: out, steps };
  }
  const factorText = (k) => (k === 2 ? ' (fraqueza ×2)' : k === 0.5 ? ' (resiste: metade)' : '');
  // 0 de vida: fora de combate; vida negativa: morrendo; –PV máximo: morto (capítulo Morte e Agonia).
  // Quem não tem PV (robôs, só escudo e blindagem) fica fora de combate quando tudo zera.
  function lifeState(layers) {
    const pv = layers.find((l) => l.key === 'pv' && l.max > 0);
    if (pv) return pv.cur <= -pv.max ? 'morto' : pv.cur < 0 ? 'morrendo' : pv.cur === 0 ? 'fora de combate' : '';
    return layers.some((l) => l.max > 0) && layers.every((l) => l.cur <= 0) ? 'fora de combate' : '';
  }
  const lifeKey = (st) => (st === 'morto' ? 'morto' : st === 'morrendo' ? 'morrendo' : 'fora');

  // Inimigo (instância na campanha) e personagem viram o mesmo formato de alvo
  const foeVals = (f) => f.values || {};
  function foeLayers(f) {
    const v = foeVals(f);
    const cur = f.cur || {};
    return LAYERS.map((L) => { const max = Math.max(0, Math.round(num(v[L.key]))); return { key: L.key, max, cur: cur[L.key] === undefined || cur[L.key] === null ? max : num(cur[L.key]) }; });
  }
  const foeDefMin = (f) => { const v = foeVals(f); return num(v.armadura || ARMOR_BASE) + num(v.corpo) + num(v.resistencia); };
  const foeDef = (f) => (f.def === undefined || f.def === null ? foeDefMin(f) : num(f.def));
  function charLayers(c) {
    const s = c.sheet;
    const m = compute(c);
    return LAYERS.map((L) => ({ key: L.key, max: m.max[L.key] || 0, cur: m.max[L.key] ? getCur(s, L.key, m.max[L.key]) : 0 }));
  }
  const charDef = (c, m) => { const d = c.sheet.def && currentCamp ? c.sheet.def[currentCamp.id] : null; return d === undefined || d === null ? m.defMin : num(d); };

  let foes = [];
  const combat = { targets: new Set(), who: '', st: {} };
  const layersText = (ls) => ls.filter((l) => l.max > 0).map((l) => (LAYERS.find((x) => x.key === l.key).label) + ' ' + l.cur + '/' + l.max).join(' · ') || 'sem resistências';

  function combatants() {
    const out = foes.map((f) => {
      const ls = foeLayers(f);
      const td = tagDef('foe:' + f.id, foeDef(f), foeDefMin(f));
      return { id: 'foe:' + f.id, foe: f, side: teamIdOf('foe:' + f.id, f), name: f.name, kind: 'NPC', layers: ls, def: td.def, defBase: foeDef(f), defNote: td.note, defRolled: f.def !== undefined && f.def !== null, defMin: foeDefMin(f) };
    });
    members.forEach((mb) => {
      if (!mb.sheet || !mb.sheet.attrs) return;
      if (sceneOut().indexOf('chr:' + mb.characterId) >= 0) return; // o mestre deixou fora do combate
      try {
        const c = sheetOf(mb);
        const m = compute(c);
        const d = c.sheet.def && currentCamp ? c.sheet.def[currentCamp.id] : null;
        const td = tagDef('chr:' + mb.characterId, charDef(c, m), m.defMin);
        out.push({ id: 'chr:' + mb.characterId, member: mb, side: teamIdOf('chr:' + mb.characterId, null), name: mb.name, kind: mb.type === 'criatura' ? 'Criatura' : 'Personagem', layers: charLayers(c), def: td.def, defBase: charDef(c, m), defNote: td.note, defRolled: d !== undefined && d !== null, defMin: m.defMin });
      } catch (err) { console.warn(err); }
    });
    return out;
  }

  /* ---------- Arena (aba Combate) ----------
     Como nos RPGs antigos: o grupo de um lado, os inimigos do outro, a ordem dos turnos no alto e um menu
     de comandos embaixo. Toque num lutador para marcá-lo como alvo. Quem está na vez (ou, fora da cena,
     quem você controla) age pelo menu: Atacar (ataque contra a defesa do alvo), Poderes, Disputa (teste
     contra teste), Defender e Passar a vez. O mestre prepara a cena, põe condições e conduz os turnos.
     Condições ficam na cena (scene.tags: id → [{ n, r }], r = rodadas restantes, 0 = até tirar);
     quem não entra no combate fica em scene.out. */
  const CONDITIONS = ['Atordoado', 'Caído', 'Sangrando', 'Em chamas', 'Envenenado', 'Cego', 'Imobilizado', 'Agarrado', 'Escondido', 'Assustado', 'Lento', 'Inspirado', 'Protegido', 'Concentrado'];
  const battle = { atkPow: new Set(), defPow: new Set(), actor: '', menu: 'acoes', cmd: 'atacar', duel: { mine: '', target: '', theirs: '' }, man: { id: '', target: '' }, heal: { target: '', key: '' }, test: '', advance: '', pin: { id: '', key: '' }, view: 'main', slot: '', aim: null, name: '', xp: '' };
  let lastRolls = [];
  const sceneTags = () => (scene && scene.tags) || {};
  const sceneOut = () => (scene && Array.isArray(scene.out) ? scene.out : []);
  const sceneBase = () => deep(scene || { active: false, name: '', round: 0, turn: 0, order: [] });

  /* Times: cada lutador fica num time com nome e cor, e todos os times lutam entre si.
     scene.teams = [{ id, name, color }], scene.team = { idDoLutador: idDoTime },
     scene.presets = [{ id, name, teams, list }] (times salvos para usar depois; NPCs vão com os números).
     Sem time escolhido: personagens no primeiro time, NPCs no segundo (aliados antigos, no primeiro). */
  const TEAM_COLORS = ['#4f8cff', '#e0484a', '#3fae6a', '#e8a33a', '#a463f2', '#1fb5a8', '#e85aa8', '#9aa4b2'];
  const DEFAULT_TEAMS = [{ id: 't1', name: 'Grupo', color: '#4f8cff' }, { id: 't2', name: 'Inimigos', color: '#e0484a' }];
  const TEAM_MAX = 8;
  const PRESET_MAX = 12;
  const sceneTeams = () => (scene && Array.isArray(scene.teams) && scene.teams.length ? scene.teams : DEFAULT_TEAMS);
  const scenePresets = () => (scene && Array.isArray(scene.presets) ? scene.presets : []);
  const sceneSquads = () => (scene && Array.isArray(scene.squads) ? scene.squads : []);
  const SQUAD_MAX = 20;
  // dois presets prontos: aliados contra inimigos, e com neutros
  const DEFAULT_PRESETS = [
    { id: 'p-av', builtin: true, name: 'Aliados vs Inimigos', teams: [{ id: 't1', name: 'Aliados', color: '#4f8cff' }, { id: 't2', name: 'Inimigos', color: '#e0484a' }], list: [] },
    { id: 'p-avn', builtin: true, name: 'Aliados, Inimigos e Neutros', teams: [{ id: 't1', name: 'Aliados', color: '#4f8cff' }, { id: 't2', name: 'Inimigos', color: '#e0484a' }, { id: 't3', name: 'Neutros', color: '#e8a33a' }], list: [] }
  ];
  // jogador escolhe o time dos próprios personagens em scene.pteam; a escolha do mestre (scene.team) apaga a dele
  function teamIdOf(id, foe, teams, map) {
    const ts = teams || sceneTeams();
    const p = !map && !foe && scene && scene.pteam ? scene.pteam[id] : '';
    if (p && ts.some((y) => y.id === p)) return p;
    const t = (map || (scene && scene.team) || {})[id];
    if (t && ts.some((y) => y.id === t)) return t;
    return foe && foe.side !== 'ally' ? (ts[1] || ts[0]).id : ts[0].id;
  }
  const teamById = (id) => sceneTeams().find((t) => t.id === id) || sceneTeams()[0];
  async function setTeam(id, teamId) {
    const next = sceneBase();
    if (!currentCamp.gm) { // jogador: só o time dos próprios personagens
      if (!isMineId(id)) { toast('Você só escolhe o time dos seus personagens.'); return; }
      next.pteam = Object.assign({}, next.pteam, { [id]: teamId });
      await saveScene(next);
      return;
    }
    if (next.pteam && id in next.pteam) { next.pteam = Object.assign({}, next.pteam); delete next.pteam[id]; }
    next.teams = deep(sceneTeams());
    const keep = combatants().map((x) => x.id).concat(sceneOut());
    const map = {};
    Object.keys(next.team || {}).forEach((k) => { if (keep.indexOf(k) >= 0) map[k] = next.team[k]; });
    map[id] = teamId;
    next.team = map;
    await saveScene(next);
  }
  // tira um lutador da ordem, acertando de quem é a vez
  function dropFromOrder(next, id) {
    const i = Array.isArray(next.order) ? next.order.findIndex((o) => o.id === id) : -1;
    if (i < 0) return;
    next.order.splice(i, 1);
    if (i < next.turn) next.turn -= 1;
    if (next.turn >= next.order.length) next.turn = 0;
    if (!next.order.length) next.active = false;
  }

  function renderCombat() { renderBattle(); }
  function renderScene() { renderBattle(); }
  function renderBattle() {
    if (!currentCamp) return;
    const gm = Boolean(currentCamp.gm);
    const list = combatants();
    if (battle.aim) battle.aim.valid = battle.aim.valid.filter((id) => list.some((x) => x.id === id));
    const on = sceneOn();
    const cur = sceneCurrent();
    $('#ctab-live').hidden = !on;
    $('#ctab-combate').classList.toggle('camp-tab--turn', Boolean(on && cur && isMineId(cur.id)));
    $('#battle').classList.toggle('battle--on', on);
    $('#battle-phase').textContent = on ? 'Rodada ' + scene.round + (scene.name ? ' · ' + scene.name : '') : 'Preparação';
    $('#battle-meta').textContent = on
      ? (cur ? 'Vez de ' + cur.name + (isMineId(cur.id) ? ' (sua)' : '') + '.' : '')
      : (gm ? 'Monte os times (nome e cor) e comece o combate dizendo quem luta contra quem. A iniciativa (2d6 + Precisão + Iniciativa) decide a ordem.' : 'O mestre está preparando a cena. Os comandos abrem quando o combate começar e chegar a sua vez.');
    renderBattleGm(gm, on, list);
    renderOrder(gm, on, list);
    // um bloco por time, com a cor dele; o mestre vê também os times vazios e quem está fora
    const outs = members.filter((mb) => mb.sheet && mb.sheet.attrs && sceneOut().indexOf('chr:' + mb.characterId) >= 0);
    // tocar na caixa de um time abre quem pode entrar nele (o mestre: todos e NPCs; o jogador: os personagens dele)
    const canPlace = gm || members.some((mb) => mb.mine && mb.sheet && mb.sheet.attrs);
    const sides = sceneTeams().map((t) => ({ t, list: list.filter((x) => x.side === t.id) })).map((g) => {
      const ul = h('ul', 'arena__list', ...g.list.map((x) => fighterCard(x, gm, on)), ...(g.list.length ? [] : [h('li', 'arena__empty', canPlace ? 'Ninguém neste time. Toque aqui para pôr alguém.' : 'Ninguém neste time.')]));
      ul.setAttribute('aria-label', g.t.name);
      const add = h('button', 'arena__add', '+ Pôr no time');
      add.type = 'button';
      add.dataset.fid = 'teambox-' + g.t.id;
      add.setAttribute('aria-label', 'Pôr alguém no time ' + g.t.name);
      add.addEventListener('click', () => openTeamBox(g.t.id));
      const side = h('div', 'arena__side' + (canPlace ? ' arena__side--click' : ''), h('p', 'arena__label', h('span', 'arena__dot'), g.t.name, h('span', 'arena__count', String(g.list.length)), canPlace ? add : null), ul);
      side.style.setProperty('--team', g.t.color);
      if (canPlace) side.addEventListener('click', (ev) => { if (!battle.aim && !ev.target.closest('.fighter, button, select, input, a')) openTeamBox(g.t.id); });
      return side;
    });
    if (gm && outs.length) sides.push(h('div', 'arena__side arena__side--out', h('p', 'arena__label', 'Fora do combate'), h('ul', 'arena__list', ...outs.map(outCard))));
    if (!sides.length) sides.push(h('p', 'arena__empty', 'Ninguém na arena ainda.'));
    $('#arena').replaceChildren(...sides);
    renderBanner(gm, on, list);
    renderCmd(gm, on, list);
    if (!renderAimBar(list)) $('#battle-hint').textContent = 'Escolha uma ação nos comandos; quando ela pedir alvo, os alvos possíveis acendem aqui.';
    $('#arena').classList.toggle('arena--aim', Boolean(battle.aim));
    renderBattleLog();
    renderDock();
    renderRest();
  }

  function fighterPic(x) {
    const type = x.foe ? 'criatura' : x.member.type;
    const pic = h('span', 'fighter__pic token token--' + type);
    const img = x.foe ? (x.foe.thumb || '') : (x.member.thumb || x.member.image || '');
    if (img) { const i = h('img'); i.src = img; i.alt = ''; pic.append(i); pic.classList.add('token--img'); }
    else pic.textContent = x.name.trim().charAt(0).toUpperCase();
    return pic;
  }
  const hpSeen = {};
  function fighterCard(x, gm, on) {
    const state = lifeState(x.layers);
    const team = teamById(x.side);
    // tremida e som quando a vida (ou escudo, blindagem) cai desde o último desenho
    const hp = x.layers.reduce((t, l) => t + Math.max(0, l.cur), 0);
    const hit = hpSeen[x.id] !== undefined && hp < hpSeen[x.id];
    if (hit) play('hit');
    hpSeen[x.id] = hp;
    const tags = sceneTags()[x.id] || [];
    const cur = sceneCurrent();
    const now = Boolean(on && cur && cur.id === x.id);
    const aim = battle.aim;
    const aimable = Boolean(aim && aim.valid.indexOf(x.id) >= 0);
    const shots = aimable ? aim.shots[x.id] || 0 : 0;
    const target = shots > 0;
    const bars = x.layers.filter((l) => l.max > 0).reverse().map((l) => {
      const fill = h('span', 'fbar__fill');
      fill.style.width = clamp(Math.max(0, l.cur) / l.max * 100, 0, 100).toFixed(1) + '%';
      return h('span', 'fbar fbar--' + l.key, h('span', 'fbar__txt', (l.key === 'pv' ? 'PV' : l.key === 'escudo' ? 'Escudo' : 'Blind.') + ' ' + l.cur + '/' + l.max), h('span', 'fbar__track', fill));
    });
    const sel = h('button', 'fighter__sel', fighterPic(x),
      h('span', 'fighter__id', h('span', 'fighter__name', x.name), h('span', 'fighter__def', 'Defesa ' + x.def + (x.defNote ? ' (' + x.defNote + ')' : x.defRolled ? '' : ' (mín.)'))),
      target ? h('span', 'fighter__aim', '×' + shots) : aimable ? h('span', 'fighter__aim fighter__aim--can', 'Alvo') : null);
    sel.type = 'button';
    sel.disabled = !aimable;
    if (aimable) sel.setAttribute('aria-label', aim.label + ': ' + x.name);
    sel.addEventListener('click', () => aimPick(x));
    const chips = tags.map((t, i) => {
      const label = t.n + (t.r ? ' · ' + plural(t.r, 'rodada', 'rodadas') : '');
      if (!gm) return h('span', 'ftag', label);
      const b = h('button', 'ftag ftag--edit', label, h('span', 'ftag__x', '×'));
      b.type = 'button';
      b.setAttribute('aria-label', 'Tirar ' + t.n + ' de ' + x.name);
      b.addEventListener('click', () => saveTags(x.id, tags.filter((y, k) => k !== i)));
      return b;
    });
    const acts = [];
    const act = (label, fn, cls) => { const b = h('button', 'fighter__act' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.setAttribute('aria-label', label + ': ' + x.name); b.addEventListener('click', async () => { b.disabled = true; try { await fn(); } catch (err) { toast(errorMessage(err)); } b.disabled = false; }); return b; };
    if (gm) acts.push(act('+ Condição', () => openTagDialog(x)));
    if (x.foe ? gm : (x.member.mine || gm)) acts.push(act('Defesa', () => rollDefense(x)));
    if (x.foe && gm) {
      acts.push(act('Restaurar', () => db.updateFoe(currentCamp.id, x.foe.id, { cur: {}, def: null })));
      acts.push(act('Tirar', async () => { await db.removeFoe(currentCamp.id, x.foe.id); combat.targets.delete(x.id); }, 'fighter__act--bad'));
    }
    if (!x.foe && gm) acts.push(act(on ? 'Tirar do combate' : 'Fora do combate', () => kickOut(x.id), 'fighter__act--bad'));
    const card = h('li', 'fighter' + (now ? ' is-now' : '') + (target ? ' is-target' : '') + (aimable ? ' is-aimable' : aim ? ' is-dim' : '') + (hit ? ' is-hit' : '') + (state === 'morrendo' ? ' is-dying' : state ? ' is-down' : ''),
      sel, h('div', 'fighter__bars', ...bars),
      state || chips.length ? h('div', 'fighter__tags', state ? h('span', 'ftag ftag--down ftag--' + lifeKey(state), state) : null, ...chips) : null,
      acts.length ? h('div', 'fighter__acts', ...acts) : null);
    card.style.setProperty('--team', team.color);
    card.title = team.name;
    return card;
  }
  function outCard(mb) {
    const b = h('button', 'fighter__act', 'Entrar no combate');
    b.type = 'button';
    b.addEventListener('click', async () => {
      b.disabled = true;
      const id = 'chr:' + mb.characterId;
      await saveOut(id, false);
      // com o combate rolando, entra direto na ordem com a própria iniciativa
      const x = combatants().find((y) => y.id === id);
      if (x && sceneOn() && !scene.order.some((o) => o.id === id)) await joinScene(x);
    });
    return h('li', 'fighter fighter--out', h('div', 'fighter__sel', h('span', 'fighter__pic token token--' + mb.type, mb.name.trim().charAt(0).toUpperCase()),
      h('span', 'fighter__id', h('span', 'fighter__name', mb.name), h('span', 'fighter__def', 'Fora do combate'))), h('div', 'fighter__acts', b));
  }
  async function saveOut(id, out) {
    const next = sceneBase();
    const list = (Array.isArray(next.out) ? next.out : []).filter((x) => x !== id);
    if (out) list.push(id);
    next.out = list;
    if (out) combat.targets.delete(id);
    await saveScene(next);
  }
  // o mestre tira alguém do combate: sai da ordem (se já estava) e fica de fora até ele chamar de volta
  async function kickOut(id) {
    const next = sceneBase();
    dropFromOrder(next, id);
    if (id.indexOf('chr:') === 0) next.out = (Array.isArray(next.out) ? next.out : []).filter((x) => x !== id).concat([id]);
    combat.targets.delete(id);
    if (battle.aim) endAim();
    await saveScene(next);
  }
  async function saveTags(id, list) {
    const next = sceneBase();
    next.tags = Object.assign({}, next.tags);
    if (list.length) next.tags[id] = list; else delete next.tags[id];
    await saveScene(next);
  }
  // nova rodada: as condições com duração perdem uma rodada; as que acabam saem
  function tickTags(next) {
    const lost = [];
    const tags = Object.assign({}, next.tags);
    Object.keys(tags).forEach((id) => {
      const keep = [];
      (tags[id] || []).forEach((t) => {
        if (!t.r) { keep.push(t); return; }
        if (t.r > 1) keep.push({ n: t.n, r: t.r - 1 });
        else { const o = next.order.find((y) => y.id === id); lost.push((o ? o.name : 'Alguém') + ' sem ' + t.n); }
      });
      if (keep.length) tags[id] = keep; else delete tags[id];
    });
    next.tags = tags;
    return lost;
  }

  let tagDlg = null;
  function openTagDialog(x) {
    if (!tagDlg) {
      tagDlg = h('dialog', 'dialog tagdlg');
      tagDlg.setAttribute('aria-labelledby', 'tagdlg-title');
      document.body.append(tagDlg);
    }
    const custom = h('input', 'input');
    custom.type = 'text';
    custom.maxLength = 30;
    custom.id = 'tagdlg-custom';
    custom.placeholder = 'Outra condição ou estado';
    const rounds = h('select', 'input');
    rounds.id = 'tagdlg-rounds';
    [[0, 'Até o mestre tirar'], ...[1, 2, 3, 4, 5, 6, 8, 10].map((n) => [n, plural(n, 'rodada', 'rodadas')])].forEach((o) => { const op = h('option', '', o[1]); op.value = String(o[0]); rounds.append(op); });
    const put = async (name) => {
      const n = cleanName(name).slice(0, 30);
      if (!n) { custom.focus(); return; }
      const got = withTag(sceneTags()[x.id] || [], n, Math.round(num(rounds.value)));
      closeDialog(tagDlg);
      await saveTags(x.id, got.list.slice(-8));
      toast(x.name + ': ' + got.n + '.');
    };
    const have = (sceneTags()[x.id] || []).map((t) => nameKey(t.n));
    const grid = h('div', 'tagdlg__grid', ...CONDITIONS.map((c) => {
      const b = h('button', 'tagdlg__opt' + (have.indexOf(nameKey(c)) >= 0 ? ' is-on' : ''), c);
      b.type = 'button';
      b.addEventListener('click', () => put(c));
      return b;
    }));
    const add = h('button', 'btn btn--primary btn--sm', 'Pôr');
    add.type = 'button';
    add.addEventListener('click', () => put(custom.value));
    custom.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); put(custom.value); } });
    const close = h('button', 'btn btn--ghost btn--sm', 'Fechar');
    close.type = 'button';
    close.addEventListener('click', () => closeDialog(tagDlg));
    const lab = (el, t) => { const l = h('label', 'field__label', t); l.htmlFor = el.id; return l; };
    tagDlg.replaceChildren(h('div', 'tagdlg__body',
      h('h2', '', 'Condição em ', x.name),
      h('p', 'field__hint', 'Toque numa condição ou escreva outra. A duração conta rodadas da cena; o efeito é o que a mesa combinar.'),
      h('div', 'field', lab(rounds, 'Duração'), rounds),
      grid,
      h('div', 'field', lab(custom, 'Outra'), h('div', 'tagdlg__row', custom, add)),
      h('div', 'dialog__actions', close)));
    openDialog(tagDlg);
  }

  /* O mestre põe qualquer personagem na cena: os do grupo que estão fora do combate voltam,
     e qualquer ficha do banco de personagens entra na campanha (sob o controle do mestre) e já luta. */
  let sceneAddDlg = null;
  async function putInScene(id) {
    if (sceneOut().indexOf(id) >= 0) await saveOut(id, false);
    const x = combatants().find((y) => y.id === id);
    if (x && sceneOn() && !scene.order.some((o) => o.id === id)) await joinScene(x);
  }
  function openSceneAdd() {
    if (!sceneAddDlg) { sceneAddDlg = h('dialog', 'dialog pickchar'); sceneAddDlg.setAttribute('aria-labelledby', 'scadd-title'); document.body.append(sceneAddDlg); }
    const dlg = sceneAddDlg;
    const close = () => { if (dlg.open) closeDialog(dlg); };
    const fighting = () => new Set(combatants().map((x) => x.id));
    const banner = (c, label, note, onPick) => {
      const art = h('span', 'pickchar__art');
      const pic = c.thumb || c.image;
      if (pic) { const img = h('img'); img.src = pic; img.alt = ''; art.append(img); art.classList.add('pickchar__art--img'); }
      else art.textContent = (c.name || '?').trim().charAt(0).toUpperCase();
      const b = h('button', 'btn btn--sm ' + (onPick ? 'btn--primary' : 'btn--ghost'), label);
      b.type = 'button';
      b.disabled = !onPick;
      b.dataset.fid = 'scadd-' + (c.characterId || c.id);
      if (onPick) b.addEventListener('click', async () => { b.disabled = true; try { await onPick(); } catch (err) { b.disabled = false; toast(errorMessage(err)); } });
      return h('li', 'pickchar__card' + (onPick ? '' : ' is-here'), art,
        h('span', 'pickchar__info', h('strong', 'pickchar__name', c.name), h('span', 'pickchar__meta', [c.species, c.origin].filter(Boolean).join(' · ') || (c.type === 'criatura' ? 'Criatura' : 'Personagem')),
          note ? h('span', 'pickchar__meta', note) : null), b);
    };
    const groupList = h('ul', 'pickchar__list');
    const drawGroup = () => {
      const on = fighting();
      groupList.replaceChildren(...members.map((mb) => {
        const id = 'chr:' + mb.characterId;
        if (!mb.sheet || !mb.sheet.attrs) return banner(mb, 'Sem ficha pronta', 'Falta a distribuição inicial', null);
        if (on.has(id)) return banner(mb, 'Já está na cena', '', null);
        return banner(mb, 'Pôr na cena', 'Fora do combate', async () => { await putInScene(id); toast(mb.name + ' entrou na cena.'); drawGroup(); });
      }));
      if (!members.length) groupList.replaceChildren(h('li', 'field__hint', 'Ninguém no grupo ainda.'));
    };
    drawGroup();
    const found = h('ul', 'pickchar__list');
    const hint = h('p', 'field__hint', 'Busque qualquer personagem salvo: ele entra na campanha sob o seu controle e já vai para a cena.');
    const q = h('input', 'input');
    q.type = 'search';
    q.id = 'scadd-q';
    q.placeholder = 'Buscar por nome, espécie ou origem';
    q.setAttribute('aria-label', 'Buscar personagem');
    q.autocomplete = 'off';
    let seq = 0;
    const search = debounce(async () => {
      const my = ++seq;
      const text = q.value.trim();
      if (!text) { found.replaceChildren(); return; }
      let list = [];
      try { list = await db.searchCharacters(text); } catch (err) { if (my === seq) found.replaceChildren(h('li', 'field__hint', errorMessage(err))); return; }
      if (my !== seq) return;
      const inCamp = new Set(members.map((mb) => mb.characterId));
      list = list.filter((c) => !inCamp.has(c.id)).slice(0, 20);
      found.replaceChildren(...list.map((c) => banner(c, 'Trazer para a cena', 'Ainda não está na campanha', async () => {
        await db.joinCampaign(currentCamp.id, c.id);
        members = await db.listMembers(currentCamp.id);
        members.forEach((mb) => { if (isMyChar(mb.characterId)) mb.mine = true; });
        $('#member-list').replaceChildren(...members.map(memberRow));
        $('#member-empty').hidden = members.length > 0;
        tabBadges();
        renderCombat();
        const mb = members.find((x) => x.characterId === c.id);
        if (mb && mb.sheet && mb.sheet.attrs) { await putInScene('chr:' + c.id); toast(c.name + ' entrou na campanha e na cena.'); }
        else toast(c.name + ' entrou na campanha, mas a ficha ainda não tem a distribuição inicial.');
        drawGroup();
        search();
      })));
      if (!list.length) found.replaceChildren(h('li', 'field__hint', 'Nenhum personagem fora da campanha com esse nome.'));
    }, 250);
    q.addEventListener('input', search);
    const cancel = h('button', 'btn btn--ghost btn--sm', 'Fechar');
    cancel.type = 'button';
    cancel.addEventListener('click', close);
    const title = h('h2', '', 'Pôr na cena');
    title.id = 'scadd-title';
    dlg.replaceChildren(h('div', 'pickchar__body', title,
      h('h3', 'pickchar__sub', 'Do grupo'), groupList,
      h('h3', 'pickchar__sub', 'De fora da campanha'), hint, q, found, h('div', 'dialog__actions', cancel)));
    openDialog(dlg);
  }

  function gmBtn(label, cls, fn) {
    const b = h('button', 'btn btn--sm ' + cls, label);
    b.type = 'button';
    b.addEventListener('click', async () => { b.disabled = true; try { await fn(); } catch (err) { toast(errorMessage(err)); } b.disabled = false; });
    return b;
  }
  function renderBattleGm(gm, on) {
    const box = $('#battle-gm');
    box.hidden = !gm;
    if (!gm) return;
    if (on) {
      box.replaceChildren(
        gmBtn('◀ Anterior', 'btn--ghost', () => stepTurn(-1)),
        gmBtn('Próximo turno ▶', 'btn--primary', () => stepTurn(1)),
        gmBtn('Pôr na cena', 'btn--ghost', openSceneAdd),
        gmBtn('Times', 'btn--ghost', () => openTeams(false)),
        gmBtn('Presets', 'btn--ghost', openPresets),
        gmBtn('Encerrar', 'btn--danger', endScene));
      return;
    }
    const name = h('input', 'input');
    name.type = 'text';
    name.maxLength = 60;
    name.id = 'battle-name';
    name.placeholder = 'Nome da cena (opcional)';
    name.value = battle.name;
    name.setAttribute('aria-label', 'Nome da cena');
    name.addEventListener('input', () => { battle.name = name.value; });
    box.replaceChildren(
      gmBtn('Pôr na cena', 'btn--ghost', openSceneAdd),
      gmBtn('Times', 'btn--ghost', () => openTeams(false)),
      gmBtn('Presets', 'btn--ghost', openPresets),
      gmBtn('Rolar defesas', 'btn--ghost', rollAllDefenses),
      name,
      gmBtn('Começar combate', 'btn--primary', startScene));
  }
  function renderOrder(gm, on, list) {
    const ol = $('#battle-order');
    ol.hidden = !on;
    if (!on) { ol.replaceChildren(); return; }
    const items = scene.order.map((o, i) => {
      const x = list.find((y) => y.id === o.id);
      const down = x ? lifeState(x.layers) : 'fora';
      const li = h('li', 'ctb__item' + (i === scene.turn ? ' is-now' : '') + (down ? ' is-down' : ''),
        h('span', 'ctb__init', String(o.init)), h('span', 'ctb__name', o.name));
      if (x) li.style.setProperty('--team', teamById(x.side).color);
      li.title = o.name + ' · iniciativa ' + o.init + (down ? ' · ' + down : '');
      if (i === scene.turn) li.setAttribute('aria-current', 'step');
      if (gm) {
        const out = h('button', 'ctb__x', '×');
        out.type = 'button';
        out.setAttribute('aria-label', 'Tirar da ordem: ' + o.name);
        out.addEventListener('click', () => kickOut(o.id));
        li.append(out);
      }
      return li;
    });
    // quem está na arena e ainda não entrou na ordem (chegou depois)
    list.filter((x) => !scene.order.some((o) => o.id === x.id)).forEach((x) => {
      if (!gm && !isMineId(x.id)) return;
      const b = h('button', 'ctb__join', 'Rolar iniciativa: ' + x.name);
      b.type = 'button';
      b.addEventListener('click', () => joinScene(x));
      items.push(h('li', 'ctb__item ctb__item--out', b));
    });
    ol.replaceChildren(...items);
  }
  // acaba quando só um time (ou nenhum) ainda tem alguém de pé
  function renderBanner(gm, on, list) {
    const box = $('#battle-banner');
    const inFight = on ? list.filter((x) => scene.order.some((o) => o.id === x.id)) : [];
    const teamIds = Array.from(new Set(inFight.map((x) => x.side)));
    const alive = teamIds.filter((t) => inFight.some((x) => x.side === t && !lifeState(x.layers)));
    box.hidden = !(on && teamIds.length >= 2 && alive.length <= 1);
    if (box.hidden) return;
    const winner = alive.length ? teamById(alive[0]) : null;
    const players = winner ? inFight.filter((x) => x.side === winner.id && x.member) : [];
    box.className = 'battle__banner battle__banner--' + (winner ? 'win' : 'lose');
    box.style.setProperty('--team', winner ? winner.color : '#e0484a');
    const kids = [h('strong', 'battle__banner-title', winner ? 'Vitória: ' + winner.name + '!' : 'Ninguém de pé…'), h('span', '', winner ? 'Os outros times caíram.' : 'Todos os times caíram.')];
    if (gm) {
      const xp = h('input', 'input');
      xp.type = 'number';
      xp.min = '1';
      xp.step = '1';
      xp.inputMode = 'numeric';
      xp.placeholder = 'XP';
      xp.value = battle.xp;
      xp.setAttribute('aria-label', 'XP para os jogadores do time vencedor');
      xp.addEventListener('input', () => { battle.xp = xp.value; });
      const give = gmBtn('Dar XP a ' + (winner ? winner.name : ''), 'btn--primary', async () => {
        const amount = Math.round(num(xp.value));
        if (amount < 1) { xp.focus(); return; }
        await giveXp(players.map((x) => x.member), amount);
        battle.xp = '';
      });
      const can = players.length > 0;
      kids.push(h('div', 'battle__banner-acts', can ? xp : null, can ? give : null, gmBtn('Encerrar a cena', 'btn--ghost', endScene)));
    }
    box.replaceChildren(...kids);
  }

  // testes de quem age: a ficha do personagem ou os números do inimigo
  function foeTests(f) {
    const v = foeVals(f);
    const out = ATTRS.map((at) => ({ id: 'a:' + at.id, label: at.label + ' ' + signed(num(v[at.id])), make: () => ({ label: 'Teste de ' + at.label, attrName: at.label, attr: num(v[at.id]) }) }));
    ['luta', 'mira', 'operacoes', 'resistencia', 'iniciativa'].forEach((sk) => {
      const at = SKILL_ATTR[sk];
      const atl = ATTR_LABEL[at];
      const fixed = num(v[at]) + num(v[sk]);
      out.push({ id: 's:' + sk, label: SKILL_LABEL[sk] + ' ' + signed(fixed), make: () => ({ label: 'Teste de ' + SKILL_LABEL[sk], attrName: atl, attr: num(v[at]), skillName: SKILL_LABEL[sk], skill: num(v[sk]) }) });
    });
    return out;
  }
  const testsOf = (x) => (x.foe ? foeTests(x.foe) : testCatalog(sheetOf(x.member)));
  const rollAs = (x, r) => (x.foe ? postCombatRoll({ foe: x.foe }, r) : campaignRoll(x.member, r));

  /* ---------- Comandos (estilo RPG: Ações, Itens, Diversos) ----------
     Capítulo Ações: no turno há a ação padrão, a de movimento, a bônus, e livres e reações à vontade.
     Completa = padrão + movimento; a padrão pode virar mais uma de movimento. Cada ação básica já traz o
     custo dela. O gasto fica neste aparelho, só conta na vez de quem age e zera quando a vez muda.
     Empunhadura: uma vez por turno dá para sacar ou guardar um item de Saque sem gastar ações. */
  const COST_LABEL = { padrao: 'Padrão', movimento: 'Movimento', bonus: 'Bônus', completa: 'Completa', livre: 'Livre', reacao: 'Reação', saque: 'Saque' };
  const COST_LONG = { padrao: 'ação padrão', movimento: 'ação de movimento', bonus: 'ação bônus', completa: 'ação completa', livre: 'ação livre', reacao: 'reação', saque: 'saque grátis do turno' };
  const econ = {};
  function econOf(id) {
    const key = sceneOn() ? scene.round + ':' + scene.turn : 'off';
    if (!econ[id] || econ[id].key !== key) econ[id] = { key, padrao: false, movimento: false, bonus: false, saque: false, extra: false };
    return econ[id];
  }
  const econLive = (x) => Boolean(x && sceneOn() && sceneCurrent() && sceneCurrent().id === x.id);
  // o que impede pagar este custo agora ('' = pode)
  function econWhy(x, cost) {
    if (!econLive(x) || !cost || cost === 'livre' || cost === 'reacao') return '';
    const e = econOf(x.id);
    if (cost === 'padrao') return e.padrao ? 'A ação padrão deste turno já foi usada.' : '';
    if (cost === 'movimento') return e.movimento && e.padrao ? 'Sem ação de movimento (nem a padrão para trocar).' : '';
    if (cost === 'bonus') return e.bonus ? 'A ação bônus deste turno já foi usada.' : '';
    if (cost === 'completa') return e.padrao || e.movimento ? 'A ação completa precisa da padrão e da de movimento livres.' : '';
    if (cost === 'saque') return e.saque ? 'O saque grátis deste turno já foi usado.' : '';
    return '';
  }
  // marca o gasto e devolve o texto para o registro
  function econPay(x, cost) {
    const label = COST_LONG[cost] || '';
    if (!econLive(x) || !cost) return label;
    const e = econOf(x.id);
    if (cost === 'padrao') e.padrao = true;
    else if (cost === 'bonus') e.bonus = true;
    else if (cost === 'saque') e.saque = true;
    else if (cost === 'completa') { e.padrao = true; e.movimento = true; }
    else if (cost === 'movimento') { if (e.movimento) { e.padrao = true; return 'ação padrão usada como movimento'; } e.movimento = true; }
    return label;
  }
  const costChip = (cost) => (cost ? h('span', 'cost cost--' + cost, COST_LABEL[cost]) : null);

  // condições que mexem na defesa (a mesa pode tirar a qualquer hora)
  const DEF_TAGS = { 'Caído': -2, 'Agarrado': -2, 'Guarda aberta': -2, 'Zonzo': -2, 'Protegido': 2 };
  const GOOD_TAGS = ['Inspirado', 'Protegido', 'Concentrado', 'Escondido', 'Mirando', 'Apoiado', 'Agarrando'];
  const tagsOf = (id) => sceneTags()[id] || [];
  const hasTag = (id, n) => tagsOf(id).some((t) => nameKey(t.n) === nameKey(n));
  function tagDef(id, base, min) {
    const tags = tagsOf(id);
    if (tags.some((t) => nameKey(t.n) === nameKey('Atordoado'))) return { def: min, note: 'Atordoado: defesa mínima' };
    let d = 0;
    const why = [];
    tags.forEach((t) => { const k = Object.keys(DEF_TAGS).find((n) => nameKey(n) === nameKey(t.n)); if (k) { d += DEF_TAGS[k]; why.push(k + ' ' + signed(DEF_TAGS[k])); } });
    return { def: Math.max(0, base + d), note: why.join(', ') };
  }
  /* Atordoamento em dois passos: o primeiro tira a ação de movimento do próximo turno ("Sem movimento");
     um segundo, com o movimento já consumido, vira "Atordoado": perde o próximo turno e fica com a defesa mínima.
     Os dois duram até o próximo turno do alvo (2 rodadas na contagem da cena; a mesa tira antes se quiser). */
  const STUN_STEP = 'Sem movimento';
  function withTag(list, n, r) {
    if (nameKey(n) !== nameKey('Atordoado')) return { list: list.filter((t) => nameKey(t.n) !== nameKey(n)).concat([{ n, r: r || 0 }]), n };
    const again = list.some((t) => nameKey(t.n) === nameKey(STUN_STEP) || nameKey(t.n) === nameKey('Atordoado'));
    const rest = list.filter((t) => nameKey(t.n) !== nameKey(STUN_STEP) && nameKey(t.n) !== nameKey('Atordoado'));
    return again ? { list: rest.concat([{ n: 'Atordoado', r: 2 }]), n: 'Atordoado: perde o próximo turno' }
      : { list: rest.concat([{ n: STUN_STEP, r: 2 }]), n: 'atordoado, perde a ação de movimento (' + STUN_STEP + ')' };
  }
  async function addTag(id, n, r) {
    await saveTags(id, withTag(tagsOf(id), n, r).list.slice(-8));
  }
  async function dropTag(id, n) { if (hasTag(id, n)) await saveTags(id, tagsOf(id).filter((t) => nameKey(t.n) !== nameKey(n))); }
  // registro de uma ação que não rola dado
  const actLog = (x, label, detail) => rollAs(x, { expr: 'ação', label: label.slice(0, 60), detail: detail.slice(0, 1450), total: 0, flag: '' });
  const rolledShow = (r) => (r.expr === 'ação' ? '✓' : String(r.total));

  const MANEUVERS = [
    { id: 'derrubar', label: 'Derrubar', tag: 'Caído', text: 'Se vencer, o alvo fica Caído (–2 na defesa até se levantar).' },
    { id: 'empurrar', label: 'Empurrar', text: 'Se vencer, o alvo é empurrado 1,5 m para onde você escolher.' },
    { id: 'desarmar', label: 'Desarmar', text: 'Se vencer, o alvo larga o que tem nas mãos.' },
    { id: 'agarrar', label: 'Agarrar', tag: 'Agarrado', text: 'Se vencer, o alvo fica Agarrado (–2 na defesa) até se soltar.' },
    { id: 'guarda', label: 'Quebrar guarda', tag: 'Guarda aberta', rounds: 1, text: 'Se vencer, a defesa do alvo cai 2 até a próxima rodada.' }
  ];
  // testes usados nas manobras, para personagem e inimigo
  function sideTest(x, sk) {
    if (x.foe) {
      const v = foeVals(x.foe);
      const at = SKILL_ATTR[sk];
      return { label: 'Teste de ' + SKILL_LABEL[sk], attrName: ATTR_LABEL[at], attr: num(v[at]), skillName: SKILL_LABEL[sk], skill: num(v[sk]), mods: [] };
    }
    const c = sheetOf(x.member);
    return skillTest(c.sheet, compute(c), sk);
  }
  const fixedOf = (t) => t.attr + t.skill + (t.mods || []).reduce((a, b) => a + b[1], 0);
  // o alvo resiste com o melhor entre Resistência e Reflexos
  function resistPick(x) {
    const a = sideTest(x, 'resistencia'), b = sideTest(x, 'reflexos');
    return fixedOf(b) > fixedOf(a) ? ['reflexos', b] : ['resistencia', a];
  }
  // disputa de manobra: devolve quem venceu e o texto
  function contest(actor, tA, target, tB) {
    const r1 = rollTest(tA), r2 = rollTest(tB);
    const s1 = r1.flag === 'falha' ? -1 : r1.total, s2 = r2.flag === 'falha' ? -1 : r2.total;
    const win = s1 > s2; // empate fica com quem resiste
    const text = actor.name + ' ' + r1.detail + ' = ' + r1.total + (r1.flag === 'falha' ? ' (falha completa)' : '') + ' | ' + target.name + ' (' + tB.skillName + ') ' + r2.detail + ' = ' + r2.total + (r2.flag === 'falha' ? ' (falha completa)' : '');
    return { win, r1, r2, text };
  }

  // as ações do turno; cada uma abre a tela com o que dá para fazer com ela
  const SLOTS = [
    { id: 'padrao', label: 'Padrão', sub: 'Atacar, manobra, usar item' },
    { id: 'movimento', label: 'Movimento', sub: 'Andar, mirar, sacar arma' },
    { id: 'bonus', label: 'Bônus', sub: 'Poderes, sacar pistola' },
    { id: 'completa', label: 'Completa', sub: 'Avançar, curar, saquear' },
    { id: 'livre', label: 'Livre', sub: 'Testes, disputa, defesa' }
  ];
  /* go: 'now' faz na hora; 'aim' volta para a arena para escolher o alvo; 'cfg' abre as opções antes;
     'itens' abre o inventário. when diz quando a ação aparece. */
  const SLOT_ACTIONS = {
    padrao: [
      { id: 'atacar', label: 'Atacar', go: 'cfg' },
      { id: 'manobra', label: 'Manobra', go: 'cfg' },
      { id: 'usar', label: 'Usar item', go: 'itens', char: true },
      { id: 'esconder', label: 'Esconder-se', go: 'now' },
      { id: 'soltar', label: 'Soltar-se', go: 'now', when: (x) => hasTag(x.id, 'Agarrado') }
    ],
    movimento: [
      { id: 'mover', label: 'Deslocar-se', go: 'now' },
      { id: 'mirar', label: 'Mirar', go: 'now' },
      { id: 'perceber', label: 'Perceber', go: 'now' },
      { id: 'sacar', label: 'Sacar ou guardar arma', go: 'itens', char: true },
      { id: 'levantar', label: 'Levantar-se', go: 'now', when: (x) => hasTag(x.id, 'Caído') }
    ],
    bonus: [
      { id: 'poderes', label: 'Poderes', go: 'cfg', char: true, when: (x) => powerButtons(x.member, sheetOf(x.member)).length > 0 },
      { id: 'pistola', label: 'Sacar ou guardar pistola', go: 'itens', char: true }
    ],
    completa: [
      { id: 'avancar', label: 'Avançar', go: 'cfg' },
      { id: 'curar', label: 'Curar', go: 'aim', char: true },
      { id: 'apoiar', label: 'Apoiar equipamento', go: 'now' },
      { id: 'saquear', label: 'Saquear', go: 'now' }
    ],
    livre: [
      { id: 'teste', label: 'Teste da ficha', go: 'cfg' },
      { id: 'disputa', label: 'Disputa', go: 'cfg' },
      { id: 'defesa', label: 'Rolar defesa', go: 'now' },
      { id: 'saque', label: 'Item de Saque', go: 'itens', char: true },
      { id: 'passar', label: 'Encerrar turno', go: 'now', when: (x, gm) => sceneOn() && (econLive(x) || gm) }
    ]
  };
  const ACTION_TEXT = {
    atacar: 'Escolha a arma (só o que está nas mãos, ou desarmado) e depois toque nos alvos. Com cadência (ou os ataques múltiplos de Luta), cada toque é um disparo ou golpe.',
    manobra: 'Teste de Manobra (Corpo + Luta) contra Resistência ou Reflexos do alvo, o melhor dele. Se você vencer, o efeito entra sozinho.',
    usar: 'Consumíveis e utilitários: o saque já está incluído na ação.',
    esconder: 'Precisa de algo que engane os sentidos. Teste de Manha; o resultado vira a dificuldade para te achar.',
    soltar: 'Disputa de Atletismo contra a Luta de quem agarra.',
    mover: 'Usa o seu deslocamento. Sem a de movimento, a padrão vira movimento.',
    mirar: 'Mira engajada até o seu próximo turno.',
    perceber: 'Analisar, procurar, investigar: teste de Sentidos.',
    sacar: 'Pegar ou guardar uma arma. Precisa de mão livre; duas mãos precisa das duas.',
    levantar: 'Sai do estado Caído.',
    poderes: 'Poderes que gastam PE.',
    pistola: 'Pistola e revólver se sacam e guardam com a ação bônus.',
    avancar: 'Anda em linha reta o dobro do deslocamento e, no fim, ataca corpo a corpo (sem ativar habilidades) ou atropela quem estiver no caminho.',
    curar: 'Escolha quem curar. CD 10 se o recurso está abaixo da metade, 6 se não, +2 por condição negativa.',
    apoiar: 'Apoia a arma numa cobertura.',
    saquear: 'Revistar um corpo ou um lugar.',
    teste: 'Qualquer teste da ficha.',
    disputa: 'Teste contra teste: escolha o seu teste e depois o adversário na arena.',
    defesa: 'Rola a defesa da cena de novo (2d6 + Corpo + Resistência).',
    saque: 'Uma vez por turno, sacar ou guardar um item de Saque sem gastar ações.',
    passar: 'Passa a vez.'
  };
  const SLOT_LONG = { padrao: 'Ação padrão', movimento: 'Ação de movimento', bonus: 'Ação bônus', completa: 'Ação completa', livre: 'Ações livres' };
  // custo de cada ação (o do slot, com exceções)
  const costOfAct = (slot, a) => (a.go === 'itens' ? '' : slot === 'livre' ? (a.id === 'defesa' ? 'livre' : '') : slot);
  const slotUsed = (x, k) => { if (!econLive(x)) return false; const e = econOf(x.id); return k === 'completa' ? e.padrao && e.movimento : k === 'livre' ? false : e[k]; };
  const slotWhy = (x, k) => (k === 'livre' ? '' : econWhy(x, k));

  /* Escolha de alvo na arena: battle.aim = { label, valid: [ids], max, shots: { id: n }, pick(x), confirm(shots) }.
     Com max 1, tocar no alvo já age; com cadência, cada toque soma um disparo naquele alvo. */
  function startAim(o) {
    battle.aim = Object.assign({ max: 1, shots: {} }, o);
    renderBattle();
    const arena = $('#arena');
    if (arena && arena.scrollIntoView) arena.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function endAim() { battle.aim = null; combat.targets.clear(); }
  async function aimPick(x) {
    const a = battle.aim;
    if (!a || a.valid.indexOf(x.id) < 0) return;
    if (a.max <= 1) {
      endAim();
      battle.view = 'main';
      try { await a.pick(x); } catch (err) { play('bad'); toast(errorMessage(err)); }
      renderBattle();
      return;
    }
    const total = Object.values(a.shots).reduce((t, n) => t + n, 0);
    if (total >= a.max) { toast('A cadência é ' + a.max + ': todos os disparos já têm alvo. Confirme ou limpe.'); return; }
    a.shots[x.id] = (a.shots[x.id] || 0) + 1;
    renderBattle();
  }
  function renderAimBar(list) {
    const box = $('#battle-hint');
    const a = battle.aim;
    if (!a) return false;
    const total = Object.values(a.shots).reduce((t, n) => t + n, 0);
    const cancel = h('button', 'btn btn--ghost btn--sm', 'Cancelar');
    cancel.type = 'button';
    cancel.addEventListener('click', () => { endAim(); renderBattle(); });
    const kids = [h('strong', 'aimbar__title', a.label), h('span', 'aimbar__txt', a.max > 1
      ? 'Toque nos alvos destacados: cada toque é um ' + (a.word || 'disparo') + ' (' + total + ' de ' + a.max + ').' + (total ? ' ' + list.filter((x) => a.shots[x.id]).map((x) => x.name + ' ×' + a.shots[x.id]).join(', ') + '.' : '') + (a.penalty && a.penalty(total) ? ' ' + a.penalty(total) + '.' : '')
      : 'Toque num dos alvos destacados.')];
    if (a.max > 1) {
      const clear = h('button', 'btn btn--ghost btn--sm', 'Limpar');
      clear.type = 'button';
      clear.disabled = !total;
      clear.addEventListener('click', () => { a.shots = {}; renderBattle(); });
      const ok = h('button', 'btn btn--primary btn--sm', (a.word === 'golpe' ? 'Golpear ' : 'Disparar ') + plural(total, 'vez', 'vezes'));
      ok.type = 'button';
      ok.disabled = !total;
      ok.addEventListener('click', async () => {
        const shots = Object.assign({}, a.shots);
        endAim();
        battle.view = 'main';
        try { await a.confirm(shots); } catch (err) { toast(errorMessage(err)); }
        renderBattle();
      });
      kids.push(h('span', 'aimbar__btns', clear, ok, cancel));
    } else kids.push(h('span', 'aimbar__btns', cancel));
    box.replaceChildren(h('div', 'aimbar', ...kids));
    return true;
  }
  const living = (list, actor) => list.filter((x) => x.id !== actor.id && !lifeState(x.layers));
  const alliesOf = (list, actor) => list.filter((x) => x.side === actor.side);

  function renderCmd(gm, on, list) {
    const box = $('#battle-cmd');
    const mine = list.filter((x) => (x.foe ? gm : x.member.mine));
    const cur = sceneCurrent();
    // os comandos só abrem com o combate rolando, na vez de quem você controla (o mestre: inimigos e aliados)
    const actor = on && cur ? mine.find((x) => x.id === cur.id) || null : null;
    const title = h('h3', 'ff-window__title', 'Comandos');
    box.classList.toggle('cmd--wait', !actor);
    if (!actor) {
      if (battle.aim) endAim();
      battle.view = 'main';
      box.replaceChildren(title, h('p', 'cmd__wait', !on
        ? (gm ? 'Comece o combate e escolha quais jogadores entram. Os comandos abrem na vez de cada um.' : 'Os comandos abrem quando o mestre começar o combate e chegar a sua vez.')
        : !mine.length && !gm ? 'Você não está neste combate. O mestre pode chamar você para entrar.'
        : cur ? 'Vez de ' + cur.name + '. ' + (gm ? 'Os comandos abrem na vez de um inimigo ou aliado.' : 'Seus comandos aparecem na sua vez.') : 'Aguardando.'));
      return;
    }
    const down = lifeState(actor.layers);
    if (down) {
      if (battle.aim) endAim();
      box.replaceChildren(title, h('p', 'cmd__wait', actor.name + ' está ' + down + '. ' + (down === 'morto' ? 'Não age mais nesta cena.'
        : down === 'morrendo' ? 'Sem ações: faça o teste de sobrevivência (Fortitude, CD 6, +1 a cada tentativa) e aguarde ajuda.'
        : 'Sem ações até ser reanimado (teste de Medicina com kit médico, ou cura).')));
      return;
    }
    if (battle.actor !== actor.id) { battle.view = 'main'; if (battle.aim) endAim(); }
    battle.actor = actor.id;
    const isTurn = econLive(actor);
    const who = h('strong', 'cmd__name', actor.name);
    const head = h('div', 'cmd__head', title, who, isTurn ? h('span', 'cmd__turn', 'Sua vez') : null);

    let body;
    if (battle.aim) {
      const cancel = h('button', 'btn btn--ghost btn--sm', 'Cancelar');
      cancel.type = 'button';
      cancel.addEventListener('click', () => { endAim(); renderBattle(); });
      body = h('div', 'cmd__panel', h('p', 'cmd__aim', '🎯 ' + battle.aim.label + ': escolha o alvo na arena.'), cancel);
    } else if (battle.view === 'slot') body = slotView(actor, list, gm);
    else if (battle.view === 'cfg') body = cfgView(actor, list, gm);
    else if (battle.view === 'itens' && !actor.foe) body = h('div', 'cmd__panel', backBtn(battle.slot ? 'slot' : 'main'), itemsPanel(actor, list));
    else if (battle.view === 'poderes' && !actor.foe) body = h('div', 'cmd__panel', backBtn('main'), h('div', 'cmd__about', h('strong', '', 'Poderes'), h('span', '', 'Os de ataque e de defesa entram junto com essas ações; os outros se usam daqui, com o custo da ação.')), powersTab(actor));
    else body = mainView(actor, gm);
    // a tela de comandos entra animada só quando muda (não a cada atualização da mesa)
    const viewKey = actor.id + '|' + battle.view + '|' + battle.slot + '|' + battle.cmd + '|' + Boolean(battle.aim);
    if (viewKey !== battle.viewKey) { body.classList.add('is-new'); battle.viewKey = viewKey; }
    box.replaceChildren(head, body);
  }
  function backBtn(to) {
    const b = h('button', 'cmd__back', '◀ Voltar');
    b.type = 'button';
    b.dataset.fid = 'cmd-back';
    b.addEventListener('click', () => { battle.view = to; if (to === 'main') battle.slot = ''; renderBattle(); });
    return b;
  }

  // tela principal: as ações do turno em cinza até serem usadas
  function mainView(actor, gm) {
    battle.view = 'main';
    const live = econLive(actor);
    const slots = SLOTS.map((sl) => {
      const used = slotUsed(actor, sl.id);
      const why = slotWhy(actor, sl.id);
      const b = h('button', 'tslot tslot--' + sl.id + (used ? ' is-used' : '') + (why ? ' is-off' : ''),
        h('span', 'tslot__name', sl.label), h('span', 'tslot__sub', used ? (sl.id === 'movimento' && !why ? 'Usada · dá com a padrão' : 'Usada') : why ? 'Indisponível' : sl.sub));
      b.type = 'button';
      b.dataset.fid = 'slot-' + sl.id;
      if (why) { b.disabled = true; b.title = why; }
      b.addEventListener('click', () => { battle.slot = sl.id; battle.view = 'slot'; renderBattle(); });
      return b;
    });
    const extra = [];
    if (!actor.foe) {
      const inv = h('button', 'btn btn--ghost btn--sm', 'Itens');
      inv.type = 'button';
      inv.dataset.fid = 'cmd-itens';
      inv.addEventListener('click', () => { battle.slot = ''; battle.view = 'itens'; renderBattle(); });
      extra.push(inv);
      if (powerUses(sheetOf(actor.member).sheet).length) {
        const pw = h('button', 'btn btn--ghost btn--sm', 'Poderes');
        pw.type = 'button';
        pw.dataset.fid = 'cmd-poderes-tab';
        pw.addEventListener('click', () => { battle.slot = ''; battle.view = 'poderes'; renderBattle(); });
        extra.push(pw);
      }
    }
    if (live) {
      const reset = h('button', 'btn btn--ghost btn--sm', 'Repor ações');
      reset.type = 'button';
      reset.title = 'Desfaz o gasto de ações deste turno (para corrigir um engano)';
      reset.addEventListener('click', () => { delete econ[actor.id]; renderBattle(); });
      extra.push(reset);
    }
    if (sceneOn() && (live || gm)) extra.push(gmBtn('Encerrar turno ▶', 'btn--primary', () => stepTurn(1)));
    return h('div', 'cmd__panel',
      h('p', 'cmd__note', live ? 'Toque numa ação do turno para ver o que dá para fazer com ela. As usadas ficam marcadas.' : sceneOn() ? 'Fora da vez: as ações não são contadas (reações e livres valem sempre).' : 'Fora do combate: as ações não são contadas.'),
      h('div', 'tslots', ...slots),
      h('div', 'cmd__row', ...extra));
  }

  // tela de ações de um tipo
  function slotView(actor, list, gm) {
    const sl = SLOTS.find((x) => x.id === battle.slot) || SLOTS[0];
    const acts = SLOT_ACTIONS[sl.id].filter((a) => (!a.char || !actor.foe) && (!a.when || a.when(actor, gm)));
    const why = slotWhy(actor, sl.id);
    const items = acts.map((a) => {
      const b = h('button', 'cmd__item', h('span', 'cmd__item-name', a.label), h('span', 'cmd__item-txt', ACTION_TEXT[a.id] || ''));
      b.type = 'button';
      b.dataset.fid = 'cmd-' + a.id;
      if (why && a.go !== 'itens') { b.disabled = true; b.title = why; }
      b.addEventListener('click', async () => {
        if (a.go === 'itens') { battle.view = 'itens'; renderBattle(); return; }
        if (a.go === 'cfg' || (a.id === 'defesa' && actor.member && powerUses(sheetOf(actor.member).sheet).some((u) => u.when === 'Defesa'))) { battle.cmd = a.id; battle.view = 'cfg'; renderBattle(); return; }
        if (a.go === 'aim') { aimFor(a.id, actor, list); return; }
        b.disabled = true;
        try { await doNow(a.id, actor, list, costOfAct(sl.id, a)); } catch (err) { toast(errorMessage(err)); }
        battle.view = 'main';
        renderBattle();
      });
      return b;
    });
    return h('div', 'cmd__panel', h('div', 'cmd__row', backBtn('main'), h('strong', 'cmd__slot-title', SLOT_LONG[sl.id])),
      why ? h('p', 'cmd__warn', why) : null,
      h('div', 'cmd__menu', ...items));
  }

  // ações que acontecem na hora, sem alvo
  async function doNow(id, actor, list, cost) {
    if (id === 'passar') { stepTurn(1); return; }
    if (id === 'defesa') { await rollDefense(actor); return; }
    const c = econPay(actor, cost);
    if (id === 'mirar') { await addTag(actor.id, 'Mirando', 1); await actLog(actor, 'Mirar', c + ': mira engajada até o próximo turno.'); return; }
    if (id === 'apoiar') { await addTag(actor.id, 'Apoiado', 0); await actLog(actor, 'Apoiar equipamento', c + ': arma apoiada na cobertura.'); return; }
    if (id === 'mover') { await actLog(actor, 'Deslocamento', c + '.'); return; }
    if (id === 'levantar') { await dropTag(actor.id, 'Caído'); await actLog(actor, 'Levantar-se', c + ': não está mais caído.'); return; }
    if (id === 'saquear') { await actLog(actor, 'Saquear', c + ': revista o lugar ou o corpo; o mestre diz o que acha.'); return; }
    if (id === 'perceber' || id === 'esconder') {
      const t = sideTest(actor, id === 'perceber' ? 'sentidos' : 'manha');
      const r = rollTest(t);
      r.label = (id === 'perceber' ? 'Perceber' : 'Esconder-se') + ' (' + t.skillName + ')';
      r.detail = c + ' · ' + r.detail;
      if (id === 'esconder' && r.flag !== 'falha') await addTag(actor.id, 'Escondido', 0);
      await rollAs(actor, r);
      return;
    }
    if (id === 'soltar') {
      const grab = list.find((x) => x.id !== actor.id && hasTag(x.id, 'Agarrando'));
      if (!grab) { await dropTag(actor.id, 'Agarrado'); await actLog(actor, 'Soltar-se', c + ': ninguém segura mais; está livre.'); return; }
      const res = contest(actor, sideTest(actor, 'atletismo'), grab, sideTest(grab, 'luta'));
      if (res.win) { await dropTag(actor.id, 'Agarrado'); await dropTag(grab.id, 'Agarrando'); }
      await rollAs(actor, { expr: res.r1.expr, label: 'Soltar-se de ' + grab.name, total: res.r1.total, flag: res.r1.flag, detail: c + ' · ' + res.text + ' → ' + (res.win ? 'livre' : 'continua agarrado') });
    }
  }

  // ações que pedem alvo direto
  function aimFor(id, actor, list) {
    if (id === 'curar') {
      const allies = alliesOf(list, actor);
      startAim({ label: 'Curar', valid: allies.map((x) => x.id), pick: (x) => { battle.heal.target = x.id; battle.heal.key = ''; battle.cmd = 'curar'; battle.view = 'cfg'; } });
    }
  }

  // tela de opções de uma ação antes do alvo (ou sem alvo)
  function cfgView(actor, list, gm) {
    const id = battle.cmd;
    const back = backBtn('slot');
    const about = h('div', 'cmd__about', h('strong', '', ({ atacar: 'Atacar', manobra: 'Manobra', avancar: 'Avançar', curar: 'Curar', teste: 'Teste da ficha', disputa: 'Disputa', poderes: 'Poderes', defesa: 'Rolar defesa' })[id] || ''), h('span', '', ACTION_TEXT[id] || ''));
    let body;
    if (id === 'atacar') body = attackCfg(actor, list);
    else if (id === 'manobra') body = maneuverCfg(actor, list);
    else if (id === 'avancar') {
      const others = living(list, actor);
      body = h('div', 'cmd__row',
        gmBtn('Avançar e atacar', 'btn--primary', async () => {
          econPay(actor, 'completa');
          battle.advance = actor.id;
          battle.cmd = 'atacar';
          await actLog(actor, 'Avançar', 'Ação completa: corre o dobro do deslocamento em linha reta e ataca corpo a corpo.');
          renderBattle();
        }),
        gmBtn('Avançar e atropelar', 'btn--ghost', async () => {
          if (!others.length) { toast('Ninguém no caminho.'); return; }
          startAim({ label: 'Atropelar', valid: others.map((x) => x.id), pick: (x) => runManeuver(actor, x, { id: 'atropelar', label: 'Atropelar', tag: 'Caído' }, 'completa') });
        }));
    } else if (id === 'curar') body = healPanel(actor, list);
    else if (id === 'poderes') body = h('div', 'cmd__powers', ...powerButtons(actor.member, sheetOf(actor.member)));
    else if (id === 'teste') {
      const tests = testsOf(actor);
      if (!tests.some((t) => t.id === battle.test)) battle.test = tests[0].id;
      body = h('div', 'cmd__row', selField('cmd-test', 'Teste', tests.map((t) => [t.id, t.label]), battle.test, (v) => { battle.test = v; }),
        gmBtn('Rolar', 'btn--primary', async () => { const t = tests.find((y) => y.id === battle.test); if (t) await rollAs(actor, rollTest(t.make())); battle.view = 'main'; renderBattle(); }));
    } else if (id === 'disputa') body = duelCfg(actor, list);
    else if (id === 'defesa') {
      body = h('div', 'cmd__stack', actor.member ? powerToggles(actor.member, 'Defesa', battle.defPow, () => renderBattle()) : null,
        h('div', 'cmd__row', gmBtn('Rolar defesa', 'btn--primary', async () => {
          const uses = actor.member ? powerUses(sheetOf(actor.member).sheet).filter((u) => u.when === 'Defesa' && battle.defPow.has(u.key)) : [];
          if (uses.length && !(await payPowers(actor.member, uses))) return;
          battle.defPow.clear();
          await rollDefense(actor, uses);
          battle.view = 'main';
          renderBattle();
        })));
    }
    else body = h('p', 'cmd__note', '');
    return h('div', 'cmd__panel', back, about, body);
  }
  function selField(id, label, opts, val, fn) {
    const s = h('select', 'input');
    s.id = id;
    opts.forEach((o) => { const op = h('option', '', o[1]); op.value = o[0]; s.append(op); });
    s.value = val;
    s.addEventListener('change', () => { fn(s.value); renderBattle(); });
    const l = h('label', 'field__label', label);
    l.htmlFor = id;
    return h('div', 'field', l, s);
  }

  // Atacar: escolhe a arma e as opções; o botão volta para a arena para escolher os alvos
  function attackCfg(actor, list) {
    const adv = battle.advance === actor.id;
    const cost = adv ? '' : 'padrao';
    const valid = living(list, actor);
    const note = h('p', 'cmd__note', adv ? 'Ataque do avanço: corpo a corpo, já pago, não ativa habilidades.' : 'Depois de escolher, toque nos alvos na arena.');
    const go = async (who, st, shots, peekBuild) => {
      combat.targets = new Set(Object.keys(shots));
      st.per = shots;
      st.shots = Object.values(shots).reduce((t, n) => t + n, 0);
      const t = peekBuild();
      // poderes de ataque marcados: pagam o PE agora e entram no teste (Certeiro: crítico com 5 e 6)
      const uses = who.member && !adv ? powerUses(sheetOf(who.member).sheet).filter((u) => u.when === 'Ataque' && battle.atkPow.has(u.key)) : [];
      if (uses.length && !(await payPowers(who.member, uses))) return;
      battle.atkPow.clear();
      if (uses.some((u) => nameKey(u.name) === 'certeiro')) t.critFive = true;
      st.powNote = powerNote(uses);
      const paid = adv ? 'parte do avanço' : econPay(actor, cost);
      if (adv) battle.advance = '';
      await runAttack(who, t, st, h('button'), paid);
    };
    if (actor.foe) {
      const st = combat.st[actor.id] = combat.st[actor.id] || { uid: null, mode: '', shots: 1, mod: 0, dice: 'n2', dist: '' };
      if (adv) st.mode = 'Corpo a corpo';
      const v = foeVals(actor.foe);
      const cad = st.mode === 'Corpo a corpo' ? 1 : clamp(Math.round(num(v.cadencia)) || 1, 1, 20);
      const peek = () => { let t = null; foeAttackBuilder(actor.foe, st, null, { peek: (x) => { t = x; } }); return t; };
      return h('div', 'cmd__stack', note, foeAttackBuilder(actor.foe, st, null, { aim: () => {
        startAim({ label: 'Ataque de ' + actor.name, valid: valid.map((x) => x.id), max: cad,
          penalty: (n) => (n > 1 ? '–' + shotPenalty(n, true) + ' no ataque (cadência perita)' : ''),
          pick: (x) => go({ foe: actor.foe }, st, { [x.id]: 1 }, peek), confirm: (shots) => go({ foe: actor.foe }, st, shots, peek) });
      } }));
    }
    const mb = actor.member;
    const c = sheetOf(mb);
    const st = memberAtk[mb.characterId] = memberAtk[mb.characterId] || { uid: null, mode: '', shots: 1, mod: 0, dice: 'n2', dist: '' };
    const onReload = async (weapon, btn) => {
      btn.disabled = true;
      let r = null;
      try {
        await patchMemberSheet(mb, (sh) => { const w = sh.inventory.find((x) => x.uid === weapon.uid); if (w) r = reloadGun(w, sh, 2); });
      } catch (err) { toast(errorMessage(err)); btn.disabled = false; return; }
      if (!r || r.err) { toast(r ? r.err : 'A arma não está mais no inventário.'); btn.disabled = false; return; }
      const paid = econPay(actor, r.cost);
      toast(actor.name + ' recarregou ' + weapon.name + ': ' + r.msg + ' (' + paid + ').');
      renderBattle();
    };
    const base = Object.assign({}, c, { handsOnly: true, meleeOnly: adv, onReload });
    return h('div', 'cmd__stack', note, adv ? null : powerToggles(mb, 'Ataque', battle.atkPow, () => renderBattle()), attackBuilder(Object.assign({}, base, { aim: true, btnLabel: 'Escolher alvo' }), st, () => {
      const weapon = weaponsOf(c.sheet).find((w) => w.uid === st.uid) || null;
      const cad = st.cad === false ? 1 : maxShots(weapon, c.sheet);
      const prof = atkProf(c.sheet, weapon);
      const peek = () => {
        let t = null;
        const targets = combatants().filter((x) => combat.targets.has(x.id)).map((x) => ({ id: x.id, name: x.name }));
        attackBuilder(Object.assign({}, base, { targets, peek: (x) => { t = x; } }), st, () => {}, 'pk-');
        return t;
      };
      startAim({ label: 'Ataque: ' + (weapon ? weapon.name : 'desarmado'), valid: valid.map((x) => x.id), max: cad, word: shotWord(weapon, 1),
        penalty: (n) => (n > 1 ? '–' + shotPenalty(n, prof) + ' no ataque (' + (prof ? 'cadência perita' : 'sem proficiência') + ')' : ''),
        pick: (x) => go({ member: mb, c }, st, { [x.id]: 1 }, peek), confirm: (shots) => go({ member: mb, c }, st, shots, peek) });
    }, 'cmd-'));
  }

  function maneuverCfg(actor, list) {
    const others = living(list, actor);
    if (!others.length) return h('p', 'cmd__note', 'Ninguém para manobrar.');
    const d = battle.man;
    if (!MANEUVERS.some((m) => m.id === d.id)) d.id = MANEUVERS[0].id;
    const man = MANEUVERS.find((m) => m.id === d.id);
    const opts = h('div', 'cmd__chips', ...MANEUVERS.map((m) => {
      const b = h('button', 'man__opt' + (m.id === d.id ? ' is-on' : ''), m.label);
      b.type = 'button';
      b.dataset.fid = 'man-' + m.id;
      b.setAttribute('aria-pressed', String(m.id === d.id));
      b.addEventListener('click', () => { d.id = m.id; renderBattle(); });
      return b;
    }));
    const mine = sideTest(actor, 'luta');
    return h('div', 'cmd__stack', opts, h('p', 'cmd__note', man.text + ' Seu teste: Luta ' + signed(fixedOf(mine)) + '.'),
      gmBtn('Escolher alvo', 'btn--primary', () => startAim({ label: man.label, valid: others.map((x) => x.id), pick: (x) => runManeuver(actor, x, man, 'padrao') })));
  }

  // Disputa: escolhe o seu teste; o adversário rola o mesmo teste (ou o melhor que tiver)
  function duelCfg(actor, list) {
    const others = list.filter((x) => x.id !== actor.id);
    if (!others.length) return h('p', 'cmd__note', 'Ninguém para disputar.');
    const d = battle.duel;
    const mineT = testsOf(actor);
    if (!mineT.some((t) => t.id === d.mine)) d.mine = mineT[0].id;
    return h('div', 'cmd__row', selField('duel-mine', 'Seu teste', mineT.map((t) => [t.id, t.label]), d.mine, (v) => { d.mine = v; }),
      gmBtn('Escolher adversário', 'btn--primary', () => startAim({ label: 'Disputa', valid: others.map((x) => x.id), pick: async (foe) => {
        const t1 = mineT.find((t) => t.id === d.mine);
        const theirT = testsOf(foe);
        const t2 = theirT.find((t) => t.id === d.mine) || theirT.find((t) => t.id.slice(2) === d.mine.slice(2)) || theirT[0];
        const r1 = rollTest(t1.make()), r2 = rollTest(t2.make());
        const s1 = r1.flag === 'falha' ? -1 : r1.total, s2 = r2.flag === 'falha' ? -1 : r2.total;
        const res = s1 === s2 ? 'empate' : (s1 > s2 ? actor.name : foe.name) + ' vence';
        await rollAs(actor, { expr: r1.expr, label: ('Disputa: ' + t1.make().label.replace('Teste de ', '') + ' × ' + foe.name).slice(0, 60), total: r1.total, flag: r1.flag,
          detail: (actor.name + ' ' + r1.detail + ' = ' + r1.total + (r1.flag === 'falha' ? ' (falha completa)' : '') + ' | ' + foe.name + ' (' + t2.make().label.replace('Teste de ', '') + ') ' + r2.detail + ' = ' + r2.total + (r2.flag === 'falha' ? ' (falha completa)' : '') + ' → ' + res).slice(0, 1450) });
        toast('Disputa: ' + actor.name + ' ' + r1.total + ' × ' + r2.total + ' ' + foe.name + ' → ' + res + '.');
      } })));
  }

  async function runManeuver(actor, tgt, man, cost) {
    const paid = econPay(actor, cost);
    const pick = resistPick(tgt);
    const res = contest(actor, sideTest(actor, 'luta'), tgt, pick[1]);
    let effect = '';
    if (res.win) {
      if (man.id === 'atropelar') { await addTag(tgt.id, 'Caído', 0); effect = tgt.name + ' é arremessado 1,5 m e fica Caído'; }
      else if (man.id === 'empurrar') effect = tgt.name + ' é empurrado 1,5 m';
      else if (man.id === 'desarmar') {
        if (tgt.foe) { await addTag(tgt.id, 'Desarmado', 0); effect = tgt.name + ' fica Desarmado'; }
        else {
          let lost = [];
          await patchMemberSheet(tgt.member, (s) => { s.inventory.forEach((i) => { if ((i.slot === 'mao-d' || i.slot === 'mao-e') && isWeapon(i.kind)) { lost.push(i.name); i.slot = ''; } }); });
          effect = lost.length ? tgt.name + ' larga ' + lost.join(' e ') + ' (vai para a mochila)' : tgt.name + ' não tinha arma nas mãos';
        }
      } else {
        await addTag(tgt.id, man.tag, man.rounds || 0);
        if (man.id === 'agarrar') await addTag(actor.id, 'Agarrando', 0);
        effect = tgt.name + ' fica ' + man.tag + (man.rounds ? ' por ' + plural(man.rounds, 'rodada', 'rodadas') : '');
      }
    } else effect = tgt.name + ' resiste' + (man.id === 'atropelar' && pick[0] === 'resistencia' ? ' e ' + actor.name + ' perde o resto da ação e do movimento' : '');
    await rollAs(actor, { expr: res.r1.expr, label: (man.label + ': ' + tgt.name).slice(0, 60), total: res.r1.total, flag: res.r1.flag, detail: (paid + ' · ' + res.text + ' → ' + effect).slice(0, 1450) });
    toast(man.label + ': ' + effect + '.');
    renderBattle();
  }

  /* Cura (capítulo Cura): PV com Kit Médico (Precisão + Ofício: Medicina), Escudo com Carregador de Energia
     (Essência + Operações), Blindagem com Componentes Mecânicos (Precisão + Ofício: Engenharia). */
  const HEAL = [
    { key: 'pv', label: 'PV', kit: 'Kit médico', rx: /kit\s*m[eé]dic|m[eé]dic|curativo|estimulante/i, sk: 'oficio' },
    { key: 'escudo', label: 'Escudo', kit: 'Carregador de energia', rx: /carregador|bateria|c[eé]lula/i, sk: 'operacoes' },
    { key: 'blindagem', label: 'Blindagem', kit: 'Componentes mecânicos', rx: /componente|pe[cç]as|reparo/i, sk: 'oficio' }
  ];
  const REC_KEYS = { pv: 'pv', vida: 'pv', pe: 'pe', pa: 'pa', escudo: 'escudo', e: 'escudo', blindagem: 'blindagem', bl: 'blindagem' };
  // "+5 PV, +2 PE" → { pv: 5, pe: 2 }
  function recOf(i) {
    const out = {};
    String((i.values && i.values.bonusRec) || '').replace(/([+-]?\d+)\s*(pv|vida|pe|pa|escudo|blindagem|bl|e)\b/gi, (m, n, k) => { const key = REC_KEYS[k.toLowerCase()]; if (key) out[key] = (out[key] || 0) + num(n); return m; });
    return out;
  }
  const usableItems = (s) => s.inventory.filter((i) => isWeapon(i.kind) || i.kind === 'item-geral');
  const kitFor = (s, hl) => s.inventory.find((i) => i.kind === 'item-geral' && (hl.rx.test(i.name) || recOf(i)[hl.key])) || null;
  // gasta uma unidade (consumível) e devolve o texto
  function spendItem(s, uidv) {
    const i = s.inventory.find((x) => x.uid === uidv);
    if (!i || (i.values && i.values.tipoUso) !== 'Consumível') return '';
    const uses = Math.max(0, Math.round(num(i.values.usos)));
    if (uses > 1) {
      const left = (i.left === undefined ? uses : num(i.left)) - 1;
      if (left > 0) { i.left = left; return ' (' + plural(left, 'uso restante', 'usos restantes') + ')'; }
      delete i.left;
    }
    if ((i.qty || 1) > 1) { i.qty -= 1; return ' (sobram ' + i.qty + ')'; }
    s.inventory.splice(s.inventory.indexOf(i), 1);
    return ' (acabou)';
  }
  const negTags = (id) => tagsOf(id).filter((t) => GOOD_TAGS.indexOf(t.n) < 0).length;

  function healPanel(actor, list) {
    const mb = actor.member;
    const c = sheetOf(mb);
    const allies = list.filter((x) => x.side === actor.side);
    const hs = battle.heal;
    if (!allies.some((x) => x.id === hs.target)) hs.target = ([...combat.targets].find((id) => allies.some((x) => x.id === id))) || actor.id;
    const tgt = allies.find((x) => x.id === hs.target) || actor;
    const layers = tgt.layers.filter((l) => l.max > 0);
    if (!layers.some((l) => l.key === hs.key)) hs.key = (layers.find((l) => l.cur < l.max) || layers[0] || { key: 'pv' }).key;
    const hl = HEAL.find((x) => x.key === hs.key);
    const layer = layers.find((l) => l.key === hs.key);
    const kit = kitFor(c.sheet, hl);
    const sel = (id, label, opts, val, fn) => {
      const s = h('select', 'input');
      s.id = id;
      opts.forEach((o) => { const op = h('option', '', o[1]); op.value = o[0]; s.append(op); });
      s.value = val;
      s.addEventListener('change', () => { fn(s.value); renderBattle(); });
      const l = h('label', 'field__label', label);
      l.htmlFor = id;
      return h('div', 'field', l, s);
    };
    if (!layer) return h('p', 'cmd__note', tgt.name + ' não tem recurso para curar.');
    const cd = (layer.cur < layer.max / 2 ? 10 : 6) + 2 * negTags(tgt.id);
    const t = skillTest(c.sheet, compute(c), hl.sk);
    const fields = h('div', 'cmd__row',
      sel('heal-target', 'Quem', allies.map((x) => [x.id, x.name + (x.id === actor.id ? ' (você)' : '')]), tgt.id, (v) => { hs.target = v; }),
      sel('heal-key', 'Recurso', layers.map((l) => [l.key, HEAL.find((x) => x.key === l.key).label + ' ' + l.cur + '/' + l.max]), hs.key, (v) => { hs.key = v; }));
    if (!kit) return h('div', 'cmd__stack', fields, h('p', 'cmd__warn', 'Precisa de ' + hl.kit + ' no inventário de ' + actor.name + '.'));
    const bonus = recOf(kit)[hl.key] || 0;
    return h('div', 'cmd__stack', fields,
      h('p', 'cmd__note', 'Usa ' + kit.name + (bonus ? ' (+' + bonus + ' ' + hl.label + ' mesmo na falha)' : '') + '. CD ' + cd + (negTags(tgt.id) ? ' (com ' + plural(negTags(tgt.id), 'condição negativa', 'condições negativas') + ')' : '') + '.'),
      gmBtn('Curar ' + hl.label + ' · ' + t.skillName + ' ' + signed(fixedOf(t)) + ' contra CD ' + cd, 'btn--primary', async () => {
        const paid = econPay(actor, 'completa');
        const r = rollTest(t);
        const got = (r.flag !== 'falha' && r.total > cd ? r.total - cd : 0) + bonus;
        let left = '';
        await patchMemberSheet(mb, (s) => { left = spendItem(s, kit.uid); });
        if (got) {
          await patchMemberSheet(tgt.member, (s) => {
            const m = compute(Object.assign({}, tgt.member, { sheet: s }));
            if (m.max[hl.key]) setCur(s, hl.key, getCur(s, hl.key, m.max[hl.key]) + got, m.max[hl.key]);
          });
        }
        r.label = ('Curar ' + hl.label + ': ' + tgt.name).slice(0, 60);
        r.detail = paid + ' · ' + r.detail + ' contra CD ' + cd + ' → ' + (got ? '+' + got + ' ' + hl.label : 'nada recuperado') + ' · ' + kit.name + left;
        await campaignRoll(mb, r);
        battle.view = 'main';
        toast(tgt.name + ': ' + (got ? '+' + got + ' ' + hl.label : 'a cura não pegou') + '.');
        renderBattle();
      }));
  }

  /* Itens: só o que o personagem tem, separado em mãos e mochila. Pegar um item custa a ação do capítulo
     Ações (arma: movimento; pistola: bônus; Saque: grátis uma vez por turno) e precisa de mão livre
     (Duas mãos precisa das duas). Usar consumível ou utilitário é ação padrão, com o saque incluído. */
  const handOf = (i) => i.slot === 'mao-d' || i.slot === 'mao-e';
  const isSaque = (i) => /saque/i.test(String((i.values && i.values.empunhadura) || ''));
  function drawCost(actor, i) {
    if (isSaque(i)) return econLive(actor) && econOf(actor.id).saque ? 'movimento' : 'saque';
    if (i.typeId === 'pistola' || i.typeId === 'revolver') return 'bonus';
    return 'movimento';
  }
  // por que não dá para pegar ('' = dá) e a mão que o item vai ocupar
  function handRoom(s, i) {
    const held = s.inventory.filter(handOf);
    const busy = new Set();
    held.forEach((x) => { if (twoHanded(x)) { busy.add('mao-d'); busy.add('mao-e'); } else busy.add(x.slot); });
    if (twoHanded(i)) return busy.size ? { why: 'Duas mãos: guarde o que está nas mãos antes.' } : { slot: 'mao-d' };
    const slot = ['mao-d', 'mao-e'].find((k) => !busy.has(k));
    return slot ? { slot } : { why: 'As duas mãos estão ocupadas: guarde algo antes.' };
  }
  function itemsPanel(actor, list) {
    const mb = actor.member;
    const c = sheetOf(mb);
    const s = c.sheet;
    const items = usableItems(s);
    const held = items.filter(handOf);
    const bag = items.filter((i) => !i.slot);
    const used = held.reduce((t, i) => t + (twoHanded(i) ? 2 : 1), 0);
    const btn = (label, cost, fn, why) => {
      const b = h('button', 'inv__act', label);
      b.type = 'button';
      const block = why || econWhy(actor, cost);
      if (block) { b.disabled = true; b.title = block; }
      b.addEventListener('click', async () => { b.disabled = true; try { await fn(); } catch (err) { toast(errorMessage(err)); } b.disabled = false; renderBattle(); });
      return b;
    };
    const facts = (i) => [i.values.empunhadura, i.values.tipoUso, i.values.dano ? 'dano ' + i.values.dano : '', i.values.cadencia && num(i.values.cadencia) > 1 ? 'cadência ' + i.values.cadencia : '', i.values.bonusRec].filter(Boolean).join(' · ');
    // com bônus de recuperação, volta para a arena para escolher em quem usar
    const useItem = (i) => async () => {
      const rec = recOf(i);
      if (Object.keys(rec).some((k) => rec[k])) {
        startAim({ label: 'Usar ' + i.name, valid: alliesOf(list, actor).map((x) => x.id), pick: (x) => applyItem(i, rec, x) });
        return;
      }
      await applyItem(i, rec, actor);
    };
    const applyItem = async (i, rec, tgt) => {
      const paid = econPay(actor, 'padrao');
      let left = '';
      await patchMemberSheet(mb, (ss) => { left = spendItem(ss, i.uid); });
      const gains = Object.keys(rec).filter((k) => rec[k]);
      if (gains.length) {
        await patchMemberSheet(tgt.member, (ss) => {
          const m = compute(Object.assign({}, tgt.member, { sheet: ss }));
          gains.forEach((k) => { if (m.max[k]) setCur(ss, k, getCur(ss, k, m.max[k]) + rec[k], m.max[k]); });
        });
      }
      const what = gains.length ? ' em ' + tgt.name + ': ' + gains.map((k) => signed(rec[k]) + ' ' + (k === 'pv' ? 'PV' : k === 'pe' ? 'PE' : k === 'pa' ? 'PA' : k === 'escudo' ? 'Escudo' : 'Blindagem')).join(', ') : '';
      await actLog(actor, ('Usar: ' + i.name).slice(0, 60), paid + what + left + (i.values.efeito ? ' · ' + i.values.efeito : ''));
      toast(i.name + what + '.');
    };
    const row = (i, inHand) => {
      const acts = [];
      if (inHand) {
        if (isWeapon(i.kind)) acts.push(btn('Atacar', 'padrao', async () => { const st = memberAtk[mb.characterId] = memberAtk[mb.characterId] || { uid: null, mode: '', shots: 1, mod: 0, dice: 'n2', dist: '' }; st.uid = i.uid; st.mode = ''; st.shots = 1; battle.slot = 'padrao'; battle.cmd = 'atacar'; battle.view = 'cfg'; }));
        const cost = drawCost(actor, i);
        acts.push(btn('Guardar', cost, async () => {
          const paid = econPay(actor, cost);
          await patchMemberSheet(mb, (ss) => { const x = ss.inventory.find((y) => y.uid === i.uid); if (x) x.slot = ''; });
          await actLog(actor, ('Guardar: ' + i.name).slice(0, 60), paid + '.');
        }));
      } else if (isWeapon(i.kind) || i.values.empunhadura) {
        const room = handRoom(s, i);
        const cost = drawCost(actor, i);
        acts.push(btn('Sacar', cost, async () => {
          const paid = econPay(actor, cost);
          await patchMemberSheet(mb, (ss) => {
            const x = ss.inventory.find((y) => y.uid === i.uid);
            if (!x) throw new UserError(i.name + ' não está mais no inventário.');
            const r = handRoom(ss, x);
            if (r.why) throw new UserError(r.why);
            let one = x;
            if ((x.qty || 1) > 1) { one = deep(x); one.uid = uid(); one.qty = 1; x.qty -= 1; ss.inventory.push(one); }
            one.slot = r.slot;
          });
          await actLog(actor, ('Sacar: ' + i.name).slice(0, 60), paid + (twoHanded(i) ? ' · nas duas mãos' : '') + '.');
        }, room.why));
      }
      if (i.kind === 'item-geral') {
        const tu = i.values.tipoUso;
        if (tu === 'Estação') acts.push(btn('Instalar', 'completa', async () => { const paid = econPay(actor, 'completa'); await actLog(actor, ('Instalar: ' + i.name).slice(0, 60), paid + ': estação montada; usar também é ação completa.'); }));
        else if (tu || Object.keys(recOf(i)).length) acts.push(btn('Usar', 'padrao', useItem(i)));
      }
      const uses = i.left !== undefined ? ' · ' + plural(num(i.left), 'uso', 'usos') : '';
      return h('li', 'inv__row' + (inHand ? ' inv__row--hand' : ''),
        h('span', 'inv__main', h('span', 'inv__name', i.name + ((i.qty || 1) > 1 ? ' ×' + i.qty : '')), h('span', 'inv__facts', facts(i) + uses)),
        h('span', 'inv__acts', ...acts));
    };
    return h('div', 'cmd__panel inv',
      h('p', 'cmd__note', 'Mãos: ' + used + ' de 2 ocupadas. Só aparece o que ' + actor.name + ' tem; o que não dá para pegar agora fica apagado.'),
      h('h4', 'inv__title', 'Nas mãos'),
      h('ul', 'inv__list', ...(held.length ? held.map((i) => row(i, true)) : [h('li', 'inv__empty', 'Mãos vazias: ataque desarmado.')])),
      h('h4', 'inv__title', 'Na mochila'),
      h('ul', 'inv__list', ...(bag.length ? bag.map((i) => row(i, false)) : [h('li', 'inv__empty', 'Nada que dê para pegar no combate.')])));
  }

  /* Descanso (capítulo Recursos): curto recupera metade de PV, PE e PA (com Humanidade, também metade da vida convertida,
     como se fossem PV: o descanso não leva a Blindagem/Escudo além da metade),
     e cada curto seguido recupera metade do anterior; o longo recupera tudo e zera a sequência. */
  function restSheet(s, m, long) {
    if (long) { s.cur = {}; s.rests = 0; return 'tudo recuperado'; }
    const n = clamp(Math.round(num(s.rests)), 0, 10);
    const keys = ['pv', 'pe', 'pa'];
    if (m.humanidade && m.base !== 'pv') keys.push(m.base);
    const got = [];
    keys.forEach((k) => {
      const mx = m.max[k];
      if (!mx) return;
      const half = k === m.base && k !== 'pv'; // Humanidade: só metade da vida convertida regenera
      const pool = half ? Math.ceil(mx / 2) : mx;
      const before = getCur(s, k, mx);
      if (before >= pool) return;
      setCur(s, k, Math.min(pool, before + Math.max(1, Math.ceil(pool / 2 / Math.pow(2, n)))), mx);
      const d = getCur(s, k, mx) - before;
      if (d) got.push('+' + d + ' ' + (k === 'pv' ? 'PV' : k === 'pe' ? 'PE' : k === 'pa' ? 'PA' : k === 'escudo' ? 'Escudo' : 'Blindagem'));
    });
    s.rests = n + 1;
    return got.length ? got.join(', ') : 'nada a recuperar';
  }
  // Descanso fica no Grupo: o mestre descansa todos; o jogador, os personagens dele
  const restWho = () => members.filter((m) => m.sheet && m.sheet.attrs && (currentCamp.gm || m.mine));
  function renderRest() {
    const box = $('#rest-block');
    const who = currentCamp ? restWho() : [];
    box.hidden = !who.length;
    if (!who.length) return;
    const busy = sceneOn();
    $('#rest-hint').textContent = (busy ? 'Com um combate em andamento não dá para descansar. ' : '') +
      'Curto (1 a 4 horas): metade de PV, PE e PA, e cada curto seguido recupera metade do anterior. Longo (8 horas ou mais): tudo. ' +
      (currentCamp.gm ? 'Descansa o grupo todo (' + who.map((m) => m.name).join(', ') + '); nas lojas com NPCs comprando, o descanso também pode vender o que está à venda.' : 'Descansa ' + who.map((m) => m.name).join(', ') + '.');
    $('#rest-short').disabled = busy;
    $('#rest-long').disabled = busy;
  }
  ['short', 'long'].forEach((k) => $('#rest-' + k).addEventListener('click', async (ev) => {
    const b = ev.currentTarget;
    if (sceneOn()) { toast('Encerre o combate antes de descansar.'); return; }
    b.disabled = true;
    await restMembers(restWho(), k === 'long');
    play('ok');
    b.disabled = false;
  }));

  async function restMembers(list, long) {
    const lines = [];
    for (const mb of list) {
      try {
        let txt = '';
        await patchMemberSheet(mb, (s) => { txt = restSheet(s, compute(Object.assign({}, mb, { sheet: s })), long); });
        lines.push(mb.name + ': ' + txt);
      } catch (err) { lines.push(mb.name + ': ' + errorMessage(err)); }
    }
    await sceneLog('Descanso ' + (long ? 'longo' : 'curto'), lines.join(' · '), lines.length);
    toast('Descanso ' + (long ? 'longo' : 'curto') + ': ' + lines.join(' · ').slice(0, 240));
    if (currentCamp.gm && shops.some((sh) => sh.npcBuyers && TRAFFIC_P[sh.traffic])) await shopRest(long);
    renderBattle();
  }

  const logSeen = new Set();
  function renderBattleLog() {
    const list = lastRolls.slice(-8);
    const first = !logSeen.size;
    const fresh = (r) => { const k = r.id || r.createdAt || r.label + r.total; if (logSeen.has(k)) return false; logSeen.add(k); return !first; };
    $('#battle-log').replaceChildren(...(list.length ? list.map((r) => h('li', 'blog__item' + (r.flag ? ' blog__item--' + (r.flag === 'falha' ? 'fail' : r.flag) : '') + (fresh(r) ? ' is-new' : ''),
      h('span', 'blog__who', r.characterName), h('span', 'blog__what', r.label || r.expr), h('strong', 'blog__total', rolledShow(r)),
      h('span', 'blog__detail', String(r.detail || '').slice(0, 220)))) : [h('li', 'blog__empty', 'Nada ainda. Ataques, defesas e disputas aparecem aqui.')]));
    const box = $('#battle-log');
    box.scrollTop = box.scrollHeight;
  }

  // Caixa do time: quem pode entrar nele. O mestre move qualquer um e traz NPCs do bestiário;
  // o jogador só move os próprios personagens.
  let boxDlg = null;
  function openTeamBox(teamId) {
    if (!boxDlg) {
      boxDlg = h('dialog', 'dialog teamsdlg');
      boxDlg.setAttribute('aria-labelledby', 'boxdlg-title');
      document.body.append(boxDlg);
    }
    const gm = Boolean(currentCamp.gm);
    const t = teamById(teamId);
    const out = sceneOut();
    const list = combatants();
    const cands = list.filter((x) => x.side !== teamId && (gm || (x.member && x.member.mine)))
      .concat(members.filter((mb) => mb.sheet && mb.sheet.attrs && out.indexOf('chr:' + mb.characterId) >= 0 && (gm || mb.mine))
        .map((mb) => ({ id: 'chr:' + mb.characterId, name: mb.name, member: mb, isOut: true })));
    const close = () => { if (boxDlg.open) closeDialog(boxDlg); };
    const rows = cands.map((x) => {
      const from = x.isOut ? 'Fora do combate' : teamById(x.side).name;
      const b = h('button', 'btn btn--primary btn--sm', 'Pôr aqui');
      b.type = 'button';
      b.dataset.fid = 'box-put-' + x.id;
      b.setAttribute('aria-label', 'Pôr ' + x.name + ' no time ' + t.name);
      b.addEventListener('click', async () => {
        close();
        if (x.isOut && gm) { await saveOut(x.id, false); }
        await setTeam(x.id, teamId);
        if (x.isOut && gm && sceneOn()) { const y = combatants().find((z) => z.id === x.id); if (y && !scene.order.some((o) => o.id === x.id)) await joinScene(y); }
        play('drop');
        toast(x.name + ' foi para o time ' + t.name + '.');
      });
      const dot = h('span', 'arena__dot');
      if (!x.isOut) dot.style.setProperty('--team', teamById(x.side).color);
      return h('div', 'teamsdlg__who teamsdlg__who--box', h('span', 'teamsdlg__name', x.name, h('span', 'teamsdlg__kind', ' ', x.foe ? 'NPC · ' : '', 'agora em ' + from)), dot, b);
    });
    const extra = [];
    if (gm) {
      const npc = h('button', 'btn btn--ghost btn--sm', 'Trazer NPC do bestiário');
      npc.type = 'button';
      npc.dataset.fid = 'box-npc';
      npc.addEventListener('click', async () => {
        close();
        const e = await openPicker({ title: 'NPC para o time ' + t.name, kinds: ['npc'], chips: ['NPC / Criatura'] });
        if (e) await addFoeEntry(e, teamId);
      });
      const squads = h('button', 'btn btn--ghost btn--sm', 'Acoplar time salvo');
      squads.type = 'button';
      squads.addEventListener('click', () => { close(); openPresets(); });
      extra.push(h('div', 'teamsdlg__row', npc, squads));
    }
    const cancel = h('button', 'btn btn--ghost btn--sm', 'Fechar');
    cancel.type = 'button';
    cancel.addEventListener('click', close);
    const title = h('h2', '', 'Pôr no time ' + t.name);
    title.id = 'boxdlg-title';
    const box = h('div', 'teamsdlg__body', title,
      h('p', 'field__hint', gm ? 'Toque em "Pôr aqui" para mover alguém para este time. Também dá para trazer um NPC novo.' : 'Você escolhe o time só dos seus personagens. Quem entra ou sai do combate é o mestre que decide.'),
      rows.length ? h('div', 'teamsdlg__list', ...rows) : h('p', 'field__hint', gm ? 'Todo mundo já está neste time.' : 'Seus personagens já estão neste time.'),
      ...extra, h('div', 'dialog__actions', cancel));
    box.style.setProperty('--team', t.color);
    boxDlg.replaceChildren(box);
    openDialog(boxDlg);
  }

  /* Presets: os dois prontos (aliados × inimigos, e com neutros) e os salvos pelo mestre.
     Times salvos: um time com os NPCs dele, para acoplar em qualquer combate. */
  let presetsDlg = null;
  function openPresets() {
    if (!presetsDlg) {
      presetsDlg = h('dialog', 'dialog teamsdlg');
      presetsDlg.setAttribute('aria-labelledby', 'presetsdlg-title');
      document.body.append(presetsDlg);
    }
    const close = () => { if (presetsDlg.open) closeDialog(presetsDlg); };
    const dots = (teams) => h('span', 'teamsdlg__dots', ...(teams || []).map((t) => { const s = h('span', 'arena__dot'); s.style.setProperty('--team', t.color); s.title = t.name; return s; }));
    const btn = (label, cls, fn, fid) => { const b = h('button', 'btn btn--sm ' + cls, label); b.type = 'button'; if (fid) b.dataset.fid = fid; b.addEventListener('click', fn); return b; };
    const draw = () => {
      const presets = DEFAULT_PRESETS.concat(scenePresets()).map((p) => {
        const n = (p.list || []).filter((x) => x.k === 'npc').length;
        const info = p.builtin ? 'pronto · ' + (p.teams || []).map((t) => t.name).join(', ') : plural(n, 'NPC', 'NPCs') + ' · ' + (p.teams || []).map((t) => t.name).join(', ');
        return h('li', 'teamsdlg__preset', dots(p.teams), h('span', 'teamsdlg__name', p.name, h('span', 'teamsdlg__kind', ' ' + info)),
          btn('Usar', 'btn--primary', () => { close(); openTeams(!sceneOn(), p); }, 'preset-use-' + p.id),
          p.builtin ? h('span', '') : btn('Apagar', 'btn--ghost', async () => {
            const next = sceneBase();
            next.presets = scenePresets().filter((y) => y.id !== p.id);
            await saveScene(next);
            draw();
          }));
      });
      const squads = sceneSquads().map((sq) => h('li', 'teamsdlg__preset', dots([sq]), h('span', 'teamsdlg__name', sq.name, h('span', 'teamsdlg__kind', ' ' + plural((sq.npcs || []).length, 'NPC', 'NPCs') + ((sq.npcs || []).length ? ': ' + sq.npcs.map((x) => x.name).join(', ') : ''))),
        btn('Acoplar', 'btn--primary', async () => { close(); await attachSquad(sq); }, 'squad-use-' + sq.id),
        btn('Apagar', 'btn--ghost', async () => {
          const next = sceneBase();
          next.squads = sceneSquads().filter((y) => y.id !== sq.id);
          await saveScene(next);
          draw();
        })));
      const title = h('h2', '', 'Presets');
      title.id = 'presetsdlg-title';
      presetsDlg.replaceChildren(h('div', 'teamsdlg__body', title,
        h('p', 'field__hint', '"Usar" abre os times do preset para você conferir' + (sceneOn() ? ' e salvar.' : ' e começar o combate.') + ' Para criar um, monte os times em "Times" e salve como preset.'),
        h('h3', 'sub-title', 'Presets de combate'), h('ul', 'teamsdlg__presets', ...presets),
        btn('+ Criar preset', 'btn--ghost', () => { close(); openTeams(false, null, true); }, 'preset-new'),
        h('h3', 'sub-title', 'Times salvos'),
        h('p', 'field__hint', 'Um time com nome, cor e os NPCs dele (inimigos ou aliados já prontos). "Acoplar" põe o time e os NPCs no combate atual. Para salvar, use "Salvar time" em "Times".'),
        squads.length ? h('ul', 'teamsdlg__presets', ...squads) : h('p', 'field__hint', 'Nenhum time salvo ainda.'),
        h('div', 'dialog__actions', btn('Fechar', 'btn--ghost', close))));
    };
    draw();
    openDialog(presetsDlg);
  }
  // time salvo entra no combate: time novo (ou o de mesmo nome) e os NPCs dele criados nele
  async function attachSquad(sq) {
    const next = sceneBase();
    const teams = deep(sceneTeams());
    let t = teams.find((y) => nameKey(y.name) === nameKey(sq.name));
    if (!t) {
      if (teams.length >= TEAM_MAX) { toast('Já são ' + TEAM_MAX + ' times. Apague um em "Times" para acoplar outro.'); return; }
      t = { id: 't' + uid().slice(0, 6), name: sq.name, color: sq.color };
      teams.push(t);
    }
    try {
      const team = Object.assign({}, next.team);
      const fresh = [];
      for (const x of sq.npcs || []) {
        const id = await db.addFoe(currentCamp.id, { npcId: x.npcId || '', name: String(x.name).slice(0, 60), values: deep(x.values || {}), thumb: x.thumb || '', cur: {}, def: null });
        team['foe:' + id] = t.id;
        fresh.push(id);
      }
      const now = sceneBase();
      now.teams = teams;
      now.team = Object.assign({}, now.team, team);
      await saveScene(now);
      if (fresh.length) await waitFoes(fresh);
      if (sceneOn()) for (const x of combatants().filter((y) => fresh.some((id) => y.id === 'foe:' + id))) await joinScene(x);
      play('ok');
      toast('Time ' + t.name + ' acoplado' + (fresh.length ? ' com ' + plural(fresh.length, 'NPC', 'NPCs') : '') + '.');
    } catch (err) { toast(errorMessage(err)); }
  }

  // NPC do bestiário entra na arena no time que o mestre escolher
  async function addFoeEntry(e, teamId) {
    const same = foes.filter((f) => f.npcId === e.id).length;
    try {
      const foe = { npcId: e.id, name: (e.name + (same ? ' ' + (same + 1) : '')).slice(0, 60), values: deep(e.values || {}), thumb: e.thumb || '', cur: {}, def: null };
      const id = await db.addFoe(currentCamp.id, foe);
      await setTeam('foe:' + id, teamId);
      play('ok');
      toast(foe.name + ' entrou na arena no time ' + teamById(teamId).name + '.');
    } catch (err) { toast(errorMessage(err)); }
  }
  async function placeFoe(e) {
    const t = await chooseTeam(e.name);
    if (t) await addFoeEntry(e, t);
  }
  // escolha rápida de time (botões com a cor de cada um)
  let teamPickDlg = null;
  function chooseTeam(name) {
    return new Promise((resolve) => {
      if (!teamPickDlg) {
        teamPickDlg = h('dialog', 'dialog startdlg');
        teamPickDlg.setAttribute('aria-labelledby', 'teampick-title');
        document.body.append(teamPickDlg);
      }
      let done = false;
      const finish = (v) => { if (done) return; done = true; resolve(v); if (teamPickDlg.open) closeDialog(teamPickDlg); };
      const btns = sceneTeams().map((t) => {
        const b = h('button', 'teambtn', h('span', 'arena__dot'), t.name);
        b.type = 'button';
        b.dataset.fid = 'team-' + t.id;
        b.style.setProperty('--team', t.color);
        b.addEventListener('click', () => finish(t.id));
        return b;
      });
      const cancel = h('button', 'btn btn--ghost btn--sm', 'Cancelar');
      cancel.type = 'button';
      cancel.addEventListener('click', () => finish(null));
      teamPickDlg.onclose = () => finish(null);
      const title = h('h2', '', 'Em qual time ' + name + ' entra?');
      title.id = 'teampick-title';
      teamPickDlg.replaceChildren(h('div', 'startdlg__body', title, h('div', 'teambtns', ...btns),
        h('p', 'field__hint', 'Para criar ou mudar times, use "Times" na barra do combate.'), h('div', 'dialog__actions', cancel)));
      openDialog(teamPickDlg);
    });
  }
  async function rollAllDefenses() {
    const list = combatants().filter((x) => (currentCamp.gm ? true : x.member && x.member.mine));
    if (!list.length) { toast('Ninguém na arena.'); return; }
    for (const x of list) { try { await rollDefense(x); } catch (err) { toast(errorMessage(err)); } }
  }

  // Defesa da cena: 2d6 + Corpo + Resistência; abaixo da mínima, vale a mínima
  async function rollDefense(x, uses) {
    uses = uses || [];
    let attr, res, attrName = 'Corpo', skillName = 'Resistência';
    const mods = [];
    if (x.foe) { const v = foeVals(x.foe); attr = num(v.corpo); res = num(v.resistencia); }
    else {
      const s = normSheet(x.member.sheet);
      attr = attrOf(s, 'corpo'); res = num(s.skills.resistencia);
      // Defensivas: Esquiva troca para Precisão + Reflexos; Explosiva soma a armadura
      if (uses.some((u) => nameKey(u.name) === 'esquiva')) { attr = attrOf(s, 'precisao'); res = num(s.skills.reflexos); attrName = 'Precisão'; skillName = 'Reflexos'; }
      if (uses.some((u) => nameKey(u.name) === 'explosiva')) mods.push(['armadura (Explosiva)', compute(sheetOf(x.member)).src.armadura.reduce((t, a) => t + a.val, 0)]);
    }
    const r = rollTest({ label: 'Defesa da cena', attrName, attr, skillName, skill: res, mods });
    if (uses.length) r.detail = powerNote(uses) + ' · ' + r.detail;
    const val = r.flag === 'falha' ? x.defMin : Math.max(r.total, x.defMin);
    r.detail += ' → defesa ' + val + (val > r.total || r.flag === 'falha' ? ' (vale a mínima ' + x.defMin + ')' : '');
    if (x.foe) await db.updateFoe(currentCamp.id, x.foe.id, { def: val });
    else await patchMemberSheet(x.member, (s) => { s.def = Object.assign({}, s.def); s.def[currentCamp.id] = val; });
    await postCombatRoll(x.foe ? { foe: x.foe } : { member: x.member }, r);
    renderCombat();
    return val;
  }

  async function postCombatRoll(who, r) {
    if (r.expr !== 'ação') play('dice');
    const base = who.foe
      ? { characterId: 'foe:' + who.foe.id, characterName: who.foe.name, characterType: 'criatura' }
      : { characterId: who.member.characterId, characterName: who.member.name, characterType: who.member.type };
    try { await db.addRoll(currentCamp.id, Object.assign(base, { expr: r.expr.slice(0, 120), label: r.label.slice(0, 60), detail: r.detail.slice(0, 1450), total: r.total, flag: r.flag })); }
    catch (err) { toast(errorMessage(err)); }
  }

  const FOE_MODES = { 'Corpo a corpo': ['corpo', 'luta', 'Corpo', 'Luta'], 'À distância': ['precisao', 'mira', 'Precisão', 'Mira'], 'Tecnológico': ['essencia', 'operacoes', 'Essência', 'Operações'] };
  function foeAttackBuilder(f, st, before, opts) {
    opts = opts || {};
    const v = foeVals(f);
    const box = h('div', 'attack');
    const draw = () => {
      if (!FOE_MODES[st.mode]) st.mode = FOE_MODES[v.ataque] ? v.ataque : 'Corpo a corpo';
      const cad = clamp(Math.round(num(v.cadencia)) || 1, 1, 20);
      st.shots = clamp(st.shots || 1, 1, cad);
      const field = (id, label, control) => { control.id = 'cbf-' + id; const l = h('label', 'field__label', label); l.htmlFor = control.id; return h('div', 'field', l, control); };
      const mSel = h('select', 'input');
      Object.keys(FOE_MODES).forEach((k) => { const md = FOE_MODES[k]; const o = h('option', '', k + ' (' + md[2] + ' + ' + md[3] + ')'); o.value = k; mSel.append(o); });
      mSel.value = st.mode;
      mSel.addEventListener('change', () => { st.mode = mSel.value; draw(); });
      const fields = [field('mode', 'Forma de ataque', mSel)];
      const targets = combatants().filter((x) => combat.targets.has(x.id));
      let per = null;
      if (cad > 1 && targets.length) {
        per = perTargetShots(st, cad, targets, true, draw, 'cbf-');
        st.shots = per.total;
        fields.push(per.box);
      } else if (cad > 1 && !opts.aim) {
        st.per = null;
        const nSel = h('select', 'input');
        for (let k = 1; k <= cad; k++) { const o = h('option', '', k + (k === 1 ? ' disparo' : ' disparos · –' + shotPenalty(k, true) + ' · dano ×' + k)); o.value = String(k); nSel.append(o); }
        nSel.value = String(st.shots);
        nSel.addEventListener('change', () => { st.shots = Math.round(num(nSel.value)) || 1; draw(); });
        fields.push(field('shots', 'Disparos (cadência ' + cad + ', perita)', nSel));
      }
      if (st.mode === 'À distância') {
        const dSel = h('select', 'input');
        DISTANCES.forEach((d) => { const o = h('option', '', d.label); o.value = d.id; dSel.append(o); });
        dSel.value = st.dist || '';
        dSel.addEventListener('change', () => { st.dist = dSel.value; draw(); });
        fields.push(field('dist', 'Distância do alvo', dSel));
      }
      fields.push(field('dice', 'Dados', diceSelect(st, draw)));
      const modIn = h('input', 'input');
      modIn.type = 'number';
      modIn.step = '1';
      modIn.placeholder = '0';
      modIn.value = st.mod || '';
      modIn.addEventListener('change', () => { st.mod = Math.round(num(modIn.value)); draw(); });
      fields.push(field('mod', 'Outro modificador', modIn));
      const md = FOE_MODES[st.mode];
      const mods = [];
      if (st.shots > 1) mods.push(['cadência ' + st.shots + ' disparos', -shotPenalty(st.shots, true)]);
      const dist = DISTANCES.find((d) => d.id === st.dist);
      if (st.mode === 'À distância' && dist && dist.mod) mods.push([dist.short, dist.mod]);
      if (st.mod) mods.push(['modificador', st.mod]);
      const t = applyDice({ label: ('Ataque: ' + (v.arma || st.mode) + (st.shots > 1 ? (per ? ' · ' + st.shots + ' disparos' : ' · dano ×' + st.shots) : '')).slice(0, 60), attrName: md[2], attr: num(v[md[0]]), skillName: md[3], skill: num(v[md[1]]), mods }, st);
      if (opts.peek) opts.peek(t);
      const fixed = t.attr + t.skill + mods.reduce((a, b) => a + b[1], 0);
      const go = h('button', 'btn btn--primary btn--sm', (opts.aim ? 'Escolher alvo' : 'Atacar os alvos') + ' · ' + diceText(st) + ' ' + (fixed ? signed(fixed) : '+0'));
      go.type = 'button';
      go.disabled = Boolean(per && per.over);
      go.addEventListener('click', () => {
        if (opts.aim) { opts.aim(t); return; }
        if (!combatants().some((x) => combat.targets.has(x.id))) { toast('Marque pelo menos um alvo na arena.'); return; }
        runAttack({ foe: f }, t, st, go, before ? before() : '');
      });
      const info = [v.dano ? 'dano ' + v.dano : '', v.efetivo ? 'efetivo contra ' + v.efetivo.toLowerCase() : ''].filter(Boolean).join(' · ');
      box.replaceChildren(h('div', 'attack__fields', ...fields), h('div', 'attack__go', go, info ? h('span', 'attack__info', info) : null));
    };
    draw();
    return box;
  }

  // Um teste de ataque, comparado com a defesa de cada alvo marcado
  async function runAttack(who, t, st, btn, paid) {
    const list = combatants().filter((x) => combat.targets.has(x.id));
    if (!list.length) { toast('Marque pelo menos um alvo na lista.'); return; }
    let types, effective = '', shots = Math.max(1, st.shots || 1);
    if (who.foe) {
      const v = foeVals(who.foe);
      types = splitTypes(v.dano);
      effective = v.efetivo === 'Vida' ? 'pv' : v.efetivo === 'Escudo' ? 'escudo' : v.efetivo === 'Blindagem' ? 'blindagem' : '';
    } else {
      const weapon = weaponsOf(who.c.sheet).find((w) => w.uid === st.uid) || null;
      types = weapon ? splitTypes(weapon.values.dano) : ['Contundente'];
      // sem proficiência, a arma corpo a corpo perde as propriedades do tipo
      const prop = weapon && (weapon.kind !== 'arma-melee' || isProficient(who.c.sheet, weapon));
      if (prop && weapon.typeId === 'marreta') effective = 'blindagem';
      if (prop && weapon.typeId === 'machado') effective = 'escudo';
      if (maxShots(weapon, who.c.sheet) <= 1) shots = 1;
      if (isGun(weapon)) {
        const total = st.per && shots > 1 ? list.reduce((tt, x) => tt + (st.per[x.id] || 1), 0) : shots;
        const block = fireBlock(weapon, total, sceneRound());
        if (block) { toast(block); return; }
        try {
          await patchMemberSheet(who.member, (sh) => { const w = sh.inventory.find((x) => x.uid === weapon.uid); if (w) { const hot = fireGun(w, total, sceneRound()); if (hot) toast(hot); } });
        } catch (err) { toast(errorMessage(err)); return; }
      }
    }
    btn.disabled = true;
    const r = rollTest(t);
    const lines = [];
    for (const x of list) {
      if (r.flag === 'falha') { lines.push(x.name + ': errou (falha completa)'); continue; }
      const k = st.per && shots > 1 ? st.per[x.id] || 1 : shots; // cadência por alvo
      const base = Math.max(1, r.total - x.def) * k;
      const res = applyLayeredDamage(base, types, x.layers, effective);
      const parts = res.steps.map((p) => p.label + ' –' + p.taken + factorText(p.k));
      const state = lifeState(res.layers);
      lines.push(x.name + ': ' + base + ' de dano' + (k > 1 ? ' (×' + k + ')' : '') + ' vs defesa ' + x.def + (parts.length ? ' → ' + parts.join(', ') : '') + (state ? ' · ' + state : ''));
      try {
        if (x.foe) {
          const cur = {};
          res.layers.forEach((l) => { if (l.max > 0) cur[l.key] = l.cur; });
          await db.updateFoe(currentCamp.id, x.foe.id, { cur });
        } else {
          await patchMemberSheet(x.member, (s) => {
            const m = compute(Object.assign({}, x.member, { sheet: s }));
            res.layers.forEach((l) => { if (m.max[l.key]) setCur(s, l.key, l.cur, m.max[l.key]); });
          });
        }
      } catch (err) { toast(errorMessage(err)); }
    }
    r.label = t.label;
    if (st.powNote) { r.detail = st.powNote + ' · ' + r.detail; st.powNote = ''; }
    if (paid) r.detail = paid + ' · ' + r.detail;
    r.detail += (types.length ? ' · ' + types.join(', ') : '') + ' · ' + lines.join(' | ');
    await postCombatRoll(who, r);
    toast(lines.join(' · ').slice(0, 300));
    btn.disabled = false;
    renderCombat();
  }

  /* ---------- Cena e iniciativa ----------
     Regras de Combate: ao entrar num combate, todos fazem um teste de Precisão (2d6 + Precisão + Iniciativa)
     e a ordem vai do maior para o menor, mantida até o fim; a defesa da cena é rolada junto.
     Cena → rodadas → turnos. O mestre abre e encerra; quem está na vez pode encerrar o próprio turno. */
  let scene = null;
  const sceneOn = () => Boolean(scene && scene.active && Array.isArray(scene.order) && scene.order.length);
  const sceneOrder = () => (sceneOn() ? scene.order.filter((o) => combatants().some((x) => x.id === o.id)) : []);
  const sceneCurrent = () => { const o = sceneOn() ? scene.order[scene.turn] : null; return o || null; };
  const isMineId = (id) => members.some((mb) => mb.mine && 'chr:' + mb.characterId === id);

  function rollInitiative(x) {
    let attr, skill;
    if (x.foe) { const v = foeVals(x.foe); attr = num(v.precisao); skill = num(v.iniciativa); }
    else { const s = normSheet(x.member.sheet); attr = attrOf(s, 'precisao'); skill = num(s.skills.iniciativa); }
    const r = rollTest({ label: 'Iniciativa', attrName: 'Precisão', attr, skillName: 'Iniciativa', skill });
    // empate: maior Precisão primeiro, depois a sorte
    return { id: x.id, name: x.name, init: r.total, tie: attr + Math.random() / 10, detail: r.detail };
  }
  const byInit = (a, b) => (b.init - a.init) || ((b.tie || 0) - (a.tie || 0));

  async function saveScene(next) {
    scene = next;
    renderScene();
    try { await db.saveScene(currentCamp.id, next); } catch (err) { toast(errorMessage(err)); }
  }
  async function sceneLog(label, detail, total) {
    try {
      await db.addRoll(currentCamp.id, { characterId: 'scene', characterName: (scene && scene.name) || 'Cena', characterType: 'criatura', expr: 'cena', label: label.slice(0, 60), detail: detail.slice(0, 1450), total: Math.round(total) || 0, flag: '' });
    } catch (err) { toast(errorMessage(err)); }
  }

  async function joinScene(x) {
    const r = rollInitiative(x);
    const next = deep(scene);
    const now = next.order[next.turn];
    next.order.push({ id: r.id, name: r.name, init: r.init, tie: r.tie });
    next.order.sort(byInit);
    if (now) next.turn = next.order.findIndex((o) => o.id === now.id);
    await saveScene(next);
    await sceneLog('Iniciativa: ' + x.name, r.detail + ' → entra na ordem com ' + r.init, r.init);
  }

  /* Times e presets: o mestre cria times (nome e cor), põe cada lutador num time (ou deixa jogador de fora)
     e pode salvar tudo como preset para usar depois. Ao começar o combate é esta mesma tela, perguntando
     quem luta contra quem. Tudo fica num rascunho até "Salvar" ou "Começar combate". */
  let teamsDlg = null;
  function openTeams(start, preset, focusPreset) {
    if (!teamsDlg) {
      teamsDlg = h('dialog', 'dialog teamsdlg');
      teamsDlg.setAttribute('aria-labelledby', 'teamsdlg-title');
      document.body.append(teamsDlg);
    }
    const fighters = foes.map((f) => ({ id: 'foe:' + f.id, name: f.name, foe: f }))
      .concat(members.filter((mb) => mb.sheet && mb.sheet.attrs).map((mb) => ({ id: 'chr:' + mb.characterId, name: mb.name, member: mb })));
    const d = { teams: deep(sceneTeams()), map: {}, add: [], preset: '' };
    const out = sceneOut();
    fighters.forEach((f) => { d.map[f.id] = !f.foe && out.indexOf(f.id) >= 0 ? 'out' : teamIdOf(f.id, f.foe, d.teams); });
    const fixTeams = () => { // quem estava num time apagado vai para o primeiro
      const ok = (t) => t === 'out' || d.teams.some((y) => y.id === t);
      Object.keys(d.map).forEach((k) => { if (!ok(d.map[k])) d.map[k] = d.teams[0].id; });
      d.add.forEach((x) => { if (!ok(x.t) || x.t === 'out') x.t = d.teams[0].id; });
    };
    const teamSel = (value, canOut, label, onChange) => {
      const s = h('select', 'input');
      s.setAttribute('aria-label', label);
      d.teams.forEach((t) => { const o = h('option', '', t.name || 'Sem nome'); o.value = t.id; s.append(o); });
      if (canOut) { const o = h('option', '', 'Fora do combate'); o.value = 'out'; s.append(o); }
      s.value = value;
      s.addEventListener('change', () => { onChange(s.value); draw(); });
      return s;
    };
    const draw = () => {
      const teamRows = d.teams.map((t, i) => {
        const color = h('input', 'teamsdlg__color');
        color.type = 'color';
        color.value = t.color;
        color.setAttribute('aria-label', 'Cor do time ' + t.name);
        color.addEventListener('input', () => { t.color = color.value; row.style.setProperty('--team', t.color); });
        const name = h('input', 'input');
        name.type = 'text';
        name.maxLength = 30;
        name.value = t.name;
        name.dataset.fid = 'team-name-' + i;
        name.setAttribute('aria-label', 'Nome do time');
        name.addEventListener('input', () => { // atualiza os nomes nas listas sem redesenhar (não perde o foco)
          t.name = name.value;
          teamsDlg.querySelectorAll('option[value="' + t.id + '"]').forEach((o) => { o.textContent = name.value || 'Sem nome'; });
        });
        const del = h('button', 'btn btn--ghost btn--sm', 'Apagar');
        del.type = 'button';
        del.disabled = d.teams.length <= 1;
        del.addEventListener('click', () => { d.teams.splice(i, 1); fixTeams(); draw(); });
        const n = fighters.filter((f) => d.map[f.id] === t.id).length + d.add.filter((x) => x.t === t.id).length;
        const keep = h('button', 'btn btn--ghost btn--sm', 'Salvar time');
        keep.type = 'button';
        keep.dataset.fid = 'squad-save-' + i;
        keep.title = 'Guarda este time com os NPCs dele para acoplar em outros combates';
        keep.addEventListener('click', async () => {
          const nm = cleanName(t.name).slice(0, 30) || 'Time';
          const npcs = fighters.filter((f) => f.foe && d.map[f.id] === t.id).map((f) => ({ npcId: f.foe.npcId || '', name: f.foe.name, values: deep(f.foe.values || {}), thumb: f.foe.thumb || '' }))
            .concat(d.add.filter((x) => x.t === t.id).map((x) => ({ npcId: x.npcId, name: x.name, values: deep(x.values), thumb: x.thumb })));
          const next = sceneBase();
          next.squads = [{ id: uid(), name: nm, color: t.color, npcs }].concat(sceneSquads().filter((y) => nameKey(y.name) !== nameKey(nm))).slice(0, SQUAD_MAX);
          await saveScene(next);
          play('ok');
          toast('Time "' + nm + '" salvo' + (npcs.length ? ' com ' + plural(npcs.length, 'NPC', 'NPCs') : '') + '. Acople em Presets.');
        });
        const row = h('div', 'teamsdlg__team', color, name, h('span', 'teamsdlg__n', plural(n, 'lutador', 'lutadores')), keep, del);
        row.style.setProperty('--team', t.color);
        return row;
      });
      const addTeam = h('button', 'btn btn--ghost btn--sm', '+ Novo time');
      addTeam.type = 'button';
      addTeam.dataset.fid = 'team-add';
      addTeam.disabled = d.teams.length >= TEAM_MAX;
      addTeam.addEventListener('click', () => {
        const color = TEAM_COLORS.find((c) => !d.teams.some((t) => t.color === c)) || TEAM_COLORS[d.teams.length % TEAM_COLORS.length];
        d.teams.push({ id: 't' + uid().slice(0, 6), name: 'Time ' + (d.teams.length + 1), color });
        draw();
      });
      const who = fighters.map((f) => h('div', 'teamsdlg__who', h('span', 'teamsdlg__name', f.name, f.foe ? h('span', 'teamsdlg__kind', ' NPC') : null),
        teamSel(d.map[f.id], !f.foe, 'Time de ' + f.name, (v) => { d.map[f.id] = v; })))
        .concat(d.add.map((x, i) => h('div', 'teamsdlg__who', h('span', 'teamsdlg__name', x.name, h('span', 'teamsdlg__kind', ' NPC novo (do preset)')),
          teamSel(x.t, false, 'Time de ' + x.name, (v) => { x.t = v; }),
          (() => { const b = h('button', 'btn btn--ghost btn--sm', '×'); b.type = 'button'; b.setAttribute('aria-label', 'Não trazer ' + x.name); b.addEventListener('click', () => { d.add.splice(i, 1); draw(); }); return b; })())));
      // presets
      const pname = h('input', 'input');
      pname.type = 'text';
      pname.maxLength = 40;
      pname.id = 'preset-name';
      pname.placeholder = 'Nome do preset (ex.: Emboscada no porto)';
      pname.value = d.preset;
      pname.addEventListener('input', () => { d.preset = pname.value; });
      const psave = h('button', 'btn btn--ghost btn--sm', 'Salvar preset');
      psave.type = 'button';
      psave.dataset.fid = 'preset-save';
      psave.addEventListener('click', async () => {
        const name = cleanName(pname.value).slice(0, 40);
        if (!name) { pname.focus(); toast('Dê um nome ao preset.'); return; }
        const preset = { id: uid(), name, teams: deep(d.teams), list: fighters.map((f) => (f.foe
          ? { k: 'npc', npcId: f.foe.npcId || '', name: f.foe.name, values: deep(f.foe.values || {}), thumb: f.foe.thumb || '', t: d.map[f.id] }
          : { k: 'chr', id: f.id, t: d.map[f.id] }))
          .concat(d.add.map((x) => ({ k: 'npc', npcId: x.npcId, name: x.name, values: deep(x.values), thumb: x.thumb, t: x.t }))) };
        const next = sceneBase();
        next.presets = [preset].concat(scenePresets().filter((p) => nameKey(p.name) !== nameKey(name))).slice(0, PRESET_MAX);
        await saveScene(next);
        d.preset = '';
        play('ok');
        toast('Preset "' + name + '" salvo.');
        draw();
      });
      const cancel = h('button', 'btn btn--ghost btn--sm', 'Cancelar');
      cancel.type = 'button';
      cancel.addEventListener('click', () => closeDialog(teamsDlg));
      const save = h('button', 'btn btn--ghost btn--sm', 'Salvar times');
      save.type = 'button';
      save.dataset.fid = 'teams-save';
      save.addEventListener('click', () => applyTeams(d, fighters, false));
      const go = h('button', 'btn btn--primary btn--sm', 'Começar combate');
      go.type = 'button';
      go.dataset.fid = 'start-go';
      go.addEventListener('click', () => applyTeams(d, fighters, true));
      const title = h('h2', '', start ? 'Quem luta contra quem?' : 'Times');
      title.id = 'teamsdlg-title';
      teamsDlg.replaceChildren(h('div', 'teamsdlg__body',
        title,
        h('p', 'field__hint', 'Cada time luta contra todos os outros. Dá para mudar os times antes ou durante o combate, e salvar como preset para usar de novo.'),
        h('h3', 'sub-title', 'Times'), h('div', 'teamsdlg__teams', ...teamRows), h('div', '', addTeam),
        h('h3', 'sub-title', 'Quem fica em qual time'),
        who.length ? h('div', 'teamsdlg__list', ...who) : h('p', 'field__hint', 'Ninguém ainda: adicione NPCs ou espere os jogadores vincularem as fichas.'),
        h('h3', 'sub-title', 'Salvar como preset'),
        h('p', 'field__hint', 'Guarda estes times e quem está em cada um. Os presets ficam em "Presets".'),
        h('div', 'teamsdlg__row', pname, psave),
        h('div', 'dialog__actions', cancel, save, sceneOn() ? null : go)));
    };
    // preset no rascunho: times dele; jogadores voltam para o time salvo; NPCs que não estão na arena entram como novos
    const loadPreset = (p) => {
      d.teams = deep(p.teams && p.teams.length ? p.teams : DEFAULT_TEAMS);
      d.add = [];
      const used = new Set();
      (p.list || []).forEach((x) => {
        if (x.k === 'chr') { if (x.id in d.map) d.map[x.id] = x.t; return; }
        const f = fighters.find((y) => y.foe && !used.has(y.id) && nameKey(y.name) === nameKey(x.name));
        if (f) { used.add(f.id); d.map[f.id] = x.t; return; }
        d.add.push({ npcId: x.npcId, name: x.name, values: deep(x.values || {}), thumb: x.thumb || '', t: x.t });
      });
      fixTeams();
    };
    if (preset) loadPreset(preset);
    draw();
    openDialog(teamsDlg);
    if (focusPreset) { const pn = teamsDlg.querySelector('#preset-name'); if (pn) pn.focus(); }
  }

  // espera os NPCs recém-criados chegarem na lista (o banco avisa logo depois de gravar)
  async function waitFoes(ids) {
    for (let i = 0; i < 30 && !ids.every((id) => foes.some((f) => f.id === id)); i++) await new Promise((r) => setTimeout(r, 100));
  }
  async function applyTeams(d, fighters, start) {
    const teams = d.teams.map((t, i) => ({ id: t.id, name: cleanName(t.name).slice(0, 30) || 'Time ' + (i + 1), color: /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : TEAM_COLORS[i % TEAM_COLORS.length] }));
    if (start) {
      const used = new Set(fighters.map((f) => d.map[f.id]).concat(d.add.map((x) => x.t)).filter((t) => t !== 'out'));
      if (used.size < 2) { toast('Ponha lutadores em pelo menos dois times para começar.'); return; }
    }
    closeDialog(teamsDlg);
    try {
      const team = {};
      fighters.forEach((f) => { if (d.map[f.id] !== 'out') team[f.id] = d.map[f.id]; });
      const fresh = [];
      for (const x of d.add) {
        const id = await db.addFoe(currentCamp.id, { npcId: x.npcId, name: x.name.slice(0, 60), values: x.values, thumb: x.thumb, cur: {}, def: null });
        team['foe:' + id] = x.t;
        fresh.push(id);
      }
      const charIds = fighters.filter((f) => !f.foe).map((f) => f.id);
      const next = sceneBase();
      next.teams = teams;
      next.team = team;
      next.pteam = {}; // o mestre decidiu: vale o que está na tela
      next.out = sceneOut().filter((id) => charIds.indexOf(id) < 0).concat(charIds.filter((id) => d.map[id] === 'out'));
      if (sceneOn()) next.out.forEach((id) => dropFromOrder(next, id));
      await saveScene(next);
      if (fresh.length) await waitFoes(fresh);
      if (start) { await beginScene(); return; }
      // com o combate rolando, jogador que voltou entra na ordem com a própria iniciativa
      if (sceneOn()) for (const x of combatants().filter((y) => y.member && !scene.order.some((o) => o.id === y.id))) await joinScene(x);
      toast('Times salvos.');
    } catch (err) { toast(errorMessage(err)); }
  }

  async function startScene() { openTeams(true); }
  async function beginScene() {
    const list = combatants();
    if (!list.length) { toast('Ninguém na arena. Adicione NPCs ou ponha algum jogador num time.'); return; }
    const rolls = list.map(rollInitiative).sort(byInit);
    const name = battle.name.trim().slice(0, 60);
    const next = sceneBase();
    Object.assign(next, { active: true, name, round: 1, turn: 0, order: rolls.map((r) => ({ id: r.id, name: r.name, init: r.init, tie: r.tie })) });
    await saveScene(next);
    await sceneLog('Iniciativa' + (name ? ': ' + name : ''), rolls.map((r, i) => (i + 1) + 'º ' + r.name + ' ' + r.init).join(' · '), rolls[0].init);
    // a defesa da cena é rolada junto com a iniciativa, para quem ainda não tem
    for (const x of list.filter((y) => !y.defRolled)) { try { await rollDefense(x); } catch (err) { toast(errorMessage(err)); } }
    battle.name = '';
    toast('Combate iniciado: ' + rolls[0].name + ' começa.');
  }

  function stepTurn(d) {
    if (!sceneOn()) return;
    if (battle.aim) endAim();
    battle.view = 'main';
    const next = deep(scene);
    const n = next.order.length;
    next.turn += d;
    let lost = [];
    if (next.turn >= n) { next.turn = 0; next.round += 1; lost = tickTags(next); }
    if (next.turn < 0) { if (next.round > 1) { next.turn = n - 1; next.round -= 1; } else next.turn = 0; }
    saveScene(next);
    const cur = next.order[next.turn];
    if (cur && d > 0) toast('Rodada ' + next.round + ' · vez de ' + cur.name + '.');
    if (lost.length) sceneLog('Condições', 'Rodada ' + next.round + ': ' + lost.join(' · '), lost.length);
  }
  async function endScene() {
    const ok = await askConfirm({ title: 'Encerrar a cena?', text: 'A ordem dos turnos e as condições são apagadas. PV, defesa e inimigos continuam como estão.', ok: 'Encerrar' });
    if (!ok) return;
    const rounds = scene ? scene.round : 0;
    const keep = sceneBase();
    await saveScene({ active: false, name: '', round: 0, turn: 0, order: [], out: sceneOut(), teams: keep.teams || null, team: keep.team || {}, pteam: keep.pteam || {}, presets: keep.presets || [], squads: keep.squads || [] });
    await sceneLog('Fim da cena', 'Cena encerrada após ' + plural(rounds, 'rodada', 'rodadas') + '.', rounds);
  }

  /* ---------- Bestiário e itens (só o mestre) ----------
     Bestiário como uma revista de monstros (uma página por criatura), para pôr na arena num time;
     itens para dar direto na mochila de um personagem da campanha. */
  const GMLIB_KINDS = { bestiario: ['npc'], armas: ['arma-melee', 'arma-fogo'], municao: ['municao'], protecao: ['armadura', 'vestivel'], implantes: ['nucleo', 'protese-modulo'], gerais: ['item-geral'] };
  const GMLIB_MAX = 80;
  const NPC_CAT_COLOR = { 'Comum': '#7fa6bf', 'Maior': '#c58b3a', 'Chefão': '#d0453f' };
  let gmlibSeq = 0;
  let gmlibCat = '';
  // Itens: dar direto na mochila de um personagem
  function renderItemsTab() {
    if (!currentCamp || !currentCamp.gm) return;
    runItems();
  }
  async function libFind(kinds, q) {
    // com texto, a lista já vem por relevância; sem texto, fica em ordem alfabética
    const order = (list) => (hasQuery(q) ? list : list.sort((x, y) => x.name.localeCompare(y.name, 'pt-BR')));
    try { const list = await libSearch(kinds, q); return { list: order(list.filter((e) => kinds.indexOf(e.kind) >= 0)), warn: '', suggest: libSearch.suggest }; }
    catch (err) { return { list: rankSearch(BUILTINS.filter((e) => kinds.indexOf(e.kind) >= 0), q, entryFields), warn: errorMessage(err), suggest: '' }; }
  }
  let itemsSeq = 0;
  async function runItems() {
    const kinds = GMLIB_KINDS[$('#gmlib-kind').value] || GMLIB_KINDS.armas;
    const seq = ++itemsSeq;
    const r = await libFind(kinds, $('#gmlib-q').value);
    if (seq !== itemsSeq) return;
    const list = gmFacets.apply(r.list, kinds);
    suggestAfter($('#gmlib-list'), r.suggest, $('#gmlib-q'), runItems);
    const noChars = !members.some((mb) => mb.sheet && mb.sheet.attrs);
    $('#gmlib-list').replaceChildren(...list.slice(0, GMLIB_MAX).map((e) => libRow(e, noChars ? [] : [{ label: 'Dar', cls: 'btn--primary', onClick: () => giveItem(deep(e)) }])));
    gmMulti.paint();
    $('#gmlib-hint').textContent = r.warn || (!list.length ? 'Nada encontrado.'
      : plural(list.length, 'resultado', 'resultados') + (list.length > GMLIB_MAX ? ' (mostrando ' + GMLIB_MAX + '; refine a busca)' : '') + '.'
        + (noChars ? ' Nenhum personagem vinculado para receber itens.' : ' "Dar" abre o grupo para você escolher quem recebe.'));
  }
  // Bestiário: a revista, com filtro por categoria
  async function runBeast() {
    if (!currentCamp || !currentCamp.gm) return;
    const kinds = GMLIB_KINDS.bestiario;
    const seq = ++gmlibSeq;
    const r = await libFind(kinds, $('#beast-q').value);
    if (seq !== gmlibSeq) return;
    let list = r.list;
    suggestAfter($('#gmlib-mag'), r.suggest, $('#beast-q'), runBeast);
    const cats = Array.from(new Set(list.map((e) => (e.values && e.values.categoria) || 'Comum')));
    if (gmlibCat && cats.indexOf(gmlibCat) < 0) gmlibCat = '';
    $('#gmlib-cats').replaceChildren(...(cats.length > 1 ? [''].concat(cats) : []).map((c) => {
      const b = h('button', 'check--pill mag__chip' + (gmlibCat === c ? ' is-on' : ''), c || 'Todas');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(gmlibCat === c));
      if (c) b.style.setProperty('--cat', NPC_CAT_COLOR[c] || 'var(--ambar)');
      b.addEventListener('click', () => { gmlibCat = c; runBeast(); });
      return b;
    }));
    if (gmlibCat) list = list.filter((e) => ((e.values && e.values.categoria) || 'Comum') === gmlibCat);
    list = beastFacets.apply(list, kinds);
    $('#gmlib-mag').replaceChildren(...list.slice(0, GMLIB_MAX).map(magPage));
    $('#beast-hint').textContent = r.warn || (!list.length ? 'Nenhuma criatura encontrada.' : plural(list.length, 'criatura', 'criaturas') + (list.length > GMLIB_MAX ? ' (mostrando ' + GMLIB_MAX + '; refine a busca)' : '') + '.');
  }
  // uma página da revista: capa, categoria, camadas, atributos, ataque, saque e quantas vezes já caiu
  function magPage(e) {
    const v = e.values || {};
    const cat = v.categoria || 'Comum';
    const cover = h('div', 'mag__cover');
    const pic = e.image || e.thumb;
    if (pic) { const img = h('img'); img.src = pic; img.alt = ''; img.loading = 'lazy'; cover.append(img); }
    else cover.append(h('span', 'mag__mono', (e.name || '?').trim().charAt(0).toUpperCase()));
    cover.append(h('span', 'mag__cat', cat), num(v.up) ? h('span', 'mag__up', 'UP ' + num(v.up)) : null);
    const pill = (k, n) => h('span', 'mag__pill mag__pill--' + k, h('b', '', String(n)), ' ' + ({ pv: 'PV', escudo: 'Escudo', blindagem: 'Blind.', def: 'Defesa' })[k]);
    const layers = ['escudo', 'blindagem', 'pv'].filter((k) => num(v[k])).map((k) => pill(k, num(v[k])));
    layers.push(pill('def', num(v.armadura || ARMOR_BASE) + num(v.corpo) + num(v.resistencia)));
    const stat = (k, label) => h('span', 'mag__stat', h('small', '', label), h('b', '', signed(num(v[k]))));
    const atk = [v.ataque, v.arma, v.dano, num(v.cadencia) > 1 ? num(v.cadencia) + ' disparos' : '', v.efetivo ? 'efetivo contra ' + v.efetivo : ''].filter(Boolean).join(' · ');
    const drops = parseDrops(v.saque).map((d) => (d.qty > 1 ? d.qty + '× ' : '') + d.name).concat(num(v.cronos) ? [fmtCronos(num(v.cronos)) + ' Cronos'] : []);
    const kills = fallen.filter((f) => (f.npcId && f.npcId === e.id) || nameKey(f.name) === nameKey(e.name)).length;
    const arena = h('button', 'btn btn--primary btn--sm', 'Pôr na arena');
    arena.type = 'button';
    arena.setAttribute('aria-label', 'Pôr ' + e.name + ' na arena');
    arena.addEventListener('click', () => placeFoe(deep(e)));
    const read = h('button', 'btn btn--ghost btn--sm', 'Ficha completa');
    read.type = 'button';
    read.addEventListener('click', () => openEntry(e));
    const page = h('article', 'mag__page', cover,
      h('div', 'mag__body',
        h('p', 'mag__kicker', 'Ameaça' + (e.oficial ? ' · oficial' : '') + (kills ? ' · derrotado ' + (kills === 1 ? '1 vez' : kills + ' vezes') : '')),
        h('h3', 'mag__title', e.name),
        h('div', 'mag__pills', ...layers),
        h('div', 'mag__stats', stat('corpo', 'Corpo'), stat('precisao', 'Precisão'), stat('essencia', 'Essência'), stat('luta', 'Luta'), stat('mira', 'Mira'), stat('resistencia', 'Resist.')),
        atk ? h('p', 'mag__atk', h('b', '', 'Ataque '), atk) : null,
        v.descricao ? h('p', 'mag__desc', v.descricao) : null,
        v.lore ? h('blockquote', 'mag__lore', v.lore) : null,
        h('p', 'mag__drops', h('b', '', 'Deixa ao cair '), drops.length ? drops.join(', ') : 'nada anotado (edite o campo Saque na Oficina)'),
        h('div', 'mag__foot', read, arena)));
    page.style.setProperty('--cat', NPC_CAT_COLOR[cat] || 'var(--ambar)');
    return page;
  }
  // "Dar": abre os banners do grupo e o item vai para quem for escolhido
  let giveDlg = null;
  function askGiveTo(e) {
    if (!giveDlg) { giveDlg = h('dialog', 'dialog pickchar'); giveDlg.setAttribute('aria-labelledby', 'give-title'); document.body.append(giveDlg); }
    const chars = members.filter((m) => m.sheet && m.sheet.attrs).sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (done) return; done = true; resolve(v); if (giveDlg.open) closeDialog(giveDlg); };
      const cards = chars.map((m) => {
        const art = h('span', 'pickchar__art');
        if (m.thumb) { const img = h('img'); img.src = m.thumb; img.alt = ''; art.append(img); art.classList.add('pickchar__art--img'); }
        else art.textContent = (m.name || '?').trim().charAt(0).toUpperCase();
        const s = m.sheet || {};
        const meta = [m.species, m.origin].filter(Boolean).join(' · ');
        const b = h('button', 'btn btn--sm btn--primary', 'Dar');
        b.type = 'button';
        b.dataset.fid = 'give-' + m.characterId;
        b.setAttribute('aria-label', 'Dar ' + e.name + ' para ' + m.name);
        b.addEventListener('click', () => finish(m));
        const card = h('li', 'pickchar__card', art,
          h('span', 'pickchar__info', h('strong', 'pickchar__name', m.name), h('span', 'pickchar__meta', meta || 'Personagem'),
            h('span', 'pickchar__meta', plural((s.inventory || []).length, 'item na mochila', 'itens na mochila'))), b);
        card.addEventListener('click', (ev) => { if (!ev.target.closest('button')) finish(m); });
        return card;
      });
      const none = h('p', 'field__hint', 'Nenhum personagem com esse nome.');
      none.hidden = true;
      const q = h('input', 'input');
      q.type = 'search';
      q.placeholder = 'Buscar personagem';
      q.setAttribute('aria-label', 'Buscar personagem');
      q.autocomplete = 'off';
      q.addEventListener('input', () => { none.hidden = rankCards(cards, chars, q.value, charFields) > 0; });
      const cancel = h('button', 'btn btn--ghost btn--sm', 'Cancelar');
      cancel.type = 'button';
      cancel.addEventListener('click', () => finish(null));
      const title = h('h2', '', 'Dar ' + e.name);
      title.id = 'give-title';
      giveDlg.onclose = () => { if (!giveDlg.open) finish(null); };
      giveDlg.replaceChildren(h('div', 'pickchar__body', title,
        h('p', 'field__hint', 'Escolha quem recebe. O item vai para a mochila desse personagem.'),
        chars.length > 3 ? q : null, h('ul', 'pickchar__list', ...cards), none, h('div', 'dialog__actions', cancel)));
      openDialog(giveDlg);
      if (chars.length > 3) q.focus();
    });
  }
  // dar vários de uma vez: a mesma pessoa recebe todos
  const gmMulti = multiPick($('#gmlib-list'), { enabled: () => members.some((mb) => mb.sheet && mb.sheet.attrs), label: (n) => 'Dar ' + (n || ''), onConfirm: (list) => giveItems(list) });
  $('#gmlib-list').before(gmMulti.tip);
  $('#gmlib-list').after(gmMulti.bar);
  async function giveItems(list) {
    if (list.length === 1) return giveItem(list[0]);
    const mb = await askGiveTo({ name: list.length + ' itens' });
    if (!mb) return;
    try {
      await patchMemberSheet(mb, (s) => { list.forEach((e) => s.inventory.push(Object.assign(invEntryFrom(e), { src: 'mestre' }))); });
      play('ok');
      toast(list.length + ' itens foram para a mochila de ' + mb.name + '.');
    } catch (err) { toast(errorMessage(err)); }
  }
  async function giveItem(e) {
    const mb = await askGiveTo(e);
    if (!mb) return;
    try {
      await patchMemberSheet(mb, (s) => { s.inventory.push(Object.assign(invEntryFrom(e), { src: 'mestre' })); });
      play('ok');
      toast(e.name + ' foi para a mochila de ' + mb.name + '.');
    } catch (err) { toast(errorMessage(err)); }
  }
  const gmFacets = facetBox(() => runItems());
  $('#gmlib-hint').before(gmFacets.box);
  // a categoria do bestiário já tem os chips coloridos da revista
  const beastFacets = facetBox(() => runBeast(), { skip: ['categoria'] });
  $('#gmlib-cats').after(beastFacets.box);
  $('#gmlib-kind').addEventListener('change', () => { gmFacets.reset(); runItems(); });
  $('#gmlib-q').addEventListener('input', debounce(runItems, 250));
  $('#beast-q').addEventListener('input', debounce(runBeast, 250));

  /* ---------- Saque, armazéns e monstros derrotados ----------
     loot: listas de saque que o mestre entrega ao grupo (todos ou só alguns personagens pegam).
     vaults: armazéns do grupo ou de um personagem, com espaços e carga; o mestre cria ou aprova e abre o acesso.
     fallen: histórico do mestre com quem caiu no combate; um clique deixa o saque da criatura nos drops. */
  let loot = [];
  let vaults = [];
  let fallen = [];
  const LOOT_SRC = { npc: ['💀', 'Corpo'], bau: ['🧰', 'Baú'], caixa: ['📦', 'Caixa'], item: ['🎒', 'Item'], outro: ['✨', 'Outro'] };
  const VAULT_SLOTS_MAX = 120;
  const lootSel = {}; // lista -> uid do item escolhido na grade
  const charName = (id) => { const mb = members.find((m) => m.characterId === id); return mb ? mb.name : 'alguém que saiu'; };
  const lootFor = (l, charId) => !(l.who || []).length || (l.who || []).indexOf(charId) >= 0;
  const lootEmpty = (l) => !(l.items || []).length && !num(l.cronos);
  const vaultOwnerOk = (v) => !v.ownerCharId || members.some((m) => m.mine && m.characterId === v.ownerCharId);
  const vaultUsable = (v) => Boolean(currentCamp && (currentCamp.gm || (v.approved && v.open && vaultOwnerOk(v))));
  const vaultCarga = (v) => (v.items || []).reduce((t, x) => t + parseCarga((x.values || {}).carga) * (x.qty || 1), 0);
  function vaultFits(v, it) {
    if ((v.items || []).length + 1 > num(v.slots)) return v.name + ' não tem espaço livre (' + num(v.slots) + ' espaços).';
    const add = parseCarga((it.values || {}).carga) * (it.qty || 1);
    if (num(v.carga) > 0 && vaultCarga(v) + add > num(v.carga) + 1e-9) return v.name + ' não aguenta essa carga (' + fmtNum(vaultCarga(v)) + ' de ' + fmtNum(num(v.carga)) + ').';
    return '';
  }
  async function saveCol(col, id, patch) {
    try { await db.updateDoc(currentCamp.id, col, id, patch); return true; }
    catch (err) { toast(errorMessage(err)); return false; }
  }

  // "Pistola improvisada", "Kit médico x2" ou "2x Sucata": vira { name, qty }
  function parseDrops(text) {
    return String(text || '').split(/\n|;/).map((l) => l.trim()).filter(Boolean).map((l) => {
      let m = l.match(/^(.*?)\s*[x×]\s*(\d+)$/i);
      if (m) return { name: m[1].trim(), qty: clamp(num(m[2]), 1, 99) };
      m = l.match(/^(\d+)\s*[x×]?\s+(.*)$/i);
      if (m) return { name: m[2].trim(), qty: clamp(num(m[1]), 1, 99) };
      return { name: l, qty: 1 };
    }).filter((d) => d.name).slice(0, 30);
  }
  // acha o item pelo nome no banco; se não existir, vira um item geral com esse nome
  async function dropEntry(d, from) {
    let found = null;
    try { found = (await libSearch(INVENTORY_KINDS, d.name)).find((e) => nameKey(e.name) === nameKey(d.name)); } catch (err) { /* sem banco: usa os prontos */ }
    found = found || BUILTINS.find((e) => INVENTORY_KINDS.indexOf(e.kind) >= 0 && nameKey(e.name) === nameKey(d.name));
    const base = found ? deep(found) : { kind: 'item-geral', name: d.name.slice(0, 80), values: { raridade: 'Comum', carga: '1', efeito: 'Saque de ' + from + '.' } };
    return Object.assign(invEntryFrom(base), { qty: d.qty, src: 'saque' });
  }

  // números nas abas: o que espera alguém (saque para pegar, pedidos de armazém, derrotados sem drop)
  function tabBadges() {
    if (!currentCamp) return;
    const gm = Boolean(currentCamp.gm);
    const set = (id, n, title) => { const el = $(id); el.hidden = !n; el.textContent = n > 99 ? '99+' : String(n || ''); el.title = n ? title : ''; };
    const mine = members.filter((m) => m.mine && m.sheet && m.sheet.attrs);
    const lootN = gm ? vaults.filter((v) => !v.approved).length : loot.filter((l) => !lootEmpty(l) && mine.some((m) => lootFor(l, m.characterId))).length;
    set('#ctab-saque-n', lootN, gm ? 'Pedidos de armazém esperando você' : 'Saque para pegar');
    set('#ctab-bestiario-n', gm ? fallen.filter((f) => !f.lootId && (parseDrops((f.values || {}).saque).length || num((f.values || {}).cronos))).length : 0, 'Derrotados com saque para deixar nos drops');
    set('#ctab-grupo-n', members.length, 'Personagens no grupo');
  }
  function renderLootTab() {
    if (!currentCamp) return;
    const gm = Boolean(currentCamp.gm);
    $('#loot-new').hidden = !gm;
    renderFallen();
    renderLoot();
    renderVaults();
  }

  /* ---- Monstros derrotados (só o mestre) ---- */
  const fallenSeen = new Set();
  let fallenReady = false; // só registra depois de ler o histórico (senão regrava quem já estava lá)
  function trackFallen(list) {
    if (!currentCamp || !currentCamp.gm || !fallenReady) return;
    list.forEach((f) => {
      const st = lifeState(foeLayers(f));
      if ((st !== 'morto' && st !== 'fora de combate') || fallenSeen.has(f.id) || fallen.some((x) => x.id === f.id)) return;
      fallenSeen.add(f.id);
      db.addDoc(currentCamp.id, 'fallen', { foeId: f.id, npcId: f.npcId || '', name: f.name, values: deep(f.values || {}), thumb: f.thumb || '',
        scene: (scene && scene.name) || '', state: st, lootId: '' }, f.id).catch((err) => console.warn(err));
    });
  }
  function renderFallen() {
    const gm = Boolean(currentCamp && currentCamp.gm);
    $('#fallen-block').hidden = !gm || !fallen.length;
    tabBadges();
    if (!gm) return;
    const list = fallen.slice().reverse();
    $('#fallen-all').hidden = !list.some((f) => !f.lootId);
    $('#fallen-clear').hidden = !list.length;
    $('#fallen-list').replaceChildren(...list.map((f) => {
      const v = f.values || {};
      const drops = parseDrops(v.saque);
      const has = drops.length || num(v.cronos);
      const btn = h('button', 'btn btn--sm ' + (f.lootId ? 'btn--ghost' : 'btn--primary'), f.lootId ? 'Tirar dos drops' : 'Deixar nos drops');
      btn.type = 'button';
      btn.dataset.fid = 'fallen-drop-' + f.id;
      btn.disabled = !f.lootId && !has;
      btn.addEventListener('click', () => (f.lootId ? undropFallen(f) : dropFallen(f)));
      const del = h('button', 'btn btn--ghost btn--sm', 'Apagar');
      del.type = 'button';
      del.setAttribute('aria-label', 'Apagar ' + f.name + ' do histórico');
      del.addEventListener('click', () => db.removeDoc(currentCamp.id, 'fallen', f.id).catch((err) => toast(errorMessage(err))));
      const when = [f.state === 'morto' ? 'morto' : 'fora de combate', f.scene ? 'em ' + f.scene : '', f.createdAt ? formatTime(f.createdAt) : ''].filter(Boolean).join(' · ');
      const what = has ? 'Deixa: ' + drops.map((d) => (d.qty > 1 ? d.qty + '× ' : '') + d.name).concat(num(v.cronos) ? [fmtCronos(num(v.cronos)) + ' Cronos'] : []).join(', ') : 'Sem saque anotado no bestiário.';
      return h('li', 'row fallen__row' + (f.lootId ? ' is-dropped' : ''), h('span', 'row__open row__open--static', avatar(f.name, 'criatura', f.thumb),
        h('span', 'row__main', h('span', 'row__title', f.name, f.lootId ? h('span', 'tag tag--on', 'nos drops') : null), h('span', 'row__meta', when), h('span', 'row__meta', what))), btn, del);
    }));
  }
  async function dropFallen(f) {
    const v = f.values || {};
    const items = await Promise.all(parseDrops(v.saque).map((d) => dropEntry(d, f.name)));
    try {
      const id = await db.addDoc(currentCamp.id, 'loot', { name: 'Corpo de ' + f.name, src: { kind: 'npc', name: f.name, thumb: f.thumb || '' }, items, cronos: num(v.cronos), who: [], fallenId: f.id, log: [] });
      await db.updateDoc(currentCamp.id, 'fallen', f.id, { lootId: id });
      play('ok');
      toast('O saque de ' + f.name + ' está nos drops do grupo.');
    } catch (err) { toast(errorMessage(err)); }
  }
  async function undropFallen(f) {
    try {
      if (loot.some((l) => l.id === f.lootId)) await db.removeDoc(currentCamp.id, 'loot', f.lootId);
      await db.updateDoc(currentCamp.id, 'fallen', f.id, { lootId: '' });
      toast('O saque de ' + f.name + ' saiu dos drops.');
    } catch (err) { toast(errorMessage(err)); }
  }
  $('#fallen-all').addEventListener('click', async () => {
    const todo = fallen.filter((f) => !f.lootId && (parseDrops((f.values || {}).saque).length || num((f.values || {}).cronos)));
    for (const f of todo) await dropFallen(f); // eslint-disable-line no-await-in-loop
  });
  $('#fallen-clear').addEventListener('click', async () => {
    if (!(await askConfirm({ title: 'Limpar histórico', text: 'Apaga a lista de monstros derrotados. O saque que já está nos drops continua lá.', ok: 'Limpar' }))) return;
    for (const f of fallen.slice()) await db.removeDoc(currentCamp.id, 'fallen', f.id).catch(() => {}); // eslint-disable-line no-await-in-loop
  });

  /* ---- Grade de itens (saque e armazém): como o inventário de um inimigo ou de um baú ---- */
  function lootGrid(items, slots, selUid, onPick) {
    const cells = items.map((x) => {
      const cell = h('div', 'cell cell--full' + (x.uid === selUid ? ' is-picked' : ''));
      const color = rarColor((x.values || {}).raridade);
      if (color) cell.style.setProperty('--rar', color);
      const face = h('button', 'cell__face', entryIcon(x), (x.qty || 1) > 1 ? h('span', 'cell__qty', '×' + x.qty) : null, h('span', 'cell__label', x.name));
      face.type = 'button';
      face.dataset.fid = 'lootcell-' + x.uid;
      face.setAttribute('aria-pressed', String(x.uid === selUid));
      face.setAttribute('aria-label', x.name + ((x.qty || 1) > 1 ? ' ×' + x.qty : '') + '. Ver e pegar.');
      face.addEventListener('click', () => onPick(x.uid === selUid ? '' : x.uid));
      cell.append(face);
      return cell;
    });
    const free = Math.max(0, Math.min(slots, VAULT_SLOTS_MAX) - items.length);
    for (let k = 0; k < free; k++) cells.push(h('div', 'cell cell--empty'));
    const row = 8;
    const pad = (row - (cells.length % row)) % row;
    for (let k = 0; k < pad && cells.length < row; k++) cells.push(h('div', 'cell cell--locked'));
    return h('div', 'bag lootbox__grid', ...cells);
  }
  function pickPanel(it, actions) {
    if (!it) return h('p', 'lootbox__pick lootbox__pick--none', 'Toque num item da grade para ver o que é.');
    const btns = actions.filter(Boolean).map((a) => {
      const b = h('button', 'btn btn--sm ' + (a.cls || 'btn--ghost'), a.label);
      b.type = 'button';
      if (a.fid) b.dataset.fid = a.fid;
      b.disabled = Boolean(a.off);
      b.addEventListener('click', a.on);
      return b;
    });
    return h('div', 'lootbox__pick', entryIcon(it), h('span', 'lootbox__pickmain', h('strong', '', it.name, (it.qty || 1) > 1 ? ' ×' + it.qty : ''), h('span', 'row__meta', entryMeta(it))), h('span', 'lootbox__pickbtns', ...btns));
  }

  /* ---- Saque ---- */
  function renderLoot() {
    const gm = Boolean(currentCamp && currentCamp.gm);
    const me = playing();
    const mine = members.filter((m) => m.mine && m.sheet && m.sheet.attrs);
    const list = gm ? loot : loot.filter((l) => !lootEmpty(l) && mine.some((m) => lootFor(l, m.characterId)));
    $('#loot-hint').textContent = gm
      ? (loot.length ? 'Os jogadores veem estas listas na aba "Saque e armazém" e pegam o que é deles. "Quem pega" define se é o grupo todo ou só alguns.' : 'Nenhuma lista de saque. Crie uma ou deixe os drops de um monstro derrotado.')
      : (list.length ? 'Pegue com o personagem escolhido em "Jogando como"' + (me ? ' (' + me.name + ')' : '') + '. Dá também para guardar direto num armazém.' : 'Nada para pegar agora. Quando o mestre deixar um saque para vocês, ele aparece aqui.');
    $('#loot-list').replaceChildren(...list.map((l) => lootCard(l, gm, me)));
    tabBadges();
  }
  function lootCard(l, gm, me) {
    const items = l.items || [];
    const src = LOOT_SRC[(l.src && l.src.kind) || 'outro'] || LOOT_SRC.outro;
    const art = h('span', 'lootbox__art');
    if (l.src && l.src.thumb) { const img = h('img'); img.src = l.src.thumb; img.alt = ''; art.append(img); }
    else art.textContent = src[0];
    const who = (l.who || []).length ? 'Só para ' + l.who.map(charName).join(', ') : 'Para o grupo todo';
    const can = me && lootFor(l, me.characterId);
    const sel = items.find((x) => x.uid === lootSel[l.id]) || null;
    const redraw = () => renderLoot();
    const pickTo = (uid) => { lootSel[l.id] = uid; redraw(); };
    const usable = vaults.filter(vaultUsable);
    const acts = gm
      ? [{ label: 'Tirar da lista', fid: 'loot-del-item', on: () => dropLootItem(l, sel) }]
      : [{ label: can ? 'Pegar' : 'Não é para ' + (me ? me.name : 'você'), cls: 'btn--primary', fid: 'loot-take', off: !can, on: () => takeLoot(l, sel, me) },
        usable.length ? { label: 'Guardar no armazém', fid: 'loot-stash', off: !can, on: () => stashLoot(l, sel, usable) } : null];
    const foot = [];
    const btn = (label, cls, fn, fid) => { const b = h('button', 'btn btn--sm ' + cls, label); b.type = 'button'; if (fid) b.dataset.fid = fid; b.addEventListener('click', fn); foot.push(b); return b; };
    if (gm) {
      btn('+ Item', 'btn--ghost', () => addLootItem(l), 'loot-add-' + l.id);
      btn('+ Cronos', 'btn--ghost', () => setLootCronos(l));
      btn('Quem pega', 'btn--ghost', async () => { const w = await askWho(l.who || [], 'Quem pode pegar: ' + l.name); if (w) saveCol('loot', l.id, { who: w }); }, 'loot-who-' + l.id);
      btn('Apagar lista', 'btn--ghost', () => removeLoot(l));
    } else {
      if (items.length && can) btn('Pegar tudo', 'btn--primary', () => takeAll(l, me), 'loot-all-' + l.id);
      if (num(l.cronos) && can) btn('Pegar ' + fmtCronos(num(l.cronos)) + ' Cronos', 'btn--ghost', () => takeCronos(l, me), 'loot-cronos-' + l.id);
    }
    const log = (l.log || []).slice(0, 3).map((x) => h('li', '', x.text));
    const card = h('article', 'lootbox' + (lootEmpty(l) ? ' is-empty' : ''),
      h('header', 'lootbox__head', art, h('span', 'lootbox__title', h('strong', '', l.name), h('span', 'row__meta', ((l.src && l.src.label) || src[1]) + (l.src && l.src.name && l.src.name !== l.name ? ': ' + l.src.name : '') + ' · ' + who)),
        num(l.cronos) ? h('span', 'tag tag--on', fmtCronos(num(l.cronos)) + ' Cronos') : null),
      items.length ? lootGrid(items, 0, lootSel[l.id], pickTo) : h('p', 'field__hint', lootEmpty(l) ? 'Vazia: já pegaram tudo.' : 'Sem itens, só Cronos.'),
      items.length ? pickPanel(sel, acts) : null,
      foot.length ? h('div', 'lootbox__foot', ...foot) : null,
      log.length ? h('ul', 'lootbox__log', ...log) : null);
    card.dataset.fid = 'loot-' + l.id;
    return card;
  }
  const lootLog = (l, text) => [{ t: Date.now(), text }].concat(l.log || []).slice(0, 10);
  const freshLoot = (l) => loot.find((x) => x.id === l.id) || l;
  async function takeLoot(l, it, me) {
    if (!it || !me) return;
    const cur = freshLoot(l);
    if (!(cur.items || []).some((x) => x.uid === it.uid)) { toast('Alguém já pegou esse item.'); return; }
    if (!(await saveCol('loot', l.id, { items: cur.items.filter((x) => x.uid !== it.uid), log: lootLog(cur, me.name + ' pegou ' + it.name + '.') }))) return;
    try {
      await patchMemberSheet(me, (s) => { s.inventory.push(Object.assign(deep(it), { uid: uid(), slot: '', src: 'saque' })); });
      lootSel[l.id] = '';
      play('ok');
      toast(it.name + ' foi para a mochila de ' + me.name + '.');
    } catch (err) {
      await saveCol('loot', l.id, { items: (freshLoot(l).items || []).concat([it]) }); // devolve
      toast(errorMessage(err));
    }
  }
  async function takeAll(l, me) {
    const cur = freshLoot(l);
    const items = cur.items || [];
    if (!items.length || !me) return;
    const cr = num(cur.cronos);
    if (!(await saveCol('loot', l.id, { items: [], cronos: 0, log: lootLog(cur, me.name + ' pegou tudo.') }))) return;
    try {
      await patchMemberSheet(me, (s) => {
        items.forEach((it) => s.inventory.push(Object.assign(deep(it), { uid: uid(), slot: '', src: 'saque' })));
        if (cr) { s.money = Object.assign({}, s.money); s.money[currentCamp.id] = num(s.money[currentCamp.id]) + cr; }
      });
      play('ok');
      toast(me.name + ' pegou ' + plural(items.length, 'item', 'itens') + (cr ? ' e ' + fmtCronos(cr) + ' Cronos' : '') + '.');
    } catch (err) { await saveCol('loot', l.id, { items, cronos: cr }); toast(errorMessage(err)); }
  }
  async function takeCronos(l, me) {
    const cur = freshLoot(l);
    const cr = num(cur.cronos);
    if (!cr || !me) return;
    if (!(await saveCol('loot', l.id, { cronos: 0, log: lootLog(cur, me.name + ' pegou ' + fmtCronos(cr) + ' Cronos.') }))) return;
    try {
      await patchMemberSheet(me, (s) => { s.money = Object.assign({}, s.money); s.money[currentCamp.id] = num(s.money[currentCamp.id]) + cr; });
      toast(me.name + ' pegou ' + fmtCronos(cr) + ' Cronos.');
    } catch (err) { await saveCol('loot', l.id, { cronos: cr }); toast(errorMessage(err)); }
  }
  async function stashLoot(l, it, usable) {
    if (!it) return;
    const id = usable.length === 1 ? usable[0].id : await askChoice('Guardar ' + it.name, 'Armazém', 'O item sai do saque e vai direto para o armazém.', usable.map((v) => [v.id, v.name + ' (' + (v.items || []).length + '/' + num(v.slots) + ')']), 'Guardar');
    const v = vaults.find((x) => x.id === id);
    if (!v) return;
    const cur = freshLoot(l);
    if (!(cur.items || []).some((x) => x.uid === it.uid)) { toast('Alguém já pegou esse item.'); return; }
    const full = vaultFits(v, it);
    if (full) { toast(full); return; }
    const who = playing();
    if (!(await saveCol('vaults', v.id, { items: (v.items || []).concat([Object.assign(deep(it), { slot: '' })]), log: lootLog(v, (who ? who.name : 'Alguém') + ' guardou ' + it.name + '.') }))) return;
    await saveCol('loot', l.id, { items: cur.items.filter((x) => x.uid !== it.uid), log: lootLog(cur, (who ? who.name : 'Alguém') + ' guardou ' + it.name + ' em ' + v.name + '.') });
    lootSel[l.id] = '';
    toast(it.name + ' foi para ' + v.name + '.');
  }
  async function addLootItem(l) {
    const picked = await openPickerMany({ title: 'Item para ' + l.name, kinds: INVENTORY_KINDS, chips: ['Saque'] });
    if (!picked.length) return;
    const cur = freshLoot(l);
    const room = 60 - (cur.items || []).length;
    if (room <= 0) { toast('Uma lista de saque guarda até 60 itens.'); return; }
    if (picked.length > room) toast('Uma lista de saque guarda até 60 itens: entraram só ' + room + ' de ' + picked.length + '.');
    await saveCol('loot', l.id, { items: (cur.items || []).concat(picked.slice(0, room).map((e) => Object.assign(invEntryFrom(e), { src: 'saque' }))) });
  }
  async function dropLootItem(l, it) {
    if (!it) return;
    const cur = freshLoot(l);
    await saveCol('loot', l.id, { items: (cur.items || []).filter((x) => x.uid !== it.uid) });
    lootSel[l.id] = '';
  }
  let numDlg = null;
  function askNumber(titleText, label, value) {
    if (!numDlg) { numDlg = h('dialog', 'dialog startdlg'); numDlg.setAttribute('aria-labelledby', 'num-title'); document.body.append(numDlg); }
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (done) return; done = true; resolve(v); if (numDlg.open) closeDialog(numDlg); };
      const inp = h('input', 'input');
      inp.type = 'number';
      inp.min = '0';
      inp.step = '1';
      inp.id = 'num-input';
      inp.value = String(value);
      const lab = h('label', 'field__label', label);
      lab.htmlFor = inp.id;
      const ok = h('button', 'btn btn--primary btn--sm', 'Salvar');
      ok.type = 'submit';
      const cancel = h('button', 'btn btn--ghost btn--sm', 'Cancelar');
      cancel.type = 'button';
      cancel.addEventListener('click', () => finish(null));
      const form = h('form', 'startdlg__body', h('h2', '', titleText), lab, inp, h('div', 'dialog__actions', cancel, ok));
      form.querySelector('h2').id = 'num-title';
      form.addEventListener('submit', (ev) => { ev.preventDefault(); finish(Math.max(0, Math.round(num(inp.value)))); });
      numDlg.onclose = () => { if (!numDlg.open) finish(null); };
      numDlg.replaceChildren(form);
      openDialog(numDlg);
      inp.select();
    });
  }
  async function setLootCronos(l) {
    const n = await askNumber('Cronos em ' + l.name, 'Cronos que o grupo pega nesta lista', num(freshLoot(l).cronos));
    if (n !== null) await saveCol('loot', l.id, { cronos: n });
  }
  async function removeLoot(l) {
    if (!lootEmpty(l) && !(await askConfirm({ title: 'Apagar ' + l.name, text: 'O que ainda está na lista some para todos.', ok: 'Apagar' }))) return;
    try {
      await db.removeDoc(currentCamp.id, 'loot', l.id);
      if (l.fallenId && fallen.some((f) => f.id === l.fallenId)) await db.updateDoc(currentCamp.id, 'fallen', l.fallenId, { lootId: '' });
    } catch (err) { toast(errorMessage(err)); }
  }

  // quem pode pegar: o grupo todo ou só alguns personagens
  let whoDlg = null;
  function askWho(current, titleText) {
    if (!whoDlg) { whoDlg = h('dialog', 'dialog startdlg'); whoDlg.setAttribute('aria-labelledby', 'who-title'); document.body.append(whoDlg); }
    const chars = members.filter((m) => m.sheet && m.sheet.attrs);
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (done) return; done = true; resolve(v); if (whoDlg.open) closeDialog(whoDlg); };
      const all = h('input');
      all.type = 'checkbox';
      all.id = 'who-all';
      all.checked = !current.length;
      const boxes = chars.map((m) => {
        const c = h('input');
        c.type = 'checkbox';
        c.value = m.characterId;
        c.checked = current.indexOf(m.characterId) >= 0;
        c.disabled = all.checked;
        return h('label', 'check', c, h('span', '', m.name));
      });
      all.addEventListener('change', () => boxes.forEach((b) => { b.firstChild.disabled = all.checked; }));
      const ok = h('button', 'btn btn--primary btn--sm', 'Salvar');
      ok.type = 'submit';
      const cancel = h('button', 'btn btn--ghost btn--sm', 'Cancelar');
      cancel.type = 'button';
      cancel.addEventListener('click', () => finish(null));
      const form = h('form', 'startdlg__body', h('h2', '', titleText), h('label', 'check', all, h('span', '', 'O grupo todo')),
        h('p', 'field__hint', 'Ou marque só quem pode pegar:'), h('div', 'who__list', ...boxes), h('div', 'dialog__actions', cancel, ok));
      form.querySelector('h2').id = 'who-title';
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const pick = all.checked ? [] : boxes.map((b) => b.firstChild).filter((c) => c.checked).map((c) => c.value);
        if (!all.checked && !pick.length) { toast('Marque alguém ou "O grupo todo".'); return; }
        finish(pick);
      });
      whoDlg.onclose = () => { if (!whoDlg.open) finish(null); };
      whoDlg.replaceChildren(form);
      openDialog(whoDlg);
    });
  }

  // nova lista de saque: nome, de onde vem, quem pega e Cronos; os itens entram depois pelo "+ Item"
  let lootDlg = null;
  $('#loot-new').addEventListener('click', () => {
    if (!lootDlg) { lootDlg = h('dialog', 'dialog startdlg'); lootDlg.setAttribute('aria-labelledby', 'lootnew-title'); document.body.append(lootDlg); }
    const name = h('input', 'input');
    name.id = 'lootnew-name';
    name.maxLength = 60;
    name.placeholder = 'Ex.: Baú do laboratório';
    const kind = h('select', 'input');
    kind.id = 'lootnew-kind';
    Object.keys(LOOT_SRC).forEach((k) => { const o = h('option', '', LOOT_SRC[k][0] + ' ' + LOOT_SRC[k][1]); o.value = k; kind.append(o); });
    kind.value = 'bau';
    // "Outro": a lista vira um campo de texto livre
    const other = h('input', 'input');
    other.id = 'lootnew-other';
    other.maxLength = 40;
    other.placeholder = 'Digite o texto';
    other.hidden = true;
    const back = h('button', 'btn btn--ghost btn--sm', 'Voltar à lista');
    back.type = 'button';
    back.hidden = true;
    const srcMode = (free) => {
      kind.hidden = free;
      other.hidden = !free;
      back.hidden = !free;
      if (free) other.focus();
      else { kind.value = 'bau'; kind.focus(); }
      srcLab.htmlFor = free ? other.id : kind.id;
    };
    kind.addEventListener('change', () => { if (kind.value === 'outro') srcMode(true); });
    back.addEventListener('click', () => srcMode(false));
    const cr = h('input', 'input');
    cr.id = 'lootnew-cronos';
    cr.type = 'number';
    cr.min = '0';
    cr.value = '0';
    let who = [];
    const whoBtn = h('button', 'btn btn--ghost btn--sm', 'Quem pega: o grupo todo');
    whoBtn.type = 'button';
    whoBtn.addEventListener('click', async () => {
      const w = await askWho(who, 'Quem pode pegar');
      if (w) { who = w; whoBtn.textContent = 'Quem pega: ' + (w.length ? w.map(charName).join(', ') : 'o grupo todo'); }
      openDialog(lootDlg);
    });
    const lab = (t, el) => { const l = h('label', 'field__label', t); l.htmlFor = el.id; return h('div', 'field', l, el); };
    const srcLab = h('label', 'field__label', 'De onde vem');
    srcLab.htmlFor = kind.id;
    const ok = h('button', 'btn btn--primary btn--sm', 'Criar e pôr itens');
    ok.type = 'submit';
    ok.dataset.fid = 'lootnew-ok';
    const cancel = h('button', 'btn btn--ghost btn--sm', 'Cancelar');
    cancel.type = 'button';
    cancel.addEventListener('click', () => closeDialog(lootDlg));
    const form = h('form', 'startdlg__body', h('h2', '', 'Nova lista de saque'),
      h('p', 'field__hint', 'O grupo vê a lista como o inventário de onde o saque veio (um corpo, um baú, uma caixa).'),
      lab('Nome', name), h('div', 'field', srcLab, kind, h('div', 'lootnew__other', other, back)), lab('Cronos', cr), whoBtn, h('div', 'dialog__actions', cancel, ok));
    form.querySelector('h2').id = 'lootnew-title';
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const label = kind.value === 'outro' ? cleanName(other.value).slice(0, 40) : '';
      if (kind.value === 'outro' && !label) { toast('Diga de onde vem o saque.'); other.focus(); return; }
      const n = cleanName(name.value).slice(0, 60) || label || LOOT_SRC[kind.value][1];
      closeDialog(lootDlg);
      try {
        const id = await db.addDoc(currentCamp.id, 'loot', { name: n, src: { kind: kind.value, name: n, thumb: '', label }, items: [], cronos: Math.max(0, Math.round(num(cr.value))), who, fallenId: '', log: [] });
        const l = loot.find((x) => x.id === id) || { id, name: n, items: [] };
        addLootItem(l);
      } catch (err) { toast(errorMessage(err)); }
    });
    lootDlg.replaceChildren(form);
    openDialog(lootDlg);
    name.focus();
  });

  /* ---- Armazéns ---- */
  function renderVaults() {
    const gm = Boolean(currentCamp && currentCamp.gm);
    const mine = members.filter((m) => m.mine && m.sheet && m.sheet.attrs);
    const list = gm ? vaults : vaults.filter((v) => vaultOwnerOk(v) || (!v.ownerCharId));
    $('#vault-new').hidden = !gm && !mine.length;
    $('#vault-new').textContent = gm ? 'Novo armazém' : 'Pedir um armazém';
    $('#vault-hint').textContent = gm
      ? 'O armazém do grupo ou de um personagem guarda itens fora da mochila. Você define os espaços e a carga, e quando os jogadores têm acesso. Pedidos de jogadores esperam a sua aprovação.'
      : (list.length ? 'Você mexe num armazém quando o mestre libera o acesso.' : 'Nenhum armazém ainda. Peça um ao mestre; ele aprova e diz quando vocês têm acesso.');
    $('#vault-list').replaceChildren(...list.map((v) => vaultCard(v, gm)));
    renderCampArmory();
    tabBadges();
  }
  function vaultCard(v, gm) {
    const items = v.items || [];
    const usable = vaultUsable(v);
    const state = !v.approved ? ['Aguardando o mestre', 'tag--foe'] : v.open ? ['Acesso liberado', 'tag--on'] : ['Fechado pelo mestre', ''];
    const sel = items.find((x) => x.uid === lootSel['v' + v.id]) || null;
    const pickTo = (uid) => { lootSel['v' + v.id] = uid; renderVaults(); };
    const me = playing();
    const cap = (v.items || []).length + '/' + num(v.slots) + ' espaços' + (num(v.carga) > 0 ? ' · carga ' + fmtNum(vaultCarga(v)) + '/' + fmtNum(num(v.carga)) : '');
    const foot = [];
    const btn = (label, cls, fn, fid) => { const b = h('button', 'btn btn--sm ' + cls, label); b.type = 'button'; if (fid) b.dataset.fid = fid; b.addEventListener('click', fn); foot.push(b); return b; };
    if (gm) {
      if (!v.approved) {
        btn('Aprovar', 'btn--primary', () => saveCol('vaults', v.id, { approved: true, open: true }), 'vault-approve-' + v.id);
        btn('Recusar', 'btn--ghost', () => db.removeDoc(currentCamp.id, 'vaults', v.id).catch((err) => toast(errorMessage(err))));
      } else {
        btn(v.open ? 'Fechar acesso' : 'Liberar acesso', v.open ? 'btn--ghost' : 'btn--primary', () => saveCol('vaults', v.id, { open: !v.open }), 'vault-open-' + v.id);
        btn('+ Item', 'btn--ghost', () => vaultAddItem(v));
      }
      btn('Capacidade', 'btn--ghost', () => vaultForm(v));
      btn('Apagar', 'btn--ghost', async () => { if (await askConfirm({ title: 'Apagar ' + v.name, text: items.length ? 'Os ' + items.length + ' itens guardados somem junto.' : 'O armazém está vazio.', ok: 'Apagar' })) db.removeDoc(currentCamp.id, 'vaults', v.id).catch((err) => toast(errorMessage(err))); });
    } else if (usable) {
      btn('Guardar da mochila', 'btn--primary', () => vaultDeposit(v), 'vault-put-' + v.id);
    } else if (!v.approved && v.createdBy === db.uid) {
      btn('Cancelar pedido', 'btn--ghost', () => db.removeDoc(currentCamp.id, 'vaults', v.id).catch((err) => toast(errorMessage(err))));
    }
    const acts = usable ? [{ label: me || gm ? 'Tirar para a mochila' + (me ? ' de ' + me.name : '') : 'Tirar', cls: 'btn--primary', fid: 'vault-take', off: !me, on: () => vaultWithdraw(v, sel, me) },
      gm ? { label: 'Jogar fora', on: () => saveCol('vaults', v.id, { items: items.filter((x) => x.uid !== sel.uid) }) } : null] : [];
    const art = h('span', 'lootbox__art', v.ownerCharId ? '🎒' : '🏚️');
    const card = h('article', 'lootbox vaultbox' + (usable ? '' : ' is-locked'),
      h('header', 'lootbox__head', art, h('span', 'lootbox__title', h('strong', '', v.name), h('span', 'row__meta', (v.ownerCharId ? 'De ' + charName(v.ownerCharId) : 'Do grupo') + ' · ' + cap)), h('span', 'tag ' + state[1], state[0])),
      usable || gm ? lootGrid(items, num(v.slots), lootSel['v' + v.id], pickTo) : h('p', 'field__hint', !v.approved ? 'O mestre ainda vai aprovar este armazém.' : 'O mestre fechou o acesso por enquanto.'),
      (usable || gm) && items.length ? pickPanel(sel, acts) : null,
      foot.length ? h('div', 'lootbox__foot', ...foot) : null);
    card.dataset.fid = 'vault-' + v.id;
    return card;
  }
  async function vaultDeposit(v) {
    const me = playing();
    if (!me) { toast('Escolha um personagem seu em "Jogando como".'); return; }
    const bag = (me.sheet.inventory || []).filter((x) => !x.slot);
    if (!bag.length) { toast('A mochila de ' + me.name + ' está vazia.'); return; }
    const u = await askChoice('Guardar em ' + v.name, 'Item da mochila de ' + me.name, (v.items || []).length + ' de ' + num(v.slots) + ' espaços usados.', bag.map((x) => [x.uid, x.name + ((x.qty || 1) > 1 ? ' ×' + x.qty : '')]), 'Guardar');
    const it = bag.find((x) => x.uid === u);
    if (!it) return;
    const cur = vaults.find((x) => x.id === v.id) || v;
    const full = vaultFits(cur, it);
    if (full) { toast(full); return; }
    if (!(await saveCol('vaults', v.id, { items: (cur.items || []).concat([Object.assign(deep(it), { slot: '' })]), log: lootLog(cur, me.name + ' guardou ' + it.name + '.') }))) return;
    try {
      await patchMemberSheet(me, (s) => { s.inventory = s.inventory.filter((x) => x.uid !== it.uid); });
      toast(it.name + ' foi para ' + v.name + '.');
    } catch (err) {
      await saveCol('vaults', v.id, { items: ((vaults.find((x) => x.id === v.id) || v).items || []).filter((x) => x.uid !== it.uid) });
      toast(errorMessage(err));
    }
  }
  async function vaultWithdraw(v, it, me) {
    if (!it || !me) return;
    const cur = vaults.find((x) => x.id === v.id) || v;
    if (!(cur.items || []).some((x) => x.uid === it.uid)) { toast('Esse item já saiu do armazém.'); return; }
    if (!(await saveCol('vaults', v.id, { items: cur.items.filter((x) => x.uid !== it.uid), log: lootLog(cur, me.name + ' tirou ' + it.name + '.') }))) return;
    try {
      await patchMemberSheet(me, (s) => { s.inventory.push(Object.assign(deep(it), { slot: '' })); });
      lootSel['v' + v.id] = '';
      toast(it.name + ' foi para a mochila de ' + me.name + '.');
    } catch (err) { await saveCol('vaults', v.id, { items: ((vaults.find((x) => x.id === v.id) || v).items || []).concat([it]) }); toast(errorMessage(err)); }
  }
  async function vaultAddItem(v) {
    const picked = await openPickerMany({ title: 'Item para ' + v.name, kinds: INVENTORY_KINDS, chips: ['Armazém'] });
    if (!picked.length) return;
    const cur = vaults.find((x) => x.id === v.id) || v;
    const items = (cur.items || []).slice();
    let full = '';
    picked.forEach((e) => { // entra na ordem escolhida até acabar o espaço ou a carga
      if (full) return;
      const it = invEntryFrom(e);
      full = vaultFits(Object.assign({}, cur, { items }), it);
      if (!full) items.push(it);
    });
    const added = items.length - (cur.items || []).length;
    if (full) toast(added ? 'Entraram ' + added + ' de ' + picked.length + '. ' + full : full);
    if (added) await saveCol('vaults', v.id, { items });
  }
  // criar (mestre), pedir (jogador) ou mudar a capacidade
  let vaultDlg = null;
  function vaultForm(v) {
    const gm = Boolean(currentCamp.gm);
    if (!vaultDlg) { vaultDlg = h('dialog', 'dialog startdlg'); vaultDlg.setAttribute('aria-labelledby', 'vaultf-title'); document.body.append(vaultDlg); }
    const name = h('input', 'input');
    name.id = 'vaultf-name';
    name.maxLength = 60;
    name.value = v ? v.name : '';
    name.placeholder = 'Ex.: Depósito do esconderijo';
    const owner = h('select', 'input');
    owner.id = 'vaultf-owner';
    const opts = [['', 'Do grupo']].concat(members.filter((m) => m.sheet && m.sheet.attrs && (gm || m.mine)).map((m) => [m.characterId, 'De ' + m.name]));
    opts.forEach((o) => { const el = h('option', '', o[1]); el.value = o[0]; owner.append(el); });
    owner.value = v ? v.ownerCharId || '' : '';
    owner.disabled = Boolean(v);
    const slots = h('input', 'input');
    slots.id = 'vaultf-slots';
    slots.type = 'number';
    slots.min = '1';
    slots.max = String(VAULT_SLOTS_MAX);
    slots.value = String(v ? num(v.slots) : 20);
    const carga = h('input', 'input');
    carga.id = 'vaultf-carga';
    carga.type = 'number';
    carga.min = '0';
    carga.step = '0.5';
    carga.value = String(v ? num(v.carga) : 0);
    const lab = (t, el) => { const l = h('label', 'field__label', t); l.htmlFor = el.id; return h('div', 'field', l, el); };
    const ok = h('button', 'btn btn--primary btn--sm', v ? 'Salvar' : gm ? 'Criar armazém' : 'Pedir ao mestre');
    ok.type = 'submit';
    ok.dataset.fid = 'vaultf-ok';
    const cancel = h('button', 'btn btn--ghost btn--sm', 'Cancelar');
    cancel.type = 'button';
    cancel.addEventListener('click', () => closeDialog(vaultDlg));
    const form = h('form', 'startdlg__body', h('h2', '', v ? 'Capacidade de ' + v.name : gm ? 'Novo armazém' : 'Pedir um armazém'),
      h('p', 'field__hint', gm ? 'Cada item ocupa um espaço (com a quantidade junta). Carga 0 é sem limite de carga.' : 'O mestre aprova o pedido e decide quando vocês têm acesso. Cada item ocupa um espaço; carga 0 é sem limite.'),
      lab('Nome', name), lab('Dono', owner), h('div', 'fields-grid', lab('Espaços', slots), lab('Carga máxima', carga)), h('div', 'dialog__actions', cancel, ok));
    form.querySelector('h2').id = 'vaultf-title';
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const n = cleanName(name.value).slice(0, 60);
      if (!n) { toast('Dê um nome ao armazém.'); name.focus(); return; }
      const sl = clamp(Math.round(num(slots.value)) || 1, 1, VAULT_SLOTS_MAX);
      const cg = Math.max(0, num(carga.value));
      if (v && (v.items || []).length > sl) { toast('Já há ' + v.items.length + ' itens guardados: use pelo menos esse número de espaços.'); return; }
      closeDialog(vaultDlg);
      try {
        if (v) await db.updateDoc(currentCamp.id, 'vaults', v.id, { name: n, slots: sl, carga: cg });
        else {
          const oc = owner.value;
          await db.addDoc(currentCamp.id, 'vaults', { name: n, ownerCharId: oc, ownerName: oc ? charName(oc) : '', slots: sl, carga: cg, items: [], approved: gm, open: gm, createdBy: db.uid, log: [] });
          toast(gm ? n + ' criado.' : 'Pedido enviado. O mestre aprova e libera o acesso.');
        }
      } catch (err) { toast(errorMessage(err)); }
    });
    vaultDlg.replaceChildren(form);
    openDialog(vaultDlg);
    name.focus();
  }
  /* Armeiro da campanha: as armas e armaduras do personagem jogado, com peças da mochila, dos armazéns e das lojas */
  async function openCampArmory() {
    let m = playing();
    if (!m && currentCamp && currentCamp.gm) {
      const opts = members.filter((x) => x.sheet && x.sheet.attrs && armoryItems(x.sheet).length);
      if (!opts.length) { toast('Ninguém do grupo tem arma ou armadura.'); return; }
      const id = opts.length === 1 ? opts[0].characterId : await askChoice('Armeiro', 'Personagem', 'Escolha de quem são as armas.', opts.map((x) => [x.characterId, x.name]), 'Abrir');
      m = opts.find((x) => x.characterId === id) || null;
    }
    if (!m) { toast('Escolha um personagem seu em "Jogando como".'); return; }
    if (!m.sheet || !armoryItems(m.sheet).length) { toast(m.name + ' não tem arma nem armadura no inventário.'); return; }
    openArmory('', m);
  }
  function renderCampArmory() {
    const me = playing();
    $('#carm-hint').textContent = (me ? me.name + ': m' : 'M') + 'onte mods, acessórios e propriedades com peças da mochila, dos armazéns liberados ou das lojas da campanha (comprando na hora). Toda marca armamentista vende acessórios.';
  }
  $('#carm-open').addEventListener('click', openCampArmory);
  $('#vault-new').addEventListener('click', () => {
    if (!currentCamp.gm && !playing()) { toast('Escolha um personagem seu em "Jogando como".'); return; }
    vaultForm(null);
  });

  /* ---------- Lojas da campanha ----------
     O mestre cria as lojas (de uma companhia, dele ou de um NPC) e escolhe itens, quantidades e preços.
     Loja de companhia tem estoque infinito do que a companhia fabrica. Um jogador pode abrir a própria loja
     e abastecer com a mochila do personagem: os itens ficam no armazém ou à venda, com o preço por unidade dele.
     Com fluxo de pessoas e NPCs comprando, cada descanso que o mestre passa pode vender o que está à venda.
     A chance cai com a raridade e com o preço acima do catálogo, e é baixa de propósito: o estoque demora a esvaziar. */
  let shops = [];
  const shopUi = { open: new Set(), busy: false };
  const TRAFFIC = [['nenhum', 'Sem fluxo de pessoas'], ['baixo', 'Fluxo baixo'], ['medio', 'Fluxo médio'], ['alto', 'Fluxo alto']];
  const TRAFFIC_P = { baixo: 0.04, medio: 0.08, alto: 0.14 };   // chance por tentativa, item comum no preço do catálogo
  const TRAFFIC_TRIES = { baixo: 1, medio: 2, alto: 3 };          // tentativas por item num descanso curto (longo: o dobro)
  const RARITY_P = { 'Comum': 1, 'Incomum': 0.75, 'Rara': 0.5, 'Epica': 0.3, 'Épica': 0.3, 'Lendária': 0.15 };
  const playing = () => members.find((m) => m.mine && m.characterId === speakerEl.value) || null;
  const moneyOf = (m) => num(m && m.sheet && m.sheet.money ? m.sheet.money[currentCamp.id] : 0);
  const isShopOwner = (sh) => sh.kind === 'jogador' && sh.ownerUid === db.uid;
  const shopKindText = (sh) => (sh.kind === 'companhia' ? 'Companhia ' + sh.company : sh.kind === 'npc' ? 'NPC: ' + sh.npc : sh.kind === 'jogador' ? 'Loja de jogador (' + sh.ownerName + ')' : 'Do mestre');
  const catalogPrice = (entry) => priceOf(BUILTINS.find((e) => e.id && e.id === entry.id) || entry);
  const shopLog = (sh, text) => [{ t: Date.now(), text }].concat(sh.log || []).slice(0, 20);
  /* Toda marca armamentista (companhia que fabrica armas) vende os acessórios do banco, com estoque infinito */
  let accBank = null;
  const armsMaker = (co) => Boolean(co) && BUILTINS.some((e) => isWeapon(e.kind) && (e.values || {}).fabricante === co);
  function shopStock(sh) {
    if (sh.kind !== 'companhia' || !armsMaker(sh.company)) return sh.items;
    if (!accBank) {
      accBank = BUILTINS.filter((e) => e.kind === 'acessorio');
      libSearch(['acessorio'], '').then((l) => { accBank = l; renderShops(); }).catch(() => { /* fica o catálogo oficial */ });
    }
    const extra = accBank.filter((e) => !sh.items.some((x) => samePiece(x.entry, e)))
      .map((e) => ({ uid: 'acc-' + (e.id || nameKey(e.name)), entry: slotSnap(e), qty: null, price: priceOf(e) || 17, sale: true, virtual: true }));
    return sh.items.concat(extra);
  }
  const stockText = (it) => (it.qty === null || it.qty === undefined ? '∞' : '×' + it.qty);
  /* Preços avançados (lojas do mestre, de companhia e de NPC): inflação ou desconto geral, por raridade
     e por categoria, variação aleatória fixa por item e arredondamento. O preço do item é a base. */
  const PRICE_RARITIES = ['Comum', 'Incomum', 'Rara', 'Épica', 'Lendária'];
  const PRICE_CATS = [['armas', 'Armas'], ['protecao', 'Proteção'], ['implantes', 'Implantes'], ['gerais', 'Itens gerais'], ['outros', 'Outros']];
  const PRICE_ROUND = [1, 5, 10, 50, 100];
  const PRICE_PRESETS = [
    ['Zerar', { all: 0, rar: {}, cat: {}, jitter: 0 }],
    ['Promoção (–20%)', { all: -20 }],
    ['Inflação de guerra (+50%)', { all: 50 }],
    ['Raros mais caros', { rar: { 'Rara': 25, 'Épica': 50, 'Lendária': 100 } }],
    ['Armas em falta (+40%)', { cat: { armas: 40 } }],
    ['Mercado instável (±15%)', { jitter: 15 }]
  ];
  const priceCat = (kind) => (/^arma/.test(kind) ? 'armas' : kind === 'armadura' || kind === 'vestivel' ? 'protecao' : kind === 'nucleo' || kind === 'protese-modulo' ? 'implantes' : kind === 'item-geral' ? 'gerais' : 'outros');
  const rarKey = (r) => String(r || '').replace('Epica', 'Épica');
  function seededUnit(str) { // de –1 a 1, sempre o mesmo para o mesmo texto
    let x = 2166136261;
    for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); }
    return ((x >>> 0) / 4294967295) * 2 - 1;
  }
  function shopPrice(sh, it) {
    const base = Math.max(0, Math.round(num(it.price)));
    const p = sh.pricing;
    if (!p || sh.kind === 'jogador') return base;
    const pct = num(p.all) + num((p.rar || {})[rarKey((it.entry.values || {}).raridade)]) + num((p.cat || {})[priceCat(it.entry.kind)])
      + (num(p.jitter) ? seededUnit(it.uid + ':' + (p.seed || '')) * num(p.jitter) : 0);
    const step = PRICE_ROUND.indexOf(num(p.round)) >= 0 ? num(p.round) : 1;
    return Math.max(0, Math.round(base * Math.max(0, 1 + pct / 100) / step) * step);
  }
  function pricingPanel(sh) {
    const p = Object.assign({ all: 0, rar: {}, cat: {}, jitter: 0, round: 1, seed: '' }, deep(sh.pricing || {}));
    const numIn = (val, label, onv) => {
      const n = h('input', 'input shop__num');
      n.type = 'number';
      n.step = '5';
      n.value = String(num(val) || 0);
      n.setAttribute('aria-label', label);
      n.addEventListener('input', () => onv(Math.round(num(n.value))));
      return h('label', 'shop__lab', label, n, '%');
    };
    const grid = (title, kids) => h('fieldset', 'pricing__set', h('legend', '', title), h('div', 'pricing__grid', ...kids));
    const round = h('select', 'input shop__sel');
    round.setAttribute('aria-label', 'Arredondar preços');
    PRICE_ROUND.forEach((r) => { const o = h('option', '', r === 1 ? 'Sem arredondar' : 'Arredondar para ' + r); o.value = String(r); round.append(o); });
    round.value = String(p.round || 1);
    round.addEventListener('change', () => { p.round = num(round.value); });
    const save = async (patch) => {
      const next = Object.assign({}, p, patch || {});
      if (patch && patch.rar) next.rar = Object.assign({}, patch.rar);
      if (patch && patch.cat) next.cat = Object.assign({}, patch.cat);
      if (await saveShop(sh, { pricing: next })) toast('Preços de ' + sh.name + ' atualizados.');
    };
    const quick = PRICE_PRESETS.map((q) => { const b = h('button', 'btn btn--ghost btn--sm', q[0]); b.type = 'button'; b.addEventListener('click', () => save(q[1])); return b; });
    const reroll = h('button', 'btn btn--ghost btn--sm', 'Sortear nova variação');
    reroll.type = 'button';
    reroll.addEventListener('click', () => save({ seed: uid().slice(0, 6) }));
    const ok = h('button', 'btn btn--primary btn--sm', 'Aplicar preços');
    ok.type = 'button';
    ok.dataset.fid = 'pricing-save';
    ok.addEventListener('click', () => save());
    return h('details', 'pricing', h('summary', '', 'Preços avançados (mestre)' + (sh.pricing ? ' · ativos' : '')),
      h('p', 'field__hint', 'Somam por cima do preço de cada item: geral + raridade + categoria (+ variação). Negativo é desconto. Quem compra vê só o preço final.'),
      h('div', 'pricing__quick', ...quick),
      grid('Geral', [numIn(p.all, 'Inflação ou desconto geral', (v) => { p.all = v; }), numIn(p.jitter, 'Variação aleatória (±)', (v) => { p.jitter = Math.abs(v); })]),
      grid('Por raridade', PRICE_RARITIES.map((r) => numIn(p.rar[r], r, (v) => { p.rar[r] = v; }))),
      grid('Por categoria', PRICE_CATS.map((c) => numIn(p.cat[c[0]], c[1], (v) => { p.cat[c[0]] = v; }))),
      h('div', 'pricing__foot', round, reroll, ok));
  }
  async function saveShop(sh, patch) {
    try { await db.updateShop(currentCamp.id, sh.id, patch); return true; }
    catch (err) { toast(errorMessage(err)); return false; }
  }
  async function payMember(characterId, amount) { // dinheiro de venda para o dono da loja
    const owner = members.find((m) => m.characterId === characterId);
    if (!owner || !amount) return;
    await patchMemberSheet(owner, (s) => { s.money = Object.assign({}, s.money); s.money[currentCamp.id] = num(s.money[currentCamp.id]) + amount; });
  }

  async function buyFromShop(sh, it) {
    const me = playing();
    if (!me) { toast('Escolha um personagem seu para comprar.'); return; }
    const price = shopPrice(shops.find((x) => x.id === sh.id) || sh, it);
    if (moneyOf(me) < price) { toast(me.name + ' tem ' + fmtCronos(moneyOf(me)) + ' Cronos nesta campanha; ' + it.entry.name + ' custa ' + fmtCronos(price) + '.'); return; }
    const fresh = shops.find((x) => x.id === sh.id);
    const cur = fresh && shopStock(fresh).find((x) => x.uid === it.uid);
    if (!cur || !cur.sale || (cur.qty !== null && cur.qty !== undefined && cur.qty < 1)) { toast('Esse item acabou.'); return; }
    const camp = currentCamp.id;
    try {
      await patchMemberSheet(me, (s) => {
        if (num((s.money || {})[camp]) < price) throw new UserError('Dinheiro insuficiente.');
        s.money = Object.assign({}, s.money);
        s.money[camp] = num(s.money[camp]) - price;
        s.inventory.push(Object.assign(invEntryFrom(cur.entry), { src: 'loja' }));
      });
      const items = fresh.items.map((x) => (x.uid === cur.uid && x.qty !== null && x.qty !== undefined ? Object.assign({}, x, { qty: x.qty - 1 }) : x))
        .filter((x) => x.qty === null || x.qty === undefined || x.qty > 0);
      await db.updateShop(camp, sh.id, { items, log: shopLog(fresh, me.name + ' comprou ' + cur.entry.name + ' por ' + fmtCronos(price) + ' Cronos.') });
      if (sh.kind === 'jogador' && sh.ownerCharId !== me.characterId) await payMember(sh.ownerCharId, price);
      toast(me.name + ' comprou ' + cur.entry.name + '. Já está na mochila.');
      renderDock();
      renderShops();
    } catch (err) { toast(errorMessage(err)); }
  }

  async function stockFromInventory(sh) {
    const me = members.find((m) => m.characterId === sh.ownerCharId) || playing();
    if (!me || !me.sheet) return;
    const inv = (me.sheet.inventory || []).filter((i) => !i.slot);
    if (!inv.length) { toast('Nada na mochila de ' + me.name + ' para pôr na loja. Itens equipados não entram.'); return; }
    const pick = await askChoice('Abastecer ' + sh.name, 'Item da mochila de ' + me.name, 'Vai para o armazém da loja. Depois marque "À venda" e o preço por unidade.', inv.map((i) => [i.uid, i.name + (num(i.qty) > 1 ? ' ×' + i.qty : '')]), 'Pôr no armazém');
    if (!pick) return;
    let moved = null;
    try {
      await patchMemberSheet(me, (s) => {
        const k = s.inventory.findIndex((i) => i.uid === pick && !i.slot);
        if (k < 0) throw new UserError('Esse item não está mais na mochila.');
        moved = s.inventory.splice(k, 1)[0];
      });
      const fresh = shops.find((x) => x.id === sh.id) || sh;
      await saveShop(fresh, { items: fresh.items.concat([{ uid: uid(), entry: slotSnap(moved), qty: Math.max(1, num(moved.qty) || 1), price: priceOf(moved), sale: false }]) });
      toast(moved.name + ' foi para o armazém de ' + sh.name + '.');
    } catch (err) { toast(errorMessage(err)); }
  }

  async function unstock(sh, it) { // dono tira do armazém de volta para a mochila
    const owner = members.find((m) => m.characterId === sh.ownerCharId);
    if (!owner) { toast('O personagem dono da loja não está nesta campanha.'); return; }
    try {
      const fresh = shops.find((x) => x.id === sh.id) || sh;
      if (!fresh.items.some((x) => x.uid === it.uid)) return;
      await saveShop(fresh, { items: fresh.items.filter((x) => x.uid !== it.uid) });
      await patchMemberSheet(owner, (s) => { s.inventory.push(Object.assign(invEntryFrom(it.entry), { qty: Math.max(1, num(it.qty) || 1) })); });
      toast(it.entry.name + ' voltou para a mochila de ' + owner.name + '.');
    } catch (err) { toast(errorMessage(err)); }
  }

  async function addBankItem(sh) {
    const picked = await openPickerMany({ title: 'Item para ' + sh.name, kinds: INVENTORY_KINDS, chips: [
      { label: 'Armas', kinds: ['arma-melee', 'arma-fogo'] }, { label: 'Munições', kinds: ['municao'] }, { label: 'Armaduras', kinds: ['armadura'] }, { label: 'Vestíveis', kinds: ['vestivel'] },
      { label: 'Implantes', kinds: ['nucleo', 'protese-modulo'] }, { label: 'Peças de slot', kinds: ['mod-arma', 'propriedade', 'acessorio'] }, { label: 'Itens gerais', kinds: ['item-geral'] }], filter: (x) => INVENTORY_KINDS.indexOf(x.kind) >= 0 });
    if (!picked.length) return;
    const fresh = shops.find((x) => x.id === sh.id) || sh;
    await saveShop(fresh, { items: fresh.items.concat(picked.map((e) => ({ uid: uid(), entry: slotSnap(e), qty: sh.kind === 'companhia' ? null : 1, price: priceOf(e), sale: true }))) });
  }

  // Descanso passado pelo mestre: NPCs podem comprar o que está à venda nas lojas com fluxo
  async function shopRest(long) {
    if (shopUi.busy) return;
    shopUi.busy = true;
    const sold = [];
    try {
      for (const sh of shops.slice()) {
        if (sh.kind === 'companhia' || !sh.npcBuyers || !TRAFFIC_P[sh.traffic]) continue;
        let income = 0;
        const lines = [];
        const items = sh.items.map((x) => Object.assign({}, x));
        items.forEach((it) => {
          if (!it.sale || it.qty === null || it.qty === undefined || it.qty < 1) return; // estoque infinito não acaba
          const base = catalogPrice(it.entry) || num(it.price) || 1;
          const ratio = Math.max(0.25, num(it.price) / base);
          const p = Math.min(0.5, TRAFFIC_P[sh.traffic] * (RARITY_P[(it.entry.values || {}).raridade] || 0.7) / (ratio * ratio));
          const tries = Math.min(it.qty, TRAFFIC_TRIES[sh.traffic] * (long ? 2 : 1));
          let n = 0;
          for (let k = 0; k < tries; k++) if (Math.random() < p) n += 1;
          if (!n) return;
          it.qty -= n;
          income += n * Math.max(0, Math.round(num(it.price)));
          lines.push(n + '× ' + it.entry.name);
        });
        if (!lines.length) continue;
        await db.updateShop(currentCamp.id, sh.id, { items: items.filter((x) => x.qty === null || x.qty === undefined || x.qty > 0),
          log: shopLog(sh, 'Descanso ' + (long ? 'longo' : 'curto') + ': NPCs compraram ' + lines.join(', ') + (income ? ' (' + fmtCronos(income) + ' Cronos).' : '.')) });
        if (sh.kind === 'jogador') await payMember(sh.ownerCharId, income);
        sold.push(sh.name + ': ' + lines.join(', '));
      }
      toast(sold.length ? 'Vendas no descanso ' + (long ? 'longo' : 'curto') + ': ' + sold.join(' · ') + '.' : 'Descanso ' + (long ? 'longo' : 'curto') + ': nenhum NPC comprou nada desta vez.');
    } catch (err) { toast(errorMessage(err)); }
    finally { shopUi.busy = false; renderShops(); }
  }

  function shopItemRow(sh, it, manage) {
    const e = it.entry;
    const v = e.values || {};
    const base = Math.max(0, Math.round(num(it.price)));
    const price = shopPrice(sh, it);
    const main = h('span', 'row__main', h('span', 'row__title', e.name, ' ', h('span', 'tag shop__stock', stockText(it)), manage ? h('span', 'tag' + (it.sale ? ' tag--on' : ''), it.sale ? 'À venda' : 'No armazém') : null),
      h('span', 'row__meta', [kindTitle(e.kind), e.typeTitle, v.raridade, v.fabricante].filter(Boolean).join(' · ')));
    const row = h('li', 'row shop__item' + (it.sale ? '' : ' shop__item--off'), gearOpen(e, entryIcon(e), main),
      h('strong', 'gear__price', price !== base && manage ? h('s', 'shop__base', fmtCronos(base)) : null, price !== base && manage ? ' ' : null, fmtCronos(price)));
    const me = playing();
    if (it.sale && me && !(sh.kind === 'jogador' && sh.ownerCharId === me.characterId)) {
      const buy = h('button', 'btn btn--primary btn--sm', 'Comprar');
      buy.type = 'button';
      buy.disabled = moneyOf(me) < price;
      buy.title = buy.disabled ? 'Dinheiro insuficiente' : '';
      buy.setAttribute('aria-label', 'Comprar ' + e.name + ' por ' + fmtCronos(price) + ' Cronos');
      buy.addEventListener('click', () => { buy.disabled = true; buyFromShop(sh, it); });
      row.append(buy);
    }
    if (!manage) return row;
    const gm = currentCamp.gm;
    const priceIn = h('input', 'input shop__num');
    priceIn.type = 'number';
    priceIn.min = '0';
    priceIn.step = '1';
    priceIn.value = String(base);
    priceIn.setAttribute('aria-label', 'Preço base por unidade de ' + e.name);
    priceIn.addEventListener('change', () => saveShop(sh, { items: sh.items.map((x) => (x.uid === it.uid ? Object.assign({}, x, { price: Math.max(0, Math.round(num(priceIn.value))) }) : x)) }));
    const ctl = h('div', 'shop__ctl', h('label', 'shop__lab', 'Preço', priceIn));
    if (gm && sh.kind !== 'jogador') {
      const qtyIn = h('input', 'input shop__num');
      qtyIn.type = 'number';
      qtyIn.min = '0';
      qtyIn.step = '1';
      qtyIn.placeholder = '∞';
      qtyIn.value = it.qty === null || it.qty === undefined ? '' : String(it.qty);
      qtyIn.setAttribute('aria-label', 'Quantidade de ' + e.name + ' (vazio = infinito)');
      qtyIn.addEventListener('change', () => {
        const q = qtyIn.value.trim() === '' ? null : Math.max(0, Math.round(num(qtyIn.value)));
        saveShop(sh, { items: sh.items.map((x) => (x.uid === it.uid ? Object.assign({}, x, { qty: q }) : x)).filter((x) => x.qty === null || x.qty === undefined || x.qty > 0) });
      });
      ctl.append(h('label', 'shop__lab', 'Qtd.', qtyIn));
    }
    if (sh.kind !== 'companhia') { // companhia não tem armazém: o que ela fabrica está sempre à venda
      const sale = h('button', 'btn btn--ghost btn--sm', it.sale ? 'Pôr no armazém' : 'Pôr à venda');
      sale.type = 'button';
      sale.addEventListener('click', () => saveShop(sh, { items: sh.items.map((x) => (x.uid === it.uid ? Object.assign({}, x, { sale: !x.sale }) : x)) }));
      ctl.append(sale);
    }
    const out = h('button', 'btn btn--ghost btn--sm', sh.kind === 'jogador' ? 'Devolver à mochila' : 'Tirar');
    out.type = 'button';
    out.addEventListener('click', () => (sh.kind === 'jogador' ? unstock(sh, it) : saveShop(sh, { items: sh.items.filter((x) => x.uid !== it.uid) })));
    ctl.append(out);
    row.append(ctl);
    return row;
  }

  function shopCard(sh) {
    const gm = currentCamp.gm;
    const owner = isShopOwner(sh);
    const manage = gm || owner;
    const stock = shopStock(sh);
    const forSale = stock.filter((i) => i.sale);
    const det = h('details', 'shop shop--' + sh.kind);
    det.open = shopUi.open.has(sh.id);
    det.addEventListener('toggle', () => { if (det.open) shopUi.open.add(sh.id); else shopUi.open.delete(sh.id); });
    const icon = { companhia: '🏭', npc: '🧑‍🔧', jogador: '🎒', mestre: '🏪' }[sh.kind] || '🏪';
    det.append(h('summary', 'shop__head',
      h('span', 'shop__icon', icon),
      h('span', 'shop__main', h('strong', 'shop__name', sh.name),
        h('span', 'shop__meta', [shopKindText(sh), plural(forSale.length, 'item à venda', 'itens à venda'), sh.kind === 'companhia' ? 'estoque da companhia' : (TRAFFIC.find((t) => t[0] === sh.traffic) || TRAFFIC[0])[1], sh.kind !== 'companhia' && sh.npcBuyers ? 'NPCs compram' : '', sh.pricing && sh.kind !== 'jogador' ? 'preços ajustados' : ''].filter(Boolean).join(' · ')))));
    const body = h('div', 'shop__body');
    const shown = manage ? stock : forSale;
    if (shown.length) body.append(h('ul', 'rows shop__items', ...shown.map((it) => shopItemRow(sh, it, manage && !it.virtual))));
    if (stock.some((it) => it.virtual)) body.append(h('p', 'field__hint', sh.company + ' é marca armamentista: vende todos os acessórios, sem limite de estoque.'));
    else body.append(h('p', 'empty', manage ? 'Loja vazia. ' + (owner ? 'Abasteça com itens da mochila.' : 'Adicione itens do banco.') : 'Nada à venda agora.'));
    const acts = h('div', 'shop__acts');
    if (gm) {
      const add = h('button', 'btn btn--ghost btn--sm', 'Adicionar item do banco');
      add.type = 'button';
      add.addEventListener('click', () => addBankItem(sh));
      acts.append(add);
    }
    if (owner) {
      const stock = h('button', 'btn btn--primary btn--sm', 'Abastecer da mochila');
      stock.type = 'button';
      stock.addEventListener('click', () => stockFromInventory(sh));
      acts.append(stock);
    }
    if (gm && sh.kind !== 'companhia') { // companhia não está ligada a jogador: não vende para NPCs
      const traffic = h('select', 'input shop__sel');
      traffic.setAttribute('aria-label', 'Fluxo de pessoas em ' + sh.name);
      TRAFFIC.forEach((t) => { const o = h('option', '', t[1]); o.value = t[0]; traffic.append(o); });
      traffic.value = sh.traffic || 'nenhum';
      traffic.addEventListener('change', () => saveShop(sh, { traffic: traffic.value }));
      const buyers = h('input');
      buyers.type = 'checkbox';
      buyers.checked = Boolean(sh.npcBuyers);
      buyers.addEventListener('change', () => saveShop(sh, { npcBuyers: buyers.checked }));
      acts.append(traffic, h('label', 'check', buyers, h('span', '', 'NPCs compram')));
    }
    if (gm || owner) {
      const del = h('button', 'btn btn--danger btn--sm', owner && !gm ? 'Fechar minha loja' : 'Excluir loja');
      del.type = 'button';
      del.addEventListener('click', async () => {
        const ok = await askConfirm({ title: (owner && !gm ? 'Fechar ' : 'Excluir ') + sh.name + '?', text: sh.kind === 'jogador' ? 'Os itens da loja voltam para a mochila de ' + sh.ownerName + '.' : 'A loja e o estoque somem da campanha.', ok: owner && !gm ? 'Fechar' : 'Excluir' });
        if (!ok) return;
        try {
          if (sh.kind === 'jogador' && sh.items.length) {
            const o = members.find((m) => m.characterId === sh.ownerCharId);
            if (o) await patchMemberSheet(o, (s) => { sh.items.forEach((it) => s.inventory.push(Object.assign(invEntryFrom(it.entry), { qty: Math.max(1, num(it.qty) || 1) }))); });
          }
          await db.removeShop(currentCamp.id, sh.id);
        } catch (err) { toast(errorMessage(err)); }
      });
      acts.append(del);
    }
    if (acts.children.length) body.append(acts);
    if (gm && sh.kind !== 'jogador') body.append(pricingPanel(sh));
    if ((sh.log || []).length && manage) body.append(h('details', 'shop__log', h('summary', '', 'Vendas e compras (' + sh.log.length + ')'), h('ul', '', ...sh.log.map((l) => h('li', '', l.text)))));
    det.append(body);
    return det;
  }

  function renderShops() {
    if (!currentCamp) return;
    const gm = currentCamp.gm;
    const me = playing();
    $('#shop-gm').hidden = !gm;
    $('#shop-open-mine').hidden = !me || shops.some((sh) => sh.kind === 'jogador' && sh.ownerCharId === me.characterId);
    $('#shop-wallet').textContent = me ? me.name + ' tem ' + fmtCronos(moneyOf(me)) + ' Cronos nesta campanha.' : gm ? 'Você é o mestre: crie lojas, ponha itens e preços, e descanse o grupo (aba Grupo) para os NPCs comprarem.' : '';
    $('#shop-list').replaceChildren(...shops.map(shopCard));
    $('#shop-empty').hidden = shops.length > 0;
  }

  (function shopForm() {
    const form = $('#shop-new');
    const kind = $('#shop-kind');
    const comp = $('#shop-company');
    (ITEM_DATA.fabricantes || []).forEach((f) => { const o = h('option', '', f); o.value = f; comp.append(o); });
    const tr = $('#shop-traffic');
    TRAFFIC.forEach((t) => { const o = h('option', '', t[1]); o.value = t[0]; tr.append(o); });
    const sync = () => {
      const co = kind.value === 'companhia';
      $('#shop-company-field').hidden = !co;
      $('#shop-npc-field').hidden = kind.value !== 'npc';
      $('#shop-traffic-field').hidden = co; // companhia não vende para NPCs
      $('#shop-buyers-field').hidden = co;
    };
    kind.addEventListener('change', sync);
    sync();
    $('#shop-new-btn').addEventListener('click', () => {
      form.hidden = !form.hidden;
      $('#shop-npc-list').replaceChildren(...foes.map((f) => { const o = h('option'); o.value = f.name; return o; }));
      if (!form.hidden) kind.focus();
    });
    $('#shop-new-cancel').addEventListener('click', () => { form.hidden = true; });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const k = kind.value;
      const npc = cleanName($('#shop-npc').value).slice(0, 60);
      if (k === 'npc' && !npc) { toast('Diga de qual NPC é a loja.'); $('#shop-npc').focus(); return; }
      const name = cleanName($('#shop-name').value).slice(0, 60) || (k === 'companhia' ? comp.value : k === 'npc' ? 'Loja de ' + npc : 'Loja do mestre');
      const items = k === 'companhia'
        ? BUILTINS.filter((e) => (e.values || {}).fabricante === comp.value && priceOf(e) > 0).map((e) => ({ uid: uid(), entry: slotSnap(e), qty: null, price: priceOf(e), sale: true }))
        : [];
      try {
        const id = await db.addShop(currentCamp.id, { name, kind: k, company: k === 'companhia' ? comp.value : '', npc: k === 'npc' ? npc : '', ownerUid: '', ownerCharId: '', ownerName: '',
          traffic: k === 'companhia' ? 'nenhum' : tr.value, npcBuyers: k !== 'companhia' && $('#shop-buyers').checked, items, log: [] });
        shopUi.open.add(id);
        renderShops();
        form.hidden = true;
        form.reset();
        sync();
        toast(name + ' abriu' + (items.length ? ' com ' + plural(items.length, 'item', 'itens') + ' da ' + comp.value + ', estoque infinito.' : '. Adicione itens do banco.'));
      } catch (err) { toast(errorMessage(err)); }
    });
    $('#shop-open-mine').addEventListener('click', async () => {
      const me = playing();
      if (!me) return;
      try {
        const id = await db.addShop(currentCamp.id, { name: 'Loja de ' + me.name, kind: 'jogador', company: '', npc: '', ownerUid: db.uid, ownerCharId: me.characterId, ownerName: me.name,
          traffic: 'nenhum', npcBuyers: false, items: [], log: [] });
        shopUi.open.add(id);
        renderShops();
        toast('Loja de ' + me.name + ' aberta. Abasteça com itens da mochila; o mestre define o fluxo de pessoas.');
      } catch (err) { toast(errorMessage(err)); }
    });
  })();

  // Acesso da campanha (só quem criou): pública ou não, e senha opcional
  function renderAccess() {
    const box = $('#camp-access');
    const own = Boolean(currentCamp && currentCamp.isOwner);
    box.hidden = !own;
    $('#member-add-mine').hidden = !profile;
    if (!own) return;
    $('#access-public').checked = Boolean(currentCamp.public);
    $('#access-state').textContent = (currentCamp.public ? 'Pública: aparece na lista de campanhas públicas.' : 'Privada: só entra quem tem o ID.') + ' ' + (currentCamp.passHash ? 'Com senha.' : 'Sem senha.');
    $('#access-pass-clear').hidden = !currentCamp.passHash;
  }
  $('#access-public').addEventListener('change', async (ev) => {
    try {
      await db.updateCampaign(currentCamp.id, { public: ev.target.checked });
      currentCamp.public = ev.target.checked;
      renderAccess();
      toast(ev.target.checked ? 'Campanha pública.' : 'Campanha privada.');
    } catch (err) { toast(errorMessage(err)); ev.target.checked = !ev.target.checked; }
  });
  $('#access-pass-save').addEventListener('click', async () => {
    const pw = $('#access-pass').value;
    if (pw.length < 3) { toast('Use uma senha com pelo menos 3 caracteres.'); $('#access-pass').focus(); return; }
    try {
      const hash = await campHash(currentCamp.id, pw);
      await db.updateCampaign(currentCamp.id, { passHash: hash });
      currentCamp.passHash = hash;
      $('#access-pass').value = '';
      renderAccess();
      toast('Senha definida. Quem já participa continua entrando.');
    } catch (err) { toast(errorMessage(err)); }
  });
  $('#access-pass-clear').addEventListener('click', async () => {
    try {
      await db.updateCampaign(currentCamp.id, { passHash: '' });
      currentCamp.passHash = '';
      renderAccess();
      toast('Senha tirada.');
    } catch (err) { toast(errorMessage(err)); }
  });
  // jogador põe um personagem salvo no perfil direto no grupo
  // Pôr no grupo: um banner por personagem do perfil, com busca
  let addMineDlg = null;
  $('#member-add-mine').addEventListener('click', async () => {
    if (!profile) { openLogin(['campaign', currentCamp.id]); return; }
    const all = await loadChars(profile.chars);
    if (!all.length) { toast('Seu perfil ainda não tem personagens. Crie um em Personagens.'); return; }
    const inCamp = new Set(members.map((m) => m.characterId));
    if (!addMineDlg) {
      addMineDlg = h('dialog', 'dialog pickchar');
      addMineDlg.setAttribute('aria-labelledby', 'pickchar-title');
      document.body.append(addMineDlg);
    }
    const close = () => { if (addMineDlg.open) closeDialog(addMineDlg); };
    const join = async (c, btn) => {
      btn.disabled = true;
      try {
        const camp = await db.joinCampaign(currentCamp.id, c.id);
        profileSet('chars', c.id, true);
        profileSet('camps', camp.id, true);
        close();
        toast(c.name + ' entrou no grupo.');
        views.campaign(currentCamp.id);
      } catch (err) { btn.disabled = false; toast(errorMessage(err)); }
    };
    const banner = (c) => {
      const here = inCamp.has(c.id);
      const art = h('span', 'pickchar__art');
      const pic = c.image || c.thumb;
      if (pic) { const img = h('img'); img.src = pic; img.alt = ''; art.append(img); art.classList.add('pickchar__art--img'); }
      else art.textContent = (c.name || '?').trim().charAt(0).toUpperCase();
      const meta = [c.species, c.origin, c.age].filter(Boolean).join(' · ');
      const camps = (c.campaignIds || []).length;
      const b = h('button', 'btn btn--sm ' + (here ? 'btn--ghost' : 'btn--primary'), here ? 'Já está no grupo' : 'Pôr no grupo');
      b.type = 'button';
      b.disabled = here;
      b.dataset.fid = 'addmine-' + c.id;
      b.setAttribute('aria-label', here ? c.name + ' já está no grupo' : 'Pôr ' + c.name + ' no grupo');
      b.addEventListener('click', () => join(c, b));
      const card = h('li', 'pickchar__card' + (here ? ' is-here' : ''), art,
        h('span', 'pickchar__info', h('strong', 'pickchar__name', c.name), h('span', 'pickchar__meta', meta || TYPE_LABEL[c.type] || 'Personagem'),
          h('span', 'pickchar__meta', camps ? plural(camps, 'campanha', 'campanhas') : 'Em nenhuma campanha')), b);
      if (!here) card.addEventListener('click', (ev) => { if (!ev.target.closest('button')) join(c, b); });
      return card;
    };
    const sorted = all.slice().sort((a, b) => (inCamp.has(a.id) - inCamp.has(b.id)) || String(a.name).localeCompare(String(b.name), 'pt-BR'));
    const cards = sorted.map(banner);
    const list = h('ul', 'pickchar__list', ...cards);
    const none = h('p', 'field__hint', 'Nenhum personagem com esse nome.');
    none.hidden = true;
    const q = h('input', 'input');
    q.type = 'search';
    q.id = 'pickchar-q';
    q.placeholder = 'Buscar personagem';
    q.setAttribute('aria-label', 'Buscar personagem');
    q.autocomplete = 'off';
    q.addEventListener('input', () => { none.hidden = rankCards(cards, sorted, q.value, charFields) > 0; });
    const cancel = h('button', 'btn btn--ghost btn--sm', 'Fechar');
    cancel.type = 'button';
    cancel.addEventListener('click', close);
    const title = h('h2', '', 'Pôr no grupo');
    title.id = 'pickchar-title';
    const free = all.filter((c) => !inCamp.has(c.id)).length;
    addMineDlg.replaceChildren(h('div', 'pickchar__body', title,
      h('p', 'field__hint', free ? 'Escolha um dos seus personagens salvos. Ele entra nesta campanha como se você usasse o ID de entrada na ficha.' : 'Todos os personagens do seu perfil já estão neste grupo.'),
      all.length > 3 ? q : null, list, none, h('div', 'dialog__actions', cancel)));
    openDialog(addMineDlg);
    if (all.length > 3) q.focus();
  });

  views.campaign = async function showCampaign(id) {
    const camp = await db.getCampaign(id);
    if (!camp) { toast('Não encontramos essa campanha.'); go('campanhas'); return; }
    // campanha só com perfil: é ele que guarda quem joga e quem mestra
    if (!profile) { toast('Para abrir uma campanha, entre ou crie um perfil.'); go('campanhas'); openLogin(['campaign', id]); return; }
    if (!(await passGate(camp))) { go('campanhas'); return; }
    if (profile) {
      profileSet('camps', camp.id, true);
      if (camp.isOwner) profileSet('gm', camp.id, true);
      await db.touchCampaign(camp.id).catch((e) => console.warn(e)); // outro aparelho: passa a ler e rolar
    }
    camp.gm = camp.isOwner || isGmOf(camp.id); // o mestre também pelo perfil
    currentCamp = camp;
    firstRolls = true;
    $('#campaign-title').textContent = camp.name;
    $('#campaign-code').textContent = camp.id;
    $('#camp-danger').hidden = !camp.isOwner;
    let tabNow = 'combate';
    try { tabNow = localStorage.getItem(campTabKey(camp.id)) || 'combate'; } catch (e) { /* sem armazenamento */ }
    setCampTab(tabNow);
    document.title = camp.name + ' | Vortex';

    let noAccess = false;
    try { members = await db.listMembers(id); }
    catch (err) { console.warn(err); members = []; noAccess = true; }
    members.forEach((m) => { if (isMyChar(m.characterId)) m.mine = true; }); // personagens do perfil contam como seus
    members.forEach((m) => { if (m.mine && !isMyChar(m.characterId)) profileSet('chars', m.characterId, true); }); // e os seus entram no perfil
    renderAccess();

    $('#member-list').replaceChildren(...members.map(memberRow));
    tabBadges();
    renderXpForm();
    $('#member-empty').hidden = members.length > 0;

    const mine = members.filter((m) => m.mine);
    const canRoll = mine.length > 0;
    speakerEl.replaceChildren(...mine.map((m) => {
      const o = h('option', '', m.name);
      o.value = m.characterId;
      return o;
    }));
    const pinned = pinGet(camp.id);
    if (mine.some((m) => m.characterId === pinned)) speakerEl.value = pinned;
    else if (mine.some((m) => m.characterId === lastCharacterId)) speakerEl.value = lastCharacterId;
    speakerEl.disabled = mine.length < 2;
    $('#speaker-field').hidden = !canRoll;

    const notice = $('#chat-notice');
    notice.hidden = canRoll;
    notice.textContent = noAccess
      ? 'Você ainda não participa desta campanha. Abra uma ficha e vincule com o ID de entrada.'
      : 'Para rolar dados, vincule um personagem seu a esta campanha (pela ficha dele).';
    $('#test-bar').hidden = !canRoll;
    renderTestPick();
    renderDock();

    foes = [];
    scene = null;
    shops = [];
    combat.targets.clear();
    battle.actor = '';
    battle.name = '';
    $('#shop-block').hidden = noAccess && !camp.gm;
    $('#shop-new').hidden = true;
    if (noAccess && !camp.gm) { renderRolls([]); return; }
    renderShops();
    renderCombat();
    loot = [];
    vaults = [];
    fallen = [];
    fallenSeen.clear();
    fallenReady = false;
    renderLootTab();
    const stopFoes = db.subscribeFoes(id, (list) => { foes = list; trackFallen(list); renderCombat(); }, (err) => console.warn(err));
    const here = (fn) => (list) => { if (currentCamp && currentCamp.id === id) fn(list); };
    const stopLoot = db.subscribeCol(id, 'loot', here((list) => { loot = list; renderLoot(); }), (err) => console.warn(err));
    const stopVaults = db.subscribeCol(id, 'vaults', here((list) => { vaults = list; renderVaults(); renderLoot(); }), (err) => console.warn(err));
    const stopFallen = camp.gm ? db.subscribeCol(id, 'fallen', here((list) => { fallen = list; if (!fallenReady) { fallenReady = true; trackFallen(foes); } renderFallen(); if (!$('#cpanel-bestiario').hidden) runBeast(); }), (err) => console.warn(err)) : null;
    const stopScene = db.subscribeScene(id, (sc) => { if (currentCamp && currentCamp.id === id) { scene = sc; renderScene(); renderDock(); } }, (err) => console.warn(err));
    const stopShops = db.subscribeShops(id, (list) => { if (currentCamp && currentCamp.id === id) { shops = list; renderShops(); } }, (err) => console.warn(err));
    const stopAll = (more) => () => { [stopFoes, stopScene, stopShops, stopLoot, stopVaults, stopFallen].concat(more || []).forEach((fn) => { if (typeof fn === 'function') fn(); }); };
    if (noAccess) { renderRolls([]); onLeave = stopAll(); return; }
    const stop = db.subscribeRolls(id, renderRolls, (err) => toast(errorMessage(err)));
    onLeave = stopAll([stop]);
  };

  /* ---------- Regras: livro em abas, no estilo de tutorial ----------
     O texto vem de regras.js. Um capítulo por aba; ao lado da rolagem fica o índice
     com o título de cada regra (marca onde você está e pula direto para qualquer uma). */
  const CHAPTERS = (window.VORTEX_REGRAS && window.VORTEX_REGRAS.chapters) || [];
  const rulesUi = { tab: null, headings: [], spySlug: null, spyQueued: false };
  const rulesTabsEl = $('#rules-tabs');
  const rulesBodyEl = $('#rules-body');
  const rulesRail = $('#rules-rail');
  const rulesTocEl = $('#rules-toc');
  const rulesHitsEl = $('#rules-hits');
  const rulesFilter = $('#rules-filter');
  const rulesProgress = $('#rules-progress');
  const rulesFab = $('#rules-fab');
  const rulesBackdrop = $('#rules-backdrop');
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const slugify = (s) => nameKey(s).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'secao';
  const plainText = (s) => String(s).replace(/\*/g, '');
  const ruleHref = (tab, slug) => '#/rules/' + tab + (slug ? '/' + slug : '');

  // todo o texto de um bloco (parágrafos, listas, tabelas), para a busca nas regras
  const blockText = (b) => (Array.isArray(b) ? b.slice(1).map(blockText).join(' ') : typeof b === 'string' ? plainText(b) : '').replace(/\s+/g, ' ').trim();
  // Lista os títulos do capítulo (seções, subseções e cartões) e dá um endereço único a cada um
  function indexChapter(ch) {
    if (ch._toc) return ch._toc;
    const used = {};
    const toc = [];
    const slugs = new Map();
    (function walk(blocks) {
      blocks.forEach((b) => {
        const t = b[0];
        if (t !== 'h2' && t !== 'h3' && t !== 'h4' && t !== 'card') {
          // o texto que vem depois de um título entra na busca desse título
          if (toc.length) toc[toc.length - 1].body += ' ' + blockText(b);
          return;
        }
        const level = t === 'card' ? (b[3] || 3) : Number(t.slice(1));
        let slug = slugify(plainText(b[1]));
        used[slug] = (used[slug] || 0) + 1;
        if (used[slug] > 1) slug += '-' + used[slug];
        slugs.set(b, slug);
        toc.push({ level, title: plainText(b[1]), slug, body: '' });
        if (t === 'card') walk(b[2]);
      });
    })(ch.blocks);
    ch._toc = toc;
    ch._slugs = slugs;
    return toc;
  }

  // **negrito** e *itálico* do texto viram elementos (nunca HTML solto)
  function rich(text) {
    const frag = document.createDocumentFragment();
    String(text).split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).forEach((part) => {
      if (!part) return;
      if (part.slice(0, 2) === '**' && part.length > 4) frag.append(h('strong', '', part.slice(2, -2)));
      else if (part[0] === '*' && part.length > 2) frag.append(h('em', '', part.slice(1, -1)));
      else frag.append(part);
    });
    return frag;
  }

  const bulletList = (items) => h('ul', 'r-list', ...items.map((x) => h('li', '', rich(x))));

  function headingEl(ch, level, text, slug) {
    const el = h('h' + (level + 1), 'r-h r-h' + level, rich(text));
    el.id = 'r-' + slug;
    el.tabIndex = -1;
    const a = h('a', 'r-anchor', '#');
    a.href = ruleHref(ch.id, slug);
    a.dataset.tab = ch.id;
    a.dataset.slug = slug;
    a.setAttribute('aria-label', 'Link para ' + plainText(text));
    el.append(a);
    return el;
  }

  function renderBlock(ch, b) {
    switch (b[0]) {
      case 'h2': case 'h3': case 'h4': return headingEl(ch, Number(b[0][1]), b[1], ch._slugs.get(b));
      case 'p': return h('p', '', rich(b[1]));
      case 'ul': return bulletList(b[1]);
      case 'formula': return h('div', 'formula', b[1] ? h('span', 'formula__label', b[1]) : null, h('span', 'formula__text', b[2]));
      case 'example': return h('aside', 'callout callout--example', h('p', 'callout__label', 'Exemplo'), h('p', '', rich(b[1])));
      case 'note': return h('aside', 'callout callout--note', h('p', 'callout__label', b[1]), Array.isArray(b[2]) ? bulletList(b[2]) : h('p', '', rich(b[2])));
      case 'table': {
        const head = h('tr');
        b[1].forEach((x) => { const th = h('th', '', x); th.scope = 'col'; head.append(th); });
        const body = h('tbody');
        b[2].forEach((row) => {
          const tr = h('tr');
          row.forEach((c, i) => { const cell = h(i === 0 ? 'th' : 'td', '', rich(c)); if (i === 0) cell.scope = 'row'; tr.append(cell); });
          body.append(tr);
        });
        return h('div', 'table-wrap', h('table', 'r-table', h('thead', '', head), body));
      }
      case 'dl': {
        const dl = h('dl', 'defs');
        b[1].forEach((pair) => {
          dl.append(h('dt', '', rich(pair[0])), h('dd', '', Array.isArray(pair[1]) ? bulletList(pair[1]) : rich(pair[1])));
        });
        return dl;
      }
      case 'kv': {
        const dl = h('dl');
        b[2].forEach((pair) => dl.append(h('dt', '', pair[0]), h('dd', '', rich(pair[1]))));
        return h('div', 'kv', b[1] ? h('p', 'kv__cap', b[1]) : null, dl);
      }
      case 'fields': return h('ul', 'tpl', ...b[1].map((x) => h('li', 'tpl__field', x ? rich(x) : null)));
      case 'card': {
        const card = h('section', 'r-card', headingEl(ch, b[3] || 3, b[1], ch._slugs.get(b)));
        b[2].forEach((x) => card.append(renderBlock(ch, x)));
        return card;
      }
      default: return h('p', '', String(b[0]));
    }
  }

  function pagerLink(ch, label) {
    const a = h('a', 'r-pager__link', h('span', 'r-pager__label', label), h('strong', '', ch.title));
    a.href = ruleHref(ch.id);
    a.dataset.tab = ch.id;
    return a;
  }

  function renderChapter(idx) {
    const ch = CHAPTERS[idx];
    const toc = indexChapter(ch);
    const frag = document.createDocumentFragment();
    const head = h('header', 'r-chapter',
      h('p', 'r-chapter__num', 'Capítulo ' + (idx + 1) + ' de ' + CHAPTERS.length + ' · ' + ch.group),
      h('h2', 'r-chapter__title', ch.title));
    const secs = toc.filter((t) => t.level === 2);
    if (secs.length > 1) {
      const list = h('ol', 'r-inchapter__list', ...secs.map((t) => {
        const a = h('a', '', t.title);
        a.href = ruleHref(ch.id, t.slug);
        a.dataset.tab = ch.id;
        a.dataset.slug = t.slug;
        return h('li', '', a);
      }));
      const nav = h('nav', 'r-inchapter', h('p', 'r-inchapter__title', 'Neste capítulo'), list);
      nav.setAttribute('aria-label', 'Neste capítulo');
      head.append(nav);
    }
    frag.append(head);
    ch.blocks.forEach((b) => frag.append(renderBlock(ch, b)));
    const prev = CHAPTERS[idx - 1];
    const next = CHAPTERS[idx + 1];
    const pager = h('nav', 'r-pager', prev ? pagerLink(prev, 'Capítulo anterior') : h('span'), next ? pagerLink(next, 'Próximo capítulo') : h('span'));
    pager.setAttribute('aria-label', 'Outros capítulos');
    frag.append(pager);
    return frag;
  }

  /* Abas (uma por capítulo) */
  function renderTabs() {
    rulesTabsEl.replaceChildren();
    let lastGroup = null;
    CHAPTERS.forEach((c, i) => {
      if (c.group !== lastGroup) {
        const g = h('span', 'rules-tabs__group', c.group);
        g.setAttribute('aria-hidden', 'true');
        rulesTabsEl.append(g);
        lastGroup = c.group;
      }
      const b = h('button', 'rules-tab', h('span', 'rules-tab__n', String(i + 1)), c.title);
      b.type = 'button';
      b.id = 'tab-' + c.id;
      b.dataset.tab = c.id;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', 'false');
      b.setAttribute('aria-controls', 'rules-body');
      b.tabIndex = -1;
      b.addEventListener('click', () => openRule(c.id, null));
      rulesTabsEl.append(b);
    });
    $('#rules-chapters').replaceChildren(...CHAPTERS.map((c, i) => {
      const a = h('a', '', h('span', 'toc__num', String(i + 1)), c.title);
      a.href = ruleHref(c.id);
      a.dataset.tab = c.id;
      return h('li', 'toc__item toc__l2', a);
    }));
  }

  /* Índice ao lado da rolagem */
  function renderRail(ch, idx) {
    let n = 0;
    rulesTocEl.replaceChildren(...ch._toc.map((t) => {
      if (t.level === 2) n++;
      const a = h('a', '', t.level === 2 ? h('span', 'toc__num', (idx + 1) + '.' + n) : null, t.title);
      a.href = ruleHref(ch.id, t.slug);
      a.dataset.slug = t.slug;
      return h('li', 'toc__item toc__l' + t.level, a);
    }));
    if (!ch._toc.length) rulesTocEl.append(h('li', 'toc__empty', 'Esta aba não tem seções.'));
  }

  // Digitou no campo: procura o título em todos os capítulos
  function showHits(q) {
    const searching = hasQuery(q);
    rulesHitsEl.hidden = !searching;
    $('#rules-toc-title').hidden = $('#rules-toc-nav').hidden = searching;
    $('.rules-chapters-wrap').hidden = searching;
    if (!searching) return;
    // como num site de busca: título pesa mais, depois o capítulo, depois o texto da seção
    const all = [];
    CHAPTERS.forEach((c) => {
      all.push({ c, t: null, name: c.title });
      indexChapter(c).forEach((t) => all.push({ c, t, name: t.title }));
    });
    const hits = rankSearch(all, q, (x) => (x.t ? [[x.t.title, 10], [x.c.title, 4], [x.t.body, 1]] : [[x.c.title, 10]]));
    const suggest = hits.length ? '' : suggestQuery(q, all.map((x) => x.name));
    rulesHitsEl.replaceChildren(...(hits.length
      ? hits.slice(0, 40).map(({ c, t }) => {
        const snip = t ? ruleSnippet(t.body, q) : '';
        const a = h('a', '', t ? t.title : c.title, h('span', 'toc__tab', t ? c.title : 'Capítulo'), snip ? h('span', 'toc__snip', snip) : null);
        a.href = ruleHref(c.id, t && t.slug);
        a.dataset.tab = c.id;
        if (t) a.dataset.slug = t.slug;
        return h('li', 'toc__item toc__l2', a);
      })
      : [h('li', 'toc__empty', 'Nenhuma regra encontrada.', suggest ? h('span', '', ' ', didYouMean(suggest, (v) => { rulesFilter.value = v; showHits(v); rulesFilter.focus(); }, 'span')) : null)]));
  }
  // trecho do texto em volta da primeira palavra buscada que aparece nele (quando não está no título)
  function ruleSnippet(body, q) {
    if (!body) return '';
    const key = nameKey(body);
    const pos = stemWords(q).map((w) => { const m = new RegExp('(^|[^a-z0-9])' + w.replace(/[^a-z0-9]/g, '')).exec(key); return m ? m.index + m[1].length : -1; })
      .filter((i) => i >= 0).sort((a, b) => a - b)[0];
    if (pos === undefined) return '';
    const start = Math.max(0, pos - 40);
    return (start ? '…' : '') + body.slice(start, start + 120).trim() + (start + 120 < body.length ? '…' : '');
  }

  /* Alturas fixas no topo (barra do site e abas), para o índice e as âncoras não ficarem escondidos */
  function updateOffsets() {
    const wrap = $('.rules-tabs-wrap');
    const barH = window.matchMedia('(min-width: 1024px)').matches ? 0 : $('.app-bar').offsetHeight; // no computador a barra vira a lateral
    const sticky = getComputedStyle(wrap).position === 'sticky';
    const root = document.documentElement.style;
    root.setProperty('--bar-h', barH + 'px');
    root.setProperty('--scroll-off', (barH + (sticky ? wrap.offsetHeight : 0) + 12) + 'px');
  }
  const scrollOffset = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scroll-off')) || 0;

  function scrollToRule(slug, smooth) {
    const el = document.getElementById('r-' + slug);
    if (!el) return;
    // cálculo manual: scrollIntoView + scroll-padding-top é inconsistente entre navegadores
    const y = el.getBoundingClientRect().top + window.scrollY - scrollOffset();
    window.scrollTo({ top: Math.max(0, y), behavior: smooth && !reduceMotion() ? 'smooth' : 'auto' });
    history.replaceState(null, '', ruleHref(rulesUi.tab, slug));
    el.focus({ preventScroll: true });
  }

  function centerActiveTab() {
    const t = $('.rules-tab[aria-selected="true"]', rulesTabsEl);
    if (t) rulesTabsEl.scrollTo({ left: t.offsetLeft - (rulesTabsEl.clientWidth - t.offsetWidth) / 2, behavior: reduceMotion() ? 'auto' : 'smooth' });
  }

  /* Marca no índice a regra que está na tela e mostra o quanto do capítulo já foi lido */
  function queueSpy() {
    if (rulesUi.spyQueued) return;
    rulesUi.spyQueued = true;
    requestAnimationFrame(updateSpy);
  }
  function updateSpy() {
    rulesUi.spyQueued = false;
    if (rulesBodyEl.closest('[hidden]')) return;
    const off = scrollOffset() + 6;
    let cur = null;
    for (const el of rulesUi.headings) { if (el.getBoundingClientRect().top <= off) cur = el; else break; }
    const slug = cur ? cur.id.slice(2) : null;
    if (slug !== rulesUi.spySlug) {
      rulesUi.spySlug = slug;
      let active = null;
      $$('a', rulesTocEl).forEach((a) => {
        if (a.dataset.slug === slug) { a.setAttribute('aria-current', 'location'); active = a; }
        else a.removeAttribute('aria-current');
      });
      const inner = $('.rules-rail__inner');
      if (active && window.matchMedia('(min-width: 1001px)').matches) { // mantém o item atual à vista no índice
        const lr = active.getBoundingClientRect();
        const ir = inner.getBoundingClientRect();
        if (lr.top < ir.top + 8 || lr.bottom > ir.bottom - 8) inner.scrollTop += lr.top - ir.top - ir.height / 3;
      }
    }
    const r = rulesBodyEl.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (off - r.top) / Math.max(1, r.height - (window.innerHeight - off))));
    rulesProgress.style.height = (pct * 100).toFixed(1) + '%';
  }

  function showTab(id, slug) {
    const idx = Math.max(0, CHAPTERS.findIndex((c) => c.id === id));
    const ch = CHAPTERS[idx];
    if (rulesUi.tab !== ch.id || !rulesBodyEl.childElementCount) {
      indexChapter(ch);
      rulesBodyEl.style.setProperty('--chap', '"' + (idx + 1) + '"');
      rulesBodyEl.replaceChildren(renderChapter(idx));
      renderRail(ch, idx);
      rulesFilter.value = '';
      showHits('');
      rulesUi.headings = $$('.r-h', rulesBodyEl);
      rulesUi.spySlug = undefined;
    }
    rulesUi.tab = ch.id;
    $$('.rules-tab', rulesTabsEl).forEach((t) => {
      const on = t.dataset.tab === ch.id;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    $$('#rules-chapters a').forEach((a) => {
      if (a.dataset.tab === ch.id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
    rulesBodyEl.setAttribute('aria-labelledby', 'tab-' + ch.id);
    document.title = 'Regras: ' + ch.title + ' | Vortex';
    history.replaceState(null, '', ruleHref(ch.id, slug));
  }

  function openRule(tabId, slug) {
    const changed = rulesUi.tab !== tabId;
    showTab(tabId, slug);
    requestAnimationFrame(() => {
      if (slug) scrollToRule(slug, !changed);
      else if (changed) { // abriu outro capítulo: volta ao começo dele, sem perder as abas de vista
        const top = $('#rules-layout').getBoundingClientRect().top + window.scrollY - scrollOffset() - 8;
        if (window.scrollY > top) window.scrollTo(0, top);
      }
      centerActiveTab();
      queueSpy();
    });
  }

  function openSheet() {
    rulesRail.classList.add('is-open');
    rulesBackdrop.hidden = false;
    rulesFab.setAttribute('aria-expanded', 'true');
    rulesRail.focus();
  }
  function closeSheet() {
    rulesRail.classList.remove('is-open');
    rulesBackdrop.hidden = true;
    rulesFab.setAttribute('aria-expanded', 'false');
  }

  // liga os controles uma vez só
  renderTabs();
  rulesFab.addEventListener('click', () => (rulesRail.classList.contains('is-open') ? closeSheet() : openSheet()));
  $('#rules-close').addEventListener('click', closeSheet);
  rulesBackdrop.addEventListener('click', closeSheet);
  rulesFilter.addEventListener('input', () => showHits(rulesFilter.value));
  rulesFilter.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); const first = $('a', rulesHitsEl); if (first) first.click(); }
    if (ev.key === 'Escape' && rulesFilter.value) { ev.stopPropagation(); rulesFilter.value = ''; showHits(''); }
  });
  function onRuleLink(ev) { // índice, "Neste capítulo", links das seções e "anterior/próximo"
    const a = ev.target.closest('a[data-tab], a[data-slug]');
    if (!a || !a.href) return;
    ev.preventDefault();
    closeSheet();
    if (rulesFilter.value) { rulesFilter.value = ''; showHits(''); } // sai do modo de busca ao escolher um resultado
    openRule(a.dataset.tab || rulesUi.tab, a.dataset.slug || null);
  }
  rulesRail.addEventListener('click', onRuleLink);
  rulesBodyEl.addEventListener('click', onRuleLink);
  rulesTabsEl.addEventListener('keydown', (ev) => { // setas, Home e End trocam de aba
    const tabs = $$('.rules-tab', rulesTabsEl);
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    let j = null;
    if (ev.key === 'ArrowRight') j = (i + 1) % tabs.length;
    else if (ev.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
    else if (ev.key === 'Home') j = 0;
    else if (ev.key === 'End') j = tabs.length - 1;
    if (j === null) return;
    ev.preventDefault();
    tabs[j].focus();
    openRule(tabs[j].dataset.tab, null);
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && rulesRail.classList.contains('is-open')) closeSheet(); });

  $('#rules-back').addEventListener('click', (ev) => {
    ev.preventDefault();
    const parts = rulesBack.replace(/^#\/?/, '').split('/');
    go(parts[0] || 'home', parts.slice(1).join('/') ? decodeURIComponent(parts.slice(1).join('/')) : undefined);
  });

  function onRulesResize() { updateOffsets(); queueSpy(); }

  views.rules = async function showRules(param) {
    const parts = (param || '').split('/');
    const tabId = CHAPTERS.some((c) => c.id === parts[0]) ? parts[0] : (CHAPTERS[0] && CHAPTERS[0].id);
    const slug = parts[1] || null;
    if (!tabId) return;
    $('#rules-back').hidden = !rulesFromHelp;
    updateOffsets();
    showTab(tabId, slug);
    window.addEventListener('scroll', queueSpy, { passive: true });
    window.addEventListener('resize', onRulesResize);
    onLeave = () => {
      window.removeEventListener('scroll', queueSpy);
      window.removeEventListener('resize', onRulesResize);
      closeSheet();
    };
    requestAnimationFrame(() => { // depois de o roteador voltar ao topo
      if (slug) scrollToRule(slug, false);
      centerActiveTab();
      queueSpy();
    });
  };


  /* =====================================================================
     8. INÍCIO DO APP
     ===================================================================== */
  function setMode(kind, detail) {
    const texts = {
      local: ['Modo local', 'Os dados ficam só neste aparelho. Para ligar o Firebase, preencha FIREBASE_CONFIG no início do app.js.'],
      connecting: ['Conectando...', ''],
      firebase: ['Firebase conectado', 'Os dados ficam salvos na nuvem.'],
      error: ['Modo local (erro)', detail || '']
    };
    const pill = $('#mode-pill');
    pill.textContent = texts[kind][0];
    pill.title = texts[kind][1];
    pill.className = 'mode-pill mode-pill--' + kind;
    const notice = $('#mode-notice');
    notice.hidden = kind !== 'error';
    if (kind === 'error') notice.textContent = 'Não foi possível conectar ao Firebase. ' + detail + ' Enquanto isso, o site usa o modo local.';
  }

  async function start() {
    setMode('local');
    if (FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId) {
      setMode('connecting');
      try {
        db = await connectFirebase();
        setMode('firebase');
      } catch (err) {
        console.error(err);
        db = LocalDb;
        setMode('error', explainConnectError(err));
      }
    }
    quickKey = 'vortex.quick.v1.' + (db.mode === 'firebase' ? 'fb.' + FIREBASE_CONFIG.projectId : 'local');
    profileKey = 'vortex.profile.v1.' + (db.mode === 'firebase' ? 'fb.' + FIREBASE_CONFIG.projectId : 'local');
    await profileRestore();
    await migrateOldItems();
    window.addEventListener('hashchange', () => { vortexUrlCheck(); render(); });
    vortexUrlCheck();
    render();
  }

  start();
})();