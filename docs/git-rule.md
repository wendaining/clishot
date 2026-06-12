时刻进行小增量的 git 提交。

Use a two-part commit message.

The first line must use English Conventional Commits format:

<type>(optional scope): <short English summary>

Then add a blank line.

After the blank line, write a detailed commit message in Chinese.

Allowed types:

* feat: new feature
* fix: bug fix
* docs: documentation-only changes
* style: formatting changes that do not affect code behavior
* refactor: code changes that neither fix a bug nor add a feature
* perf: performance improvements
* test: adding or updating tests
* build: build system, dependency, package, Docker, or uv-related changes
* ci: CI/CD changes, including GitHub Actions
* chore: maintenance tasks that do not fit other types
* revert: revert a previous commit

Rules for the first line:

* Use English only.
* Keep it concise and preferably under 72 characters.
* Use lowercase type names.
* Use imperative mood, such as "add", "fix", "update", "remove".
* Use a scope when helpful, for example:

    * feat(bot): add /status command
    * fix(parser): handle merged QQ chat records
    * ci(deploy): add SSH deployment workflow
    * build(docker): add production Dockerfile

Rules for the Chinese detail section:

* Use Chinese.
* Explain what was changed.
* Explain why the change was made when useful.
* Mention important affected modules, files, or behavior.
* Mention breaking changes, migration steps, or deployment notes if any.
* Do not write vague descriptions such as “修改了一些代码” or “优化项目”.
* Keep the detail section concise, usually 2–5 bullet points.

Recommended format:

<type>(optional scope): <short English summary>

* 做了什么：……
* 为什么：……
* 影响范围：……
* 注意事项：……

Examples:

feat(parser): support merged QQ chat records

* 做了什么：新增对 QQ 合并聊天记录的解析逻辑，支持从转发消息中提取文本内容。
* 为什么：方便用户直接发送合并聊天记录，让 bot 能够读取并整理上下文。
* 影响范围：主要影响聊天记录解析模块和消息处理流程。
* 注意事项：后续需要补充更多真实 QQ 消息格式的测试样例。

ci(deploy): add GitHub Actions SSH deployment

* 做了什么：新增 GitHub Actions 工作流，通过 SSH 登录服务器并自动拉取、构建、重启服务。
* 为什么：减少手动部署步骤，保证每次推送后都能以一致流程发布。
* 影响范围：影响部署流程、服务器目录结构和环境变量配置。
* 注意事项：需要在 GitHub Secrets 中配置服务器地址、用户名、SSH 私钥和部署路径。

build(docker): add production Docker setup

* 做了什么：新增 Dockerfile 和 docker-compose.yml，用于容器化运行 QQ Bot。
* 为什么：方便在服务器上稳定部署，并减少本地环境和服务器环境差异。
* 影响范围：影响项目启动方式、依赖安装方式和生产环境运行流程。
* 注意事项：部署前需要确认 .env 文件和挂载目录配置正确。