import { spawnSync } from "node:child_process";

export const commandExists = (command: string): boolean => {
  const probe = process.platform === "win32" ? "where.exe" : "command";
  const args = process.platform === "win32" ? [command] : ["-v", command];
  const result = spawnSync(probe, args, { stdio: "ignore", shell: process.platform !== "win32" });
  return result.status === 0;
};

export const commonShells = (): Array<{ name: string; found: boolean }> => {
  const shells = process.platform === "win32"
    ? ["pwsh", "powershell.exe", "cmd.exe", "bash", "wsl.exe"]
    : ["bash", "zsh", "fish", process.env.SHELL || ""].filter(Boolean);
  return [...new Set(shells)].map((name) => ({ name, found: commandExists(name) }));
};

