const DB_NAME = "animation-studio";
const DB_VER = 1;

let dbPromise = null;
const urls = new Map();

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
  const db = await openDB();
  return request(db.transaction("cats").objectStore("cats").getAll());
}

export async function saveCat(cat) {
  const db = await openDB();
  await request(db.transaction("cats", "readwrite").objectStore("cats").put(cat));
  return cat;
}

export async function deleteCat(id) {
  const db = await openDB();
  const items = await listItems(id);
  const tx = db.transaction(["cats", "items", "blobs"], "readwrite");
  tx.objectStore("cats").delete(id);
  items.forEach((item) => {
    tx.objectStore("items").delete(item.id);
    tx.objectStore("blobs").delete(item.id);
    revokeUrl(item.id);
  });
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function listItems(catId) {
  const db = await openDB();
  const index = db.transaction("items").objectStore("items").index("catId");
  const all = await request(index.getAll(catId));
  return all.sort((a, b) => (a.created || 0) - (b.created || 0));
}

export async function getBlob(id) {
  const db = await openDB();
  return request(db.transaction("blobs").objectStore("blobs").get(id));
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

export async function itemsWithUrls(catId) {
  const records = await listItems(catId);
  const out = [];
  for (const rec of records) {
    const blob = await getBlob(rec.id);
    if (!blob) continue;
    out.push({
      ...rec,
      src: objectUrl(rec.id, blob),
      user: true,
    });
  }
  return out;
}

export async function saveItem(item, blob) {
  const db = await openDB();
  const tx = db.transaction(["items", "blobs"], "readwrite");
  tx.objectStore("items").put(item);
  if (blob) tx.objectStore("blobs").put(blob, item.id);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  return item;
}

export async function updateItem(patch) {
  const db = await openDB();
  const tx = db.transaction("items", "readwrite");
  const store = tx.objectStore("items");
  const next = await new Promise((resolve, reject) => {
    const get = store.get(patch.id);
    get.onerror = () => reject(get.error);
    get.onsuccess = () => {
      const item = get.result;
      if (!item) {
        resolve(null);
        return;
      }
      const merged = { ...item, ...patch };
      store.put(merged);
      resolve(merged);
    };
  });
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  return next;
}

export async function deleteItem(id) {
  const db = await openDB();
  const tx = db.transaction(["items", "blobs"], "readwrite");
  tx.objectStore("items").delete(id);
  tx.objectStore("blobs").delete(id);
  revokeUrl(id);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPref(key) {
  const db = await openDB();
  return request(db.transaction("prefs").objectStore("prefs").get(key));
}

export async function setPref(pref) {
  const db = await openDB();
  await request(db.transaction("prefs", "readwrite").objectStore("prefs").put(pref));
  return pref;
}

export async function allPrefs() {
  const db = await openDB();
  const rows = await request(db.transaction("prefs").objectStore("prefs").getAll());
  const map = {};
  rows.forEach((row) => {
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
