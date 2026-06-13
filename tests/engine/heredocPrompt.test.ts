import { describe, expect, it } from "vitest";
import {
  stripHeredocContinuationPrompts,
  stripHeredocContinuationPromptsFromStyledLines,
} from "../../src/engine/TermlessCoreEngine.js";

describe("heredoc prompt cleanup", () => {
  it("removes zsh heredoc continuation prompts from plain lines", () => {
    expect(stripHeredocContinuationPrompts([
      "heredoc> #include <stdio.h>",
      "heredoc>",
      "int main() {",
    ])).toEqual([
      "#include <stdio.h>",
      "",
      "int main() {",
    ]);
  });

  it("removes heredoc prompts from styled lines while keeping content style", () => {
    const cleaned = stripHeredocContinuationPromptsFromStyledLines([
      [
        { text: "heredoc> ", color: "#666666" },
        { text: "#include <stdio.h>", color: "#cccccc" },
      ],
    ]);

    expect(cleaned).toEqual([
      [{ text: "#include <stdio.h>", color: "#cccccc" }],
    ]);
  });
});
