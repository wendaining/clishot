import { EventEmitter } from "node:events";
import { spawnSync } from "node:child_process";
import path from "node:path";
import xtermHeadless from "@xterm/headless";
import xtermSerialize from "@xterm/addon-serialize";
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
  html: string;
}

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
    this.pty!.write(`${text}${enter ? "\r" : ""}`);
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
    await this.waitForIdle(2500, Math.min(timeoutMs, 6000));
  }

  snapshot(): TerminalSnapshot {
    const terminal = this.requireTerminal();
    const lines = this.collectLines();
    const viewportLines = lines.slice(-terminal.rows);
    const html = this.serializeAddon?.serializeAsHTML({ onlySelection: false }) ?? "";
    return {
      cols: terminal.cols,
      rows: terminal.rows,
      lines,
      viewportLines,
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
