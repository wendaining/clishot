import { z } from "zod";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Expected #RRGGBB color");

const waitForSchema = z.object({
  text: z.string().optional(),
  regex: z.string().optional(),
  idleMs: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
}).strict();

const captureMarkerSchema = z.object({
  text: z.string().optional(),
  regex: z.string().optional(),
  occurrence: z.enum(["first", "last"]).default("first").optional(),
}).strict().refine((value) => value.text || value.regex, {
  message: "A capture marker requires text or regex",
});

const baseStepSchema = z.object({
  waitFor: waitForSchema.optional(),
}).strict();

const waitStepSchema = baseStepSchema.extend({
  type: z.literal("wait"),
  ms: z.number().int().nonnegative(),
});

const sendStepSchema = baseStepSchema.extend({
  type: z.literal("send"),
  text: z.string(),
  enter: z.boolean().default(false).optional(),
});

const keyStepSchema = baseStepSchema.extend({
  type: z.literal("key"),
  combo: z.string().min(1),
});

const resizeStepSchema = baseStepSchema.extend({
  type: z.literal("resize"),
  cols: z.number().int().min(40).max(240),
  rows: z.number().int().min(10).max(80),
});

const screenshotStepSchema = baseStepSchema.extend({
  type: z.literal("screenshot"),
  name: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "Use a filename-safe screenshot name"),
  capture: z.lazy(() => captureSchema).optional(),
});

const exitStepSchema = baseStepSchema.extend({
  type: z.literal("exit"),
});

export const stepSchema = z.discriminatedUnion("type", [
  waitStepSchema,
  sendStepSchema,
  keyStepSchema,
  resizeStepSchema,
  screenshotStepSchema,
  exitStepSchema,
]);

export const captureSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("viewport"),
    onMissingMarker: z.enum(["fail", "fallbackToViewport", "fallbackToLastLines"]).default("fail").optional(),
  }).strict(),
  z.object({
    mode: z.literal("lastLines"),
    lines: z.number().int().positive(),
    onMissingMarker: z.enum(["fail", "fallbackToViewport", "fallbackToLastLines"]).default("fail").optional(),
  }).strict(),
  z.object({
    mode: z.literal("fullScrollback"),
    onMissingMarker: z.enum(["fail", "fallbackToViewport", "fallbackToLastLines"]).default("fail").optional(),
  }).strict(),
  z.object({
    mode: z.literal("textRange"),
    from: captureMarkerSchema.optional(),
    to: captureMarkerSchema.optional(),
    includeFrom: z.boolean().default(true).optional(),
    includeTo: z.boolean().default(true).optional(),
    onMissingMarker: z.enum(["fail", "fallbackToViewport", "fallbackToLastLines"]).default("fail").optional(),
  }).strict().refine((value) => value.from || value.to, {
    message: "capture.mode textRange requires from or to",
  }),
]);

export const configSchema = z.object({
  shell: z.object({
    program: z.string().min(1).optional(),
    args: z.array(z.string()).default([]).optional(),
    cwd: z.string().optional(),
    env: z.record(z.string(), z.string()).default({}).optional(),
    startupTimeoutMs: z.number().int().positive().default(10000).optional(),
  }).strict().default({}),
  terminal: z.object({
    cols: z.number().int().min(40).max(240).default(100).optional(),
    rows: z.number().int().min(10).max(80).default(30).optional(),
    scrollback: z.number().int().positive().default(5000).optional(),
    resizePolicy: z.enum(["fixed", "step-only", "app"]).default("fixed").optional(),
    allowAppResize: z.boolean().default(false).optional(),
  }).strict().default({}),
  appearance: z.object({
    theme: z.object({
      name: z.string().optional(),
      background: hexColor.default("#0c0c0c").optional(),
      foreground: hexColor.default("#cccccc").optional(),
      cursorColor: hexColor.default("#ffffff").optional(),
      selectionBackground: hexColor.default("#264f78").optional(),
    }).strict().default({}).optional(),
    font: z.object({
      family: z.string().default("Cascadia Mono, Consolas, monospace").optional(),
      size: z.number().positive().default(18).optional(),
      weight: z.union([z.string(), z.number()]).default("normal").optional(),
      weightBold: z.union([z.string(), z.number()]).default("bold").optional(),
      lineHeight: z.number().positive().default(1.25).optional(),
      letterSpacing: z.number().default(0).optional(),
    }).strict().default({}).optional(),
    cursor: z.object({
      shape: z.enum(["block", "bar", "underline"]).default("block").optional(),
      blink: z.boolean().default(false).optional(),
    }).strict().default({}).optional(),
    window: z.object({
      enabled: z.boolean().default(true).optional(),
      title: z.string().default("Terminal").optional(),
      frameStyle: z.enum(["windows", "macos", "none"]).default("windows").optional(),
      showControls: z.boolean().default(true).optional(),
      showTabRow: z.boolean().default(false).optional(),
      padding: z.number().int().nonnegative().default(18).optional(),
      margin: z.number().int().nonnegative().default(0).optional(),
      borderRadius: z.number().int().nonnegative().default(10).optional(),
      shadow: z.boolean().default(true).optional(),
    }).strict().default({}).optional(),
    output: z.object({
      scale: z.number().positive().default(2).optional(),
      transparent: z.boolean().default(false).optional(),
      quality: z.number().int().min(1).max(100).default(92).optional(),
    }).strict().default({}).optional(),
  }).strict().default({}),
  capture: captureSchema.default({ mode: "viewport" }),
  limits: z.object({
    stepTimeoutMs: z.number().int().positive().default(15000).optional(),
    totalTimeoutMs: z.number().int().positive().default(120000).optional(),
    maxOutputBytes: z.number().int().positive().default(20000000).optional(),
    onTimeout: z.enum(["capture-and-fail", "capture-and-success", "abort"]).default("capture-and-fail").optional(),
  }).strict().default({}),
  steps: z.array(stepSchema).default([]),
}).strict().superRefine((value, ctx) => {
  const names = new Set<string>();
  value.steps.forEach((step, index) => {
    if (step.type === "screenshot") {
      if (names.has(step.name)) {
        ctx.addIssue({
          code: "custom",
          path: ["steps", index, "name"],
          message: `Duplicate screenshot name: ${step.name}`,
        });
      }
      names.add(step.name);
    }
  });
});

export type ClishotConfig = z.infer<typeof configSchema>;
export type ClishotStep = z.infer<typeof stepSchema>;
export type CaptureConfig = z.infer<typeof captureSchema>;
export type WaitForConfig = z.infer<typeof waitForSchema>;

