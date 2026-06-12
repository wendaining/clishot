import os from "node:os";
import type { ClishotConfig } from "./schema.js";

const defaultShell = (): { program: string; args: string[] } => {
  if (process.platform === "win32") {
    return { program: "pwsh", args: ["-NoLogo"] };
  }
  return { program: process.env.SHELL || "bash", args: [] };
};

export const normalizeConfig = (config: ClishotConfig): ClishotConfig => {
  const shell = defaultShell();
  return {
    ...config,
    shell: {
      program: config.shell.program || shell.program,
      args: config.shell.args ?? shell.args,
      cwd: config.shell.cwd,
      env: {
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        ...(config.shell.env ?? {}),
      },
      startupTimeoutMs: config.shell.startupTimeoutMs ?? 10000,
    },
    terminal: {
      cols: config.terminal.cols ?? 100,
      rows: config.terminal.rows ?? 30,
      scrollback: config.terminal.scrollback ?? 5000,
      resizePolicy: config.terminal.resizePolicy ?? "fixed",
      allowAppResize: config.terminal.allowAppResize ?? false,
    },
    appearance: {
      theme: {
        name: config.appearance.theme?.name ?? "dark",
        background: config.appearance.theme?.background ?? "#0c0c0c",
        foreground: config.appearance.theme?.foreground ?? "#cccccc",
        cursorColor: config.appearance.theme?.cursorColor ?? "#ffffff",
        selectionBackground: config.appearance.theme?.selectionBackground ?? "#264f78",
      },
      font: {
        family: config.appearance.font?.family ?? (os.platform() === "win32" ? "Cascadia Mono, Consolas, monospace" : "monospace"),
        size: config.appearance.font?.size ?? 18,
        weight: config.appearance.font?.weight ?? "normal",
        weightBold: config.appearance.font?.weightBold ?? "bold",
        lineHeight: config.appearance.font?.lineHeight ?? 1.25,
        letterSpacing: config.appearance.font?.letterSpacing ?? 0,
      },
      cursor: {
        shape: config.appearance.cursor?.shape ?? "block",
        blink: config.appearance.cursor?.blink ?? false,
      },
      window: {
        enabled: config.appearance.window?.enabled ?? true,
        title: config.appearance.window?.title ?? "Terminal",
        frameStyle: config.appearance.window?.frameStyle ?? "windows",
        showControls: config.appearance.window?.showControls ?? true,
        showTabRow: config.appearance.window?.showTabRow ?? false,
        padding: config.appearance.window?.padding ?? 18,
        margin: config.appearance.window?.margin ?? 0,
        borderRadius: config.appearance.window?.borderRadius ?? 10,
        shadow: config.appearance.window?.shadow ?? true,
      },
      output: {
        scale: config.appearance.output?.scale ?? 2,
        transparent: config.appearance.output?.transparent ?? false,
        quality: config.appearance.output?.quality ?? 92,
      },
    },
    capture: config.capture,
    limits: {
      stepTimeoutMs: config.limits.stepTimeoutMs ?? 15000,
      totalTimeoutMs: config.limits.totalTimeoutMs ?? 120000,
      maxOutputBytes: config.limits.maxOutputBytes ?? 20000000,
      onTimeout: config.limits.onTimeout ?? "capture-and-fail",
    },
    steps: config.steps,
  };
};

