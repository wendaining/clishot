import fs from "fs-extra";
import path from "node:path";

export const versionCommand = async (): Promise<void> => {
  const pkgPath = path.resolve("package.json");
  const pkg = await fs.readJson(pkgPath) as { version?: string };
  console.log(pkg.version ?? "0.0.0");
};

