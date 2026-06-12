import path from "node:path";
import { loadConfig } from "../../config/loadConfig.js";
import { runRecord } from "../../engine/StepRunner.js";
import { assertOutputExtension, normalizeFormat } from "../../output/imageFormat.js";
import { defaultCaptureDir } from "../../output/paths.js";
import { assertWritableTarget } from "../../utils/fs.js";
import type { ClishotConfig } from "../../config/schema.js";

export const recordCommand = async (
  specFile: string,
  options: {
    out?: string;
    format?: string;
    force?: boolean;
    debug?: boolean;
    captureDir?: string;
    shotsDir?: string;
    noClean?: boolean;
    clean?: boolean;
    timeout?: string;
  },
): Promise<void> => {
  if (!options.out) {
    throw new Error("record requires --out <output-file>");
  }
  const format = normalizeFormat(options.format);
  const outFile = path.resolve(options.out);
  assertOutputExtension(outFile, format, Boolean(options.format));
  await assertWritableTarget(outFile, Boolean(options.force));
  const config = await loadConfig(specFile);
  const effectiveConfig: ClishotConfig = options.timeout
    ? { ...config, limits: { ...config.limits, totalTimeoutMs: Number(options.timeout) } }
    : config;
  await runRecord(effectiveConfig, {
    specFile: path.resolve(specFile),
    outFile,
    format,
    force: Boolean(options.force),
    debug: Boolean(options.debug),
    captureDir: path.resolve(options.captureDir ?? defaultCaptureDir(specFile)),
    shotsDir: options.shotsDir ? path.resolve(options.shotsDir) : undefined,
    noClean: Boolean(options.noClean || options.clean === false),
  });
  console.log(`Wrote ${outFile}`);
};
