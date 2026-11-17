import React from "react";
import { ksh } from "./reportText";

// Plain inline-SVG/CSS charts: no chart library, so they print crisply into the PDF.
const PALETTE = ["#c8961a", "#1d2026", "#8a8f98", "#e3c06a", "#4b5563", "#b45309"];

export function Donut({ title, items }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (!total) return null;
  const R = 38, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="or-chart">
      <div className="or-chart-t">{title}</div>
      <div className="or-donut">
        <svg viewBox="0 0 100 100" width="110" height="110" role="img" aria-label={title}>
          <circle cx="50" cy="50" r={R} fill="none" stroke="#eef0f2" strokeWidth="16" />
          {items.map((it, i) => {
            const len = (it.value / total) * C;
            const seg = <circle key={it.label} cx="50" cy="50" r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="16"
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} transform="rotate(-90 50 50)" />;
            offset += len;
            return seg;
          })}
        </svg>
        <ul className="or-legend">
          {items.map((it, i) => (
            <li key={it.label}>
              <i style={{ background: PALETTE[i % PALETTE.length] }} />
              <span>{it.label}</span>
              <b>{Math.round((it.value / total) * 100)}%</b>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// horizontal bars scaled to the biggest figure; negative values are drawn in red
export function Bars({ title, items }) {
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);
  return (
    <div className="or-chart">
      <div className="or-chart-t">{title}</div>
      {items.map((it, i) => (
        <div className="or-bar" key={it.label}>
          <div className="or-bar-top"><span>{it.label}</span><b>{ksh(it.value)}</b></div>
          <div className="or-bar-track">
            <i style={{ width: `${(Math.abs(it.value) / max) * 100}%`, background: it.value < 0 ? "#b91c1c" : it.strong ? "#c8961a" : PALETTE[(i + 2) % PALETTE.length] }} />
          </div>
        </div>
      ))}
    </div>
  );
}
