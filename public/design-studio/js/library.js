const API = "/api/design-studio";
const DB_NAME = "animation-studio";
const DB_VER = 1;

let cache = null;
const urls = new Map();
let dbPromise = null;

function request(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("cats")) db.createObjectStore("cats", { keyPath: "id" });
      if (!db.objectStoreNames.contains("items")) {
        const store = db.createObjectStore("items", { keyPath: "id" });
        store.createIndex("catId", "catId", { unique: false });
      }
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
      if (!db.objectStoreNames.contains("prefs")) db.createObjectStore("prefs", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, options);
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message || "Studio library request failed.");
  }
  const type = res.headers.get("content-type") || "";
  if (type.includes("application/json")) return res.json();
  return res;
}

async function loadLibrary(force = false) {
  if (cache && !force) return cache;
  const body = await api("/library");
  cache = {
    cats: body.cats || [],
    items: body.items || [],
    prefs: body.prefs || [],
  };
  return cache;
}

function invalidate() {
  cache = null;
}

export function slugify(name) {
  return String(name || "untitled")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "untitled";
}

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function listCats() {
  const lib = await loadLibrary();
  return lib.cats;
}

export async function saveCat(cat) {
  const body = await api("/cats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cat),
  });
  invalidate();
  return body.cat || cat;
}

export async function deleteCat(id) {
  await api(`/cats/${encodeURIComponent(id)}`, { method: "DELETE" });
  revokeUrl(id);
  invalidate();
}

export async function listItems(catId) {
  const lib = await loadLibrary();
  return lib.items
    .filter((item) => item.catId === catId)
    .sort((a, b) => (a.created || 0) - (b.created || 0));
}

export async function getBlob() {
  return null;
}

export function objectUrl(id, blob) {
  const prev = urls.get(id);
  if (prev) URL.revokeObjectURL(prev);
  const url = URL.createObjectURL(blob);
  urls.set(id, url);
  return url;
}

export function revokeUrl(id) {
  const prev = urls.get(id);
  if (prev) {
    URL.revokeObjectURL(prev);
    urls.delete(id);
  }
}

export function revokeAll() {
  urls.forEach((url) => URL.revokeObjectURL(url));
  urls.clear();
}

export function fileUrl(id) {
  return `${API}/file/${encodeURIComponent(id)}`;
}

export async function itemsWithUrls(catId) {
  const records = await listItems(catId);
  return records.map((rec) => ({
    ...rec,
    src: fileUrl(rec.id),
    user: true,
  }));
}

export async function saveItem(item, blob) {
  const fd = new FormData();
  fd.append("meta", JSON.stringify(item));
  if (blob) fd.append("file", blob, blob.name || `${item.id}.png`);
  const body = await api("/items", { method: "POST", body: fd });
  invalidate();
  return body.item || item;
}

export async function updateItem(patch) {
  const body = await api(`/items/${encodeURIComponent(patch.id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  invalidate();
  return body.item;
}

export async function deleteItem(id) {
  await api(`/items/${encodeURIComponent(id)}`, { method: "DELETE" });
  revokeUrl(id);
  invalidate();
}

export async function getPref(key) {
  const lib = await loadLibrary();
  return lib.prefs.find((row) => row.key === key) || null;
}

export async function setPref(pref) {
  const body = await api("/prefs", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pref),
  });
  invalidate();
  return body.pref || pref;
}

export async function allPrefs() {
  const lib = await loadLibrary();
  const map = {};
  lib.prefs.forEach((row) => {
    map[row.key] = row;
  });
  return map;
}

export async function inspectImage(file) {
  const bitmap = await createImageBitmap(file);
  const info = { w: bitmap.width, h: bitmap.height };
  bitmap.close();
  return info;
}

export function prettyName(fileName) {
  return String(fileName || "Untitled")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Untitled";
}

export async function migrateBrowserLibrary() {
  if (localStorage.getItem("studio-disk-migrated")) return;
  try {
    const remote = await loadLibrary(true);
    if ((remote.items && remote.items.length) || (remote.cats && remote.cats.length)) {
      localStorage.setItem("studio-disk-migrated", "1");
      return;
    }
    const db = await openDB();
    const cats = await request(db.transaction("cats").objectStore("cats").getAll());
    const items = await request(db.transaction("items").objectStore("items").getAll());
    const prefs = await request(db.transaction("prefs").objectStore("prefs").getAll());
    if (!cats.length && !items.length && !prefs.length) {
      localStorage.setItem("studio-disk-migrated", "1");
      return;
    }
    for (const cat of cats) await saveCat(cat);
    for (const item of items) {
      const blob = await request(db.transaction("blobs").objectStore("blobs").get(item.id));
      if (blob) await saveItem(item, blob);
    }
    for (const pref of prefs) await setPref(pref);
    localStorage.setItem("studio-disk-migrated", "1");
  } catch (err) {
    console.warn("Design Studio browser library migrate skipped", err);
  }
}
