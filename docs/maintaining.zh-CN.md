# 仓库维护与发行

[English](maintaining.en.md) · [贡献指南](../CONTRIBUTING.md)

## 合并权限

默认分支为 `main`。提交通过 PR 进入主分支，分支需更新到最新主线、通过 GitHub Actions 的 **Windows x64** 检查，并解决全部评审讨论；使用 squash 合并。主分支禁止删除与强制推送，管理员也走此流程。CODEOWNERS 将审查请求路由给维护者。

项目初期只有一位维护者，批准数设置为 0，避免作者无法批准自己的 PR。获得第二位长期维护者后，可在规则中要求一位独立批准并启用代码所有者审查。限制写权限，仅将管理员角色授予负责维护与发版的人。账户恢复代码和双重验证由账号所有者保管。

仓库规则定义保存在 `.github/rulesets/`。维护者可以在 Settings → Rules → Rulesets 中查看实际生效规则。改变 JSON 后也要同步 GitHub 设置，再用 `gh api repos/la8garlic/QuanY/rules/branches/main` 核对。两个标签规则分别控制谁可创建 `v*` 标签，以及创建后禁止移动和删除。

## 自动化与依赖

Windows 工作流在 PR 和主分支运行，默认令牌只有读取源码权限，checkout 不保留凭据。Action 固定到完整提交 SHA；仅 GitHub 自有 Action 在允许列表内。来自 PR 的构建不作为发行输入。Dependabot 每周检查 Cargo、npm 和 Actions。根据变更日志、锁文件差异与 CI 结果逐项审查，尤其关注脚本、构建工具和 IPC 权限的变化。

启用 Dependabot 安全提醒、密钥扫描、推送保护和私密漏洞报告。发现凭据泄露时先撤销或轮换凭据，再评估清理历史；删除最新提交中的文本无法撤销已经暴露的凭据。

## 发布步骤

1. 在 PR 中统一 Cargo、npm、锁文件和 Tauri 版本号，更新中英文发行说明。检查 MIT、Apache、MPL 等第三方声明；WebView2 SDK 更新时同步其许可证和 NOTICE。
2. 合并后等待 **该主分支提交** 的 Windows 工作流成功。复制完整 SHA 和运行 ID，核对下列字段及产物，再下载工作流产物到独立目录。

```powershell
gh run view RUN_ID --repo la8garlic/QuanY --json headSha,headBranch,event,conclusion,url
gh run download RUN_ID --repo la8garlic/QuanY --name QuanY-windows-x64 --dir release-download
Get-FileHash .\release-download\QuanY-VERSION-windows-x64.zip -Algorithm SHA256
```

3. 核对 SHA-256、ZIP 内 EXE 版本、架构和声明文件，以临时稿本抽查启动及保存。由维护者在上述 SHA 上创建带说明的 `vVERSION` 标签并推送。
4. 使用 `gh release create vVERSION --verify-tag --draft` 建草稿，在草稿中上传 ZIP 和 `SHA256SUMS.txt`，附上双语说明及 CI 运行链接。核对后发布。仓库启用不可变发行版，修正二进制或说明附件时应发布新版本。
5. 从公开发行页重新下载 ZIP 和摘要，核对散列值，使用 `gh release view vVERSION` 确认标签、附件和公开状态。GitHub 自动提供该标签的源代码归档。

[GitHub 规则集](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets) · [Actions 安全](https://docs.github.com/en/actions/reference/security/secure-use) · [管理 Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)
