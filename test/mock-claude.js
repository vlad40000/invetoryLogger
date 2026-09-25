// Mock of the claude.ai artifact runtime (window.claude.use → db, assets, sample,
// downloads, user) for local preview and e2e tests. db is in-memory (resets on
// reload); sample returns canned plate reads; photos go to scripts/preview.mjs.
// Implements only the surface the app uses — see AGENTS.md → Runtime contract.
(() => {
  const docs = new Map(); // path -> data
  const listeners = new Set();
  const leases = new Map();
  window.__docs = docs;
  const tick = () => new Promise((r) => setTimeout(r, 15));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const segs = (p) => p.split('/');
  const parentOf = (p) => segs(p).slice(0, -1).join('/');
  const snapDoc = (path) => {
    const d = docs.get(path);
    return Object.freeze({
      id: segs(path).pop(),
      exists: !!d,
      data: () => (d ? clone(d) : undefined),
      metadata: { fromCache: false, hasPendingWrites: false },
    });
  };
  const notify = () => setTimeout(() => listeners.forEach((l) => l()), 5);

  function query(col, filters = [], order = null, lim = null) {
    const run = () => {
      let ids = [...docs.keys()].filter((p) => parentOf(p) === col);
      let list = ids.map((p) => ({ p, d: docs.get(p) }));
      for (const [f, op, v] of filters) list = list.filter(({ d }) => (op === '==' ? d[f] === v : true));
      if (order) {
        const [f, dir] = order;
        list.sort((a, b) => (a.d[f] > b.d[f] ? 1 : a.d[f] < b.d[f] ? -1 : 0) * (dir === 'desc' ? -1 : 1));
      } else list.sort((a, b) => (a.p > b.p ? 1 : -1));
      if (lim) list = list.slice(0, lim);
      const d = list.map(({ p }) => snapDoc(p));
      return { docs: d, size: d.length, empty: !d.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } };
    };
    const q = {
      where: (f, op, v) => query(col, [...filters, [f, op, v]], order, lim),
      orderBy: (f, dir = 'asc') => query(col, filters, [f, dir], lim),
      limit: (n) => query(col, filters, order, n),
      get: async () => (await tick(), run()),
      onSnapshot: (next) => {
        const l = () => next(run());
        listeners.add(l);
        setTimeout(l, 10);
        return () => listeners.delete(l);
      },
    };
    return q;
  }
  function docRef(path) {
    return {
      id: segs(path).pop(),
      path,
      get: async () => (await tick(), snapDoc(path)),
      set: async (data) => {
        await tick();
        docs.set(path, clone(data));
        notify();
      },
      update: async (data) => {
        await tick();
        if (!docs.has(path)) throw { code: 'invalid_argument', message: 'missing' };
        docs.set(path, { ...docs.get(path), ...clone(data) });
        notify();
      },
      delete: async () => {
        await tick();
        docs.delete(path);
        notify();
      },
      acquire: async ({ holder, ttlMs }) => {
        await tick();
        const now = Date.now();
        const cur = leases.get(path);
        const ttl = Math.min(600000, Math.max(1000, ttlMs || 30000));
        if (!cur || cur.exp < now || cur.holder === holder) {
          leases.set(path, { holder, exp: now + ttl });
          return { acquired: true, version: 1, expiresAt: new Date(now + ttl).toISOString(), holder };
        }
        return { acquired: false, expiresAt: new Date(cur.exp).toISOString() };
      },
      onSnapshot: (next) => {
        const l = () => next(snapDoc(path));
        listeners.add(l);
        setTimeout(l, 10);
        return () => listeners.delete(l);
      },
      collection: (sub) => colRef(path + '/' + sub),
    };
  }
  function colRef(path) {
    const q = query(path);
    let n = 0;
    return Object.assign(q, {
      path,
      doc: (id) => docRef(path + '/' + (id || 'm' + Date.now().toString(36) + (n++).toString(36) + Math.random().toString(36).slice(2, 8))),
      add: async (data) => {
        const r = docRef(path + '/' + Math.random().toString(36).slice(2));
        await r.set(data);
        return r;
      },
    });
  }
  const db = Object.freeze({ doc: docRef, collection: colRef });

  // Photos go to the preview server (scripts/preview.mjs), which serves them at /_blob/<id>.
  const assets = Object.freeze({
    upload: async (blob, opts) => {
      const type = (opts && opts.type) || blob.type || 'image/jpeg';
      const r = await fetch('/__mock/assets', { method: 'POST', headers: { 'content-type': type }, body: blob });
      if (!r.ok) throw { code: 'store_unavailable', message: 'mock upload failed' };
      const { id } = await r.json();
      return { id, url: '/_blob/' + id, sizeBytes: blob.size, contentType: type };
    },
    list: async () => {
      const u = await (await fetch('/__mock/assets')).json();
      return { assets: [], usage: { files: u.files, bytes: u.bytes, maxFiles: 10000, maxBytes: 5 * 1024 ** 3 } };
    },
    delete: async (id) => (await fetch('/__mock/assets/' + id, { method: 'DELETE' })).json(),
  });

  const PLATES = [
    { brand: 'Samsung', model: 'RF28HFEDBSR/AA', serial: '0ALY4BBK500812A', type: 'French Door Refrigerator', typeReason: 'RF prefix', color: 'Stainless', colorReason: 'SR suffix', confidence: { brand: 'high', model: 'high', serial: 'low' }, notAPlate: false },
    { brand: 'GE', model: 'JBS60RKSS', serial: 'TR1234SS6A', type: 'Coil Top Electric Range', typeReason: 'JBS = coil top', color: 'Stainless', colorReason: 'SS suffix', confidence: { brand: 'high', model: 'high', serial: 'high' }, notAPlate: false },
  ];
  let pi = 0;
  const json = async (input, opts = {}) => {
    const plate = PLATES[pi++ % PLATES.length];
    const text = JSON.stringify(plate);
    const cuts = [text.indexOf('"model"'), text.indexOf('"serial"'), text.indexOf('"type"'), text.length];
    for (const c of cuts) {
      await new Promise((r) => setTimeout(r, 450));
      if (opts.signal && opts.signal.aborted) throw { code: 'cancelled', message: 'cancelled' };
      opts.onText && opts.onText({ text: text.slice(0, c), delta: '' });
    }
    return JSON.parse(text);
  };
  const sample = Object.assign(async (input, opts) => ({ text: JSON.stringify(await json(input, opts)), truncated: false, modelTierApplied: 'quick' }), {
    json,
    limits: async () => ({ maxPromptBytes: 65536, images: { maxCount: 4, maxInputBytes: 20e6, mediaTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] } }),
  });

  const downloads = Object.freeze({
    save: async ({ filename, data }) => {
      const buf = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : new TextEncoder().encode(String(data));
      let s = '';
      for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
      window.__lastDownload = { filename, b64: btoa(s) };
      return { status: 'saved' };
    },
  });

  const user = Object.freeze({
    isOwner: async () => true,
    canEdit: async () => true,
    can: async () => true,
    id: async () => 'u_local',
    me: async () => ({ id: 'u_local', name: 'Razor', avatarUrl: '', color: '#E8472C', email: null, isOwner: true, canEdit: true }),
    profiles: async (ids) => Object.fromEntries([].concat(ids).map((id) => [id, { id, name: id === 'u_local' ? 'Razor' : '', avatarUrl: '', color: '#888', email: null, isMe: id === 'u_local', guest: false }])),
    name: async () => 'Razor',
  });

  const caps = { db, assets, sample, downloads, user };
  window.claude = { use: (n) => new Promise((r) => setTimeout(() => r(caps[n] || null), 60)) };
})();
