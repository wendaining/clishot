import path from "node:path";
import fs from "fs-extra";
import { ClishotError } from "./errors.js";

export const ensureParentDir = async (filePath: string): Promise<void> => {
  await fs.ensureDir(path.dirname(filePath));
};

export const assertWritableTarget = async (
  filePath: string,
  force: boolean,
): Promise<void> => {
  if (!force && await fs.pathExists(filePath)) {
    throw new ClishotError(
      `Output file already exists: ${filePath}`,
      5,
      "Pass --force to overwrite it, or choose a different path.",
    );
  }
  await ensureParentDir(filePath);
};

export const writeJson = async (filePath: string, value: unknown): Promise<void> => {
  await ensureParentDir(filePath);
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

