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
          .slice(0, 200)
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
        if (qs.length) snap = await lib().where('searchKeys', 'array-contains', qs[0].slice(0, 20)).limit(120).get();
        else if (kinds && kinds.length) snap = await lib().where('kind', 'in', kinds.slice(0, 10)).limit(200).get();
        else snap = await lib().orderBy('updatedAt', 'desc').limit(100).get();
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
      text: 'Nada aqui é digitado: PV = 5 + Corpo × 5, PE = 5 + Essência × 5, PA = Precisão. A barra de resistência é uma só e junta PV, Blindagem e Escudo, cada um com a sua cor; itens equipados, poderes e o espécime somam o tipo deles sozinhos. Você só marca o valor atual.',
      rule: 'atributos-e-recursos/recursos'
    },
    pericias: {
      title: 'Perícias',
      text: 'Bônus de +1 a +3. O número ao lado já é o total do teste (atributo + perícia), com a penalidade da armadura equipada em Manha, Reflexos e Sentidos.',
      rule: 'pericias'
    },
    progressao: {
      title: 'Progressão',
      text: '10 XP viram 1 UP. Cada UP compra +10 PV, +10 PE, +2 PA ou +2 pontos de perícia; poderes também custam UP.',
      rule: 'progressao'
    },
    poderes: {
      title: 'Poderes',
      text: 'Poderes e habilidades vêm do banco (os das regras já estão lá; crie os seus na aba Itens). Os bônus de um poder entram sozinhos nos recursos.',
      rule: 'habilidades'
    },
    inventario: {
      title: 'Inventário',
      text: 'A carga é somada sozinha. Limite: 5 + Corpo × 5. Armadura equipada e implantes instalados não contam. Só 4 itens equipados dão benefício ao mesmo tempo. Abra um item para encaixar mods, propriedade e acessórios nos slots.',
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
    return h('li', 'row', open, act);
  }

  function searchRow(c) {
    const a = h('a', 'row__open',
      avatar(c.name, c.type, c.thumb),
      h('span', 'row__main', h('span', 'row__title', c.name), h('span', 'row__meta', [c.species, c.origin].filter(Boolean).join(' · '))),
      badge(c.type));
    a.href = '#/character/' + encodeURIComponent(c.id);
    return h('li', 'row', a);
  }

  function campaignRow(c, action) {
    const open = h('a', 'row__open',
      h('span', 'row__main', h('span', 'row__title', c.name), h('span', 'row__meta', c.isOwner ? 'Criada por você' : '')),
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

    const pic = h('span', 'member__pic token token--' + m.type);
    if (m.image) { const img = h('img'); img.src = m.image; img.alt = ''; pic.append(img); pic.classList.add('token--img'); }
    else pic.textContent = m.name.trim().charAt(0).toUpperCase();
    const link = h('a', 'btn btn--ghost btn--sm', 'Abrir ficha completa');
    link.href = '#/character/' + encodeURIComponent(m.characterId);
    const panel = h('div', 'member__panel', pic, h('div', 'member__info',
      h('dl', 'member__data',
        h('dt', '', 'Espécie'), h('dd', '', m.species || '—'),
        h('dt', '', 'Idade'), h('dd', '', m.age || '—'),
        h('dt', '', 'Origem'), h('dd', '', m.origin || '—'),
        ...(m.sheet && m.sheet.attrs ? [h('dt', '', 'Atributos'), h('dd', '', 'Corpo ' + (m.sheet.attrs.corpo || 0) + ' · Precisão ' + (m.sheet.attrs.precisao || 0) + ' · Essência ' + (m.sheet.attrs.essencia || 0))] : [])),
      link));
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
    const flagText = r.flag === 'crit' ? 'Sucesso crítico!' : r.flag === 'fail' ? 'Falha crítica' : '';
    return h('li', 'roll' + (r.flag ? ' roll--' + r.flag : ''),
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
    try { await db.deleteCampaign(c.id); toast('Campanha excluída.'); return true; }
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
    let list;
    try { list = await db.searchCharacters(q, type); }
    catch (err) {
      if (seq === searchSeq) $('#search-hint').textContent = errorMessage(err);
      return;
    }
    if (seq !== searchSeq) return; // uma busca mais nova já saiu
    $('#search-list').replaceChildren(...list.map(searchRow));
    $('#search-empty').hidden = list.length > 0;
    $('#search-hint').textContent = words(q).length
      ? plural(list.length, 'ficha encontrada', 'fichas encontradas')
      : (db.mode === 'firebase' ? 'Sem busca: mostrando as fichas mais recentes.' : 'Sem busca: mostrando as fichas deste aparelho.');
  }
  const liveSearch = debounce(runSearch, 300);
  inSearch.addEventListener('input', liveSearch);
  $$('input[name="stype"]', formSearch).forEach((r) => r.addEventListener('change', runSearch));
  formSearch.addEventListener('submit', (ev) => { ev.preventDefault(); runSearch(); });

  views.personagens = async function showPersonagens() {
    const quick = await refreshQuick();
    $('#quick-list').replaceChildren(...quick.map(characterRow));
    $('#quick-empty').hidden = quick.length > 0;
    await runSearch();
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
      formCreateCamp.reset();
      toast('Campanha criada. Vincule um personagem pela ficha dele para rolar dados.');
      go('campaign', camp.id);
    } catch (err) {
      setError(errCampName, inCampName, errorMessage(err));
    }
  });

  views.campanhas = async function showCampanhas() {
    setError(errCampName, inCampName, '');
    const camps = await db.listMyCampaigns().catch((e) => { toast(errorMessage(e)); return []; });
    $('#camp-list').replaceChildren(...camps.map((c) => campaignRow(c, c.isOwner
      ? { label: 'Excluir', onClick: async () => { if (await deleteCampaignFlow(c)) views.campanhas(); } }
      : null)));
    $('#camp-empty').hidden = camps.length > 0;
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

  async function libSearch(kinds, q) {
    const off = BUILTINS.filter((e) => (!kinds || kinds.indexOf(e.kind) >= 0) && matchesText(libHay(e), q));
    const own = await db.searchLibrary({ kinds, query: q });
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
    return [e.kindTitle || kindTitle(e.kind), e.typeTitle, v.raridade, v.posicao, v.para, v.classe].filter(Boolean).join(' · ');
  }
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
  const pk = { opts: null, resolve: null, seq: 0 };

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
    list = list.filter((e) => (!o.filter || o.filter(e)) && (!favOnly || favs.has(e.id)));
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
      $('#picker-chips').replaceChildren(h('span', 'picker__filter-label', 'Filtro automático:'), ...(opts.chips || []).filter(Boolean).map((c) => h('span', 'chip', c)));
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
      else if (f.kind === 'select' && opts.length === 1) values[f.key] = opts[0];
      else if (f.defaultFrom && type && type[f.defaultFrom] !== undefined) values[f.key] = String(type[f.defaultFrom]);
      else values[f.key] = '';
    });
    return { id: null, kind, typeId: typeId || '', name: '', values, image: '', thumb: '', slots: normSlots(null), bonus: {} };
  }

  function fieldControl(field, type, value, onChange) {
    const id = 'item-f-' + field.key;
    const opts = fieldOptions(field, type);
    if (field.kind === 'select') {
      const sel = h('select', 'input');
      sel.id = id;
      const blank = h('option', '', 'Escolha...');
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
    $('#item-form-hint').textContent = type && type.opts && cat.id === 'arma-fogo'
      ? (type.cargaMax ? 'Opções limitadas à média de criação de ' + type.title + ' (carga máxima ' + type.cargaMax + ').' : 'As regras ainda não trazem a média de criação de ' + type.title + ': escolha entre todas as opções.')
      : (cat.hint || '');

    const grid = $('#item-fields');
    grid.replaceChildren();
    cat.fields.forEach((f) => {
      const isName = f.key === 'nome';
      const ctrl = fieldControl(f, type, isName ? d.name : d.values[f.key], (v) => {
        if (isName) d.name = v; else d.values[f.key] = v;
        if (f.key === 'raridade' || f.key === 'para') renderItemSlots();
      });
      const grouped = f.kind === 'multi' || f.kind === 'rarity';
      const label = h(grouped ? 'span' : 'label', 'field__label', f.label);
      if (!grouped) label.htmlFor = 'item-f-' + f.key;
      if (grouped) { const gid = 'item-l-' + f.key; label.id = gid; ctrl.setAttribute('aria-labelledby', gid); }
      const wrap = h('div', 'field' + (f.big || f.kind === 'multi' ? ' field--wide' : ''), label, ctrl);
      if (f.kind === 'number' && ctrl.max) wrap.append(h('p', 'field__hint', 'Máximo ' + ctrl.max + ' para este tipo.'));
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
    $('#lib-hint').textContent = plural(list.length, 'registro', 'registros') + (db.mode === 'firebase' ? ' (banco compartilhado + catálogo oficial).' : ' (este aparelho + catálogo oficial).');
  }
  $('#lib-q').addEventListener('input', debounce(runLib, 300));
  ['#lib-kind', '#lib-fav', '#lib-mine'].forEach((sel) => $(sel).addEventListener('change', runLib));
  (function fillLibKinds() {
    const sel = $('#lib-kind');
    const all = h('option', '', 'Todas');
    all.value = '';
    sel.append(all);
    ITEM_DATA.categories.forEach((c) => { const o = h('option', '', c.title); o.value = c.id; sel.append(o); });
  })();

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
    precisao: [['mira', 'Mira'], ['tecnologia', 'Tecnologia'], ['manha', 'Manha'], ['pilotagem', 'Pilotagem'], ['intelecto', 'Intelecto'], ['reflexos', 'Reflexos'], ['oficio', 'Ofício']],
    essencia: [['operacoes', 'Operações'], ['sentidos', 'Sentidos'], ['vontade', 'Vontade'], ['intimidacao', 'Intimidação'], ['diplomacia', 'Diplomacia'], ['enganacao', 'Enganação']]
  };
  const PENALTY_SKILLS = ['manha', 'reflexos', 'sentidos']; // sofrem a penalidade da armadura
  const LIFE = [['pv', 'PV'], ['blindagem', 'Blindagem'], ['escudo', 'Escudo']]; // de dentro para fora
  const MAX_EQUIPPED = 4;

  function blankSheet() {
    return {
      v: 1, setup: false, attrs: { corpo: 0, precisao: 0, essencia: 0 }, skills: {}, oficio: '', height: '', sex: '',
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
    s.inventory = (Array.isArray(r.inventory) ? r.inventory : []).map((i) => Object.assign({ qty: 1, equipped: false, values: {}, bonus: {} }, i, { uid: i.uid || uid(), slots: normSlots(i.slots) }));
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

  function quickEntry2(name, carga, efeito) {
    return {
      uid: uid(), id: '', kind: 'item-geral', typeId: '', typeTitle: '', name: cleanName(name).slice(0, 60),
      values: { carga: carga ? String(carga) : '', efeito: efeito || '' }, bonus: {}, slots: normSlots(null), thumb: '', qty: 1, equipped: false
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

  function compute(c) {
    const s = c.sheet;
    const a = s.attrs;
    const sp = s.specimen;
    const spv = (sp && sp.values) || {};
    const equipped = s.inventory.filter((i) => i.equipped);
    const sources = [];
    if (sp) sources.push({ name: sp.name, b: sp.bonus || {} });
    s.powers.forEach((p) => sources.push({ name: p.name, b: p.bonus || {} }));
    equipped.forEach((i) => sources.push({ name: i.name, b: entryBonus(i) }));
    sources.push({ name: 'ajuste manual', b: s.extra });

    const src = { pv: [], escudo: [], blindagem: [], pe: [], pa: [], carga: [], armadura: [] };
    const total = (k) => src[k].reduce((t, x) => t + x.val, 0);
    const fromSources = (k) => sources.forEach((x) => { if (num(x.b[k])) src[k].push({ name: x.name, val: num(x.b[k]) }); });

    // vida: PV vem do Corpo; a espécie pode converter para Blindagem ou Escudo
    src.pv.push({ name: 'base (5 + Corpo × 5)', val: Math.max(5, 5 + a.corpo * 5) });
    if (s.up.pv) src.pv.push({ name: 'UP', val: 10 * s.up.pv });
    ['pv', 'escudo', 'blindagem'].forEach(fromSources);
    const base = spv.vidaBase === 'Blindagem' ? 'blindagem' : spv.vidaBase === 'Escudo' ? 'escudo' : 'pv';
    if (base !== 'pv') {
      src[base].unshift({ name: 'PV convertidos (' + sp.name + ')', val: total('pv') });
      src.pv = [];
    }

    src.pe.push({ name: 'base (5 + Essência × 5)', val: Math.max(5, 5 + a.essencia * 5) });
    if (s.up.pe) src.pe.push({ name: 'UP', val: 10 * s.up.pe });
    fromSources('pe');
    src.pa.push({ name: 'base (Precisão)', val: Math.max(0, a.precisao) });
    if (s.up.pa) src.pa.push({ name: 'UP', val: 2 * s.up.pa });
    fromSources('pa');

    // carga: (–1 no atributo = 2 de carga)
    src.carga.push({ name: 'base (5 + Corpo × 5)', val: a.corpo < 0 ? 2 : 5 + a.corpo * 5 });
    fromSources('carga');

    const armor = equipped.find((i) => i.kind === 'armadura');
    if (armor) src.armadura.push({ name: armor.name, val: num(armor.values.armadura) });
    fromSources('armadura');
    const pen = armor ? Math.abs(num(armor.values.penalidade)) : 0;

    // núcleo: o da espécie, o implantado ou o da armadura
    const core = equipped.find((i) => i.kind === 'nucleo');
    const nucleo = num(spv.nucleoBase) + (core ? num(core.values.capacidade) : 0) + (armor && armor.values.nucleo === 'Sim' ? num(armor.values.capacidade) : 0);
    const implants = equipped.filter((i) => i.kind === 'protese-modulo');
    const ccOf = (i) => (i.values.cc === '' || i.values.cc === undefined ? 1 : num(i.values.cc)) * (i.qty || 1);
    const protUsed = implants.filter((i) => i.values.classe !== 'Módulo').reduce((t, i) => t + ccOf(i), 0);
    const modUsed = implants.filter((i) => i.values.classe === 'Módulo').reduce((t, i) => t + ccOf(i), 0);

    // carga usada: armadura equipada e implantes instalados não contam
    const cargaUsed = s.inventory.reduce((t, i) => {
      if (i.equipped && (i.kind === 'armadura' || IMPLANT_KINDS.indexOf(i.kind) >= 0)) return t;
      return t + parseCarga(i.values.carga) * (i.qty || 1);
    }, 0);

    const max = {};
    Object.keys(src).forEach((k) => { max[k] = Math.max(0, Math.round(total(k) * 100) / 100); });
    const powerCost = s.powers.reduce((t, p) => t + num(p.values && p.values.custo), 0);
    return {
      max, src, base, pen, armor, nucleo,
      cargaUsed: Math.round(cargaUsed * 100) / 100, cargaMax: max.carga, over: cargaUsed > max.carga,
      defMin: max.armadura + a.corpo + num(s.skills.resistencia),
      protMax: nucleo > 0 ? Math.max(0, nucleo + a.corpo) : 0, modMax: nucleo > 0 ? Math.max(0, nucleo + a.essencia) : 0, protUsed, modUsed,
      equipCount: equipped.filter((i) => IMPLANT_KINDS.indexOf(i.kind) < 0).length,
      upTotal: Math.floor(num(s.xp) / 10) + num(spv.upInicial) + num(s.upExtra),
      upSpent: s.up.pv + s.up.pe + s.up.pa + s.up.per + powerCost,
      skillBudget: 5 + 2 * s.up.per,
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
  const invOpen = new Set(); // itens do inventário com os detalhes abertos

  function renderSheetHeader() {
    $('#sheet-title').textContent = sheetChar.name;
    setBadge($('#sheet-badge'), sheetChar.type);
    document.title = 'Ficha de ' + sheetChar.name + ' | Vortex';
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

  // Redesenha a ficha inteira e devolve o foco ao controle que estava em uso
  function rerender() {
    const a = document.activeElement;
    const fid = a && a.dataset ? a.dataset.fid : null;
    const m = compute(sheetChar);
    renderAttrs(m);
    renderResources(m);
    renderSkills(m);
    renderProgress(m);
    renderSpeciesLink();
    renderPowers(m);
    renderInventory(m);
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
    else if (lifeCur <= 0) state = m.base === 'pv' ? 'Agonizando: teste de sobrevivência (CD 6, +1 a cada tentativa no dia).' : 'Sem resistência.';

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
      stat('Deslocamento', m.over ? '4,5 m' : '9 m', m.over ? 'sobrecarga: metade' : 'padrão'),
      stat('Penalidade de armadura', m.pen ? '–' + m.pen : '—', m.pen ? 'Manha, Reflexos e Sentidos' : (m.armor ? m.armor.name : 'sem armadura equipada')));

    const rest = h('button', 'btn btn--ghost btn--sm', 'Descanso longo (recuperar tudo)');
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

    box.replaceChildren(lifeBox, other, stats, h('div', 'res-actions', rest), extra);
  }

  function renderSkills(m) {
    const s = sheetChar.sheet;
    $('#skills-hint').textContent = 'Teste = 2d6 + atributo + perícia. Pontos de perícia: ' + m.skillUsed + ' de ' + m.skillBudget + '.';
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
    const buy = (key, label) => h('div', 'buy',
      h('span', 'buy__label', label),
      stepper(s.up[key], { min: 0, max: 99, label: 'UP em ' + label, fid: 'up-' + key, onChange: (n) => { s.up[key] = n; changed(); } }));
    const sum = h('p', 'prog__sum' + (free < 0 ? ' prog__sum--over' : ''), 'UP: ' + m.upTotal + ' no total · ' + m.upSpent + ' gastos · ' + free + (free === 1 ? ' livre' : ' livres'));
    $('#prog-block').replaceChildren(
      h('div', 'fields-grid',
        numField('f-xp', 'XP (10 XP = 1 UP)', s.xp, (v) => { s.xp = v; }),
        numField('f-up-extra', 'UP extras (mestre, idade...)', s.upExtra, (v) => { s.upExtra = v; })),
      sum,
      h('div', 'buys', buy('pv', '+10 PV'), buy('pe', '+10 PE'), buy('pa', '+2 PA'), buy('per', '+2 em perícias')),
      h('p', 'field__hint', 'Cada passo acima gasta 1 UP e já entra nos recursos. A cada 4 UP obtidos, +1 em um atributo (mude no topo).'));
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
      const main = h('span', 'row__main', h('span', 'row__title', p.name), h('span', 'row__meta', meta));
      if (v.efeito) main.append(h('span', 'row__text', v.efeito));
      const del = h('button', 'btn btn--ghost btn--sm', 'Remover');
      del.type = 'button';
      del.setAttribute('aria-label', 'Remover poder ' + p.name);
      del.addEventListener('click', () => { s.powers.splice(i, 1); changed(); });
      return h('li', 'row lib-row', h('span', 'row__open row__open--static', entryIcon(p), main), del);
    }));
    $('#power-empty').hidden = s.powers.length > 0;
  }

  function toggleEquip(i, m) {
    const s = sheetChar.sheet;
    const implant = IMPLANT_KINDS.indexOf(i.kind) >= 0;
    if (i.equipped) { i.equipped = false; return true; }
    if (i.kind === 'protese-modulo') {
      const isMod = i.values.classe === 'Módulo';
      const need = (i.values.cc === '' || i.values.cc === undefined ? 1 : num(i.values.cc)) * (i.qty || 1);
      if (!m.nucleo) { toast('Sem núcleo não dá para implantar: implante um núcleo (ou use uma armadura com núcleo).'); return false; }
      if ((isMod ? m.modUsed : m.protUsed) + need > (isMod ? m.modMax : m.protMax)) { toast('Capacidade cibernética insuficiente para ' + (isMod ? 'módulos' : 'próteses') + '.'); return false; }
    }
    if (i.kind === 'armadura' || i.kind === 'nucleo') s.inventory.forEach((x) => { if (x.kind === i.kind) x.equipped = false; }); // só um por vez
    if (!implant && s.inventory.filter((x) => x.equipped && IMPLANT_KINDS.indexOf(x.kind) < 0).length >= MAX_EQUIPPED) {
      toast('Só ' + MAX_EQUIPPED + ' itens equipados dão benefício ao mesmo tempo. Desequipe um antes.');
      return false;
    }
    i.equipped = true;
    return true;
  }

  function invRow(i, m) {
    const s = sheetChar.sheet;
    const cat = findCategory(i.kind);
    const implant = IMPLANT_KINDS.indexOf(i.kind) >= 0;
    const carga = parseCarga(i.values.carga) * (i.qty || 1);
    const free = i.equipped && (i.kind === 'armadura' || implant);
    const meta = [kindTitle(i.kind), i.typeTitle, i.values.raridade, 'carga ' + fmtNum(carga) + (free && carga ? ' (não conta)' : '')].filter(Boolean).join(' · ');
    const open = invOpen.has(i.uid);
    const panelId = 'inv-' + i.uid;

    const toggle = h('button', 'row__open member__toggle',
      entryIcon(i),
      h('span', 'row__main', h('span', 'row__title', i.name + ((i.qty || 1) > 1 ? ' ×' + i.qty : '')), h('span', 'row__meta', meta)),
      i.equipped ? h('span', 'tag tag--on', implant ? 'Implantado' : 'Equipado') : null);
    toggle.type = 'button';
    toggle.dataset.fid = 'inv-t-' + i.uid;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-controls', panelId);
    toggle.addEventListener('click', () => { if (invOpen.has(i.uid)) invOpen.delete(i.uid); else invOpen.add(i.uid); rerender(); });

    const eq = h('button', 'btn btn--sm ' + (i.equipped ? 'btn--ghost' : 'btn--primary'), i.equipped ? (implant ? 'Remover implante' : 'Desequipar') : (implant ? 'Implantar' : 'Equipar'));
    eq.type = 'button';
    eq.dataset.fid = 'inv-e-' + i.uid;
    eq.addEventListener('click', () => { if (toggleEquip(i, m)) changed(); });

    const li = h('li', 'inv' + (i.equipped ? ' inv--on' : ''), h('div', 'row', toggle, eq));
    if (!open) return li;

    const panel = h('div', 'inv__panel');
    panel.id = panelId;
    const dl = h('dl', 'member__data');
    ((cat && cat.fields) || []).forEach((f) => {
      const v = i.values[f.key];
      if (f.key === 'nome' || v === undefined || v === '') return;
      dl.append(h('dt', '', f.label.replace(/\s*\(.*\)$/, '')), h('dd', '', String(v)));
    });
    const b = bonusLine(entryBonus(i));
    if (b) dl.append(h('dt', '', 'Bônus'), h('dd', '', b + (i.equipped ? '' : ' (só quando equipado)')));
    if (dl.children.length) panel.append(dl);
    if (cat && cat.slots && cat.slots !== 'mod') panel.append(slotEditor(i, () => { touchSheet(); rerender(); }));

    const qty = h('input', 'input');
    qty.type = 'number';
    qty.min = '1';
    qty.step = '1';
    qty.value = i.qty || 1;
    qty.id = 'inv-q-' + i.uid;
    qty.dataset.fid = qty.id;
    qty.addEventListener('change', () => { i.qty = clamp(Math.round(num(qty.value)) || 1, 1, 999); changed(); });
    const qLab = h('label', 'field__label', 'Quantidade');
    qLab.htmlFor = qty.id;
    const del = h('button', 'btn btn--danger btn--sm', 'Tirar do inventário');
    del.type = 'button';
    del.addEventListener('click', () => { s.inventory.splice(s.inventory.indexOf(i), 1); invOpen.delete(i.uid); changed(); });
    panel.append(h('div', 'inv__foot', h('div', 'field inv__qty', qLab, qty), del));
    li.append(panel);
    return li;
  }

  function renderInventory(m) {
    const s = sheetChar.sheet;
    const sum = h('div', 'inv-sum' + (m.over ? ' inv-sum--over' : ''),
      h('div', 'res-head', h('span', 'res-head__label', 'Carga'), h('span', 'res-head__num', fmtNum(m.cargaUsed) + ' / ' + fmtNum(m.cargaMax))),
      meter([{ key: m.over ? 'over' : 'carga', cur: Math.min(m.cargaUsed, m.cargaMax || 1), max: m.cargaMax || 1 }], 'Carga ' + fmtNum(m.cargaUsed) + ' de ' + fmtNum(m.cargaMax)),
      h('p', 'inv-sum__line',
        'Limite: ' + srcText(m.src.carga) + '. Equipados: ' + m.equipCount + ' de ' + MAX_EQUIPPED + '.' +
        (m.nucleo ? ' Núcleo +' + m.nucleo + ': próteses ' + m.protUsed + '/' + m.protMax + ', módulos ' + m.modUsed + '/' + m.modMax + '.' : '')));
    if (m.over) sum.append(h('p', 'res-state', 'Sobrecarga: –3 em todos os testes e metade do deslocamento.'));
    $('#inv-summary').replaceChildren(sum);
    $('#inv-list').replaceChildren(...s.inventory.map((i) => invRow(i, m)));
    $('#inv-empty').hidden = s.inventory.length > 0;
  }

  $('#inv-add').addEventListener('click', async () => {
    const ch = sheetChar;
    const e = await openPicker({ title: 'Adicionar ao inventário', kinds: INVENTORY_KINDS, chips: ['Armas', 'Armaduras', 'Implantes', 'Itens gerais'], filter: (x) => INVENTORY_KINDS.indexOf(x.kind) >= 0 });
    if (!e || sheetChar !== ch) return;
    const entry = Object.assign(slotSnap(e), { uid: uid(), slots: normSlots(e.slots), thumb: e.thumb || '', qty: 1, equipped: false });
    ch.sheet.inventory.push(entry);
    invOpen.add(entry.uid);
    changed();
    toast(e.name + ' entrou no inventário.');
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
  [['height', fHeight], ['sex', fSex]].forEach((pair) => {
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

  $('#delete-character').addEventListener('click', async () => { if (await deleteCharacterFlow(sheetChar)) go('personagens'); });

  /* ---------- Distribuição inicial ----------
     Abre na primeira vez que a ficha é feita: espécime e origem, atributos
     (3 pontos; um pode ir a –1 por +1 ponto; máximo +3) e perícias (2 com +2, 1 com +1). */
  const setupDlg = $('#setup-dialog');
  const SETUP = [
    { title: 'Quem é', lead: 'Espécime, origem e os dados de apresentação. Dá para mudar tudo depois na ficha.' },
    { title: 'Atributos', lead: '3 pontos para distribuir. Você pode baixar um atributo para –1 e ganhar +1 ponto. Máximo inicial: +3.' },
    { title: 'Perícias', lead: 'Escolha 2 perícias com +2 e 1 perícia com +1. Toque para alternar entre nada, +1 e +2.' },
    { title: 'Resumo', lead: 'Confira. Os recursos já saem calculados dos atributos.' }
  ];
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
  function setupProblem() {
    if (wz.step === 1) {
      const p = attrPool(wz.attrs);
      if (p.left > 0) return 'Ainda ' + (p.left === 1 ? 'falta 1 ponto' : 'faltam ' + p.left + ' pontos') + ' para distribuir.';
      if (p.left < 0) return 'Você passou do limite em ' + (-p.left) + (p.left === -1 ? ' ponto.' : ' pontos.');
    }
    if (wz.step === 2) {
      const c = skillCount(wz.skills);
      if (c.two !== 2 || c.one !== 1) return 'Marcadas: ' + c.two + ' de 2 perícias com +2 e ' + c.one + ' de 1 perícia com +1.';
    }
    return '';
  }

  function pickCard(title, lines, on, onClick) {
    const b = h('button', 'pick-card', h('span', 'pick-card__title', title), ...lines.filter(Boolean).map((l) => h('span', 'pick-card__text', l)));
    b.type = 'button';
    b.setAttribute('aria-pressed', String(on));
    b.addEventListener('click', onClick);
    return b;
  }
  const specimenLine = (e) => { const v = e.values || {}; return 'Vida base ' + (v.vidaBase || 'PV') + ' · ' + num(v.upInicial) + ' UP iniciais' + (num(v.nucleoBase) ? ' · núcleo +' + num(v.nucleoBase) : ''); };

  function previewSheet() { // a ficha como ficaria com as escolhas do assistente
    const s = normSheet(deep(sheetChar.sheet));
    s.attrs = wz.attrs; s.skills = wz.skills; s.specimen = wz.specimen; s.cur = {};
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

  function renderSetup(focusId) {
    const body = $('#setup-body');
    const st = SETUP[wz.step];
    $('#setup-step').textContent = 'Distribuição inicial · passo ' + (wz.step + 1) + ' de ' + SETUP.length;
    $('#setup-title').textContent = st.title;
    $('#setup-lead').textContent = st.lead;
    body.replaceChildren();

    if (wz.step === 0) {
      const species = BUILTINS.filter((e) => e.kind === 'especime');
      if (wz.specimen && !species.some((e) => e.id === wz.specimen.id)) species.push(wz.specimen);
      const grid = h('div', 'pick-grid', ...species.map((e) => pickCard(e.name, [specimenLine(e), e.values.descricao],
        Boolean(wz.specimen && wz.specimen.id === e.id), () => { wz.specimen = slotSnap(e); wz.specimen.thumb = e.thumb || ''; renderSetup(); })));
      grid.append(pickCard('Buscar outro', ['Qualquer espécime do banco, inclusive os criados na Oficina.'], false, async () => {
        const e = await openPicker({ title: 'Escolher espécime', kinds: ['especime'], chips: ['Espécime'], filter: (x) => x.kind === 'especime' });
        if (!e || !wz) return;
        wz.specimen = Object.assign(slotSnap(e), { thumb: e.thumb || '' });
        renderSetup();
      }));
      body.append(h('h3', 'setup__sub', 'Espécime'), grid);

      const og = h('div', 'pick-grid', ...ORIGINS.map((o) => pickCard(o.name, [o.text],
        nameKey(wz.origin) === nameKey(o.name), () => { wz.origin = o.name; renderSetup(); })));
      body.append(h('h3', 'setup__sub', 'Origem'), og,
        h('div', 'fields-grid',
          setupField('wz-origin', 'Origem (ou escreva outra)', wz.origin, 'Ex.: Exilado Urbano', (v) => { wz.origin = v; }, 60),
          setupField('wz-age', 'Idade', wz.age, 'Ex.: 27 anos', (v) => { wz.age = v; }, 20),
          setupField('wz-height', 'Altura', wz.height, 'Ex.: 1,78 m', (v) => { wz.height = v; }, 20),
          setupField('wz-sex', 'Sexo', wz.sex, '', (v) => { wz.sex = v; }, 20)));
    }

    if (wz.step === 1) {
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

    if (wz.step === 2) {
      const c = skillCount(wz.skills);
      body.append(h('p', 'setup__pool', 'Com +2: ', h('strong', '', c.two + ' de 2'), ' · Com +1: ', h('strong', '', c.one + ' de 1')));
      ATTRS.forEach((at) => {
        const group = h('div', 'skills skills--' + at.id, h('h3', 'skills__title', at.label + ' ', h('span', 'skills__attr', signed(wz.attrs[at.id]))));
        const line = h('div', 'skill-picks');
        SKILLS[at.id].forEach((sk) => {
          const v = wz.skills[sk[0]] || 0;
          const b = h('button', 'skill-pick' + (v ? ' skill-pick--' + v : ''), sk[1], h('span', 'skill-pick__v', v ? '+' + v : '—'));
          b.type = 'button';
          b.dataset.fid = 'wzs-' + sk[0];
          b.setAttribute('aria-label', sk[1] + ': ' + (v ? '+' + v : 'sem bônus') + '. Toque para alternar.');
          b.addEventListener('click', () => {
            const next = (v + 1) % 3;
            if (next) wz.skills[sk[0]] = next; else delete wz.skills[sk[0]];
            renderSetup('wzs-' + sk[0]);
          });
          line.append(b);
        });
        group.append(line);
        body.append(group);
      });
      if (wz.skills.oficio) body.append(setupField('wz-oficio', 'Ofício: qual profissão?', wz.oficio, 'Ex.: mecânica', (v) => { wz.oficio = v; }, 40));
    }

    if (wz.step === 3) {
      const m = previewSheet();
      const skills = [];
      ATTRS.forEach((at) => SKILLS[at.id].forEach((sk) => { if (wz.skills[sk[0]]) skills.push(sk[1] + ' +' + wz.skills[sk[0]]); }));
      const row = (k, v) => [h('dt', '', k), h('dd', '', v || '—')];
      body.append(h('dl', 'member__data setup__summary',
        ...row('Espécime', wz.specimen ? wz.specimen.name + ' (' + specimenLine(wz.specimen) + ')' : ''),
        ...row('Origem', wz.origin),
        ...row('Atributos', ATTRS.map((at) => at.label + ' ' + signed(wz.attrs[at.id])).join(' · ')),
        ...row('Perícias', skills.join(' · ')),
        ...row('Recursos', LIFE.filter((l) => m.max[l[0]] > 0).map((l) => l[1] + ' ' + m.max[l[0]]).join(' · ') + ' · PE ' + m.max.pe + ' · PA ' + m.max.pa),
        ...row('Carga', fmtNum(m.cargaMax)),
        ...row('UP iniciais', String(m.upTotal))));
      const origin = ORIGINS.find((o) => nameKey(o.name) === nameKey(wz.origin));
      if (origin && sheetChar.sheet.originItems !== origin.name) {
        const cb = h('input');
        cb.type = 'checkbox';
        cb.checked = wz.addItems;
        cb.addEventListener('change', () => { wz.addItems = cb.checked; });
        body.append(h('label', 'check', cb, h('span', '', 'Colocar os itens iniciais de ' + origin.name + ' no inventário')),
          h('ul', 'r-list setup__items', ...origin.items.map((t) => h('li', '', t))),
          h('p', 'field__hint', 'Entram como itens rápidos (texto). Onde a origem dá uma escolha ("ou"), ajuste depois no inventário.'));
      }
    }

    const problem = setupProblem();
    $('#setup-error').textContent = problem;
    $('#setup-back').hidden = wz.step === 0;
    const next = $('#setup-next');
    next.textContent = wz.step === SETUP.length - 1 ? 'Concluir' : 'Continuar';
    next.disabled = Boolean(problem);
    if (focusId) { const el = $('[data-fid="' + focusId + '"]', body) || $('[data-fid^="' + focusId.slice(0, -1) + '"]:not(:disabled)', body); if (el) el.focus({ preventScroll: true }); }
  }

  function openSetup() {
    const c = sheetChar, s = c.sheet;
    wz = {
      step: 0, attrs: Object.assign({}, s.attrs), skills: {}, oficio: s.oficio || '',
      specimen: s.specimen ? deep(s.specimen) : null, origin: c.origin || '', age: c.age || '', height: s.height || '', sex: s.sex || '', addItems: true
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
    const origin = ORIGINS.find((o) => nameKey(o.name) === nameKey(wz.origin));
    if (origin && wz.addItems && s.originItems !== origin.name) {
      origin.items.forEach((t) => s.inventory.push(originItemEntry(t)));
      s.originItems = origin.name;
    }
    wz = null;
    closeDialog(setupDlg);
    fillBasics();
    changed();
    flushSave();
    toast('Distribuição inicial concluída.');
  }

  $('#setup-open').addEventListener('click', openSetup);
  $('#setup-back').addEventListener('click', () => { wz.step = Math.max(0, wz.step - 1); renderSetup(); $('#setup-title').focus({ preventScroll: true }); });
  $('#setup-next').addEventListener('click', () => {
    if (setupProblem()) return;
    if (wz.step === SETUP.length - 1) { finishSetup(); return; }
    wz.step++;
    renderSetup();
    $('#setup-title').focus({ preventScroll: true });
    $('.setup').scrollTop = 0;
  });
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
      return i.name + ((i.qty || 1) > 1 ? ' ×' + i.qty : '') + (i.equipped ? ' [equipado]' : '') + (parts.length ? ' (' + parts.join(', ') + ')' : '');
    });
    return [
      ['Espécime', c.species], ['Idade', c.age], ['Altura', s.height], ['Sexo', s.sex], ['Origem', c.origin],
      ['Atributos', ATTRS.map((at) => at.label + ' ' + signed(s.attrs[at.id])).join(' · ')],
      ['Recursos', life.concat(['PE ' + getCur(s, 'pe', m.max.pe) + '/' + m.max.pe, 'PA ' + getCur(s, 'pa', m.max.pa) + '/' + m.max.pa]).join(' · ')],
      ['Defesa mínima', String(m.defMin)],
      ['Perícias', skills.join(' · ')],
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
    fSex.value = c.sheet.sex || '';
  }
  $('#origin-list').replaceChildren(...ORIGINS.map((o) => { const op = h('option'); op.value = o.name; return op; }));

  views.character = async function showSheet(id) {
    await flushSave(); // não perde edição pendente da ficha anterior
    const c = await db.getCharacter(id);
    if (!c) { toast('Não encontramos essa ficha.'); go('personagens'); return; }
    c.sheet = normSheet(c.sheet);
    sheetChar = c;
    dirty.clear();
    invOpen.clear();
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
    rerender();
    $('#setup-open').textContent = c.sheet.setup ? 'Refazer distribuição inicial' : 'Distribuição inicial';
    $('#danger-zone').hidden = !c.mine;
    $('#delete-character').textContent = 'Excluir ' + (c.type === 'criatura' ? 'criatura' : 'personagem');
    await renderSheetCampaigns();
    if (!c.sheet.setup && c.mine && sheetChar === c) openSetup(); // primeira vez: abre a distribuição inicial
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
    currentCamp = camp;
    firstRolls = true;
    $('#campaign-title').textContent = camp.name;
    $('#campaign-code').textContent = camp.id;
    $('#camp-danger').hidden = !camp.isOwner;
    document.title = camp.name + ' | Vortex';

    let noAccess = false;
    try { members = await db.listMembers(id); }
    catch (err) { console.warn(err); members = []; noAccess = true; }

    $('#member-list').replaceChildren(...members.map(memberRow));
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
    await migrateOldItems();
    window.addEventListener('hashchange', render);
    render();
  }

  start();
})();