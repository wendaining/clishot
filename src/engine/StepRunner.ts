import fs from "fs-extra";
import path from "node:path";
import YAML from "yaml";
import type { ClishotConfig, ClishotStep } from "../config/schema.js";
import { planCapture } from "../capture/CapturePlanner.js";
import { TermlessCoreEngine, type EngineEvent } from "./TermlessCoreEngine.js";
import { applyWaitFor } from "./Waiter.js";
import { ScreenshotManager } from "../output/ScreenshotManager.js";
import { defaultShotsDir } from "../output/paths.js";
import type { ImageFormat } from "../output/imageFormat.js";
import { writeJson } from "../utils/fs.js";
import { sleep } from "../utils/time.js";
import { ClishotError } from "../utils/errors.js";

export interface RecordOptions {
  specFile: string;
  outFile: string;
  format: ImageFormat;
  force: boolean;
  debug: boolean;
  captureDir: string;
  shotsDir?: string;
  noClean: boolean;
}

export const runRecord = async (config: ClishotConfig, options: RecordOptions): Promise<void> => {
  const engine = new TermlessCoreEngine(config);
  const screenshotManager = new ScreenshotManager(config, options.format, options.force);
  const eventsPath = path.join(options.captureDir, "events.jsonl");
  const captureShotsDir = path.join(options.captureDir, "shots");
  const officialShotsDir = options.shotsDir ?? defaultShotsDir(options.outFile);

  await fs.ensureDir(options.captureDir);
  await fs.ensureDir(captureShotsDir);
  await writeJson(path.join(options.captureDir, "metadata.json"), {
    specFile: options.specFile,
    outFile: options.outFile,
    format: options.format,
    platform: process.platform,
    arch: process.arch,
    startedAt: new Date().toISOString(),
  });
  await fs.writeFile(path.join(options.captureDir, "normalized.yml"), YAML.stringify(config), "utf8");
  await fs.writeFile(eventsPath, "", "utf8");

  const pendingEvents: Array<Promise<void>> = [];
  const appendEvent = async (event: EngineEvent): Promise<void> => {
    await fs.appendFile(eventsPath, `${JSON.stringify(event)}\n`, "utf8");
  };
  engine.on("event", (event: EngineEvent) => {
    pendingEvents.push(appendEvent(event));
  });

  let failed = false;
  try {
    await engine.start();
    const totalTimeout = setTimeout(() => {
      engine.stop();
    }, config.limits.totalTimeoutMs);

    try {
      for (const [index, step] of config.steps.entries()) {
        await appendEvent({ time: new Date().toISOString(), type: "step:start", data: { index, step } });
        await runStep(step, engine, screenshotManager, officialShotsDir, captureShotsDir, options.format);
        await appendEvent({ time: new Date().toISOString(), type: "step:end", data: { index, type: step.type } });
      }
    } finally {
      clearTimeout(totalTimeout);
    }

    await engine.flush();
    const snapshot = engine.snapshot();
    await fs.writeFile(path.join(options.captureDir, "normalized.txt"), snapshot.lines.join("\n"), "utf8");
    const finalPlan = planCapture(snapshot, config.capture);
    await screenshotManager.write(options.outFile, finalPlan);
    await screenshotManager.write(path.join(options.captureDir, `final.${options.format}`), finalPlan);
  } catch (error) {
    failed = true;
    if (error instanceof ClishotError && error.code === 3 && config.limits.onTimeout === "capture-and-success") {
      await engine.flush();
      const snapshot = engine.snapshot();
      const finalPlan = planCapture(snapshot, config.capture);
      await screenshotManager.write(options.outFile, finalPlan);
      return;
    }
    throw error;
  } finally {
    await engine.shutdown();
    await Promise.allSettled(pendingEvents);
    if (!failed && !options.debug && !options.noClean) {
      await fs.remove(options.captureDir);
    }
  }
};

const runStep = async (
  step: ClishotStep,
  engine: TermlessCoreEngine,
  screenshotManager: ScreenshotManager,
  officialShotsDir: string,
  captureShotsDir: string,
  format: ImageFormat,
): Promise<void> => {
  switch (step.type) {
    case "wait":
      await sleep(step.ms);
      break;
    case "send":
      await engine.send(step.text, step.enter ?? false);
      break;
    case "key":
      await engine.key(step.combo);
      break;
    case "resize":
      await engine.resize(step.cols, step.rows);
      break;
    case "screenshot": {
      await engine.flush();
      const snapshot = engine.snapshot();
      const plan = planCapture(snapshot, step.capture ?? { mode: "viewport" });
      await screenshotManager.write(path.join(officialShotsDir, `${step.name}.${format}`), plan);
      await screenshotManager.write(path.join(captureShotsDir, `${step.name}.${format}`), plan);
      break;
    }
    case "exit":
      await engine.exit();
      break;
  }
  await applyWaitFor(engine, step.waitFor, 15000);
};
