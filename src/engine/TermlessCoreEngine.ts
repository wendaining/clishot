import { EventEmitter } from "node:events";
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
  private lastOutputAt = Date.now();
  private running = false;

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

    const nodePty = await import("node-pty").catch((error) => {
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
    const program = shell.program ?? (process.platform === "win32" ? "pwsh" : process.env.SHELL ?? "bash");
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
      });
      this.pty = pty;
    } catch (error) {
      throw new ClishotError(`Failed to start shell: ${program}`, 2, String(error));
    }

    this.running = true;
    const pty = this.requirePty();
    pty.onData((chunk) => {
      this.outputBytes += Buffer.byteLength(chunk);
      this.lastOutputAt = Date.now();
      const maxOutputBytes = this.config.limits.maxOutputBytes ?? 20000000;
      if (this.outputBytes > maxOutputBytes) {
        this.stop();
        this.emitEvent("limit:maxOutputBytes", { maxOutputBytes });
      }
      this.terminal?.write(chunk);
    });
    pty.onExit(({ exitCode, signal }) => {
      this.running = false;
      this.emitEvent("shell:exit", { exitCode, signal });
    });

    await this.waitForIdle(Math.min(shell.startupTimeoutMs ?? 10000, 1500));
  }

  async send(text: string, enter = false): Promise<void> {
    this.requirePty();
    this.emitEvent("input:send", { text, enter });
    this.pty!.write(`${text}${enter ? "\r" : ""}`);
  }

  async key(combo: string): Promise<void> {
    this.requirePty();
    const sequence = mapKeyCombo(combo);
    this.emitEvent("input:key", { combo });
    this.pty!.write(sequence);
  }

  async resize(cols: number, rows: number): Promise<void> {
    this.requirePty();
    this.emitEvent("terminal:resize", { cols, rows });
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
    if (this.pty) {
      this.pty.kill();
      this.running = false;
    }
  }

  async waitForText(text: string, timeoutMs: number): Promise<void> {
    await this.until(() => this.getPlainText().includes(text), timeoutMs, `Timed out waiting for text: ${text}`);
  }

  async waitForRegex(regex: string, timeoutMs: number): Promise<void> {
    let compiled: RegExp;
    try {
      compiled = new RegExp(regex, "m");
    } catch (error) {
      throw new ClishotError(`Invalid waitFor.regex: ${regex}`, 1, String(error));
    }
    await this.until(() => compiled.test(this.getPlainText()), timeoutMs, `Timed out waiting for regex: ${regex}`);
  }

  async waitForIdle(idleMs: number, timeoutMs = Math.max(idleMs + 1000, this.config.limits.stepTimeoutMs ?? 15000)): Promise<void> {
    await this.until(() => Date.now() - this.lastOutputAt >= idleMs, timeoutMs, `Timed out waiting for ${idleMs}ms idle`);
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
    return lines;
  }

  private async until(check: () => boolean, timeoutMs: number, message: string): Promise<void> {
    const started = Date.now();
    while (Date.now() - started <= timeoutMs) {
      if (check()) return;
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
