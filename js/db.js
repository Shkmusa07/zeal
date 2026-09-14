'use strict';

/**
 * IndexedDB wrapper for Study & Focus App.
 *
 * Stores:
 *   subjects  { id, name, createdAt }
 *   chapters  { id, subjectId, chapterName, complete, percentComplete,
 *               retention, revisionsDone, revisionsNeeded, remarks }
 *   tasks     { id, title, estimatedMinutes, status, startedAt, completedAt }
 */

const DB_NAME    = 'studyapp-db';
const DB_VERSION = 2;

let _db = null;

// ── Open / upgrade ───────────────────────────────────────────────────────────
function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const idb = e.target.result;

      if (!idb.objectStoreNames.contains('subjects')) {
        const s = idb.createObjectStore('subjects', { keyPath: 'id', autoIncrement: true });
        s.createIndex('name', 'name', { unique: false });
      }

      if (!idb.objectStoreNames.contains('chapters')) {
        const c = idb.createObjectStore('chapters', { keyPath: 'id', autoIncrement: true });
        c.createIndex('subjectId', 'subjectId', { unique: false });
      }

      if (!idb.objectStoreNames.contains('tasks')) {
        const t = idb.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
        t.createIndex('status', 'status', { unique: false });
      }

      if (!idb.objectStoreNames.contains('reviews')) {
        const r = idb.createObjectStore('reviews', { keyPath: 'id', autoIncrement: true });
        r.createIndex('subject', 'subject', { unique: false });
        r.createIndex('dateStudied', 'dateStudied', { unique: false });
      }
    };

    req.onsuccess  = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror    = ()  => reject(req.error);
    req.onblocked  = ()  => console.warn('[DB] upgrade blocked — close other tabs');
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function store(name, mode = 'readonly') {
  return _db.transaction(name, mode).objectStore(name);
}

function wrap(idbReq) {
  return new Promise((res, rej) => {
    idbReq.onsuccess = () => res(idbReq.result);
    idbReq.onerror   = () => rej(idbReq.error);
  });
}

// ── Public API ───────────────────────────────────────────────────────────────
const db = {
  /** Call once at app startup before any store access. */
  async init() {
    await openDB();
  },

  // ── subjects ───────────────────────────────────────────────────────────────
  subjects: {
    async getAll()       { await openDB(); return wrap(store('subjects').getAll()); },
    async add(name)      { await openDB(); return wrap(store('subjects', 'readwrite').add({ name, createdAt: Date.now() })); },
    async delete(id)     { await openDB(); return wrap(store('subjects', 'readwrite').delete(id)); }
  },

  // ── chapters ───────────────────────────────────────────────────────────────
  chapters: {
    async getAll()       { await openDB(); return wrap(store('chapters').getAll()); },
    async getBySubject(subjectId) {
      await openDB();
      return wrap(store('chapters').index('subjectId').getAll(IDBKeyRange.only(subjectId)));
    },
    async add(data)      { await openDB(); return wrap(store('chapters', 'readwrite').add(data)); },
    async update(data)   { await openDB(); return wrap(store('chapters', 'readwrite').put(data)); },
    async delete(id)     { await openDB(); return wrap(store('chapters', 'readwrite').delete(id)); }
  },

  // ── tasks ──────────────────────────────────────────────────────────────────
  tasks: {
    async getAll()       { await openDB(); return wrap(store('tasks').getAll()); },
    async add(data)      { await openDB(); return wrap(store('tasks', 'readwrite').add(data)); },
    async update(data)   { await openDB(); return wrap(store('tasks', 'readwrite').put(data)); },
    async delete(id)     { await openDB(); return wrap(store('tasks', 'readwrite').delete(id)); }
  },

  // ── reviews ────────────────────────────────────────────────────────────────
  reviews: {
    async getAll()       { await openDB(); return wrap(store('reviews').getAll()); },
    async add(data)      { await openDB(); return wrap(store('reviews', 'readwrite').add(data)); },
    async update(data)   { await openDB(); return wrap(store('reviews', 'readwrite').put(data)); },
    async delete(id)     { await openDB(); return wrap(store('reviews', 'readwrite').delete(id)); }
  }
};

// Expose globally so all modules can access without imports
window.db = db;
