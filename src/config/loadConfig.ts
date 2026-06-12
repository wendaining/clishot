import fs from "fs-extra";
import YAML from "yaml";
import { ClishotError } from "../utils/errors.js";
import { configSchema, type ClishotConfig } from "./schema.js";
import { normalizeConfig } from "./normalizeConfig.js";

export const loadConfig = async (filePath: string): Promise<ClishotConfig> => {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    throw new ClishotError(`Cannot read config file: ${filePath}`, 1, String(error));
  }

  let data: unknown;
  try {
    data = YAML.parse(raw);
  } catch (error) {
    throw new ClishotError("Invalid YAML syntax", 1, String(error));
  }

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if ("version" in record) {
      throw new ClishotError("YAML must not contain a version field.", 1);
    }
    if ("engine" in record) {
      throw new ClishotError("YAML must not contain an engine field.", 1);
    }
  }

  const parsed = configSchema.safeParse(data ?? {});
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("\n");
    throw new ClishotError(`Config validation failed:\n${detail}`, 1);
  }

  return normalizeConfig(parsed.data);
};

