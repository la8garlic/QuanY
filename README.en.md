# QuanY (泉涌)

[简体中文](README.md) · [Download for Windows](https://github.com/la8garlic/QuanY/releases/latest) · [User guide](docs/guide.en.md)

QuanY is a plain-text notepad for Windows with a Chinese-language interface. Press **Ctrl+Alt+J** to capture a thought in a small window at the bottom right of your screen. Press **Ctrl+Alt+M** to bring back the writing desk. Your manuscripts are TXT files. The local library keeps the catalogue, editing positions and revision history.

## Getting started

1. Download `QuanY-1.6.5-windows-x64.zip` from Releases. Extract the archive into the directory where you want to keep the application.
2. Open `QuanY.exe`, enter a title and some text, and wait for **已保存** (saved). Click the path in the status bar to open the containing folder.
3. Under **设置 → 文件与保存** (Settings → Files and saving), choose a folder for new manuscripts and an autosave interval. The initial folder is **泉涌** inside your Windows Documents folder.
4. Under **待命与快捷键** (Tray and shortcuts), choose whether closing the window keeps the app in the tray, whether it starts at sign-in, and which shortcuts summon each window.

The portable build targets Windows x64 and uses the Microsoft Edge WebView2 Evergreen Runtime. If the runtime is missing, install it from [Microsoft](https://developer.microsoft.com/microsoft-edge/webview2/).

## At the desk

| Task | Controls |
| --- | --- |
| Long-form writing | Adjust the typeface, size, line spacing, paper colour and text width. Press F8 for focus mode. |
| Finding a draft | Search titles and bodies, use Ctrl+K to switch, or filter by tags and pins. |
| Editing an existing TXT | Open UTF-8 or BOM-marked UTF-16. Saving preserves the original encoding and newline convention. |
| Working with references | Open a read-only reference alongside the manuscript or create an independent, always-on-top memo. |
| Recovering an edit | Compare revisions, create a checkpoint or restore a prior revision. Each manuscript retains up to 40 revisions. |

## Building and contributing

Install Node.js, Rust with the MSVC toolchain, Visual Studio C++ Build Tools and the Windows SDK. The contribution guide lists the CI versions and setup links.

```powershell
npm ci
npm run release
```

The executable is written to `release/QuanY.exe`. Public distributions include project and third-party notices, with a separate SHA-256 checksum file.

- [User guide and backups](docs/guide.en.md)
- [Contributing](CONTRIBUTING.en.md) · [Code of conduct](CODE_OF_CONDUCT.en.md)
- [Report a vulnerability privately](SECURITY.en.md) · [Repository and release operations](docs/maintaining.en.md)
- [v1.6.5 release notes](docs/releases/v1.6.5.en.md) · [Apache-2.0 license](LICENSE)
