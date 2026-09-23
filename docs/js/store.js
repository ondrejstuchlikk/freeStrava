// IndexedDB storage, entirely in this browser.
//   summaries: small per-activity records (for lists, fitness curve, trends)
//   streams:   the normalized activity data, so an activity can be reopened
//              and re-analysed when settings change

const DB_NAME = "freestrava";
const VERSION = 1;

let dbPromise = null;
function db() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("summaries")) d.createObjectStore("summaries", { keyPath: "id" });
      if (!d.objectStoreNames.contains("streams")) d.createObjectStore("streams", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(stores, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(stores, mode);
    const req = fn(tx);
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Storage failed (is the device out of space?)"));
  });
}

export const store = {
  allSummaries: () => run("summaries", "readonly", (tx) => tx.objectStore("summaries").getAll()),
  getSummary: (id) => run("summaries", "readonly", (tx) => tx.objectStore("summaries").get(id)),
  getStreams: (id) => run("streams", "readonly", (tx) => tx.objectStore("streams").get(id)),
  save: (summary, act) => run(["summaries", "streams"], "readwrite", (tx) => {
    tx.objectStore("summaries").put(summary);
    if (act) tx.objectStore("streams").put({ id: summary.id, act });
  }),
  putSummaries: (list) => run("summaries", "readwrite", (tx) => {
    const s = tx.objectStore("summaries");
    for (const x of list) s.put(x);
  }),
  remove: (id) => run(["summaries", "streams"], "readwrite", (tx) => {
    tx.objectStore("summaries").delete(id);
    tx.objectStore("streams").delete(id);
  }),
  clear: () => run(["summaries", "streams"], "readwrite", (tx) => {
    tx.objectStore("summaries").clear();
    tx.objectStore("streams").clear();
  }),
};
