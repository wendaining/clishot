import { ClishotError } from "../utils/errors.js";
import type { CaptureConfig } from "../config/schema.js";
import type { TerminalSnapshot } from "../engine/TermlessCoreEngine.js";

export interface CapturePlan {
  cols: number;
  rows: number;
  lines: string[];
}

export const planCapture = (snapshot: TerminalSnapshot, capture: CaptureConfig): CapturePlan => {
  switch (capture.mode) {
    case "viewport":
      return { cols: snapshot.cols, rows: snapshot.rows, lines: snapshot.viewportLines };
    case "lastLines":
      return { cols: snapshot.cols, rows: Math.min(capture.lines, snapshot.lines.length), lines: snapshot.lines.slice(-capture.lines) };
    case "fullScrollback":
      return { cols: snapshot.cols, rows: snapshot.lines.length, lines: snapshot.lines };
    case "textRange":
      return planTextRange(snapshot, capture);
  }
};

const planTextRange = (
  snapshot: TerminalSnapshot,
  capture: Extract<CaptureConfig, { mode: "textRange" }>,
): CapturePlan => {
  const from = capture.from ? findMarker(snapshot.lines, capture.from) : 0;
  const to = capture.to ? findMarker(snapshot.lines, capture.to) : snapshot.lines.length - 1;
  if (from === -1 || to === -1 || from > to) {
    if (capture.onMissingMarker === "fallbackToViewport") {
      return { cols: snapshot.cols, rows: snapshot.rows, lines: snapshot.viewportLines };
    }
    if (capture.onMissingMarker === "fallbackToLastLines") {
      const lines = snapshot.lines.slice(-snapshot.rows);
      return { cols: snapshot.cols, rows: lines.length, lines };
    }
    throw new ClishotError("capture.textRange marker was not found.", 3);
  }

  const start = capture.includeFrom === false ? from + 1 : from;
  const end = capture.includeTo === false ? to - 1 : to;
  const lines = snapshot.lines.slice(start, end + 1);
  return { cols: snapshot.cols, rows: Math.max(lines.length, 1), lines: lines.length ? lines : [""] };
};

const findMarker = (
  lines: string[],
  marker: { text?: string; regex?: string; occurrence?: "first" | "last" },
): number => {
  const matcher = marker.text
    ? (line: string) => line.includes(marker.text!)
    : (line: string) => new RegExp(marker.regex!, "m").test(line);
  if (marker.occurrence === "last") {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (matcher(lines[index])) return index;
    }
    return -1;
  }
  return lines.findIndex(matcher);
};

