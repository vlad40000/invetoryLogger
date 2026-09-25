// Standalone implementation of the claude.ai Artifact capability surface used by
// Appliance Inventory Logger. In a real Artifact (or the local mock preview),
// window.claude already exists and this file intentionally does nothing.
(() => {
  if (window.claude && typeof window.claude.use === 'function') return;

  const POLL_MS = Number(window.__CLAUDE_SHIM_POLL_MS__) > 0 ? Number(window.__CLAUDE_SHIM_POLL_MS__) : 3000;
  const listeners = new Set();
  let mePromise = null;

  function redirectToLogin() {
    try {
      const loc = window.location;
      if (!loc || loc.pathname === '/login.html') return;
      const next = `${loc.pathname || '/'}${loc.search || ''}${loc.hash || ''}`;
      loc.replace(`/login.html?next=${encodeURIComponent(next)}`);
    } catch {}
  }

  const apiError = async (response) => {
    let payload = null;
    try { payload = await response.clone().json(); } catch {}
    const message = payload?.error || payload?.message || response.statusText || `HTTP ${response.status}`;
    let code = payload?.code || 'unavailable';
    if (response.status === 401) {
      code = 'unauthorized';
      redirectToLogin();
    } else if (response.status === 404) code = 'invalid_argument';
    else if (response.status === 413) code = 'too_large';
    else if (response.status === 429) code = 'rate_limited';
    else if (response.status >= 500) code = 'unavailable';
    return { code, message };
  };

  async function request(url, init = {}) {
    let response;
    try {
      response = await fetch(url, { credentials: 'same-origin', ...init });
    } catch (error) {
      throw { code: 'unavailable', message: error instanceof Error ? error.message : 'Network unavailable' };
    }
    if (!response.ok) throw await apiError(response);
    if (response.status === 204) return null;
    const type = response.headers.get('content-type') || '';
    return type.includes('application/json') ? response.json() : response.text();
  }

  const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
  const lastSegment = (path) => path.split('/').filter(Boolean).at(-1) || '';

  function documentSnapshot(path, payload) {
    const exists = Boolean(payload?.exists);
    const data = payload?.data ?? null;
    return Object.freeze({
      id: lastSegment(path),
      exists,
      data: () => exists ? clone(data) : undefined,
      metadata: { fromCache: false, hasPendingWrites: false },
    });
  }

  function querySnapshot(payload) {
    const docs = Array.isArray(payload?.docs) ? payload.docs : [];
    const snaps = docs.map((entry) => documentSnapshot(entry.path || entry.id || '', { exists: true, data: entry.data }));
    return Object.freeze({
      docs: snaps,
      size: snaps.length,
      empty: snaps.length === 0,
      docChanges: () => [],
      metadata: { fromCache: false, hasPendingWrites: false },
    });
  }

  function snapshotFingerprint(value) {
    if (value && typeof value.data === 'function' && 'exists' in value) {
      return JSON.stringify({
        id: value.id,
        exists: value.exists,
        data: value.data(),
        metadata: value.metadata,
      });
    }
    if (value && Array.isArray(value.docs)) {
      return JSON.stringify({
        docs: value.docs.map((doc) => ({
          id: doc.id,
          exists: doc.exists,
          data: typeof doc.data === 'function' ? doc.data() : null,
          metadata: doc.metadata,
        })),
        metadata: value.metadata,
      });
    }
    return JSON.stringify(value);
  }

  function subscribe(load, next, error) {
    let stopped = false;
    let timer = null;
    let previous = null;

    const run = async (force = false) => {
      if (stopped) return;
      try {
        const value = await load();
        const serialized = snapshotFingerprint(value);
        if (force || serialized !== previous) {
          previous = serialized;
          next(value);
        }
      } catch (err) {
        if (!stopped && error) error(err);
      }
    };

    const schedule = () => {
      clearTimeout(timer);
      if (stopped || document.visibilityState === 'hidden') return;
      timer = setTimeout(async () => {
        await run(false);
        schedule();
      }, POLL_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void run(true);
        schedule();
      } else clearTimeout(timer);
    };

    const onLocalWrite = () => void run(true);
    document.addEventListener('visibilitychange', onVisibility);
    listeners.add(onLocalWrite);
    void run(true).finally(schedule);

    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      listeners.delete(onLocalWrite);
    };
  }

  function notifyLocalWrite() {
    for (const listener of listeners) listener();
  }

  function docRef(path) {
    return {
      id: lastSegment(path),
      path,
      async get() {
        const payload = await request(`/api/db/doc?path=${encodeURIComponent(path)}`);
        return documentSnapshot(path, payload);
      },
      async set(data) {
        await request('/api/db/doc', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path, data }),
        });
        notifyLocalWrite();
      },
      async update(data) {
        await request('/api/db/doc', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path, data }),
        });
        notifyLocalWrite();
      },
      async delete() {
        await request(`/api/db/doc?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
        notifyLocalWrite();
      },
      async acquire({ holder, ttlMs }) {
        return request('/api/db/acquire', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path, holder, ttlMs }),
        });
      },
      onSnapshot(next, error) {
        return subscribe(async () => {
          const payload = await request(`/api/db/doc?path=${encodeURIComponent(path)}`);
          return documentSnapshot(path, payload);
        }, next, error);
      },
      collection(subpath) {
        return collectionRef(`${path}/${subpath}`);
      },
    };
  }

  function queryRef(collection, order = null, limit = null) {
    const self = {
      orderBy(field, dir = 'asc') { return queryRef(collection, [field, dir], limit); },
      limit(n) { return queryRef(collection, order, n); },
      async get() {
        const params = new URLSearchParams({ collection });
        if (order) {
          params.set('orderBy', order[0]);
          params.set('dir', order[1]);
        }
        if (limit != null) params.set('limit', String(limit));
        return querySnapshot(await request(`/api/db/query?${params}`));
      },
      onSnapshot(next, error) {
        return subscribe(async () => {
          const params = new URLSearchParams({ collection });
          if (order) {
            params.set('orderBy', order[0]);
            params.set('dir', order[1]);
          }
          if (limit != null) params.set('limit', String(limit));
          return querySnapshot(await request(`/api/db/query?${params}`));
        }, next, error);
      },
    };
    return self;
  }

  function collectionRef(path) {
    const query = queryRef(path);
    return Object.assign(query, {
      path,
      doc(id) {
        const generated = id || `m${Date.now().toString(36)}${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
        return docRef(`${path}/${generated}`);
      },
      async add(data) {
        const ref = this.doc();
        await ref.set(data);
        return ref;
      },
    });
  }

  const db = Object.freeze({ doc: docRef, collection: collectionRef });

  const assets = Object.freeze({
    async upload(blob, opts = {}) {
      const contentType = opts.type || blob.type || 'image/jpeg';
      return request('/api/assets', {
        method: 'POST',
        headers: { 'content-type': contentType },
        body: blob,
      });
    },
    async list() { return request('/api/assets'); },
    async delete(id) { return request(`/api/assets/${encodeURIComponent(id)}`, { method: 'DELETE' }); },
  });

  function parseJsonTolerantly(text) {
    try { return JSON.parse(text); } catch {}
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try { return JSON.parse(fenced[1]); } catch {}
    }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw { code: 'invalid_argument', message: 'Model response was not valid JSON.' };
  }

  async function sampleJson(prompt, opts = {}) {
    const image = Array.isArray(opts.images) ? opts.images[0] : opts.images;
    if (!(image instanceof Blob)) throw { code: 'image_rejected', message: 'One image is required.' };
    const form = new FormData();
    form.append('prompt', String(prompt || ''));
    form.append('tier', opts.modelTier === 'default' ? 'default' : 'quick');
    form.append('image', image, 'nameplate');

    let response;
    try {
      response = await fetch('/api/sample', {
        method: 'POST',
        credentials: 'same-origin',
        body: form,
        signal: opts.signal,
      });
    } catch (error) {
      if (opts.signal?.aborted || error?.name === 'AbortError') throw { code: 'cancelled', message: 'cancelled' };
      throw { code: 'unavailable', message: error instanceof Error ? error.message : 'Network unavailable' };
    }
    if (!response.ok) throw await apiError(response);
    const payload = await response.json();
    const text = String(payload?.text || '');
    if (opts.onText) opts.onText({ text, delta: text });
    return parseJsonTolerantly(text);
  }

  const sample = Object.assign(
    async (prompt, opts = {}) => ({
      text: JSON.stringify(await sampleJson(prompt, opts)),
      truncated: false,
      modelTierApplied: opts.modelTier === 'default' ? 'default' : 'quick',
    }),
    {
      json: sampleJson,
      limits: async () => ({
        maxPromptBytes: 65536,
        images: {
          maxCount: 1,
          maxInputBytes: 20_000_000,
          mediaTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        },
      }),
    },
  );

  const downloads = Object.freeze({
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'download';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        return { status: 'saved' };
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    },
  });

  async function me() {
    if (!mePromise) mePromise = request('/api/me').catch((error) => {
      mePromise = null;
      throw error;
    });
    return mePromise;
  }

  const user = Object.freeze({
    id: async () => (await me()).id,
    can: async (permission) => permission === 'data.write' ? Boolean((await me()).canEdit) : false,
    canEdit: async () => Boolean((await me()).canEdit),
    isOwner: async () => Boolean((await me()).isOwner),
    me,
    name: async () => String((await me()).name || ''),
    profiles: async (ids) => {
      const current = await me();
      return Object.fromEntries([].concat(ids || []).map((id) => [id, {
        id,
        name: id === current.id ? current.name : '',
        avatarUrl: '',
        color: '#888',
        email: null,
        isMe: id === current.id,
        guest: id !== current.id,
      }]));
    },
  });

  const capabilities = { db, assets, sample, downloads, user };
  window.claude = Object.freeze({
    use: async (name) => capabilities[name] || null,
  });
})();
