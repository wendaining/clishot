import path from "node:path";
import fs from "fs-extra";
import sharp from "sharp";
import type { ClishotConfig } from "../config/schema.js";
import type { CapturePlan } from "../capture/CapturePlanner.js";
import { assertWritableTarget } from "../utils/fs.js";
import { ClishotError } from "../utils/errors.js";
import type { ImageFormat } from "./imageFormat.js";

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");

export class ScreenshotManager {
  constructor(
    private readonly config: ClishotConfig,
    private readonly format: ImageFormat,
    private readonly force: boolean,
  ) {}

  async write(filePath: string, plan: CapturePlan): Promise<void> {
    await assertWritableTarget(filePath, this.force);
    const svg = this.renderSvg(plan);
    try {
      if (this.format === "svg") {
        await fs.writeFile(filePath, svg, "utf8");
        return;
      }
      const quality = this.config.appearance.output?.quality ?? 92;
      let pipeline = sharp(Buffer.from(svg));
      if (this.format === "png") {
        pipeline = pipeline.png();
      } else if (this.format === "webp") {
        pipeline = pipeline.webp({ quality });
      } else {
        pipeline = pipeline.jpeg({ quality });
      }
      await pipeline.toFile(filePath);
    } catch (error) {
      throw new ClishotError(`Failed to render image: ${path.basename(filePath)}`, 4, String(error));
    }
  }

  renderSvg(plan: CapturePlan): string {
    const appearance = this.config.appearance;
    const font = appearance.font!;
    const output = appearance.output!;
    const win = appearance.window!;
    const theme = appearance.theme!;
    const fontSize = font.size ?? 18;
    const lineHeight = fontSize * (font.lineHeight ?? 1.25);
    const charWidth = fontSize * 0.62 + (font.letterSpacing ?? 0);
    const terminalWidth = Math.ceil(plan.cols * charWidth);
    const terminalHeight = Math.ceil(Math.max(plan.rows, plan.lines.length) * lineHeight);
    const padding = win.enabled ? (win.padding ?? 18) : 0;
    const titleBarHeight = win.enabled ? 36 : 0;
    const margin = win.margin ?? 0;
    const width = Math.ceil((terminalWidth + padding * 2 + margin * 2) * (output.scale ?? 1));
    const height = Math.ceil((terminalHeight + padding * 2 + titleBarHeight + margin * 2) * (output.scale ?? 1));
    const scale = output.scale ?? 1;
    const background = output.transparent ? "transparent" : theme.background;
    const textX = margin + padding;
    const textY = margin + titleBarHeight + padding + fontSize;

    const showsMacControls = win.showControls && win.frameStyle === "macos";
    const controls = showsMacControls
      ? `<circle cx="${margin + 18}" cy="${margin + 18}" r="5" fill="#ff5f56"/><circle cx="${margin + 36}" cy="${margin + 18}" r="5" fill="#ffbd2e"/><circle cx="${margin + 54}" cy="${margin + 18}" r="5" fill="#27c93f"/>`
      : "";
    const titleX = showsMacControls ? margin + 74 : margin + 14;
    const title = win.title
      ? `<text x="${titleX}" y="${margin + 23}" fill="#d6d6d6" font-size="13" font-family="${escapeXml(font.family ?? "monospace")}">${escapeXml(win.title)}</text>`
      : "";
    const lines = plan.styledLines.map((line, index) =>
      `<text x="${textX}" y="${textY + index * lineHeight}" xml:space="preserve">${line.map((segment) => {
        const fill = segment.color ? ` fill="${segment.color}"` : "";
        return `<tspan${fill}>${escapeXml(segment.text)}</tspan>`;
      }).join("")}</text>`
    ).join("");

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width / scale} ${height / scale}">
  <rect width="100%" height="100%" fill="${background}"/>
  ${win.enabled ? `<rect x="${margin}" y="${margin}" width="${terminalWidth + padding * 2}" height="${terminalHeight + padding * 2 + titleBarHeight}" rx="${win.borderRadius ?? 10}" fill="${theme.background}"/>` : ""}
  ${win.enabled ? `<rect x="${margin}" y="${margin}" width="${terminalWidth + padding * 2}" height="${titleBarHeight}" rx="${win.borderRadius ?? 10}" fill="#202020"/>${controls}${title}` : ""}
  <g font-family="${escapeXml(font.family ?? "monospace")}" font-size="${fontSize}" font-weight="${String(font.weight ?? "normal")}" fill="${theme.foreground}">
    ${lines}
  </g>
</svg>
`;
  }
}
