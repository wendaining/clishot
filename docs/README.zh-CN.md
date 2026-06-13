# clishot

`clishot` 是一个通过 YAML 驱动真实终端会话，并生成报告用截图的工具，适合实验报告、课程作业、技术文档和 Agent 自动化工作流。

clishot 构建在 termless 之上，使用 termless core 作为终端自动化和渲染引擎。我们真诚感谢 termless 项目及其贡献者。

## 安装

```bash
npm install -g clishot
```

本地开发：

```bash
npm install
npm run build
node dist/cli/index.js doctor
```

## 基础用法

```bash
clishot record examples/hello.yml --out figures/hello.png
clishot validate examples/hello.yml
clishot doctor
clishot version
```

`record` 必须传入 `--out`。最终主截图路径由 CLI 指定，不写在 YAML 里。

## YAML 示例

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

YAML 不设置 `version` 或 `engine` 字段。工作目录写在 `shell.cwd`，输出缩放倍率写在 `appearance.output.scale`。

## 命令

```bash
clishot record <spec-file> --out <output-file>
clishot validate <spec-file> [--check-runtime]
clishot doctor
clishot version
clishot inspect <capture-dir>
clishot clean <capture-dir>
```

支持 `png`、`jpg`、`jpeg`、`webp`、`svg`。默认格式是 `png`；如果输出扩展名不同，需要显式传入 `--format`。

```bash
clishot record demo.yml --out figures/demo.webp --format webp
```

中途截图通过 screenshot step 生成：

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

## 错误策略

终端内部命令输出的错误属于终端内容，不会默认导致 clishot 失败。例如编译错误、Python traceback、测试失败都应被正常截图。

clishot 只在配置错误、shell 启动失败、waitFor 超时、termless core 不可用、渲染失败或输出写入失败时返回非零。失败时会保留 `tmp/tmp-<timestamp>-<spec>/` 调试产物。

## 跨平台说明

Windows 默认推断 `pwsh -NoLogo`。Linux 和 macOS 默认使用 `$SHELL` 或 `bash`。WSL 通过显式 `shell.program: wsl.exe` 配置支持。

## License

clishot 使用 MIT License。
