// tiny svg charts (no library). thin marks, recessive grid, hover/tap tooltips with a crosshair.
// colors come from css variables (--series-1 etc) so light/dark/high-contrast just work.

import { esc } from './util.js';

// charts are drawn at the real on-screen width (not scaled down), so labels stay readable on small
// phones and grow with the user's text-size setting. recomputed at the start of every chart.
let W = 420;
let M = { t: 14, r: 46, b: 30, l: 42 };
function measure() {
  if (typeof document === 'undefined' || !document.getElementById('main')) return;
  const main = document.getElementById('main');
  const cs = getComputedStyle(main);
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const inner = main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2 * rem - 2; // card padding + border
  W = Math.round(Math.max(240, Math.min(inner, 34 * rem)));
  M = { t: Math.round(0.7 * rem), r: Math.round(2.4 * rem), b: Math.round(1.6 * rem), l: Math.round(2.3 * rem) };
}

const niceTicks = (lo, hi, n = 4) => {
  const span = hi - lo || 1;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= step0);
  const out = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
};

// hit columns: one invisible rect per x slot carrying the tooltip text
const hitRects = (xs, h, tips) => {
  const step = xs.length > 1 ? xs[1] - xs[0] : W - M.l - M.r;
  return xs.map((x, i) => `<rect class="hit" x="${x - step / 2}" y="${M.t}" width="${step}" height="${h - M.t - M.b}" data-i="${i}" data-x="${x}" data-tip="${esc(tips[i])}" tabindex="0" role="img" aria-label="${esc(tips[i])}"/>`).join('');
};

// columns, values 0-100 (adherence %). bars: [{label, value|null, tip}]
export function columnChart(bars, { h = 190, max = 100, unit = '%' } = {}) {
  measure();
  const iw = W - M.l - M.r;
  const step = iw / bars.length;
  const bw = Math.max(4, Math.min(24, step - 6));
  const y = (v) => M.t + (h - M.t - M.b) * (1 - v / max);
  const ticks = [0, 50, 100];
  let s = ticks.map((v) => `<line class="grid" x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${M.l - 8}" y="${y(v) + 4}" text-anchor="end">${v}${unit}</text>`).join('');
  const xs = bars.map((_, i) => M.l + step * i + step / 2);
  bars.forEach((b, i) => {
    const x = xs[i];
    if (b.value != null && b.value > 0) {
      const top = y(b.value), base = y(0), r = Math.min(4, base - top);
      // rounded data-end, square at the baseline
      s += `<path class="bar" d="M${x - bw / 2},${base}V${top + r}q0,-${r} ${r},-${r}h${bw - 2 * r}q${r},0 ${r},${r}V${base}Z"/>`;
    } else if (b.value === 0) {
      s += `<rect class="bar-zero" x="${x - bw / 2}" y="${y(0) - 2}" width="${bw}" height="2"/>`;
    }
    if (b.label) s += `<text class="tick" x="${x}" y="${h - 9}" text-anchor="middle">${esc(b.label)}</text>`;
  });
  s += `<line class="axis" x1="${M.l}" x2="${W - M.r}" y1="${y(0)}" y2="${y(0)}"/>`;
  s += `<line class="xhair" y1="${M.t}" y2="${h - M.b}" x1="0" x2="0"/>`;
  s += hitRects(xs, h, bars.map((b) => b.tip));
  return wrap(s, h);
}

// lines over time. series: [{name, cls: 's1'|'s2', points: [{t: Date, y}]}]
export function lineChart(series, { h = 210, tipFor, fmtX, bands = [] } = {}) {
  measure();
  const all = series.flatMap((s) => s.points);
  if (!all.length) return '';
  const ts = [...new Set(all.map((p) => +p.t))].sort((a, b) => a - b);
  let lo = Math.min(...all.map((p) => p.y), ...bands.map((b) => b.from));
  let hi = Math.max(...all.map((p) => p.y), ...bands.map((b) => b.to));
  const pad = (hi - lo) * 0.12 || 5;
  const ticks = niceTicks(lo - pad, hi + pad);
  lo = ticks[0];
  hi = ticks[ticks.length - 1];
  const iw = W - M.l - M.r;
  const x = (t) => (ts.length === 1 ? M.l + iw / 2 : M.l + (iw * (t - ts[0])) / (ts[ts.length - 1] - ts[0]));
  const y = (v) => M.t + (h - M.t - M.b) * (1 - (v - lo) / (hi - lo));
  let s = ticks.map((v) => `<line class="grid" x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${M.l - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
  // shaded "healthy range" band behind the data
  for (const b of bands) s += `<rect class="band" x="${M.l}" width="${iw}" y="${y(Math.min(b.to, hi))}" height="${y(Math.max(b.from, lo)) - y(Math.min(b.to, hi))}"/>`;
  // a few x labels: first, middle, last
  const lab = [...new Set([0, Math.floor((ts.length - 1) / 2), ts.length - 1])];
  for (const i of lab) s += `<text class="tick" x="${x(ts[i])}" y="${h - 9}" text-anchor="middle">${esc(fmtX(new Date(ts[i])))}</text>`;
  s += `<line class="axis" x1="${M.l}" x2="${W - M.r}" y1="${h - M.b}" y2="${h - M.b}"/>`;
  s += `<line class="xhair" y1="${M.t}" y2="${h - M.b}" x1="0" x2="0"/>`;
  for (const se of series) {
    const pts = se.points.slice().sort((a, b) => a.t - b.t);
    if (!pts.length) continue;
    s += `<polyline class="line ${se.cls}" points="${pts.map((p) => `${x(+p.t).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ')}"/>`;
    const last = pts[pts.length - 1];
    // end dot + direct label on the latest value only
    s += `<circle class="dot ${se.cls}" cx="${x(+last.t)}" cy="${y(last.y)}" r="5"/>`;
    s += `<text class="end-label" x="${x(+last.t) + 10}" y="${y(last.y) + 5}">${esc(String(last.y))}</text>`;
  }
  s += hitRects(ts.map(x), h, ts.map((t) => tipFor(new Date(t))));
  return wrap(s, h);
}

const wrap = (inner, h) => `<div class="chart"><svg viewBox="0 0 ${W} ${h}" preserveAspectRatio="xMidYMid meet">${inner}</svg><div class="tip" hidden></div></div>`;

// one delegated handler for every chart on the page
export function bindCharts(root) {
  const show = (r) => {
    const chart = r.closest('.chart');
    const tip = chart.querySelector('.tip');
    const svg = chart.querySelector('svg');
    const xh = svg.querySelector('.xhair');
    const x = Number(r.dataset.x);
    xh.setAttribute('x1', x);
    xh.setAttribute('x2', x);
    xh.classList.add('on');
    tip.textContent = r.dataset.tip;
    tip.hidden = false;
    const frac = x / svg.viewBox.baseVal.width;
    tip.style.left = `${frac * 100}%`;
    tip.style.transform = `translateX(${frac > 0.7 ? '-100%' : frac < 0.3 ? '0' : '-50%'})`;
  };
  const hide = (r) => {
    const chart = r.closest('.chart');
    chart.querySelector('.tip').hidden = true;
    chart.querySelector('.xhair').classList.remove('on');
  };
  root.querySelectorAll('.chart .hit').forEach((r) => {
    r.addEventListener('pointerenter', () => show(r));
    r.addEventListener('pointerdown', () => show(r));
    r.addEventListener('focus', () => show(r));
    r.addEventListener('pointerleave', () => hide(r));
    r.addEventListener('blur', () => hide(r));
  });
}
