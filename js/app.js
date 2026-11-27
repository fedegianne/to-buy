import { createBackupTools } from "../backup.js";
import { load, save } from "./db.js";
import * as M from "./model.js";
import { chart } from "./charts.js";
const $ = (s) => document.querySelector(s),
  app = $("#app"),
  modal = $("#modal");
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const attr = esc;
const btn = (label, action, cls = "", value = "") =>
  `<button type="button" class="${cls}" data-action="${action}" data-value="${attr(value)}">${label}</button>`;
const options = (values, selected) =>
  values
    .map(
      ([v, l]) =>
        `<option value="${attr(v)}" ${String(v) === String(selected) ? "selected" : ""}>${esc(l)}</option>`,
    )
    .join("");
const segments = (values, selected, action) =>
  `<div class="segments">${values.map(([v, l]) => btn(esc(l), action, String(v) === String(selected) ? "selected" : "", v)).join("")}</div>`;
const panel = (content) => `<section class="panel">${content}</section>`;
const empty = (content) => `<p class="empty">${esc(content)}</p>`;
const formActions = (label = "Save") =>
  `<div class="actions">${btn("Cancel", "close")}<button class="primary" type="submit">${esc(label)}</button></div>`;
const ranges = [
  ["1", "1M"],
  ["3", "3M"],
  ["6", "6M"],
  ["12", "1Y"],
  ["all", "All"],
];
const prRanges = [
  ["12", "1 year"],
  ["24", "2 years"],
  ["all", "All time"],
];
const restPresets = [30, 60, 90, 120, 150, 180, 210, 240, 300, 360, 420, 600];
let state,
  page = "home",
  selectedDay = M.day(),
  month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let currentEx = null,
  workoutView = "log",
  detailsOpen = false,
  draft = {},
  logGraph = "",
  logRelative = "kg";
let exerciseSearch = "",
  recordSearch = "",
  muscleFilter = "",
  recordMuscle = "",
  showArchived = false;
let recordId = null,
  recordTab = "records",
  prRange = "all",
  graphRange = "6",
  graphMetric = "rm",
  relative = "kg",
  gearFilter = {};
let bwRange = "6",
  editWorkoutId = null,
  pickerContext = null,
  modalSubmit = null,
  modalInput = null,
  modalReturn = null;
let toastTimeout,
  saving = false,
  timerVisualDeadline = null,
  pulseUntil = 0;
const backups = createBackupTools({
  slug: "ultragym",
  name: "UltraGYM",
  version: "1.1.1",
  records: () => ({
    exercises: state.exercises,
    workouts: state.workouts,
    bodyweights: state.bodyweights,
    gear: state.settings.gear,
    muscles: state.settings.muscles,
  }),
  hasRecords: () =>
    Boolean(
      state.exercises.length ||
      state.bodyweights.length ||
      state.workouts.some(
        (w) =>
          w.status === "finished" ||
          w.notes ||
          w.exercises.some((e) => e.sets.length || e.notes),
      ),
    ),
  snapshot: () => state,
  exportNormal: () =>
    downloadFile(
      `ultragym-${M.day()}.json`,
      JSON.stringify(state, null, 2),
      "application/json",
    ),
  restore: () => $("#import-file").click(),
  extraExport: () => exportCSV(),
  refresh: () => render(),
});
const active = () => state.workouts.find((w) => w.id === state.activeId);
const exBy = (id) => state.exercises.find((e) => e.id === id);
const workoutBy = (id) => state.workouts.find((w) => w.id === id);
const entryBy = (w, id) => w?.exercises.find((e) => e.exerciseId === id);
const unit = () => state.settings.unit;
const distanceUnit = () => state.settings.distanceUnit;
const mass = (v) => M.num(M.displayMass(v, state.settings));
const dist = (v) => M.num(M.displayDistance(v, state.settings), 1);
const countSets = (w) => w.exercises.reduce((a, e) => a + e.sets.length, 0);
const gearName = (id) =>
  state.settings.gear.find((g) => g.id === id)?.name || "Unknown equipment";
const sortName = (a, b) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
const pageTitle = (title, action = "") =>
  `<div class="row between"><h1>${esc(title)}</h1>${action}</div>`;
const bodyweightFor = (w) => M.bodyweightAt(state, w.date)?.weight ?? null;
const message = (text) => {
  const t = $("#toast");
  t.textContent = text;
  t.style.display = "block";
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => (t.style.display = "none"), 2600);
};
async function persist() {
  try {
    await save(state);
  } catch (e) {
    alert(
      "Unable to save locally. Export a JSON backup before leaving. " +
        e.message,
    );
    throw e;
  }
}
async function commit(renderAfter = true) {
  await persist();
  if (renderAfter) render();
}
function closeModal() {
  modalSubmit = null;
  modalInput = null;
  modalReturn = null;
  if (modal.open) modal.close();
}
function showModal(html, { submit = null, input = null, onClose = null } = {}) {
  modalSubmit = submit;
  modalInput = input;
  modalReturn = onClose;
  modal.innerHTML = html;
  if (!modal.open) modal.showModal();
}
function dismissModal() {
  const cb = modalReturn;
  closeModal();
  if (cb) cb();
}
function confirmDelete(text) {
  return confirm(text);
}
function navigate(p) {
  page = p;
  if (p === "records") recordId = null;
  render();
  window.scrollTo(0, 0);
}
function icon(name) {
  const paths = {
    home: '<path d="M3 10 12 3l9 7v10h-6v-6H9v6H3Z"/>',
    calendar:
      '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
    records:
      '<path d="M8 3h8v7a4 4 0 0 1-8 0V3Zm0 2H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 2v5m-4 2h8"/>',
    exercises:
      '<path d="m6 6 12 12M3 9l6-6m6 18 6-6M2 6l4-4m12 20 4-4M5 12l7-7m0 14 7-7"/>',
    settings:
      '<circle cx="12" cy="12" r="3"/><path d="m10 2 4 0 1 3 3 1 3-1 2 4-2 3 0 1 2 3-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 2-3v-1L1 9l2-4 3 1 3-1Z"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
}
function render() {
  const expandedSettings = new Set(
    [...app.querySelectorAll("details[data-settings-section][open]")].map(
      (section) => section.dataset.settingsSection,
    ),
  );
  document.documentElement.dataset.theme = state.settings.theme;
  const pages = {
    home,
    workout,
    calendar,
    records: recordsPage,
    exercises: exercisesPage,
    settings: settingsPage,
    bodyweight: bodyweightPage,
    workoutDetail,
  };
  app.innerHTML = (pages[page] || home)();
  if (page === "home") backups.reminder(app);
  if (page === "settings") {
    for (const section of app.querySelectorAll(
      "details[data-settings-section]",
    )) {
      section.open = expandedSettings.has(section.dataset.settingsSection);
    }
    backups.settings($("#common-settings"));
  }
  $("#nav").innerHTML = [
    ["home", "Home"],
    ["calendar", "Calendar"],
    ["records", "Records"],
    ["exercises", "Exercises"],
    ["settings", "Settings"],
  ]
    .map(
      ([p, l]) =>
        `<button data-action="nav" data-value="${p}" ${page === p || (p === "home" && ["workout", "bodyweight"].includes(page)) || (p === "calendar" && page === "workoutDetail") ? 'aria-current="page"' : ""}>${icon(p)}${l}</button>`,
    )
    .join("");
  updateTimer();
}
function workoutSummary(w) {
  return `${w.exercises.filter((e) => e.sets.length).length} exercises · ${countSets(w)} sets`;
}
function home() {
  const w = active(),
    last = state.workouts
      .filter((w) => w.status === "finished")
      .sort(
        (a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt,
      )[0];
  const bw = [...state.bodyweights].sort((a, b) =>
    b.date.localeCompare(a.date),
  )[0];
  return (
    pageTitle("Home") +
    `<small>${esc(new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}</small>` +
    `<section class="panel hero"><h2>${w ? "Workout in progress" : "Start workout"}</h2>${w ? `<p class="muted">${esc(M.dateLabel(w.date))} · ${workoutSummary(w)}</p>${btn(w.date === M.day() ? "Resume workout" : "Review unfinished workout", "resume-home", "wide")}` : btn("＋ Custom workout", "start", "wide")}</section>` +
    panel(
      `<div class="row between"><h2>Bodyweight</h2>${btn("＋ Log weight", "bw-add", "link")}</div><button class="list-button" data-action="bw-page"><div class="grow stack compact"><div class="big">${bw ? `${mass(bw.weight)} ${unit()}` : "—"}</div><small>${bw ? esc(M.dateLabel(bw.date)) : "Optional · no measurements yet"}</small></div><span>›</span></button>`,
    ) +
    `<h2>Last workout</h2>` +
    (last
      ? panel(
          `<button class="list-button" data-action="view-workout" data-value="${attr(last.id)}"><div class="grow stack compact"><strong>${esc(M.dateLabel(last.date))}</strong><span>${esc(
            last.exercises
              .filter((e) => e.sets.length)
              .map((e) => exBy(e.exerciseId)?.name)
              .join(" · "),
          )}</span><small>${workoutSummary(last)}</small></div><span>›</span></button>`,
        )
      : panel(empty("Your completed workouts will appear here.")))
  );
}
async function startWorkout() {
  if (active()) {
    resumeHome();
    return;
  }
  const w = M.newWorkout();
  state.workouts.push(w);
  state.activeId = w.id;
  state.timer.deadline = null;
  currentEx = null;
  page = "workout";
  workoutView = "log";
  resetDraft();
  await commit();
  openPicker({ kind: "live" });
}
function resetDraft() {
  draft = {
    weight: "",
    reps: "",
    distance: "",
    seconds: null,
    effort: "",
    rating: "",
    gear: [],
    notes: "",
  };
  detailsOpen = false;
}
function suggested() {
  const w = active(),
    e = entryBy(w, currentEx),
    idx = e?.sets.length || 0;
  const past = M.sessions(state, currentEx)
    .filter((s) => s.workout.id !== w?.id && s.workout.date <= w?.date)
    .at(-1);
  // The corresponding previous-workout set is preferred, then the preceding
  // current set, then the last available previous-workout set.
  return past?.sets[idx] || e?.sets.at(-1) || past?.sets.at(-1) || null;
}
function selectLiveExercise(id) {
  currentEx = id;
  workoutView = "log";
  logGraph = "";
  resetDraft();
  const e = entryBy(active(), id);
  const prev =
    e?.sets.at(-1) ||
    M.sessions(state, id)
      .filter((s) => s.workout.date <= active().date)
      .at(-1)?.sets[0];
  draft.gear = (prev?.gear || []).filter((g) =>
    state.settings.gear.some((x) => x.id === g && !x.archived),
  );
}
function restoreActive() {
  const w = active();
  if (!w) return;
  page = "workout";
  workoutView = "log";
  selectLiveExercise(w.exercises.at(-1)?.exerciseId || null);
  render();
  if (!currentEx) openPicker({ kind: "live" });
}
function resumeHome() {
  const w = active();
  if (!w) return;
  if (w.date !== M.day()) {
    staleWorkout(w);
    return;
  }
  restoreActive();
}
function staleWorkout(w) {
  showModal(
    `<div class="stack"><h2>Unfinished workout</h2><p>${esc(M.dateLabel(w.date))} · ${workoutSummary(w)}</p><p class="muted">You can finish the previous session or discard it before starting another.</p>${btn("Finish previous workout", "finish-stale", "primary", w.id)}${btn("Discard previous workout", "discard-workout", "danger", w.id)}${btn("Cancel", "close")}</div>`,
  );
}
function metricDefinitions(ex) {
  if (ex.type === "weight")
    return [
      ["volume", "Volume", unit()],
      ["rm", "Est. 1RM", unit()],
      ["sets", "Sets", ""],
      ["reps", "Reps", ""],
    ];
  if (ex.type === "bw")
    return [
      ["reps", "Reps", ""],
      ["bestReps", "Top set", "reps"],
      ["sets", "Sets", ""],
    ];
  if (ex.type === "time")
    return [
      ["seconds", "Total time", ""],
      ["bestTime", "Best time", ""],
      ["sets", "Sets", ""],
    ];
  if (ex.type === "weighttime")
    return [
      ["volume", "Volume", `${unit()}·s`],
      ["top", "Top weight", unit()],
      ["seconds", "Total time", ""],
      ["sets", "Sets", ""],
    ];
  if (ex.type === "distance")
    return [
      ["distance", "Distance", distanceUnit()],
      ["bestDistance", "Best set", distanceUnit()],
      ["sets", "Sets", ""],
    ];
  return [
    ["volume", "Volume", `${unit()}·${distanceUnit()}`],
    ["top", "Top weight", unit()],
    ["distance", "Distance", distanceUnit()],
    ["sets", "Sets", ""],
  ];
}
function metricValue(st, key, ex) {
  const v = st[key];
  if (v == null) return "—";
  if (["rm", "top"].includes(key)) return mass(v);
  if (key === "volume")
    return M.num(
      M.displayMass(v, state.settings) /
        (ex.type === "weightdistance" ? M.distanceFactor(state.settings) : 1),
    );
  if (["seconds", "bestTime"].includes(key)) return M.durationText(v);
  if (["distance", "bestDistance"].includes(key)) return dist(v);
  return M.num(v);
}
function graphMetrics(ex) {
  if (ex.type === "weight")
    return [
      ["rm", "Estimated 1RM"],
      ["top", "Top set weight"],
      ["volume", "Volume"],
      ["sets", "Sets"],
      ["reps", "Repetitions"],
    ];
  return metricDefinitions(ex).map(([k, l]) => [k, l]);
}
const canRelative = (k) => ["volume", "rm", "top"].includes(k);
function metricPoint(st, key, ex, bw, mode) {
  const v = st[key];
  if (v == null) return null;
  if (mode === "bw" && canRelative(key)) {
    if (!(bw > 0)) return null;
    return (
      v /
      bw /
      (ex.type === "weightdistance" && key === "volume"
        ? M.distanceFactor(state.settings)
        : 1)
    );
  }
  if (["rm", "top"].includes(key)) return M.displayMass(v, state.settings);
  if (key === "volume")
    return (
      M.displayMass(v, state.settings) /
      (ex.type === "weightdistance" ? M.distanceFactor(state.settings) : 1)
    );
  if (["distance", "bestDistance"].includes(key))
    return M.displayDistance(v, state.settings);
  return v;
}
function graphUnit(key, ex, mode) {
  if (mode === "bw" && canRelative(key))
    return key === "volume" && ex.type === "weighttime"
      ? "× BW·s"
      : key === "volume" && ex.type === "weightdistance"
        ? `× BW·${distanceUnit()}`
        : "× BW";
  if (["rm", "top"].includes(key)) return unit();
  if (key === "volume")
    return metricDefinitions(ex).find((x) => x[0] === key)?.[2] || unit();
  if (["seconds", "bestTime"].includes(key)) return "s";
  if (["distance", "bestDistance"].includes(key)) return distanceUnit();
  return "";
}
function exerciseGraph(
  ex,
  key,
  mode,
  { recent = false, range = "all", gear = {} } = {},
) {
  let ss = M.sessions(state, ex.id, { includeActive: recent, gear }).filter(
    (s) => s.workout.date >= M.cutoff(range),
  );
  if (recent) ss = ss.slice(-10);
  const points = ss.map((s) => ({
    date: s.workout.date,
    value: metricPoint(
      M.stats(s.sets, ex, s.bw, state.settings),
      key,
      ex,
      s.bw,
      mode,
    ),
    bwDate: mode === "bw" ? s.bwDate : null,
    active: s.workout.status === "active",
  }));
  return (
    chart(points, {
      unit: graphUnit(key, ex, mode),
      key: recent ? "live-chart" : "record-chart",
      empty:
        mode === "bw"
          ? "No matching bodyweight data. Log bodyweight to unlock relative graphs."
          : "No data for this selection.",
    }) +
    (mode === "bw"
      ? "<small>Uses the latest bodyweight measured on or before each session. Missing measurements are omitted. Weighted bodyweight exercises show added load.</small>"
      : "")
  );
}
function statCards(ex, st) {
  return `<div class="stat-grid" style="grid-template-columns:repeat(${metricDefinitions(ex).length},minmax(0,1fr))">${metricDefinitions(
    ex,
  )
    .map(([k, l, u]) => {
      const content = `<span class="muted">${esc(l)}</span><span class="metric">${metricValue(st, k, ex)}</span><span class="muted">${esc(u)}</span>`;
      return [
        "volume",
        "rm",
        "top",
        "seconds",
        "distance",
        "bestReps",
        "bestTime",
        "bestDistance",
      ].includes(k)
        ? btn(
            content,
            "live-graph",
            `stat ${logGraph === k ? "active" : ""}`,
            k,
          )
        : `<div class="stat">${content}</div>`;
    })
    .join("")}</div>`;
}
function timerCard() {
  const t = state.timer.duration;
  const presets = [...new Set([...restPresets, state.settings.rest])].sort(
    (a, b) => a - b,
  );
  return `<section class="panel timer-panel" id="timer-panel"><div class="timer-layout"><div class="stack compact"><small>Rest timer · tap to set</small><button class="timer-number" type="button" data-action="timer-custom" id="timer-number">${M.durationText(t)}</button><small id="timer-status">Ready</small><select aria-label="Default rest duration" id="rest-preset">${options(
    presets.map((v) => [v, M.durationText(v)]),
    state.settings.rest,
  )}</select></div><div class="timer-controls"><button type="button" class="primary timer-wide" data-action="timer-start" id="timer-start">Start</button><button type="button" class="timer-wide" data-action="timer-stop">Stop / reset</button>${btn("−30s", "timer-adjust", "", -30)}${btn("+30s", "timer-adjust", "", 30)}</div></div></section>`;
}
function fieldValue(key, s) {
  if (key === "weight")
    return s
      ? String(Number(M.displayMass(s.weight, state.settings).toFixed(3)))
      : "";
  if (key === "distance")
    return s
      ? String(Math.round(M.displayDistance(s.distance, state.settings)))
      : "";
  return s?.[key] == null ? "" : String(s[key]);
}
function liveField(key, label, suggest, step) {
  return `<div class="log-field"><label for="log-${key}">${esc(label)}</label><div class="row">${btn("−", "adjust", "", `${key}|-${step}`)}<input id="log-${key}" data-draft="${key}" ${key === "weight" ? 'inputmode="decimal" data-decimal' : 'inputmode="numeric" data-integer'} autocomplete="off" value="${attr(draft[key])}" placeholder="${attr(suggest || "—")}" aria-label="${esc(label)}">${btn("+", "adjust", "", `${key}|${step}`)}</div></div>`;
}
function liveFields(ex) {
  const s = suggested();
  return `${M.hasWeight(ex.type) ? liveField("weight", `Weight (${unit()})`, fieldValue("weight", s), state.settings.increment) : ""}${M.hasReps(ex.type) ? liveField("reps", "Repetitions", fieldValue("reps", s), 1) : ""}${M.hasTime(ex.type) ? `<div class="log-field"><label>Duration (mm:ss)</label><div class="row">${btn("−", "set-time-adjust", "", -5)}${btn(M.durationText(draft.seconds ?? s?.seconds ?? 0), "set-time", "time-value")}${btn("+", "set-time-adjust", "", 5)}</div></div>` : ""}${M.hasDistance(ex.type) ? liveField("distance", `Distance (${distanceUnit()})`, fieldValue("distance", s), 1) : ""}`;
}
function gearControls(selected, includeArchived = false) {
  return `<div class="row wrap">${state.settings.gear
    .filter((g) => !g.archived || (includeArchived && selected?.includes(g.id)))
    .map(
      (g) =>
        `<label class="check"><input type="checkbox" name="gear" value="${attr(g.id)}" ${selected?.includes(g.id) ? "checked" : ""}>${esc(g.name)}${g.archived ? " (archived)" : ""}</label>`,
    )
    .join("")}</div>`;
}
function setDetails() {
  return `<div class="stack"><div>${gearControls(draft.gear)}</div><div class="row"><label class="grow">Effort<select data-draft="effort">${options(
    [
      ["", "None"],
      ["RPE", "RPE"],
      ["RIR", "RIR"],
    ],
    draft.effort,
  )}</select></label>${draft.effort ? `<label class="grow">${esc(draft.effort)}<input data-draft="rating" inputmode="${draft.effort === "RIR" ? "numeric" : "decimal"}" ${draft.effort === "RIR" ? "data-integer" : "data-decimal"} value="${attr(draft.rating)}" placeholder="${draft.effort === "RPE" ? "1–10" : "0 or more"}"></label>` : ""}</div><label>Set notes<textarea data-draft="notes" rows="2">${esc(draft.notes)}</textarea></label></div>`;
}
function workout() {
  const w = active();
  if (!w)
    return (
      pageTitle("Workout") + panel(btn("Start workout", "start", "primary"))
    );
  if (w.date !== M.day())
    return (
      pageTitle("Workout") +
      panel(
        `<p>Unfinished workout from ${esc(M.dateLabel(w.date))}</p>${btn("Review workout", "resume-home", "primary")}`,
      )
    );
  const top =
    pageTitle("Workout", btn("Finish", "finish", "primary")) +
    segments(
      [
        ["log", "Log exercise"],
        ["history", "Current workout"],
      ],
      workoutView,
      "workout-view",
    );
  if (workoutView === "history")
    return (
      top +
      workoutEntries(w, true) +
      panel(
        `<label>Workout notes<textarea id="live-workout-notes">${esc(w.notes)}</textarea></label>`,
      ) +
      btn("＋ Add / switch exercise", "picker", "wide")
    );
  const ex = exBy(currentEx);
  if (!ex)
    return (
      top +
      panel(
        empty("Choose your first exercise.") +
          btn("＋ Select exercise", "picker", "primary wide"),
      )
    );
  const sets = entryBy(w, ex.id)?.sets || [],
    st = M.stats(sets, ex, bodyweightFor(w), state.settings);
  const graph = logGraph
    ? panel(
        `<div class="row between"><strong>${esc(graphMetrics(ex).find((x) => x[0] === logGraph)?.[1] || logGraph)}</strong>${btn("✕", "live-graph", "flat", logGraph)}</div>${
          canRelative(logGraph)
            ? segments(
                [
                  ["kg", unit()],
                  ["bw", "× BW"],
                ],
                logRelative,
                "live-relative",
              )
            : ""
        }${exerciseGraph(ex, logGraph, canRelative(logGraph) ? logRelative : "kg", { recent: true })}<small>Last 10 sessions · current session updates as you log.</small>`,
      )
    : "";
  return (
    top +
    `<button class="list-button" data-action="picker"><h1 class="grow ellipsis">${esc(ex.name)}</h1><span>⌄</span></button>` +
    (ex.notes ? `<small class="notes">${esc(ex.notes)}</small>` : "") +
    statCards(ex, st) +
    graph +
    timerCard() +
    panel(
      `<div class="log-layout"><div class="log-fields">${liveFields(ex)}${btn(`Set details ${detailsOpen ? "⌃" : "⌄"}${draft.gear.length ? ` · ${draft.gear.length}` : ""}`, "toggle-details", "flat")}</div><div class="log-right"><button class="primary log-button" data-action="log">LOG</button><small>${sets.length} sets logged</small></div></div>${detailsOpen ? '<hr class="divider">' + setDetails() : ""}`,
    ) +
    `<div class="row between wrap">${btn("Exercise notes", "live-ex-notes", "link")}${btn("Rep records", "live-records", "link")}${btn("History", "live-history", "link")}</div>${btn("＋ Add / switch exercise", "picker", "wide")}`
  );
}
function parseDigits(v, min = 1) {
  if (!/^\d+$/.test(String(v))) throw Error("Enter a whole number.");
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < min)
    throw Error(`Enter a whole number of at least ${min}.`);
  return n;
}
function parseWeight(v) {
  if (String(v).trim() === "" || !/^\d+(?:[.,]\d*)?$|^[.,]\d+$/.test(String(v)))
    throw Error("Enter a valid weight.");
  const n = Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) throw Error("Enter a non-negative weight.");
  return M.inputMass(n, state.settings);
}
function parseEffort(type, rating) {
  if (!type) return null;
  if (String(rating).trim() === "")
    throw Error("Enter the effort value or select None.");
  const n = Number(String(rating).replace(",", "."));
  if (
    !Number.isFinite(n) ||
    (type === "RPE" && (n < 1 || n > 10)) ||
    (type === "RIR" && (!Number.isInteger(n) || n < 0))
  )
    throw Error(
      type === "RPE"
        ? "RPE must be between 1 and 10."
        : "RIR must be a non-negative integer.",
    );
  return { type, value: n };
}
async function logSet() {
  if (saving) return;
  const w = active(),
    ex = exBy(currentEx);
  if (!w || !ex || w.date !== M.day()) return;
  const s = suggested();
  const x = {
    id: M.id(),
    at: Date.now(),
    gear: [...draft.gear],
    effort: parseEffort(draft.effort, draft.rating),
    notes: draft.notes,
  };
  if (M.hasWeight(ex.type))
    x.weight = parseWeight(draft.weight || fieldValue("weight", s));
  if (M.hasReps(ex.type))
    x.reps = parseDigits(draft.reps || fieldValue("reps", s));
  if (M.hasTime(ex.type)) {
    x.seconds = draft.seconds ?? s?.seconds ?? 0;
    if (x.seconds < 1) throw Error("Enter a duration greater than zero.");
  }
  if (M.hasDistance(ex.type))
    x.distance = M.inputDistance(
      parseDigits(draft.distance || fieldValue("distance", s)),
      state.settings,
    );
  let entry = entryBy(w, ex.id);
  if (!entry) {
    entry = { exerciseId: ex.id, sets: [], notes: "" };
    w.exercises.push(entry);
  }
  entry.sets.push(x);
  state.timer = {
    duration: state.settings.rest,
    deadline: Date.now() + state.settings.rest * 1000,
  };
  pulseUntil = 0;
  const gear = [...draft.gear];
  resetDraft();
  draft.gear = gear;
  const record = isNewRecord(w, ex, x);
  saving = true;
  try {
    await commit();
    message(record ? "Set logged · New record" : "Set logged");
  } finally {
    saving = false;
  }
}
// Compare the new performance with prior finished sessions and earlier sets
// of the current workout. No special record is manufactured for failed sets.
function isNewRecord(w, ex, set) {
  const previous = [
    ...M.sessions(state, ex.id)
      .filter((s) => s.workout.id !== w.id && s.workout.date <= w.date)
      .flatMap((s) => s.sets),
    ...(entryBy(w, ex.id)?.sets || []).filter((s) => s.id !== set.id),
  ];
  if (ex.type === "weight")
    return !previous.some((s) => s.reps === set.reps && s.weight >= set.weight);
  if (ex.type === "bw") return !previous.some((s) => s.reps >= set.reps);
  const metric = M.hasTime(ex.type) ? "seconds" : "distance";
  return !previous.some(
    (s) =>
      (!M.hasWeight(ex.type) || s.weight === set.weight) &&
      s[metric] >= set[metric],
  );
}
function openDuration(title, seconds, callback) {
  const m = Math.floor(seconds / 60),
    s = seconds % 60;
  showModal(
    `<form><h2>${esc(title)}</h2><div class="row"><label class="grow">Minutes<input name="minutes" inputmode="numeric" data-integer maxlength="2" value="${String(m).padStart(2, "0")}" required autofocus></label><strong>:</strong><label class="grow">Seconds<input name="seconds" inputmode="numeric" data-integer maxlength="2" value="${String(s).padStart(2, "0")}" required></label></div><small>Minutes 0–99 · seconds 0–59</small>${formActions("Set time")}</form>`,
    {
      submit: async (f) => {
        const m = parseDigits(f.get("minutes"), 0),
          s = parseDigits(f.get("seconds"), 0);
        if (m > 99 || s > 59 || m * 60 + s < 1)
          throw Error("Enter a duration from 00:01 to 99:59.");
        closeModal();
        await callback(m * 60 + s);
      },
    },
  );
}
function remaining() {
  return state.timer.deadline == null
    ? state.timer.duration
    : Math.max(0, Math.ceil((state.timer.deadline - Date.now()) / 1000));
}
function updateTimer() {
  if (!state) return;
  const t = state.timer,
    rem = remaining(),
    done = t.deadline != null && rem === 0;
  const alerting = done && t.acknowledged !== t.deadline;
  if (alerting && !document.hidden && timerVisualDeadline !== t.deadline) {
    timerVisualDeadline = t.deadline;
    pulseUntil = Date.now() + 6000;
  }
  if (!alerting) pulseUntil = 0;
  const root = document.documentElement;
  root.classList?.toggle("rest-screen-alert", alerting && !document.hidden);
  root.classList?.toggle(
    "rest-screen-pulse",
    alerting && !document.hidden && Date.now() < pulseUntil,
  );
  const el = $("#timer-number"),
    p = $("#timer-panel"),
    status = $("#timer-status");
  if (!el || !p || !status) return;
  el.textContent = M.durationText(rem);
  status.textContent = done
    ? "Rest complete"
    : t.deadline != null
      ? "Resting"
      : "Ready";
  p.classList.toggle("rest-done", done);
  $("#timer-start").disabled = t.deadline != null && !done;
}
function acknowledgeRest() {
  if (
    !state ||
    state.timer.deadline == null ||
    remaining() !== 0 ||
    state.timer.acknowledged === state.timer.deadline
  )
    return;
  state.timer.acknowledged = state.timer.deadline;
  pulseUntil = 0;
  updateTimer();
  persist().catch(showError);
}
async function setRest(seconds) {
  state.settings.rest = seconds;
  state.timer = { duration: seconds, deadline: null };
  pulseUntil = 0;
  await commit();
}
async function adjustTimer(delta) {
  const t = state.timer;
  if (t.deadline != null && remaining() > 0) {
    const value = Math.min(5999, Math.max(0, remaining() + delta));
    t.deadline = Date.now() + value * 1000;
    await persist();
    updateTimer();
  } else
    await setRest(Math.max(1, Math.min(5999, state.settings.rest + delta)));
}
function exerciseTypeOptions(selected) {
  return options(Object.entries(M.TYPES), selected);
}
function openPicker(context) {
  pickerContext = context;
  showModal(
    `<div class="stack"><div class="row between"><h2>Select exercise</h2>${btn("✕", "close", "flat")}</div><input id="picker-search" type="search" placeholder="Search or create exercise" autocomplete="off"><div id="picker-results" class="stack"></div></div>`,
    { input: () => renderPicker() },
  );
  renderPicker();
}
function renderPicker() {
  const q = $("#picker-search")?.value.trim() || "";
  const w =
    pickerContext?.kind === "live"
      ? active()
      : workoutBy(pickerContext?.workoutId);
  const list = state.exercises
    .filter(
      (e) => !e.archived && e.name.toLowerCase().includes(q.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(!!entryBy(w, b.id)) - Number(!!entryBy(w, a.id)) ||
        sortName(a, b),
    );
  $("#picker-results").innerHTML =
    (q && !state.exercises.some((e) => e.name.toLowerCase() === q.toLowerCase())
      ? btn(`＋ Create “${esc(q)}”`, "picker-create", "primary wide", q)
      : "") +
    (list.length
      ? list
          .map(
            (e) =>
              `<button class="list-button" data-action="picker-select" data-value="${attr(e.id)}"><div class="grow stack compact"><strong>${esc(e.name)}</strong><small>${esc(M.TYPES[e.type])}${entryBy(w, e.id)?.sets.length ? ` · ${entryBy(w, e.id).sets.length} sets` : ""}</small></div>›</button>`,
          )
          .join("")
      : empty("No matching exercises. Type a name to create one."));
}
async function pickExercise(id) {
  const ctx = pickerContext;
  closeModal();
  if (ctx.kind === "live") {
    selectLiveExercise(id);
    render();
  } else openSetEditor(workoutBy(ctx.workoutId), exBy(id));
}
function openExerciseEditor(ex = null, fromPicker = false, name = "") {
  const used = ex && state.workouts.some((w) => entryBy(w, ex.id)?.sets.length);
  const e = ex || M.newExercise(name);
  showModal(
    `<form><h2>${ex ? "Edit exercise" : "Create exercise"}</h2><label>Name<input name="name" required maxlength="120" value="${attr(e.name)}"></label><label>Measurement type<select name="type" ${used ? "disabled" : ""}>${exerciseTypeOptions(e.type)}</select></label>${used ? "<small>Measurement type cannot change once sets are logged. Create a separate exercise for a different type.</small>" : ""}<label class="check" id="include-bw-label" ${e.type !== "weight" ? "hidden" : ""}><input type="checkbox" name="includesBw" ${e.includesBw ? "checked" : ""}>Include bodyweight in 1RM calculations</label>${fromPicker ? "" : `<label>Primary muscle group<select name="muscle1">${options([["", "None"], ...state.settings.muscles.map((m) => [m, m])], e.muscles[0] || "")}</select></label><label>Secondary muscle group<select name="muscle2">${options([["", "None"], ...state.settings.muscles.map((m) => [m, m])], e.muscles[1] || "")}</select></label><label>Exercise notes<textarea name="notes">${esc(e.notes)}</textarea></label>`}${formActions(fromPicker ? "Create & select" : "Save exercise")}</form>${ex ? `<hr class="divider"><div class="stack">${btn(ex.archived ? "Restore exercise" : "Archive exercise", "archive-exercise", "", ex.id)}${btn("Merge into another exercise", "merge-exercise", "", ex.id)}</div>` : ""}`,
    {
      input: () => {
        const el = modal.querySelector("[name=type]");
        const row = $("#include-bw-label");
        row.hidden = el.value !== "weight";
        row.style.display = row.hidden ? "none" : "";
      },
      submit: async (f) => {
        const n = String(f.get("name")).trim();
        if (!n) throw Error("Enter an exercise name.");
        if (
          state.exercises.some(
            (x) => x.id !== e.id && x.name.toLowerCase() === n.toLowerCase(),
          )
        )
          throw Error("An exercise with this name already exists.");
        const type = used ? e.type : f.get("type");
        Object.assign(e, {
          name: n,
          type,
          includesBw: type === "weight" && f.has("includesBw"),
        });
        if (!fromPicker) {
          e.muscles = [
            ...new Set([f.get("muscle1"), f.get("muscle2")].filter(Boolean)),
          ];
          e.notes = f.get("notes");
        }
        if (!ex) state.exercises.push(e);
        await persist();
        if (fromPicker) await pickExercise(e.id);
        else {
          closeModal();
          render();
        }
      },
    },
  );
  const row = $("#include-bw-label");
  if (row.hidden) row.style.display = "none";
}
function workoutEntries(w, live = false) {
  const items = w.exercises.filter((e) => e.sets.length);
  return items.length
    ? items
        .map((entry) => {
          const ex = exBy(entry.exerciseId),
            st = M.stats(entry.sets, ex, bodyweightFor(w), state.settings);
          return panel(
            `<div class="row between"><h2 class="ellipsis">${esc(ex.name)}</h2><small>${entry.sets.length} sets</small></div>${M.hasReps(ex.type) ? `<small>${st.reps} reps${st.volume != null ? ` · ${metricValue(st, "volume", ex)} ${unit()} volume` : ""}${st.rm != null ? ` · ${mass(st.rm)} ${unit()} est. 1RM` : ""}</small>` : ""}${entry.sets.map((s, i) => `<div class="row"><small>${i + 1}</small><div class="grow stack compact"><strong>${esc(M.formatSet(s, ex, state.settings))}</strong>${setMetadata(s)}</div>${btn("Edit", "edit-set", "", `${w.id}|${ex.id}|${s.id}`)}${btn("✕", "delete-set", "danger flat", `${w.id}|${ex.id}|${s.id}`)}</div>`).join('<hr class="divider">')}${entry.notes ? `<small class="notes">${esc(entry.notes)}</small>` : ""}<div class="row wrap">${btn("Exercise notes", "entry-notes", "link", `${w.id}|${ex.id}`)}${btn(live ? "Log another set" : "＋ Add set", live ? "select-live" : "add-past-set", "link", live ? ex.id : `${w.id}|${ex.id}`)}</div>`,
          );
        })
        .join("")
    : panel(empty("No sets logged yet."));
}
function setMetadata(s) {
  const g =
    s.gear == null
      ? "Equipment not recorded"
      : s.gear.map(gearName).join(" · ");
  return [g, s.effort ? `${s.effort.type} ${s.effort.value}` : "", s.notes]
    .filter(Boolean)
    .map((v) => `<small class="notes">${esc(v)}</small>`)
    .join("");
}
function openSetEditor(w, ex, set = null) {
  const s = set || { gear: [], effort: null, notes: "" };
  const time = s.seconds || 0;
  showModal(
    `<form><h2>${set ? "Edit set" : "Add set"} · ${esc(ex.name)}</h2>${M.hasWeight(ex.type) ? `<label>Weight (${unit()})<input name="weight" inputmode="decimal" data-decimal required value="${set ? attr(fieldValue("weight", s)) : ""}"></label>` : ""}${M.hasReps(ex.type) ? `<label>Repetitions<input name="reps" inputmode="numeric" data-integer required value="${attr(s.reps ?? "")}"></label>` : ""}${M.hasDistance(ex.type) ? `<label>Distance (${distanceUnit()})<input name="distance" inputmode="numeric" data-integer required value="${set ? attr(fieldValue("distance", s)) : ""}"></label>` : ""}${M.hasTime(ex.type) ? `<div class="row"><label class="grow">Minutes<input name="minutes" inputmode="numeric" data-integer required value="${Math.floor(time / 60)}"></label><label class="grow">Seconds<input name="seconds" inputmode="numeric" data-integer required value="${time % 60}"></label></div>` : ""}<label>Equipment</label>${gearControls(s.gear || [], true)}<div class="row"><label class="grow">Effort<select name="effort">${options(
      [
        ["", "None"],
        ["RPE", "RPE"],
        ["RIR", "RIR"],
      ],
      s.effort?.type || "",
    )}</select></label><label class="grow" id="edit-rating">Value<input name="rating" inputmode="decimal" data-decimal value="${attr(s.effort?.value ?? "")}"></label></div><label>Set notes<textarea name="notes">${esc(s.notes)}</textarea></label>${formActions(set ? "Save changes" : "Add set")}</form>`,
    {
      input: () => {
        $("#edit-rating").style.display = modal.querySelector("[name=effort]")
          .value
          ? ""
          : "none";
      },
      submit: async (f) => {
        const selectedGear = f.getAll("gear");
        const x = {
          id: set?.id || M.id(),
          at: set?.at || Date.now(),
          gear:
            set?.gear == null && set && !selectedGear.length
              ? null
              : selectedGear,
          effort: parseEffort(f.get("effort"), f.get("rating")),
          notes: f.get("notes"),
        };
        if (M.hasWeight(ex.type)) x.weight = parseWeight(f.get("weight"));
        if (M.hasReps(ex.type)) x.reps = parseDigits(f.get("reps"));
        if (M.hasDistance(ex.type))
          x.distance = M.inputDistance(
            parseDigits(f.get("distance")),
            state.settings,
          );
        if (M.hasTime(ex.type)) {
          const m = parseDigits(f.get("minutes"), 0),
            s = parseDigits(f.get("seconds"), 0);
          if (m > 99 || s > 59 || m * 60 + s < 1)
            throw Error("Enter a valid duration.");
          x.seconds = m * 60 + s;
        }
        let entry = entryBy(w, ex.id);
        if (!entry) {
          entry = { exerciseId: ex.id, sets: [], notes: "" };
          w.exercises.push(entry);
        }
        if (set) entry.sets = entry.sets.map((s) => (s.id === set.id ? x : s));
        else entry.sets.push(x);
        closeModal();
        await commit();
      },
    },
  );
  $("#edit-rating").style.display = s.effort ? "" : "none";
}
function openEntryNotes(w, ex) {
  let entry = entryBy(w, ex.id);
  showModal(
    `<form><h2>${esc(ex.name)} · workout notes</h2><label>Notes for this session<textarea name="notes">${esc(entry?.notes || "")}</textarea></label>${formActions()}</form>`,
    {
      submit: async (f) => {
        if (!entry) {
          entry = { exerciseId: ex.id, sets: [], notes: "" };
          w.exercises.push(entry);
        }
        entry.notes = f.get("notes");
        closeModal();
        await commit();
      },
    },
  );
}
function newPRs(w) {
  return w.exercises.flatMap((entry) => {
    const ex = exBy(entry.exerciseId);
    const other = M.sessions(state, ex.id).filter(
      (s) => s.workout.id !== w.id && s.workout.date <= w.date,
    );
    const prior = new Map();
    for (const ss of other)
      for (const x of ss.sets)
        if (M.hasReps(ex.type))
          prior.set(x.reps, Math.max(prior.get(x.reps) ?? -1, x.weight ?? 0));
    const best = new Map();
    for (const x of entry.sets)
      if (M.hasReps(ex.type))
        best.set(x.reps, Math.max(best.get(x.reps) ?? -1, x.weight ?? 0));
    return [...best]
      .filter(([r, v]) => v > (prior.get(r) ?? -1))
      .map(
        ([r, v]) =>
          `${ex.name}: ${ex.type === "bw" ? r + " reps" : mass(v) + " " + unit() + " × " + r}`,
      );
  });
}
function finishDialog(w) {
  const prs = newPRs(w);
  showModal(
    `<form><h2>Finish workout</h2><p>${esc(M.dateLabel(w.date))}</p><p>${workoutSummary(w)} · ${w.exercises.reduce((a, e) => a + e.sets.reduce((n, s) => n + (s.reps || 0), 0), 0)} reps</p>${w.exercises
      .filter((e) => e.sets.length)
      .map(
        (e) =>
          `<div class="row between"><strong>${esc(exBy(e.exerciseId).name)}</strong><small>${e.sets.length} sets</small></div>`,
      )
      .join(
        "",
      )}${prs.length ? `<div class="panel"><strong>New repetition records</strong>${prs.map((x) => `<small>☆ ${esc(x)}</small>`).join("")}</div>` : ""}<label>Workout notes<textarea name="notes">${esc(w.notes)}</textarea></label>${formActions("Finish workout")}</form>${btn("Discard workout", "discard-workout", "danger wide", w.id)}`,
    {
      submit: async (f) => {
        if (!countSets(w))
          throw Error("Log at least one set, or discard this empty workout.");
        w.notes = f.get("notes");
        w.status = "finished";
        w.finishedAt = Date.now();
        state.activeId = null;
        state.timer.deadline = null;
        closeModal();
        page = "home";
        await commit();
        message("Workout saved");
      },
    },
  );
}
function calendar() {
  const y = month.getFullYear(),
    m = month.getMonth(),
    start = (new Date(y, m, 1).getDay() + 6) % 7,
    days = new Date(y, m + 1, 0).getDate();
  const ws = state.workouts
    .filter((w) => w.date === selectedDay)
    .sort((a, b) => a.startedAt - b.startedAt);
  return (
    pageTitle("Calendar") +
    panel(
      `<div class="row between">${btn("‹", "month-shift", "", -1)}<strong>${esc(month.toLocaleDateString("en-GB", { month: "long", year: "numeric" }))}</strong>${btn("›", "month-shift", "", 1)}</div><div class="calendar">${["M", "T", "W", "T", "F", "S", "S"].map((x) => `<span class="weekday">${x}</span>`).join("")}${"<span></span>".repeat(start)}${Array.from(
        { length: days },
        (_, i) => {
          const d = M.day(new Date(y, m, i + 1)),
            trained = state.workouts.some((w) => w.date === d && countSets(w));
          return btn(
            `${i + 1}${trained ? '<span class="dot"></span>' : ""}`,
            "calendar-day",
            `${trained ? "trained" : ""} ${d === selectedDay ? "selected" : ""} ${d === M.day() ? "today" : ""}`,
            d,
          );
        },
      ).join(
        "",
      )}</div><div class="row between"><small>${state.workouts.filter((w) => w.status === "finished" && w.date.startsWith(M.day(month).slice(0, 7))).length} completed workouts</small>${btn("Today", "calendar-today", "link")}</div>`,
    ) +
    pageTitle(
      M.dateLabel(selectedDay),
      selectedDay <= M.day() ? btn("＋ Add", "add-past", "", selectedDay) : "",
    ) +
    (ws.length
      ? ws
          .map((w) =>
            panel(
              `<button class="list-button" data-action="view-workout" data-value="${attr(w.id)}"><div class="grow stack compact"><strong>${w.status === "active" ? "Unfinished workout" : "Workout"}</strong><span>${esc(
                w.exercises
                  .filter((e) => e.sets.length)
                  .map((e) => exBy(e.exerciseId).name)
                  .join(" · ") || "No sets yet",
              )}</span><small>${workoutSummary(w)}</small></div>›</button>`,
            ),
          )
          .join("")
      : panel(empty("No workouts on this day.")))
  );
}
function workoutDetail() {
  const w = workoutBy(editWorkoutId);
  if (!w)
    return (
      pageTitle("Workout") + btn("Back to calendar", "nav", "", "calendar")
    );
  return (
    `<div class="row between">${btn("‹ Calendar", "nav", "link", "calendar")}<small>${w.status === "active" ? "In progress" : "Completed"}</small></div>` +
    pageTitle(M.dateLabel(w.date)) +
    panel(
      `<div class="row between"><h2>Workout</h2><small>${workoutSummary(w)}</small></div><div class="row wrap">${btn("Edit details", "edit-workout-meta", "", w.id)}${w.date === M.day() ? btn("Resume", "resume-workout", "primary", w.id) : ""}${btn("Delete", "discard-workout", "danger", w.id)}</div>${w.notes ? `<p class="notes">${esc(w.notes)}</p>` : ""}`,
    ) +
    workoutEntries(w, false) +
    btn("＋ Add exercise / set", "past-picker", "wide", w.id)
  );
}
function viewWorkout(id) {
  const w = workoutBy(id);
  if (!w) return;
  editWorkoutId = id;
  selectedDay = w.date;
  month = new Date(M.date(w.date).getFullYear(), M.date(w.date).getMonth(), 1);
  page = "workoutDetail";
  render();
  window.scrollTo(0, 0);
}
function editWorkoutMeta(w) {
  showModal(
    `<form><h2>Edit workout</h2><label>Date<input type="date" name="date" max="${M.day()}" required value="${attr(w.date)}" ${w.status === "active" ? "disabled" : ""}></label><label>Workout notes<textarea name="notes">${esc(w.notes)}</textarea></label>${formActions()}</form>`,
    {
      submit: async (f) => {
        const d = f.get("date") || w.date;
        if (!M.isDay(d) || d > M.day())
          throw Error("Choose a valid date, not in the future.");
        w.date = d;
        w.notes = f.get("notes");
        closeModal();
        await commit();
      },
    },
  );
}
async function addPast(d) {
  if (!M.isDay(d) || d > M.day()) return;
  const w = M.newWorkout(d);
  w.status = "finished";
  w.finishedAt = w.startedAt;
  state.workouts.push(w);
  await persist();
  viewWorkout(w.id);
  openPicker({ kind: "past", workoutId: w.id });
}
async function resumeWorkout(w) {
  if (w.date !== M.day()) throw Error("Only today’s workouts can be resumed.");
  if (active() && state.activeId !== w.id)
    throw Error("Finish your current workout first.");
  state.activeId = w.id;
  w.status = "active";
  w.finishedAt = null;
  state.timer.deadline = null;
  await persist();
  restoreActive();
}
function summaryRecord(ex, rec) {
  if (ex.type === "weight")
    return [rec.best ? `${mass(rec.best.rm)} ${unit()}` : "—", "Est. 1RM"];
  if (ex.type === "bw")
    return [rec.peak ? `${rec.peak.score} reps` : "—", "Best set"];
  if (M.hasTime(ex.type))
    return [rec.peak ? M.durationText(rec.peak.score) : "—", "Best duration"];
  return [
    rec.peak ? `${dist(rec.peak.score)} ${distanceUnit()}` : "—",
    "Best distance",
  ];
}
function muscleSelect(id, value) {
  return `<select id="${id}" aria-label="Filter by muscle group">${options([["", "All muscle groups"], ...state.settings.muscles.map((m) => [m, m])], value)}</select>`;
}
function recordsList() {
  const list = state.exercises
    .filter(
      (e) =>
        state.workouts.some((w) => entryBy(w, e.id)?.sets.length) &&
        e.name.toLowerCase().includes(recordSearch.toLowerCase()) &&
        (!recordMuscle || e.muscles.includes(recordMuscle)),
    )
    .sort(
      (a, b) => Number(b.favourite) - Number(a.favourite) || sortName(a, b),
    );
  return list.length
    ? list
        .map((e, i) => {
          const [v, l] = summaryRecord(
            e,
            M.records(state, e, { range: prRange }),
          );
          return `${i === 0 && e.favourite ? "<small>FAVOURITES</small>" : i > 0 && list[i - 1].favourite && !e.favourite ? "<small>OTHER EXERCISES</small>" : ""}${panel(`<div class="row">${btn(e.favourite ? "★" : "☆", "favourite", "star flat", e.id)}<button class="list-button grow" data-action="open-record" data-value="${attr(e.id)}"><div class="grow stack compact"><strong>${esc(e.name)}</strong><small>${esc(e.muscles.join(" · "))}${e.archived ? " · Archived" : ""}</small></div><div class="stack compact" style="text-align:right"><strong>${esc(v)}</strong><small>${esc(l)}</small></div><span>›</span></button></div>`)}`;
        })
        .join("")
    : panel(empty("No matching exercise records yet."));
}
function recordsPage() {
  if (recordId) {
    const ex = exBy(recordId);
    if (ex) return recordDetail(ex);
  }
  return (
    pageTitle("Records") +
    `<input type="search" id="record-search" placeholder="Search exercises" value="${attr(recordSearch)}">${muscleSelect("record-muscle", recordMuscle)}${segments(prRanges, prRange, "pr-range")}<div class="stack" id="record-results">${recordsList()}</div>`
  );
}
function filterText() {
  const items = Object.entries(gearFilter).filter(([, v]) => v !== "any");
  return items.length
    ? items
        .map(([g, v]) => `${v === "with" ? "With" : "Without"} ${gearName(g)}`)
        .join(" · ")
    : "All equipment";
}
function recordDetail(ex) {
  const rec = M.records(state, ex, { range: prRange, gear: gearFilter });
  const [v, l] = summaryRecord(ex, rec);
  return (
    `<div class="row between">${btn("‹ Records", "record-back", "link")}${btn(ex.favourite ? "★" : "☆", "favourite", "star flat", ex.id)}</div>` +
    pageTitle(ex.name) +
    segments(
      [
        ["records", "Records"],
        ["graphs", "Graphs"],
        ["history", "History"],
      ],
      recordTab,
      "record-tab",
    ) +
    `<div class="row between"><small class="grow">${esc(filterText())}</small>${btn("Filter", "gear-filter")}</div>` +
    (recordTab === "records"
      ? segments(prRanges, prRange, "pr-range") +
        panel(
          `<small>${esc(l)}</small><div class="big">${esc(v)}</div>${rec.best ? `<small>${esc(M.formatSet(rec.best.set, ex, state.settings))} · ${esc(M.dateLabel(rec.best.session.workout.date))}</small>` : ""}${ex.type === "weight" && rec.reps.find((x) => x.set.reps === 1) ? `<small>Actual 1-rep record: ${mass(rec.reps.find((x) => x.set.reps === 1).set.weight)} ${unit()}</small>` : ""}`,
        ) +
        recordTable(ex, rec)
      : recordTab === "graphs"
        ? graphPage(ex)
        : historyContent(ex, gearFilter))
  );
}
function recordTable(ex, rec) {
  if (!rec.all.length) return panel(empty("No matching sets."));
  if (M.hasReps(ex.type))
    return panel(
      `<h2>Rep records</h2><div class="table-wrap"><table><thead><tr><th>Reps</th>${ex.type === "weight" ? "<th>Best weight</th><th>Est. 1RM</th>" : ""}<th>Date</th><th></th></tr></thead><tbody>${rec.reps.map((x) => `<tr><td>${x.set.reps}</td>${ex.type === "weight" ? `<td><strong>${mass(x.set.weight)} ${unit()}</strong></td><td>${x.rm == null ? "—" : mass(x.rm) + " " + unit()}</td>` : ""}<td>${esc(M.dateLabel(x.session.workout.date))}</td><td>${btn("›", "record-set", "", `${x.session.workout.id}|${ex.id}|${x.set.id}`)}</td></tr>`).join("")}</tbody></table></div><small>Only repetition counts actually performed are shown.</small>`,
    );
  // For timed or distance exercises show the best duration/distance at each
  // actually recorded load, rather than inventing repetition records.
  const best = new Map();
  for (const ss of rec.all)
    for (const s of ss.sets) {
      const key = M.hasWeight(ex.type) ? s.weight : 0,
        score = M.hasTime(ex.type) ? s.seconds : s.distance;
      if (!best.has(key) || score > best.get(key).score)
        best.set(key, { set: s, session: ss, score });
    }
  return panel(
    `<h2>${M.hasTime(ex.type) ? "Duration" : "Distance"} records</h2>${[
      ...best.entries(),
    ]
      .sort((a, b) => a[0] - b[0])
      .map(
        ([, x]) =>
          `<div class="row between"><div class="stack compact"><strong>${esc(M.formatSet(x.set, ex, state.settings))}</strong><small>${esc(M.dateLabel(x.session.workout.date))}</small></div>${btn("›", "record-set", "", `${x.session.workout.id}|${ex.id}|${x.set.id}`)}</div>`,
      )
      .join('<hr class="divider">')}`,
  );
}
function graphPage(ex) {
  const metrics = graphMetrics(ex);
  if (!metrics.some(([k]) => k === graphMetric)) graphMetric = metrics[0][0];
  return panel(
    `${segments(ranges, graphRange, "graph-range")}<select id="graph-metric" aria-label="Graph metric">${options(metrics, graphMetric)}</select>${
      canRelative(graphMetric)
        ? segments(
            [
              ["kg", "Absolute"],
              ["bw", "× BW"],
            ],
            relative,
            "record-relative",
          )
        : ""
    }${exerciseGraph(ex, graphMetric, canRelative(graphMetric) ? relative : "kg", { range: graphRange, gear: gearFilter })}`,
  );
}
function historyContent(ex, filter = {}) {
  const ss = M.sessions(state, ex.id, { gear: filter }).reverse();
  return ss.length
    ? ss
        .map((s) => {
          const st = M.stats(s.sets, ex, s.bw, state.settings);
          return panel(
            `<div class="row between"><h3>${esc(M.dateLabel(s.workout.date))}</h3>${btn("View", "view-workout", "link", s.workout.id)}</div><div class="row wrap">${metricDefinitions(
              ex,
            )
              .filter(([k]) => k !== "sets")
              .map(
                ([k, l, u]) =>
                  `<small>${esc(l)}: <strong>${metricValue(st, k, ex)} ${esc(u)}</strong></small>`,
              )
              .join(
                " · ",
              )}</div><hr class="divider">${s.sets.map((x, i) => `<div class="row"><small>${i + 1}</small><div class="grow stack compact"><strong>${esc(M.formatSet(x, ex, state.settings))}</strong>${setMetadata(x)}</div></div>`).join("")}${s.entry.notes ? `<small class="notes">${esc(s.entry.notes)}</small>` : ""}`,
          );
        })
        .join("")
    : panel(empty("No previous sessions for this exercise."));
}
function liveRecords(history = false) {
  const ex = exBy(currentEx);
  if (!ex) return;
  const rec = M.records(state, ex);
  showModal(
    `<div class="stack"><div class="row between"><h2>${esc(ex.name)} · ${history ? "History" : "Records"}</h2>${btn("✕", "close", "flat")}</div>${history ? historyContent(ex) : recordTable(ex, rec)}</div>`,
  );
}
function showRecordSet(w, ex, s) {
  showModal(
    `<div class="stack"><h2>${esc(ex.name)}</h2><p>${esc(M.dateLabel(w.date))}</p><div class="big">${esc(M.formatSet(s, ex, state.settings))}</div>${setMetadata(s)}${btn("View original workout", "view-workout", "primary", w.id)}${btn("Close", "close")}</div>`,
  );
}
function openGearFilter() {
  showModal(
    `<form><h2>Equipment filter</h2>${state.settings.gear
      .map(
        (g) =>
          `<label>${esc(g.name)}${g.archived ? " (archived)" : ""}<select name="${attr(g.id)}">${options(
            [
              ["any", "Any"],
              ["with", "With"],
              ["without", "Without"],
            ],
            gearFilter[g.id] || "any",
          )}</select></label>`,
      )
      .join(
        "",
      )}<small>Sets with unknown equipment are excluded by specific filters.</small>${formActions("Apply filters")}${btn("Reset filters", "reset-gear-filter", "wide")}</form>`,
    {
      submit: async (f) => {
        gearFilter = Object.fromEntries(f);
        closeModal();
        render();
      },
    },
  );
}
function exerciseList() {
  const list = state.exercises
    .filter(
      (e) =>
        (showArchived || !e.archived) &&
        e.name.toLowerCase().includes(exerciseSearch.toLowerCase()) &&
        (!muscleFilter || e.muscles.includes(muscleFilter)),
    )
    .sort(sortName);
  return list.length
    ? list
        .map((e) =>
          panel(
            `<button class="list-button" data-action="edit-exercise" data-value="${attr(e.id)}"><div class="grow stack compact"><strong>${esc(e.name)}</strong><small>${esc(M.TYPES[e.type])}${e.muscles.length ? " · " + esc(e.muscles.join(" / ")) : ""}${e.archived ? " · Archived" : ""}</small></div>›</button>`,
          ),
        )
        .join("")
    : panel(empty("No exercises found. Create one here or during a workout."));
}
function exercisesPage() {
  return (
    pageTitle("Exercises", btn("＋ Add", "new-exercise", "primary")) +
    `<input id="exercise-search" type="search" placeholder="Search exercises" value="${attr(exerciseSearch)}">${muscleSelect("exercise-muscle", muscleFilter)}<label class="check"><input type="checkbox" id="show-archived" ${showArchived ? "checked" : ""}>Include archived exercises</label><div class="stack" id="exercise-results">${exerciseList()}</div>`
  );
}
function mergeDialog(source) {
  const compatible = state.exercises
    .filter(
      (e) =>
        e.id !== source.id &&
        e.type === source.type &&
        !!e.includesBw === !!source.includesBw,
    )
    .sort(sortName);
  showModal(
    `<form><h2>Merge ${esc(source.name)}</h2><p class="muted">Move all its sets into a matching exercise. The source exercise will be removed. This cannot be undone without a backup.</p>${
      compatible.length
        ? `<label>Merge into<select name="target">${options(
            compatible.map((e) => [e.id, e.name]),
            compatible[0].id,
          )}</select></label>${formActions("Merge histories")}`
        : empty(
            "No compatible exercises. Only the same measurement and bodyweight calculation type can be merged.",
          ) + btn("Close", "close")
    }</form>`,
    {
      submit: async (f) => {
        const target = exBy(f.get("target"));
        if (!target) return;
        if (!confirmDelete(`Merge ${source.name} into ${target.name}?`)) return;
        for (const w of state.workouts) {
          const old = entryBy(w, source.id);
          if (!old) continue;
          const existing = entryBy(w, target.id);
          if (existing) {
            existing.sets = [...existing.sets, ...old.sets].sort(
              (a, b) => a.at - b.at,
            );
            existing.notes = [existing.notes, old.notes]
              .filter(Boolean)
              .join("\n");
            w.exercises = w.exercises.filter((e) => e !== old);
          } else old.exerciseId = target.id;
        }
        target.favourite = target.favourite || source.favourite;
        state.exercises = state.exercises.filter((e) => e.id !== source.id);
        if (currentEx === source.id) currentEx = target.id;
        if (recordId === source.id) recordId = target.id;
        closeModal();
        await commit();
        message("Exercise histories merged");
      },
    },
  );
}
function bodyweightPage() {
  const sorted = [...state.bodyweights].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const points = sorted
    .filter((b) => b.date >= M.cutoff(bwRange))
    .map((b) => ({
      date: b.date,
      value: M.displayMass(b.weight, state.settings),
    }));
  return (
    `<div class="row between">${btn("‹ Home", "nav", "link", "home")}${btn("＋ Log weight", "bw-add", "primary")}</div>` +
    pageTitle("Bodyweight") +
    panel(
      `${segments(ranges, bwRange, "bw-range")}${chart(points, { unit: unit(), key: "bw-chart" })}`,
    ) +
    `<h2>History</h2>` +
    (sorted.length
      ? sorted
          .map((b) =>
            panel(
              `<div class="row"><div class="grow stack compact"><strong>${mass(b.weight)} ${unit()}</strong><small>${esc(M.dateLabel(b.date))}</small>${b.notes ? `<small class="notes">${esc(b.notes)}</small>` : ""}</div>${btn("Edit", "bw-edit", "", b.date)}${btn("✕", "bw-delete", "danger flat", b.date)}</div>`,
            ),
          )
          .join("")
      : panel(empty("No bodyweight entries.")))
  );
}
function bodyweightEditor(existing = null) {
  const d = existing?.date || M.day(),
    b = existing || state.bodyweights.find((b) => b.date === d);
  showModal(
    `<form><h2>${b ? "Edit" : "Log"} bodyweight</h2><label>Date<input type="date" name="date" value="${attr(d)}" max="${M.day()}" required></label><label>Bodyweight (${unit()})<input name="weight" inputmode="decimal" data-decimal required value="${b ? attr(M.displayMass(b.weight, state.settings).toFixed(2)) : ""}"></label><label>Notes (optional)<textarea name="notes">${esc(b?.notes || "")}</textarea></label>${formActions()}</form>`,
    {
      submit: async (f) => {
        const date = f.get("date"),
          weight = parseWeight(f.get("weight"));
        if (!M.isDay(date) || date > M.day() || weight <= 0)
          throw Error("Enter a positive bodyweight and a valid date.");
        if (
          state.bodyweights.some((x) => x.date === date && x !== b) &&
          !confirmDelete("Replace the existing measurement for this date?")
        )
          return;
        state.bodyweights = state.bodyweights.filter(
          (x) => x !== b && x.date !== date,
        );
        state.bodyweights.push({ date, weight, notes: f.get("notes") });
        closeModal();
        await commit();
      },
    },
  );
}
function settingsDisclosure(key, title, content) {
  return `<details class="panel settings-disclosure" data-settings-section="${key}"><summary><h2>${title}</h2></summary><div class="settings-disclosure-body">${content}</div></details>`;
}
function settingsPage() {
  const s = state.settings;
  return (
    pageTitle("Settings") +
    settingsDisclosure(
      "units",
      "Units and calculations",
      `<label>Weight unit<select data-setting="unit">${options(
        [
          ["kg", "kg"],
          ["lb", "lb"],
        ],
        s.unit,
      )}</select></label><label>Distance unit<select data-setting="distanceUnit">${options(
        [
          ["m", "Metres (m)"],
          ["ft", "Feet (ft)"],
        ],
        s.distanceUnit,
      )}</select></label><label>Estimated 1RM formula<select data-setting="formula">${options(
        [
          ["epley", "Epley"],
          ["brzycki", "Brzycki"],
        ],
        s.formula,
      )}</select></label><label>Maximum reps for estimated 1RM<input data-setting="maxReps" inputmode="numeric" data-integer value="${s.maxReps}"></label><small>1–30 reps. Estimates are most reliable for low-repetition sets near failure.</small><label>Weight adjustment increment (${unit()})<input data-setting="increment" inputmode="decimal" data-decimal value="${s.increment}"></label><small>Only affects + / − buttons. Manual weights are unrestricted.</small>`,
    ) +
    settingsDisclosure(
      "equipment",
      "Equipment",
      `<small>Built-in equipment is always available. Archive custom equipment to preserve its history, or permanently delete it.</small>${s.gear.map((g) => `<div class="row between"><span>${esc(g.name)}${g.archived ? " (archived)" : ""}</span>${M.BUILTIN_GEAR.some((x) => x.id === g.id) ? "<small>Built-in</small>" : `<div class="row wrap">${btn(g.archived ? "Restore" : "Archive", "gear-toggle", "", g.id)}${btn("Delete permanently", "gear-delete", "danger", g.id)}</div>`}</div>`).join("")}${btn("＋ Add equipment", "gear-add", "wide")}`,
    ) +
    settingsDisclosure(
      "muscles",
      "Muscle groups",
      `<small>Customize the groups used to classify exercises.</small>${s.muscles.map((m) => `<div class="row between wrap"><span>${esc(m)}</span><div class="row wrap">${btn("Rename", "muscle-rename", "", m)}${btn("Delete", "muscle-delete", "danger", m)}</div></div>`).join("")}${btn("＋ Add muscle group", "muscle-add", "wide")}`,
    ) +
    `<section class="common-settings-card"><h2>Appearance</h2><select data-setting="theme" aria-label="Appearance">${options(
      [
        ["auto", "System"],
        ["light", "Light"],
        ["dark", "Dark"],
      ],
      s.theme,
    )}</select></section><div id="common-settings" class="common-settings"></div><input type="file" id="import-file" accept=".json,application/json" hidden>`
  );
}
function downloadFile(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function exportCSV() {
  const header = [
    "date",
    "workout_id",
    "exercise",
    "type",
    "set",
    "weight_kg",
    "reps",
    "seconds",
    "distance_m",
    "equipment",
    "effort_type",
    "effort_value",
    "set_notes",
    "exercise_notes",
    "workout_notes",
    "bodyweight_kg",
  ];
  const rows = [header];
  for (const w of state.workouts)
    for (const e of w.exercises) {
      const ex = exBy(e.exerciseId);
      e.sets.forEach((s, i) =>
        rows.push([
          w.date,
          w.id,
          ex.name,
          ex.type,
          i + 1,
          s.weight,
          s.reps,
          s.seconds,
          s.distance,
          s.gear?.map(gearName).join("; "),
          s.effort?.type,
          s.effort?.value,
          s.notes,
          e.notes,
          w.notes,
          bodyweightFor(w),
        ]),
      );
    }
  const csv = rows
    .map((r) =>
      r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","),
    )
    .join("\r\n");
  downloadFile(
    `ultragym-workouts-${M.day()}.csv`,
    csv,
    "text/csv;charset=utf-8",
  );
}
async function importJSON(file) {
  const raw = M.validate(JSON.parse(await file.text()));
  if (!confirmDelete("Replace all existing UltraGYM records with this backup?"))
    return;
  state = raw;
  state.timer.deadline = null;
  currentEx = null;
  recordId = null;
  resetDraft();
  await commit();
  message("Backup restored");
}
function showAddGear() {
  showModal(
    `<form><h2>Add equipment</h2><label>Name<input name="name" required maxlength="80"></label>${formActions("Add equipment")}</form>`,
    {
      submit: async (f) => {
        const n = f.get("name").trim();
        if (
          !n ||
          state.settings.gear.some(
            (g) => g.name.toLowerCase() === n.toLowerCase(),
          )
        )
          throw Error("Enter a unique equipment name.");
        state.settings.gear.push({ id: M.id(), name: n, archived: false });
        closeModal();
        await commit();
      },
    },
  );
}
function editMuscle(old = "") {
  showModal(
    `<form><h2>${old ? "Rename" : "Add"} muscle group</h2><label>Name<input name="name" required maxlength="80" value="${attr(old)}"></label>${formActions()}</form>`,
    {
      submit: async (f) => {
        const name = f.get("name").trim();
        if (
          !name ||
          state.settings.muscles.some(
            (m) => m !== old && m.toLowerCase() === name.toLowerCase(),
          )
        )
          throw Error("Enter a unique muscle group name.");
        if (old) {
          state.settings.muscles = state.settings.muscles.map((m) =>
            m === old ? name : m,
          );
          for (const e of state.exercises)
            e.muscles = e.muscles.map((m) => (m === old ? name : m));
          if (muscleFilter === old) muscleFilter = name;
          if (recordMuscle === old) recordMuscle = name;
        } else state.settings.muscles.push(name);
        closeModal();
        await commit();
      },
    },
  );
}
function resolveSet(v) {
  const [w, e, s] = v.split("|");
  const workout = workoutBy(w),
    ex = exBy(e);
  return [workout, ex, entryBy(workout, e)?.sets.find((x) => x.id === s)];
}
async function action(a, v) {
  switch (a) {
    case "nav":
      closeModal();
      navigate(v);
      break;
    case "close":
      dismissModal();
      break;
    case "start":
      await startWorkout();
      break;
    case "resume-home":
      resumeHome();
      break;
    case "finish":
      finishDialog(active());
      break;
    case "finish-stale":
      finishDialog(workoutBy(v));
      break;
    case "discard-workout": {
      const w = workoutBy(v);
      if (!w || !confirmDelete("Delete this workout and all its sets?")) break;
      state.workouts = state.workouts.filter((x) => x !== w);
      if (state.activeId === v) {
        state.activeId = null;
        state.timer.deadline = null;
      }
      closeModal();
      page = page === "workoutDetail" ? "calendar" : "home";
      await commit();
      break;
    }
    case "workout-view":
      workoutView = v;
      render();
      break;
    case "picker":
      openPicker({ kind: "live" });
      break;
    case "past-picker":
      openPicker({ kind: "past", workoutId: v });
      break;
    case "picker-create":
      openExerciseEditor(null, true, v);
      break;
    case "picker-select":
      await pickExercise(v);
      break;
    case "select-live":
      selectLiveExercise(v);
      render();
      break;
    case "toggle-details":
      detailsOpen = !detailsOpen;
      render();
      break;
    case "log":
      await logSet();
      break;
    case "adjust": {
      const [k, d] = v.split("|"),
        s = suggested(),
        val = Number(
          String(draft[k] || fieldValue(k, s) || 0).replace(",", "."),
        );
      draft[k] = String(
        Number(
          Math.max(
            k === "weight" ? 0 : 1,
            (Number.isFinite(val) ? val : 0) + Number(d),
          ).toFixed(3),
        ),
      );
      render();
      break;
    }
    case "set-time":
      openDuration(
        "Set duration",
        draft.seconds ?? suggested()?.seconds ?? 0,
        async (s) => {
          draft.seconds = s;
          render();
        },
      );
      break;
    case "set-time-adjust":
      draft.seconds = Math.max(
        1,
        Math.min(
          5999,
          (draft.seconds ?? suggested()?.seconds ?? 0) + Number(v),
        ),
      );
      render();
      break;
    case "timer-custom":
      openDuration("Rest duration", state.settings.rest, setRest);
      break;
    case "timer-start":
      state.timer = {
        duration: state.settings.rest,
        deadline: Date.now() + state.settings.rest * 1000,
      };
      pulseUntil = 0;
      await persist();
      updateTimer();
      break;
    case "timer-stop":
      state.timer = { duration: state.settings.rest, deadline: null };
      pulseUntil = 0;
      await persist();
      updateTimer();
      break;
    case "timer-adjust":
      await adjustTimer(Number(v));
      break;
    case "live-graph":
      logGraph = logGraph === v ? "" : v;
      render();
      break;
    case "live-relative":
      logRelative = v;
      render();
      break;
    case "live-ex-notes":
      openEntryNotes(active(), exBy(currentEx));
      break;
    case "live-records":
      liveRecords(false);
      break;
    case "live-history":
      liveRecords(true);
      break;
    case "edit-set": {
      const [w, e, s] = resolveSet(v);
      if (s) openSetEditor(w, e, s);
      break;
    }
    case "delete-set": {
      const [w, e, s] = resolveSet(v);
      if (!s || !confirmDelete("Delete this set?")) break;
      const entry = entryBy(w, e.id);
      entry.sets = entry.sets.filter((x) => x.id !== s.id);
      await commit();
      break;
    }
    case "add-past-set": {
      const [w, e] = resolveSet(v);
      openSetEditor(w, e);
      break;
    }
    case "entry-notes": {
      const [w, e] = resolveSet(v);
      openEntryNotes(w, e);
      break;
    }
    case "month-shift":
      month = new Date(month.getFullYear(), month.getMonth() + Number(v), 1);
      selectedDay = M.day(month);
      render();
      break;
    case "calendar-today":
      selectedDay = M.day();
      month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      render();
      break;
    case "calendar-day":
      selectedDay = v;
      render();
      break;
    case "view-workout":
      closeModal();
      viewWorkout(v);
      break;
    case "edit-workout-meta":
      editWorkoutMeta(workoutBy(v));
      break;
    case "add-past":
      await addPast(v);
      break;
    case "resume-workout":
      await resumeWorkout(workoutBy(v));
      break;
    case "favourite": {
      const e = exBy(v);
      e.favourite = !e.favourite;
      await commit();
      break;
    }
    case "open-record":
      recordId = v;
      recordTab = "records";
      gearFilter = {};
      graphMetric = graphMetrics(exBy(v))[0][0];
      render();
      window.scrollTo(0, 0);
      break;
    case "record-back":
      recordId = null;
      gearFilter = {};
      render();
      break;
    case "record-tab":
      recordTab = v;
      render();
      break;
    case "pr-range":
      prRange = v;
      render();
      break;
    case "graph-range":
      graphRange = v;
      render();
      break;
    case "record-relative":
      relative = v;
      render();
      break;
    case "record-set": {
      const [w, e, s] = resolveSet(v);
      if (s) showRecordSet(w, e, s);
      break;
    }
    case "gear-filter":
      openGearFilter();
      break;
    case "reset-gear-filter":
      gearFilter = {};
      closeModal();
      render();
      break;
    case "new-exercise":
      openExerciseEditor();
      break;
    case "edit-exercise":
      openExerciseEditor(exBy(v));
      break;
    case "archive-exercise": {
      const e = exBy(v);
      e.archived = !e.archived;
      closeModal();
      await commit();
      break;
    }
    case "merge-exercise":
      mergeDialog(exBy(v));
      break;
    case "bw-page":
      navigate("bodyweight");
      break;
    case "bw-add":
      bodyweightEditor();
      break;
    case "bw-edit":
      bodyweightEditor(state.bodyweights.find((b) => b.date === v));
      break;
    case "bw-delete":
      if (confirmDelete("Delete this bodyweight measurement?")) {
        state.bodyweights = state.bodyweights.filter((b) => b.date !== v);
        await commit();
      }
      break;
    case "bw-range":
      bwRange = v;
      render();
      break;
    case "theme":
      state.settings.theme = v;
      await commit();
      break;
    case "gear-add":
      showAddGear();
      break;
    case "gear-toggle": {
      const g = state.settings.gear.find((x) => x.id === v);
      if (!g || M.BUILTIN_GEAR.some((x) => x.id === v)) break;
      g.archived = !g.archived;
      if (g.archived) draft.gear = (draft.gear || []).filter((x) => x !== v);
      await commit();
      break;
    }
    case "gear-delete": {
      const g = state.settings.gear.find((x) => x.id === v);
      if (!g || M.BUILTIN_GEAR.some((x) => x.id === v)) break;
      const sets = state.workouts.flatMap((w) =>
        w.exercises.flatMap((e) => e.sets),
      );
      const used = sets.filter((s) => s.gear?.includes(v)).length;
      if (
        !confirmDelete(
          `Permanently delete ${g.name}?${used ? ` This also removes its equipment tag from ${used} logged set(s).` : ""} This cannot be undone.`,
        )
      )
        break;
      for (const s of sets)
        if (s.gear) s.gear = s.gear.filter((id) => id !== v);
      state.settings.gear = state.settings.gear.filter((x) => x.id !== v);
      draft.gear = (draft.gear || []).filter((id) => id !== v);
      delete gearFilter[v];
      await commit();
      break;
    }
    case "muscle-add":
      editMuscle();
      break;
    case "muscle-rename":
      if (state.settings.muscles.includes(v)) editMuscle(v);
      break;
    case "muscle-delete":
      if (
        !state.settings.muscles.includes(v) ||
        !confirmDelete(
          `Delete ${v}? This removes the group from exercises, but does not delete any workout data.`,
        )
      )
        break;
      state.settings.muscles = state.settings.muscles.filter((m) => m !== v);
      for (const e of state.exercises)
        e.muscles = e.muscles.filter((m) => m !== v);
      if (muscleFilter === v) muscleFilter = "";
      if (recordMuscle === v) recordMuscle = "";
      await commit();
      break;
    case "export-json":
      downloadFile(
        `ultragym-${M.day()}.json`,
        JSON.stringify(state, null, 2),
        "application/json",
      );
      break;
    case "export-csv":
      exportCSV();
      break;
    case "import-json":
      $("#import-file").click();
      break;
  }
}
function showError(e) {
  console.error(e);
  alert(e.message || String(e));
}
document.addEventListener("pointerdown", acknowledgeRest, true);
document.addEventListener("keydown", acknowledgeRest, true);
document.addEventListener("click", (e) => {
  const point = e.target.closest("[data-chart]");
  if (point) {
    const label = document.getElementById(point.dataset.chart);
    if (label) label.textContent = point.dataset.point;
    return;
  }
  const b = e.target.closest("[data-action]");
  if (!b || b.disabled) return;
  e.preventDefault();
  action(b.dataset.action, b.dataset.value || "").catch(showError);
});
document.addEventListener("keydown", (e) => {
  if (e.target.matches("[data-chart]") && ["Enter", " "].includes(e.key)) {
    e.preventDefault();
    e.target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }
});
modal.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!modalSubmit || saving) return;
  const fn = modalSubmit,
    f = new FormData(e.target);
  saving = true;
  try {
    await fn(f);
  } catch (err) {
    showError(err);
  } finally {
    saving = false;
  }
});
modal.addEventListener("cancel", (e) => {
  e.preventDefault();
  dismissModal();
});
function cleanInput(t) {
  if (t.hasAttribute("data-integer")) {
    const prev = t.dataset.lastValid ?? "";
    if (!/^\d*$/.test(t.value)) {
      t.value = prev;
    } else t.dataset.lastValid = t.value;
  }
  if (t.hasAttribute("data-decimal")) {
    const prev = t.dataset.lastValid ?? "";
    if (!/^\d*(?:[.,]\d*)?$/.test(t.value)) t.value = prev;
    else t.dataset.lastValid = t.value;
  }
}
document.addEventListener("focusin", (e) => {
  if (e.target.matches("input[data-integer],input[data-decimal]"))
    e.target.dataset.lastValid = e.target.value;
});
document.addEventListener("beforeinput", (e) => {
  const t = e.target;
  if (!t.matches("input[data-integer]") || e.data == null) return;
  if (!/^\d+$/.test(e.data)) e.preventDefault();
});
document.addEventListener("input", (e) => {
  const t = e.target;
  cleanInput(t);
  if (modal.contains(t)) {
    modalInput?.(e);
    return;
  }
  if (t.dataset.draft) {
    draft[t.dataset.draft] = t.value;
    return;
  }
  if (t.id === "record-search") {
    recordSearch = t.value;
    $("#record-results").innerHTML = recordsList();
  }
  if (t.id === "exercise-search") {
    exerciseSearch = t.value;
    $("#exercise-results").innerHTML = exerciseList();
  }
  if (t.id === "live-workout-notes" && active()) {
    active().notes = t.value;
    persist().catch(showError);
  }
});
document.addEventListener("change", async (e) => {
  const t = e.target;
  try {
    if (modal.contains(t)) {
      modalInput?.(e);
      return;
    }
    if (t.name === "gear" && page === "workout") {
      draft.gear = [...app.querySelectorAll("[name=gear]:checked")].map(
        (x) => x.value,
      );
      return;
    }
    if (t.dataset.draft === "effort") {
      draft.effort = t.value;
      draft.rating = "";
      render();
      return;
    }
    if (t.id === "rest-preset") {
      await setRest(Number(t.value));
      return;
    }
    if (t.id === "record-muscle") {
      recordMuscle = t.value;
      render();
      return;
    }
    if (t.id === "exercise-muscle") {
      muscleFilter = t.value;
      render();
      return;
    }
    if (t.id === "show-archived") {
      showArchived = t.checked;
      render();
      return;
    }
    if (t.id === "graph-metric") {
      graphMetric = t.value;
      render();
      return;
    }
    if (t.id === "import-file" && t.files[0]) {
      await importJSON(t.files[0]);
      t.value = "";
      return;
    }
    const k = t.dataset.setting;
    if (k) {
      let value = t.value;
      if (k === "increment") {
        value = Number(value.replace(",", "."));
        if (!Number.isFinite(value) || value <= 0)
          throw Error("Increment must be positive.");
      }
      if (k === "maxReps") {
        value = parseDigits(value);
        if (value > 30) throw Error("Maximum is 30 reps.");
      }
      if (k === "unit" && value !== state.settings.unit) {
        const oldKg = M.inputMass(state.settings.increment, state.settings);
        state.settings.unit = value;
        state.settings.increment = Number(
          M.displayMass(oldKg, state.settings).toFixed(3),
        );
      } else state.settings[k] = value;
      await commit();
    }
  } catch (err) {
    showError(err);
    render();
  }
});
// APPLICATION BOOTSTRAP
try {
  const saved = await load();
  state = saved ? M.validate(saved) : M.defaults();
  void backups.requestPersistence();
  resetDraft();
  render();
  setInterval(updateTimer, 250);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      if (page === "home") backups.reminder(app);
      if (page === "workout" && active()?.date !== M.day()) render();
      else updateTimer();
    }
  });
  if ("serviceWorker" in navigator)
    navigator.serviceWorker
      .register("./sw.js", { updateViaCache: "none" })
      .then((r) => r.update())
      .catch(console.warn);
} catch (e) {
  app.textContent = "Unable to open the local training database: " + e.message;
  console.error(e);
}
