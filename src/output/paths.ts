import path from "node:path";
import { timestampForPath } from "../utils/time.js";

export const defaultCaptureDir = (specFile: string): string => {
  const base = path.basename(specFile, path.extname(specFile));
  return path.resolve(".clishot", `${timestampForPath()}-${base}`);
};

export const defaultShotsDir = (outFile: string): string => {
  const parsed = path.parse(outFile);
  return path.join(parsed.dir || ".", `${parsed.name}-shots`);
};

