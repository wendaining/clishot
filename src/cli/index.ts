#!/usr/bin/env node
import { Command } from "commander";
import { recordCommand } from "./commands/record.js";
import { validateCommand } from "./commands/validate.js";
import { doctorCommand } from "./commands/doctor.js";
import { versionCommand } from "./commands/version.js";
import { inspectCommand } from "./commands/inspect.js";
import { cleanCommand } from "./commands/clean.js";
import { ClishotError, exitCodeName } from "../utils/errors.js";

const program = new Command();

program
  .name("clishot")
  .description("Record real terminal sessions from YAML and create report screenshots.")
  .showHelpAfterError()
  .exitOverride();

program.command("record")
  .argument("<spec-file>")
  .requiredOption("--out <output-file>", "final screenshot output path")
  .option("--format <format>", "png, jpg, jpeg, webp, or svg")
  .option("--force", "overwrite existing output files")
  .option("--debug", "write verbose logs and keep capture artifacts")
  .option("--capture-dir <dir>", "internal capture artifact directory")
  .option("--shots-dir <dir>", "official screenshot step output directory")
  .option("--no-clean", "keep capture directory on success")
  .option("--timeout <ms>", "override limits.totalTimeoutMs")
  .action(wrap(recordCommand));

program.command("validate")
  .argument("<spec-file>")
  .option("--check-runtime", "also check shell paths and termless availability")
  .action(wrap(validateCommand));

program.command("doctor").action(wrap(doctorCommand));
program.command("version").action(wrap(versionCommand));
program.command("inspect").argument("<capture-dir>").action(wrap(inspectCommand));
program.command("clean").argument("<capture-dir>").action(wrap(cleanCommand));

try {
  await program.parseAsync(process.argv);
} catch (error) {
  handleError(error);
}

function wrap<T extends unknown[]>(fn: (...args: T) => Promise<void>) {
  return async (...args: T) => {
    try {
      await fn(...args);
      process.exit(0);
    } catch (error) {
      handleError(error);
    }
  };
}

function handleError(error: unknown): never {
  if (error instanceof ClishotError) {
    console.error(`clishot ${exitCodeName(error.code)}: ${error.message}`);
    if (error.hint) console.error(error.hint);
    process.exit(error.code);
  }
  const anyError = error as { code?: string; message?: string; exitCode?: number };
  if (anyError.code === "commander.helpDisplayed") {
    process.exit(0);
  }
  if (anyError.code?.startsWith("commander.")) {
    console.error(anyError.message);
    process.exit(1);
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(8);
}
