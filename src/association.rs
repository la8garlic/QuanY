//! Register the portable EXE as a candidate. Windows owns the user's default choice.
use std::{env, io, os::windows::process::CommandExt, path::PathBuf, process::Command};
use winreg::{
    enums::{HKEY_CURRENT_USER, REG_NONE},
    types::ToRegValue,
    RegKey, RegValue,
};

const APP_NAME: &str = "泉涌 QuanY";
const PROG_ID: &str = "QuanY.Text";
const CAPABILITIES: &str = r"Software\QuanY\Capabilities";

fn update(key: &RegKey, name: &str, value: RegValue<'_>) -> io::Result<bool> {
    match key.get_raw_value(name) {
        Ok(previous) if previous == value => return Ok(false),
        Err(e) if e.kind() != io::ErrorKind::NotFound => return Err(e),
        _ => {}
    }
    key.set_raw_value(name, &value)?;
    Ok(true)
}

fn windows_dir() -> io::Result<PathBuf> {
    env::var_os("SystemRoot")
        .map(PathBuf::from)
        .ok_or_else(|| io::Error::other("Missing SystemRoot"))
}

fn register() -> io::Result<()> {
    let exe = env::current_exe()?;
    let user = RegKey::predef(HKEY_CURRENT_USER);
    let prog = user.create_subkey(r"Software\Classes\QuanY.Text")?.0;
    let app = prog.create_subkey("Application")?.0;
    let caps = user.create_subkey(CAPABILITIES)?.0;
    let icon = format!("\"{}\",0", exe.display());
    let command = format!("\"{}\" \"%1\"", exe.display());
    let mut changed = false;
    for (key, name, value) in [
        (&prog, "", "QuanY TXT"),
        (&prog.create_subkey("DefaultIcon")?.0, "", icon.as_str()),
        (
            &prog.create_subkey(r"shell\open\command")?.0,
            "",
            command.as_str(),
        ),
        (&app, "ApplicationName", APP_NAME),
        (&app, "ApplicationIcon", &icon),
        (&caps, "ApplicationName", APP_NAME),
        (&caps, "ApplicationIcon", &icon),
        (
            &caps,
            "ApplicationDescription",
            "泉涌 · QuanY plain-text editor",
        ),
        (&caps.create_subkey("FileAssociations")?.0, ".txt", PROG_ID),
        (
            &user.create_subkey(r"Software\RegisteredApplications")?.0,
            APP_NAME,
            CAPABILITIES,
        ),
    ] {
        changed |= update(key, name, value.to_reg_value())?;
    }
    let candidates = user
        .create_subkey(r"Software\Classes\.txt\OpenWithProgids")?
        .0;
    changed |= update(
        &candidates,
        PROG_ID,
        RegValue {
            vtype: REG_NONE,
            bytes: (&[][..]).into(),
        },
    )?;
    if changed {
        // Notify Explorer only when the registration changes, including after moving the EXE.
        let result =
            Command::new(windows_dir()?.join(r"System32\WindowsPowerShell\v1.0\powershell.exe"))
                .args([
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    include_str!("../scripts/notify-shell.ps1"),
                ])
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .output()?;
        if !result.status.success() {
            return Err(io::Error::other(
                String::from_utf8_lossy(&result.stderr).into_owned(),
            ));
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn register_txt_handler() -> Result<(), String> {
    if env::args_os().any(|arg| arg == "--workspace") {
        return Ok(());
    }
    register().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_default_apps() -> Result<(), String> {
    let mut settings = tauri::Url::parse("ms-settings:defaultapps").expect("valid settings URI");
    settings.set_query(Some(&format!("registeredAppUser={APP_NAME}")));
    register()
        .and_then(|()| {
            Command::new(windows_dir()?.join("explorer.exe"))
                .arg(settings.as_str())
                .spawn()
                .map(|_| ())
        })
        .map_err(|e| e.to_string())
}
