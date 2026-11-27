# Contributing to QuanY

[简体中文](CONTRIBUTING.md) · [Code of conduct](CODE_OF_CONDUCT.en.md) · [Security reports](SECURITY.en.md)

## Opening an issue

Use the bug or feature template in Issues. Include the QuanY and Windows versions, steps, expected behaviour and actual result. For save problems, reproduce with a disposable document and describe its encoding, whether another process has it open and whether the destination is writable. Report possible security issues privately.

## Developing on Windows

1. Install the Visual Studio 2022 Build Tools **Desktop development with C++** workload, Windows SDK and WebView2 Evergreen Runtime. [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
2. Install 64-bit Node.js and the Rust MSVC toolchain. CI uses Node 24.12.0, Rust 1.100.0 and the `windows-2022` runner.
3. Clone your fork and branch from the latest `main`. Run these commands from the repository root:

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

`--workspace` gives the application a separate SQLite library and text directory. Sign-in startup writes to the Windows user's registry, and global hotkeys belong to the desktop session. Use a dedicated Windows account or VM to exercise those features. Frontend preferences live in WebView2's data directory.

## Code and review

`ui/` contains the React interface, editor behaviour and command calls. `src/` implements persistence, file conflict handling and Windows integration. Explain which entry point needs any new IPC or window permission. For changes to persistence, describe behaviour on retries, existing libraries and external file changes.

Keep each PR focused and include verification commands and their results. Redacted light and dark screenshots help with UI changes. Commit lockfile updates alongside dependency changes and check distribution notices when adding a dependency. Maintainers squash-merge once the Windows check passes and review conversations are resolved. Contributions use the project's Apache-2.0 license. Preserve upstream notices when importing code.
