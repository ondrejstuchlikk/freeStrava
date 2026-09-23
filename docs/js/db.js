// Tiny IndexedDB cache so returning visits only fetch new activities
// (the Strava rate limit is shared by everyone using this app).
// One database per athlete, so a shared phone never mixes people's data.

const VERSION = 1;

function open(athleteId) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(`freestrava-${athleteId}`, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("activities")) db.createObjectStore("activities", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result && "result" in result ? result.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function openCache(athleteId) {
  const db = await open(athleteId);
  return {
    allActivities: () => tx(db, "activities", "readonly", (s) => s.getAll()),
    putActivities: (list) => tx(db, "activities", "readwrite", (s) => { for (const a of list) s.put(a); }),
    clearActivities: () => tx(db, "activities", "readwrite", (s) => s.clear()),
    getMeta: (key) => tx(db, "meta", "readonly", (s) => s.get(key)),
    setMeta: (key, value) => tx(db, "meta", "readwrite", (s) => s.put(value, key)),
    close: () => db.close(),
  };
}

export function deleteCache(athleteId) {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(`freestrava-${athleteId}`);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}
