# clishot

`clishot` records real terminal sessions from YAML workflows and turns them into report-ready screenshots for lab reports, coursework, technical docs, and agent automation.

clishot is built on top of termless and uses termless core as its terminal automation and rendering engine. We sincerely thank the termless project and its contributors.

## Install

```bash
npm install -g clishot
```

For local development:

```bash
npm install
npm run build
node dist/cli/index.js doctor
```

## Basic Usage

```bash
clishot record examples/hello.yml --out figures/hello.png
clishot validate examples/hello.yml
clishot doctor
clishot version
```

`record` always requires `--out`. The final image path belongs to the CLI, not the YAML file.

## YAML Example

```yaml
shell:
  program: pwsh
  args: ["-NoLogo"]

terminal:
  cols: 100
  rows: 30

appearance:
  output:
    scale: 2

capture:
  mode: viewport

steps:
  - type: send
    text: "python --version"
    enter: true
    waitFor:
      idleMs: 800
```

YAML files do not use `version` or `engine` fields. Working directories belong in `shell.cwd`; output scale belongs in `appearance.output.scale`.

## Commands

```bash
clishot record <spec-file> --out <output-file>
clishot validate <spec-file> [--check-runtime]
clishot doctor
clishot version
clishot inspect <capture-dir>
clishot clean <capture-dir>
```

Supported output formats are `png`, `jpg`, `jpeg`, `webp`, and `svg`. The default is `png`; if the output extension differs, pass an explicit `--format`.

```bash
clishot record demo.yml --out figures/demo.webp --format webp
```

Screenshot steps write named intermediate screenshots:

```yaml
steps:
  - type: send
    text: "gcc main.c -o main"
    enter: true
    waitFor:
      idleMs: 800
  - type: screenshot
    name: "after-compile"
```

```bash
clishot record demo.yml --out figures/final.png --shots-dir figures/steps
```

## Error Policy

Errors printed by commands inside the terminal are terminal content, not clishot failures. For example, a compiler error or Python traceback should still be captured.

clishot fails for configuration errors, shell startup failure, wait timeouts, termless core unavailability, render failures, and output write failures. Failed runs keep `tmp/tmp-<timestamp>-<spec>/` debug artifacts.

## Cross Platform Notes

Windows defaults to `pwsh -NoLogo` when no shell is configured. Linux and macOS use `$SHELL` or `bash`. WSL is supported through explicit `shell.program: wsl.exe` configuration.

## License

clishot is released under the MIT License.
