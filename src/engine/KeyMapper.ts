const controlMap: Record<string, string> = {
  "ctrl+c": "\x03",
  "ctrl+d": "\x04",
  "ctrl+z": "\x1a",
  "ctrl+l": "\x0c",
  enter: "\r",
  return: "\r",
  tab: "\t",
  escape: "\x1b",
  esc: "\x1b",
  backspace: "\x7f",
  up: "\x1b[A",
  down: "\x1b[B",
  right: "\x1b[C",
  left: "\x1b[D",
};

export const mapKeyCombo = (combo: string): string => {
  const key = combo.trim().toLowerCase();
  const mapped = controlMap[key];
  if (mapped) return mapped;
  if (key.length === 1) return combo;
  throw new Error(`Unsupported key combo: ${combo}`);
};

