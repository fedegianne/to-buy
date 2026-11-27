// A single atomic snapshot. Writes are queued so quick consecutive logs cannot
// overwrite a newer snapshot with an older one.
const DB_NAME = "ultragym-local";
let connection;
let queue = Promise.resolve();
function open() {
  if (!connection)
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("state");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error("Database upgrade blocked by another window."));
    });
  return connection;
}
export async function load() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction("state").objectStore("state").get("main");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export function save(state) {
  const snapshot = structuredClone(state);
  const job = async () => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("state", "readwrite");
      tx.objectStore("state").put(snapshot, "main");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Save aborted"));
    });
  };
  queue = queue.catch(() => {}).then(job);
  return queue;
}
