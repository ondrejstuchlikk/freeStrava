// Downloads generated entirely in the browser.

export function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(v) {
  if (v == null) return "";
  if (typeof v === "object") v = JSON.stringify(v);
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** rows: array of objects; columns: array of [header, row => value]. */
export function toCsv(rows, columns) {
  const lines = [columns.map(([h]) => csvCell(h)).join(",")];
  for (const r of rows) lines.push(columns.map(([, f]) => csvCell(f(r))).join(","));
  return "﻿" + lines.join("\r\n"); // BOM so Excel reads UTF-8 names correctly
}
