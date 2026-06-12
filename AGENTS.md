# AGENTS.md

本文件面向参与 `clishot` 项目开发的 AI Agent。开始修改代码前，请先阅读本文，并遵守这里列出的项目约束。

## 项目定位

`clishot` 是一个面向实验报告、课程作业、技术文档和 Agent 自动化工作流的终端截图工具。

项目核心目标是：通过 YAML 描述真实终端交互流程，启动真实 shell，输入命令和测试数据，等待输出，生成中途截图和最终截图。

`clishot` 使用 `termless core / programmatic API` 作为底层终端执行与截图基础。项目本身负责 YAML schema、步骤编排、报告截图语义、capture 策略、错误处理、输出路径和文档。

## 开发前必须阅读的文档

修改代码前，优先阅读这些文件：

```text
docs/SPEC.md
docs/git-rule.md
README.md
docs/README.zh-CN.md
```

各文件用途：

```text
docs/SPEC.md
  项目主规格。所有功能、CLI 行为、YAML 字段、截图规则、错误策略都应以它为准。

docs/git-rule.md
  Git 提交规则。所有 commit message 和提交粒度都必须遵守它。

README.md
  英文用户文档。面向普通用户，说明安装、使用方式和示例。

docs/README.zh-CN.md
  中文用户文档。应与 README.md 保持内容一致。
```

如果代码行为与 `docs/SPEC.md` 冲突，应优先修正代码。若确实需要改变规格，必须同步修改 `docs/SPEC.md`，并在提交信息中说明原因。

## termless 使用原则

`clishot` 正式实现应使用 `termless core / programmatic API`。

必须保持以下原则：

```text
不调用 termless CLI 作为正式执行路径。
不把 YAML 编译成 .tape 后再执行。
不 fork termless 作为默认实现方式。
不 vendoring termless 源码作为默认实现方式。
不自研完整 PTY、ANSI/VT 解析器或完整终端截图渲染器。
```

如果 `termless core` 已经提供某项能力，应优先调用它。

如果 `termless core` 缺少 `clishot` 需要的高层能力，应在 `clishot` 自己的适配层或扩展层补齐，例如：

```text
waitFor.regex
waitFor.idleMs
capture.textRange
capture.lastLines
capture.fullScrollback
screenshot step 命名输出
窗口外框合成
jpg / webp 格式转换
debug artifacts
```

所有 termless 相关调用应尽量集中在 `src/engine/TermlessCoreEngine.ts` 或相邻适配模块中，避免在项目各处直接散落调用 termless API。

## 必须保持的项目规范

开发过程中必须保持以下约束：

```text
项目名、仓库名、CLI 名保持为 clishot。
License 使用 MIT。
package.json 的 license 字段必须为 MIT。
README.md 必须说明 clishot 使用 termless core，并感谢 termless 项目。
docs/README.zh-CN.md 也必须说明这一点。
YAML 不设置 version 字段。
YAML 不设置 engine 字段。
CLI 不提供 --scale。
CLI 不提供 --cwd。
CLI 不提供 --engine。
CLI 不提供 --termless-bin。
CLI 不提供 compile 命令。
record 命令必须要求 --out。
```

截图内容必须来自真实终端会话。不要用 echo、pipe、here-doc 或手写 transcript 来伪造交互截图。

终端内部命令报错不应默认导致 `clishot` 失败。比如 `gcc` 编译错误、Python traceback、命令不存在、测试用例失败，都应当作为终端内容正常截图。只有配置错误、waitFor 超时、termless core 不可用、渲染失败、输出文件失败等才属于 `clishot` 工具错误。

## Git 提交要求

本项目强调小增量提交。

每次修改前先阅读：

```text
docs/git-rule.md
```

提交时必须遵守：

```text
每个 commit 只做一个清晰的小改动。
不要把无关修改混进同一个 commit。
commit message 必须符合 docs/git-rule.md。
完成一个小功能后，尽量运行对应测试、类型检查或 lint。
修改行为时，同步更新测试或文档。
不要在没有必要的情况下大规模重排代码。
```

推荐提交粒度示例：

```text
chore: initialize project structure
docs: add spec skeleton
feat: add YAML schema validation
feat: wrap termless core terminal creation
feat: implement send step
feat: implement waitFor regex
feat: implement screenshot step outputs
test: add textRange capture fixture
docs: update agent skill
```

如果 `docs/git-rule.md` 中的规则与这里的示例不一致，以 `docs/git-rule.md` 为准。

## 修改代码时的工作习惯

开始一个任务时，先判断它涉及哪些部分：

```text
CLI 行为：
  查看 src/cli 和 docs/SPEC.md。

YAML 字段：
  查看 src/config、docs/SPEC.md 和 examples/。

终端执行：
  查看 src/engine 和 termless core 相关适配层。

截图裁剪：
  查看 src/capture 和 src/output。

文档：
  同时考虑 README.md、docs/README.zh-CN.md、docs/SPEC.md 和 skills/clishot/SKILL.md。

测试：
  优先添加或更新 tests/ 下的相关 fixture。
```

修改完成后，尽量执行项目已有的检查命令，例如：

```text
npm test
npm run typecheck
npm run lint
```

具体命令以 package.json 为准。

## 不要做的事

除非用户或维护者明确要求，否则不要做这些事：

```text
不要改项目定位。
不要引入 termless CLI 后端。
不要添加 .tape compile 作为正式功能。
不要删除 MIT License。
不要把 README 改成只面向开发者。
不要移除中文 README。
不要移除 Agent Skill。
不要为了通过测试而降低真实 PTY 交互要求。
不要静默覆盖用户输出文件。
不要执行危险命令。
```

## 文档同步规则

以下修改通常需要同步更新文档：

```text
新增或修改 CLI 参数。
新增或修改 YAML 字段。
修改 record / validate / doctor 行为。
修改图片格式支持。
修改 capture.mode 行为。
修改 waitFor 行为。
修改输出目录或文件命名规则。
修改错误码或错误策略。
```

文档同步优先级：

```text
1. docs/SPEC.md
2. README.md
3. docs/README.zh-CN.md
4. skills/clishot/SKILL.md
5. examples/
```

## 总体目标

`clishot` 应保持小而清晰：底层终端能力依赖 termless core，高层价值集中在 YAML 编排、报告截图、Agent 友好使用和稳定输出规则上。

实现时优先保证真实、可复现、可调试，再考虑视觉效果和额外功能。