import path from "node:path";
import { ClishotError } from "../utils/errors.js";

export type ImageFormat = "png" | "jpg" | "jpeg" | "webp" | "svg";

export const normalizeFormat = (format: string | undefined): ImageFormat => {
  const value = (format ?? "png").toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "svg"].includes(value)) {
    return value as ImageFormat;
  }
  throw new ClishotError(`Unsupported image format: ${format}`, 1, "Use png, jpg, jpeg, webp, or svg.");
};

export const assertOutputExtension = (outFile: string, format: ImageFormat, explicitFormat: boolean): void => {
  const ext = path.extname(outFile).replace(/^\./, "").toLowerCase();
  const canonical = format === "jpeg" ? "jpg" : format;
  const canonicalExt = ext === "jpeg" ? "jpg" : ext;
  if (!ext) {
    throw new ClishotError("Output path must include an image extension.", 1);
  }
  if (canonicalExt !== canonical) {
    const hint = explicitFormat
      ? `Use an output filename ending in .${format}.`
      : `Default format is png. Add --format ${ext} or use a .png output path.`;
    throw new ClishotError(`Output extension .${ext} does not match format ${format}.`, 1, hint);
  }
};

