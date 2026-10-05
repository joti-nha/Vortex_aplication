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
    const sixes = rolls.filter((v) => v === 6).length;
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
    const foeListeners = {};
    const sceneListeners = {};
    const foesOf = (campaignId) => Object.values((read().foes || {})[campaignId] || {}).map(clone).sort((a, b) => a.createdAt - b.createdAt);
    function notifyFoes(campaignId) { (foeListeners[campaignId] || new Set()).forEach((cb) => cb(foesOf(campaignId))); }
    const shopListeners = {};
    const shopsOf = (campaignId) => Object.values((read().shops || {})[campaignId] || {}).map(clone).sort((a, b) => a.createdAt - b.createdAt);
    function notifyShops(campaignId) { (shopListeners[campaignId] || new Set()).forEach((cb) => cb(shopsOf(campaignId))); }
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

  // Pergunta de uma escolha (ex.: a perícia do Doutor). Devolve o valor ou null.
  function askChoice(title, label, hint, options) {
    const dlg = document.getElementById('choice-dialog');
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
    if (m.mine && m.sheet) { // as ações ficam no painel do personagem, no topo da campanha
      const play = h('button', 'btn btn--primary btn--sm', 'Jogar com ' + m.name);
      play.type = 'button';
      play.addEventListener('click', () => playAs(m.characterId));
      info.append(play);
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
    const clap = /clap\s*trap|cl4p/.test(nameKey(q));
    $('#search-list').replaceChildren(...(clap ? [claptrapRow()] : []), ...list.map(searchRow));
    $('#search-empty').hidden = list.length > 0 || clap;
    $('#search-hint').textContent = plural(list.length + (clap ? 1 : 0), 'ficha encontrada', 'fichas encontradas') + (origin ? ' com a origem ' + origin : '');
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
  const layersSummary = (v) => [['escudo', 'Escudo'], ['blindagem', 'Blindagem'], ['pv', 'PV']].filter((x) => num(v[x[0]])).map((x) => x[1] + ' ' + num(v[x[0]])).join(' · ');
  function entryMeta(e) {
    const v = e.values || {};
    if (e.kind === 'build') return [e.kindTitle || kindTitle(e.kind), v.papel, ['corpo', 'precisao', 'essencia'].map((k) => k.charAt(0).toUpperCase() + ' ' + (num(v[k]) > 0 ? '+' : '') + num(v[k])).join(' '), [v.pericia2a, v.pericia2b].filter(Boolean).map((x) => x + ' +2').concat(v.pericia1 ? [v.pericia1 + ' +1'] : []).join(', ')].filter(Boolean).join(' · ');
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
    (actions || []).forEach((a) => {
      const b = h('button', 'btn btn--sm ' + (a.cls || 'btn--ghost'), a.label);
      b.type = 'button';
      b.setAttribute('aria-label', a.label + ': ' + e.name);
      b.addEventListener('click', a.onClick);
      row.append(b);
    });
    return row;
  }

  /* Todos os dados de um registro do banco (vale para itens, espécimes, poderes e origens) */
  const entryDlg = $('#entry-dialog');
  function openEntry(e) {
    const cat = findCategory(e.kind);
    const v = e.values || {};
    $('#entry-title').replaceChildren(e.name || 'Sem nome', ...(e.oficial ? [' ', h('span', 'tag', 'Oficial')] : []));
    $('#entry-meta').textContent = [e.kindTitle || kindTitle(e.kind), e.typeTitle, e.oficial ? 'Catálogo oficial' : (e.mine ? 'Criado por você' : 'Banco compartilhado')].filter(Boolean).join(' · ');
    const body = $('#entry-body');
    body.replaceChildren();
    if (e.image || e.thumb) { const img = h('img', 'entry__img'); img.src = e.image || e.thumb; img.alt = ''; body.append(img); }
    const dl = h('dl', 'member__data entry__data');
    const seen = new Set(['nome', 'lore']);
    ((cat && cat.fields) || []).forEach((f) => {
      seen.add(f.key);
      const val = v[f.key];
      if (f.kind === 'roteiro') { rtEntryRows(v).forEach((r) => dl.append(h('dt', '', r[0]), h('dd', 'entry__pre', r[1]))); return; }
      if (f.hidden || f.key === 'nome' || f.key === 'lore' || val === undefined || val === null || String(val).trim() === '') return;
      dl.append(h('dt', '', f.key === 'fabricante' ? 'Criadora' : f.label.replace(/\s*\(.*\)$/, '')), h('dd', '', f.key === 'fabricante' ? makerTag(String(val)) : f.key === 'preco' ? priceText(val) : String(val)));
    });
    // campos que não estão no formulário atual (registros antigos) também aparecem
    Object.keys(v).forEach((k) => { if (!seen.has(k) && String(v[k] || '').trim()) dl.append(h('dt', '', k), h('dd', '', String(v[k]))); });
    const b = bonusLine(entryBonus(e));
    if (b) dl.append(h('dt', '', 'Bônus'), h('dd', '', b + (cat && cat.inventory ? ' (quando equipado)' : '')));
    const parts = e.slots ? (e.slots.mods || []).concat(e.slots.props || [], e.slots.accs || []).map((x) => x.name) : [];
    if (parts.length) dl.append(h('dt', '', 'Encaixes'), h('dd', '', parts.join(', ')));
    if (dl.children.length) body.append(dl);
    else body.append(h('p', 'empty', 'Sem outros dados além do nome.'));
    const lore = String(v.lore || '').trim();
    if (lore) body.append(h('h3', 'entry__sub', 'Lore'), ...lore.split(/\n+/).map((t) => h('p', 'entry__lore', t)));
    openDialog(entryDlg);
  }
  $('#entry-close').addEventListener('click', () => closeDialog(entryDlg));

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
      $('#picker-create').hidden = !opts.create;
      if (opts.create) $('#picker-create-btn').textContent = opts.create.label;
      $('#picker-hint').textContent = 'Buscando...';
      openDialog(pickerDlg);
      runPicker();
      if (window.matchMedia('(pointer: fine)').matches) $('#picker-q').focus();
    });
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
      if (f.hidden) return; // escrito por outro campo (o roteiro da build)
      if (f.kind === 'roteiro') { grid.append(h('div', 'field field--wide', h('span', 'field__label', f.label), roteiroField(d))); return; }
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
     Claptrap: busque o nome dele entre os personagens e abra a ficha (que não salva). Desbloqueados ficam neste aparelho;
     a troca de tema fica no Perfil. O <head> do index.html aplica o tema antes de desenhar. */
  const THEME_KEY = 'vortex.themes.v1';
  const THEMES = [
    { id: '', name: 'Vortex', text: 'O de sempre: tempestade e lanterna.' },
    { id: 'ether', name: 'Ether', text: 'Elemento 115: violeta, ciano e energia instável.', hint: 'Dizem que um elemento perdido, de número 115, se esconde entre os itens.' },
    { id: 'claptrap', name: 'Claptrap', text: 'Amarelo de lata, capacete verde e fumaça de guerra.', hint: 'Um robô muito falante aparece quando alguém busca o nome dele entre os personagens.' }
  ];
  const themeState = (() => {
    try { const v = JSON.parse(localStorage.getItem(THEME_KEY)) || {}; return { unlocked: Array.isArray(v.unlocked) ? v.unlocked : [], active: v.active || '' }; }
    catch (e) { return { unlocked: [], active: '' }; }
  })();
  const saveThemes = () => { try { localStorage.setItem(THEME_KEY, JSON.stringify(themeState)); } catch (e) { /* sem armazenamento: vale até fechar */ } };
  function applyTheme(id) {
    themeState.active = id;
    if (id) document.documentElement.dataset.theme = id; else delete document.documentElement.dataset.theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--abismo').trim() || '#0f1c26';
    saveThemes();
  }
  applyTheme(themeState.unlocked.indexOf(themeState.active) >= 0 ? themeState.active : '');

  function secretHit(q) {
    const k = nameKey(q || '');
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
      out.gain.value = 0.2;
      out.connect(ac.destination);
      const tone = (type, f0, f1, t0, dur, vol) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f0, now + t0);
        o.frequency.exponentialRampToValueAtTime(f1, now + t0 + dur);
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
      } else { // bipes de robô animado
        [523, 659, 784, 1047, 880, 1319, 1568].forEach((f, i) => tone('square', f, f * 1.03, i * 0.085, 0.075, 0.3));
        tone('sine', 260, 920, 0.7, 0.22, 0.5);
        tone('sine', 920, 340, 0.95, 0.25, 0.4);
      }
      setTimeout(() => ac.close().catch(() => {}), 3200);
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
        h('p', 'unlock__sub', id === 'ether' ? 'Elemento 115 absorvido. A energia Ether toma conta do Vortex.' : 'CL4P-TP online! Pronto para servir, caçador.')));
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
        h('span', 'theme-card__main', h('strong', '', open ? t.name : '???'), h('span', '', open ? t.text : t.hint)));
      if (open) {
        const b = h('button', 'btn btn--sm ' + (on ? 'btn--ghost' : 'btn--primary'), on ? 'Em uso' : 'Usar');
        b.type = 'button';
        b.disabled = on;
        b.addEventListener('click', () => { applyTheme(t.id); renderThemes(); toast('Tema ' + t.name + '.'); });
        card.append(b);
      } else card.append(h('span', 'theme-card__lock', '🔒'));
      return card;
    }));
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
    const maker = $('#lib-maker').value;
    if (maker) list = list.filter((e) => (e.values || {}).fabricante === maker);
    list.sort((a, b) => (Number(b.mine) - Number(a.mine)) || (Number(Boolean(a.oficial)) - Number(Boolean(b.oficial))) || a.name.localeCompare(b.name, 'pt-BR'));
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
    ITEM_DATA.categories.filter((c) => ITEM_KINDS.indexOf(c.id) >= 0).forEach((c) => { const o = h('option', '', c.title); o.value = c.id; sel.append(o); });
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
    { label: 'Builds', kinds: ['build'] },
    { label: 'Poderes', kinds: ['poder'] },
    { label: 'Armas', kinds: ['arma-melee', 'arma-fogo'] },
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
      return;
    }
    $('#cat-hint').textContent = 'Buscando...';
    let list = await libSearch(g ? g.kinds : null, q);
    if (seq !== catState.seq) return;
    list.sort((a, b) => (a.kindTitle || '').localeCompare(b.kindTitle || '', 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));
    const secret = secretHit(q);
    $('#cat-list').replaceChildren(...(secret ? [secretRow(secret)] : []), ...list.map((e) => libRow(e, e.mine ? [{ label: 'Editar', onClick: () => { openForm(e.kind, e.typeId, e); go('itens'); } }] : [])));
    $('#cat-empty').hidden = list.length > 0 || Boolean(secret);
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
      cur: {}, specimen: null, powers: [], inventory: [], originItems: '', doutor: [], upProfs: []
    };
  }
  function normSheet(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const b = blankSheet();
    const s = Object.assign({}, b, r);
    ['attrs', 'up', 'extra', 'skills', 'cur'].forEach((k) => { s[k] = Object.assign({}, b[k], r[k] && typeof r[k] === 'object' ? r[k] : {}); });
    s.powers = Array.isArray(r.powers) ? r.powers.slice() : [];
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
    .map((x) => ({ name: x[0].slice(0, 60), text: x[1] || '', cost: x[2] || '' }));
  const powerOpts = (p) => powerLines(p.values && p.values.opcoes);
  const powerUps = (p) => powerLines(p.values && p.values.melhorias);
  const powerPicks = (p) => { const names = powerOpts(p).map((o) => o.name); return (p.picks || []).filter((n) => names.indexOf(n) >= 0); };
  const peCost = (txt) => { const m = /(\d+)\s*pe\b/i.exec(String(txt || '')); return m ? Number(m[1]) : 0; };
  const upCount = (p, name) => Math.max(0, Math.round(num((p.ups || {})[name])));
  function powerUpCost(p) {
    const custo = num(p.values && p.values.custo);
    const base = powerOpts(p).length ? custo * powerPicks(p).length : custo;
    return base + powerUps(p).reduce((t, u) => t + (u.cost === '' ? 1 : num(u.cost)) * upCount(p, u.name), 0);
  }

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
    const powerCost = s.powers.reduce((t, p) => t + powerUpCost(p), 0);
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
      skillBudget: 5 + Math.ceil(upEarned / 2) + 3 * s.up.per + upProfsOf(s).length,
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
    if (a.type === 'pericias') {
      s.up.per += 1;
      a.list.forEach((x) => { s.skills[x[0]] = Math.min(skillCap(s, x[0]), num(s.skills[x[0]]) + x[1]); });
      return true;
    }
    return false;
  }
  function applyGuidePage(s, pg) { // devolve o texto do que entrou
    const g = s.guide;
    const ok = [], miss = [];
    pg.acts.forEach((a) => { if (a.type === 'nota') return; if (applyGuideAction(s, a)) ok.push(a.text); else miss.push(a.text); });
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
      const ok = applyGuidePage(s, pg);
      if (ok.length) out.push('UP ' + pg.n + ': ' + ok.join(', '));
    });
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
  function startMoney(up) {
    const t = ITEM_DATA.dinheiroInicial || [[0, 1500]];
    const last = t[t.length - 1];
    if (up > last[0]) return last[1] + (up - last[0]) * 1000;
    let v = t[0][1];
    t.forEach((r) => { if (up >= r[0]) v = r[1]; });
    return v;
  }

  /* ---------- Roteiro da build (modo avançado) ----------
     A build tem o nível 0 (a distribuição inicial) e, se quiser, um roteiro: escolha quantos UP e quanto
     dinheiro, e o roteiro vira um livrinho com uma folha por UP. Cada folha mostra o que aquele UP dá
     (1 UP para gastar, +1 ponto de perícia nos ímpares, 2 benefícios nos pares) e guarda a escolha.
     O roteiro fica em values.roteiro (JSON) e também é escrito no texto das folhas, que a ficha já sabe aplicar. */
  const RT_KINDS = [['poder', 'Poder'], ['melhoria', 'Melhoria'], ['doutor', 'Doutor'], ['prof', 'Proficiência'], ['pericias', 'Perícias'], ['guardar', 'Guardar']];
  const RT_BEN = [['pv', '+5 PV'], ['pe', '+5 PE'], ['pa', '+1 PA']];
  const RT_MAX_UP = 30;
  const rtSkills = () => { const out = []; ATTRS.forEach((at) => SKILLS[at.id].forEach((sk) => out.push([sk[0], sk[1]]))); return out; };
  const rtPage = () => ({ gasto: null, ben: ['', ''], per: '', nota: '' });
  const rtNew = (up, money) => ({ v: 1, up, dinheiro: money, itens: [], pages: Array.from({ length: up }, rtPage) });
  function rtRead(values) { // JSON salvo, ou o texto antigo das folhas convertido
    const v = values || {};
    try {
      const r = JSON.parse(v.roteiro || '');
      if (r && Array.isArray(r.pages)) {
        r.pages = r.pages.map((p) => Object.assign(rtPage(), p, { ben: Array.isArray(p && p.ben) ? p.ben.slice(0, 2).concat(['', '']).slice(0, 2) : ['', ''] }));
        r.itens = Array.isArray(r.itens) ? r.itens : [];
        r.up = r.pages.length;
        r.dinheiro = num(r.dinheiro);
        return r;
      }
    } catch (e) { /* sem roteiro salvo */ }
    const pages = guidePages(v);
    if (!pages.length) return null;
    const r = rtNew(Math.min(RT_MAX_UP, pages[pages.length - 1].n), num(v.dinheiro) || startMoney(0));
    pages.forEach((pg) => {
      const p = r.pages[pg.n - 1];
      if (!p) return;
      const notes = [];
      pg.acts.forEach((a) => {
        if (p.gasto) { notes.push(a.text); return; }
        if (a.type === 'poder') { const e = findPower(a.name); if (e) p.gasto = { t: 'poder', id: e.id, name: e.name, opt: a.opt || '' }; else notes.push(a.text); }
        else if (a.type === 'melhoria') { const e = guidePowers().find((x) => powerUps(x).some((u) => nameKey(u.name) === nameKey(a.name))); if (e) p.gasto = { t: 'melhoria', id: e.id, name: a.name }; else notes.push(a.text); }
        else if (a.type === 'doutor' && a.id) p.gasto = { t: 'doutor', skill: a.id };
        else if (a.type === 'prof' && a.id) p.gasto = { t: 'prof', prof: a.id };
        else if (a.type === 'pericias' && a.list.length) { const list = {}; a.list.forEach((x) => { list[x[0]] = (list[x[0]] || 0) + x[1]; }); p.gasto = { t: 'pericias', list }; }
        else if (a.type === 'nota' && /guard/i.test(a.text)) p.gasto = { t: 'guardar' };
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
  const rtFilled = (p, n) => Boolean(rtText(p.gasto)) && (n % 2 ? Boolean(p.per) : p.ben.every(Boolean));
  // grava o roteiro nos campos que a ficha e a distribuição inicial já leem
  function rtWrite(values, r) {
    if (!r) { values.roteiro = ''; values.folhas = ''; values.beneficios = ''; values.periciasUp = ''; values.itens = ''; values.dinheiro = ''; values.tipo = 'Entrada'; return; }
    values.roteiro = JSON.stringify(Object.assign({}, r, { setup: undefined }));
    values.folhas = r.pages.map((p, i) => {
      const parts = [rtText(p.gasto), p.nota.trim()].filter(Boolean);
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
      const parts = [rtText(p.gasto), n % 2 ? (p.per ? 'ponto em ' + skillLabel(p.per) : '') : p.ben.filter(Boolean).map((k) => RT_BEN.find((b) => b[0] === k)[1]).join(', '), p.nota].filter(Boolean);
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
    money.type = 'number'; money.min = '0'; money.step = '100'; money.id = 'rt-money'; money.inputMode = 'numeric';
    money.value = String(rt.r ? rt.r.dinheiro : startMoney(0));
    const table = h('p', 'field__hint');
    const paintTable = () => { table.textContent = 'Tabela de dinheiro inicial: quem começa com 0 UP tem ' + fmtCronos(startMoney(0)) + ' Cronos, com ' + clamp(Math.round(num(up.value)), 1, RT_MAX_UP) + ' UP tem ' + fmtCronos(startMoney(clamp(Math.round(num(up.value)), 1, RT_MAX_UP))) + '. Use o valor que fizer sentido para a build.'; };
    paintTable();
    up.addEventListener('input', paintTable);
    const go = h('button', 'btn btn--primary', rt.r ? 'Atualizar o livro' : 'Criar o livro');
    go.type = 'button';
    go.dataset.fid = 'rt-make';
    go.addEventListener('click', () => {
      const n = clamp(Math.round(num(up.value)), 1, RT_MAX_UP);
      const m = Math.max(0, Math.round(num(money.value)));
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
      const e = await openPicker({ title: 'Item do roteiro', kinds: INVENTORY_KINDS, chips: [
        { label: 'Armas', kinds: ['arma-melee', 'arma-fogo'] }, { label: 'Armaduras', kinds: ['armadura'] }, { label: 'Vestíveis', kinds: ['vestivel'] },
        { label: 'Implantes', kinds: ['nucleo', 'protese-modulo'] }, { label: 'Itens gerais', kinds: ['item-geral'] }], filter: (x) => INVENTORY_KINDS.indexOf(x.kind) >= 0 });
      if (!e || rt.r !== r) return;
      r.itens.push({ id: e.id || '', name: e.name, price: priceOf(e) });
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
    const kinds = h('div', 'rt-kinds', ...RT_KINDS.map((k) => {
      const b = h('button', 'rt-kind' + (g && g.t === k[0] ? ' is-on' : ''), k[1]);
      b.type = 'button';
      b.dataset.fid = 'rt-kind-' + k[0];
      b.setAttribute('aria-pressed', String(Boolean(g && g.t === k[0])));
      b.addEventListener('click', () => { p.gasto = g && g.t === k[0] ? null : { t: k[0] }; if (k[0] === 'pericias') p.gasto.list = {}; redo(); });
      return b;
    }));
    let detail = null;
    if (g && g.t === 'poder') {
      const e = g.id ? rtPower(g.id) : null;
      const pick = h('button', 'btn btn--ghost btn--sm', g.name ? 'Trocar poder' : 'Escolher poder…');
      pick.type = 'button';
      pick.dataset.fid = 'rt-power';
      pick.addEventListener('click', async () => {
        const x = await openPicker({ title: 'Poder da folha ' + n, kinds: ['poder'], chips: ['Poder'], filter: (y) => y.kind === 'poder' && !CHOICE_POWERS[y.id] });
        if (!x || rt.r !== r) return;
        const opts = powerOpts(x);
        p.gasto = { t: 'poder', id: x.id, name: x.name, opt: opts.length ? opts[0].name : '' };
        redo();
      });
      const opts = e ? powerOpts(e) : [];
      detail = h('div', 'rt-detail',
        g.name ? h('p', 'rt-pick', h('strong', '', g.name), h('span', '', ' · custa ' + plural(rtCost(g), 'UP', 'UP'))) : null,
        opts.length ? h('div', 'field', h('span', 'field__label', 'Opção'), rtSelect(opts.map((o) => [o.name, o.name + (o.text ? ': ' + o.text : '')]), g.opt, (v) => { g.opt = v; redo(); }, null, 'rt-opt')) : null,
        pick);
    } else if (g && g.t === 'melhoria') {
      const before = r.pages.slice(0, n - 1).map((x) => x.gasto).filter((x) => x && x.t === 'poder' && x.id);
      const seen = {};
      const opts = [];
      before.forEach((x) => { if (seen[x.id]) return; seen[x.id] = 1; const e = rtPower(x.id); if (e) powerUps(e).forEach((u) => opts.push([x.id + '|' + u.name, e.name + ' · ' + u.name + ' (' + (u.cost === '' ? 1 : num(u.cost)) + ' UP)'])); });
      detail = opts.length
        ? h('div', 'rt-detail', rtSelect(opts, g.id ? g.id + '|' + g.name : '', (v) => { const i = v.indexOf('|'); g.id = v.slice(0, i); g.name = v.slice(i + 1); redo(); }, 'Escolha a melhoria...', 'rt-up'))
        : h('p', 'rt-empty', 'Escolha antes, numa folha anterior, um poder que tenha melhorias.');
    } else if (g && g.t === 'doutor') {
      detail = h('div', 'rt-detail', rtSelect(rtSkills(), g.skill, (v) => { g.skill = v; redo(); }, 'Perícia do Doutor...', 'rt-doutor'), h('p', 'field__hint', 'O limite da perícia escolhida sobe para 4.'));
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
      n % 2 ? h('span', 'rt-chip', '+1 ponto de perícia') : h('span', 'rt-chip', '2 benefícios'));
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
    const nota = h('input', 'input');
    nota.type = 'text';
    nota.maxLength = 120;
    nota.placeholder = 'Lembrete (opcional): ex. comprar munição extra';
    nota.value = p.nota;
    nota.dataset.fid = 'rt-nota';
    nota.addEventListener('input', () => { p.nota = nota.value; });
    return h('article', 'guide__page rt-page' + (rtFilled(p, n) ? ' is-done' : '') + (led.short ? ' is-bad' : ''),
      h('p', 'guide__num', h('span', '', 'Folha'), h('strong', '', String(n))),
      res,
      h('div', 'rt-sec', h('h4', 'rt-sec__title', 'Gastar o UP'), kinds, detail,
        led.short ? h('p', 'field__error', 'Custa ' + led.cost + ' UP e só há ' + led.have + ' aqui. Use "Guardar" em folhas antes.') : null),
      extra,
      h('div', 'rt-sec', nota));
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
      const b = h('button', 'guide__mark' + (ok ? ' is-done' : '') + (bad ? ' is-bad' : '') + (n === rt.page ? ' is-on' : ''), n === 0 ? 'Itens' : String(n));
      b.type = 'button';
      b.setAttribute('aria-label', n === 0 ? 'Folha dos itens' : 'Folha ' + n);
      b.addEventListener('click', () => { rt.page = n; renderRoteiro(); });
      return b;
    }));
    const probs = rtProblems(r);
    body.append(
      h('div', 'rt__bar', h('span', 'rt-chip', plural(r.up, 'UP', 'UP')), h('span', 'rt-chip', fmtCronos(r.dinheiro) + ' Cronos'),
        h('span', 'rt-chip' + (probs.length ? ' rt-chip--bad' : ' rt-chip--ok'), probs.length ? plural(probs.length, 'aviso', 'avisos') : 'Tudo certo'), settings, clear),
      marks,
      h('div', 'guide__book rt-book', turn(-1, '‹'), h('div', 'guide__spread rt-spread', rt.page === 0 ? rtItemsPage() : rtUpPage(rt.page)), turn(1, '›')),
      h('p', 'field__hint', 'Quem segue esta build recebe cada folha quando ganha o UP dela, até parar a atualização automática na ficha.'));
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

  /* Compras sem fonte: o que está na ficha além do que as regras (ou um poder) concedem */
  function noSourceList(m) {
    const s = sheetChar.sheet;
    const out = [];
    const up = m.upSpent - m.upTotal;
    const picks = m.picksUsed - m.picksAllowed;
    const skills = m.skillUsed - m.skillBudget;
    const extraProfs = s.profs.length - 4;
    if (up > 0) out.push({ n: up, text: plural(up, 'UP gasto', 'UP gastos') + ' sem UP que os pague (poderes, melhorias ou UP em perícias). Ganhe XP ou desfaça uma compra.', label: 'Ver progressão', go: '#prog-block' });
    if (picks > 0) out.push({ n: picks, text: plural(picks, 'benefício de recurso', 'benefícios de recurso') + ' (+5 PV, +5 PE, +1 PA) sem UP par que os conceda.', label: 'Ver progressão', go: '#prog-block' });
    if (skills > 0) out.push({ n: skills, text: plural(skills, 'ponto de perícia', 'pontos de perícia') + ' além do que a distribuição inicial, os UP e os poderes dão.', label: 'Ver perícias', go: '#skills-block' });
    if (s.setup && attrPool(s.attrs).left < 0) out.push({ n: -attrPool(s.attrs).left, text: 'Atributos acima dos 3 pontos da distribuição inicial.', label: 'Refazer distribuição', go: () => openSetup() });
    if (extraProfs > 0) out.push({ n: extraProfs, text: plural(extraProfs, 'proficiência', 'proficiências') + ' além das 4 iniciais. As extras vêm do poder Proficiência em arma ou armadura.', label: 'Ver proficiências', go: '#profs-block' });
    return out;
  }
  function alertGo(p) {
    const b = h('button', 'link-btn', p.label);
    b.type = 'button';
    b.addEventListener('click', () => {
      if (typeof p.go === 'function') { p.go(); return; }
      const el = $(p.go);
      if (el) showSheetTab(el.closest('.sheet-panel'));
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); const f = $('button:not(:disabled), input', el); if (f) f.focus({ preventScroll: true }); }
    });
    return b;
  }

  function renderAlerts(m) {
    const list = pendingList(m);
    const bad = noSourceList(m);
    const box = $('#sheet-alerts');
    box.hidden = !list.length && !bad.length;
    box.classList.toggle('alerts--bad', bad.length > 0);
    box.replaceChildren(...(bad.length ? [h('p', 'alerts__title alerts__title--bad', 'Sem fonte reconhecida')] : []),
      ...bad.map((p) => h('p', 'alerts__item alerts__item--bad', p.text + ' ', alertGo(p))),
      ...(list.length ? [h('p', 'alerts__title', 'Há o que distribuir')] : []), ...list.map((p) => {
      const b = h('button', 'link-btn', p.label);
      b.type = 'button';
      b.addEventListener('click', () => {
        if (typeof p.go === 'function') { p.go(); return; }
        const el = $(p.go);
        if (el) showSheetTab(el.closest('.sheet-panel'));
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); const f = $('button:not(:disabled), input', el); if (f) f.focus({ preventScroll: true }); }
      });
      return h('p', 'alerts__item', p.text + ' ', b);
    }));
    const count = list.reduce((t, p) => t + p.n, 0);
    const skillsLeft = Math.max(0, m.skillBudget - m.skillUsed);
    if (watch.id === sheetChar.id && count > watch.pending) {
      const fresh = list.filter((p) => p.n).map((p) => p.text.replace(/[.:].*$/, '')).join(' · ');
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
    // abas com algo a distribuir ou sem fonte ganham um ponto
    const dot = { 'stab-progressao': m.picksAllowed - m.picksUsed > 0 || m.upTotal - m.upSpent > 0, 'stab-pericias': m.skillBudget - m.skillUsed > 0 };
    const red = { 'stab-progressao': m.upSpent > m.upTotal || m.picksUsed > m.picksAllowed, 'stab-pericias': m.skillUsed > m.skillBudget || sheetChar.sheet.profs.length > 4 };
    Object.keys(dot).forEach((id) => { const t = $('#' + id); t.classList.toggle('sheet-tab--dot', dot[id] && !red[id]); t.classList.toggle('sheet-tab--bad', red[id]); });
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
  function renderVitals(m) {
    const s = sheetChar.sheet;
    const life = LIFE.map((l) => ({ key: l[0], max: m.max[l[0]], cur: getCur(s, l[0], m.max[l[0]]) })).filter((l) => l.max > 0 || l.key === m.base);
    const lifeCur = life.reduce((t, l) => t + Math.max(0, l.cur), 0);
    const lifeMax = life.reduce((t, l) => t + l.max, 0);
    const lifeNote = life.filter((l) => l.max > 0).map((l) => (l.key === 'pv' ? 'PV' : l.key === 'escudo' ? 'Esc' : 'Bld') + ' ' + l.cur).join(' · ');
    const box = (cls, label, value, note) => h('div', 'vital vital--' + cls, h('span', 'vital__label', label), h('span', 'vital__big', value), note ? h('span', 'vital__note', note) : null);
    const free = m.upTotal - m.upSpent;
    $('#vitals').replaceChildren(
      box('def', 'Defesa', String(m.defMin), 'mínima'),
      ring('life', 'Resistência', lifeCur, lifeMax, lifeNote),
      ring('pe', 'PE', getCur(s, 'pe', m.max.pe), m.max.pe, 'Esforço'),
      ring('pa', 'PA', getCur(s, 'pa', m.max.pa), m.max.pa, 'Ação'),
      box('move', 'Deslocamento', m.over ? '4,5 m' : '9 m', m.over ? 'sobrecarregado' : 'padrão'),
      box('carga', 'Carga', fmtNum(m.cargaUsed) + '/' + fmtNum(m.cargaMax), m.over ? 'acima do limite' : 'mochila'),
      box('up', 'UP livres', String(free), 'XP ' + num(s.xp)));
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
    const shortRest = h('button', 'btn btn--ghost btn--sm', 'Descanso curto (metade)');
    shortRest.type = 'button';
    shortRest.dataset.fid = 'rest-short';
    shortRest.title = 'De 1 a 4 horas: recupera metade dos recursos (PV, PE e PA). Em descansos curtos seguidos, a recuperação cai pela metade a cada vez, até um descanso longo.';
    shortRest.addEventListener('click', () => {
      const got = restSheet(s, m, false); // Humanidade: a vida convertida também regenera como orgânica
      changed();
      toast('Descanso curto: ' + got + '.');
    });

    const rest = h('button', 'btn btn--ghost btn--sm', 'Descanso longo (tudo)');
    rest.type = 'button';
    rest.dataset.fid = 'rest';
    rest.addEventListener('click', () => { restSheet(s, m, true); changed(); toast('Todos os recursos recuperados.'); });

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
    const left = m.skillBudget - m.skillUsed;
    $('#skills-hint').replaceChildren('Teste = 2d6 + atributo + perícia (as rolagens ficam na campanha). Pontos de perícia: ' + m.skillUsed + ' de ' + m.skillBudget + '. ',
      ...(left > 0 ? [h('strong', 'skills__pending', plural(left, 'ponto pendente', 'pontos pendentes') + ' para distribuir.')] : []),
      ...(left < 0 ? [h('strong', 'skills__pending', 'Passou ' + plural(-left, 'ponto', 'pontos') + ' do limite.')] : []));
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
          stepper(v, { min: 0, max: Math.max(v, skillCap(s, sk[0])), label: sk[1], fid: 'sk-' + sk[0], text: '+' + v, onChange: (n) => { s.skills[sk[0]] = n; changed(); } }));
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
      h('p', 'field__hint', 'Cada UP investido em perícias dá +3 pontos livres. Poderes custam UP conforme o custo de cada um; Doutor e as proficiências extras de arma e armadura ficam em Poderes.'));
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
      const opts = powerOpts(p);
      const ups = powerUps(p);
      const total = powerUpCost(p);
      const costTxt = opts.length ? num(v.custo) + ' UP por opção · ' + total + ' UP gastos' : total ? 'Custo ' + total + ' UP' : '';
      const meta = [costTxt, v.custoUso ? 'Uso: ' + v.custoUso : '', bonusLine(p.bonus || {})].filter(Boolean).join(' · ');
      const main = h('span', 'row__main', h('span', 'row__title', p.name, ...(entryLore(p) ? [' ', entryLore(p)] : [])), h('span', 'row__meta', meta));
      if (v.efeito) main.append(h('span', 'row__text', v.efeito));
      if (opts.length) main.append(h('span', 'pw-sub', h('span', 'pw-sub__title', 'Opções (marque as compradas)'), ...opts.map((o, k) => powerOptRow(s, p, o, i + '-' + k))));
      if (ups.length) main.append(h('span', 'pw-sub', h('span', 'pw-sub__title', 'Melhorias'), ...ups.map((u, k) => powerUpRow(p, u, i + '-' + k))));
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
    const have = ch.sheet.powers.map((p) => p.id).filter((id) => id && !CHOICE_POWERS[id]);
    const e = await openPicker({ title: 'Adicionar poder', kinds: ['poder'], chips: ['Poder'], filter: (x) => x.kind === 'poder' && have.indexOf(x.id) < 0 });
    if (!e || sheetChar !== ch) return;
    const kind = CHOICE_POWERS[e.id];
    if (kind) {
      const s = ch.sheet;
      const opts = kind === 'pericia'
        ? Object.keys(SKILLS).reduce((all, k) => all.concat(SKILLS[k]), []).filter((sk) => doutorOf(s).indexOf(sk[0]) < 0).map((sk) => [sk[0], sk[1]])
        : PROFS.filter((p) => (p.id.indexOf('armadura-') === 0) === (kind === 'armadura') && !hasProf(s, p.id)).map((p) => [p.id, p.label]);
      if (!opts.length) { toast('Nada disponível para ' + e.name + ': o personagem já tem todas as opções.'); return; }
      const choice = await askChoice(e.name, kind === 'pericia' ? 'Escolha a perícia' : kind === 'arma' ? 'Escolha o tipo de arma' : 'Escolha o tipo de armadura', (e.values && e.values.efeito) || '', opts);
      if (!choice || sheetChar !== ch) return;
      s.powers.push(choicePower(e, choice));
    } else if (powerOpts(e).length) {
      const opts = powerOpts(e);
      const first = await askChoice(e.name, 'Escolha a primeira opção (' + num(e.values.custo) + ' UP cada)', 'As outras você marca depois, na lista de poderes.', opts.map((o) => [o.name, o.name + (o.cost ? ' · ' + o.cost : '')]));
      if (!first || sheetChar !== ch) return;
      ch.sheet.powers.push(Object.assign(slotSnap(e), { thumb: e.thumb || '', picks: [first] }));
    } else {
      ch.sheet.powers.push(Object.assign(slotSnap(e), { thumb: e.thumb || '' }));
    }
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

  /* Cadência por alvo: os disparos da ação se dividem entre os alvos marcados.
     A penalidade vem do total de disparos; o dano de cada alvo é multiplicado pelos disparos nele.
     st.per = { idDoAlvo: disparos }. Devolve os campos, o total e se faltou cadência. */
  function perTargetShots(st, cad, targets, prof, redraw, idp) {
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
      for (let k = 1; k <= room; k++) { const o = h('option', '', k + (k === 1 ? ' disparo' : ' disparos') + ' · dano ×' + k); o.value = String(k); sel.append(o); }
      sel.value = String(st.per[x.id]);
      sel.addEventListener('change', () => { st.per[x.id] = Math.round(num(sel.value)) || 1; redraw(); });
      const lab = h('label', 'per__name', x.name);
      lab.htmlFor = sel.id;
      return h('div', 'per__row', lab, sel);
    });
    const pen = shotPenalty(Math.min(total, cad), prof);
    const box = h('fieldset', 'per field--wide',
      h('legend', 'field__label', 'Cadência por alvo: ' + Math.min(total, cad) + ' de ' + cad + ' disparos' + (pen ? ' · –' + pen + ' no ataque' + (prof ? ' (perita)' : '') : '')),
      ...rows,
      over ? h('p', 'field__error', 'A cadência ' + cad + ' só alcança ' + plural(cad, 'alvo', 'alvos') + '. Desmarque alvos no Combate.') : null);
    return { box, total: Math.min(total, cad), over };
  }

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
      const targets = c.targets || [];
      let per = null;
      if (maxShots(weapon) > 1 && targets.length) {
        per = perTargetShots(st, maxShots(weapon), targets, isProficient(s, weapon), draw, idp);
        st.shots = per.total;
        fields.push(per.box);
      } else if (maxShots(weapon) > 1 && !c.aim) {
        st.per = null;
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
      if (per) t.label = ('Ataque: ' + (weapon ? weapon.name : 'Desarmado') + ' · ' + st.shots + (st.shots === 1 ? ' disparo' : ' disparos')).slice(0, 60);
      const dist = DISTANCES.find((d) => d.id === st.dist);
      if (dist && dist.mod) t.mods.push([dist.short, dist.mod]);
      if (st.mod) t.mods.push(['modificador', st.mod]);
      applyDice(t, st);
      if (c.peek) c.peek(t);
      const fixed = t.attr + t.skill + t.mods.reduce((x, y) => x + y[1], 0);
      const stowed = c.handsOnly ? all.filter((w) => !handOf(w)).length : 0;
      const info = [c.aim && maxShots(weapon) > 1 ? 'cadência ' + maxShots(weapon) + ': cada toque num alvo é um disparo' : '', weapon ? (isProficient(s, weapon) ? 'Proficiente' : 'Sem proficiência') : '', stowed ? plural(stowed, 'arma na mochila', 'armas na mochila') + ' (saque em Itens)' : '', weapon && !weapon.slot ? 'não está em mãos' : '', weapon && weapon.values.dano ? 'dano ' + weapon.values.dano : '', weapon && weapon.values.alcance ? 'alcance ' + weapon.values.alcance : ''].filter(Boolean).join(' · ');
      const go = h('button', 'btn btn--primary btn--sm', (c.btnLabel || 'Atacar') + ' · ' + diceText(st) + ' ' + (fixed ? signed(fixed) : '+0'));
      go.type = 'button';
      go.disabled = Boolean(per && per.over);
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
    wz.guide = b.guided ? b.entry : null;
    wz.gear.guideFilled = '';
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
    const startUp = previewSheet().upTotal;
    const guideMoney = wz.guide ? num((wz.guide.values || {}).dinheiro) : 0; // o roteiro da build diz quanto dinheiro
    if (g.budgetAuto) g.budget = guideMoney || startMoney(startUp);
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
    inp.addEventListener('change', () => { g.budget = Math.max(0, parseInt(inp.value.replace(/[^0-9]/g, ''), 10) || 0); g.budgetAuto = false; renderSetup(); });
    const lab = h('label', 'field__label', 'Orçamento (Cronos)');
    lab.htmlFor = 'gear-budget';
    const left = g.budget - cartTotal(g);
    body.append(h('div', 'gear__budget', h('div', 'field', lab, inp),
      h('p', 'setup__pool' + (left < 0 ? ' setup__pool--over' : ''), 'Sobra: ', h('strong', '', fmtCronos(left)), ' Cronos')),
      h('p', 'field__hint', 'Dinheiro inicial pela tabela: começando com ' + plural(startUp, 'UP', 'UP') + ', ' + fmtCronos(startMoney(startUp)) + ' Cronos (0 UP = ' + fmtCronos(startMoney(0)) + ', uma arma comum e uma armadura leve comum). Combine o valor com o mestre.' + (origin ? ' O kit de ' + origin.name + ' continua na aba "Kit da origem" para comparar.' : '')));
    if (wz.guide && gi.length) body.append(h('p', 'field__hint gear__guide', '📖 ' + wz.guide.name + ' já pôs no carrinho: ' + gi.join(', ') + '.' + (g.guideMissing && g.guideMissing.length ? ' Não achei no banco: ' + g.guideMissing.join(', ') + '.' : '')));
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
      const isName = f.key === 'nome';
      const ctrl = fieldControl(f, null, isName ? d.name : d.values[f.key], (v) => { if (isName) d.name = v; else d.values[f.key] = v; });
      const fid = 'wzc-' + kind + '-' + f.key;
      const grouped = f.kind === 'multi';
      const label = h(grouped ? 'span' : 'label', 'field__label', f.label);
      if (grouped) { label.id = fid; ctrl.setAttribute('aria-labelledby', fid); }
      else { ctrl.id = fid; label.htmlFor = fid; }
      grid.append(h('div', 'field' + (f.big || grouped ? ' field--wide' : ''), label, ctrl));
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
      const species = BUILTINS.filter((e) => e.kind === 'especime');
      if (wz.specimen && !species.some((e) => e.id === wz.specimen.id)) species.push(wz.specimen);
      const grid = h('div', 'pick-grid', ...species.filter((e) => wzMatch(e.name, e.values.descricao, e.values.tracos)).map((e) => pickCard(e.name, [specimenLine(e), e.values.descricao],
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
      gear: { mode: s.originItems ? 'nenhum' : 'kit', origin: null, lines: [], budget: START_BUDGET, budgetAuto: true, cart: [], shop: null, guideFilled: '' }
    };
    Object.keys(s.skills).forEach((k) => { if (s.skills[k] === 1 || s.skills[k] === 2) wz.skills[k] = s.skills[k]; });
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
    toast('Distribuição inicial concluída.' + (guided ? ' A build ' + s.guide.name + ' vai atualizar a ficha a cada UP; as folhas ficam em Progressão.' : ''));
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

  // Abas da campanha (Grupo, Combate, Lojas); a última aberta fica guardada por campanha
  const CAMP_TABS = ['grupo', 'combate', 'lojas'];
  const campTabKey = (id) => 'vortex.campTab.' + id;
  function setCampTab(name, focus) {
    if (CAMP_TABS.indexOf(name) < 0) name = 'combate'; // a antiga Mesa agora mora no Combate
    $$('.camp-tab').forEach((t) => {
      const on = t.dataset.ctab === name;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    CAMP_TABS.forEach((k) => { $('#cpanel-' + k).hidden = k !== name; });
    if (currentCamp) { try { localStorage.setItem(campTabKey(currentCamp.id), name); } catch (e) { /* sem armazenamento: só agora */ } }
  }
  $$('.camp-tab').forEach((tab) => {
    tab.addEventListener('click', () => setCampTab(tab.dataset.ctab));
    tab.addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
      const i = CAMP_TABS.indexOf(tab.dataset.ctab);
      setCampTab(CAMP_TABS[(i + (ev.key === 'ArrowRight' ? 1 : CAMP_TABS.length - 1)) % CAMP_TABS.length], true);
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
  speakerEl.addEventListener('change', () => { lastCharacterId = speakerEl.value; renderTestPick(); renderDock(); renderShops(); });

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
    $('#dock-meta').textContent = [mb.species, mb.origin, 'Defesa ' + def, 'Corpo ' + signed(s.attrs.corpo) + ' · Precisão ' + signed(s.attrs.precisao) + ' · Essência ' + signed(s.attrs.essencia)].filter(Boolean).join(' · ');
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
  function lifeState(layers) {
    const pv = layers.find((l) => l.key === 'pv' && l.max > 0);
    if (pv) return pv.cur <= -pv.max ? 'morto' : pv.cur <= 0 ? 'agonizando' : '';
    return layers.every((l) => l.cur <= 0) ? 'derrubado' : '';
  }

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
      return { id: 'foe:' + f.id, foe: f, name: f.name, kind: 'Inimigo', layers: ls, def: td.def, defBase: foeDef(f), defNote: td.note, defRolled: f.def !== undefined && f.def !== null, defMin: foeDefMin(f) };
    });
    members.forEach((mb) => {
      if (!mb.sheet || !mb.sheet.attrs) return;
      if (sceneOut().indexOf('chr:' + mb.characterId) >= 0) return; // o mestre deixou fora do combate
      try {
        const c = sheetOf(mb);
        const m = compute(c);
        const d = c.sheet.def && currentCamp ? c.sheet.def[currentCamp.id] : null;
        const td = tagDef('chr:' + mb.characterId, charDef(c, m), m.defMin);
        out.push({ id: 'chr:' + mb.characterId, member: mb, name: mb.name, kind: mb.type === 'criatura' ? 'Criatura' : 'Personagem', layers: charLayers(c), def: td.def, defBase: charDef(c, m), defNote: td.note, defRolled: d !== undefined && d !== null, defMin: m.defMin });
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
  const battle = { actor: '', menu: 'acoes', cmd: 'atacar', duel: { mine: '', target: '', theirs: '' }, man: { id: '', target: '' }, heal: { target: '', key: '' }, test: '', advance: '', pin: { id: '', key: '' }, view: 'main', slot: '', aim: null, name: '', xp: '' };
  let lastRolls = [];
  const sceneTags = () => (scene && scene.tags) || {};
  const sceneOut = () => (scene && Array.isArray(scene.out) ? scene.out : []);
  const sceneBase = () => deep(scene || { active: false, name: '', round: 0, turn: 0, order: [] });

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
      : (gm ? 'Monte os dois lados, role as defesas e comece: a iniciativa (2d6 + Precisão + Iniciativa) decide a ordem.' : 'O mestre está preparando a cena. Você já pode ver os lados e rolar a sua defesa.');
    renderBattleGm(gm, on, list);
    renderOrder(gm, on, list);
    const party = list.filter((x) => !x.foe);
    const foesIn = list.filter((x) => x.foe);
    const outs = members.filter((mb) => mb.sheet && mb.sheet.attrs && sceneOut().indexOf('chr:' + mb.characterId) >= 0);
    $('#arena-party').replaceChildren(...party.map((x) => fighterCard(x, gm, on)), ...(gm ? outs.map(outCard) : []),
      ...(party.length || outs.length ? [] : [h('li', 'arena__empty', 'Nenhum personagem vinculado. Os jogadores vinculam pela ficha.')]));
    $('#arena-foes').replaceChildren(...foesIn.map((x) => fighterCard(x, gm, on)),
      ...(foesIn.length ? [] : [h('li', 'arena__empty', gm ? 'Nenhum inimigo. Use "Adicionar inimigo".' : 'Nenhum inimigo à vista.')]));
    renderBanner(gm, on, party, foesIn);
    renderCmd(gm, on, list);
    if (!renderAimBar(list)) $('#battle-hint').textContent = 'Escolha uma ação nos comandos; quando ela pedir alvo, os alvos possíveis acendem aqui.';
    $('#arena').classList.toggle('arena--aim', Boolean(battle.aim));
    renderBattleLog();
    renderDock();
  }

  function fighterPic(x) {
    const type = x.foe ? 'criatura' : x.member.type;
    const pic = h('span', 'fighter__pic token token--' + type);
    const img = x.foe ? (x.foe.thumb || '') : (x.member.thumb || x.member.image || '');
    if (img) { const i = h('img'); i.src = img; i.alt = ''; pic.append(i); pic.classList.add('token--img'); }
    else pic.textContent = x.name.trim().charAt(0).toUpperCase();
    return pic;
  }
  function fighterCard(x, gm, on) {
    const state = lifeState(x.layers);
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
    if (!x.foe && gm && !on) acts.push(act('Fora do combate', () => saveOut(x.id, true)));
    return h('li', 'fighter' + (x.foe ? ' fighter--foe' : '') + (now ? ' is-now' : '') + (target ? ' is-target' : '') + (aimable ? ' is-aimable' : aim ? ' is-dim' : '') + (state ? ' is-down' : ''),
      sel, h('div', 'fighter__bars', ...bars),
      state || chips.length ? h('div', 'fighter__tags', state ? h('span', 'ftag ftag--down', state) : null, ...chips) : null,
      acts.length ? h('div', 'fighter__acts', ...acts) : null);
  }
  function outCard(mb) {
    const b = h('button', 'fighter__act', 'Entrar no combate');
    b.type = 'button';
    b.addEventListener('click', () => saveOut('chr:' + mb.characterId, false));
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
      const list = (sceneTags()[x.id] || []).filter((t) => nameKey(t.n) !== nameKey(n));
      list.push({ n, r: Math.round(num(rounds.value)) });
      closeDialog(tagDlg);
      await saveTags(x.id, list.slice(-8));
      toast(x.name + ': ' + n + '.');
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
        gmBtn('Adicionar inimigo', 'btn--ghost', addFoeFlow),
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
      gmBtn('Adicionar inimigo', 'btn--ghost', addFoeFlow),
      gmBtn('Rolar defesas', 'btn--ghost', rollAllDefenses),
      gmBtn('Descanso curto', 'btn--ghost', () => restMembers(combatants().filter((x) => !x.foe).map((x) => x.member), false)),
      gmBtn('Descanso longo', 'btn--ghost', () => restMembers(combatants().filter((x) => !x.foe).map((x) => x.member), true)),
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
      const li = h('li', 'ctb__item' + (i === scene.turn ? ' is-now' : '') + (x && x.foe ? ' ctb__item--foe' : '') + (down ? ' is-down' : ''),
        h('span', 'ctb__init', String(o.init)), h('span', 'ctb__name', o.name));
      li.title = o.name + ' · iniciativa ' + o.init + (down ? ' · ' + down : '');
      if (i === scene.turn) li.setAttribute('aria-current', 'step');
      if (gm) {
        const out = h('button', 'ctb__x', '×');
        out.type = 'button';
        out.setAttribute('aria-label', 'Tirar da ordem: ' + o.name);
        out.addEventListener('click', () => {
          const next = deep(scene);
          next.order.splice(i, 1);
          if (i < next.turn) next.turn -= 1;
          if (next.turn >= next.order.length) next.turn = 0;
          if (!next.order.length) next.active = false;
          saveScene(next);
        });
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
  function renderBanner(gm, on, party, foesIn) {
    const box = $('#battle-banner');
    const win = on && foesIn.length > 0 && foesIn.every((x) => lifeState(x.layers));
    const lose = on && party.length > 0 && party.every((x) => lifeState(x.layers));
    box.hidden = !win && !lose;
    if (box.hidden) return;
    box.className = 'battle__banner battle__banner--' + (win ? 'win' : 'lose');
    const kids = [h('strong', 'battle__banner-title', win ? 'Vitória!' : 'Derrota…'), h('span', '', win ? 'Todos os inimigos caíram.' : 'O grupo inteiro caiu.')];
    if (gm) {
      const xp = h('input', 'input');
      xp.type = 'number';
      xp.min = '1';
      xp.step = '1';
      xp.inputMode = 'numeric';
      xp.placeholder = 'XP';
      xp.value = battle.xp;
      xp.setAttribute('aria-label', 'XP para o grupo');
      xp.addEventListener('input', () => { battle.xp = xp.value; });
      const give = gmBtn('Dar XP ao grupo', 'btn--primary', async () => {
        const amount = Math.round(num(xp.value));
        if (amount < 1) { xp.focus(); return; }
        await giveXp(party.map((x) => x.member), amount);
        battle.xp = '';
      });
      kids.push(h('div', 'battle__banner-acts', win ? xp : null, win ? give : null, gmBtn('Encerrar a cena', 'btn--ghost', endScene)));
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
  async function addTag(id, n, r) {
    const list = tagsOf(id).filter((t) => nameKey(t.n) !== nameKey(n));
    list.push({ n, r: r || 0 });
    await saveTags(id, list.slice(-8));
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
      { id: 'descanso', label: 'Descanso', go: 'cfg', when: () => !sceneOn() },
      { id: 'passar', label: 'Encerrar turno', go: 'now', when: (x, gm) => sceneOn() && (econLive(x) || gm) }
    ]
  };
  const ACTION_TEXT = {
    atacar: 'Escolha a arma (só o que está nas mãos, ou desarmado) e depois toque nos alvos. Com cadência, cada toque é um disparo.',
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
    descanso: 'Curto: metade de PV, PE e PA, e cada curto seguido recupera metade do anterior. Longo: tudo.',
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
      try { await a.pick(x); } catch (err) { toast(errorMessage(err)); }
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
      ? 'Toque nos alvos destacados: cada toque é um disparo (' + total + ' de ' + a.max + ').' + (total ? ' ' + list.filter((x) => a.shots[x.id]).map((x) => x.name + ' ×' + a.shots[x.id]).join(', ') + '.' : '')
      : 'Toque num dos alvos destacados.')];
    if (a.max > 1) {
      const clear = h('button', 'btn btn--ghost btn--sm', 'Limpar');
      clear.type = 'button';
      clear.disabled = !total;
      clear.addEventListener('click', () => { a.shots = {}; renderBattle(); });
      const ok = h('button', 'btn btn--primary btn--sm', 'Disparar ' + plural(total, 'vez', 'vezes'));
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
  const alliesOf = (list, actor) => list.filter((x) => Boolean(x.foe) === Boolean(actor.foe));

  function renderCmd(gm, on, list) {
    const box = $('#battle-cmd');
    const mine = list.filter((x) => (x.foe ? gm : x.member.mine));
    const cur = sceneCurrent();
    const free = !on || gm; // fora da cena (ou para o mestre) dá para escolher quem age
    const turnKey = on ? scene.round + ':' + scene.turn : 'off';
    // quem o mestre escolheu vale até a vez mudar; senão age quem está na vez
    let actor = free && battle.pin.key === turnKey ? mine.find((x) => x.id === battle.pin.id) : null;
    if (!actor && on && cur) actor = mine.find((x) => x.id === cur.id) || null;
    if (!actor && free) actor = mine.find((x) => x.id === battle.actor) || mine[0] || null;
    const title = h('h3', 'ff-window__title', 'Comandos');
    if (!actor) {
      if (battle.aim) endAim();
      box.replaceChildren(title, h('p', 'cmd__wait', !mine.length
        ? (gm ? 'Adicione inimigos para agir por eles.' : 'Vincule um personagem seu a esta campanha (pela ficha) para agir.')
        : cur ? 'Aguardando: vez de ' + cur.name + '.' : 'Aguardando o mestre começar.'));
      return;
    }
    if (battle.actor !== actor.id) { battle.view = 'main'; if (battle.aim) endAim(); }
    battle.actor = actor.id;
    const isTurn = econLive(actor);
    let who;
    if (free && mine.length > 1 && !battle.aim) {
      const sel = h('select', 'input cmd__who');
      sel.id = 'cmd-who';
      sel.setAttribute('aria-label', 'Agir como');
      mine.forEach((x) => { const o = h('option', '', x.name + (on && cur && cur.id === x.id ? ' (na vez)' : '')); o.value = x.id; sel.append(o); });
      sel.value = actor.id;
      sel.addEventListener('change', () => { battle.actor = sel.value; battle.pin = { id: sel.value, key: turnKey }; battle.view = 'main'; renderBattle(); });
      who = sel;
    } else who = h('strong', 'cmd__name', actor.name);
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
    else body = mainView(actor, gm);
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
        if (a.go === 'cfg') { battle.cmd = a.id; battle.view = 'cfg'; renderBattle(); return; }
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
    const about = h('div', 'cmd__about', h('strong', '', ({ atacar: 'Atacar', manobra: 'Manobra', avancar: 'Avançar', curar: 'Curar', teste: 'Teste da ficha', disputa: 'Disputa', descanso: 'Descanso', poderes: 'Poderes' })[id] || ''), h('span', '', ACTION_TEXT[id] || ''));
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
    else if (id === 'descanso') {
      const party = list.filter((x) => !x.foe);
      const whom = gm ? party.map((x) => x.member) : actor.foe ? [] : [actor.member];
      body = !whom.length ? h('p', 'cmd__note', 'Inimigos não descansam por aqui.') : h('div', 'cmd__stack',
        h('p', 'cmd__note', gm ? 'Descansa o grupo todo (' + party.map((x) => x.name).join(', ') + '). Nas lojas com NPCs comprando, o descanso também pode vender o que está à venda.' : 'Descansa ' + actor.name + '.'),
        h('div', 'cmd__row', gmBtn('Descanso curto', 'btn--ghost', () => restMembers(whom, false)), gmBtn('Descanso longo', 'btn--primary', () => restMembers(whom, true))));
    } else body = h('p', 'cmd__note', '');
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
          pick: (x) => go({ foe: actor.foe }, st, { [x.id]: 1 }, peek), confirm: (shots) => go({ foe: actor.foe }, st, shots, peek) });
      } }));
    }
    const mb = actor.member;
    const c = sheetOf(mb);
    const st = memberAtk[mb.characterId] = memberAtk[mb.characterId] || { uid: null, mode: '', shots: 1, mod: 0, dice: 'n2', dist: '' };
    const base = Object.assign({}, c, { handsOnly: true, meleeOnly: adv });
    return h('div', 'cmd__stack', note, attackBuilder(Object.assign({}, base, { aim: true, btnLabel: 'Escolher alvo' }), st, () => {
      const weapon = weaponsOf(c.sheet).find((w) => w.uid === st.uid) || null;
      const cad = maxShots(weapon);
      const peek = () => {
        let t = null;
        const targets = combatants().filter((x) => combat.targets.has(x.id)).map((x) => ({ id: x.id, name: x.name }));
        attackBuilder(Object.assign({}, base, { targets, peek: (x) => { t = x; } }), st, () => {}, 'pk-');
        return t;
      };
      startAim({ label: 'Ataque: ' + (weapon ? weapon.name : 'desarmado'), valid: valid.map((x) => x.id), max: cad,
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
    const allies = list.filter((x) => !x.foe);
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

  /* Descanso (capítulo Recursos): curto recupera metade de PV, PE e PA (com Humanidade, também a vida convertida),
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
      const before = getCur(s, k, mx);
      setCur(s, k, before + Math.max(1, Math.ceil(mx / 2 / Math.pow(2, n))), mx);
      const d = getCur(s, k, mx) - before;
      if (d) got.push('+' + d + ' ' + (k === 'pv' ? 'PV' : k === 'pe' ? 'PE' : k === 'pa' ? 'PA' : k === 'escudo' ? 'Escudo' : 'Blindagem'));
    });
    s.rests = n + 1;
    return got.length ? got.join(', ') : 'nada a recuperar';
  }
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

  function renderBattleLog() {
    const list = lastRolls.slice(-8);
    $('#battle-log').replaceChildren(...(list.length ? list.map((r) => h('li', 'blog__item' + (r.flag ? ' blog__item--' + (r.flag === 'falha' ? 'fail' : r.flag) : ''),
      h('span', 'blog__who', r.characterName), h('span', 'blog__what', r.label || r.expr), h('strong', 'blog__total', rolledShow(r)),
      h('span', 'blog__detail', String(r.detail || '').slice(0, 220)))) : [h('li', 'blog__empty', 'Nada ainda. Ataques, defesas e disputas aparecem aqui.')]));
    const box = $('#battle-log');
    box.scrollTop = box.scrollHeight;
  }

  async function addFoeFlow() {
    const e = await openPicker({ title: 'Adicionar inimigo da lista aberta', kinds: ['npc'], chips: ['NPC / Inimigo'] });
    if (!e) return;
    const same = foes.filter((f) => f.npcId === e.id).length;
    try {
      await db.addFoe(currentCamp.id, { npcId: e.id, name: (e.name + (same ? ' ' + (same + 1) : '')).slice(0, 60), values: deep(e.values || {}), thumb: e.thumb || '', cur: {}, def: null });
      toast(e.name + ' entrou na arena.');
    } catch (err) { toast(errorMessage(err)); }
  }
  async function rollAllDefenses() {
    const list = combatants().filter((x) => (currentCamp.gm ? true : x.member && x.member.mine));
    if (!list.length) { toast('Ninguém na arena.'); return; }
    for (const x of list) { try { await rollDefense(x); } catch (err) { toast(errorMessage(err)); } }
  }

  // Defesa da cena: 2d6 + Corpo + Resistência; abaixo da mínima, vale a mínima
  async function rollDefense(x) {
    let attr, res;
    if (x.foe) { const v = foeVals(x.foe); attr = num(v.corpo); res = num(v.resistencia); }
    else { const s = normSheet(x.member.sheet); attr = num(s.attrs.corpo); res = num(s.skills.resistencia); }
    const r = rollTest({ label: 'Defesa da cena', attrName: 'Corpo', attr, skillName: 'Resistência', skill: res });
    const val = r.flag === 'falha' ? x.defMin : Math.max(r.total, x.defMin);
    r.detail += ' → defesa ' + val + (val > r.total || r.flag === 'falha' ? ' (vale a mínima ' + x.defMin + ')' : '');
    if (x.foe) await db.updateFoe(currentCamp.id, x.foe.id, { def: val });
    else await patchMemberSheet(x.member, (s) => { s.def = Object.assign({}, s.def); s.def[currentCamp.id] = val; });
    await postCombatRoll(x.foe ? { foe: x.foe } : { member: x.member }, r);
    renderCombat();
    return val;
  }

  async function postCombatRoll(who, r) {
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
      if (weapon && weapon.typeId === 'marreta') effective = 'blindagem';
      if (weapon && weapon.typeId === 'machado') effective = 'escudo';
      if (!weapon || weapon.kind !== 'arma-fogo') shots = 1;
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
    else { const s = normSheet(x.member.sheet); attr = num(s.attrs.precisao); skill = num(s.skills.iniciativa); }
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

  async function startScene() {
    const list = combatants();
    if (!list.length) { toast('Ninguém na arena. Adicione inimigos ou vincule personagens.'); return; }
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
    await saveScene({ active: false, name: '', round: 0, turn: 0, order: [], out: sceneOut() });
    await sceneLog('Fim da cena', 'Cena encerrada após ' + plural(rounds, 'rodada', 'rodadas') + '.', rounds);
  }

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
  const stockText = (it) => (it.qty === null || it.qty === undefined ? '∞' : '×' + it.qty);
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
    const price = Math.max(0, Math.round(num(it.price)));
    if (moneyOf(me) < price) { toast(me.name + ' tem ' + fmtCronos(moneyOf(me)) + ' Cronos nesta campanha; ' + it.entry.name + ' custa ' + fmtCronos(price) + '.'); return; }
    const fresh = shops.find((x) => x.id === sh.id);
    const cur = fresh && fresh.items.find((x) => x.uid === it.uid);
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
    const pick = await askChoice('Abastecer ' + sh.name, 'Item da mochila de ' + me.name, 'Vai para o armazém da loja. Depois marque "À venda" e o preço por unidade.', inv.map((i) => [i.uid, i.name + (num(i.qty) > 1 ? ' ×' + i.qty : '')]));
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
    const e = await openPicker({ title: 'Item para ' + sh.name, kinds: INVENTORY_KINDS, chips: [
      { label: 'Armas', kinds: ['arma-melee', 'arma-fogo'] }, { label: 'Armaduras', kinds: ['armadura'] }, { label: 'Vestíveis', kinds: ['vestivel'] },
      { label: 'Implantes', kinds: ['nucleo', 'protese-modulo'] }, { label: 'Itens gerais', kinds: ['item-geral'] }], filter: (x) => INVENTORY_KINDS.indexOf(x.kind) >= 0 });
    if (!e) return;
    const fresh = shops.find((x) => x.id === sh.id) || sh;
    await saveShop(fresh, { items: fresh.items.concat([{ uid: uid(), entry: slotSnap(e), qty: sh.kind === 'companhia' ? null : 1, price: priceOf(e), sale: true }]) });
  }

  // Descanso passado pelo mestre: NPCs podem comprar o que está à venda nas lojas com fluxo
  async function shopRest(long) {
    if (shopUi.busy) return;
    shopUi.busy = true;
    const sold = [];
    try {
      for (const sh of shops.slice()) {
        if (!sh.npcBuyers || !TRAFFIC_P[sh.traffic]) continue;
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
    const price = Math.max(0, Math.round(num(it.price)));
    const main = h('span', 'row__main', h('span', 'row__title', e.name, ' ', h('span', 'tag shop__stock', stockText(it)), manage ? h('span', 'tag' + (it.sale ? ' tag--on' : ''), it.sale ? 'À venda' : 'No armazém') : null),
      h('span', 'row__meta', [kindTitle(e.kind), e.typeTitle, v.raridade, v.fabricante].filter(Boolean).join(' · ')));
    const row = h('li', 'row shop__item' + (it.sale ? '' : ' shop__item--off'), h('span', 'row__open row__open--static', entryIcon(e), main), h('strong', 'gear__price', fmtCronos(price)));
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
    priceIn.value = String(price);
    priceIn.setAttribute('aria-label', 'Preço por unidade de ' + e.name);
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
    const sale = h('button', 'btn btn--ghost btn--sm', it.sale ? 'Pôr no armazém' : 'Pôr à venda');
    sale.type = 'button';
    sale.addEventListener('click', () => saveShop(sh, { items: sh.items.map((x) => (x.uid === it.uid ? Object.assign({}, x, { sale: !x.sale }) : x)) }));
    ctl.append(sale);
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
    const forSale = sh.items.filter((i) => i.sale);
    const det = h('details', 'shop shop--' + sh.kind);
    det.open = shopUi.open.has(sh.id);
    det.addEventListener('toggle', () => { if (det.open) shopUi.open.add(sh.id); else shopUi.open.delete(sh.id); });
    const icon = { companhia: '🏭', npc: '🧑‍🔧', jogador: '🎒', mestre: '🏪' }[sh.kind] || '🏪';
    det.append(h('summary', 'shop__head',
      h('span', 'shop__icon', icon),
      h('span', 'shop__main', h('strong', 'shop__name', sh.name),
        h('span', 'shop__meta', [shopKindText(sh), plural(forSale.length, 'item à venda', 'itens à venda'), (TRAFFIC.find((t) => t[0] === sh.traffic) || TRAFFIC[0])[1], sh.npcBuyers ? 'NPCs compram' : ''].filter(Boolean).join(' · ')))));
    const body = h('div', 'shop__body');
    const shown = manage ? sh.items : forSale;
    if (shown.length) body.append(h('ul', 'rows shop__items', ...shown.map((it) => shopItemRow(sh, it, manage))));
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
    if (gm) {
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
    $('#shop-wallet').textContent = me ? me.name + ' tem ' + fmtCronos(moneyOf(me)) + ' Cronos nesta campanha.' : gm ? 'Você é o mestre: crie lojas, ponha itens e preços, e passe os descansos para os NPCs comprarem.' : '';
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
    const sync = () => { $('#shop-company-field').hidden = kind.value !== 'companhia'; $('#shop-npc-field').hidden = kind.value !== 'npc'; };
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
          traffic: tr.value, npcBuyers: $('#shop-buyers').checked, items, log: [] });
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
    $('#shop-rest-short').addEventListener('click', () => shopRest(false));
    $('#shop-rest-long').addEventListener('click', () => shopRest(true));
  })();

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
    let tabNow = 'combate';
    try { tabNow = localStorage.getItem(campTabKey(camp.id)) || 'combate'; } catch (e) { /* sem armazenamento */ }
    setCampTab(tabNow);
    document.title = camp.name + ' | Vortex';

    let noAccess = false;
    try { members = await db.listMembers(id); }
    catch (err) { console.warn(err); members = []; noAccess = true; }
    members.forEach((m) => { if (isMyChar(m.characterId)) m.mine = true; }); // personagens do perfil contam como seus

    $('#member-list').replaceChildren(...members.map(memberRow));
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
    const stopFoes = db.subscribeFoes(id, (list) => { foes = list; renderCombat(); }, (err) => console.warn(err));
    const stopScene = db.subscribeScene(id, (sc) => { if (currentCamp && currentCamp.id === id) { scene = sc; renderScene(); renderDock(); } }, (err) => console.warn(err));
    const stopShops = db.subscribeShops(id, (list) => { if (currentCamp && currentCamp.id === id) { shops = list; renderShops(); } }, (err) => console.warn(err));
    const stopAll = (more) => () => { [stopFoes, stopScene, stopShops].concat(more || []).forEach((fn) => { if (typeof fn === 'function') fn(); }); };
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
    window.addEventListener('hashchange', render);
    render();
  }

  start();
})();