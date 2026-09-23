// Chart rendering (Chart.js, loaded as a global from the CDN in index.html).
// Colors come from CSS custom properties so light/dark mode stay in one place.

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
  return new Date(d + "T00:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
}
function longDate(d) {
  return new Date(d + "T00:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
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
      datasets: [line("Fitness", "ctl", seriesColor(0)), line("Fatigue", "atl", seriesColor(1))],
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
    label: (c) => ` Form: ${Math.round(c.parsed.y)}`,
  };
  draw(id, {
    type: "line",
    data: {
      labels: series.map((p) => p.day),
      datasets: [{
        label: "Form",
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
    title: (items) => "Week of " + longDate(weeks[items[0].dataIndex].week),
    label: (c) => c.datasetIndex === 1
      ? ` Load: ${Math.round(c.parsed.y)}`
      : ` Typical range: ${Math.round(weeks[c.dataIndex].low)}–${Math.round(weeks[c.dataIndex].high)}`,
  };
  draw(id, {
    type: "bar",
    data: {
      labels: weeks.map((w) => w.week),
      datasets: [
        {
          label: "Typical range (last 3 weeks)",
          data: weeks.map((w) => [w.low, w.high]),
          backgroundColor: css("--range-fill"),
          borderRadius: 4, borderSkipped: false, grouped: false, barPercentage: 0.95, categoryPercentage: 0.95,
        },
        {
          label: "Weekly load",
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
    label: (c) => c.parsed.y ? ` ${c.dataset.label}: ${c.parsed.y.toFixed(digits)} ${unit}` : null,
    footer: (items) => {
      const total = items.reduce((s, c) => s + c.parsed.y, 0);
      return items.length > 1 ? `Total: ${total.toFixed(digits)} ${unit}` : "";
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
