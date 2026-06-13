import { ClishotError } from "../utils/errors.js";
import type { CaptureConfig } from "../config/schema.js";
import type { StyledLine, TerminalSnapshot } from "../engine/TermlessCoreEngine.js";

export interface CapturePlan {
  cols: number;
  rows: number;
  lines: string[];
  styledLines: StyledLine[];
}

export const planCapture = (snapshot: TerminalSnapshot, capture: CaptureConfig): CapturePlan => {
  const cleanedSnapshot = trimTrailingBlankLines(snapshot);
  switch (capture.mode) {
    case "viewport":
      return { cols: snapshot.cols, rows: snapshot.rows, lines: snapshot.viewportLines, styledLines: snapshot.viewportStyledLines };
    case "lastLines":
      return {
        cols: cleanedSnapshot.cols,
        rows: Math.min(capture.lines, cleanedSnapshot.lines.length),
        lines: cleanedSnapshot.lines.slice(-capture.lines),
        styledLines: cleanedSnapshot.styledLines.slice(-capture.lines),
      };
    case "fullScrollback":
      return {
        cols: cleanedSnapshot.cols,
        rows: cleanedSnapshot.lines.length,
        lines: cleanedSnapshot.lines,
        styledLines: cleanedSnapshot.styledLines,
      };
    case "textRange":
      return planTextRange(cleanedSnapshot, capture);
  }
};

const trimTrailingBlankLines = (snapshot: TerminalSnapshot): TerminalSnapshot => {
  let end = snapshot.lines.length;
  while (end > 1 && snapshot.lines[end - 1] === "") end -= 1;
  let lines = snapshot.lines.slice(0, end);
  let styledLines = snapshot.styledLines.slice(0, end);
  ({ lines, styledLines } = removeTrailingTransientPromptLine(lines, styledLines));
  return {
    ...snapshot,
    lines,
    styledLines,
  };
};

const removeTrailingTransientPromptLine = (
  lines: string[],
  styledLines: StyledLine[],
): { lines: string[]; styledLines: StyledLine[] } => {
  if (lines.length < 2) return { lines, styledLines };
  const promptIndex = lines.length - 1;
  const transientIndex = lines.length - 2;
  if (!isEmptyPrompt(lines[promptIndex]) || !isRightPromptStatusLine(lines[transientIndex])) {
    return { lines, styledLines };
  }
  return {
    lines: [...lines.slice(0, transientIndex), lines[promptIndex]],
    styledLines: [...styledLines.slice(0, transientIndex), styledLines[promptIndex]],
  };
};

const isEmptyPrompt = (line: string): boolean =>
  /^[>\-$%#❯]\s*$/.test(line.trim());

const isRightPromptStatusLine = (line: string): boolean =>
  /^\s*(?:[~/]|[A-Za-z]:[\\/]).*\s+\d{1,2}:\d{2}(?::\d{2})?\s*$/.test(line);

const planTextRange = (
  snapshot: TerminalSnapshot,
  capture: Extract<CaptureConfig, { mode: "textRange" }>,
): CapturePlan => {
  const from = capture.from ? findMarker(snapshot.lines, capture.from) : 0;
  const to = capture.to ? findMarker(snapshot.lines, capture.to) : snapshot.lines.length - 1;
  if (from === -1 || to === -1 || from > to) {
    if (capture.onMissingMarker === "fallbackToViewport") {
      return { cols: snapshot.cols, rows: snapshot.rows, lines: snapshot.viewportLines, styledLines: snapshot.viewportStyledLines };
    }
    if (capture.onMissingMarker === "fallbackToLastLines") {
      const lines = snapshot.lines.slice(-snapshot.rows);
      const styledLines = snapshot.styledLines.slice(-snapshot.rows);
      return { cols: snapshot.cols, rows: lines.length, lines, styledLines };
    }
    throw new ClishotError("capture.textRange marker was not found.", 3);
  }

  const start = capture.includeFrom === false ? from + 1 : from;
  const end = capture.includeTo === false ? to - 1 : to;
  const lines = snapshot.lines.slice(start, end + 1);
  const styledLines = snapshot.styledLines.slice(start, end + 1);
  return {
    cols: snapshot.cols,
    rows: Math.max(lines.length, 1),
    lines: lines.length ? lines : [""],
    styledLines: styledLines.length ? styledLines : [[{ text: "" }]],
  };
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
