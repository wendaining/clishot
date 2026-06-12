export type ExitCode = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export class ClishotError extends Error {
  constructor(
    message: string,
    readonly code: ExitCode,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "ClishotError";
  }
}

export const exitCodeName = (code: ExitCode): string => {
  switch (code) {
    case 1:
      return "configuration error";
    case 2:
      return "shell startup error";
    case 3:
      return "step execution error";
    case 4:
      return "render error";
    case 5:
      return "output write error";
    case 6:
      return "cancelled";
    case 7:
      return "termless core unavailable";
    case 8:
      return "unknown error";
  }
};

