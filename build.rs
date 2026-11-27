fn main() {
    // Windows 将 ICO 编译进 EXE，图像内容变化时必须重建原生资源。
    println!("cargo:rerun-if-changed=assets/icon.ico");
    tauri_build::build();
}
