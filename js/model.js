export const TYPES = {
  weight: "Weight × reps",
  bw: "Bodyweight × reps",
  time: "Time",
  weighttime: "Weight × time",
  distance: "Distance",
  weightdistance: "Weight × distance",
};
export const MUSCLES = [
  "Chest",
  "Back",
  "Shoulders",
  "Triceps",
  "Biceps",
  "Forearms",
  "Quadriceps",
  "Hamstrings",
  "Glutes",
  "Calves",
  "Abdominals",
  "Traps",
  "Lower back",
  "Adductors",
  "Abductors",
];
export const BUILTIN_GEAR = [
  { id: "belt", name: "Belt" },
  { id: "straps", name: "Straps" },
  { id: "wraps", name: "Wrist wraps" },
];
export const id = () => crypto.randomUUID();
export const day = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const date = (s) => new Date(`${s}T12:00:00`);
export const dateLabel = (s) =>
  date(s).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
export const isDay = (s) =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && day(date(s)) === s;
export const durationText = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
export const num = (v, digits = 2) =>
  Number.isFinite(v)
    ? v.toLocaleString("en-GB", { maximumFractionDigits: digits })
    : "—";
export const massFactor = (settings) =>
  settings.unit === "lb" ? 0.45359237 : 1;
export const distanceFactor = (settings) =>
  settings.distanceUnit === "ft" ? 0.3048 : 1;
export const displayMass = (v, s) => v / massFactor(s);
export const displayDistance = (v, s) => v / distanceFactor(s);
export const inputMass = (v, s) => v * massFactor(s);
export const inputDistance = (v, s) => v * distanceFactor(s);
export const hasWeight = (type) =>
  ["weight", "weighttime", "weightdistance"].includes(type);
export const hasReps = (type) => ["weight", "bw"].includes(type);
export const hasTime = (type) => ["time", "weighttime"].includes(type);
export const hasDistance = (type) =>
  ["distance", "weightdistance"].includes(type);
export const defaults = () => ({
  version: 1,
  exercises: [],
  workouts: [],
  bodyweights: [],
  activeId: null,
  settings: {
    theme: "auto",
    unit: "kg",
    distanceUnit: "m",
    formula: "epley",
    maxReps: 10,
    increment: 2.5,
    rest: 180,
    muscles: [...MUSCLES],
    gear: BUILTIN_GEAR.map((g) => ({ ...g, archived: false })),
  },
  timer: { deadline: null, duration: 180 },
});
export function newExercise(name, type = "weight") {
  return {
    id: id(),
    name,
    type,
    includesBw: false,
    muscles: [],
    notes: "",
    favourite: false,
    archived: false,
  };
}
export function newWorkout(d = day()) {
  return {
    id: id(),
    date: d,
    startedAt: Date.now(),
    finishedAt: null,
    status: "active",
    notes: "",
    exercises: [],
    program: null,
  };
}
export function bodyweightAt(state, d) {
  return (
    state.bodyweights
      .filter((b) => b.date <= d)
      .sort((a, b) => b.date.localeCompare(a.date))[0] || null
  );
}
export function estimated(set, ex, bw, settings) {
  if (
    ex.type !== "weight" ||
    !Number.isInteger(set.reps) ||
    set.reps < 1 ||
    set.reps > settings.maxReps
  )
    return null;
  if (set.reps === 1) return set.weight;
  if (ex.includesBw && !(bw > 0)) return null;
  const base = ex.includesBw ? bw : 0;
  const w = set.weight + base;
  const r = set.reps;
  const result =
    settings.formula === "brzycki" ? (36 * w) / (37 - r) : w * (1 + r / 30);
  return result - base;
}
export function setVolume(set, ex) {
  if (ex.type === "weight") return set.weight * set.reps;
  if (ex.type === "weighttime") return set.weight * set.seconds;
  if (ex.type === "weightdistance") return set.weight * set.distance;
  return null;
}
export function stats(sets, ex, bw, settings) {
  const rms = sets
    .map((s) => estimated(s, ex, bw, settings))
    .filter(Number.isFinite);
  const weights = sets.map((s) => s.weight).filter(Number.isFinite);
  const volumes = sets.map((s) => setVolume(s, ex)).filter(Number.isFinite);
  return {
    sets: sets.length,
    reps: sets.reduce((a, s) => a + (s.reps || 0), 0),
    seconds: sets.reduce((a, s) => a + (s.seconds || 0), 0),
    distance: sets.reduce((a, s) => a + (s.distance || 0), 0),
    volume: volumes.length ? volumes.reduce((a, v) => a + v, 0) : null,
    rm: rms.length ? Math.max(...rms) : null,
    top: weights.length ? Math.max(...weights) : null,
    bestReps: sets.length ? Math.max(...sets.map((s) => s.reps || 0)) : null,
    bestTime: sets.length ? Math.max(...sets.map((s) => s.seconds || 0)) : null,
    bestDistance: sets.length
      ? Math.max(...sets.map((s) => s.distance || 0))
      : null,
  };
}
export function sessions(
  state,
  exId,
  { includeActive = false, gear = {} } = {},
) {
  return state.workouts
    .filter((w) => includeActive || w.status === "finished")
    .flatMap((w) => {
      const entry = w.exercises.find((e) => e.exerciseId === exId);
      if (!entry) return [];
      const sets = entry.sets.filter((s) =>
        Object.entries(gear).every(
          ([k, v]) =>
            v === "any" ||
            (Array.isArray(s.gear) &&
              (v === "with" ? s.gear.includes(k) : !s.gear.includes(k))),
        ),
      );
      if (!sets.length) return [];
      const bw = bodyweightAt(state, w.date);
      return [
        {
          workout: w,
          entry,
          sets,
          bw: bw?.weight ?? null,
          bwDate: bw?.date ?? null,
        },
      ];
    })
    .sort(
      (a, b) =>
        a.workout.date.localeCompare(b.workout.date) ||
        a.workout.startedAt - b.workout.startedAt,
    );
}
export function cutoff(range, today = day()) {
  if (range === "all") return "0000-00-00";
  const d = date(today),
    n = Number(range),
    original = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  d.setDate(
    Math.min(
      original,
      new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(),
    ),
  );
  return day(d);
}
export function records(state, ex, opts = {}) {
  const all = sessions(state, ex.id, opts).filter(
    (s) => s.workout.date >= cutoff(opts.range || "all"),
  );
  const reps = new Map();
  let best = null,
    peak = null;
  for (const session of all)
    for (const set of session.sets) {
      const item = {
        set,
        session,
        rm: estimated(set, ex, session.bw, state.settings),
      };
      if (Number.isFinite(item.rm) && (!best || item.rm > best.rm)) best = item;
      const score =
        ex.type === "bw"
          ? set.reps
          : hasTime(ex.type)
            ? set.seconds
            : hasDistance(ex.type)
              ? set.distance
              : set.weight;
      if (!peak || score > peak.score) peak = { ...item, score };
      if (hasReps(ex.type)) {
        const existing = reps.get(set.reps);
        if (!existing || (set.weight ?? 0) > (existing.set.weight ?? 0))
          reps.set(set.reps, item);
      }
    }
  return {
    all,
    best,
    peak,
    reps: [...reps.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v),
  };
}
export function formatSet(s, ex, settings) {
  const w = hasWeight(ex.type)
    ? `${num(displayMass(s.weight, settings))} ${settings.unit}`
    : "";
  const q = hasReps(ex.type)
    ? `${s.reps} reps`
    : hasTime(ex.type)
      ? durationText(s.seconds)
      : `${num(displayDistance(s.distance, settings), 1)} ${settings.distanceUnit}`;
  return [w, q].filter(Boolean).join(" × ");
}
export function validate(raw) {
  const fail = () => {
    throw new Error("Invalid or unsupported UltraGYM backup.");
  };
  if (
    !raw ||
    raw.version !== 1 ||
    !Array.isArray(raw.exercises) ||
    !Array.isArray(raw.workouts) ||
    !Array.isArray(raw.bodyweights) ||
    !raw.settings
  )
    fail();
  const d = defaults();
  const s = { ...d.settings, ...raw.settings };
  if (
    !["auto", "light", "dark"].includes(s.theme) ||
    !["kg", "lb"].includes(s.unit) ||
    !["m", "ft"].includes(s.distanceUnit) ||
    !["epley", "brzycki"].includes(s.formula) ||
    !Number.isInteger(s.maxReps) ||
    s.maxReps < 1 ||
    s.maxReps > 30 ||
    !Number.isFinite(s.increment) ||
    s.increment <= 0 ||
    !Number.isInteger(s.rest) ||
    s.rest < 1 ||
    s.rest > 5999 ||
    !Array.isArray(s.gear)
  )
    fail();
  if (
    !Array.isArray(s.muscles) ||
    s.muscles.some((m) => typeof m !== "string" || !m.trim())
  )
    fail();
  s.muscles = [...new Set(s.muscles)];
  const gearIds = new Set();
  for (const g of s.gear) {
    if (
      !g ||
      typeof g.id !== "string" ||
      typeof g.name !== "string" ||
      !g.name.trim() ||
      gearIds.has(g.id)
    )
      fail();
    gearIds.add(g.id);
  }
  for (const g of BUILTIN_GEAR) {
    const old = s.gear.find((x) => x.id === g.id);
    if (old) Object.assign(old, g, { archived: false });
    else s.gear.unshift({ ...g, archived: false });
  }
  const exs = new Map(),
    names = new Set();
  for (const e of raw.exercises) {
    if (
      !e ||
      typeof e.id !== "string" ||
      exs.has(e.id) ||
      typeof e.name !== "string" ||
      !e.name.trim() ||
      names.has(e.name.trim().toLowerCase()) ||
      !Object.hasOwn(TYPES, e.type)
    )
      fail();
    exs.set(e.id, e);
    names.add(e.name.trim().toLowerCase());
    e.muscles = Array.isArray(e.muscles)
      ? e.muscles.filter((m) => s.muscles.includes(m)).slice(0, 2)
      : [];
    e.notes = typeof e.notes === "string" ? e.notes : "";
  }
  const workIds = new Set(),
    setIds = new Set();
  for (const w of raw.workouts) {
    if (
      !w ||
      typeof w.id !== "string" ||
      workIds.has(w.id) ||
      !isDay(w.date) ||
      !Number.isFinite(w.startedAt) ||
      !["active", "finished"].includes(w.status) ||
      !Array.isArray(w.exercises)
    )
      fail();
    workIds.add(w.id);
    const seen = new Set();
    for (const entry of w.exercises) {
      const e = exs.get(entry?.exerciseId);
      if (!e || seen.has(e.id) || !Array.isArray(entry.sets)) fail();
      seen.add(e.id);
      for (const x of entry.sets) {
        if (
          !x ||
          typeof x.id !== "string" ||
          setIds.has(x.id) ||
          !Number.isFinite(x.at)
        )
          fail();
        setIds.add(x.id);
        if (hasWeight(e.type) && (!Number.isFinite(x.weight) || x.weight < 0))
          fail();
        if (hasReps(e.type) && (!Number.isInteger(x.reps) || x.reps < 1))
          fail();
        if (hasTime(e.type) && (!Number.isInteger(x.seconds) || x.seconds < 1))
          fail();
        if (
          hasDistance(e.type) &&
          (!Number.isFinite(x.distance) || x.distance <= 0)
        )
          fail();
        if (
          x.gear != null &&
          (!Array.isArray(x.gear) || x.gear.some((g) => typeof g !== "string"))
        )
          fail();
        if (
          x.effort != null &&
          (!["RPE", "RIR"].includes(x.effort.type) ||
            !Number.isFinite(x.effort.value) ||
            x.effort.value < 0 ||
            (x.effort.type === "RPE" &&
              (x.effort.value < 1 || x.effort.value > 10)) ||
            (x.effort.type === "RIR" && !Number.isInteger(x.effort.value)))
        )
          fail();
      }
    }
  }
  const dates = new Set();
  for (const b of raw.bodyweights) {
    if (
      !b ||
      !isDay(b.date) ||
      dates.has(b.date) ||
      !Number.isFinite(b.weight) ||
      b.weight <= 0
    )
      fail();
    dates.add(b.date);
  }
  const active = raw.workouts.filter((w) => w.status === "active");
  if (
    active.length > 1 ||
    (active.length === 1 && raw.activeId !== active[0].id) ||
    (!active.length && raw.activeId != null)
  )
    fail();
  const t = raw.timer || d.timer;
  if (
    !Number.isInteger(t.duration) ||
    t.duration < 1 ||
    t.duration > 5999 ||
    !(t.deadline === null || Number.isFinite(t.deadline))
  )
    fail();
  return { ...d, ...raw, settings: s, timer: t };
}
