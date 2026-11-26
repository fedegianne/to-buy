// A single transactional record keeps items, tag definitions and preferences consistent.
const DB_NAME = "to-buy-pwa";
const initial = () => ({
  items: [],
  tags: [],
  settings: { theme: "auto", group: false },
  lastBackup: null,
});

export async function openStore() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return {
    async load() {
      return new Promise((resolve, reject) => {
        const request = db
          .transaction("state")
          .objectStore("state")
          .get("main");
        request.onsuccess = () => resolve(request.result || initial());
        request.onerror = () => reject(request.error);
      });
    },
    async save(value) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction("state", "readwrite");
        tx.objectStore("state").put(value, "main");
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    },
  };
}
