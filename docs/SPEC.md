# clishot 项目 SPEC

## 1. 项目定位

`clishot` 是一个面向实验报告、课程作业、技术文档和 Agent 自动化工作流的终端会话截图工具。

它的核心目标是：让用户或 Agent 通过 YAML 配置文件控制一个真实 shell 会话，按步骤输入命令、输入测试数据、等待输出、发送特殊按键、改变终端尺寸、生成中途截图和最终截图，并把真实终端画面插入 Markdown、Typst、LaTeX、Word、PDF 等报告或文档中。

`clishot` 不提供 transcript 伪造模式。用户和 Agent 不应手写一段“看起来像终端”的文本再渲染成截图。截图内容应来自真实 PTY 会话，用户输入也应通过真实终端输入能力写入，尽量模拟真实人在终端中操作的过程。

一句话定位：

```text
clishot = report-oriented YAML workflow + termless core engine + clishot-specific report screenshot features
```

也就是说：

```text
termless core：
  负责真实终端执行、终端 buffer、输入、按键、resize、截图等底层能力。

clishot：
  负责 YAML schema、报告截图语义、中途截图、主输出路径、capture 策略、错误策略、Agent Skill、文档和调试产物。
```

## 2. 与 termless 的关系

`termless` 是 `clishot` 的底层终端执行与渲染基础。

`clishot` 正式实现必须优先使用 `termless core / programmatic API`，不以调用 `termless CLI` 作为主要执行方式。

`clishot` 应通过 termless core 复用以下能力：

```text
创建终端实例。
启动真实进程 / shell。
PTY 输入输出。
输入文本。
发送按键。
resize 终端。
访问 screen / scrollback / buffer / viewport。
访问 terminal cell / row / range。
生成截图。
读取终端状态。
```

`clishot` 不应重复实现以下底层能力：

```text
不自研完整 PTY 抽象层。
不自研完整 ANSI / VT 解析器。
不自研完整终端 cell buffer。
不自研完整终端截图渲染器。
不把 termless CLI 当成正式执行路径。
不把 YAML 编译为 .tape 再执行。
不 fork termless 作为默认实现方式。
不 vendoring termless 源码作为默认实现方式。
```

但是，如果 `clishot` 需要的高层能力 termless core 暂时没有，`clishot` 应优先自己实现，而不是等待 termless 上游支持。

这类能力包括但不限于：

```text
YAML schema。
YAML 到 termless core 操作的执行器。
waitFor.text / regex / idleMs 的组合等待策略。
capture.textRange。
capture.lastLines。
capture.fullScrollback。
onTimeout 策略。
onMissingMarker 策略。
screenshot step 命名输出。
--shots-dir 输出规则。
debug artifacts。
normalized.txt。
Agent-friendly 错误提示。
报告插图路径和格式规则。
```

实现原则：

```text
如果 termless core 已经有能力：
  clishot 应调用 termless core。

如果 termless core 有接近能力但不完全符合 clishot 需求：
  clishot 应在适配层中组合 termless core API 实现。

如果 termless core 完全没有某项 clishot 需要的高层能力：
  clishot 应在自己的 src/engine、src/capture、src/output 或 src/utils 中实现。

如果发现 termless core 有 bug：
  clishot 可以先在适配层中 workaround。
  后续可以给 termless 提 issue 或 PR，但不把等待上游修复作为 clishot 实现前提。
```

## 3. 如何利用 termless repo

`clishot` 使用 termless 的方式分为三层。

第一层：正式依赖。

```text
clishot 应通过 package.json 依赖 termless core 相关 npm 包。
例如：
  @termless/core
  @termless/xtermjs 或其他默认 backend
  termless 截图所需的相关包
```

具体包名以 termless 当前实际发布的 npm 包为准。实现时应锁定一个明确的最低兼容版本，并在 `doctor` 中检查版本。

第二层：上游参考。

```text
开发时可以 clone termless repo 到本地作为参考。
可以阅读 termless 的 README、docs、examples、tests 和 API reference。
可以参考 termless 的官方示例来理解 core API 的正确用法。
```

推荐本地目录结构：

```text
workspace/
  clishot/
  termless/
```

`clishot` 仓库中不应硬编码依赖这个相邻目录。它只用于开发者阅读、调试和对照。

第三层：适配与补齐。

`clishot` 应提供一个稳定的内部适配层：

```text
src/engine/TermlessCoreEngine.ts
```

项目其他模块不应到处直接调用 termless API。所有 termless 相关调用都应尽量集中在 `TermlessCoreEngine` 或少量相关 adapter 中。

推荐结构：

```text
src/engine/
  TermlessCoreEngine.ts
  StepRunner.ts
  Waiter.ts
  ResizeController.ts
  KeyMapper.ts

src/capture/
  CapturePlanner.ts
  TextRangeCapture.ts
  LastLinesCapture.ts
  FullScrollbackCapture.ts

src/output/
  ScreenshotManager.ts
  imageFormat.ts
  paths.ts
```

这样做的原因是：

```text
termless API 如果变化，只需要主要修改适配层。
clishot 的 YAML、CLI、文档、错误处理不直接绑定 termless 内部细节。
clishot 自己补齐的功能可以和 termless core 能力清晰分层。
```

关于复制代码：

```text
默认不复制 termless 源码。
如果确实必须参考或移植少量代码，必须：
  1. 确认 termless License 允许。
  2. 在代码注释中标明来源。
  3. 保留必要的 License 说明。
  4. 优先把这类代码放在 src/vendor 或 src/compat 下。
  5. 在 README 或 NOTICE 中说明。
```

推荐做法仍然是：依赖 npm 包，而不是复制源码。

## 4. 非目标

`clishot` 不做以下事情：

```text
不复刻 Windows Terminal 本体。
不读取或解析 Windows Terminal settings.json。
不保证一比一还原 Windows Terminal 的背景图片、Acrylic 材质、标签页、快捷键系统。
不提供 transcript 伪造模式。
不生成实验报告正文。
不理解实验原理。
不替用户判断命令是否安全。
不自动绕过系统权限。
不默认静默覆盖文件。
不承诺所有全屏 TUI 程序完美截图。
不承诺 vim、top、htop、nano、curses、复杂动态进度条在所有平台下完全一致。
不把 termless CLI 当成正式实现方式。
不把 .tape 当成正式中间格式。
```

`clishot` 所谓兼容 `oh-my-posh` / `oh-my-zsh`，含义是：

```text
clishot 应启动真实交互 shell。
除非用户显式禁用，否则应尽量加载用户自己的 shell profile。
prompt、颜色、图标、当前路径、Git 状态等效果应尽量接近用户自己在终端中运行时的样子。
```

## 5. 项目名称、License 和仓库结构

项目名和仓库名统一为：

```text
clishot
```

CLI 二进制名称统一为：

```bash
clishot
```

License：

```text
clishot 使用 MIT License。
仓库根目录必须提供 LICENSE 文件。
package.json 中 license 字段必须为 MIT。
README.md 和 docs/README.zh-CN.md 中都应注明本项目使用 MIT License。
```

推荐仓库结构：

```text
clishot/
  README.md
  LICENSE
  package.json
  tsconfig.json

  src/
    cli/
      index.ts
      commands/
        record.ts
        validate.ts
        doctor.ts
        inspect.ts
        clean.ts
        version.ts

    config/
      schema.ts
      loadConfig.ts
      normalizeConfig.ts

    engine/
      TermlessCoreEngine.ts
      StepRunner.ts
      Waiter.ts
      ResizeController.ts
      KeyMapper.ts

    capture/
      CapturePlanner.ts
      TextRangeCapture.ts
      LastLinesCapture.ts
      FullScrollbackCapture.ts

    output/
      ScreenshotManager.ts
      imageFormat.ts
      paths.ts
      artifacts.ts
      reportSnippets.ts

    platform/
      detectPlatform.ts
      detectShell.ts
      detectTermless.ts
      detectFonts.ts

    utils/
      fs.ts
      logger.ts
      errors.ts
      time.ts

  docs/
    SPEC.md
    README.zh-CN.md
    git-rule.md
    examples/

  examples/
    hello.yml
    gcc.yml
    python-repl.yml
    interactive-input.yml

  tests/
    config/
    record/
    capture/
    fixtures/
```

文档语言要求：

```text
README.md：
  英文。
  面向普通用户，介绍 clishot 的用途、安装、基础用法和示例。

docs/README.zh-CN.md：
  中文。
  README 的中文版本。

docs/SPEC.md：
  中文。
  即本文档主体。

docs/SKILL.md：
  英文。
  面向 Agents，说明 Agent 应如何生成 YAML、调用 clishot、处理输出图片、处理错误。

docs/git-rule.md：
  规定本项目的提交粒度、提交信息格式和开发过程要求。
```

## 6. 技术路线

推荐技术栈：

```text
Node.js
TypeScript
termless core / programmatic API
termless backend，例如 xterm.js backend
YAML
Zod
commander 或 cac
fs-extra
pino 或 consola
```

`clishot` 只实现一种正式执行后端：

```text
termless core 后端。
```

不实现以下正式后端：

```text
termless CLI 后端。
auto 后端。
.tape 编译后端。
```

也就是说，正式架构中不提供：

```bash
clishot compile
clishot record --engine cli
clishot record --termless-bin ...
```

允许开发者在本地手动使用 termless CLI 做调试或对照，但这不属于 `clishot` 的正式执行路径。

## 7. CLI 总体设计

CLI 必须提供以下命令：

```bash
clishot record <spec-file> --out <output-file>
clishot validate <spec-file>
clishot doctor
clishot version
```

可以提供以下辅助命令：

```bash
clishot inspect <capture-dir>
clishot clean <capture-dir>
```

不提供以下命令：

```bash
clishot compile
```

其中 `record` 是核心命令。

## 8. `clishot record`

### 8.1 基本形式

```bash
clishot record <spec-file> --out <output-file>
```

示例：

```bash
clishot record examples/gcc.yml --out figures/gcc-test.png
```

`--out` 是必填参数。最终主截图输出路径只能由 CLI 的 `--out` 指定，YAML 中不能指定最终主输出图片路径。

### 8.2 参数

```text
<spec-file>
  必填。
  YAML 配置文件路径。

--out <output-file>
  必填。
  最终主截图输出路径。

--format <format>
  可选。
  输出图片格式。
  可选值：png、jpg、jpeg、webp、svg。
  默认：png。

--force
  可选。
  允许覆盖已存在的输出文件。
  默认不覆盖。

--debug
  可选。
  输出更详细的调试日志。
  同时保留临时 capture 目录。

--capture-dir <dir>
  可选。
  指定内部录制产物目录。
  如果不指定，默认使用：
  tmp/tmp-<timestamp>-<spec-basename>/

--shots-dir <dir>
  可选。
  指定 screenshot step 产生的正式中途截图输出目录。
  如果 YAML 中存在 screenshot step，且未指定 --shots-dir，则默认输出到：
  <主输出文件所在目录>/<主输出文件名不含扩展名>-shots/

--no-clean
  可选。
  即使执行成功，也保留 capture 目录。

--timeout <ms>
  可选。
  覆盖 YAML 中的 limits.totalTimeoutMs。
```

明确不提供以下 CLI 参数：

```text
--scale
  不提供。
  输出缩放倍率必须写在 YAML 的 appearance.output.scale 中。

--cwd
  不提供。
  工作目录必须写在 YAML 的 shell.cwd 中。

--engine
  不提供。
  clishot 只支持 termless core 后端。

--termless-bin
  不提供。
  clishot 不通过调用 termless CLI 执行。
```

### 8.3 图片格式规则

`--format` 是图片编码格式的唯一 CLI 控制参数。

支持格式：

```text
png
jpg
jpeg
webp
svg
```

规则：

```text
默认格式是 png。
jpg 和 jpeg 等价。
如果 --format 未指定，则使用 png。
如果 --out 扩展名与 --format 不一致，应报错。
```

示例：

```bash
clishot record gcc.yml --out figures/gcc.png
```

等价于：

```bash
clishot record gcc.yml --out figures/gcc.png --format png
```

合法：

```bash
clishot record gcc.yml --out figures/gcc.webp --format webp
```

不合法：

```bash
clishot record gcc.yml --out figures/gcc.webp
```

原因：

```text
默认格式是 png，但输出扩展名是 webp。
错误提示应建议用户添加 --format webp。
```

合法：

```bash
clishot record gcc.yml --out figures/gcc.svg --format svg
```

### 8.4 退出码

```text
0
  成功生成截图。

1
  配置文件格式错误。

2
  shell 启动失败。

3
  step 执行失败，例如 waitFor 超时。

4
  渲染失败。

5
  输出文件写入失败。

6
  用户取消，例如 Ctrl+C。

7
  termless core 不可用或版本不兼容。

8
  其他未知错误。
```

终端内部命令输出的错误，例如 `gcc` 编译错误、Python traceback、命令不存在、测试用例不通过，默认都视为“终端内容”，不视为 `clishot` 工具失败。

`clishot` 失败只表示配置解析、shell 启动、录制流程、等待流程、termless core 调用、截图渲染或文件写入失败。

## 9. `clishot validate`

基本形式：

```bash
clishot validate <spec-file>
```

作用：

```text
解析 YAML。
校验字段类型。
校验 shell.program。
校验 terminal.cols / terminal.rows。
校验 appearance 配置。
校验 steps。
校验 capture 配置。
校验 screenshot step 的 name 是否重复。
校验 resize 策略是否合法。
报告互相冲突的字段。
```

`validate` 默认不启动 shell，不执行任何用户命令。

可选增强：

```bash
clishot validate <spec-file> --check-runtime
```

`--check-runtime` 可以额外检查：

```text
termless core 是否可用。
shell.program 是否存在。
shell.cwd 是否存在。
appearance.background.image 是否存在。
字体是否可能存在。
```

但它仍然不得执行 YAML 中的 steps。

## 10. `clishot doctor`

基本形式：

```bash
clishot doctor
```

作用：

```text
检查 Node.js 版本。
检查 clishot 自身版本。
检查 termless core 是否可用。
检查 termless 版本是否满足当前 clishot 要求。
检查 termless backend 是否可用。
检查 termless core 的 PTY 支持是否可用。
检查 termless core 的截图能力是否可用。
检查当前平台是否支持 PTY / ConPTY。
检查常见 shell 是否存在，例如 pwsh、powershell.exe、bash、zsh、wsl.exe。
尽量检查常见 Nerd Font 是否可用。
输出当前系统平台、架构、默认 shell 推断结果。
缺少依赖时输出可操作建议。
```

`doctor` 不能修改用户系统，只能检查和输出建议。

## 11. YAML 配置总览

YAML 配置文件不设置 `version` 字段。

YAML 配置文件不设置 `engine` 字段。

示例：

```yaml
shell:
  program: pwsh
  args: ["-NoLogo"]
  cwd: "C:/Users/endle/Desktop/exp"
  env:
    TERM: xterm-256color
    COLORTERM: truecolor

terminal:
  cols: 110
  rows: 32
  scrollback: 5000
  resizePolicy: fixed
  allowAppResize: false

appearance:
  theme:
    name: dark
    background: "#0c0c0c"
    foreground: "#cccccc"
    cursorColor: "#ffffff"
    selectionBackground: "#264f78"

  font:
    family: "CaskaydiaCove Nerd Font"
    size: 18
    weight: normal
    weightBold: bold
    lineHeight: 1.25
    letterSpacing: 0

  cursor:
    shape: block
    blink: false

  window:
    enabled: true
    title: "PowerShell"
    frameStyle: windows
    showControls: true
    showTabRow: false
    padding: 18
    margin: 0
    borderRadius: 10
    shadow: true

  output:
    scale: 2
    transparent: false
    quality: 92

capture:
  mode: viewport

limits:
  stepTimeoutMs: 15000
  totalTimeoutMs: 120000
  maxOutputBytes: 20000000
  onTimeout: capture-and-fail

steps:
  - type: wait
    ms: 1000

  - type: send
    text: "gcc main.c -o main"
    enter: true
    waitFor:
      idleMs: 800
      timeoutMs: 10000

  - type: send
    text: "./main"
    enter: true
    waitFor:
      text: "请输入"
      timeoutMs: 10000

  - type: send
    text: "5"
    enter: true
    waitFor:
      idleMs: 1000
      timeoutMs: 10000
```

## 12. `shell`

`shell` 用于定义要启动的真实 shell 或程序。

```yaml
shell:
  program: pwsh
  args: ["-NoLogo"]
  cwd: "C:/Users/endle/Desktop/exp"
  env:
    TERM: xterm-256color
    COLORTERM: truecolor
  startupTimeoutMs: 10000
```

字段：

```text
program
  必填。
  要启动的 shell 或程序。
  例：pwsh、powershell.exe、cmd.exe、bash、zsh、wsl.exe。

args
  可选。
  启动参数。
  PowerShell 推荐 ["-NoLogo"]。
  不要默认加 -NoProfile。
  zsh 推荐 ["-i"]。
  bash 推荐 ["-i"] 或 ["--login", "-i"]，由用户自行决定。

cwd
  可选。
  工作目录。
  如果不设置，则继承 clishot 进程的当前目录。

env
  可选。
  附加环境变量。
  默认应注入 TERM=xterm-256color、COLORTERM=truecolor，除非用户显式覆盖。

startupTimeoutMs
  可选。
  shell 启动等待时间。
```

默认 shell 推断：

```text
Windows：
  优先 pwsh -NoLogo。
  如果 pwsh 不存在，尝试 powershell.exe -NoLogo。
  不默认使用 cmd.exe。

Linux / macOS：
  优先读取 SHELL 环境变量。
  如果 SHELL 不存在，使用 bash。

WSL：
  不自动猜测。
  用户可以在 Windows 中显式设置 wsl.exe，也可以在 WSL 内运行 clishot 时使用 bash / zsh。
```

## 13. `terminal`

`terminal` 定义终端尺寸、scrollback 和 resize 策略。

```yaml
terminal:
  cols: 110
  rows: 32
  scrollback: 5000
  resizePolicy: fixed
  allowAppResize: false
```

字段：

```text
cols
  可选，默认 100。
  终端列数。
  推荐范围：80-140。

rows
  可选，默认 30。
  终端行数。
  推荐范围：20-50。

scrollback
  可选，默认 5000。
  最大滚动缓冲区行数。

resizePolicy
  可选，默认 fixed。
  可选值：fixed、step-only、app。

allowAppResize
  可选，默认 false。
  是否允许终端应用请求改变窗口大小。
```

PTY 启动后必须设置为 `cols × rows`。截图渲染也必须使用一致的初始尺寸，否则录制和渲染时的换行位置可能不一致。

### 13.1 resize 策略

默认行为：

```yaml
terminal:
  resizePolicy: fixed
  allowAppResize: false
```

含义：

```text
终端尺寸由 terminal.cols 和 terminal.rows 决定。
程序发出的 resize 请求默认忽略。
这样能让实验报告截图更稳定、更可复现。
```

显式 resize step：

```yaml
- type: resize
  cols: 120
  rows: 35
```

执行 resize step 时，`clishot` 必须：

```text
调用 termless core / PTY resize。
记录 resize event。
确保后续截图使用 resize 后尺寸。
```

程序请求 resize：

```yaml
terminal:
  resizePolicy: app
  allowAppResize: true
```

在此模式下，`clishot` 可以尝试识别常见窗口操作控制序列，例如：

```text
CSI 8 ; rows ; cols t
```

如果 termless core 已经暴露 app resize 事件，则使用 termless core 能力。

如果 termless core 没有直接暴露该能力，`clishot` 可以在自身输出监听或事件层识别常见 resize 控制序列，并执行最小实现。

建议安全范围：

```text
最小：40 × 10
最大：240 × 80
```

推荐默认值：

```yaml
terminal:
  resizePolicy: fixed
  allowAppResize: false
```

## 14. `appearance`

`appearance` 提供报告截图所需的外观客制化能力。它应尽量映射到 termless core / backend 已有主题、字体、窗口框架和截图配置。

如果 termless core / backend 不支持某些非关键外观字段，`clishot` 应优先在自身截图后处理或 wrapper 层补齐。

如果短期无法实现某个非关键外观字段，应输出 warning，而不是直接失败。

### 14.1 主题

```yaml
appearance:
  theme:
    name: dark
    background: "#0c0c0c"
    foreground: "#cccccc"
    cursorColor: "#ffffff"
    selectionBackground: "#264f78"
```

必须支持：

```text
name
background
foreground
cursorColor
selectionBackground
black
red
green
yellow
blue
magenta
cyan
white
brightBlack
brightRed
brightGreen
brightYellow
brightBlue
brightMagenta
brightCyan
brightWhite
```

规则：

```text
如果只设置 name: dark，则使用内置深色主题。
如果只设置 name: light，则使用内置浅色主题。
如果 name 对应 termless / backend 内置主题，则优先使用底层主题。
如果设置了具体颜色，则具体颜色覆盖内置主题。
```

### 14.2 字体

```yaml
appearance:
  font:
    family: "CaskaydiaCove Nerd Font"
    size: 18
    weight: normal
    weightBold: bold
    lineHeight: 1.25
    letterSpacing: 0
```

字段：

```text
family
  字体族。
  为了兼容 oh-my-posh / oh-my-zsh 图标，推荐 Nerd Font。

size
  字号，单位 px。

weight
  普通字体粗细。

weightBold
  粗体字体粗细。

lineHeight
  行高倍率。

letterSpacing
  字符间距，单位 px。
```

如果指定字体不存在，`clishot` 应输出 warning，但不应直接失败。

### 14.3 光标

```yaml
appearance:
  cursor:
    shape: block
    blink: false
```

字段：

```text
shape
  可选值：block、bar、underline。

blink
  是否闪烁。
  静态截图默认 false。
```

### 14.4 窗口外框

```yaml
appearance:
  window:
    enabled: true
    title: "PowerShell"
    frameStyle: windows
    showControls: true
    showTabRow: false
    padding: 18
    margin: 0
    borderRadius: 10
    shadow: true
    border:
      enabled: false
      color: "#303030"
      width: 1
```

字段：

```text
enabled
  是否绘制终端窗口外框。

title
  窗口标题。

frameStyle
  可选值：windows、macos、minimal、none。

showControls
  是否绘制窗口控制按钮。

showTabRow
  是否绘制类似标签栏的区域。
  默认 false。

padding
  终端内容和窗口外框之间的内边距。

margin
  图片最外侧留白。

borderRadius
  窗口圆角半径。

shadow
  是否绘制阴影。

border.enabled
  是否绘制边框。

border.color
  边框颜色。

border.width
  边框宽度。
```

如果 termless 截图能力不能直接绘制窗口外框，`clishot` 应自己实现窗口外框合成。

窗口外框属于 `clishot` 面向报告截图的产品能力，不应因为 termless core 未提供而放弃。

### 14.5 输出

```yaml
appearance:
  output:
    scale: 2
    transparent: false
    quality: 92
```

字段：

```text
scale
  输出缩放倍率。
  默认 2。
  用于生成更清晰的报告截图。
  只能在 YAML 中配置，CLI 不提供 --scale。

transparent
  是否使用透明背景。
  默认 false。
  对 jpg / jpeg 无效，因为 jpg 不支持透明。

quality
  jpg / jpeg / webp 输出质量，1-100。
  默认 92。
  png / svg 忽略该字段。
```

如果 termless core 不直接支持 jpg / webp，`clishot` 应自己做图片格式转换。

## 15. Steps

`steps` 定义 Agent 如何控制终端。

必须支持以下 step 类型：

```text
wait
send
key
resize
screenshot
exit
```

可以支持以下高级 step 类型：

```text
require
hide
show
```

### 15.1 `wait`

```yaml
- type: wait
  ms: 1000
```

字段：

```text
ms
  必填。
  等待毫秒数。
```

### 15.2 `send`

```yaml
- type: send
  text: "gcc main.c -o main"
  enter: true
  waitFor:
    idleMs: 800
    timeoutMs: 10000
```

字段：

```text
text
  必填。
  要输入的文本。

enter
  可选，默认 false。
  true 表示输入文本后发送 Enter。

delayMs
  可选。
  模拟逐字符输入时，每个字符之间的等待时间。
  默认 0，表示一次性写入。

waitFor
  可选。
  发送后等待条件。
```

要求：

```text
send 必须通过真实终端输入能力写入。
不得用 echo、pipe、here-doc 替代用户输入。
这样才能让程序认为输入来自真实终端。
```

### 15.3 `key`

`key` 用于发送特殊按键，例如 Ctrl+C、Tab、方向键、Esc。

示例：

```yaml
- type: key
  key: Enter

- type: key
  key: Tab

- type: key
  key: ArrowUp

- type: key
  key: c
  ctrl: true

- type: key
  combo: Ctrl+C
```

字段：

```text
key
  单个按键名称。
  推荐使用 KeyboardEvent.key 风格命名。

combo
  组合键字符串。
  例如 Ctrl+C、Ctrl+D、Alt+Enter、Ctrl+Shift+P。
  如果同时存在 key 和 combo，应报错。

ctrl
alt
shift
meta
  可选布尔值。
  和 key 一起使用。

waitFor
  可选。
  发送按键后等待条件。
```

必须支持的 key 名称：

```text
Enter
Tab
Escape
Backspace
Delete
Insert
Home
End
PageUp
PageDown
ArrowUp
ArrowDown
ArrowLeft
ArrowRight
F1
F2
F3
F4
F5
F6
F7
F8
F9
F10
F11
F12
```

必须支持的组合键：

```text
Ctrl+C
Ctrl+D
Ctrl+Z
Ctrl+L
Ctrl+R
Ctrl+U
Ctrl+K
Ctrl+A
Ctrl+E
Ctrl+W
Alt+Enter
Shift+Enter
```

映射原则：

```text
优先使用 termless core 已有 key / press 能力。
如果 termless core 不支持某个常用组合键，clishot 应在 KeyMapper 中自己补齐。
如果无法可靠跨平台映射，应报错，并提示用户使用 raw。
```

高级用法：

```yaml
- type: key
  raw: "\u001b[1;5D"
```

`raw` 表示直接向终端写入原始控制序列，用于处理复杂快捷键或特殊终端序列。

### 15.4 `resize`

```yaml
- type: resize
  cols: 120
  rows: 35
  waitFor:
    idleMs: 500
```

字段：

```text
cols
rows
waitFor
```

执行 `resize` step 时，`clishot` 必须：

```text
调用 termless core / PTY resize。
记录 resize event。
确保后续截图使用 resize 后尺寸。
```

不建议在一个截图任务中频繁 resize，因为 resize 会改变换行位置，可能影响最终截图可读性。

### 15.5 `screenshot`

`screenshot` 是正式截图输出，不是临时辅助产物。

示例：

```yaml
- type: screenshot
  name: "after-compile"
```

字段：

```text
name
  必填。
  中途截图名称。
  只能使用安全文件名字符：字母、数字、短横线、下划线。
  不应包含路径分隔符。

capture
  可选。
  覆盖当前 screenshot 的截图区域配置。
  如果不设置，则使用全局 capture 配置。

waitFor
  可选。
  截图前等待条件。
```

中途截图输出规则：

```text
如果存在 screenshot step，clishot 应将它们作为正式输出图片写入 --shots-dir 指定目录。
如果没有指定 --shots-dir，则默认输出到：
<主输出文件所在目录>/<主输出文件名不含扩展名>-shots/
```

文件名规则：

```text
<step.name>.<format>
```

示例：

```bash
clishot record gcc.yml --out figures/final.png --format png --shots-dir figures/steps
```

YAML：

```yaml
steps:
  - type: screenshot
    name: "after-compile"
```

输出：

```text
figures/steps/after-compile.png
```

如果多个 screenshot step 使用相同 name，`validate` 必须报错。

`--out` 始终表示最终主截图。中途截图不会替代最终主截图。

### 15.6 `exit`

```yaml
- type: exit
  method: ctrl-d
```

字段：

```text
method
  可选值：ctrl-d、ctrl-c、command、kill。

command
  当 method 为 command 时使用。
  例如 "exit"。
```

示例：

```yaml
- type: exit
  method: command
  command: "exit"
```

如果没有 exit step，`clishot` 可以在完成截图后关闭 PTY。关闭方式应尽量温和：先发送 `exit` 或 Ctrl+D，超时后再 kill。

### 15.7 `require`

可选高级 step，用于检查命令是否存在。

```yaml
- type: require
  program: gcc
```

要求：

```text
如果缺少指定程序，应在真正执行实验步骤前失败。
错误提示应说明缺少哪个程序。
```

### 15.8 `hide` / `show`

可选高级 step，用于隐藏准备步骤，让最终截图只展示关键操作。

```yaml
- type: hide

- type: send
  text: "npm install"
  enter: true
  waitFor:
    idleMs: 1000

- type: show

- type: send
  text: "npm test"
  enter: true
  waitFor:
    idleMs: 1000
```

要求：

```text
hide / show 只影响截图展示，不应影响真实命令执行。
如果 termless core 不支持隐藏历史，clishot 应通过自身 buffer 标记、截图裁剪或重新渲染策略实现。
```

## 16. `waitFor`

很多实验截图需要等待程序输出某个提示，再输入测试用例。因此必须支持 `waitFor`。

### 16.1 等待固定文本

```yaml
waitFor:
  text: "请输入"
  timeoutMs: 10000
```

表示等待终端输出中出现 `请输入`。

### 16.2 等待正则

```yaml
waitFor:
  regex: "input.*:"
  timeoutMs: 10000
```

表示等待终端输出匹配正则。

### 16.3 等待输出空闲

```yaml
waitFor:
  idleMs: 800
  timeoutMs: 10000
```

表示等待终端在 800ms 内没有新输出。

适合以下场景：

```text
gcc 编译完成。
程序输出结束。
命令返回 shell prompt。
```

### 16.4 组合等待

```yaml
waitFor:
  text: "请输入"
  idleMs: 300
  timeoutMs: 10000
```

表示先等出现指定文本，再等输出空闲 300ms。

### 16.5 等待范围

```yaml
waitFor:
  scope: buffer
  text: "Done"
```

`scope` 可选值：

```text
screen
  只检查当前可见区域。

scrollback
  只检查滚动历史。

buffer
  检查 scrollback + screen。
  默认值。
```

### 16.6 实现要求

`waitFor` 应优先基于 termless core 暴露的 screen / scrollback / buffer 实现。

如果 termless core 没有直接提供某种等待能力，`clishot` 应自己轮询对应 region 的文本内容。

`waitFor.regex` 应由 `clishot` 自己实现正则匹配。

`waitFor.idleMs` 应由 `clishot` 根据输出事件或 buffer 变化时间实现。

## 17. Capture 截图区域

截图区域由 `capture` 控制。

```yaml
capture:
  mode: viewport
```

必须支持以下模式：

```text
viewport
lastLines
textRange
fullScrollback
```

可以支持以下高级模式：

```text
range
```

### 17.1 `viewport`

```yaml
capture:
  mode: viewport
```

截当前终端可见区域，也就是 `terminal.rows` 行。

这是默认模式，最接近用户手动截终端当前窗口。

### 17.2 `lastLines`

```yaml
capture:
  mode: lastLines
  lines: 40
```

截取终端缓冲区最后 40 行。

这个模式适合命令输出比窗口高，但报告只想保留最后一段结果的情况。

### 17.3 `fullScrollback`

```yaml
capture:
  mode: fullScrollback
  maxLines: 120
```

截取整个 scrollback 缓冲区，最多 120 行。

如果实际行数超过 `maxLines`，应报错或按策略截最后 `maxLines` 行。默认策略应为报错，避免生成非常长的图片。

### 17.4 `textRange`

```yaml
capture:
  mode: textRange
  from:
    text: "gcc main.c -o main"
    occurrence: first
  to:
    text: "程序结束"
    occurrence: last
  includeFrom: true
  includeTo: true
```

`textRange` 的含义：

```text
clishot 不允许直接从原始 ANSI 字节流中间截取一段再渲染。
正确流程应基于 termless core 已解析后的 terminal buffer。
```

正确流程：

```text
1. 从会话开始完整执行。
2. 让 termless core 得到最终 terminal buffer。
3. 从 buffer 中读取已经解析后的文本行。
4. 在文本行中查找 from / to marker。
5. 根据找到的行号裁剪截图区域。
6. 裁剪后的图片必须保留颜色和样式。
```

原因：

```text
ANSI 输出是状态流。
颜色、光标位置、清屏、覆盖、滚动都依赖前面的状态。
如果直接从中间截 ANSI 字节，可能丢失颜色状态、光标状态和布局状态。
```

字段：

```text
from.text
  起始匹配文本。

from.regex
  起始匹配正则。
  text 和 regex 只能二选一。

from.occurrence
  first、last 或具体数字。
  默认 first。

to.text
  结束匹配文本。

to.regex
  结束匹配正则。

to.occurrence
  first、last 或具体数字。
  默认 last。

includeFrom
  是否包含起始行。
  默认 true。

includeTo
  是否包含结束行。
  默认 true。
```

如果找不到 marker，`clishot` 应按 `capture.onMissingMarker` 处理。

```yaml
capture:
  mode: textRange
  onMissingMarker: fail
```

可选值：

```text
fail
fallbackToViewport
fallbackToLastLines
```

### 17.5 `range`

可选高级模式，用于截取指定行列矩形区域。

```yaml
capture:
  mode: range
  from:
    row: 5
    col: 0
  to:
    row: 20
    col: 100
```

如果 termless core 已经支持 region selector，应优先使用它。

如果底层截图能力不支持直接截 region，`clishot` 应自己根据 cell / row 数据重建或裁剪截图区域。

## 18. 错误处理策略

`clishot` 必须区分两类错误：

```text
终端内容中的错误。
clishot 工具自身错误。
```

### 18.1 终端内容中的错误

这些默认不算 `clishot` 失败：

```text
gcc 编译报错。
Python 抛出异常。
命令不存在。
程序输出错误提示。
测试用例不通过。
Shell 中某条命令返回非 0。
```

这些内容本身可能正是实验报告需要截图的结果。`clishot` 应照常捕获并渲染。

### 18.2 工具自身错误

这些应算 `clishot` 失败：

```text
YAML 解析失败。
配置字段非法。
termless core 不可用。
termless 版本不兼容。
termless backend 不可用。
shell 启动失败。
PTY 创建失败。
waitFor 超时。
输出超过 maxOutputBytes。
总任务超过 totalTimeoutMs。
截图渲染失败。
输出文件不可写。
中途截图文件不可写。
capture marker 找不到且策略为 fail。
```

### 18.3 Timeout 策略

```yaml
limits:
  onTimeout: capture-and-fail
```

可选值：

```text
capture-and-fail
  默认值。
  超时后尽量生成当前终端画面的截图，然后 CLI 返回非 0。
  适合调试和保留现场。

capture-and-success
  超时后生成截图并返回 0。
  适合用户明确知道程序会卡住，例如服务器监听、等待输入、死循环演示。

abort
  超时后直接终止，不生成截图。
```

### 18.4 Missing marker 策略

```yaml
capture:
  onMissingMarker: fail
```

可选值：

```text
fail
fallbackToViewport
fallbackToLastLines
```

### 18.5 输出文件策略

如果 `--out` 指向的文件已存在：

```text
默认报错。
只有传入 --force 才允许覆盖。
```

如果中途截图输出文件已存在：

```text
默认报错。
只有传入 --force 才允许覆盖。
```

如果生成截图失败，但 capture 目录中存在可调试信息，应在错误消息中提示 capture 目录位置。

## 19. 录制产物

即使用户最终只需要图片，`clishot` 内部也应保存录制产物，便于调试和复现。

默认目录：

```text
tmp/tmp-<timestamp>-<spec-basename>/
```

目录结构：

```text
tmp/tmp-2026-06-12-183000-gcc/
  metadata.json
  normalized.yml
  events.jsonl
  normalized.txt
  final.png
  preview.png
  shots/
    after-compile.png
```

字段含义：

```text
metadata.json
  本次任务的配置摘要、平台信息、shell 信息、终端尺寸、开始结束时间、图片格式、输出路径、termless 版本。

normalized.yml
  解析和补全默认值后的 clishot YAML。

events.jsonl
  clishot 高层事件。
  包括 step 开始、step 结束、输入、等待结果、resize、screenshot、错误等。

normalized.txt
  从最终终端 buffer 导出的纯文本，便于调试 textRange。

final.png
  最终主截图副本。

preview.png
  调试预览图。

shots/
  中途截图副本。
```

如果 termless core 支持原生 recording / replay 产物，`clishot` 可以额外保存：

```text
termless recording file
asciicast file
raw output log
```

这些是可选调试产物，不应成为 `clishot` 正常运行的前提。

如果未设置 `--no-clean` 且执行成功，可以删除 capture 目录。

如果执行失败，必须保留 capture 目录。

## 20. 执行流程

`clishot record` 推荐流程：

```text
1. 读取 YAML。
2. 用 Zod 校验配置。
3. 补全默认值，生成 normalized config。
4. 检查输出路径和覆盖策略。
5. 检查 termless core 可用性。
6. 初始化 termless backend。
7. 初始化 termless core terminal。
8. 根据 shell 配置启动真实 shell / program。
9. 设置终端尺寸、scrollback、环境变量、外观配置。
10. 按 steps 顺序执行。
11. 每个 step 产生 events.jsonl 事件。
12. 遇到 screenshot step 时生成命名中途截图。
13. 所有 steps 结束后生成最终主截图。
14. 根据 capture.mode 裁剪或渲染最终图片。
15. 写入 --out。
16. 根据策略清理或保留 capture-dir。
```

核心执行要求：

```text
1. 通过 termless core API 创建 terminal。
2. spawn shell / program。
3. 使用 termless core API 输入文本、发送按键、resize。
4. 使用 termless core 的 screen / scrollback / buffer 能力等待文本。
5. 使用 termless core 的截图能力生成图片。
6. clishot 负责路径、命名、裁剪、错误策略和 debug artifacts。
```

如果 termless core 不提供某个 clishot 需要的高层步骤，应由 clishot 自己实现：

```text
waitFor.regex：
  clishot 从 buffer 文本中做正则匹配。

waitFor.idleMs：
  clishot 根据输出事件或 buffer 变化时间判断空闲。

capture.textRange：
  clishot 基于 buffer 文本定位行号。

capture.lastLines：
  clishot 基于 buffer 行数据选取最后 N 行。

窗口外框：
  clishot 在截图后处理或自有 renderer 层合成。

jpg / webp：
  clishot 在截图后转换格式。
```

禁止行为：

```text
不得通过调用 termless CLI 作为主要执行路径。
不得把 YAML 编译为 .tape 后再执行。
不得绕过真实 PTY 使用 echo / pipe / here-doc 伪造交互输入。
```

## 21. 跨平台要求

### 21.1 Windows

必须支持：

```text
Windows 10 / 11
pwsh
powershell.exe
cmd.exe
Git Bash 可选
WSL 可选
```

Windows 默认 shell 推断：

```text
优先 pwsh -NoLogo。
如果 pwsh 不存在，尝试 powershell.exe -NoLogo。
```

注意：

```text
不要默认加 -NoProfile。
否则 oh-my-posh 可能无法加载。
```

### 21.2 Linux

必须支持：

```text
bash
zsh
fish 可选
```

默认 shell 推断：

```text
优先使用 SHELL 环境变量。
如果不存在，使用 bash。
```

如果 shell 是 zsh，用户应显式写：

```yaml
shell:
  program: zsh
  args: ["-i"]
```

### 21.3 macOS

必须支持：

```text
zsh
bash
```

默认 shell 推断同 Linux。

### 21.4 WSL

WSL 有两种情况。

第一种：`clishot` 在 WSL 内运行。

```text
此时按 Linux 处理。
shell.program 可以是 bash 或 zsh。
cwd 使用 Linux 路径。
```

第二种：`clishot` 在 Windows 内运行，但想控制 WSL。

```yaml
shell:
  program: wsl.exe
  args: ["-d", "Ubuntu", "--", "zsh", "-i"]
```

这种情况下，cwd 的语义比较复杂。`clishot` 不应自动猜测 Windows 路径和 Linux 路径的转换。用户需要自己在 steps 里执行 `cd`，或者明确使用 WSL 支持的路径参数。

示例：

```yaml
steps:
  - type: send
    text: "cd ~/exp"
    enter: true
    waitFor:
      idleMs: 500
```

### 21.5 路径处理

`clishot` 内部应使用 Node.js 的 path API 处理本机路径。

YAML 中的路径规则：

```text
shell.cwd
  传给底层 spawn / termless core 的 cwd。

appearance.background.image
  按 clishot 运行环境的本机路径解释。

--out
  按 clishot 运行环境的本机路径解释。

--shots-dir
  按 clishot 运行环境的本机路径解释。

--capture-dir
  按 clishot 运行环境的本机路径解释。
```

不要自动把 Windows 路径转换成 WSL 路径，除非未来专门实现并在文档中说明。

## 22. 安全限制

因为 `clishot` 面向 Agent 调用，必须有基本安全限制。

```yaml
limits:
  stepTimeoutMs: 15000
  totalTimeoutMs: 120000
  maxOutputBytes: 20000000
```

字段：

```text
stepTimeoutMs
  单个 step 最大执行时间。

totalTimeoutMs
  整个 record 最大执行时间。

maxOutputBytes
  最大终端输出字节数。
  超过后终止录制，防止无限输出撑爆内存。
```

`clishot` 不负责判断命令是否危险。

调用 `clishot` 的 Agent / 用户必须自己控制命令来源。

`clishot` 不应提供自动提权能力。

`clishot` 不应绕过系统权限。

`clishot` 不应默认静默覆盖文件。

## 23. Agent Skill 要求

项目必须提供 Agent-facing Skill：

```text
docs/SKILL.md
```

语言要求：英文。

该 Skill 应面向 Agents，而不是普通用户。它的目标是让 Agent 在生成实验报告、课程作业、技术文档时，知道如何调用 `clishot` 自动生成终端截图。

Skill 必须至少覆盖以下内容：

```text
什么时候应该使用 clishot。
什么时候应该直接使用 termless。
什么时候不应该使用 clishot。
clishot 使用 termless core 作为底层引擎这一事实。
如何生成 YAML spec。
如何选择 shell.program、shell.args、shell.cwd。
如何编写 steps。
如何处理交互式程序输入。
如何使用 waitFor。
如何使用 screenshot step 生成中途截图。
如何选择 capture.mode。
如何调用 clishot record。
如何处理 --out、--format、--shots-dir。
如何把输出图片插入 Markdown、Typst、LaTeX 报告。
如何处理 waitFor 超时。
如何处理命令输出错误和 clishot 自身错误的区别。
如何在失败时检查 tmp/tmp-* capture-dir。
安全注意事项：不要替用户执行危险命令，不要静默覆盖用户文件。
开发注意事项：如果 Agent 在修改 clishot 仓库代码，必须遵循 docs/git-rule.md。
```

Skill 不需要实现任何新的程序能力。它只是 Agent 的操作指南。

## 24. README 和 License 要求

项目必须提供：

```text
README.md
docs/README.zh-CN.md
LICENSE
```

语言要求：

```text
README.md：
  英文。

docs/README.zh-CN.md：
  中文。
```

README 应面向普通用户，介绍：

```text
clishot 是什么。
clishot 和 termless 的关系。
clishot 使用 termless core 作为底层终端执行和截图引擎。
对 termless 项目表示感谢。
适合什么场景。
安装方式。
基础用法。
YAML 配置示例。
record / validate / doctor 命令。
截图输出格式。
中途截图。
常见问题。
跨平台注意事项。
License 信息。
```

README 中必须包含类似说明：

```text
clishot is built on top of termless and uses termless core as its terminal automation and rendering engine. We sincerely thank the termless project and its contributors.
```

License 要求：

```text
clishot 使用 MIT License。
仓库根目录必须提供 LICENSE 文件。
package.json 中 license 字段必须为 MIT。
README.md 和 docs/README.zh-CN.md 中都应注明本项目使用 MIT License。
```

## 25. 实现要求与提交要求

本项目不按 MVP / v0.2 / v0.3 分阶段裁剪 SPEC。

实现目标是：

```text
直接实现当前 SPEC 中规定的完整功能。
```

这意味着首个完整版本应覆盖：

```text
YAML schema。
validate。
doctor。
record。
真实 shell 启动。
真实 PTY 输入。
send / wait / key / resize / screenshot / exit。
waitFor.text。
waitFor.regex。
waitFor.idleMs。
waitFor 组合等待。
capture.viewport。
capture.lastLines。
capture.fullScrollback。
capture.textRange。
中途截图输出。
最终主截图输出。
png / jpg / webp / svg。
appearance 基础配置。
timeout 策略。
missing marker 策略。
debug artifacts。
README.md。
docs/README.zh-CN.md。
docs/SKILL.md。
LICENSE。
```

虽然功能目标一步到位，但开发过程必须小步推进。

提交要求：

```text
1. 开发前必须阅读 docs/git-rule.md。
2. 每次提交只做一个清晰、可解释的小改动。
3. 不允许把大量无关修改混在同一个 commit。
4. 每个 commit message 必须遵循 docs/git-rule.md。
5. 如果 docs/git-rule.md 规定了中文 detail message，则按其要求执行。
6. 每个小功能完成后应尽量运行相关测试或至少运行类型检查。
7. 重要行为变化必须同步更新文档或测试。
```

如果 `docs/git-rule.md` 中的规则与本节示例不一致，应以 `docs/git-rule.md` 为准。

## 26. 验收测试

### 26.1 PowerShell 普通命令

```yaml
shell:
  program: pwsh
  args: ["-NoLogo"]

steps:
  - type: send
    text: "python --version"
    enter: true
    waitFor:
      idleMs: 800
```

要求：

```text
能生成 PNG。
保留 PowerShell prompt。
不禁用用户 profile。
```

### 26.2 zsh / oh-my-zsh

```yaml
shell:
  program: zsh
  args: ["-i"]

steps:
  - type: send
    text: "echo hello"
    enter: true
    waitFor:
      idleMs: 800
```

要求：

```text
能加载 .zshrc。
能显示 prompt。
```

### 26.3 gcc 编译并运行

```yaml
steps:
  - type: send
    text: "gcc main.c -o main"
    enter: true
    waitFor:
      idleMs: 800

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

要求：

```text
截图中必须保留 gcc 命令。
必须保留 ./main 命令。
必须保留用户输入的 5。
必须保留程序输出。
```

### 26.4 编译错误截图

```yaml
steps:
  - type: send
    text: "gcc broken.c -o broken"
    enter: true
    waitFor:
      idleMs: 1000
```

要求：

```text
即使 gcc 输出错误，clishot 仍然成功生成截图。
clishot 不应因为终端内容中出现 error 字样而失败。
```

### 26.5 Ctrl+C

```yaml
steps:
  - type: send
    text: "python"
    enter: true
    waitFor:
      text: ">>>"

  - type: key
    combo: Ctrl+C
    waitFor:
      idleMs: 500
```

要求：

```text
Ctrl+C 能正确发送。
截图中能看到 REPL 被中断后的状态。
```

### 26.6 textRange 裁剪

```yaml
capture:
  mode: textRange
  from:
    text: "gcc main.c -o main"
  to:
    text: "程序结束"
  includeFrom: true
  includeTo: true
```

要求：

```text
必须基于 termless core 解析后的终端 buffer 定位。
不能直接裁剪原始 ANSI 字节流。
裁剪后图片保留颜色。
```

### 26.7 中文和 Nerd Font

```yaml
steps:
  - type: send
    text: "echo 中文测试"
    enter: true
    waitFor:
      idleMs: 500
```

要求：

```text
中文宽度正确。
不会明显错位。
Nerd Font 图标尽量正常显示。
```

### 26.8 图片格式

必须测试：

```bash
clishot record demo.yml --out out.png --format png
clishot record demo.yml --out out.jpg --format jpg
clishot record demo.yml --out out.webp --format webp
clishot record demo.yml --out out.svg --format svg
```

要求：

```text
格式能正常输出。
jpg / webp 应尊重 appearance.output.quality。
png / svg 忽略 quality。
扩展名和 --format 不一致时应报错。
```

### 26.9 中途截图

```yaml
steps:
  - type: send
    text: "gcc main.c -o main"
    enter: true
    waitFor:
      idleMs: 800

  - type: screenshot
    name: "after-compile"

  - type: send
    text: "./main"
    enter: true
    waitFor:
      idleMs: 800
```

命令：

```bash
clishot record demo.yml --out figures/final.png --shots-dir figures/steps
```

要求：

```text
必须生成 figures/final.png。
必须生成 figures/steps/after-compile.png。
中途截图是正式输出，不应只存在于临时 capture 目录。
```

### 26.10 resize

```yaml
terminal:
  cols: 100
  rows: 30
  resizePolicy: fixed
  allowAppResize: false

steps:
  - type: resize
    cols: 120
    rows: 35
    waitFor:
      idleMs: 500
```

要求：

```text
resize step 能改变终端尺寸。
最终截图尺寸和换行应与 resize 后一致。
```

### 26.11 app resize 默认忽略

```yaml
terminal:
  resizePolicy: fixed
  allowAppResize: false
```

要求：

```text
程序输出中的窗口 resize 请求默认不应改变截图尺寸。
如果检测到相关控制序列，可以输出 warning，但不应改变 terminal.cols / rows。
```

### 26.12 termless core 可用性

命令：

```bash
clishot doctor
```

要求：

```text
能够检测 termless core 是否可用。
能够输出 termless 版本。
能够检测当前平台 PTY 支持。
如果 termless core 不可用，应给出可操作的安装或排查建议。
```

### 26.13 不依赖 termless CLI

要求：

```text
在 termless CLI 不存在，但 termless core 依赖可用的环境中，clishot record 仍应能正常工作。
clishot record 不应调用 termless CLI。
clishot 不应要求用户安装 termless CLI 二进制。
```

### 26.14 README、Skill 和 License 文件

要求：

```text
README.md 存在，并使用英文。
README.md 说明 clishot 使用 termless core，并对 termless 表示感谢。
docs/README.zh-CN.md 存在，并使用中文。
docs/README.zh-CN.md 说明 clishot 使用 termless core，并对 termless 表示感谢。
docs/SKILL.md 存在，并使用英文。
docs/SPEC.md 存在，并使用中文。
LICENSE 存在。
LICENSE 使用 MIT License。
package.json 中 license 字段为 MIT。
```

## 27. 最终验收标准

项目完成后，必须满足：

```text
1. 项目名、仓库名、CLI 名统一为 clishot。
2. clishot 定位为 termless core 之上的报告截图编排工具。
3. Agent 可以通过 YAML 描述一个真实终端交互流程。
4. record 命令必须要求 --out。
5. 图片格式通过 --format 控制，支持 png、jpg、webp、svg，默认 png。
6. CLI 不提供 --scale；缩放倍率写在 YAML 的 appearance.output.scale。
7. CLI 不提供 --cwd；工作目录写在 YAML 的 shell.cwd。
8. CLI 不提供 --engine。
9. CLI 不提供 --termless-bin。
10. CLI 不提供 compile 命令。
11. YAML 不设置 version 字段。
12. YAML 不设置 engine 字段。
13. 底层终端能力必须优先复用 termless core。
14. 如果 termless core 缺少 clishot 需要的高层能力，clishot 应优先自己实现。
15. 不自研完整 ANSI / VT 解析器。
16. 不自研完整终端截图渲染器，除非是为了补齐 clishot 特有的 capture / window / output 能力。
17. 不依赖 termless CLI 作为主要执行路径。
18. 不把 YAML 编译为 .tape 作为正式执行路径。
19. 不 fork termless 作为默认实现方式。
20. 不 vendoring termless 源码作为默认实现方式。
21. 能启动真实 shell。
22. 能通过真实终端输入命令和测试用例。
23. 能保留 shell prompt、颜色、基本图标和用户输入。
24. 能处理 gcc 编译、程序运行、REPL 输入、错误输出等实验报告常见场景。
25. 终端中的命令报错不应默认导致 clishot 失败。
26. waitFor 超时、配置错误、termless core 不可用、渲染错误应明确报错。
27. 支持 Windows、Linux、macOS；WSL 通过显式 shell 配置支持。
28. capture.textRange 必须基于 termless core 解析后的终端 buffer 定位，不得基于原始 ANSI 字节流硬切片。
29. screenshot step 必须能输出正式中途截图到 --shots-dir。
30. 程序请求改变终端尺寸时，默认忽略；只有显式 allowAppResize 时才尝试处理。
31. 项目实现目标为一次性覆盖完整 SPEC，不拆成 MVP / v0.2 / v0.3 阶段。
32. 开发过程必须小步提交，并遵循 docs/git-rule.md。
33. 必须提供英文 README.md。
34. README.md 必须说明 clishot 使用 termless core，并对 termless 项目表示感谢。
35. 必须提供中文 docs/README.zh-CN.md。
36. docs/README.zh-CN.md 必须说明 clishot 使用 termless core，并对 termless 项目表示感谢。
37. 必须提供英文 docs/SKILL.md。
38. 必须提供中文 docs/SPEC.md。
39. 必须提供 LICENSE 文件。
40. LICENSE 必须使用 MIT License。
41. package.json 中 license 字段必须为 MIT。
```
