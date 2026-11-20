const ESC = "\x1b[";

export const color = {
  reset: `${ESC}0m`,
  dim: (s: string) => `${ESC}2m${s}${ESC}22m`,
  bold: (s: string) => `${ESC}1m${s}${ESC}22m`,
  red: (s: string) => `${ESC}31m${s}${ESC}39m`,
  green: (s: string) => `${ESC}32m${s}${ESC}39m`,
  yellow: (s: string) => `${ESC}33m${s}${ESC}39m`,
  blue: (s: string) => `${ESC}34m${s}${ESC}39m`,
  magenta: (s: string) => `${ESC}35m${s}${ESC}39m`,
  cyan: (s: string) => `${ESC}36m${s}${ESC}39m`,
};

/** Strips ANSI colours and OSC 8 links so NO_COLOR works and tests stay readable. */
export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "").replace(/\x1b\]8;;[^\x1b]*\x1b\\/g, "");
}

/** OSC 8 hyperlink; terminals without support just show the text. */
export function link(url: string, text: string): string {
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return "$0.00";
  if (usd < 10) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(1)}`;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

/** Time left until a reset, e.g. `6d 3h`, `2h 15m`, `45m`, `30s`. */
export function formatRemaining(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/** 256-colour palette indexes used by the bars. */
export const palette = {
  track: 240,
  green: 71,
  yellow: 179,
  red: 167,
  gray: 60,
};

const fg = (n: number, s: string) => `${ESC}38;5;${n}m${s}${ESC}39m`;

/**
 * A dot bar, e.g. `●●○○○○○○○○`: filled dots in the fill colour, empty ones in the
 * track colour. Any non-zero value shows at least one dot so small usage stays visible.
 */
export function bar(fraction: number, fill: number, width = 10): string {
  const f = Math.min(1, Math.max(0, fraction));
  const filled = f > 0 ? Math.max(1, Math.round(f * width)) : 0;
  return fg(fill, "●".repeat(filled)) + fg(palette.track, "○".repeat(width - filled));
}

/** Green below 50 %, yellow up to 80 %, red above. */
export function severity(fraction: number, low = palette.green): number {
  if (fraction >= 0.8) return palette.red;
  if (fraction >= 0.5) return palette.yellow;
  return low;
}

export function paint(n: number, s: string): string {
  return fg(n, s);
}
