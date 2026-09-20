/* =====================================================================
   VORTEX | app.js
   Índice: 1 Firebase (config) · 2 Utilidades · 3 Dados (rolagem)
           4 Banco local · 5 Banco Firebase · 6 Acesso rápido e interface
           7 Telas · 8 Início do app
   ===================================================================== */

/* ---------------------------------------------------------------------
   1. FIREBASE: COLE AQUI OS DADOS DO SEU PROJETO
   Console do Firebase > Configurações do projeto > Seus apps > Web >
   copie os valores de "firebaseConfig" para os campos abaixo.
   Deixe TUDO VAZIO para usar o modo local (dados só neste aparelho).
   Ao preencher, a etiqueta no topo do site passa a mostrar
   "Firebase conectado". As regras de segurança ficam em firestore.rules.
   --------------------------------------------------------------------- */
const FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
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

  function errorMessage(err) {
    if (err instanceof UserError) return err.message;
    console.error(err);
    const code = err && err.code;
    if (code === 'permission-denied') return 'O Firebase recusou a operação. Confira o login anônimo e as regras (veja o guia).';
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
     ===================================================================== */
  const LocalDb = (function () {
    const KEY = 'vortex.local.v1';
    const ROLLS = 'vortex.rolls.v1.';
    const ME = 'local';
    const clone = (o) => JSON.parse(JSON.stringify(o));

    function seed() {
      const now = Date.now();
      return {
        characters: {},
        campaigns: {
          VX7K2Q: {
            id: 'VX7K2Q', name: 'A Queda de Vortex', nameKey: nameKey('A Queda de Vortex'), ownerUid: 'demo',
            members: {
              'demo-1': { characterId: 'demo-1', ownerUid: 'demo', name: 'Ilyra Voss', type: 'personagem', thumb: '', joinedAt: now },
              'demo-2': { characterId: 'demo-2', ownerUid: 'demo', name: 'Bruno Cascalho', type: 'personagem', thumb: '', joinedAt: now + 1 },
              'demo-3': { characterId: 'demo-3', ownerUid: 'demo', name: 'Sombra do Poço', type: 'criatura', thumb: '', joinedAt: now + 2 }
            }
          }
        }
      };
    }

    function read() {
      try {
        const d = JSON.parse(localStorage.getItem(KEY));
        if (d && d.characters && d.campaigns) return d;
      } catch (e) { /* começa do zero */ }
      return seed();
    }

    function write(d) {
      try { localStorage.setItem(KEY, JSON.stringify(d)); }
      catch (e) { throw new UserError('O armazenamento do navegador está cheio. Apague algo ou remova imagens.'); }
    }

    const summarize = (c) => ({ id: c.id, name: c.name, isOwner: c.ownerUid === ME });
    const toChar = (c) => ({
      id: c.id, name: c.name, type: c.type, image: c.image, thumb: c.thumb,
      species: c.species, age: c.age, origin: c.origin, campaignIds: c.campaignIds.slice()
    });

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

    function syncMembers(d, character) {
      Object.values(d.campaigns).forEach((camp) => {
        const m = camp.members[character.id];
        if (m) { m.name = character.name; m.type = character.type; m.thumb = character.thumb; }
      });
    }

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

      async createCharacter({ name, type }) {
        const d = read();
        const key = nameKey(name);
        if (Object.values(d.characters).some((c) => c.nameKey === key)) throw new UserError(DUP_CHARACTER);
        const c = { id: uid(), ownerUid: ME, name, nameKey: key, type, image: '', thumb: '', species: '', age: '', origin: '', campaignIds: [] };
        d.characters[c.id] = c;
        write(d);
        return toChar(c);
      },

      async saveCharacter(id, patch) {
        const d = read();
        const c = d.characters[id];
        if (!c) throw new UserError('Personagem não encontrado.');
        ['species', 'age', 'origin', 'image', 'thumb'].forEach((k) => { if (k in patch) c[k] = String(patch[k]); });
        if ('thumb' in patch) syncMembers(d, c);
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
        syncMembers(d, c);
        write(d);
      },

      async deleteCharacter(id) {
        const d = read();
        const c = d.characters[id];
        if (!c) return;
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
        camp.members[characterId] = { characterId, ownerUid: ME, name: ch.name, type: ch.type, thumb: ch.thumb, joinedAt: Date.now() };
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

      async listMembers(campaignId) {
        const c = read().campaigns[campaignId];
        if (!c) return [];
        return Object.values(c.members)
          .sort((a, b) => a.joinedAt - b.joinedAt)
          .map((m) => ({ characterId: m.characterId, name: m.name, type: m.type, thumb: m.thumb, mine: m.ownerUid === ME }));
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
        species: d.species || '', age: d.age || '', origin: d.origin || '', campaignIds: d.campaignIds || []
      };
    };
    const toCamp = (snap) => ({ id: snap.id, name: snap.data().name, isOwner: snap.data().ownerUid === me });

    // Atualiza a cópia (nome, tipo, miniatura) do personagem em cada campanha
    async function syncMembers(batch, campaignIds, characterId, patch) {
      await Promise.all(campaignIds.map(async (cid) => {
        try {
          const ref = camps().doc(cid).collection('members').doc(characterId);
          const s = await ref.get();
          if (s.exists) batch.update(ref, patch);
        } catch (e) { /* campanha apagada: ignora */ }
      }));
    }

    const db = {
      mode: 'firebase',

      async nameTaken(kind, name, exceptId) {
        const s = await nameDoc(kind, name).get();
        return s.exists && s.data().refId !== exceptId;
      },

      async getCharacter(id) {
        try {
          const s = await chars().doc(id).get();
          return s.exists ? toChar(s) : null;
        } catch (e) {
          if (e && e.code === 'permission-denied') return null; // personagem de outra pessoa
          throw e;
        }
      },

      async createCharacter({ name, type }) {
        const nRef = nameDoc('character', name);
        if ((await nRef.get()).exists) throw new UserError(DUP_CHARACTER);
        const ref = chars().doc();
        const batch = fs.batch();
        batch.set(nRef, { kind: 'character', ownerUid: me, refId: ref.id, createdAt: FV.serverTimestamp() });
        batch.set(ref, {
          ownerUid: me, name, nameKey: nameKey(name), type, image: '', thumb: '',
          species: '', age: '', origin: '', campaignIds: [],
          createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp()
        });
        try { await batch.commit(); }
        catch (e) {
          if (await db.nameTaken('character', name)) throw new UserError(DUP_CHARACTER);
          throw e;
        }
        return { id: ref.id, name, type, image: '', thumb: '', species: '', age: '', origin: '', campaignIds: [] };
      },

      async saveCharacter(id, patch) {
        const upd = { updatedAt: FV.serverTimestamp() };
        ['species', 'age', 'origin', 'image', 'thumb'].forEach((k) => { if (k in patch) upd[k] = String(patch[k]); });
        const batch = fs.batch();
        batch.update(chars().doc(id), upd);
        if ('thumb' in patch) {
          const s = await chars().doc(id).get();
          await syncMembers(batch, s.data().campaignIds || [], id, { thumb: upd.thumb });
        }
        await batch.commit();
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
        batch.update(ref, { name, nameKey: nameKey(name), updatedAt: FV.serverTimestamp() });
        await syncMembers(batch, old.campaignIds || [], id, { name });
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
        const ch = chSnap.data();
        if ((ch.campaignIds || []).indexOf(id) >= 0) throw new UserError('Este personagem já está nessa campanha.');
        const batch = fs.batch();
        batch.update(cRef, { memberUids: FV.arrayUnion(me) });
        batch.set(cRef.collection('members').doc(characterId), {
          characterId, ownerUid: me, name: ch.name, type: ch.type, thumb: ch.thumb || '', joinedAt: FV.serverTimestamp()
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
          batch.delete(cRef.collection('members').doc(characterId));
          const snap = await cRef.collection('members').get();
          const others = snap.docs.filter((d) => d.id !== characterId && d.data().ownerUid === me).length;
          if (others === 0) batch.update(cRef, { memberUids: FV.arrayRemove(me) });
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

      async listMembers(campaignId) {
        const snap = await camps().doc(campaignId).collection('members').get();
        return snap.docs
          .map((d) => {
            const m = d.data({ serverTimestamps: 'estimate' });
            const at = m.joinedAt && m.joinedAt.toMillis ? m.joinedAt.toMillis() : 0;
            return { characterId: d.id, name: m.name, type: m.type, thumb: m.thumb || '', mine: m.ownerUid === me, at };
          })
          .sort((x, y) => x.at - y.at);
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
    if (location.protocol === 'file:') return 'Abra o site por um endereço http (extensão Live Server) ou publique-o; com duplo clique o Firebase pode não conectar.';
    return (err && err.message) || 'Não foi possível conectar.';
  }

  /* =====================================================================
     6. ACESSO RÁPIDO (localStorage) E PEÇAS DE INTERFACE
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
  function quickUpsert(c, toFront) {
    const entry = { id: c.id, name: c.name, type: c.type, thumb: c.thumb || '', species: c.species || '' };
    const list = quickLoad();
    const i = list.findIndex((x) => x.id === c.id);
    if (i >= 0) list.splice(i, 1);
    if (toFront || i < 0) list.unshift(entry); else list.splice(i, 0, entry);
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
        if (c) out[i] = { id: c.id, name: c.name, type: c.type, thumb: c.thumb || '', species: c.species || '' };
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

  /* Linhas de lista */
  function characterRow(c) {
    const open = h('button', 'row__open',
      avatar(c.name, c.type, c.thumb),
      h('span', 'row__main', h('span', 'row__title', c.name), h('span', 'row__meta', c.species)),
      badge(c.type));
    open.type = 'button';
    open.addEventListener('click', () => go('character', c.id));
    const del = h('button', 'btn btn--danger btn--sm', 'Excluir');
    del.type = 'button';
    del.setAttribute('aria-label', 'Excluir ' + c.name);
    del.addEventListener('click', async () => { if (await deleteCharacterFlow(c)) showHome(); });
    return h('li', 'row', open, del);
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

  function memberRow(m) {
    return h('li', 'row', h('div', 'row__open row__open--static',
      avatar(m.name, m.type, m.thumb),
      h('span', 'row__main', h('span', 'row__title', m.name), h('span', 'row__meta', m.mine ? 'Seu personagem' : '')),
      badge(m.type)));
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
      text: 'A ficha e o vínculo com as campanhas serão apagados. Não dá para desfazer.',
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
     7. TELAS: navegação por endereço (#/home, #/character/ID, #/campaign/ID)
     ===================================================================== */
  const views = {};
  let onLeave = null; // cada tela pode registrar uma limpeza (ex.: parar de ouvir os dados)
  let lastCharacterId = null;

  function go(name, param) {
    const next = '#/' + name + (param ? '/' + encodeURIComponent(param) : '');
    if (location.hash === next) render(); else location.hash = next;
  }

  async function render() {
    if (onLeave) { onLeave(); onLeave = null; }
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    const name = parts[0] || 'home';
    const param = parts[1] ? decodeURIComponent(parts.slice(1).join('/')) : null;
    if (!(name in views)) return go('home');

    const target = $('[data-screen="' + name + '"]');
    $$('[data-screen]').forEach((s) => { s.hidden = s !== target; });
    target.classList.remove('is-entering');
    void target.offsetWidth; // reinicia a animação
    target.classList.add('is-entering');
    document.title = target.dataset.title + ' | Vortex';

    target.setAttribute('aria-busy', 'true'); // esconde "lista vazia" enquanto carrega
    try { await views[name](param); }
    catch (err) { toast(errorMessage(err)); }
    target.removeAttribute('aria-busy');

    const heading = $('h1', target);
    if (heading) heading.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  /* ---------- Início ---------- */
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
    const kind = formCreate.elements.kind.value;
    const name = cleanName(inCreate.value);
    if (validateName(name)) return;
    try {
      const taken = await db.nameTaken(kind === 'campanha' ? 'campaign' : 'character', name);
      if (seq === createSeq && taken) setError(errCreate, inCreate, kind === 'campanha' ? DUP_CAMPAIGN : DUP_CHARACTER);
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
      if (kind === 'campanha') {
        const camp = await db.createCampaign(name);
        inCreate.value = '';
        toast('Campanha criada. Vincule um personagem pela ficha dele para rolar dados.');
        go('campaign', camp.id);
      } else {
        const c = await db.createCharacter({ name, type: kind });
        quickUpsert(c, true);
        inCreate.value = '';
        go('character', c.id);
      }
    } catch (err) {
      setError(errCreate, inCreate, errorMessage(err));
      inCreate.focus();
    } finally { btnCreate.disabled = false; }
  });

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

  views.home = async function showHome() {
    applyKind();
    const [quick, camps] = await Promise.all([
      refreshQuick(),
      db.listMyCampaigns().catch((e) => { toast(errorMessage(e)); return []; })
    ]);
    $('#quick-list').replaceChildren(...quick.map(characterRow));
    $('#quick-empty').hidden = quick.length > 0;
    $('#camp-list').replaceChildren(...camps.map((c) => campaignRow(c, c.isOwner
      ? { label: 'Excluir', onClick: async () => { if (await deleteCampaignFlow(c)) showHome(); } }
      : null)));
    $('#camp-empty').hidden = camps.length > 0;
  };
  const showHome = () => views.home();

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
    const list = await db.listCharacterCampaigns(sheetChar.id);
    $('#sheet-camp-list').replaceChildren(...list.map((c) => campaignRow(c, {
      label: 'Sair',
      onClick: async () => {
        const ok = await askConfirm({
          title: 'Sair de ' + c.name + '?',
          text: sheetChar.name + ' deixa de participar. Você pode entrar de novo com o ID de entrada.',
          ok: 'Sair'
        });
        if (!ok) return;
        try { await db.leaveCampaign(c.id, sheetChar.id); await renderSheetCampaigns(); }
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
    const name = cleanName(fName.value);
    const bad = validateName(name);
    if (bad) { setError(errName, fName, bad); return; }
    if (name === sheetChar.name) { fName.value = name; setError(errName, fName, ''); return; }
    try {
      await db.renameCharacter(sheetChar.id, name);
      sheetChar.name = name;
      fName.value = name;
      quickUpsert(sheetChar);
      renderSheetHeader();
      setError(errName, fName, '');
      setStatus('Nome salvo');
    } catch (err) { setError(errName, fName, errorMessage(err)); }
  });

  // Espécie, idade e origem: salvam sozinhas
  const saveFields = debounce(async () => {
    try {
      await db.saveCharacter(sheetChar.id, { species: sheetChar.species, age: sheetChar.age, origin: sheetChar.origin });
      quickUpsert(sheetChar);
      setStatus('Alterações salvas');
    } catch (err) { setStatus(errorMessage(err)); }
  }, 600);
  [['species', fSpecies], ['age', fAge], ['origin', fOrigin]].forEach((pair) => {
    pair[1].addEventListener('input', () => { sheetChar[pair[0]] = pair[1].value; setStatus('Salvando...'); saveFields(); });
  });

  // Imagem
  $('#portrait-btn').addEventListener('click', () => $('#portrait-file').click());
  $('#portrait-file').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast('Imagem grande demais. Use uma de até 20 MB.'); return; }
    try {
      const imgs = await fileToImages(file);
      await db.saveCharacter(sheetChar.id, imgs);
      Object.assign(sheetChar, imgs);
      quickUpsert(sheetChar);
      renderPortrait();
      setStatus('Imagem salva');
    } catch (err) { toast(errorMessage(err)); }
  });
  $('#portrait-remove').addEventListener('click', async () => {
    try {
      await db.saveCharacter(sheetChar.id, { image: '', thumb: '' });
      sheetChar.image = sheetChar.thumb = '';
      quickUpsert(sheetChar);
      renderPortrait();
      setStatus('Imagem removida');
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

  $('#delete-character').addEventListener('click', async () => { if (await deleteCharacterFlow(sheetChar)) go('home'); });

  views.character = async function showSheet(id) {
    const c = await db.getCharacter(id);
    if (!c) { toast('Não encontramos esse personagem neste aparelho.'); go('home'); return; }
    sheetChar = c;
    lastCharacterId = id;
    quickUpsert(c, true);
    renderSheetHeader();
    fName.value = c.name;
    fSpecies.value = c.species;
    fAge.value = c.age;
    fOrigin.value = c.origin;
    setError(errName, fName, '');
    setError(errAttach, inAttach, '');
    setStatus('');
    renderPortrait();
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
    try { await navigator.clipboard.writeText($('#campaign-code').textContent); toast('ID copiado.'); }
    catch (err) { toast('Não foi possível copiar sozinho. Toque no ID e copie.'); }
  });

  $('#delete-campaign').addEventListener('click', async () => {
    if (await deleteCampaignFlow(currentCamp)) go('home');
  });

  views.campaign = async function showCampaign(id) {
    const camp = await db.getCampaign(id);
    if (!camp) { toast('Não encontramos essa campanha.'); go('home'); return; }
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
    $('#members-count').textContent = members.length ? '(' + plural(members.length, 'pessoa', 'pessoas') + ')' : '';

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
      ? 'Você ainda não participa desta campanha. Abra um personagem seu e vincule com o ID de entrada.'
      : 'Para rolar dados, vincule um personagem seu a esta campanha (pela ficha dele).';
    inRoll.disabled = $('#roll-button').disabled = !canRoll;
    $$('[data-dice]').forEach((b) => { b.disabled = !canRoll; });
    setError(errRoll, inRoll, '');

    if (noAccess) { renderRolls([]); return; }
    const stop = db.subscribeRolls(id, renderRolls, (err) => toast(errorMessage(err)));
    onLeave = () => { if (typeof stop === 'function') stop(); };
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
