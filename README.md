# clishot

**[中文 README](./docs/README.zh-CN.md)**

`clishot` records real terminal sessions from YAML workflows and turns them into report-ready screenshots for lab reports, coursework, technical docs, and agent automation.

clishot is built on top of termless and uses termless core as its terminal automation and rendering engine. We sincerely thank the termless project and its contributors.

## Quick Start From The Repo

If you just found this repository and want to try it locally, clone it, install dependencies, build the CLI, and run one of the included examples:

```bash
git clone <repo-url> clishot
cd clishot
npm install
npm run build
node dist/cli/index.js doctor
node dist/cli/index.js record examples/hello.yml --out tmp/hello.png --force
```

The generated image will be written to `tmp/hello.png`. Internal debug artifacts are written under `tmp/tmp-*` and are ignored by Git.

During development you can also link the local CLI:

```bash
npm link
clishot doctor
clishot record examples/hello.yml --out tmp/hello.png --force
```

## Install As A CLI

```bash
npm install -g clishot
```

If you installed from npm, use the `clishot` command directly:

```bash
clishot doctor
clishot record examples/hello.yml --out tmp/hello.png --force
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
  mode: fullScrollback

steps:
  - type: send
    text: "python --version"
    enter: true
    waitFor:
      idleMs: 800
```

YAML files do not use `version` or `engine` fields. Working directories belong in `shell.cwd`; output scale belongs in `appearance.output.scale`.
If `capture` is omitted, clishot defaults to `fullScrollback` so the final screenshot includes the whole recorded workflow. Use `capture.mode: viewport` when you only want the visible terminal window.

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

## Agent Skill

This repository includes an Agent-facing Skill at `skills/clishot/SKILL.md`. Use it when an AI agent needs to generate clishot YAML, run `clishot record`, insert screenshots into reports, or debug failed captures.

The Skill is guidance only; it does not add runtime features. Human users can read it as a compact workflow guide, while agents should follow it together with `docs/SPEC.md` and `docs/git-rule.md` when working in this repository.

## License

clishot is released under the MIT License.
