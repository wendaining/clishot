import process from "node:process";
import { commonShells } from "../../platform/detectShell.js";
import { detectTermless } from "../../platform/detectTermless.js";

export const doctorCommand = async (): Promise<void> => {
  const termless = await detectTermless();
  console.log("clishot doctor");
  console.log(`node: ${process.version}`);
  console.log(`platform: ${process.platform} ${process.arch}`);
  console.log(`termless core: ${termless.available ? `ok (${termless.version})` : "unavailable"}`);
  if (termless.error) console.log(`termless detail: ${termless.error}`);
  console.log("shells:");
  for (const shell of commonShells()) {
    console.log(`  ${shell.found ? "ok" : "--"} ${shell.name}`);
  }
  console.log("pty: uses node-pty through the clishot TermlessCoreEngine adapter");
};

