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
      campaignIds: (c.campaignIds || []).slice(), mine: c.ownerUid === ME
    });
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
    const nameDoc = (kind, name) => names().doc((kind === 'campaign' ? 'k_' : 'c_') + nameKey(name));

    const toChar = (snap) => {
      const d = snap.data();
      return {
        id: snap.id, name: d.name, type: d.type, image: d.image || '', thumb: d.thumb || '',
        species: d.species || '', age: d.age || '', origin: d.origin || '',
        campaignIds: d.campaignIds || [], mine: d.ownerUid === me
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
        return { id: ref.id, name, type, image: '', thumb: '', species: '', age: '', origin: '', campaignIds: [], mine: true };
      },

      // Grava só os campos enviados (assim não apaga o que outra pessoa editou nos outros campos)
      async saveCharacter(id, patch) {
        const ref = chars().doc(id);
        const upd = { updatedAt: FV.serverTimestamp() };
        ['species', 'age', 'origin', 'image', 'thumb'].forEach((k) => { if (k in patch) upd[k] = String(patch[k]); });
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
  function fileToImages(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try { resolve({ image: cropSquare(img, 320, 0.82), thumb: cropSquare(img, 96, 0.75) }); }
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
      text: 'Nome, espécie, idade e origem. O nome é único. Qualquer pessoa pode editar a ficha, então o jogo depende da boa-fé de todos.',
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
        h('dt', '', 'Origem'), h('dd', '', m.origin || '—')),
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


  /* ---------- Itens: categoria → tipo → formulário ----------
     Os dados vêm de items.js (window.VORTEX_ITEMS). Os itens montados ficam
     só neste aparelho (localStorage) — ainda não há um lugar nas campanhas
     ou fichas para guardá-los de verdade. */
  const ITEMS_KEY = 'vortex.items.v1';
  const ITEM_DATA = window.VORTEX_ITEMS || { categories: [], raridades: [], tiposDano: [] };
  const itemState = { categoryId: null, typeId: null, step: 'categoria' };

  function itemsLoad() {
    try { const l = JSON.parse(localStorage.getItem(ITEMS_KEY)); return Array.isArray(l) ? l : []; }
    catch (e) { return []; }
  }
  function itemsSave(list) {
    try { localStorage.setItem(ITEMS_KEY, JSON.stringify(list)); }
    catch (e) { toast('Não foi possível salvar: o armazenamento está cheio.'); }
  }

  const findCategory = (id) => ITEM_DATA.categories.find((c) => c.id === id);
  const findType = (cat, id) => (cat.types || []).find((t) => t.id === id);
  const optionsFor = (key) => ITEM_DATA[key] || [];

  function itemCard(title, hint, onClick, helpRule) {
    const btn = h('button', 'item-card', h('span', 'item-card__title', title), hint ? h('span', 'item-card__hint', hint) : null);
    btn.type = 'button';
    btn.addEventListener('click', onClick);
    return btn;
  }

  function setItemStep(step) {
    itemState.step = step;
    ['categoria', 'tipo', 'form', 'soon'].forEach((s) => { $('#item-panel-' + s).hidden = s !== step; });
    $$('.item-steps__step').forEach((b) => {
      const on = b.dataset.itemStep === step;
      b.setAttribute('aria-current', on ? 'step' : 'false');
    });
    $('#step-tipo-btn').hidden = !itemState.categoryId || !findCategory(itemState.categoryId).types;
    $('#step-form-btn').hidden = step === 'categoria' || (step === 'tipo');
    if (step !== 'form') $('#step-form-btn').hidden = true;
    const heading = $('.item-panel:not([hidden]) h2, .item-panel:not([hidden]) [tabindex]');
    if (heading) heading.focus({ preventScroll: true });
  }

  function renderCategoryGrid() {
    const grid = $('#item-category-grid');
    grid.replaceChildren();
    let lastGroup = null;
    ITEM_DATA.categories.forEach((c) => {
      if (c.group !== lastGroup) { grid.append(h('p', 'item-grid__group', c.group)); lastGroup = c.group; }
      grid.append(itemCard(c.title, c.comingSoon ? 'Em breve' : c.hint, () => openCategory(c.id)));
    });
  }

  function openCategory(id) {
    const cat = findCategory(id);
    if (!cat) return;
    itemState.categoryId = id;
    itemState.typeId = null;
    if (cat.comingSoon) {
      $('#item-soon-title').textContent = cat.title;
      setItemStep('soon');
      return;
    }
    if (cat.types) {
      $('#item-tipo-title').textContent = cat.title;
      $('#item-tipo-hint').textContent = cat.hint || '';
      $('#item-type-grid').replaceChildren(...cat.types.map((t) => itemCard(t.title, null, () => openType(id, t.id))));
      setItemStep('tipo');
      return;
    }
    openForm(id, null);
  }

  function openType(categoryId, typeId) {
    itemState.categoryId = categoryId;
    itemState.typeId = typeId;
    openForm(categoryId, typeId);
  }

  function fieldControl(field, value) {
    if (field.kind === 'select') {
      const sel = h('select', 'input');
      sel.id = 'item-f-' + field.key;
      h('option', '', '—'); // placeholder, não usado diretamente
      sel.append(h('option', '', 'Escolha...'));
      optionsFor(field.options).forEach((op) => {
        const o = h('option', '', op);
        if (op === value) o.selected = true;
        sel.append(o);
      });
      return sel;
    }
    if (field.kind === 'textarea') {
      const ta = h('textarea', 'input');
      ta.id = 'item-f-' + field.key;
      ta.rows = 3;
      ta.value = value || '';
      return ta;
    }
    const inp = h('input', 'input');
    inp.type = 'text';
    inp.id = 'item-f-' + field.key;
    inp.autocomplete = 'off';
    inp.value = value || '';
    return inp;
  }

  function openForm(categoryId, typeId) {
    const cat = findCategory(categoryId);
    const type = typeId ? findType(cat, typeId) : null;
    $('#item-form-title').textContent = cat.title + (type ? ' · ' + type.title : '');
    $('#item-form-hint').textContent = type && type.rule
      ? 'Os valores de ' + type.title + ' vêm da média de criação das regras; edite como quiser.'
      : (cat.hint || '');

    const grid = $('#item-fields');
    grid.replaceChildren();
    cat.fields.forEach((f) => {
      const defVal = f.fromType && type ? (type.defaults[f.key] || '') : '';
      const wrap = h('div', 'field' + (f.big ? ' field--wide' : ''), h('label', 'field__label', f.label), fieldControl(f, defVal));
      grid.append(wrap);
    });
    setItemStep('form');
  }

  function itemRow(it) {
    const cat = findCategory(it.categoryId);
    const label = (cat ? cat.title : it.categoryId) + (it.typeTitle ? ' · ' + it.typeTitle : '');
    const row = h('li', 'row',
      h('span', 'row__open row__open--static',
        h('span', 'row__main', h('span', 'row__title', it.name || 'Sem nome'), h('span', 'row__meta', label))));
    const del = h('button', 'btn btn--danger btn--sm', 'Excluir');
    del.type = 'button';
    del.addEventListener('click', () => {
      itemsSave(itemsLoad().filter((x) => x.id !== it.id));
      renderMyItems();
    });
    row.append(del);
    return row;
  }

  function renderMyItems() {
    const list = itemsLoad();
    $('#my-items-block').hidden = list.length === 0;
    $('#my-items-list').replaceChildren(...list.map(itemRow));
  }

  $('#item-back-categoria').addEventListener('click', (ev) => { ev.preventDefault(); setItemStep('categoria'); });
  $('#item-back-soon').addEventListener('click', (ev) => { ev.preventDefault(); setItemStep('categoria'); });
  $('#item-back-tipo').addEventListener('click', (ev) => {
    ev.preventDefault();
    const cat = findCategory(itemState.categoryId);
    if (cat && cat.types) setItemStep('tipo'); else setItemStep('categoria');
  });
  $$('.item-steps__step').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.itemStep === 'categoria') setItemStep('categoria');
    else if (b.dataset.itemStep === 'tipo' && itemState.categoryId) setItemStep('tipo');
    else if (b.dataset.itemStep === 'form' && itemState.categoryId) setItemStep('form');
  }));

  $('#item-reset').addEventListener('click', () => setItemStep('categoria'));
  $('#form-item').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const cat = findCategory(itemState.categoryId);
    const type = itemState.typeId ? findType(cat, itemState.typeId) : null;
    const values = {};
    cat.fields.forEach((f) => { values[f.key] = $('#item-f-' + f.key).value.trim(); });
    if (!values.nome) { toast('Dê um nome para o item.'); $('#item-f-nome').focus(); return; }
    const item = {
      id: uid(), categoryId: cat.id, typeId: type ? type.id : null, typeTitle: type ? type.title : '',
      name: values.nome, values, createdAt: Date.now()
    };
    itemsSave([item].concat(itemsLoad()));
    toast('Item salvo.');
    renderMyItems();
    setItemStep('categoria');
  });

  views.itens = async function showItens() {
    renderCategoryGrid();
    renderMyItems();
    if (!itemState.categoryId) setItemStep('categoria');
    else setItemStep(itemState.step);
  };

  /* ---------- Ficha ---------- */
  let sheetChar = null;
  const statusEl = $('#sheet-status');
  const fName = $('#f-name'), errName = $('#f-name-error');
  const fSpecies = $('#f-species'), fAge = $('#f-age'), fOrigin = $('#f-origin');
  const formAttach = $('#form-attach'), inAttach = $('#attach-code'), errAttach = $('#attach-error');
  const setStatus = (text) => { statusEl.textContent = text; };

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

  // Espécie, idade e origem: salvam sozinhas, e só o que mudou
  // (assim não apagam o que outra pessoa editou nos outros campos)
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

  /* Exportar: PDF, Word, texto ou copiar */
  const exportDlg = $('#export-dialog');
  $('#export-open').addEventListener('click', async () => { await flushSave(); openDialog(exportDlg); });
  $('#export-close').addEventListener('click', () => closeDialog(exportDlg));
  $$('[data-export]').forEach((b) => b.addEventListener('click', () => doExport(b.dataset.export)));

  async function doExport(kind) {
    try {
      const c = (await db.getCharacter(sheetChar.id)) || sheetChar; // dados mais recentes
      const camps = await db.listCharacterCampaigns(c.id).catch(() => []);
      const model = {
        title: c.name, kind: TYPE_LABEL[c.type],
        fields: [['Espécie', c.species], ['Idade', c.age], ['Origem', c.origin]],
        campaigns: camps.map((x) => x.name), image: c.image, date: new Date().toLocaleDateString('pt-BR')
      };
      const base = fileSlug(c.name) + '-ficha';
      if (kind === 'pdf') downloadFile(makePdf(model), 'application/pdf', base + '.pdf');
      else if (kind === 'docx') downloadFile(makeDocx(model), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', base + '.docx');
      else if (kind === 'txt') downloadFile(enc.encode('\uFEFF' + sheetText(model)), 'text/plain;charset=utf-8', base + '.txt');
      else if (!(await copyText(sheetText(model)))) { toast('Não foi possível copiar sozinho. Baixe o .txt.'); return; }
      closeDialog(exportDlg);
      toast(kind === 'copy' ? 'Texto da ficha copiado.' : 'Arquivo gerado.');
    } catch (err) { toast(errorMessage(err)); }
  }

  views.character = async function showSheet(id) {
    await flushSave(); // não perde edição pendente da ficha anterior
    const c = await db.getCharacter(id);
    if (!c) { toast('Não encontramos essa ficha.'); go('personagens'); return; }
    sheetChar = c;
    dirty.clear();
    lastCharacterId = id;
    quickUpdate(c, true);
    onLeave = () => { flushSave(); };
    renderSheetHeader();
    fName.value = c.name;
    fSpecies.value = c.species;
    fAge.value = c.age;
    fOrigin.value = c.origin;
    setError(errName, fName, '');
    setError(errAttach, inAttach, '');
    setStatus('');
    renderPortrait();
    renderPin();
    $('#danger-zone').hidden = !c.mine;
    $('#delete-character').textContent = 'Excluir ' + (c.type === 'criatura' ? 'criatura' : 'personagem');
    await renderSheetCampaigns();
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
    window.addEventListener('hashchange', render);
    render();
  }

  start();
})();