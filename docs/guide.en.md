# User guide

[简体中文](guide.zh-CN.md) · [Home](../README.en.md)

## Download and verify

Download the ZIP and `SHA256SUMS.txt` from the same release. Run the following command in PowerShell and compare the digest with the 64 hexadecimal characters beside that ZIP filename before extracting it. The checksum covers the archive. The first release executable has no Windows Authenticode signature.

```powershell
Get-FileHash .\QuanY-1.6.5-windows-x64.zip -Algorithm SHA256
```

## Default shortcuts

| Keys | Action |
| --- | --- |
| Ctrl+Alt+M / Ctrl+Alt+J | Summon the main window / quick capture from another app |
| Ctrl+N / Ctrl+O | Create a manuscript / open a TXT |
| Ctrl+S / Ctrl+Shift+S | Save / save as |
| Ctrl+F / Ctrl+H | Find / replace |
| Ctrl+K / F8 | Switch manuscript / toggle focus mode |
| Ctrl+, | Settings |

Choose **保存并退出** (Save and quit) from the tray menu to exit fully. If a global shortcut is already registered by another program, open shortcut settings and record a different combination. Escape cancels recording.

## Saving and recovery

Choose 0.65, 2 or 5 seconds of inactivity before autosave. The default folder controls where a new manuscript is first written. Existing manuscripts keep their linked paths. Use **另存为** (Save as) for a separate copy. If another editor has changed the same file and QuanY reports a conflict, save your edits to a second file and compare both copies. For legacy encodings, keep the original and convert a copy to UTF-8 or BOM-marked UTF-16 before importing it.

A TXT contains the body. The SQLite library holds titles, tags, pins, revisions and memos. For a backup, exit from the tray and copy both your manuscript folders and `%LOCALAPPDATA%\cn.jianji.writer`. This internal identifier predates the public name. Include files you have opened or saved outside the default folder.

## Updating and troubleshooting

Exit normally and extract the next release into the same application directory. If you move the executable while sign-in startup is enabled, disable startup first, launch from the new location and enable it again. When reporting a problem, include the app and Windows versions, reproduction steps and what happens with a blank sample. Redact filenames, account paths and manuscript contents from screenshots.
