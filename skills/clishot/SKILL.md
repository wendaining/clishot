---
name: clishot
description: Generate report-ready screenshots from real terminal sessions using YAML workflows and clishot.
---

# clishot Agent Guide

Use clishot when a report, assignment, README, or technical document needs screenshots of a real terminal interaction. clishot is built on top of termless and uses termless core as its terminal automation and rendering engine.

Use clishot for repeatable command demos, compiler runs, REPL sessions, test-case input, and intermediate screenshots. Use termless directly only when you need low-level terminal testing APIs rather than report-oriented YAML workflows. Do not use clishot to fake transcripts, generate prose reports, or run dangerous commands without user approval.

## YAML Specs

Do not add `version` or `engine` fields. Put the working directory in `shell.cwd`; put output scale in `appearance.output.scale`.

```yaml
shell:
  program: pwsh
  args: ["-NoLogo"]
  cwd: "D:/project"

terminal:
  cols: 100
  rows: 30

capture:
  mode: fullScrollback

steps:
  - type: send
    text: "python --version"
    enter: true
    waitFor:
      idleMs: 800
```

Choose `shell.program` explicitly when the workflow depends on a specific shell. On Windows prefer `pwsh` with `["-NoLogo"]`; do not add `-NoProfile` unless the user requests it. On Linux and macOS use `bash`, `zsh`, or the user's `$SHELL` as appropriate.

Keep `appearance.window.title` realistic when setting it. In most cases, use the shell name shown to the user, such as `zsh`, `bash`, `pwsh`, or `cmd`, rather than a descriptive demo title.

## Steps and Waiting

Use `send` for typed commands and test input, `key` for combinations such as `Ctrl+C`, `resize` for deliberate terminal size changes, `wait` for fixed pauses, and `screenshot` for named intermediate images.

Prefer `waitFor.text` or `waitFor.regex` when a program prints a known prompt. Use `waitFor.idleMs` when the command has no stable final marker. Combine them when useful.

Avoid here-documents such as `cat > file <<'EOF'` in report screenshots. They expose shell continuation prompts like `heredoc>` and make the session look less like normal terminal use. For short files, prefer a single `printf` command with quoted lines; for larger files, create the file outside the captured workflow and use the terminal steps to inspect or run it.

```yaml
steps:
  - type: send
    text: "./main"
    enter: true
    waitFor:
      text: "请输入"
  - type: send
    text: "5"
    enter: true
    waitFor:
      idleMs: 1000
```

## Capture Modes

If `capture` is omitted, clishot defaults to `fullScrollback` so the final screenshot contains the whole YAML workflow. Use `viewport` when only the visible terminal window should be captured, `lastLines` for the tail of long output, and `textRange` when the report needs a bounded slice between markers.

## Running clishot

```bash
clishot validate demo.yml
clishot record demo.yml --out figures/demo.png
clishot record demo.yml --out figures/demo.webp --format webp
clishot record demo.yml --out figures/final.png --shots-dir figures/steps
```

Insert images into reports with normal paths:

```markdown
![terminal run](figures/demo.png)
```

```typst
#image("figures/demo.png")
```

```latex
\includegraphics[width=\linewidth]{figures/demo.png}
```

## Error Handling

Compiler errors, Python tracebacks, failed tests, and command-not-found messages are terminal content. They should normally still produce screenshots. clishot errors are configuration failures, wait timeouts, termless core problems, render failures, and output write failures.

When `waitFor` times out, inspect `tmp/tmp-<timestamp>-<spec>/normalized.txt`, `events.jsonl`, and any generated debug images. Do not silently overwrite user files; pass `--force` only when overwriting is intentional.

When modifying the clishot repository itself, follow `docs/git-rule.md` and keep commits small.
