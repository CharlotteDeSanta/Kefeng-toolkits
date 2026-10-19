use std::path::Path;

/// 把前端生成的 XLSX 字节写入用户选择的路径。
#[tauri::command]
fn save_workbook(path: String, bytes: Vec<u8>) -> Result<(), String> {
    let file_path = Path::new(&path);
    if path.trim().is_empty() {
        return Err("保存路径为空".into());
    }
    if !file_path
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("xlsx"))
    {
        return Err("导出文件必须使用 .xlsx 扩展名".into());
    }

    std::fs::write(file_path, bytes).map_err(|error| format!("写入文件失败：{error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![save_workbook])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
