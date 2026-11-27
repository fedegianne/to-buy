// Shared external-backup UI. No record copies are kept in browser metadata.
const DAY = 24 * 60 * 60 * 1000;
const frequencies = [["1", "Every day"], ["7", "Every 7 days"], ["30", "Every 30 days"], ["off", "Never"]];
const node = (tag, text, cls) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (cls) element.className = cls;
  return element;
};
const button = (text, action, primary = false) => {
  const element = node("button", text, primary ? "primary" : "");
  element.type = "button";
  element.addEventListener("click", action);
  return element;
};
const row = (...children) => {
  const element = node("div", undefined, "common-backup-actions");
  element.append(...children);
  return element;
};
const card = (heading, ...children) => {
  const element = node("section", undefined, "common-settings-card");
  element.append(node("h2", heading), ...children);
  return element;
};
// Canonicalize keys so restoring or migrating an unchanged record does not change its fingerprint.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export function fingerprint(records) {
  const text = JSON.stringify(canonical(records));
  let a = 2166136261, b = 5381;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b, 33) ^ c;
  }
  return `${text.length}:${a >>> 0}:${b >>> 0}`;
}
export function backupDue(meta, hasRecords, signature, now = Date.now()) {
  if (!hasRecords || meta.frequency === "off" || signature === meta.signature) return false;
  const days = ["1", "7", "30"].includes(meta.frequency) ? Number(meta.frequency) : 7;
  return !Number.isFinite(meta.lastExport) || meta.lastExport > now || now - meta.lastExport >= days * DAY;
}
export function createBackupTools({ slug, name, version, records, hasRecords, snapshot, exportNormal, restore, extraExport, lastNormal, refresh }) {
  // Device-specific metadata: restoring a JSON must not claim an external file exists on this device.
  const key = `${slug}:external-backup:v1`;
  let meta = { frequency: "7", lastExport: null, signature: null };
  let storageAvailable = true;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (saved && typeof saved === "object") {
      if (frequencies.some(([v]) => v === saved.frequency)) meta.frequency = saved.frequency;
      if (Number.isFinite(saved.lastExport) && typeof saved.signature === "string") {
        meta.lastExport = saved.lastExport;
        meta.signature = saved.signature;
      }
    }
  } catch { /* A malformed metadata record must not stop the app. */ }
  let snoozedDay = null;
  const day = () => new Date().toDateString();
  function saveMeta() {
    try { localStorage.setItem(key, JSON.stringify(meta)); storageAvailable = true; }
    catch { storageAvailable = false; }
  }
  function emergencyExport() {
    if (!hasRecords()) return;
    try {
      const signature = fingerprint(records());
      const payload = JSON.stringify(snapshot(), null, 2);
      const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
      const a = node("a");
      a.href = url;
      a.download = `${slug}-emergency.json`;
      document.body.append(a);
      try { a.click(); } finally { a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
      // The browser does not expose whether the user completed the save dialog.
      meta.lastExport = Date.now();
      meta.signature = signature;
      saveMeta();
      refresh();
    } catch (e) { alert(`Could not export emergency backup: ${e.message}`); }
  }
  function settings(container) {
    const select = node("select");
    select.id = "emergency-backup-frequency";
    for (const [value, label] of frequencies) {
      const option = node("option", label);
      option.value = value;
      select.append(option);
    }
    select.value = meta.frequency;
    select.addEventListener("change", () => { meta.frequency = select.value; snoozedDay = null; saveMeta(); refresh(); });
    const label = node("label", "Emergency backup reminder");
    label.htmlFor = select.id;
    const emergency = button("Export emergency backup now", emergencyExport);
    emergency.disabled = !hasRecords();
    const normalActions = row(button("Export JSON", exportNormal), button("Restore JSON", restore));
    const children = [node("p", "Your records are stored locally on this device. Export regular backups to protect against data loss.", "muted"), normalActions];
    if (extraExport) children.push(button("Export CSV", extraExport));
    if (lastNormal) children.push(node("small", lastNormal()));
    children.push(node("hr"), label, select, node("small", `Last emergency export requested: ${meta.lastExport === null ? "Never" : new Date(meta.lastExport).toLocaleString("en-GB")}`), emergency,
      node("small", "Save the emergency JSON to Files or iCloud Drive. Replace the previous file if asked. The app cannot verify that the file was saved."),
      node("small", "Restoring a backup replaces all existing records."));
    if (!hasRecords()) children.push(node("small", "Emergency export is available once you have saved records."));
    if (!storageAvailable) children.push(node("small", "Backup reminder preferences could not be saved on this device."));
    const link = node("a", "Cloudflare Privacy Policy");
    link.href = "https://www.cloudflare.com/privacypolicy/";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    container.replaceChildren(card("Data and backups", ...children),
      card(`About ${name}`, node("p", `Version ${version} · Offline-first PWA`, "muted"), node("p", "Free, with no accounts, ads or cloud synchronization.", "muted")),
      card("Privacy & Analytics", node("p", "Your personal records are stored locally on your device and are not uploaded to a server.", "muted"), node("p", "Cloudflare Web Analytics collects aggregate usage statistics without accessing your saved records or using tracking cookies.", "muted"), link));
  }
  function reminder(container) {
    container.querySelector("[data-emergency-reminder]")?.remove();
    if (snoozedDay === day() || !hasRecords() || meta.frequency === "off" || !backupDue(meta, true, fingerprint(records()))) return;
    const notice = card("Emergency backup due", node("p", "Export a copy of your records to protect against data loss.", "muted"), row(button("Later", () => { snoozedDay = day(); notice.remove(); }), button("Export backup", emergencyExport, true)));
    notice.dataset.emergencyReminder = "";
    container.prepend(notice);
  }
  return { settings, reminder, async requestPersistence() {
    try { if (navigator.storage?.persist && !(await navigator.storage.persisted?.())) await navigator.storage.persist(); }
    catch { /* Best effort only; browser storage can still be lost. */ }
  } };
}
