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
  const haystack = (c) => nameKey([c.name, c.species, c.origin].join(' '));
  // a 1ª palavra da busca é começo de alguma palavra da ficha; as demais aparecem em qualquer parte
  function matchesQuery(c, q) {
    const qs = words(q);
    if (!qs.length) return true;
    const hay = haystack(c);
    return words(hay).some((w) => w.indexOf(qs[0]) === 0) && qs.slice(1).every((w) => hay.indexOf(w) >= 0);
  }
  // Banco de itens: mesma lógica de busca (1ª palavra = começo de palavra; o resto em qualquer parte)
  const deep = (o) => JSON.parse(JSON.stringify(o === undefined ? null : o));
  const libHay = (e) => nameKey([e.name, e.typeTitle, e.kindTitle].join(' '));
  function matchesText(hay, q) {
    const qs = words(q || '');
    if (!qs.length) return true;
    return words(hay).some((w) => w.indexOf(qs[0]) === 0) && qs.slice(1).every((w) => hay.indexOf(w) >= 0);
  }
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
     3. DADOS: comandos como d20, 2d6+3, 4d6kh3, 1d20+5 # ataque
     ===================================================================== */
  const DICE_HELP = 'Tente algo como d20, 2d6+3 ou 4d6kh3.';

  function rollDice(input) {
    let text = String(input).trim().replace(/^\/(?:r|roll)\s+/i, '');
    let label = '';
    const hash = text.indexOf('#');
    if (hash >= 0) { label = text.slice(hash + 1).trim().slice(0, 60); text = text.slice(0, hash); }
    if (!text.trim()) throw new UserError('Digite um comando de dados. ' + DICE_HELP);
    // espaço só é aceito em volta de + e - ("2d6 + 3"); "2d6 3" não vira 2d63
    if (/[a-z0-9]\s+[a-z0-9]/i.test(text.trim())) throw new UserError('Não entendi "' + text.trim() + '". ' + DICE_HELP);
    const src = text.replace(/\s+/g, '').toLowerCase();

    const re = /([+-]?)(?:(\d*)d(\d+)(?:k([hl])(\d+))?|(\d+))/y;
    const terms = [];
    let pos = 0;
    let diceTotal = 0;

    while (pos < src.length) {
      re.lastIndex = pos;
      const m = re.exec(src);
      if (!m || (pos > 0 && !m[1])) throw new UserError('Não entendi "' + text.trim() + '". ' + DICE_HELP);
      pos = re.lastIndex;
      if (terms.length >= 10) throw new UserError('Use no máximo 10 termos por comando.');
      const sign = m[1] === '-' ? -1 : 1;

      if (m[3] !== undefined) { // termo de dados: NdM, com kh/kl opcional
        const count = m[2] === '' ? 1 : parseInt(m[2], 10);
        const sides = parseInt(m[3], 10);
        if (count < 1 || count > 100) throw new UserError('Role de 1 a 100 dados por termo.');
        if (sides < 2 || sides > 1000) throw new UserError('Os dados têm de 2 a 1000 lados.');
        let keep = null;
        if (m[4]) {
          keep = { mode: m[4], n: parseInt(m[5], 10) };
          if (keep.n < 1 || keep.n > count) throw new UserError('Em kh/kl, mantenha de 1 a ' + count + ' dados.');
        }
        diceTotal += count;
        if (diceTotal > 200) throw new UserError('Máximo de 200 dados por comando.');
        terms.push({ kind: 'dice', sign, count, sides, keep });
      } else { // número fixo
        const value = parseInt(m[6], 10);
        if (value > 9999) throw new UserError('Use números fixos até 9999.');
        terms.push({ kind: 'num', sign, value });
      }
    }
    if (!terms.some((t) => t.kind === 'dice')) throw new UserError('Inclua pelo menos um dado, como 1d20.');

    let total = 0;
    const exprParts = [];
    const detailParts = [];
    terms.forEach((t, i) => {
      const lead = i === 0 ? (t.sign < 0 ? '-' : '') : (t.sign < 0 ? '-' : '+');
      const detailLead = i === 0 ? (t.sign < 0 ? '-' : '') : (t.sign < 0 ? ' - ' : ' + ');
      if (t.kind === 'num') {
        total += t.sign * t.value;
        exprParts.push(lead + t.value);
        detailParts.push(detailLead + t.value);
        return;
      }
      const rolls = Array.from({ length: t.count }, () => randInt(t.sides));
      let kept = rolls.map(() => true);
      if (t.keep) {
        kept = rolls.map(() => false);
        rolls.map((v, idx) => [v, idx])
          .sort((a, b) => (t.keep.mode === 'h' ? b[0] - a[0] : a[0] - b[0]))
          .slice(0, t.keep.n)
          .forEach((pair) => { kept[pair[1]] = true; });
      }
      const subtotal = rolls.reduce((s, v, idx) => (kept[idx] ? s + v : s), 0);
      total += t.sign * subtotal;
      t.rolls = rolls;
      const name = t.count + 'd' + t.sides + (t.keep ? 'k' + t.keep.mode + t.keep.n : '');
      exprParts.push(lead + name);
      detailParts.push(detailLead + name + ' [' + rolls.map((v, idx) => (kept[idx] ? v : '(' + v + ')')).join(', ') + ']');
    });

    let flag = '';
    const only = terms.length === 1 ? terms[0] : null;
    if (only && only.kind === 'dice' && only.count === 1 && only.sides === 20 && only.sign > 0) {
      if (only.rolls[0] === 20) flag = 'crit';
      if (only.rolls[0] === 1) flag = 'fail';
    }
    return { expr: exprParts.join(''), label, detail: detailParts.join(''), total, flag };
  }

  /* Teste do sistema: 2d6 + Atributo + Perícia (regras "Testes e Dados").
     - Cada 6 soma o atributo de novo, mas só vale 1 crítico por teste.
     - Cada 1 é uma perda: anula o bônus da perícia; duas perdas = falha completa.
     - Um 1 anula um 6.
     - Ganho: um 3º ou 4º dado entra na soma.
     o: { label, attrName, attr, skillName, skill, mods: [[nome, valor]], dice } */
  function rollTest(o) {
    const n = clamp(Math.round(o.dice || 2), 2, 4);
    const rolls = Array.from({ length: n }, () => randInt(6));
    const ones = rolls.filter((v) => v === 1).length;
    const sixes = rolls.filter((v) => v === 6).length;
    const crit = sixes > ones;
    const skillLost = ones > 0 && Boolean(o.skill);
    const mods = (o.mods || []).filter((x) => x && x[1]);
    const dice = rolls.reduce((t, v) => t + v, 0);
    const skill = skillLost ? 0 : (o.skill || 0);
    const total = dice + (o.attr || 0) + skill + mods.reduce((t, x) => t + x[1], 0) + (crit ? (o.attr || 0) : 0);
    const sg = (v) => (v < 0 ? ' - ' + Math.abs(v) : ' + ' + v);
    let detail = n + 'd6 [' + rolls.join(', ') + ']' + sg(o.attr || 0) + ' ' + o.attrName;
    if (o.skillName) detail += sg(o.skill || 0) + ' ' + o.skillName + (skillLost ? ' (anulada: perda)' : '');
    mods.forEach((x) => { detail += sg(x[1]) + ' ' + x[0]; });
    if (crit) detail += sg(o.attr || 0) + ' crítico (' + o.attrName + ')';
    if (ones >= 2) detail += ' · duas perdas: falha completa';
    const fixed = (o.attr || 0) + (o.skill || 0) + mods.reduce((t, x) => t + x[1], 0);
    return {
      expr: n + 'd6' + (fixed ? (fixed > 0 ? '+' : '') + fixed : ''),
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

    const summarize = (c) => ({ id: c.id, name: c.name, isOwner: c.ownerUid === ME });
    const toChar = (c) => ({
      id: c.id, name: c.name, type: c.type, image: c.image || '', thumb: c.thumb || '',
      species: c.species || '', age: c.age || '', origin: c.origin || '',
      campaignIds: (c.campaignIds || []).slice(), mine: c.ownerUid === ME,
      sheet: c.sheet ? clone(c.sheet) : null
    });
    const toLib = (e) => Object.assign(clone(e), { mine: e.ownerUid === ME });
    const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR');

    const listeners = {}; // campaignId -> Set de callbacks
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
        return Object.values(read().characters)
          .filter((c) => (!type || c.type === type) && matchesQuery(c, query))
          .sort((a, b) => (words(query).length ? byName(a, b) : (b.updatedAt || 0) - (a.updatedAt || 0)))
          .slice(0, 60)
          .map(toChar);
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
          .map((m) => Object.assign(toChar(d.characters[m.characterId]), { characterId: m.characterId, mine: m.ownerUid === ME }));
      },

      // ---------- Banco de itens (público; só quem criou edita ou exclui) ----------
      async searchLibrary({ kinds, query }) {
        return Object.values(read().library)
          .filter((e) => (!kinds || kinds.indexOf(e.kind) >= 0) && matchesText(libHay(e), query))
          .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
          .map(toLib);
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

      async touchCampaign() { /* no modo local tudo já está neste aparelho */ }
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
    const toCamp = (snap) => ({ id: snap.id, name: snap.data().name, isOwner: snap.data().ownerUid === me });

    // Fichas criadas antes da busca não têm searchKeys: completa em segundo plano
    function backfillKeys(snap) {
      const d = snap.data();
      if (Array.isArray(d.searchKeys)) return;
      snap.ref.update({ searchKeys: buildSearchKeys(d.name, d.species, d.origin) }).catch(() => {});
    }

    const db = {
      mode: 'firebase',

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

      // Busca: 1ª palavra = começo de alguma palavra (nome, espécie ou origem); o resto filtra aqui
      async searchCharacters(query, type) {
        const qs = words(query);
        const snap = qs.length
          ? await chars().where('searchKeys', 'array-contains', qs[0].slice(0, 20)).limit(60).get()
          : await chars().orderBy('updatedAt', 'desc').limit(30).get();
        snap.docs.forEach(backfillKeys);
        return snap.docs.map(toChar)
          .filter((c) => (!type || c.type === type) && matchesQuery(c, query))
          .sort((a, b) => (qs.length ? a.name.localeCompare(b.name, 'pt-BR') : 0));
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
          return Object.assign(toChar(cs), { characterId: d.id, mine: m.ownerUid === me, at });
        }));
        return rows.filter(Boolean).sort((x, y) => x.at - y.at);
      },

      // ---------- Banco de itens (público; só quem criou edita ou exclui) ----------
      async searchLibrary({ kinds, query }) {
        const qs = words(query || '');
        let snap;
        // sem busca, o banco aparece inteiro (os itens ficam visíveis desde o começo)
        if (qs.length) snap = await lib().where('searchKeys', 'array-contains', qs[0].slice(0, 20)).limit(500).get();
        else if (kinds && kinds.length) snap = await lib().where('kind', 'in', kinds.slice(0, 10)).get();
        else snap = await lib().get();
        return snap.docs.map(toLib)
          .filter((e) => (!kinds || kinds.indexOf(e.kind) >= 0) && matchesText(libHay(e), query))
          .sort((a, b) => b.updatedAt - a.updatedAt);
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
        if (e.id) { ref = lib().doc(e.id); await ref.update(data); }
        else { ref = lib().doc(); await ref.set(Object.assign({ ownerUid: me, createdAt: FV.serverTimestamp() }, data)); }
        return Object.assign({}, e, { id: ref.id, mine: true, updatedAt: Date.now() });
      },

      async deleteLibrary(id) {
        await lib().doc(id).delete();
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

  const openDialog = (dlg) => { if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', ''); };
  const closeDialog = (dlg) => { if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open'); };

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
      text: 'Nome, espécime, idade, altura, sexo e origem. O nome é único. "Buscar no banco" vincula um espécime: a vida base, os UP iniciais e o núcleo dele entram sozinhos na ficha.',
      rule: 'ficha/modelo-de-ficha'
    },
    rolagens: {
      title: 'Dados',
      text: 'Chat de rolagens da campanha. Comandos: d20, 2d6+3, 4d6kh3 (fica com os 3 maiores), 2d20kl1 (fica com o menor) e um comentário depois de #. A rolagem sai em nome do personagem escolhido em "Rolando como". Nas regras, todos os testes usam 2d6 + Atributo + Perícia.',
      rule: 'testes-e-dados/rolagens'
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
      text: '10 XP viram 1 UP. A cada UP par alcançado, 2 benefícios entre +5 PV, +5 PE e +1 PA; a cada ímpar, +1 ponto de perícia. UP de origem não contam para isso. Poderes custam UP; cada UP investido em perícias dá +3 pontos.',
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
    if (action) {
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
      const pend = Math.max(0, m.picksAllowed - m.picksUsed) + Math.max(0, m.upTotal - m.upSpent) + Math.max(0, m.skillBudget - m.skillUsed);
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
    if (m.mine && m.sheet) {
      const st = memberAtk[m.characterId] = memberAtk[m.characterId] || { uid: null, mode: '', shots: 1, mod: 0 };
      const acts = h('div', 'member__actions', h('h3', 'member__sub', 'Ações'));
      acts.append(attackBuilder(Object.assign({}, m, { sheet: normSheet(m.sheet) }), st, async (t, btn) => {
        btn.disabled = true;
        await campaignRoll(m, rollTest(t));
        btn.disabled = false;
      }, 'atk-' + m.characterId + '-'));
      info.append(acts);
    }
    panel.replaceChildren(pic, info);
  }

  const memberAtk = {}; // escolhas de ataque de cada personagem, enquanto a página estiver aberta
  const fmtCronos = (n) => Math.round(n).toLocaleString('pt-BR');

  // Altera a ficha de um candidato a partir da campanha: lê a versão atual antes de salvar
  async function patchMemberSheet(m, fn) {
    const fresh = await db.getCharacter(m.characterId);
    if (!fresh) throw new UserError('Essa ficha não existe mais.');
    const sheet = normSheet(fresh.sheet);
    fn(sheet);
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
        } catch (err) { toast(errorMessage(err)); b.disabled = false; }
      });
      return b;
    };
    return h('div', 'money-edit', inp, act('Adicionar', 1), act('Retirar', -1));
  }

  // Rolagem feita a partir da campanha, em nome de um personagem seu
  async function campaignRoll(m, r) {
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
      h('div', 'roll__total', String(r.total)));
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
  views.home = async function showHome() { /* só a etiqueta de modo, tratada por setMode() */ };

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

  async function runSearch() {
    const seq = ++searchSeq;
    const q = inSearch.value;
    const type = formSearch.elements.stype.value;
    const origin = $('#search-origin').value;
    if (!words(q).length && !origin) { // personagens só aparecem buscando
      $('#search-list').replaceChildren();
      $('#search-empty').hidden = true;
      $('#search-hint').textContent = 'Digite um nome, espécie ou origem (ou escolha uma origem) para encontrar fichas.';
      return;
    }
    let list;
    try {
      // a origem entra na busca (os termos procuram nome, espécie e origem) e depois filtra exata
      list = await db.searchCharacters((q + ' ' + origin).trim(), type);
      if (origin) list = list.filter((c) => nameKey(c.origin) === nameKey(origin));
    }
    catch (err) {
      if (seq === searchSeq) $('#search-hint').textContent = errorMessage(err);
      return;
    }
    if (seq !== searchSeq) return; // uma busca mais nova já saiu
    $('#search-list').replaceChildren(...list.map(searchRow));
    $('#search-empty').hidden = list.length > 0;
    $('#search-hint').textContent = plural(list.length, 'ficha encontrada', 'fichas encontradas') + (origin ? ' com a origem ' + origin : '');
  }
  const liveSearch = debounce(runSearch, 300);
  inSearch.addEventListener('input', liveSearch);
  $$('input[name="stype"]', formSearch).forEach((r) => r.addEventListener('change', runSearch));
  $('#search-origin').addEventListener('change', runSearch);
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
    if (name.length < 3) { setError(errCampName, inCampName, 'Dê um nome com pelo menos 3 letras.'); inCampName.focus(); return; }
    try {
      const camp = await db.createCampaign(name);
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

  views.campanhas = async function showCampanhas() {
    setError(errCampName, inCampName, '');
    const camps = await db.listMyCampaigns().catch((e) => { toast(errorMessage(e)); return []; });
    camps.push(...await profileCamps(camps.map((c) => c.id)));
    $('#camp-list').replaceChildren(...camps.map((c) => campaignRow(c, c.isOwner
      ? { label: 'Excluir', onClick: async () => { if (await deleteCampaignFlow(c)) views.campanhas(); } }
      : null)));
    $('#camp-empty').hidden = camps.length > 0;
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
  function openLogin() {
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
      go('perfil');
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
  const BUILTINS = (ITEM_DATA.catalogo || []).map((e) => Object.assign(decorate(e), { oficial: true, mine: false }));

  // Catálogo oficial sempre aparece; se o banco compartilhado falhar, o aviso fica em libSearch.warn
  async function libSearch(kinds, q) {
    const off = BUILTINS.filter((e) => (!kinds || kinds.indexOf(e.kind) >= 0) && matchesText(libHay(e), q));
    libSearch.warn = '';
    let own = [];
    try { own = await db.searchLibrary({ kinds, query: q }); }
    catch (err) { console.warn(err); libSearch.warn = errorMessage(err); }
    return off.concat(own.map(decorate));
  }

  function entryIcon(e) {
    const el = h('span', 'lib-icon' + (e.kind === 'mod-arma' ? ' lib-icon--mod' : ''));
    const color = e.values && rarColor(e.values.raridade);
    if (color) el.style.setProperty('--rar', color);
    if (e.thumb) { const img = h('img'); img.src = e.thumb; img.alt = ''; el.append(img); }
    else el.textContent = (e.name || '?').trim().charAt(0).toUpperCase();
    return el;
  }
  function entryMeta(e) {
    const v = e.values || {};
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
    const row = h('li', 'row lib-row', h('span', 'row__open row__open--static', entryIcon(e), main), starButton(e, onFav));
    (actions || []).forEach((a) => {
      const b = h('button', 'btn btn--sm ' + (a.cls || 'btn--ghost'), a.label);
      b.type = 'button';
      b.setAttribute('aria-label', a.label + ': ' + e.name);
      b.addEventListener('click', a.onClick);
      row.append(b);
    });
    return row;
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
    catch (err) { warn = errorMessage(err); list = BUILTINS.filter((e) => o.kinds.indexOf(e.kind) >= 0 && matchesText(libHay(e), q)); }
    if (seq !== pk.seq || pk.opts !== o) return;
    const favs = favLoad();
    const favOnly = $('#picker-fav').checked;
    // chips escolhidos pela pessoa: mostra só essas categorias (nenhum escolhido = todas)
    const picked = (o.chips || []).filter((c) => c && c.kinds && pk.on.has(c.label));
    const allowed = picked.length ? picked.reduce((t, c) => t.concat(c.kinds), []) : null;
    list = list.filter((e) => (!o.filter || o.filter(e)) && (!favOnly || favs.has(e.id)) && (!allowed || allowed.indexOf(e.kind) >= 0));
    list.sort((a, b) => (Number(favs.has(b.id)) - Number(favs.has(a.id))) || a.name.localeCompare(b.name, 'pt-BR'));
    $('#picker-list').replaceChildren(...list.map((e) => libRow(e,
      [{ label: 'Escolher', cls: 'btn--primary', onClick: () => finishPicker(deep(e)) }],
      () => { if ($('#picker-fav').checked) runPicker(); })));
    $('#picker-empty').hidden = list.length > 0;
    $('#picker-hint').textContent = warn || plural(list.length, 'opção compatível', 'opções compatíveis') + (favOnly ? ' entre os favoritos' : '');
  }

  function openPicker(opts) {
    if (pk.resolve) finishPicker(null);
    return new Promise((resolve) => {
      pk.opts = opts;
      pk.resolve = resolve;
      $('#picker-title').textContent = opts.title;
      pk.on = new Set();
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
      $('#picker-empty').hidden = true;
      $('#picker-hint').textContent = 'Buscando...';
      openDialog(pickerDlg);
      runPicker();
      if (window.matchMedia('(pointer: fine)').matches) $('#picker-q').focus();
    });
  }
  $('#picker-q').addEventListener('input', debounce(runPicker, 250));
  $('#picker-fav').addEventListener('change', runPicker);
  $('#picker-close').addEventListener('click', () => finishPicker(null));
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
      const grouped = f.kind === 'multi' || f.kind === 'rarity' || f.kind === 'cards';
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
    const bonus = {};
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
      toast(name + (d.id ? ': alterações salvas.' : ' entrou no banco.'));
      itemState.draft = null;
      setItemStep('categoria');
      await runLib();
      $('#lib-title').scrollIntoView({ block: 'start' });
    } catch (err) { toast(errorMessage(err)); }
    finally { btn.disabled = false; }
  });

  /* Lista do banco na Oficina */
  let libSeq = 0;
  async function runLib() {
    const seq = ++libSeq;
    const q = $('#lib-q').value;
    const kind = $('#lib-kind').value;
    let list;
    try { list = await libSearch(kind ? [kind] : null, q); }
    catch (err) { if (seq === libSeq) $('#lib-hint').textContent = errorMessage(err); return; }
    if (seq !== libSeq) return;
    const favs = favLoad();
    if ($('#lib-fav').checked) list = list.filter((e) => favs.has(e.id));
    if ($('#lib-mine').checked) list = list.filter((e) => e.mine);
    const maker = $('#lib-maker').value;
    if (maker) list = list.filter((e) => (e.values || {}).fabricante === maker);
    list.sort((a, b) => (Number(b.mine) - Number(a.mine)) || (Number(Boolean(a.oficial)) - Number(Boolean(b.oficial))) || a.name.localeCompare(b.name, 'pt-BR'));
    $('#lib-list').replaceChildren(...list.map((e) => {
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
    $('#lib-empty').hidden = list.length > 0;
    $('#lib-hint').textContent = libSearch.warn
      ? plural(list.length, 'registro', 'registros') + ' do catálogo oficial. O banco compartilhado não abriu: ' + libSearch.warn
      : plural(list.length, 'registro', 'registros') + (db.mode === 'firebase' ? ' (banco compartilhado + catálogo oficial).' : ' (este aparelho + catálogo oficial).');
  }
  $('#lib-q').addEventListener('input', debounce(runLib, 300));
  ['#lib-kind', '#lib-maker', '#lib-fav', '#lib-mine'].forEach((sel) => $(sel).addEventListener('change', runLib));
  (function fillLibKinds() {
    const sel = $('#lib-kind');
    const all = h('option', '', 'Todas');
    all.value = '';
    sel.append(all);
    ITEM_DATA.categories.forEach((c) => { const o = h('option', '', c.title); o.value = c.id; sel.append(o); });
    const mk = $('#lib-maker');
    const any = h('option', '', 'Todas');
    any.value = '';
    mk.append(any);
    (ITEM_DATA.fabricantes || []).forEach((f) => { const o = h('option', '', f); o.value = f; mk.append(o); });
  })();

  /* Catálogo na tela Personagens: ver todas as origens, espécimes, poderes e itens, só leitura */
  const CAT_GROUPS = [
    { label: 'Origens', kinds: ['origem'] },
    { label: 'Espécimes', kinds: ['especime'] },
    { label: 'Poderes', kinds: ['poder'] },
    { label: 'Armas', kinds: ['arma-melee', 'arma-fogo'] },
    { label: 'Proteção', kinds: ['armadura', 'vestivel'] },
    { label: 'Implantes', kinds: ['nucleo', 'protese-modulo'] },
    { label: 'Peças de slot', kinds: ['mod-arma', 'propriedade', 'acessorio'] },
    { label: 'Itens gerais', kinds: ['item-geral'] },
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
      return;
    }
    $('#cat-hint').textContent = 'Buscando...';
    let list = await libSearch(g ? g.kinds : null, q);
    if (seq !== catState.seq) return;
    list.sort((a, b) => (a.kindTitle || '').localeCompare(b.kindTitle || '', 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));
    $('#cat-list').replaceChildren(...list.map((e) => libRow(e, [])));
    $('#cat-empty').hidden = list.length > 0;
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
        $$('#cat-chips .chip--toggle').forEach((x) => x.setAttribute('aria-pressed', String(x === b && catState.group === g)));
        runCatalog();
      });
      return b;
    }));
  })();
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
      xp: 0, upExtra: 0, up: { pv: 0, pe: 0, pa: 0, per: 0 }, extra: { pv: 0, escudo: 0, blindagem: 0, pe: 0, pa: 0 },
      cur: {}, specimen: null, powers: [], inventory: [], originItems: ''
    };
  }
  function normSheet(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const b = blankSheet();
    const s = Object.assign({}, b, r);
    ['attrs', 'up', 'extra', 'skills', 'cur'].forEach((k) => { s[k] = Object.assign({}, b[k], r[k] && typeof r[k] === 'object' ? r[k] : {}); });
    s.powers = Array.isArray(r.powers) ? r.powers : [];
    s.profs = Array.isArray(r.profs) ? r.profs.filter((x) => typeof x === 'string') : [];
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
  const isProficient = (s, i) => { const id = profIdOf(i); return Boolean(id) && s.profs.indexOf(id) >= 0; };
  const ccOf = (i) => (i.values.cc === '' || i.values.cc === undefined ? 1 : num(i.values.cc));
  const isModule = (i) => i.kind === 'protese-modulo' && i.values.classe === 'Módulo';
  const twoHanded = (i) => /duas/i.test(String((i.values && i.values.empunhadura) || ''));

  function compute(c) {
    const s = c.sheet;
    const a = s.attrs;
    const sp = s.specimen;
    const official = sp ? BUILTINS.find((e) => e.id === sp.id) : null; // fichas antigas ganham os traços novos do espécime oficial
    const spv = Object.assign({}, official ? official.values : {}, (sp && sp.values) || {});
    const equipped = s.inventory.filter((i) => i.slot);
    const armor = equipped.find((i) => i.slot === 'armadura');
    const core = equipped.find((i) => i.slot === 'nucleo');

    // núcleo: só um ativo (o da espécie, o implantado ou o da armadura; vale o maior)
    const nucleo = Math.max(num(spv.nucleoBase), core ? num(core.values.capacidade) : 0, armor && armor.values.nucleo === 'Sim' ? num(armor.values.capacidade) : 0);
    const implants = equipped.filter((i) => i.kind === 'protese-modulo');
    const protUsed = implants.filter((i) => !isModule(i)).reduce((t, i) => t + ccOf(i), 0);
    const modUsed = implants.filter(isModule).reduce((t, i) => t + ccOf(i), 0);
    // Engenharia (ex.: Android): armas e armadura acopladas ocupam a Carga Cibernética, não a carga,
    // e o núcleo dá +1 de CC a cada +2 de carga que concede
    const acopla = spv.acopla === 'Sim';
    const attached = acopla ? equipped.filter((i) => isWeapon(i.kind) || i.kind === 'armadura') : [];
    const attachUsed = Math.round(attached.reduce((t, i) => t + parseCarga(i.values.carga), 0) * 100) / 100;
    const coreCarga = acopla && core ? num(entryBonus(core).carga) : 0;
    const ccMax = nucleo > 0 ? Math.max(0, nucleo + a.corpo) + (acopla ? Math.floor(Math.max(0, coreCarga) / 2) : 0) : 0;
    const modExtra = nucleo > 0 ? Math.max(0, a.essencia) : 0;

    const sources = [];
    if (sp) sources.push({ name: sp.name, b: sp.bonus || {} });
    s.powers.forEach((p) => sources.push({ name: p.name, b: p.bonus || {} }));
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
    const base = spv.vidaBase === 'Blindagem' ? 'blindagem' : spv.vidaBase === 'Escudo' ? 'escudo' : 'pv';
    if (base !== 'pv') {
      src[base].unshift({ name: 'PV convertidos (' + sp.name + ')', val: total('pv') });
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
    const cargaUsed = s.inventory.reduce((t, i) => (i.slot ? t : t + parseCarga(i.values.carga) * (i.qty || 1)), 0);

    const max = {};
    Object.keys(src).forEach((k) => { max[k] = Math.max(0, Math.round(total(k) * 100) / 100); });
    const powerCost = s.powers.reduce((t, p) => t + num(p.values && p.values.custo), 0);
    const upEarned = Math.floor(num(s.xp) / 10); // os de origem/espécie não contam para os benefícios
    return {
      max, src, base, pen, armor, armorProf, nucleo, core,
      cargaUsed: Math.round(cargaUsed * 100) / 100, cargaMax: max.carga, over: cargaUsed > max.carga,
      defMin: max.armadura + a.corpo + num(s.skills.resistencia),
      ccMax, modExtra, protUsed, modUsed, acopla, attachUsed, humanidade: spv.humanidade === 'Sim',
      ccOver: (nucleo > 0 || attachUsed > 0) && (protUsed + attachUsed > ccMax || protUsed + attachUsed + modUsed > ccMax + modExtra),
      upEarned, upTotal: upEarned + num(spv.upInicial) + num(s.upExtra),
      upSpent: s.up.per + powerCost,
      picksAllowed: 2 * Math.floor(upEarned / 2), picksUsed: s.up.pv + s.up.pe + s.up.pa,
      skillBudget: 5 + Math.ceil(upEarned / 2) + 3 * s.up.per,
      skillUsed: Object.keys(s.skills).reduce((t, k) => t + num(s.skills[k]), 0)
    };
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
  const watch = { id: null, over: false, pending: 0 };

  /* Pendências: pontos e recursos ainda por distribuir */
  function pendingList(m) {
    const s = sheetChar.sheet;
    const out = [];
    const picks = m.picksAllowed - m.picksUsed;
    const up = m.upTotal - m.upSpent;
    const skills = m.skillBudget - m.skillUsed;
    if (!s.setup) out.push({ n: 0, text: 'A distribuição inicial (atributos e perícias) ainda não foi feita.', label: 'Fazer agora', go: () => openSetup() });
    if (picks > 0) out.push({ n: picks, text: plural(picks, 'benefício de recurso', 'benefícios de recurso') + ' para escolher: +5 PV, +5 PE ou +1 PA.', label: 'Escolher', go: '#prog-block' });
    if (up > 0) out.push({ n: up, text: plural(up, 'UP livre', 'UP livres') + ' para gastar em poderes ou perícias.', label: 'Ver progressão', go: '#prog-block' });
    if (skills > 0) out.push({ n: skills, text: plural(skills, 'ponto de perícia', 'pontos de perícia') + ' para distribuir.', label: 'Ver perícias', go: '#skills-block' });
    return out;
  }

  function renderAlerts(m) {
    const list = pendingList(m);
    const box = $('#sheet-alerts');
    box.hidden = !list.length;
    box.replaceChildren(...(list.length ? [h('p', 'alerts__title', 'Há o que distribuir')] : []), ...list.map((p) => {
      const b = h('button', 'link-btn', p.label);
      b.type = 'button';
      b.addEventListener('click', () => {
        if (typeof p.go === 'function') { p.go(); return; }
        const el = $(p.go);
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); const f = $('button:not(:disabled), input', el); if (f) f.focus({ preventScroll: true }); }
      });
      return h('p', 'alerts__item', p.text + ' ', b);
    }));
    const count = list.reduce((t, p) => t + p.n, 0);
    if (watch.id === sheetChar.id && count > watch.pending) {
      const fresh = list.filter((p) => p.n).map((p) => p.text.replace(/[.:].*$/, '')).join(' · ');
      if (fresh) toast('Novos pontos para distribuir: ' + fresh + '.');
    }
    watch.pending = count;
  }

  // Redesenha a ficha inteira e devolve o foco ao controle que estava em uso
  function rerender() {
    const a = document.activeElement;
    const fid = a && a.dataset ? a.dataset.fid : null;
    const m = compute(sheetChar);
    renderAttrs(m);
    renderResources(m);
    renderSkills(m);
    renderProfs();
    renderProgress(m);
    renderSpeciesLink();
    renderPowers(m);
    renderInventory(m);
    renderAlerts(m);
    // avisa quando a carga passa do limite (colocar ou tirar itens nunca é bloqueado)
    if (watch.id === sheetChar.id && m.over && !watch.over) toast('Carga ' + fmtNum(m.cargaUsed) + ' / ' + fmtNum(m.cargaMax) + '. ' + OVERLOAD_TEXT);
    watch.over = m.over;
    watch.id = sheetChar.id;
    $('#setup-open').textContent = sheetChar.sheet.setup ? 'Refazer distribuição inicial' : 'Distribuição inicial';
    if (fid) { const el = $('[data-fid="' + fid + '"]'); if (el && !el.disabled) el.focus({ preventScroll: true }); }
  }
  const changed = () => { touchSheet(); rerender(); };

  function renderAttrs(m) {
    const s = sheetChar.sheet;
    const feeds = {
      corpo: (m.base === 'pv' ? 'PV ' : m.base === 'blindagem' ? 'Blindagem ' : 'Escudo ') + m.max[m.base] + ' · Carga ' + fmtNum(m.cargaMax),
      precisao: 'PA ' + m.max.pa,
      essencia: 'PE ' + m.max.pe
    };
    $('#attr-band').replaceChildren(...ATTRS.map((at) => {
      const v = s.attrs[at.id];
      const tile = h('div', 'attr attr--' + at.id,
        h('span', 'attr__name', at.label),
        h('span', 'attr__value', signed(v)),
        stepper(v, { min: -1, max: 6, label: at.label, fid: 'attr-' + at.id, text: '', onChange: (n) => { s.attrs[at.id] = n; changed(); } }),
        h('span', 'attr__feeds', feeds[at.id]));
      tile.title = at.hint;
      return tile;
    }));
  }

  function resRow(key, label, cur, max, src) {
    const s = sheetChar.sheet;
    const set = (v) => { setCur(s, key, v, max); changed(); };
    const inp = h('input', 'input res__cur');
    inp.type = 'number';
    inp.inputMode = 'numeric';
    inp.value = cur;
    inp.min = curMin(key, max);
    inp.max = max;
    inp.dataset.fid = 'cur-' + key;
    inp.setAttribute('aria-label', label + ' atual');
    inp.addEventListener('change', () => set(inp.value));
    const btn = (txt, d) => {
      const b = h('button', 'stepper__btn', txt);
      b.type = 'button';
      b.dataset.fid = 'cur-' + key + (d < 0 ? '-' : '+');
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
    else if (lifeCur <= 0) state = m.base === 'pv' ? 'Agonizando: teste de Fortitude (CD 6, +1 a cada tentativa no dia).' : 'Sem resistência.';

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
      stat('Deslocamento', m.over ? '4,5 m' : '9 m', m.over ? 'sobrecarregado: metade' : 'padrão'),
      stat('Penalidade de armadura', m.pen ? '–' + m.pen : '—', m.pen ? 'Manha, Reflexos, Sentidos e Operações' + (m.armorProf ? '' : ' (dobrada: sem proficiência)') : (m.armor ? m.armor.name : 'sem armadura equipada')));

    // dano entra sempre na ordem Escudo → Blindagem → Vida
    const dmg = h('input', 'input res__dmg');
    dmg.type = 'number';
    dmg.min = '1';
    dmg.step = '1';
    dmg.inputMode = 'numeric';
    dmg.placeholder = 'Dano';
    dmg.setAttribute('aria-label', 'Dano sofrido');
    const dmgForm = h('form', 'res-dmg', dmg, (() => { const b = h('button', 'btn btn--danger btn--sm', 'Sofrer dano'); b.type = 'submit'; return b; })());
    dmgForm.title = 'O dano é aplicado na ordem Escudo → Blindagem → Vida.';
    dmgForm.addEventListener('submit', (ev) => {
      ev.preventDefault();
      let left = Math.round(num(dmg.value));
      if (left < 1) { dmg.focus(); return; }
      ['escudo', 'blindagem', 'pv'].forEach((k) => {
        const mx = m.max[k];
        if (!mx || left <= 0) return;
        const cur = getCur(s, k, mx);
        const take = Math.min(left, cur - curMin(k, mx));
        left -= take;
        setCur(s, k, cur - take, mx);
      });
      changed();
    });
    const shortRest = h('button', 'btn btn--ghost btn--sm', 'Descanso curto (metade)');
    shortRest.type = 'button';
    shortRest.dataset.fid = 'rest-short';
    shortRest.title = 'De 1 a 4 horas: recupera metade dos recursos (PV, PE e PA). Em descansos curtos seguidos, a recuperação cai pela metade a cada vez.';
    shortRest.addEventListener('click', () => {
      const keys = ['pv', 'pe', 'pa'];
      if (m.humanidade && m.base !== 'pv') keys.push(m.base); // Humanidade: a vida convertida também regenera como orgânica
      keys.forEach((k) => { const mx = m.max[k]; if (mx) setCur(s, k, getCur(s, k, mx) + Math.ceil(mx / 2), mx); });
      changed();
      toast('Descanso curto: metade de ' + (m.humanidade && m.base !== 'pv' ? (m.base === 'blindagem' ? 'Blindagem' : 'Escudo') + ', ' : '') + 'PV, PE e PA recuperada.');
    });

    const rest = h('button', 'btn btn--ghost btn--sm', 'Descanso longo (tudo)');
    rest.type = 'button';
    rest.dataset.fid = 'rest';
    rest.addEventListener('click', () => { s.cur = {}; changed(); toast('Todos os recursos recuperados.'); });

    const wasOpen = Boolean($('#res-extra') && $('#res-extra').open);
    const extra = h('details', 'bonus');
    extra.id = 'res-extra';
    extra.open = wasOpen;
    extra.append(h('summary', '', 'Ajustes manuais (outras fontes)'),
      h('p', 'field__hint', 'Para bônus que não vêm de item, poder ou espécime. Somam no máximo de cada recurso.'),
      h('div', 'bonus__grid', ...BONUS_KEYS.filter((b) => b[0] in s.extra).map((b) => {
        const inp = h('input', 'input');
        inp.type = 'number';
        inp.step = '1';
        inp.id = 'extra-' + b[0];
        inp.dataset.fid = 'extra-' + b[0];
        inp.value = num(s.extra[b[0]]) || '';
        inp.placeholder = '0';
        inp.addEventListener('change', () => { s.extra[b[0]] = Math.round(num(inp.value)); changed(); });
        const lab = h('label', 'field__label bonus__label bonus__label--' + b[0], b[1]);
        lab.htmlFor = inp.id;
        return h('div', 'field', lab, inp);
      })));

    box.replaceChildren(lifeBox, other, stats, h('div', 'res-actions', dmgForm, shortRest, rest), extra);
  }

  function renderSkills(m) {
    const s = sheetChar.sheet;
    $('#skills-hint').textContent = 'Teste = 2d6 + atributo + perícia (as rolagens ficam na campanha). Pontos de perícia: ' + m.skillUsed + ' de ' + m.skillBudget + '.';
    $('#skills-block').replaceChildren(...ATTRS.map((at) => {
      const group = h('div', 'skills skills--' + at.id, h('h3', 'skills__title', at.label + ' ', h('span', 'skills__attr', signed(s.attrs[at.id]))));
      SKILLS[at.id].forEach((sk) => {
        const v = num(s.skills[sk[0]]);
        const pen = PENALTY_SKILLS.indexOf(sk[0]) >= 0 ? m.pen : 0;
        const total = h('span', 'skill__total', signed(s.attrs[at.id] + v - pen));
        total.title = 'Atributo ' + signed(s.attrs[at.id]) + ', perícia +' + v + (pen ? ', armadura –' + pen : '');
        const row = h('div', 'skill',
          h('span', 'skill__name', sk[1], pen ? h('span', 'skill__pen', ' –' + pen + ' armadura') : null),
          total,
          stepper(v, { min: 0, max: 3, label: sk[1], fid: 'sk-' + sk[0], text: '+' + v, onChange: (n) => { s.skills[sk[0]] = n; changed(); } }));
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
    const s = sheetChar.sheet;
    const numField = (id, label, value, onSet) => {
      const inp = h('input', 'input');
      inp.type = 'number';
      inp.min = '0';
      inp.step = '1';
      inp.id = id;
      inp.dataset.fid = id;
      inp.value = value || '';
      inp.placeholder = '0';
      inp.addEventListener('change', () => { onSet(Math.max(0, Math.round(num(inp.value)))); changed(); });
      const lab = h('label', 'field__label', label);
      lab.htmlFor = id;
      return h('div', 'field', lab, inp);
    };
    const free = m.upTotal - m.upSpent;
    const picksLeft = m.picksAllowed - m.picksUsed;
    const buy = (key, label, max) => h('div', 'buy',
      h('span', 'buy__label', label),
      stepper(s.up[key], { min: 0, max, label, fid: 'up-' + key, onChange: (n) => { s.up[key] = n; changed(); } }));
    const pick = (key, label) => buy(key, label, s.up[key] + Math.max(0, picksLeft));
    $('#prog-block').replaceChildren(
      h('div', 'fields-grid',
        numField('f-xp', 'XP (10 XP = 1 UP)', s.xp, (v) => { s.xp = v; }),
        numField('f-up-extra', 'UP de origem ou extras', s.upExtra, (v) => { s.upExtra = v; })),
      h('p', 'prog__sum' + (free < 0 ? ' prog__sum--over' : ''), 'UP: ' + m.upTotal + ' no total (' + m.upEarned + ' por XP) · ' + m.upSpent + ' gastos · ' + free + (free === 1 ? ' livre' : ' livres')),
      h('p', 'prog__sum' + (picksLeft < 0 ? ' prog__sum--over' : ''), 'Benefícios: ' + m.picksUsed + ' de ' + m.picksAllowed + ' escolhidos'),
      h('div', 'buys', pick('pv', '+5 PV'), pick('pe', '+5 PE'), pick('pa', '+1 PA')),
      h('p', 'field__hint', 'A cada UP par alcançado (sem contar os de origem), escolha 2 benefícios. A cada UP ímpar, +1 ponto de perícia (já somado nos pontos de perícia).'),
      h('div', 'buys', buy('per', 'UP investidos em perícias', 99)),
      h('p', 'field__hint', 'Cada UP investido em perícias dá +3 pontos livres. Poderes custam UP conforme o custo de cada um.'));
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
      h('h3', 'sub-title', 'Proficiências ', h('span', 'count', '(' + s.profs.length + ' de 4 iniciais)')),
      profPills(s.profs, (id, on) => { s.profs = s.profs.filter((x) => x !== id); if (on) s.profs.push(id); changed(); }, 0),
      h('p', 'field__hint', 'Em armas: cadência perita e o aprimoramento do tipo. Em armaduras: a penalidade não dobra e a defesa ganha +1. Usar um item fora da empunhadura ideal conta como sem proficiência.'));
  }

  function renderSpeciesLink() {
    const s = sheetChar.sheet;
    const box = $('#species-link');
    if (!s.specimen) { box.textContent = 'Sem vínculo com o banco: escolha um espécime para aplicar vida base, UP iniciais e núcleo.'; return; }
    const v = s.specimen.values || {};
    const un = h('button', 'link-btn', 'Desvincular');
    un.type = 'button';
    un.addEventListener('click', () => { s.specimen = null; changed(); });
    box.replaceChildren('Traços de ' + s.specimen.name + ': vida base ' + (v.vidaBase || 'PV') + ', ' + num(v.upInicial) + ' UP iniciais' + (num(v.nucleoBase) ? ', núcleo +' + num(v.nucleoBase) : '') + '. ', un);
    const lb = entryLore(s.specimen);
    if (lb) box.append(' ', lb);
    if (v.tracos) box.title = v.tracos;
  }

  function bonusLine(b) {
    return BONUS_KEYS.filter((k) => num(b[k[0]])).map((k) => k[1] + ' ' + signed(num(b[k[0]]))).join(' · ');
  }

  function renderPowers() {
    const s = sheetChar.sheet;
    $('#power-list').replaceChildren(...s.powers.map((p, i) => {
      const v = p.values || {};
      const meta = [num(v.custo) ? 'Custo ' + num(v.custo) + ' UP' : '', v.custoUso ? 'Uso: ' + v.custoUso : '', bonusLine(p.bonus || {})].filter(Boolean).join(' · ');
      const main = h('span', 'row__main', h('span', 'row__title', p.name, ...(entryLore(p) ? [' ', entryLore(p)] : [])), h('span', 'row__meta', meta));
      if (v.efeito) main.append(h('span', 'row__text', v.efeito));
      const del = h('button', 'btn btn--ghost btn--sm', 'Remover');
      del.type = 'button';
      del.setAttribute('aria-label', 'Remover poder ' + p.name);
      del.addEventListener('click', () => { s.powers.splice(i, 1); changed(); });
      return h('li', 'row lib-row', h('span', 'row__open row__open--static', entryIcon(p), main), del);
    }));
    $('#power-empty').hidden = s.powers.length > 0;
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
    add('Dano', v.dano); add('Propriedade', v.subtipo); add('Modo', v.modo); add('Cadência', v.cadencia); add('Pente', v.pente); add('Munição', v.municao); add('Alcance', v.alcance); add('Empunhadura', v.empunhadura);
    if (i.kind === 'armadura') {
      add('Defesa', v.armadura);
      add('Penalidade', num(v.penalidade) ? '–' + Math.abs(num(v.penalidade)) + ' (sem proficiência –' + Math.abs(num(v.penalidade)) * 2 + ')' : 'nenhuma');
      if (v.nucleo === 'Sim') add('Núcleo', '+' + num(v.capacidade));
    }
    if (i.kind === 'nucleo') add('Capacidade', v.capacidade);
    if (i.kind === 'protese-modulo') { add('Classe', v.classe || 'Prótese'); add('Tipo', [v.tipo, ccOf(i) + ' CC'].filter(Boolean).join(' · ')); }
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
    const b = bonusLine(entryBonus(i));
    if (b) card.append(h('p', 'cell__text', 'Bônus: ' + b + (i.slot ? '' : ' (só equipado)')));
    const text = entryText(i);
    if (text) card.append(h('p', 'cell__text cell__text--clamp', text));

    const actions = h('div', 'cell__actions');
    if (i.slot) actions.append(act('Guardar na mochila', 'btn--ghost', () => { i.slot = ''; changed(); }));
    else {
      const opts = slotsFor(i);
      if (opts[0] === 'modulo') actions.append(act('Instalar', 'btn--primary', () => { if (equipItem(i, 'modulo')) changed(); }));
      else if (opts[0] === 'mao-d' && twoHanded(i)) actions.append(act('Empunhar (duas mãos)', 'btn--primary', () => { if (equipItem(i, 'mao-d')) changed(); }));
      else if (opts.length === 1) actions.append(act('Equipar', 'btn--primary', () => { if (equipItem(i, opts[0])) changed(); }));
      else opts.forEach((id) => actions.append(act(slotDef(id).full, 'btn--primary', () => { if (equipItem(i, id)) changed(); })));
    }
    actions.append(act('Detalhes', 'btn--ghost', () => openInvDialog(i.uid)));
    actions.append(act('Remover', 'btn--danger', () => removeInvItem(i)));
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
      line('Defesa mínima', m.defMin + ' = ' + srcText(m.src.armadura) + ' · Corpo ' + signed(s.attrs.corpo) + ' · Resistência +' + num(s.skills.resistencia)),
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
    const dl = h('dl', 'member__data');
    ((cat && cat.fields) || []).forEach((f) => {
      const v = i.values[f.key];
      if (f.key === 'nome' || f.key === 'lore' || v === undefined || v === '') return;
      dl.append(h('dt', '', f.label.replace(/\s*\(.*\)$/, '')), h('dd', '', f.key === 'fabricante' ? makerTag(String(v)) : String(v)));
    });
    const b = bonusLine(entryBonus(i));
    if (b) dl.append(h('dt', '', 'Bônus'), h('dd', '', b + (i.slot ? '' : ' (só quando equipado)')));
    body.replaceChildren();
    if (dl.children.length) body.append(dl);
    if (cat && cat.slots && cat.slots !== 'mod') body.append(slotEditor(i, () => { touchSheet(); rerender(); }));

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
    const del = h('button', 'btn btn--danger btn--sm', 'Tirar do inventário');
    del.type = 'button';
    del.addEventListener('click', () => { s.inventory.splice(s.inventory.indexOf(i), 1); closeDialog(invDlg); changed(); });
    body.append(h('div', 'inv__foot', h('div', 'field inv__qty', qLab, qty), del));
    if (keepFocus) { const el = document.getElementById(keepFocus); if (el) el.focus({ preventScroll: true }); }
  }
  function openInvDialog(u) {
    invDlgUid = u;
    fillInvDialog();
    openDialog(invDlg);
  }
  $('#inv-dialog-close').addEventListener('click', () => closeDialog(invDlg));

  $('#inv-add').addEventListener('click', async () => {
    const ch = sheetChar;
    const e = await openPicker({ title: 'Adicionar ao inventário', kinds: INVENTORY_KINDS, chips: [
      { label: 'Armas', kinds: ['arma-melee', 'arma-fogo'] }, { label: 'Armaduras', kinds: ['armadura'] }, { label: 'Vestíveis', kinds: ['vestivel'] },
      { label: 'Implantes', kinds: ['nucleo', 'protese-modulo'] }, { label: 'Itens gerais', kinds: ['item-geral'] }], filter: (x) => INVENTORY_KINDS.indexOf(x.kind) >= 0 });
    if (!e || sheetChar !== ch) return;
    const entry = Object.assign(slotSnap(e), { uid: uid(), slots: normSlots(e.slots), thumb: e.thumb || '', qty: 1, slot: '' });
    const wasOver = compute(ch).over;
    ch.sheet.inventory.push(entry);
    changed();
    const m = compute(ch);
    // não impede: só avisa das desvantagens quando a carga passa do limite
    toast(e.name + ' entrou no inventário.' + (m.over ? (wasOver ? ' Continua sobrecarregado (' : ' Agora está sobrecarregado (') + fmtNum(m.cargaUsed) + ' / ' + fmtNum(m.cargaMax) + '): deslocamento pela metade e ações físicas sobem uma categoria.' : ''));
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
    const have = ch.sheet.powers.map((p) => p.id).filter(Boolean);
    const e = await openPicker({ title: 'Adicionar poder', kinds: ['poder'], chips: ['Poder'], filter: (x) => x.kind === 'poder' && have.indexOf(x.id) < 0 });
    if (!e || sheetChar !== ch) return;
    ch.sheet.powers.push(Object.assign(slotSnap(e), { thumb: e.thumb || '' }));
    changed();
  });

  $('#species-pick').addEventListener('click', async () => {
    const ch = sheetChar;
    const e = await openPicker({ title: 'Escolher espécime', kinds: ['especime'], chips: ['Espécime'], filter: (x) => x.kind === 'especime' });
    if (!e || sheetChar !== ch) return;
    ch.sheet.specimen = Object.assign(slotSnap(e), { thumb: e.thumb || '' });
    ch.species = e.name;
    fSpecies.value = e.name;
    dirty.add('species');
    changed();
  });

  /* ---------- Pré-jogadas ----------
     Testes prontos montados a partir da ficha: atributo, perícia e ataque com a arma escolhida.
     Usados na ficha (bloco Rolagens e botão de cada perícia) e na tela da campanha. */
  const ATTR_LABEL = { corpo: 'Corpo', precisao: 'Precisão', essencia: 'Essência' };
  const SKILL_ATTR = {};
  const SKILL_LABEL = {};
  Object.keys(SKILLS).forEach((a) => SKILLS[a].forEach((sk) => { SKILL_ATTR[sk[0]] = a; SKILL_LABEL[sk[0]] = sk[1]; }));

  function attrTest(s, attr) {
    return { label: 'Teste de ' + ATTR_LABEL[attr], attrName: ATTR_LABEL[attr], attr: num(s.attrs[attr]) };
  }
  function skillTest(s, m, sk) {
    const attr = SKILL_ATTR[sk];
    const name = sk === 'oficio' && s.oficio ? 'Ofício (' + String(s.oficio).slice(0, 30) + ')' : SKILL_LABEL[sk];
    const pen = PENALTY_SKILLS.indexOf(sk) >= 0 ? m.pen : 0;
    return { label: name, attrName: ATTR_LABEL[attr], attr: num(s.attrs[attr]), skillName: name, skill: num(s.skills[sk]), mods: pen ? [['armadura', -pen]] : [] };
  }

  // formas de atacar com um item (ou desarmado), conforme as regras de Ataque e de cada tipo de arma
  function attackModes(s, i) {
    const out = [];
    const prof = i ? isProficient(s, i) : false;
    if (!i || i.kind !== 'arma-fogo') {
      out.push({ id: 'corpo', label: 'Corpo a corpo (Corpo + Luta)', attr: 'corpo', skill: 'luta' });
      if (i && i.typeId === 'espada') out.push({ id: 'precisao', label: 'Espada com Precisão (Precisão + Luta)', attr: 'precisao', skill: 'luta' });
    } else {
      out.push({ id: 'precisao', label: 'À distância (Precisão + Mira)', attr: 'precisao', skill: 'mira' });
      if (i.typeId === 'submetralhadora') out.push({ id: 'essencia', label: 'Submetralhadora com Essência (Essência + Mira)', attr: 'essencia', skill: 'mira', mod: prof ? 0 : -1 });
    }
    out.push({ id: 'tec', label: 'Tecnológico (Essência + Operações)', attr: 'essencia', skill: 'operacoes' });
    return out;
  }
  const maxShots = (i) => (i && i.kind === 'arma-fogo' ? clamp(Math.round(num(i.values.cadencia)) || 1, 1, 20) : 1);
  // cadência: com proficiência, –N para N disparos; sem, –(1 + 2 + ... + N). Um disparo não tem penalidade.
  const shotPenalty = (n, prof) => (n <= 1 ? 0 : prof ? n : (n * (n + 1)) / 2);

  function attackTest(s, m, i, modeId, shots) {
    const modes = attackModes(s, i);
    const mode = modes.find((x) => x.id === modeId) || modes[0];
    const prof = i ? isProficient(s, i) : false;
    const n = clamp(Math.round(shots) || 1, 1, maxShots(i));
    const mods = [];
    if (mode.mod) mods.push(['Essência sem proficiência', mode.mod]);
    if (PENALTY_SKILLS.indexOf(mode.skill) >= 0 && m.pen) mods.push(['armadura', -m.pen]);
    const pen = shotPenalty(n, prof);
    if (pen) mods.push(['cadência ' + n + ' disparos' + (prof ? ' (perita)' : ''), -pen]);
    const name = i ? i.name : 'Desarmado';
    return {
      label: ('Ataque: ' + name + (n > 1 ? ' · dano ×' + n : '')).slice(0, 60),
      attrName: ATTR_LABEL[mode.attr], attr: num(s.attrs[mode.attr]),
      skillName: SKILL_LABEL[mode.skill], skill: num(s.skills[mode.skill]), mods
    };
  }
  const weaponsOf = (s) => s.inventory.filter((i) => isWeapon(i.kind))
    .sort((a, b) => Number(Boolean(b.slot)) - Number(Boolean(a.slot)));

  // lista de testes de uma ficha (usada no seletor da campanha)
  function testCatalog(c) {
    const s = c.sheet;
    const m = compute(c);
    const out = [];
    ATTRS.forEach((at) => out.push({ group: 'Atributos', id: 'a:' + at.id, label: at.label + ' ' + signed(s.attrs[at.id]), make: () => attrTest(s, at.id) }));
    ATTRS.forEach((at) => SKILLS[at.id].forEach((sk) => {
      const t = skillTest(s, m, sk[0]);
      const fixed = t.attr + t.skill + t.mods.reduce((x, y) => x + y[1], 0);
      out.push({ group: 'Perícias', id: 's:' + sk[0], label: t.skillName + ' ' + signed(fixed), make: () => skillTest(s, m, sk[0]) });
    }));
    return out;
  }

  /* Ação de ataque (fica na campanha, no painel de cada personagem seu).
     st guarda as escolhas: { uid, mode, shots, mod }. onRoll recebe o teste pronto. */
  function attackBuilder(c, st, onRoll, idp) {
    const s = c.sheet;
    const m = compute(c);
    const box = h('div', 'attack');
    const draw = () => {
      const weapons = weaponsOf(s);
      if (st.uid && !weapons.some((w) => w.uid === st.uid)) st.uid = null;
      if (st.uid === null || st.uid === undefined) st.uid = weapons[0] ? weapons[0].uid : '';
      const weapon = weapons.find((w) => w.uid === st.uid) || null;
      const modes = attackModes(s, weapon);
      if (!modes.some((x) => x.id === st.mode)) st.mode = modes[0].id;
      st.shots = clamp(st.shots || 1, 1, maxShots(weapon));

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
      if (maxShots(weapon) > 1) {
        const nSel = h('select', 'input');
        for (let k = 1; k <= maxShots(weapon); k++) {
          const p = shotPenalty(k, isProficient(s, weapon));
          const o = h('option', '', k + (k === 1 ? ' disparo' : ' disparos · –' + p + ' · dano ×' + k));
          o.value = String(k);
          nSel.append(o);
        }
        nSel.value = String(st.shots);
        nSel.addEventListener('change', () => { st.shots = Math.round(num(nSel.value)) || 1; draw(); });
        fields.push(field('shots', 'Disparos (cadência ' + maxShots(weapon) + ')', nSel));
      }
      const modIn = h('input', 'input');
      modIn.type = 'number';
      modIn.step = '1';
      modIn.placeholder = '0';
      modIn.value = st.mod || '';
      modIn.addEventListener('change', () => { st.mod = Math.round(num(modIn.value)); draw(); });
      fields.push(field('mod', 'Modificador (distância, cobertura...)', modIn));

      const t = attackTest(s, m, weapon, st.mode, st.shots);
      if (st.mod) t.mods.push(['modificador', st.mod]);
      const fixed = t.attr + t.skill + t.mods.reduce((x, y) => x + y[1], 0);
      const info = [weapon ? (isProficient(s, weapon) ? 'Proficiente' : 'Sem proficiência') : '', weapon && !weapon.slot ? 'não está em mãos' : '', weapon && weapon.values.dano ? 'dano ' + weapon.values.dano : '', weapon && weapon.values.alcance ? 'alcance ' + weapon.values.alcance : ''].filter(Boolean).join(' · ');
      const go = h('button', 'btn btn--primary btn--sm', 'Atacar · 2d6 ' + (fixed ? signed(fixed) : '+0'));
      go.type = 'button';
      go.addEventListener('click', () => onRoll(t, go));
      box.replaceChildren(h('div', 'attack__fields', ...fields), h('div', 'attack__go', go, info ? h('span', 'attack__info', info) : null));
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
  [['height', fHeight], ['weight', $('#f-weight')], ['sex', fSex], ['lore', $('#f-lore')]].forEach((pair) => {
    pair[1].addEventListener('input', () => { sheetChar.sheet[pair[0]] = pair[1].value; touchSheet(); });
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
    { id: 'builds', tab: 'Builds', title: 'Builds recomendadas', lead: 'Escolha uma build comum para preencher atributos, perícias e proficiências de uma vez, ou monte do seu jeito nas outras partes. Tudo pode ser ajustado depois.', search: true },
    { id: 'especime', tab: 'Espécime', title: 'Espécime', lead: 'A espécie define a vida base, os UP iniciais e se já nasce com núcleo.', search: true },
    { id: 'origem', tab: 'Origem', title: 'Origem e apresentação', lead: 'A origem traz itens iniciais. Idade, altura e sexo podem ser mudados depois na ficha.', search: true },
    { id: 'equip', tab: 'Itens iniciais', title: 'Itens iniciais', lead: 'Pegue o kit da origem, escolhendo o que levar e trocando por itens do banco, ou monte o seu com um orçamento em Cronos.', search: true },
    { id: 'atributos', tab: 'Atributos', title: 'Atributos', lead: '3 pontos para distribuir. Você pode baixar um atributo para –1 e ganhar +1 ponto. Máximo inicial: +3.' },
    { id: 'pericias', tab: 'Perícias', title: 'Perícias', lead: 'Escolha 2 perícias com +2 e 1 perícia com +1. Toque para alternar entre nada, +1 e +2.', search: true },
    { id: 'profs', tab: 'Proficiências', title: 'Proficiências', lead: 'Escolha 4 tipos de arma ou armadura em que o personagem é proficiente desde o início.', search: true },
    { id: 'resumo', tab: 'Resumo', title: 'Resumo', lead: 'Confira. Os recursos já saem calculados dos atributos.' }
  ];
  const STEP = {};
  SETUP.forEach((x, i) => { STEP[x.id] = i; });

  /* Builds comuns, montadas com as regras de criação: 3 pontos de atributo (um pode ir a –1 por +1),
     2 perícias com +2 e 1 com +1, e 4 proficiências. */
  const BUILDS = [
    { name: 'Atirador', role: 'Dano à distância', text: 'Precisão alta para fuzis e rifles; age cedo e reage rápido.', attrs: { corpo: 0, precisao: 3, essencia: 0 }, skills: { mira: 2, reflexos: 2, iniciativa: 1 }, profs: ['fuzil', 'rifle', 'pistola', 'armadura-leve'] },
    { name: 'Combatente', role: 'Corpo a corpo', text: 'Golpes fortes e defesa sólida na linha de frente.', attrs: { corpo: 2, precisao: 1, essencia: 0 }, skills: { luta: 2, resistencia: 2, atletismo: 1 }, profs: ['espada', 'machado', 'armadura-media', 'armadura-pesada'] },
    { name: 'Tanque', role: 'Aguentar dano', text: 'Muita vida e carga; segura a pressão para o grupo. Troca Essência por mais Corpo.', attrs: { corpo: 3, precisao: 1, essencia: -1 }, skills: { resistencia: 2, fortitude: 2, luta: 1 }, profs: ['marreta', 'metralhadora', 'armadura-media', 'armadura-pesada'] },
    { name: 'Tecnomante', role: 'Energia e módulos', text: 'Essência alta: muitos PE, ataques tecnológicos e mente firme.', attrs: { corpo: 0, precisao: 0, essencia: 3 }, skills: { operacoes: 2, vontade: 2, sentidos: 1 }, profs: ['laser', 'pistola', 'submetralhadora', 'armadura-leve'] },
    { name: 'Infiltrador', role: 'Tecnologia e furtividade', text: 'Hackeia sistemas, abre fechaduras e evita ser visto.', attrs: { corpo: 0, precisao: 2, essencia: 1 }, skills: { tecnologia: 2, manha: 2, reflexos: 1 }, profs: ['pistola', 'submetralhadora', 'espada', 'armadura-leve'] },
    { name: 'Negociador', role: 'Social', text: 'Convence, engana e impõe respeito; resolve sem tiros quando dá.', attrs: { corpo: 0, precisao: 1, essencia: 2 }, skills: { diplomacia: 2, enganacao: 2, intimidacao: 1 }, profs: ['pistola', 'espingarda', 'espada', 'armadura-leve'] }
  ];
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
    return { two: vals.filter((v) => v === 2).length, one: vals.filter((v) => v === 1).length };
  };
  function stepProblem(step) {
    if (step === STEP.atributos) {
      const p = attrPool(wz.attrs);
      if (p.left > 0) return 'Ainda ' + (p.left === 1 ? 'falta 1 ponto' : 'faltam ' + p.left + ' pontos') + ' para distribuir.';
      if (p.left < 0) return 'Você passou do limite em ' + (-p.left) + (p.left === -1 ? ' ponto.' : ' pontos.');
    }
    if (step === STEP.pericias) {
      const c = skillCount(wz.skills);
      if (c.two !== 2 || c.one !== 1) return 'Marcadas: ' + c.two + ' de 2 perícias com +2 e ' + c.one + ' de 1 perícia com +1.';
    }
    if (step === STEP.profs && wz.profs.length !== 4) return 'Escolhidas: ' + wz.profs.length + ' de 4 proficiências.';
    if (step === STEP.equip && wz.gear.mode === 'preco' && cartTotal(wz.gear) > wz.gear.budget) return 'A compra passou do orçamento em ' + fmtCronos(cartTotal(wz.gear) - wz.gear.budget) + ' Cronos.';
    return '';
  }
  const setupProblem = () => stepProblem(wz.step);
  const allProblems = () => SETUP.map((x, i) => [i, stepProblem(i)]).filter((p) => p[1]);
  const wzMatch = (...texts) => matchesText(nameKey(texts.filter(Boolean).join(' ')), wz.q || '');
  function goStep(i) {
    wz.step = clamp(i, 0, SETUP.length - 1);
    wz.q = '';
    $('#setup-search').value = '';
    renderSetup();
    $('#setup-title').focus({ preventScroll: true });
    $('.setup').scrollTop = 0;
  }
  function applyBuild(b) {
    wz.attrs = Object.assign({}, b.attrs);
    wz.skills = Object.assign({}, b.skills);
    wz.profs = b.profs.slice();
    wz.build = b.name;
  }

  /* ---------- Itens iniciais: kit da origem ou compra por preço ----------
     O livro não dá dinheiro inicial; o orçamento padrão (1.500 Cronos) é o de uma
     arma comum mais uma armadura leve comum do catálogo. Pode ser mudado. */
  const START_BUDGET = 1500;
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

  function pickCard(title, lines, on, onClick) {
    const b = h('button', 'pick-card', h('span', 'pick-card__title', title), ...lines.filter(Boolean).map((l) => h('span', 'pick-card__text', l)));
    b.type = 'button';
    b.setAttribute('aria-pressed', String(on));
    b.addEventListener('click', onClick);
    return b;
  }
  const specimenLine = (e) => { const v = e.values || {}; return 'Vida base ' + (v.vidaBase || 'PV') + ' · ' + num(v.upInicial) + ' UP iniciais' + (num(v.nucleoBase) ? ' · núcleo +' + num(v.nucleoBase) : '') + (v.acopla === 'Sim' ? ' · acopla armas e armaduras' : '') + (v.humanidade === 'Sim' ? ' · Humanidade' : '') + (v.eletronico === 'Sim' ? ' · eletrônico' : ''); };

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
        const acts = h('div', 'gear-line__acts', swap);
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
        const e = await openPicker({ title: 'Adicionar ao kit', kinds: INVENTORY_KINDS, chips: [
          { label: 'Armas', kinds: ['arma-melee', 'arma-fogo'] }, { label: 'Armaduras', kinds: ['armadura'] }, { label: 'Vestíveis', kinds: ['vestivel'] },
          { label: 'Implantes', kinds: ['nucleo', 'protese-modulo'] }, { label: 'Itens gerais', kinds: ['item-geral'] }], filter: (x) => INVENTORY_KINDS.indexOf(x.kind) >= 0 });
        if (!e || !wz) return;
        g.lines.push({ text: e.name, opts: [e.name], detail: '', kinds: INVENTORY_KINDS, comum: false, free: true, take: true, opt: 0, bank: e });
        renderSetup();
      });
      body.append(h('div', 'gear-line__acts', more));
      return;
    }

    // Por preço: orçamento, carrinho e a loja (catálogo + banco, só o que tem preço)
    const inp = h('input', 'input');
    inp.type = 'text';
    inp.inputMode = 'numeric';
    inp.id = 'gear-budget';
    inp.value = String(g.budget);
    inp.addEventListener('change', () => { g.budget = Math.max(0, parseInt(inp.value.replace(/[^0-9]/g, ''), 10) || 0); renderSetup(); });
    const lab = h('label', 'field__label', 'Orçamento (Cronos)');
    lab.htmlFor = 'gear-budget';
    const left = g.budget - cartTotal(g);
    body.append(h('div', 'gear__budget', h('div', 'field', lab, inp),
      h('p', 'setup__pool' + (left < 0 ? ' setup__pool--over' : ''), 'Sobra: ', h('strong', '', fmtCronos(left)), ' Cronos')),
      h('p', 'field__hint', 'O livro não define dinheiro inicial. O padrão de ' + fmtCronos(START_BUDGET) + ' Cronos compra uma arma comum e uma armadura leve comum; combine o valor com o mestre.' + (origin ? ' O kit de ' + origin.name + ' continua na aba "Kit da origem" para comparar.' : '')));
    if (g.cart.length) {
      body.append(h('h3', 'setup__sub', 'Comprados'), h('ul', 'rows', ...g.cart.map((e, i) => {
        const rm = h('button', 'btn btn--ghost btn--sm', 'Tirar');
        rm.type = 'button';
        rm.setAttribute('aria-label', 'Tirar ' + e.name);
        rm.addEventListener('click', () => { g.cart.splice(i, 1); renderSetup(); });
        return h('li', 'row', h('span', 'row__open row__open--static', h('span', 'row__main', h('span', 'row__title', e.name), h('span', 'row__meta', kindTitle(e.kind) + ' · ' + priceText(e.values.preco)))), rm);
      })));
    }
    body.append(h('h3', 'setup__sub', 'Loja'));
    if (!g.shop) {
      body.append(h('p', 'empty', 'Carregando os itens com preço...'));
      libSearch(INVENTORY_KINDS, '').catch(() => BUILTINS.filter((e) => INVENTORY_KINDS.indexOf(e.kind) >= 0))
        .then((list) => { if (!wz || wz.gear !== g) return; g.shop = list.filter((e) => priceOf(e) > 0).sort((a, b) => priceOf(a) - priceOf(b)); renderSetup(); });
      return;
    }
    const shown = g.shop.filter((e) => wzMatch(e.name, e.kindTitle, e.typeTitle, e.values.raridade, e.values.fabricante));
    body.append(h('ul', 'rows gear__shop', ...shown.slice(0, 80).map((e) => {
      const add = h('button', 'btn btn--ghost btn--sm', 'Comprar');
      add.type = 'button';
      add.disabled = priceOf(e) > left;
      add.setAttribute('aria-label', 'Comprar ' + e.name + ' por ' + priceText(e.values.preco));
      add.addEventListener('click', () => { g.cart.push(e); renderSetup(); });
      return h('li', 'row', h('span', 'row__open row__open--static', entryIcon(e),
        h('span', 'row__main', h('span', 'row__title', e.name), h('span', 'row__meta', [e.kindTitle, e.typeTitle, e.values.raridade].filter(Boolean).join(' · ')))),
        h('strong', 'gear__price', fmtCronos(priceOf(e))), add);
    })));
    if (!shown.length) body.append(h('p', 'empty', 'Nada com esse termo na loja.'));
    else if (g.shop.some((e) => priceOf(e) > left)) body.append(h('p', 'field__hint', 'Itens acima da sobra ficam desativados.'));
  }

  function renderSetup(focusId) {
    const body = $('#setup-body');
    const st = SETUP[wz.step];
    $('#setup-step').textContent = 'Distribuição inicial · parte ' + (wz.step + 1) + ' de ' + SETUP.length;
    $('#setup-title').textContent = st.title;
    $('#setup-lead').textContent = st.lead;
    $('#setup-search-wrap').hidden = !st.search;
    $('#setup-tabs').replaceChildren(...SETUP.map((x, i) => {
      const bad = stepProblem(i);
      const b = h('button', 'setup__tab' + (i === wz.step ? ' is-on' : '') + (bad ? ' setup__tab--bad' : ''), x.tab);
      b.type = 'button';
      if (i === wz.step) b.setAttribute('aria-current', 'step');
      b.title = bad || x.title;
      b.addEventListener('click', () => goStep(i));
      return b;
    }));
    body.replaceChildren();

    if (wz.step === STEP.builds) {
      const list = BUILDS.filter((b) => wzMatch(b.name, b.role, b.text, Object.keys(b.skills).map(skillLabel).join(' '), b.profs.map(profLabel).join(' ')));
      body.append(h('div', 'pick-grid', ...list.map((b) => pickCard(b.name, [
        b.role + ' · ' + b.text,
        ATTRS.map((at) => at.label + ' ' + (signed(b.attrs[at.id]) === '0' ? '0' : signed(b.attrs[at.id]))).join(' · '),
        Object.keys(b.skills).map((k) => skillLabel(k) + ' +' + b.skills[k]).join(' · '),
        b.profs.map(profLabel).join(' · ')
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
    }

    if (wz.step === STEP.especime) {
      const species = BUILTINS.filter((e) => e.kind === 'especime');
      if (wz.specimen && !species.some((e) => e.id === wz.specimen.id)) species.push(wz.specimen);
      const grid = h('div', 'pick-grid', ...species.filter((e) => wzMatch(e.name, e.values.descricao, e.values.tracos)).map((e) => pickCard(e.name, [specimenLine(e), e.values.descricao],
        Boolean(wz.specimen && wz.specimen.id === e.id), () => { wz.specimen = slotSnap(e); wz.specimen.thumb = e.thumb || ''; renderSetup(); })));
      grid.append(pickCard('Buscar outro', ['Qualquer espécime do banco, inclusive os criados na Oficina.'], false, async () => {
        const e = await openPicker({ title: 'Escolher espécime', kinds: ['especime'], chips: ['Espécime'], filter: (x) => x.kind === 'especime' });
        if (!e || !wz) return;
        wz.specimen = Object.assign(slotSnap(e), { thumb: e.thumb || '' });
        renderSetup();
      }));
      body.append(grid);
    }

    if (wz.step === STEP.origem) {
      const list = ORIGINS.slice();
      if (wz.originEntry && !list.some((o) => nameKey(o.name) === nameKey(wz.originEntry.name))) list.push(wz.originEntry);
      const og = h('div', 'pick-grid', ...list.filter((o) => wzMatch(o.name, o.text, o.items.join(' '))).map((o) => pickCard(o.name, [o.text],
        nameKey(wz.origin) === nameKey(o.name), () => { wz.origin = o.name; renderSetup(); })));
      og.append(pickCard('Buscar outra', ['Qualquer origem do banco, inclusive as criadas na Oficina.'], false, async () => {
        const e = await openPicker({ title: 'Escolher origem', kinds: ['origem'], chips: ['Origem'], filter: (x) => x.kind === 'origem' });
        if (!e || !wz) return;
        wz.originEntry = bankOrigin(e);
        wz.origin = e.name;
        renderSetup();
      }));
      body.append(og,
        h('div', 'fields-grid',
          setupField('wz-origin', 'Origem (ou escreva outra)', wz.origin, 'Ex.: Exilado Urbano', (v) => { wz.origin = v; }, 60),
          setupField('wz-age', 'Idade', wz.age, 'Ex.: 27 anos', (v) => { wz.age = v; }, 20),
          setupField('wz-height', 'Altura', wz.height, 'Ex.: 1,78 m', (v) => { wz.height = v; }, 20),
          setupField('wz-sex', 'Sexo', wz.sex, '', (v) => { wz.sex = v; }, 20)));
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
      body.append(h('p', 'setup__pool', 'Com +2: ', h('strong', '', c.two + ' de 2'), ' · Com +1: ', h('strong', '', c.one + ' de 1')));
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
    next.textContent = last ? 'Concluir' : 'Continuar';
    next.disabled = last && allProblems().length > 0;
    if (focusId) { const el = $('[data-fid="' + focusId + '"]', body) || $('[data-fid^="' + focusId.slice(0, -1) + '"]:not(:disabled)', body); if (el) el.focus({ preventScroll: true }); }
  }

  function openSetup() {
    const c = sheetChar, s = c.sheet;
    wz = {
      step: skipBuilds() ? STEP.especime : STEP.builds, q: '', build: '', attrs: Object.assign({}, s.attrs), skills: {}, profs: s.profs.slice(0, 4), oficio: s.oficio || '',
      specimen: s.specimen ? deep(s.specimen) : null, origin: c.origin || '', age: c.age || '', height: s.height || '', sex: s.sex || '',
      gear: { mode: s.originItems ? 'nenhum' : 'kit', origin: null, lines: [], budget: START_BUDGET, cart: [], shop: null }
    };
    Object.keys(s.skills).forEach((k) => { if (s.skills[k] === 1 || s.skills[k] === 2) wz.skills[k] = s.skills[k]; });
    if (attrPool(wz.attrs).left < 0 || ATTRS.some((at) => wz.attrs[at.id] > 3)) wz.attrs = { corpo: 0, precisao: 0, essencia: 0 }; // ficha já evoluída: recomeça do zero
    renderSetup();
    openDialog(setupDlg);
    $('#setup-title').focus({ preventScroll: true });
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
    c.origin = cleanName(wz.origin).slice(0, 60);
    c.age = wz.age;
    dirty.add('origin'); dirty.add('age');
    const origin = originOf(wz.origin);
    const g = gearFor(origin);
    const got = gearEntries(g);
    got.forEach((e) => s.inventory.push(e));
    if (got.length) s.originItems = g.mode === 'preco' ? 'Compra inicial' : origin.name;
    wz = null;
    closeDialog(setupDlg);
    fillBasics();
    changed();
    flushSave();
    toast('Distribuição inicial concluída.');
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

  /* Exportar: PDF, Word, texto ou copiar */
  const exportDlg = $('#export-dialog');
  $('#export-open').addEventListener('click', async () => { await flushSave(); openDialog(exportDlg); });
  $('#export-close').addEventListener('click', () => closeDialog(exportDlg));
  $$('[data-export]').forEach((b) => b.addEventListener('click', () => doExport(b.dataset.export)));

  function exportFields(c) {
    const s = normSheet(c.sheet);
    const m = compute({ sheet: s });
    const skills = [];
    ATTRS.forEach((at) => SKILLS[at.id].forEach((sk) => { if (num(s.skills[sk[0]])) skills.push(sk[1] + (sk[0] === 'oficio' && s.oficio ? ' (' + s.oficio + ')' : '') + ' +' + num(s.skills[sk[0]])); }));
    const life = LIFE.filter((l) => m.max[l[0]] > 0).map((l) => l[1] + ' ' + getCur(s, l[0], m.max[l[0]]) + '/' + m.max[l[0]]);
    const inv = s.inventory.map((i) => {
      const parts = (i.slots.mods || []).concat(i.slots.props || [], i.slots.accs || []).map((x) => x.name);
      return i.name + ((i.qty || 1) > 1 ? ' ×' + i.qty : '') + (i.slot ? ' [' + slotDef(i.slot).full + ']' : '') + (parts.length ? ' (' + parts.join(', ') + ')' : '');
    });
    return [
      ['Espécime', c.species], ['Idade', c.age], ['Altura e peso', [s.height, s.weight].filter(Boolean).join(' · ')], ['Sexo', s.sex], ['Origem', c.origin],
      ['Atributos', ATTRS.map((at) => at.label + ' ' + signed(s.attrs[at.id])).join(' · ')],
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
    $('#f-lore').value = c.sheet.lore || '';
  }
  $('#origin-list').replaceChildren(...ORIGINS.map((o) => { const op = h('option'); op.value = o.name; return op; }));
  $('#search-origin').append(...ORIGINS.map((o) => { const op = h('option', '', o.name); op.value = o.name; return op; }));

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
    $('#delete-character').textContent = 'Excluir ' + (c.type === 'criatura' ? 'criatura' : 'personagem');
    await renderSheetCampaigns();
    if (!c.sheet.setup && (c.mine || isMyChar(c.id)) && sheetChar === c) openSetup(); // primeira vez: abre a distribuição inicial
  };

  /* ---------- Campanha ---------- */
  let currentCamp = null;
  let members = [];
  let firstRolls = true;
  const inRoll = $('#roll-input'), errRoll = $('#roll-error'), speakerEl = $('#speaker');

  function renderRolls(list) {
    const log = $('#roll-log');
    const stick = firstRolls || log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    log.replaceChildren(...list.map(rollRow));
    $('#roll-empty').hidden = list.length > 0;
    if (stick) log.scrollTop = log.scrollHeight;
    firstRolls = false;
  }

  async function doRoll(text) {
    const speaker = members.find((m) => m.mine && m.characterId === speakerEl.value);
    if (!speaker) return;
    let result;
    try { result = rollDice(text); }
    catch (err) { setError(errRoll, inRoll, errorMessage(err)); inRoll.focus(); return; }
    setError(errRoll, inRoll, '');
    try {
      await db.addRoll(currentCamp.id, {
        characterId: speaker.characterId, characterName: speaker.name, characterType: speaker.type,
        expr: result.expr, label: result.label, detail: result.detail, total: result.total, flag: result.flag
      });
    } catch (err) { toast(errorMessage(err)); }
  }

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
  speakerEl.addEventListener('change', renderTestPick);
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
    const ok = [], failed = [];
    for (const m of chosen) {
      try { await patchMemberSheet(m, (s) => { s.xp = Math.max(0, num(s.xp) + amount); }); ok.push(m.name); }
      catch (err) { console.warn(err); failed.push(m.name); }
    }
    btn.disabled = false;
    $('#xp-amount').value = '';
    toast((ok.length ? '+' + amount + ' XP para ' + ok.join(', ') + '.' : '') + (failed.length ? ' Não foi possível dar XP para ' + failed.join(', ') + '.' : ''));
    $('#member-list').replaceChildren(...members.map(memberRow));
  });

  $('#form-roll').addEventListener('submit', (ev) => { ev.preventDefault(); doRoll(inRoll.value); });
  inRoll.addEventListener('input', () => setError(errRoll, inRoll, ''));
  $$('[data-dice]').forEach((b) => b.addEventListener('click', () => doRoll(b.dataset.dice)));

  $('#copy-code').addEventListener('click', async () => {
    if (await copyText($('#campaign-code').textContent)) toast('ID copiado.');
    else toast('Não foi possível copiar sozinho. Toque no ID e copie.');
  });

  $('#delete-campaign').addEventListener('click', async () => {
    if (await deleteCampaignFlow(currentCamp)) go('campanhas');
  });

  views.campaign = async function showCampaign(id) {
    const camp = await db.getCampaign(id);
    if (!camp) { toast('Não encontramos essa campanha.'); go('campanhas'); return; }
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
    document.title = camp.name + ' | Vortex';

    let noAccess = false;
    try { members = await db.listMembers(id); }
    catch (err) { console.warn(err); members = []; noAccess = true; }
    members.forEach((m) => { if (isMyChar(m.characterId)) m.mine = true; }); // personagens do perfil contam como seus

    $('#member-list').replaceChildren(...members.map(memberRow));
    renderXpForm();
    $('#member-empty').hidden = members.length > 0;
    $('#members-count').textContent = members.length ? '(' + plural(members.length, 'ficha', 'fichas') + ')' : '';

    const mine = members.filter((m) => m.mine);
    const canRoll = mine.length > 0;
    speakerEl.replaceChildren(...mine.map((m) => {
      const o = h('option', '', m.name);
      o.value = m.characterId;
      return o;
    }));
    if (mine.some((m) => m.characterId === lastCharacterId)) speakerEl.value = lastCharacterId;
    speakerEl.disabled = mine.length < 2;
    $('#speaker-field').hidden = !canRoll;

    const notice = $('#chat-notice');
    notice.hidden = canRoll;
    notice.textContent = noAccess
      ? 'Você ainda não participa desta campanha. Abra uma ficha e vincule com o ID de entrada.'
      : 'Para rolar dados, vincule um personagem seu a esta campanha (pela ficha dele).';
    inRoll.disabled = $('#roll-button').disabled = !canRoll;
    $$('[data-dice]').forEach((b) => { b.disabled = !canRoll; });
    $('#test-bar').hidden = !canRoll;
    renderTestPick();
    setError(errRoll, inRoll, '');

    if (noAccess) { renderRolls([]); return; }
    const stop = db.subscribeRolls(id, renderRolls, (err) => toast(errorMessage(err)));
    onLeave = () => { if (typeof stop === 'function') stop(); };
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

  // Lista os títulos do capítulo (seções, subseções e cartões) e dá um endereço único a cada um
  function indexChapter(ch) {
    if (ch._toc) return ch._toc;
    const used = {};
    const toc = [];
    const slugs = new Map();
    (function walk(blocks) {
      blocks.forEach((b) => {
        const t = b[0];
        if (t !== 'h2' && t !== 'h3' && t !== 'h4' && t !== 'card') return;
        const level = t === 'card' ? (b[3] || 3) : Number(t.slice(1));
        let slug = slugify(plainText(b[1]));
        used[slug] = (used[slug] || 0) + 1;
        if (used[slug] > 1) slug += '-' + used[slug];
        slugs.set(b, slug);
        toc.push({ level, title: plainText(b[1]), slug });
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
    const query = nameKey(q);
    const searching = query.length > 0;
    rulesHitsEl.hidden = !searching;
    $('#rules-toc-title').hidden = $('#rules-toc-nav').hidden = searching;
    $('.rules-chapters-wrap').hidden = searching;
    if (!searching) return;
    const hits = [];
    CHAPTERS.forEach((c) => {
      if (nameKey(c.title).indexOf(query) >= 0) hits.push({ c, t: null });
      indexChapter(c).forEach((t) => { if (nameKey(t.title).indexOf(query) >= 0) hits.push({ c, t }); });
    });
    rulesHitsEl.replaceChildren(...(hits.length
      ? hits.slice(0, 40).map(({ c, t }) => {
        const a = h('a', '', t ? t.title : c.title, h('span', 'toc__tab', t ? c.title : 'Capítulo'));
        a.href = ruleHref(c.id, t && t.slug);
        a.dataset.tab = c.id;
        if (t) a.dataset.slug = t.slug;
        return h('li', 'toc__item toc__l2', a);
      })
      : [h('li', 'toc__empty', 'Nenhuma regra com esse título.')]));
  }

  /* Alturas fixas no topo (barra do site e abas), para o índice e as âncoras não ficarem escondidos */
  function updateOffsets() {
    const wrap = $('.rules-tabs-wrap');
    const barH = $('.app-bar').offsetHeight;
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
    window.addEventListener('hashchange', render);
    render();
  }

  start();
})();