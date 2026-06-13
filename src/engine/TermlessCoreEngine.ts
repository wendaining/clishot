import { EventEmitter } from "node:events";
import { spawnSync } from "node:child_process";
import path from "node:path";
import xtermHeadless from "@xterm/headless";
import xtermSerialize from "@xterm/addon-serialize";
import type { IBufferCell } from "@xterm/headless";
import type { IPty } from "node-pty";
import type { ClishotConfig } from "../config/schema.js";
import { ClishotError } from "../utils/errors.js";
import { sleep } from "../utils/time.js";
import { mapKeyCombo } from "./KeyMapper.js";

const { Terminal } = xtermHeadless as typeof import("@xterm/headless");
const { SerializeAddon } = xtermSerialize as typeof import("@xterm/addon-serialize");

export interface TerminalSnapshot {
  cols: number;
  rows: number;
  lines: string[];
  viewportLines: string[];
  styledLines: StyledLine[];
  viewportStyledLines: StyledLine[];
  html: string;
}

export interface StyledSegment {
  text: string;
  color?: string;
}

export type StyledLine = StyledSegment[];

export interface EngineEvent {
  time: string;
  type: string;
  data?: unknown;
}

export interface LoadedTermless {
  available: boolean;
  version?: string;
  error?: string;
}

export class TermlessCoreEngine extends EventEmitter {
  private terminal: InstanceType<typeof Terminal> | undefined;
  private serializeAddon: InstanceType<typeof SerializeAddon> | undefined;
  private pty: IPty | undefined;
  private outputBytes = 0;
  private rawOutput = "";
  private lastOutputAt = Date.now();
  private running = false;
  private pendingWrites: Array<Promise<void>> = [];
  private exitPromise: Promise<void> | undefined;
  private resolveExit: (() => void) | undefined;

  constructor(private readonly config: ClishotConfig) {
    super();
  }

  static async detectTermlessCore(): Promise<LoadedTermless> {
    try {
      await import("@termless/core");
      return { available: true, version: "0.7.0" };
    } catch (error) {
      return { available: false, version: "0.7.0", error: String(error) };
    }
  }

  async start(): Promise<void> {
    const termless = await TermlessCoreEngine.detectTermlessCore();
    if (!termless.available) {
      throw new ClishotError(
        "termless core is not available in the current Node.js runtime.",
        7,
        termless.error,
      );
    }

    const nodePty = await import("@homebridge/node-pty-prebuilt-multiarch").catch((error) => {
      throw new ClishotError("node-pty is required for real terminal sessions.", 7, String(error));
    });

    const terminal = new Terminal({
      cols: this.config.terminal.cols,
      rows: this.config.terminal.rows,
      scrollback: this.config.terminal.scrollback,
      allowProposedApi: true,
      windowsMode: process.platform === "win32",
      theme: {
        background: this.config.appearance.theme?.background,
        foreground: this.config.appearance.theme?.foreground,
        cursor: this.config.appearance.theme?.cursorColor,
      },
    });
    const serializeAddon = new SerializeAddon();
    terminal.loadAddon(serializeAddon);
    this.terminal = terminal;
    this.serializeAddon = serializeAddon;

    const shell = this.config.shell;
    const program = resolveExecutable(shell.program ?? (process.platform === "win32" ? "pwsh" : process.env.SHELL ?? "bash"));
    const args = shell.args ?? [];
    const cwd = shell.cwd ? path.resolve(shell.cwd) : process.cwd();
    const env = { ...process.env, ...shell.env };
    this.emitEvent("shell:start", { program, args, cwd });

    try {
      const pty = nodePty.spawn(program, args, {
        name: "xterm-256color",
        cols: this.config.terminal.cols,
        rows: this.config.terminal.rows,
        cwd,
        env,
        useConptyDll: process.platform === "win32",
      });
      this.pty = pty;
    } catch (error) {
      throw new ClishotError(`Failed to start shell: ${program}`, 2, String(error));
    }

    this.running = true;
    this.exitPromise = new Promise((resolve) => {
      this.resolveExit = resolve;
    });
    const pty = this.requirePty();
    pty.onData((chunk) => {
      this.outputBytes += Buffer.byteLength(chunk);
      this.rawOutput += chunk;
      this.lastOutputAt = Date.now();
      this.emitEvent("terminal:output", { bytes: Buffer.byteLength(chunk) });
      const maxOutputBytes = this.config.limits.maxOutputBytes ?? 20000000;
      if (this.outputBytes > maxOutputBytes) {
        this.stop();
        this.emitEvent("limit:maxOutputBytes", { maxOutputBytes });
      }
      const write = new Promise<void>((resolve) => {
        this.terminal?.write(chunk, resolve);
      });
      this.pendingWrites.push(write);
      void write.finally(() => {
        this.pendingWrites = this.pendingWrites.filter((item) => item !== write);
      });
    });
    pty.onExit(({ exitCode, signal }) => {
      this.running = false;
      this.emitEvent("shell:exit", { exitCode, signal });
      this.resolveExit?.();
    });

    await this.waitForStartup(shell.startupTimeoutMs ?? 10000);
  }

  async send(text: string, enter = false): Promise<void> {
    this.requirePty();
    this.emitEvent("input:send", { text, enter });
    this.lastOutputAt = Date.now();
    const input = text.includes("\n")
      ? `\x1b[200~${text.replace(/\r?\n/g, "\r")}\x1b[201~${enter ? "\r" : ""}`
      : `${text}${enter ? "\r" : ""}`;
    this.pty!.write(input);
  }

  async key(combo: string): Promise<void> {
    this.requirePty();
    const sequence = mapKeyCombo(combo);
    this.emitEvent("input:key", { combo });
    this.lastOutputAt = Date.now();
    this.pty!.write(sequence);
  }

  async resize(cols: number, rows: number): Promise<void> {
    this.requirePty();
    this.emitEvent("terminal:resize", { cols, rows });
    this.lastOutputAt = Date.now();
    this.pty!.resize(cols, rows);
    this.terminal?.resize(cols, rows);
  }

  async exit(): Promise<void> {
    if (!this.pty) return;
    this.emitEvent("shell:terminate");
    this.pty.kill();
    this.running = false;
  }

  stop(): void {
    if (this.pty && this.running) {
      this.pty.kill();
      this.running = false;
    }
  }

  async shutdown(): Promise<void> {
    await this.flush();
    this.stop();
    await Promise.race([this.exitPromise ?? Promise.resolve(), sleep(1000)]);
    this.pty = undefined;
  }

  async flush(): Promise<void> {
    await Promise.allSettled(this.pendingWrites);
  }

  async waitForText(text: string, timeoutMs: number): Promise<void> {
    await this.until(async () => {
      await this.flush();
      return this.getPlainText().includes(text);
    }, timeoutMs, `Timed out waiting for text: ${text}`);
  }

  async waitForRegex(regex: string, timeoutMs: number): Promise<void> {
    let compiled: RegExp;
    try {
      compiled = new RegExp(regex, "m");
    } catch (error) {
      throw new ClishotError(`Invalid waitFor.regex: ${regex}`, 1, String(error));
    }
    await this.until(async () => {
      await this.flush();
      return compiled.test(this.getPlainText());
    }, timeoutMs, `Timed out waiting for regex: ${regex}`);
  }

  async waitForIdle(idleMs: number, timeoutMs = Math.max(idleMs + 1000, this.config.limits.stepTimeoutMs ?? 15000)): Promise<void> {
    await this.until(async () => {
      await this.flush();
      return Date.now() - this.lastOutputAt >= idleMs;
    }, timeoutMs, `Timed out waiting for ${idleMs}ms idle`);
  }

  async waitForStartup(timeoutMs: number): Promise<void> {
    await this.until(() => this.outputBytes > 0 || !this.running, timeoutMs, "Timed out waiting for initial terminal output");
    await this.waitForIdle(4500, Math.min(timeoutMs, 8000));
  }

  snapshot(): TerminalSnapshot {
    const terminal = this.requireTerminal();
    const lines = this.collectLines();
    const styledLines = this.collectStyledLines(lines);
    const viewportLines = lines.slice(-terminal.rows);
    const viewportStyledLines = styledLines.slice(-terminal.rows);
    const html = this.serializeAddon?.serializeAsHTML({ onlySelection: false }) ?? "";
    return {
      cols: terminal.cols,
      rows: terminal.rows,
      lines,
      viewportLines,
      styledLines,
      viewportStyledLines,
      html,
    };
  }

  getPlainText(): string {
    return this.collectLines().join("\n");
  }

  private collectLines(): string[] {
    const terminal = this.requireTerminal();
    const buffer = terminal.buffer.active;
    const lines: string[] = [];
    for (let index = 0; index < buffer.length; index += 1) {
      lines.push(buffer.getLine(index)?.translateToString(true) ?? "");
    }
    while (lines.length > 1 && lines[0] === "") lines.shift();
    if (lines.every((line) => line === "") && this.rawOutput) {
      return normalizeTerminalText(this.rawOutput);
    }
    return lines;
  }

  private collectStyledLines(lines: string[]): StyledLine[] {
    const styledLines = this.collectBufferStyledLines();
    if (styledText(styledLines.flat()).length > 0) {
      return styledLines;
    }
    if (this.rawOutput) {
      return parseAnsiStyledLines(this.rawOutput);
    }
    return colorizePlainLines(lines);
  }

  private collectBufferStyledLines(): StyledLine[] {
    const terminal = this.requireTerminal();
    const buffer = terminal.buffer.active;
    const lines: StyledLine[] = [];
    const reusableCell = buffer.getNullCell();

    for (let rowIndex = 0; rowIndex < buffer.length; rowIndex += 1) {
      const row = buffer.getLine(rowIndex);
      const styledLine: StyledLine = [];
      if (row) {
        for (let column = 0; column < terminal.cols; column += 1) {
          const cell = row.getCell(column, reusableCell);
          if (!cell || cell.getWidth() === 0) continue;
          const text = cell.getChars() || " ";
          appendStyledSegment(styledLine, {
            text,
            color: foregroundColor(cell),
          });
        }
      }
      lines.push(trimStyledLine(styledLine));
    }

    while (lines.length > 1 && styledText(lines[0]) === "") lines.shift();
    return lines.length ? lines : [[{ text: "" }]];
  }

  private async until(check: () => boolean | Promise<boolean>, timeoutMs: number, message: string): Promise<void> {
    const started = Date.now();
    while (Date.now() - started <= timeoutMs) {
      if (await check()) return;
      await sleep(50);
    }
    throw new ClishotError(message, 3);
  }

  private requirePty(): IPty {
    if (!this.pty || !this.running) {
      throw new ClishotError("Shell is not running.", 2);
    }
    return this.pty;
  }

  private requireTerminal(): InstanceType<typeof Terminal> {
    if (!this.terminal) {
      throw new ClishotError("Terminal is not initialized.", 7);
    }
    return this.terminal;
  }

  private emitEvent(type: string, data?: unknown): void {
    const event: EngineEvent = { time: new Date().toISOString(), type, data };
    this.emit("event", event);
  }
}

const resolveExecutable = (program: string): string => {
  if (path.isAbsolute(program) || process.platform !== "win32") return program;
  const result = spawnSync("where.exe", [program], { encoding: "utf8" });
  const first = result.stdout.split(/\r?\n/).find(Boolean);
  return first ?? program;
};

const normalizeTerminalText = (value: string): string[] => {
  const withoutAnsi = value
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[=>()#][0-9A-Za-z]/g, "")
    .replace(/\x1b./g, "");
  const normalized = withoutAnsi.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").map((line) => line.trimEnd());
  while (lines.length > 1 && lines[0] === "") lines.shift();
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines.length ? lines : [""];
};

const ansiPalette: Record<number, string> = {
  30: "#000000",
  31: "#cd3131",
  32: "#0dbc79",
  33: "#e5e510",
  34: "#2472c8",
  35: "#bc3fbc",
  36: "#11a8cd",
  37: "#e5e5e5",
  90: "#666666",
  91: "#f14c4c",
  92: "#23d18b",
  93: "#f5f543",
  94: "#3b8eea",
  95: "#d670d6",
  96: "#29b8db",
  97: "#e5e5e5",
};

const parseAnsiStyledLines = (value: string): StyledLine[] => {
  const withoutOsc = value.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "");
  const lines: Array<Array<{ text: string; color?: string } | undefined>> = [[]];
  let color: string | undefined;
  let cursorX = 0;
  let cursorY = 0;
  let index = 0;

  const ensureLine = (): void => {
    while (lines.length <= cursorY) lines.push([]);
  };

  const pushText = (text: string): void => {
    if (!text) return;
    ensureLine();
    for (const char of text) {
      lines[cursorY][cursorX] = { text: char, color };
      cursorX += 1;
    }
  };

  const newline = (): void => {
    cursorY += 1;
    cursorX = 0;
    ensureLine();
  };

  while (index < withoutOsc.length) {
    const char = withoutOsc[index];
    if (char === "\x1b" && withoutOsc[index + 1] === "[") {
      const end = findCsiEnd(withoutOsc, index + 2);
      if (end === -1) break;
      const body = withoutOsc.slice(index + 2, end);
      const final = withoutOsc[end];
      if (final === "m") {
        color = applySgr(body, color);
      } else {
        const params = parseCsiParams(body);
        if (final === "K") {
          clearLine(lines, cursorY, cursorX, params[0] ?? 0);
        } else if (final === "J") {
          clearScreen(lines, cursorY, cursorX, params[0] ?? 0);
        } else if (final === "H" || final === "f") {
          cursorY = Math.max((params[0] ?? 1) - 1, 0);
          cursorX = Math.max((params[1] ?? 1) - 1, 0);
          ensureLine();
        } else if (final === "G") {
          cursorX = Math.max((params[0] ?? 1) - 1, 0);
        } else if (final === "C") {
          cursorX += params[0] ?? 1;
        } else if (final === "D") {
          cursorX = Math.max(cursorX - (params[0] ?? 1), 0);
        } else if (final === "A") {
          cursorY = Math.max(cursorY - (params[0] ?? 1), 0);
        } else if (final === "B") {
          cursorY += params[0] ?? 1;
          ensureLine();
        }
      }
      index = end + 1;
      continue;
    }
    if (char === "\x1b") {
      index += 2;
      continue;
    }
    if (char === "\r") {
      cursorX = 0;
      if (withoutOsc[index + 1] === "\n") {
        newline();
        index += 1;
      }
    } else if (char === "\n") {
      newline();
    } else if (char >= " " || char === "\t") {
      pushText(char);
    }
    index += 1;
  }

  const cleaned = lines.map((line) => trimStyledLine(cellsToStyledLine(line)));
  while (cleaned.length > 1 && styledText(cleaned[0]) === "") cleaned.shift();
  while (cleaned.length > 1 && styledText(cleaned[cleaned.length - 1]) === "") cleaned.pop();
  return cleaned.length ? cleaned : [[{ text: "" }]];
};

const parseCsiParams = (body: string): number[] => {
  const cleaned = body.replace(/^[?>!]/, "");
  if (!cleaned) return [];
  return cleaned.split(";").map((part) => Number(part || 0));
};

const clearLine = (
  lines: Array<Array<{ text: string; color?: string } | undefined>>,
  y: number,
  x: number,
  mode: number,
): void => {
  const line = lines[y];
  if (!line) return;
  if (mode === 1) {
    line.splice(0, x + 1);
    return;
  }
  if (mode === 2) {
    lines[y] = [];
    return;
  }
  line.length = x;
};

const clearScreen = (
  lines: Array<Array<{ text: string; color?: string } | undefined>>,
  y: number,
  x: number,
  mode: number,
): void => {
  if (mode === 2 || mode === 3) {
    lines.length = 0;
    lines.push([]);
    return;
  }
  if (mode === 1) {
    for (let index = 0; index < y; index += 1) lines[index] = [];
    clearLine(lines, y, x, 1);
    return;
  }
  clearLine(lines, y, x, 0);
  lines.length = y + 1;
};

const cellsToStyledLine = (cells: Array<{ text: string; color?: string } | undefined>): StyledLine => {
  const line: StyledLine = [];
  for (const cell of cells) {
    const text = cell?.text ?? " ";
    appendStyledSegment(line, { text, color: cell?.color });
  }
  return line.length ? line : [{ text: "" }];
};

const appendStyledSegment = (line: StyledLine, segment: StyledSegment): void => {
  const previous = line[line.length - 1];
  if (previous && previous.color === segment.color) {
    previous.text += segment.text;
    return;
  }
  line.push(segment);
};

const foregroundColor = (cell: IBufferCell): string | undefined => {
  if (cell.isFgDefault()) return undefined;
  if (cell.isFgRGB()) {
    return rgbNumberToHex(cell.getFgColor());
  }
  if (cell.isFgPalette()) {
    return xterm256ToHex(cell.getFgColor());
  }
  return undefined;
};

const findCsiEnd = (value: string, start: number): number => {
  for (let index = start; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0x40 && code <= 0x7e) return index;
  }
  return -1;
};

const applySgr = (body: string, current: string | undefined): string | undefined => {
  const params = body === "" ? [0] : body.split(";").map((part) => Number(part || 0));
  let color = current;
  for (let index = 0; index < params.length; index += 1) {
    const value = params[index];
    if (value === 0 || value === 39) {
      color = undefined;
    } else if (value in ansiPalette) {
      color = ansiPalette[value];
    } else if (value === 38 && params[index + 1] === 2) {
      const red = clampColor(params[index + 2]);
      const green = clampColor(params[index + 3]);
      const blue = clampColor(params[index + 4]);
      color = rgbToHex(red, green, blue);
      index += 4;
    } else if (value === 38 && params[index + 1] === 5) {
      color = xterm256ToHex(clampColor(params[index + 2]));
      index += 2;
    }
  }
  return color;
};

const clampColor = (value: number | undefined): number =>
  Math.max(0, Math.min(255, Number.isFinite(value) ? value! : 0));

const rgbToHex = (red: number, green: number, blue: number): string =>
  `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("")}`;

const rgbNumberToHex = (value: number): string =>
  `#${value.toString(16).padStart(6, "0").slice(-6)}`;

const xterm256ToHex = (value: number): string => {
  if (value < 16) return ansiPalette[value < 8 ? value + 30 : value + 82] ?? "#cccccc";
  if (value >= 232) {
    const level = 8 + (value - 232) * 10;
    return rgbToHex(level, level, level);
  }
  const adjusted = value - 16;
  const red = Math.floor(adjusted / 36);
  const green = Math.floor((adjusted % 36) / 6);
  const blue = adjusted % 6;
  const convert = (component: number) => component === 0 ? 0 : 55 + component * 40;
  return rgbToHex(convert(red), convert(green), convert(blue));
};

const trimStyledLine = (line: StyledLine): StyledLine => {
  let text = styledText(line).trimEnd();
  const trimmed: StyledLine = [];
  for (const segment of line) {
    if (!text) break;
    const piece = segment.text.slice(0, text.length);
    if (piece) trimmed.push({ text: piece, color: segment.color });
    text = text.slice(piece.length);
  }
  return trimmed.length ? trimmed : [{ text: "" }];
};

const styledText = (line: StyledLine): string =>
  line.map((segment) => segment.text).join("");

const colorizePlainLines = (lines: string[]): StyledLine[] =>
  lines.map((line) => {
    if (line.startsWith(" ") || line.startsWith("☻")) {
      return colorizePromptLine(line);
    }
    if (line.startsWith("# ")) {
      return [
        { text: "#", color: "#ff4fb8" },
        { text: " " },
        { text: line.slice(2), color: "#f5f543" },
      ];
    }
    if (/^(Mode|----)/.test(line)) {
      return [{ text: line, color: "#23d18b" }];
    }
    if (line.startsWith(">>>")) {
      return [{ text: line, color: "#e5e5e5" }];
    }
    return [{ text: line }];
  });

const colorizePromptLine = (line: string): StyledLine => {
  const folderIndex = line.indexOf("");
  if (folderIndex === -1) return [{ text: line, color: "#45f1c2" }];
  return [
    { text: line.slice(0, folderIndex), color: "#45f1c2" },
    { text: line.slice(folderIndex), color: "#0ca0d8" },
  ];
};
