import { openStore } from "./db.js";

const $ = (id) => document.getElementById(id);
const main = $("main");
const editor = $("editor");
const uid = () =>
  crypto.randomUUID?.() ||
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const key = (name) => name.trim().toLocaleLowerCase();
const sorted = (values) => [...values].sort((a, b) => a.localeCompare(b));
const dateLabel = (value) => new Date(value).toLocaleDateString("en-GB");
let store, state;
let page = "active",
  search = "",
  filters = [],
  priorityOnly = false,
  untagged = false;
let editing = null,
  chosen = [],
  toastTimer;
let saving = false;

// Construct DOM nodes instead of interpolating user data into HTML.
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(text, action, className = "") {
  const node = el("button", text, className);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}
function line(...nodes) {
  const node = el("div", undefined, "line between");
  node.append(...nodes);
  return node;
}
function panel(...nodes) {
  const node = el("section", undefined, "panel");
  node.append(...nodes);
  return node;
}
function message(text, undo) {
  clearTimeout(toastTimer);
  const node = $("toast");
  node.replaceChildren(el("span", text));
  if (undo)
    node.append(
      button("Undo", () => {
        node.style.display = "none";
        undo();
      }),
    );
  node.style.display = "flex";
  toastTimer = setTimeout(
    () => {
      node.style.display = "none";
    },
    undo ? 9000 : 4000,
  );
}
// Save before updating the UI; a failed write leaves the previous state intact.
async function change(mutator, after) {
  if (saving) {
    message("Please finish the current action.");
    return;
  }
  saving = true;
  try {
    const next = structuredClone(state);
    mutator(next);
    await store.save(next);
    state = next;
    render();
    if (after) after();
  } catch (error) {
    console.error(error);
    message("Could not save changes. Please try again.");
  } finally {
    saving = false;
  }
}
function activeItems() {
  return state.items.filter((item) => !item.purchasedAt);
}
function addTagTo(data, tag) {
  const existing = data.tags.find((t) => key(t) === key(tag));
  if (existing) return existing;
  data.tags.push(tag.trim());
  return tag.trim();
}
function navigate(next, tag) {
  page = next;
  search = "";
  filters = tag ? [tag] : [];
  priorityOnly = false;
  untagged = false;
  render();
  window.scrollTo(0, 0);
}
function render() {
  document.documentElement.dataset.theme = state.settings.theme;
  $("title").textContent = {
    active: "To Buy",
    tags: "Tags",
    history: "History",
    settings: "Settings",
  }[page];
  for (const nav of document.querySelectorAll("nav button")) {
    if (nav.dataset.page === page) nav.setAttribute("aria-current", "page");
    else nav.removeAttribute("aria-current");
  }
  main.replaceChildren();
  ({
    active: renderActive,
    tags: renderTags,
    history: renderHistory,
    settings: renderSettings,
  })[page]();
}
function searchBox(onChange, placeholder) {
  const input = el("input");
  input.type = "search";
  input.placeholder = placeholder;
  input.value = search;
  input.setAttribute("aria-label", placeholder);
  input.addEventListener("input", () => {
    search = input.value;
    onChange();
  });
  return input;
}
function matches(item) {
  return [item.name, item.notes, ...item.tags]
    .join(" ")
    .toLocaleLowerCase()
    .includes(key(search));
}
function renderActive() {
  const list = el("div", undefined, "group");
  const chips = el("div", undefined, "chips");
  const count = el("p", "", "muted");
  function refresh() {
    chips.replaceChildren();
    chips.append(
      button(
        "All",
        () => {
          filters = [];
          untagged = false;
          refresh();
        },
        !filters.length && !untagged ? "selected" : "",
      ),
    );
    for (const tag of sorted(state.tags)) {
      chips.append(
        button(
          tag,
          () => {
            untagged = false;
            filters = filters.includes(tag)
              ? filters.filter((t) => t !== tag)
              : [...filters, tag];
            refresh();
          },
          filters.includes(tag) ? "selected" : "",
        ),
      );
    }
    chips.append(
      button(
        "Untagged",
        () => {
          untagged = !untagged;
          filters = [];
          refresh();
        },
        untagged ? "selected" : "",
      ),
    );
    const items = activeItems().filter(
      (i) =>
        matches(i) &&
        (!priorityOnly || i.priority) &&
        (!untagged || !i.tags.length) &&
        (!filters.length || filters.some((t) => i.tags.includes(t))),
    );
    items.sort(
      (a, b) =>
        Number(b.priority) - Number(a.priority) ||
        b.createdAt.localeCompare(a.createdAt),
    );
    count.textContent = `${items.length} of ${activeItems().length} items remaining`;
    list.replaceChildren();
    if (!items.length) {
      list.append(el("p", "Nothing to buy here.", "empty"));
      return;
    }
    if (!state.settings.group) {
      list.append(...items.map(itemCard));
      return;
    }
    // Grouped view may show an item in multiple groups, but it has one ID.
    const groups = filters.length
      ? sorted(filters)
      : sorted([...new Set(items.flatMap((i) => i.tags))]);
    for (const tag of groups) {
      const matching = items.filter((i) => i.tags.includes(tag));
      if (matching.length)
        list.append(
          el("h3", `${tag} · ${matching.length}`),
          ...matching.map(itemCard),
        );
    }
    const noTags = items.filter((i) => !i.tags.length);
    if (noTags.length)
      list.append(el("h3", "Untagged"), ...noTags.map(itemCard));
  }
  const groupButton = button(
    state.settings.group ? "Grouped" : "Flat list",
    () =>
      change((s) => {
        s.settings.group = !s.settings.group;
      }),
  );
  const priorityButton = button(
    "Priority only",
    () => {
      priorityOnly = !priorityOnly;
      priorityButton.classList.toggle("selected", priorityOnly);
      refresh();
    },
    priorityOnly ? "selected" : "",
  );
  main.append(
    searchBox(refresh, "Search items or tags…"),
    chips,
    line(priorityButton, groupButton),
    count,
    list,
  );
  refresh();
}
function itemCard(item) {
  const node = el("article", undefined, "item");
  const name = button(item.name, () => openEditor(item), "name");
  const row = el("div", undefined, "line");
  if (!item.purchasedAt) {
    const checkbox = el("input");
    checkbox.type = "checkbox";
    checkbox.setAttribute("aria-label", `Mark ${item.name} purchased`);
    checkbox.addEventListener("change", () => purchase(item.id));
    row.append(checkbox);
  }
  row.append(name);
  if (item.priority) row.append(el("span", "⚑", "flag"));
  row.append(button("Edit", () => openEditor(item)));
  node.append(row);
  const chips = el("div", undefined, "chips");
  for (const tag of item.tags)
    chips.append(button(tag, () => navigate("active", tag)));
  if (item.tags.length) node.append(chips);
  if (item.notes) node.append(el("p", item.notes, "muted notes"));
  if (item.url && safeURL(item.url)) {
    const a = el("a", "Open product link");
    a.href = item.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    node.append(a);
  }
  if (item.purchasedAt) {
    node.append(
      el("small", `Purchased ${dateLabel(item.purchasedAt)}`),
      line(
        button("Restore", () => restore(item.id)),
        button("Buy again", () => buyAgain(item)),
        button("Delete", () => remove(item.id), "danger"),
      ),
    );
  } else node.append(button("Delete", () => remove(item.id), "danger"));
  return node;
}
function safeURL(value) {
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
function purchase(id) {
  change(
    (s) => {
      s.items.find((i) => i.id === id).purchasedAt = new Date().toISOString();
    },
    () => message("Marked as purchased", () => restore(id)),
  );
}
function restore(id) {
  change(
    (s) => {
      const i = s.items.find((x) => x.id === id);
      if (i) i.purchasedAt = null;
    },
    () => message("Restored to To Buy"),
  );
}
function buyAgain(item) {
  change(
    (s) =>
      s.items.push({
        ...item,
        id: uid(),
        tags: [...item.tags],
        createdAt: new Date().toISOString(),
        purchasedAt: null,
      }),
    () => message("Added to To Buy"),
  );
}
function remove(id) {
  if (confirm("Permanently delete this item?"))
    change((s) => {
      s.items = s.items.filter((i) => i.id !== id);
    });
}
function openEditor(item) {
  editing = item?.id || null;
  chosen = [...(item?.tags || [])];
  $("editor-title").textContent = item ? "Edit item" : "Add item";
  $("name").value = item?.name || "";
  $("notes").value = item?.notes || "";
  $("url").value = item?.url || "";
  $("priority").checked = item?.priority || false;
  $("tag-input").value = "";
  refreshEditorTags();
  editor.showModal();
}
function refreshEditorTags() {
  $("chosen").replaceChildren(
    ...chosen.map((tag) =>
      button(`${tag} ×`, () => {
        chosen = chosen.filter((t) => t !== tag);
        refreshEditorTags();
      }),
    ),
  );
  const query = key($("tag-input").value);
  const available = sorted(state.tags).filter(
    (t) => !chosen.some((c) => key(c) === key(t)) && key(t).includes(query),
  );
  $("suggestions").replaceChildren(
    ...available
      .slice(0, 15)
      .map((tag) => button(`+ ${tag}`, () => selectTag(tag))),
  );
}
function selectTag(value) {
  const tag = value.trim();
  if (tag && !chosen.some((t) => key(t) === key(tag)))
    chosen.push(state.tags.find((t) => key(t) === key(tag)) || tag);
  $("tag-input").value = "";
  refreshEditorTags();
}
function renderTags() {
  main.append(
    panel(
      el(
        "p",
        "Tags are interchangeable: shops, malls, areas or anything useful.",
        "muted",
      ),
      button(
        "+ New tag",
        () => {
          const name = prompt("New tag name")?.trim();
          if (name && name.length <= 80)
            change((s) => {
              addTagTo(s, name);
            });
        },
        "primary",
      ),
    ),
  );
  for (const tag of sorted(state.tags)) {
    const count = activeItems().filter((i) => i.tags.includes(tag)).length;
    const actions = el("div", undefined, "tag-actions");
    const merge = button("Merge", () => mergeTag(tag));
    merge.disabled = state.tags.length < 2;
    actions.append(
      button("Rename", () => renameTag(tag)),
      merge,
    );
    main.append(
      panel(
        button(`${tag} · ${count} to buy`, () => navigate("active", tag)),
        actions,
        button("Delete tag", () => deleteTag(tag), "danger"),
      ),
    );
  }
  main.append(
    button(
      `Untagged · ${activeItems().filter((i) => !i.tags.length).length} to buy`,
      () => {
        page = "active";
        search = "";
        filters = [];
        priorityOnly = false;
        untagged = true;
        render();
      },
    ),
  );
}
// Renaming never merges tags; merging must select an existing destination.
function renameTag(old) {
  const name = prompt("Rename tag", old)?.trim();
  if (!name || name === old) return;
  if (name.length > 80) {
    message("Tag names must be at most 80 characters.");
    return;
  }
  if (state.tags.some((t) => t !== old && key(t) === key(name))) {
    message("That tag already exists. Use Merge instead.");
    return;
  }
  replaceTag(old, name);
}

function mergeTag(old) {
  const targets = sorted(state.tags.filter((t) => t !== old));
  if (!targets.length) return;

  const dialog = el("dialog");
  const form = el("form");
  const heading = el("h2", `Merge ${old}`);
  heading.id = "merge-heading";
  dialog.setAttribute("aria-labelledby", heading.id);
  const label = el("label", "Merge into");
  const select = el("select");
  select.required = true;
  const placeholder = el("option", "Select an existing tag");
  placeholder.value = "";
  placeholder.disabled = true;
  placeholder.selected = true;
  select.append(placeholder);
  for (const tag of targets) {
    const option = el("option", tag);
    option.value = tag;
    select.append(option);
  }
  label.append(select);
  const submit = el("button", "Merge tags", "primary");
  submit.type = "submit";
  submit.disabled = true;
  select.addEventListener("change", () => {
    submit.disabled = !targets.includes(select.value);
  });
  form.append(
    heading,
    el(
      "p",
      "All active and purchased items will use the selected tag. The original tag will be removed.",
      "muted",
    ),
    label,
    line(
      button("Cancel", () => dialog.close()),
      submit,
    ),
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const target = select.value;
    if (
      !state.tags.includes(old) ||
      target === old ||
      !state.tags.includes(target)
    )
      return;
    dialog.close();
    replaceTag(old, target);
  });
  dialog.append(form);
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
}

function replaceTag(old, target) {
  change((s) => {
    s.tags = s.tags.filter((t) => t !== old);
    if (!s.tags.includes(target)) s.tags.push(target);
    for (const item of s.items) {
      item.tags = [...new Set(item.tags.map((t) => (t === old ? target : t)))];
    }
  });
}
function deleteTag(tag) {
  if (!confirm(`Remove tag ${tag} from all items? Items will not be deleted.`))
    return;
  change((s) => {
    s.tags = s.tags.filter((t) => t !== tag);
    for (const item of s.items) item.tags = item.tags.filter((t) => t !== tag);
  });
}
function renderHistory() {
  const list = el("div", undefined, "group");
  function refresh() {
    const items = state.items
      .filter((i) => i.purchasedAt && matches(i))
      .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
    list.replaceChildren(
      ...(items.length
        ? items.map(itemCard)
        : [el("p", "No purchases to show.", "empty")]),
    );
  }
  main.append(searchBox(refresh, "Search purchase history…"), list);
  refresh();
}
function renderSettings() {
  const select = el("select");
  select.setAttribute("aria-label", "Appearance");
  for (const [value, label] of [
    ["auto", "System"],
    ["light", "Light"],
    ["dark", "Dark"],
  ]) {
    const option = el("option", label);
    option.value = value;
    select.append(option);
  }
  select.value = state.settings.theme;
  select.onchange = () =>
    change((s) => {
      s.settings.theme = select.value;
    });
  main.append(
    panel(el("h2", "Appearance"), select),
    panel(
      el("h2", "Backup and restore"),
      el(
        "p",
        "Your data is stored on this device. Export a backup regularly.",
        "muted",
      ),
      el(
        "small",
        state.lastBackup
          ? `Last export: ${dateLabel(state.lastBackup)}`
          : "No backup exported yet",
      ),
      button("Export JSON backup", exportBackup, "primary"),
      button("Restore JSON backup", () => $("import").click()),
    ),
    panel(
      el("h2", "About To Buy"),
      el("p", "Version 1.1 · Offline-first PWA", "muted"),
      el("p", "No accounts, tracking or cloud synchronization.", "muted"),
    ),
  );
}
async function exportBackup() {
  const backup = {
    format: "to-buy",
    version: 1,
    ...structuredClone(state),
    lastBackup: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = el("a");
  a.href = url;
  a.download = `to-buy-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  await change(
    (s) => {
      s.lastBackup = backup.lastBackup;
    },
    () => message("Backup exported"),
  );
}
// Validate a backup completely before replacing existing records.
function validateBackup(raw) {
  if (
    raw?.format !== "to-buy" ||
    raw.version !== 1 ||
    !Array.isArray(raw.items) ||
    !Array.isArray(raw.tags)
  )
    throw Error("Unsupported backup");
  const result = {
    items: [],
    tags: [],
    settings: {
      theme: ["auto", "light", "dark"].includes(raw.settings?.theme)
        ? raw.settings.theme
        : "auto",
      group: raw.settings?.group === true,
    },
    lastBackup: null,
  };
  const ids = new Set();
  for (const t of raw.tags) {
    if (typeof t !== "string" || !t.trim() || t.length > 80)
      throw Error("Invalid tag");
    addTagTo(result, t);
  }
  const validDate = (d) =>
    typeof d === "string" && Number.isFinite(Date.parse(d));
  for (const i of raw.items) {
    if (
      !i ||
      typeof i.id !== "string" ||
      ids.has(i.id) ||
      typeof i.name !== "string" ||
      !i.name.trim() ||
      !Array.isArray(i.tags) ||
      !validDate(i.createdAt) ||
      (i.purchasedAt !== null && !validDate(i.purchasedAt))
    )
      throw Error("Invalid item");
    ids.add(i.id);
    const tags = i.tags.map((t) => {
      if (typeof t !== "string" || !t.trim() || t.length > 80)
        throw Error("Invalid tag");
      return addTagTo(result, t);
    });
    result.items.push({
      id: i.id,
      name: i.name,
      tags: [...new Set(tags)],
      priority: i.priority === true,
      notes: typeof i.notes === "string" ? i.notes : "",
      url: typeof i.url === "string" && safeURL(i.url) ? i.url : "",
      createdAt: new Date(i.createdAt).toISOString(),
      purchasedAt: i.purchasedAt ? new Date(i.purchasedAt).toISOString() : null,
    });
  }
  if (validDate(raw.lastBackup)) result.lastBackup = raw.lastBackup;
  return result;
}
async function init() {
  try {
    store = await openStore();
    state = await store.load();
  } catch (e) {
    main.append(
      el(
        "p",
        "Local storage could not be opened. Check browser settings and reload.",
      ),
    );
    console.error(e);
    return;
  }
  for (const nav of document.querySelectorAll("nav button"))
    nav.onclick = () => navigate(nav.dataset.page);
  $("add").onclick = () => openEditor();
  $("cancel").onclick = () => editor.close();
  $("add-tag").onclick = () => selectTag($("tag-input").value);
  $("tag-input").oninput = refreshEditorTags;
  $("tag-input").onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      selectTag(e.target.value);
    }
  };
  $("item-form").onsubmit = (e) => {
    e.preventDefault();
    const name = $("name").value.trim(),
      url = $("url").value.trim();
    if (!name) {
      message("Enter an item name");
      return;
    }
    if (url && !safeURL(url)) {
      message("Use an HTTP or HTTPS link");
      return;
    }
    if ($("tag-input").value.trim()) selectTag($("tag-input").value);
    const id = editing;
    change(
      (s) => {
        const tags = [...new Set(chosen.map((t) => addTagTo(s, t)))];
        const fields = {
          name,
          tags,
          priority: $("priority").checked,
          notes: $("notes").value.trim(),
          url,
        };
        if (id)
          Object.assign(
            s.items.find((i) => i.id === id),
            fields,
          );
        else
          s.items.push({
            ...fields,
            id: uid(),
            createdAt: new Date().toISOString(),
            purchasedAt: null,
          });
      },
      () => {
        editor.close();
        message("Item saved");
      },
    );
  };
  $("import").onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const backup = validateBackup(JSON.parse(await file.text()));
      if (
        confirm(
          `Replace all current data with ${backup.items.length} items from this backup?`,
        )
      )
        await change(
          (s) => Object.assign(s, backup),
          () => message("Backup restored"),
        );
    } catch (error) {
      alert(`Could not import backup: ${error.message}`);
    }
  };
  render();
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("./sw.js").catch(console.error);
}
init();
