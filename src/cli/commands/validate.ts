import fs from "fs-extra";
import { loadConfig } from "../../config/loadConfig.js";
import { commandExists } from "../../platform/detectShell.js";
import { detectTermless } from "../../platform/detectTermless.js";
import { ClishotError } from "../../utils/errors.js";

export const validateCommand = async (specFile: string, options: { checkRuntime?: boolean }): Promise<void> => {
  const config = await loadConfig(specFile);
  if (options.checkRuntime) {
    if (!commandExists(config.shell.program!)) {
      throw new ClishotError(`shell.program was not found: ${config.shell.program}`, 1);
    }
    if (config.shell.cwd && !await fs.pathExists(config.shell.cwd)) {
      throw new ClishotError(`shell.cwd does not exist: ${config.shell.cwd}`, 1);
    }
    const termless = await detectTermless();
    if (!termless.available) {
      throw new ClishotError("termless core is not available.", 7, termless.error);
    }
  }
  console.log("clishot config is valid");
};

