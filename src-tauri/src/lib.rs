use std::path::{Path, PathBuf};

use tauri::ipc::{InvokeBody, Request, Response};

const MAX_BINARY_FILE_BYTES: u64 = 200 * 1024 * 1024;
const MAX_SIGNATURE_BYTES: u64 = 10 * 1024 * 1024;

fn has_extension(path: &Path, extension: &str) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case(extension))
}

/// 把前端生成的 XLSX 字节写入用户选择的路径。
#[tauri::command]
fn save_workbook(path: String, bytes: Vec<u8>) -> Result<(), String> {
    let file_path = Path::new(&path);
    if path.trim().is_empty() {
        return Err("保存路径为空".into());
    }
    if !has_extension(file_path, "xlsx") {
        return Err("导出文件必须使用 .xlsx 扩展名".into());
    }

    std::fs::write(file_path, bytes).map_err(|error| format!("写入文件失败：{error}"))
}

/// 读取用户通过原生对话框选择的 PDF（发票），以原始字节返回，避免 JSON 数组膨胀。
#[tauri::command]
fn read_binary_file(path: String) -> Result<Response, String> {
    let file_path = Path::new(&path);
    if path.trim().is_empty() {
        return Err("读取路径为空".into());
    }
    if !has_extension(file_path, "pdf") {
        return Err("发票文件必须使用 .pdf 扩展名".into());
    }

    let metadata =
        std::fs::metadata(file_path).map_err(|error| format!("读取文件信息失败：{error}"))?;
    if !metadata.is_file() {
        return Err("读取目标不是文件".into());
    }
    if metadata.len() > MAX_BINARY_FILE_BYTES {
        return Err("发票文件超过 200 MB 限制".into());
    }

    let bytes = std::fs::read(file_path).map_err(|error| format!("读取文件失败：{error}"))?;
    Ok(Response::new(bytes))
}

/// 读取用户通过原生对话框选择的 JPG/PNG 电子签名，以原始字节返回。
#[tauri::command]
fn read_image_file(path: String) -> Result<Response, String> {
    let file_path = Path::new(&path);
    if path.trim().is_empty() {
        return Err("读取路径为空".into());
    }
    if !has_extension(file_path, "png")
        && !has_extension(file_path, "jpg")
        && !has_extension(file_path, "jpeg")
    {
        return Err("签名图片必须使用 .png/.jpg/.jpeg 扩展名".into());
    }

    let metadata =
        std::fs::metadata(file_path).map_err(|error| format!("读取文件信息失败：{error}"))?;
    if !metadata.is_file() {
        return Err("读取目标不是文件".into());
    }
    if metadata.len() > MAX_SIGNATURE_BYTES {
        return Err("签名图片超过 10 MB 限制".into());
    }

    let bytes = std::fs::read(file_path).map_err(|error| format!("读取文件失败：{error}"))?;
    Ok(Response::new(bytes))
}

/// 以原始字节写入 PDF。路径通过 `x-file-path` 请求头传入（百分号编码）。
#[tauri::command]
fn write_binary_file(request: Request<'_>) -> Result<(), String> {
    let encoded_path = request
        .headers()
        .get("x-file-path")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| "缺少 x-file-path 请求头".to_string())?;

    let path = percent_encoding::percent_decode_str(encoded_path)
        .decode_utf8()
        .map_err(|error| format!("保存路径编码无效：{error}"))?;
    let file_path = Path::new(&*path);

    if path.trim().is_empty() {
        return Err("保存路径为空".into());
    }
    if !has_extension(file_path, "pdf") {
        return Err("导出文件必须使用 .pdf 扩展名".into());
    }

    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("写入 PDF 时必须使用原始字节请求体".into());
    };

    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("创建保存目录失败：{error}"))?;
    }

    let temp_path = file_path.with_extension("pdf.tmp");
    std::fs::write(&temp_path, bytes).map_err(|error| format!("写入临时文件失败：{error}"))?;

    match std::fs::rename(&temp_path, file_path) {
        Ok(()) => Ok(()),
        Err(rename_error) => {
            // 某些 Windows 文件系统不允许覆盖式 rename，退化为直接写入。
            std::fs::write(file_path, bytes)
                .map_err(|error| format!("写入 PDF 失败：{error}（{rename_error}）"))?;
            let _ = std::fs::remove_file(&temp_path);
            Ok(())
        }
    }
}

/// 按白名单读取系统中文字体，供前端做 HarfBuzz 子集化后嵌入 PDF。
#[tauri::command]
fn read_system_font(kind: String) -> Result<Response, String> {
    let path: PathBuf = match kind.as_str() {
        "simsun" => PathBuf::from(r"C:\Windows\Fonts\simsun.ttc"),
        "yahei" => PathBuf::from(r"C:\Windows\Fonts\msyh.ttc"),
        _ => return Err("不支持的字体类型".into()),
    };

    let bytes =
        std::fs::read(&path).map_err(|error| format!("读取系统字体失败：{error}"))?;
    Ok(Response::new(bytes))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            save_workbook,
            read_binary_file,
            read_image_file,
            write_binary_file,
            read_system_font
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
