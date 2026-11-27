# User guide

[简体中文](guide.zh-CN.md) · [Home](../README.en.md)

## Download and language

Download [QuanY.exe](https://github.com/la8garlic/QuanY/releases/latest/download/QuanY.exe) and open it. QuanY starts in Chinese on Chinese-language systems and in English elsewhere. Choose **Settings → Tray & shortcuts → Language** to change or remember your preference.

To check that your download matches the release, compare the output below with `SHA256SUMS.txt` from the same release. The check is optional. The executable currently has no Windows code signature.

```powershell
Get-FileHash .\QuanY.exe -Algorithm SHA256
```

## Open TXT files from Explorer

Open QuanY once from the folder where you keep the executable. In **Settings → Files & saving → Default app for TXT files**, choose **Choose in Windows…** and select **泉涌 QuanY** for `.txt`. You can also right-click a TXT, choose **Open with**, select QuanY and choose **Always**. If you move the executable, quit from the tray and start it at its new location to refresh the registration.

## Default shortcuts

| Keys | Action |
| --- | --- |
| Ctrl+Alt+M / Ctrl+Alt+J | Summon the main window / quick capture from another app |
| Ctrl+N / Ctrl+O | Create a manuscript / open a TXT |
| Ctrl+S / Ctrl+Shift+S | Save / save as |
| Ctrl+F / Ctrl+H | Find / replace |
| Ctrl+K / F8 | Switch manuscript / toggle focus mode |
| Ctrl+, | Settings |

Choose **Save and quit** from the tray menu to exit fully. If a global shortcut is already registered by another program, open shortcut settings and record a different combination. Escape cancels recording.

## Saving and recovery

Choose 0.65, 2 or 5 seconds of inactivity before autosave. The default folder controls where a new manuscript is first written. Existing manuscripts keep their linked paths. Use **Save as** for a separate copy. If another editor has changed the same file and QuanY reports a conflict, save your edits to a second file and compare both copies. For legacy encodings, keep the original and convert a copy to UTF-8 or BOM-marked UTF-16 before importing it.

A TXT contains the body. The SQLite library holds titles, tags, pins, revisions and memos. For a backup, exit from the tray and copy both your manuscript folders and `%LOCALAPPDATA%\cn.jianji.writer`. This internal identifier predates the public name. Include files you have opened or saved outside the default folder.

## Updating and troubleshooting

Exit normally and replace your executable with the new QuanY.exe. If you move the executable while sign-in startup is enabled, disable startup first, launch from the new location and enable it again. When reporting a problem, include the app and Windows versions, reproduction steps and what happens with a blank sample. Redact filenames, account paths and manuscript contents from screenshots.
