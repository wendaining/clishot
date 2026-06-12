import fs from "fs-extra";
import path from "node:path";

export const inspectCommand = async (captureDir: string): Promise<void> => {
  const metadata = path.join(captureDir, "metadata.json");
  const normalized = path.join(captureDir, "normalized.txt");
  if (await fs.pathExists(metadata)) {
    console.log(await fs.readFile(metadata, "utf8"));
  }
  if (await fs.pathExists(normalized)) {
    console.log(await fs.readFile(normalized, "utf8"));
  }
};

