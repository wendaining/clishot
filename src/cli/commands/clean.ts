import fs from "fs-extra";

export const cleanCommand = async (captureDir: string): Promise<void> => {
  await fs.remove(captureDir);
  console.log(`Removed ${captureDir}`);
};

