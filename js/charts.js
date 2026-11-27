import { date, dateLabel, num } from "./model.js";
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
// Actual dates, not ordinal workout numbers. Multiple sessions on the same day
// retain their individual values. Each point is keyboard- and touch-selectable.
export function chart(
  points,
  { unit = "", key = "chart", empty = "No data for this selection." } = {},
) {
  const p = points
    .filter((x) => Number.isFinite(x.value))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!p.length) return `<p class="empty">${esc(empty)}</p>`;
  const W = 340,
    H = 176,
    L = 50,
    R = 12,
    T = 14,
    B = 32;
  const times = p.map((x) => date(x.date).getTime());
  const t0 = Math.min(...times),
    t1 = Math.max(...times);
  const low = Math.min(...p.map((x) => x.value)),
    high = Math.max(...p.map((x) => x.value));
  const pad = Math.max((high - low) * 0.12, Math.abs(high) * 0.025, 0.02);
  const min = Math.max(0, low - pad),
    max = high + pad;
  const x = (i) =>
    t1 === t0
      ? (L + W - R) / 2
      : L + ((times[i] - t0) / (t1 - t0)) * (W - L - R);
  const y = (v) => T + ((max - v) / (max - min || 1)) * (H - T - B);
  const fmt = (v) => num(v, unit === "× BW" ? 2 : 1);
  const ticks = Array.from(
    { length: 4 },
    (_, i) => min + ((max - min) * i) / 3,
  );
  const dates = [
    t0,
    ...(t1 - t0 > 86400000 * 4 ? [(t0 + t1) / 2] : []),
    ...(t1 !== t0 ? [t1] : []),
  ];
  const short = (t) =>
    new Date(t).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      ...(t1 - t0 > 86400000 * 365 ? { year: "2-digit" } : {}),
    });
  const pointLabels = p.map(
    (q) =>
      `${dateLabel(q.date)}: ${fmt(q.value)} ${unit}${q.bwDate ? " · BW from " + dateLabel(q.bwDate) : ""}${q.active ? " · in progress" : ""}`,
  );
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="group" aria-label="Progress over time">
    ${ticks.map((v) => `<line class="gridline" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 5}" y="${y(v) + 3}" text-anchor="end">${esc(fmt(v))}</text>`).join("")}
    ${p.length > 1 ? `<polyline class="series" points="${p.map((q, i) => `${x(i)},${y(q.value)}`).join(" ")}"/>` : ""}
    ${p.map((q, i) => `<circle cx="${x(i)}" cy="${y(q.value)}" r="${q.active ? 4.5 : 3}"/><circle class="hit" tabindex="0" role="button" aria-label="${esc(pointLabels[i])}" data-chart="${esc(key)}" data-point="${esc(pointLabels[i])}" cx="${x(i)}" cy="${y(q.value)}" r="11"><title>${esc(pointLabels[i])}</title></circle>`).join("")}
    ${dates.map((t, i) => `<text x="${t0 === t1 ? (L + W - R) / 2 : L + ((t - t0) / (t1 - t0)) * (W - L - R)}" y="${H - 10}" text-anchor="${dates.length === 1 ? "middle" : i === 0 ? "start" : i === dates.length - 1 ? "end" : "middle"}">${esc(short(t))}</text>`).join("")}
  </svg><div class="chart-caption" id="${esc(key)}">${esc(pointLabels[pointLabels.length - 1])}</div>`;
}
