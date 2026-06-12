import type { WaitForConfig } from "../config/schema.js";
import type { TermlessCoreEngine } from "./TermlessCoreEngine.js";

export const applyWaitFor = async (
  engine: TermlessCoreEngine,
  waitFor: WaitForConfig | undefined,
  defaultTimeoutMs: number,
): Promise<void> => {
  if (!waitFor) return;
  const timeoutMs = waitFor.timeoutMs ?? defaultTimeoutMs;
  if (waitFor.text) await engine.waitForText(waitFor.text, timeoutMs);
  if (waitFor.regex) await engine.waitForRegex(waitFor.regex, timeoutMs);
  if (waitFor.idleMs) await engine.waitForIdle(waitFor.idleMs, timeoutMs);
};

