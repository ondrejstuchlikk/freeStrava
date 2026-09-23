// Chart rendering (Chart.js, loaded as a global from the CDN in index.html).
// Colors come from CSS custom properties so light/dark mode stay in one place.
import { t, locale, num } from "./i18n.js";

const charts = new Map();

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function base() {
  const text = css("--text-secondary"), grid = css("--grid");
  Chart.defaults.color = text;
  Chart.defaults.font.family = css("--font-sans") || "system-ui, sans-serif";
  Chart.defaults.font.size = 12;
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { position: "top", align: "start", labels: { boxWidth: 12, boxHeight: 12, useBorderRadius: true, borderRadius: 2 } },
      tooltip: {
        backgroundColor: css("--surface-raised"),
        titleColor: css("--text-primary"),
        bodyColor: css("--text-primary"),
        borderColor: css("--border"),
        borderWidth: 1,
        padding: 10,
        boxPadding: 4,
      },
    },
    scales: {
      x: { grid: { display: false }, border: { color: grid }, ticks: { maxRotation: 0, autoSkipPadding: 16 } },
      y: { grid: { color: grid }, border: { display: false }, beginAtZero: true },
    },
  };
}

function draw(id, config) {
  charts.get(id)?.destroy();
  const canvas = document.getElementById(id);
  charts.set(id, new Chart(canvas, config));
}

const SERIES = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `--series-${n}`);
export const seriesColor = (i) => css(SERIES[i]);

function shortDate(d) {
  return new Date(d + "T00:00:00Z").toLocaleDateString(locale(), { day: "numeric", month: "short", timeZone: "UTC" });
}
function longDate(d) {
  return new Date(d + "T00:00:00Z").toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Fitness (CTL) and fatigue (ATL) lines. */
export function drawFitness(id, series) {
  const opts = base();
  opts.plugins.tooltip.callbacks = {
    title: (items) => longDate(series[items[0].dataIndex].day),
    label: (c) => ` ${c.dataset.label}: ${Math.round(c.parsed.y)}`,
  };
  opts.scales.x.ticks.callback = (_, i) => shortDate(series[i].day);
  const line = (label, key, color) => ({
    label, data: series.map((p) => p[key]), borderColor: color, backgroundColor: color,
    borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.2,
  });
  draw(id, {
    type: "line",
    data: {
      labels: series.map((p) => p.day),
      datasets: [line(t("chart.fitness"), "ctl", seriesColor(0)), line(t("chart.fatigue"), "atl", seriesColor(1))],
    },
    options: opts,
  });
}

/** Form (TSB): above zero = fresh, below = fatigued. */
export function drawForm(id, series) {
  const opts = base();
  opts.plugins.legend.display = false;
  opts.scales.y.beginAtZero = false;
  opts.scales.y.grid.color = (c) => (c.tick.value === 0 ? css("--text-muted") : css("--grid"));
  opts.scales.x.ticks.callback = (_, i) => shortDate(series[i].day);
  opts.plugins.tooltip.callbacks = {
    title: (items) => longDate(series[items[0].dataIndex].day),
    label: (c) => ` ${t("chart.form")}: ${Math.round(c.parsed.y)}`,
  };
  draw(id, {
    type: "line",
    data: {
      labels: series.map((p) => p.day),
      datasets: [{
        label: t("chart.form"),
        data: series.map((p) => p.tsb),
        borderColor: css("--text-secondary"),
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.2,
        fill: { target: { value: 0 }, above: css("--fresh-fill"), below: css("--tired-fill") },
      }],
    },
    options: opts,
  });
}

/** Weekly training load with the "typical range" band behind each bar. */
export function drawWeeklyLoad(id, weeks) {
  const opts = base();
  opts.scales.x.stacked = false;
  opts.scales.x.ticks.callback = (_, i) => shortDate(weeks[i].week);
  opts.plugins.tooltip.callbacks = {
    title: (items) => t("chart.weekOf", { d: longDate(weeks[items[0].dataIndex].week) }),
    label: (c) => c.datasetIndex === 1
      ? ` ${t("chart.load")}: ${Math.round(c.parsed.y)}`
      : ` ${t("chart.range")}: ${Math.round(weeks[c.dataIndex].low)}–${Math.round(weeks[c.dataIndex].high)}`,
  };
  draw(id, {
    type: "bar",
    data: {
      labels: weeks.map((w) => w.week),
      datasets: [
        {
          label: t("chart.rangeLegend"),
          data: weeks.map((w) => [w.low, w.high]),
          backgroundColor: css("--range-fill"),
          borderRadius: 4, borderSkipped: false, grouped: false, barPercentage: 0.95, categoryPercentage: 0.95,
        },
        {
          label: t("chart.weeklyLoad"),
          data: weeks.map((w) => w.load),
          backgroundColor: seriesColor(0),
          borderRadius: 4, borderSkipped: "start", grouped: false, barPercentage: 0.45, categoryPercentage: 0.95,
        },
      ],
    },
    options: opts,
  });
}

/**
 * Stacked volume bars by sport. sportColors maps sport → CSS color so a
 * sport keeps its color when filters change.
 */
export function drawVolume(id, vol, { unit, labelFor, sportColors, sportLabel }) {
  const opts = base();
  opts.scales.x.stacked = true;
  opts.scales.y.stacked = true;
  opts.scales.x.ticks.callback = (_, i) => labelFor(vol.keys[i]);
  const digits = unit === "" ? 0 : 1;
  opts.plugins.tooltip.callbacks = {
    title: (items) => labelFor(vol.keys[items[0].dataIndex], true),
    label: (c) => c.parsed.y ? ` ${c.dataset.label}: ${num(c.parsed.y, digits)} ${unit}` : null,
    footer: (items) => {
      const total = items.reduce((s, c) => s + c.parsed.y, 0);
      return items.length > 1 ? `${t("chart.total")}: ${num(total, digits)} ${unit}` : "";
    },
  };
  const surface = css("--surface");
  draw(id, {
    type: "bar",
    data: {
      labels: vol.keys,
      datasets: vol.sports.map((s) => ({
        label: sportLabel(s),
        data: vol.values[s],
        backgroundColor: sportColors[s],
        borderColor: surface,
        borderWidth: { top: 2 },
        borderSkipped: "start",
        borderRadius: 2,
      })),
    },
    options: opts,
  });
}

// ---------- single-activity stream charts (synced crosshair) ----------

/**
 * Stacked line charts sharing one x axis (km or minutes). Hovering/touching
 * any chart moves a crosshair on all of them and calls onHover(x | null).
 * defs: [{id, key, label, color, fmt(v), reverse, fill, min, max}]
 */
export function drawStreams(defs, series, onHover) {
  const group = { x: null, charts: [], raf: 0 };
  const redraw = () => {
    cancelAnimationFrame(group.raf);
    group.raf = requestAnimationFrame(() => group.charts.forEach((c) => c.draw()));
  };
  const setX = (x) => {
    if (x === group.x) return;
    group.x = x;
    onHover?.(x);
    redraw();
  };
  const crosshair = {
    id: "crosshair",
    afterEvent(chart, args) {
      const e = args.event;
      if (e.type === "mouseout") return setX(null);
      if (!["mousemove", "touchmove", "touchstart", "click"].includes(e.type)) return;
      const { left, right } = chart.chartArea;
      if (e.x < left || e.x > right) return;
      setX(chart.scales.x.getValueForPixel(e.x));
    },
    afterDatasetsDraw(chart) {
      if (group.x == null) return;
      const px = chart.scales.x.getPixelForValue(group.x);
      const { top, bottom } = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = css("--text-secondary");
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, bottom); ctx.stroke();
      ctx.restore();
    },
  };

  const xmin = series.x[0], xmax = series.x.at(-1);
  const unit = series.xKind === "km" ? " km" : " min";
  for (const d of defs) {
    const opts = base();
    opts.plugins.legend.display = false;
    opts.plugins.tooltip.enabled = false;
    opts.interaction = { mode: "nearest", axis: "x", intersect: false };
    opts.events = ["mousemove", "mouseout", "click", "touchstart", "touchmove"];
    opts.layout = { padding: { right: 4 } };
    opts.scales.x = {
      type: "linear", min: xmin, max: xmax,
      grid: { display: false }, border: { color: css("--grid") },
      ticks: { maxTicksLimit: 7, callback: (v) => `${num(v, Number.isInteger(v) ? 0 : 1)}${unit}` },
    };
    opts.scales.y.beginAtZero = false;
    opts.scales.y.reverse = !!d.reverse;
    opts.scales.y.ticks = { maxTicksLimit: 4, callback: (v) => d.fmt(v) };
    if (d.min != null) opts.scales.y.suggestedMin = d.min;
    if (d.max != null) opts.scales.y.max = d.max;
    const color = d.color;
    // Fill down to the data's own minimum (not to the axis edge, which can
    // produce stray polygons when the scale is not zero-based).
    const vals = series[d.key].filter((v) => v != null);
    const floor = vals.length ? Math.min(...vals) : 0;
    draw(d.id, {
      type: "line",
      data: {
        datasets: [{
          data: series.x.map((x, i) => ({ x, y: series[d.key][i] })),
          borderColor: color,
          backgroundColor: d.fill ? color + "33" : color,
          fill: d.fill ? { target: { value: floor } } : false,
          borderWidth: 1.5, pointRadius: 0, tension: 0.25, spanGaps: false,
        }],
      },
      options: opts,
      plugins: [crosshair],
    });
    group.charts.push(charts.get(d.id));
  }
  return { setX };
}

/** Best power for each duration (line over log-spaced category axis). */
export function drawPowerCurve(id, curve) {
  const opts = base();
  opts.plugins.legend.display = false;
  opts.scales.y.beginAtZero = false;
  const label = (s) => (s < 60 ? `${s}s` : s < 3600 ? `${s / 60}min` : `${s / 3600}h`);
  opts.plugins.tooltip.callbacks = { label: (c) => ` ${Math.round(c.parsed.y)} W` };
  draw(id, {
    type: "line",
    data: {
      labels: curve.map((p) => label(p.sec)),
      datasets: [{ data: curve.map((p) => p.watts), borderColor: seriesColor(0), backgroundColor: seriesColor(0), borderWidth: 2, pointRadius: 3, tension: 0.3 }],
    },
    options: opts,
  });
}
