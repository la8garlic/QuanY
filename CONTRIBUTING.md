# 参与泉涌

[English](CONTRIBUTING.en.md) · [行为准则](CODE_OF_CONDUCT.md) · [安全报告](SECURITY.md)

## 提交问题

功能问题可用 Issues 中的故障或建议模板。请注明 Windows、泉涌版本、操作步骤、期望和实际结果。涉及保存时，使用无私人内容的临时稿件，说明文件编码、是否被其他编辑器打开，以及目标目录是否可写。可能影响其他用户安全的问题请走私密报告渠道。

## 在 Windows 上开发

1. 安装 Visual Studio 2022 Build Tools 的“使用 C++ 的桌面开发”工作负载和 Windows SDK，准备 WebView2 Evergreen Runtime。[Tauri 官方环境说明](https://v2.tauri.app/start/prerequisites/)
2. 安装 64 位 Node.js 和 Rust MSVC 工具链。CI 使用 Node 24.12.0、Rust 1.100.0 和 `windows-2022`。
3. 克隆自己的 fork，从最新 `main` 新建主题分支。在仓库根目录运行：

```powershell
rustup toolchain install 1.100.0 --profile minimal --component rustfmt --component clippy
$env:RUSTUP_TOOLCHAIN = "1.100.0"
npm ci
cargo fmt --check
npm run build
cargo clippy --release --locked -- -D warnings
cargo build --release --locked
.\target\release\quany.exe --workspace "$env:TEMP\quany-contributor"
```

`--workspace` 指定独立 SQLite 稿本和文本目录。登录启动写入当前用户注册表，全局热键也属于当前桌面会话；验证这类功能时应使用专门的 Windows 账户或虚拟机。前端偏好存放在 WebView2 数据目录。

## 代码与评审

`ui/` 负责 React、编辑体验与命令调用，`src/` 实现存储、文件冲突处理和 Windows 集成。新增 IPC 或窗口权限时，请说明调用入口及它访问的资源。与数据相关的更改需说明重试、旧数据和文件冲突的表现。

每个 PR 集中解决一件事，附上实际执行的命令和结果；界面改动可附已脱敏的深浅主题截图。依赖变更同步更新对应锁文件，新增打包依赖时核对第三方声明。维护者在 Windows 检查通过且评审讨论解决后 squash 合并。贡献按项目 Apache-2.0 许可提交，保留引入代码原有的许可与归属。
