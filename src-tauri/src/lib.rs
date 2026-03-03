// ============================================
// lib.rs - StealthVault 핵심 로직
// React(프론트)에서 invoke()로 호출하는 함수들이 여기 정의됨
// ============================================

mod crypto;
mod db;
mod folders;
mod license;
mod key_cache;
mod quota;
mod vault;
mod vault_files;
mod vault_location;
mod thumbnails;
mod purchase_email;

use std::path::PathBuf;

/// 프론트에 반환할 용량 정보 (check_quota의 반환 타입)
#[derive(serde::Serialize)]
pub struct QuotaResult {
    pub disk_free_bytes: u64,
    pub disk_free_gb: f64,
    pub vault_used_bytes: u64,
    pub vault_used_gb: f64,
    pub limit_bytes: u64,
    pub limit_gb: f64,
    pub can_deposit: bool,
    pub is_premium: bool,
}

/// 무료 사용자 용량 제한 (GB)
const FREE_TIER_GB: u64 = 5;

/// 금고 데이터 저장 경로 (저장된 위치 또는 기본 C:)
fn vault_base_path() -> PathBuf {
    vault_location::resolve_vault_path()
}

#[derive(serde::Serialize)]
pub struct LicenseStatus {
    pub is_premium: bool,
    pub email: Option<String>,
}

#[tauri::command]
fn check_quota() -> Result<QuotaResult, String> {
    let base = vault_base_path();
    let info = quota::get_quota_info(&base)?;
    let is_premium = license::load_license(&base).ok().flatten().is_some();
    let (limit_bytes, limit_gb) = if is_premium {
        (info.disk_total_bytes, info.disk_total_gb)
    } else {
        let lb = FREE_TIER_GB * 1024 * 1024 * 1024;
        (lb, FREE_TIER_GB as f64)
    };
    let can_deposit = if is_premium {
        info.disk_free_bytes > 10 * 1024 * 1024 // 디스크 여유 10MB 이상
    } else {
        info.vault_used_bytes < limit_bytes
    };
    Ok(QuotaResult {
        disk_free_bytes: info.disk_free_bytes,
        disk_free_gb: info.disk_free_gb,
        vault_used_bytes: info.vault_used_bytes,
        vault_used_gb: info.vault_used_gb,
        limit_bytes,
        limit_gb,
        can_deposit,
        is_premium,
    })
}

#[tauri::command]
fn verify_and_activate_license(key: String, email: String) -> Result<(), String> {
    let base = vault_base_path();
    license::save_license(&key, &email, &base).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_license_status() -> Result<LicenseStatus, String> {
    let base = vault_base_path();
    match license::load_license(&base) {
        Ok(Some(info)) => Ok(LicenseStatus {
            is_premium: true,
            email: Some(info.email),
        }),
        Ok(None) => Ok(LicenseStatus {
            is_premium: false,
            email: None,
        }),
        Err(e) => Ok(LicenseStatus {
            is_premium: false,
            email: None,
        }),
    }
}

#[tauri::command]
async fn send_purchase_request(name: String, email: String) -> Result<(), String> {
    purchase_email::send_purchase_request_email(&name, &email).await
}

/// 금고가 저장된 폴더 경로 반환
#[tauri::command]
fn get_vault_path() -> String {
    vault_base_path().to_string_lossy().to_string()
}

/// 금고가 이미 생성되었는지 확인 (최초 실행 여부 판단)
#[tauri::command]
fn vault_exists() -> Result<bool, String> {
    let base = vault_base_path();
    Ok(vault::vault_exists(&base))
}

/// 기본 금고 경로 (설정 화면 초기값, C:)
#[tauri::command]
fn get_default_vault_path() -> String {
    vault_location::get_default_vault_path()
        .to_string_lossy()
        .to_string()
}

/// 선택 경로의 드라이브 여유 공간(바이트) - 5GB 미만이면 선택 불가
#[tauri::command]
fn get_disk_free_for_path(path: String) -> u64 {
    quota::get_disk_free_for_path(PathBuf::from(&path).as_path())
}

/// 금고 저장 위치 변경 (잘라내기 방식 — .vault_config, vault.db, data/, license.dat 이동)
#[tauri::command]
fn change_vault_location(new_path: String) -> Result<(), String> {
    let path = PathBuf::from(new_path.trim());
    if path.as_os_str().is_empty() {
        return Err("경로가 비어있습니다.".into());
    }
    vault_location::change_vault_location(path.as_path())
}

/// 금고 초기화: 저장 경로 + 비밀번호로 설정, 복구 키 반환 (설정에서 경로 변경 가능)
#[tauri::command]
fn vault_init(vault_path: String, password: String) -> Result<String, String> {
    let raw = PathBuf::from(&vault_path);
    let base = vault_location::normalize_vault_path(&raw);
    let recovery_key = vault::vault_init(&base, &password)?;
    vault_location::write_vault_path(&base)?;
    Ok(recovery_key)
}

/// 비밀번호 검증 (금고 열 때)
#[tauri::command]
fn vault_verify(password: String) -> Result<bool, String> {
    vault::vault_verify(&vault_base_path(), &password)
}

/// unlock 시 DEK 캐시 (파일 암호화용) + 1회 백필
#[tauri::command]
fn vault_cache_key(password: String) -> Result<(), String> {
    vault::vault_cache_key(&vault_base_path(), &password)?;
    let base = vault_base_path();
    std::thread::spawn(move || {
        let _ = vault_files::backfill_files_index(&base);
    });
    Ok(())
}

/// 잠금 시 DEK 제거
#[tauri::command]
fn vault_clear_key() -> Result<(), String> {
    key_cache::clear_dek();
    Ok(())
}

/// 복구 키로 금고 열기 (검증만)
#[tauri::command]
fn vault_verify_recovery_key(recovery_key: String) -> Result<bool, String> {
    vault::vault_verify_recovery_key(&vault_base_path(), &recovery_key)
}

/// 복구 키로 비밀번호 재설정 (검증 후 새 비밀번호로 교체)
#[tauri::command]
fn vault_reset_password(recovery_key: String, new_password: String) -> Result<(), String> {
    vault::vault_reset_password(
        &vault_base_path(),
        &recovery_key,
        &new_password,
    )
}

/// 현재 비밀번호로 인증 후 새 비밀번호로 변경
#[tauri::command]
fn vault_change_password(current_password: String, new_password: String) -> Result<(), String> {
    vault::vault_change_password(
        &vault_base_path(),
        &current_password,
        &new_password,
    )
}

/// 개발용: 금고 초기화 (신규 생성 화면 다시 보기)
#[tauri::command]
fn vault_reset() -> Result<(), String> {
    let base = vault_base_path();
    vault::vault_reset(&base)?;
    vault_location::clear_vault_path()
}

/// 폴더 목록 (parent_id 없으면 루트)
#[tauri::command]
fn list_folders(parent_id: Option<String>) -> Result<Vec<folders::FolderItem>, String> {
    folders::list_folders(&vault_base_path(), parent_id.as_deref())
}

/// 전체 폴더 트리
#[tauri::command]
fn list_all_folders() -> Result<Vec<folders::FolderItem>, String> {
    folders::list_all_folders(&vault_base_path())
}

/// 폴더 생성
#[tauri::command]
fn create_folder(name: String, parent_id: Option<String>) -> Result<folders::FolderItem, String> {
    folders::create_folder(&vault_base_path(), &name, parent_id.as_deref())
}

/// 폴더 이름 변경
#[tauri::command]
fn rename_folder(id: String, new_name: String) -> Result<(), String> {
    folders::rename_folder(&vault_base_path(), &id, &new_name)
}

/// 폴더 삭제
#[tauri::command]
fn delete_folder(id: String) -> Result<(), String> {
    folders::delete_folder(&vault_base_path(), &id)
}

/// 폴더 부모 변경 (다른 폴더로 이동)
#[tauri::command]
fn change_folder_parent(folder_id: String, new_parent_id: Option<String>) -> Result<(), String> {
    folders::change_folder_parent(
        &vault_base_path(),
        &folder_id,
        new_parent_id.as_deref(),
    )
}

/// file:// URL 또는 일반 경로를 PathBuf로 변환 (드롭 시 Windows에서 file:/// 경로 올 수 있음)
fn parse_file_path(s: &str) -> PathBuf {
    let s = s.trim();
    if s.starts_with("file://") {
        if let Ok(u) = url::Url::parse(s) {
            if let Ok(p) = u.to_file_path() {
                return p;
            }
        }
        let rest = s
            .trim_start_matches("file:///")
            .trim_start_matches("file://");
        PathBuf::from(rest.replace('/', std::path::MAIN_SEPARATOR_STR))
    } else {
        PathBuf::from(s)
    }
}

/// 무료 플랜 용량 초과 여부 확인
fn check_free_tier_quota(base: &std::path::Path) -> Result<(), String> {
    let is_premium = license::load_license(base).ok().flatten().is_some();
    if !is_premium {
        let info = quota::get_quota_info(base)?;
        let limit_bytes = FREE_TIER_GB * 1024 * 1024 * 1024;
        if info.vault_used_bytes >= limit_bytes {
            return Err(format!(
                "무료 플랜의 저장 한도({} GB)에 도달했습니다. 프리미엄으로 업그레이드하세요.",
                FREE_TIER_GB
            ));
        }
    }
    Ok(())
}

/// 파일 이동+암호화 (원본 삭제)
#[tauri::command]
fn vault_move_file(source_path: String, folder_id: Option<String>) -> Result<String, String> {
    let base = vault_base_path();
    check_free_tier_quota(&base)?;
    let path = parse_file_path(&source_path);
    vault_files::vault_move_file(&base, path.as_path(), folder_id.as_deref())
}

/// 폴더 업로드 (재귀)
#[tauri::command]
fn vault_move_folder(source_path: String, folder_id: Option<String>) -> Result<(usize, usize), String> {
    let base = vault_base_path();
    check_free_tier_quota(&base)?;
    let path = parse_file_path(&source_path);
    vault_files::vault_move_folder(&base, path.as_path(), folder_id.as_deref())
}

/// 파일 삭제 (금고에서 영구 제거)
#[tauri::command]
fn vault_delete_file(file_id: String) -> Result<(), String> {
    vault_files::vault_delete_file(&vault_base_path(), &file_id)
}

/// 파일 이름 변경
#[tauri::command]
fn vault_rename_file(file_id: String, new_name: String) -> Result<(), String> {
    vault_files::vault_rename_file(&vault_base_path(), &file_id, &new_name)
}

/// 파일 폴더 이동
#[tauri::command]
fn vault_change_folder(file_id: String, folder_id: Option<String>) -> Result<(), String> {
    vault_files::vault_change_folder(&vault_base_path(), &file_id, folder_id.as_deref())
}

/// 압축 해제 (금고 내)
#[tauri::command]
fn vault_extract_archive(file_id: String, folder_id: Option<String>) -> Result<(usize, usize), String> {
    vault_files::vault_extract_archive(
        &vault_base_path(),
        &file_id,
        folder_id.as_deref(),
    )
}

/// 썸네일 없을 때 on-demand 생성
#[tauri::command]
fn get_file_thumbnail(file_id: String) -> Result<Option<String>, String> {
    vault_files::get_or_create_thumbnail(&vault_base_path(), &file_id)
}

/// 뷰어용: 파일 전체 복호화 → base64 반환
#[tauri::command]
fn get_file_data(file_id: String) -> Result<String, String> {
    vault_files::get_file_data_base64(&vault_base_path(), &file_id)
}

/// 폴더 내 파일 목록 (전체, 기존 호환)
#[tauri::command]
fn list_files(folder_id: Option<String>) -> Result<Vec<vault_files::FileItem>, String> {
    vault_files::list_files(&vault_base_path(), folder_id.as_deref())
}

/// 폴더 내 파일 목록 페이징 (가상 리스트/무한 스크롤용)
#[tauri::command]
fn list_files_paged(
    folder_id: Option<String>,
    limit: u32,
    offset: u32,
) -> Result<(Vec<vault_files::FileItem>, u64), String> {
    vault_files::list_files_page(
        &vault_base_path(),
        folder_id.as_deref(),
        limit,
        offset,
    )
}

/// 파일 출고 (복호화 → 저장 → 금고에서 삭제)
#[tauri::command]
fn vault_extract_file(file_id: String, dest_path: String) -> Result<(), String> {
    vault_files::vault_extract_file(
        &vault_base_path(),
        &file_id,
        PathBuf::from(&dest_path).as_path(),
    )
}

/// 폴더 내보내기 (재귀)
#[tauri::command]
fn vault_extract_folder(folder_id: String, dest_path: String) -> Result<(usize, usize), String> {
    vault_files::vault_extract_folder(
        &vault_base_path(),
        &folder_id,
        PathBuf::from(&dest_path).as_path(),
    )
}

/// 파일 복사 내보내기 (금고에서 삭제하지 않음)
#[tauri::command]
fn vault_copy_out(file_id: String, dest_path: String) -> Result<(), String> {
    vault_files::vault_copy_out(
        &vault_base_path(),
        &file_id,
        PathBuf::from(&dest_path).as_path(),
    )
}

/// 드래그아웃 준비: (복호화 파일 경로, 아이콘 경로) 반환
#[tauri::command]
fn vault_prepare_drag_out(file_id: String) -> Result<(String, String), String> {
    let base = vault_base_path();
    let file_path = vault_files::vault_prepare_drag_out(&base, &file_id)?;
    let icon_path = vault_files::get_drag_icon(&base, &file_id)?;
    Ok((file_path, icon_path))
}

/// 드래그 완료 후 금고에서 삭제
#[tauri::command]
fn vault_confirm_drag_out(file_id: String) -> Result<(), String> {
    vault_files::vault_confirm_drag_out(&vault_base_path(), &file_id)
}

/// 드래그아웃 임시 파일만 정리 (금고 유지)
#[tauri::command]
fn vault_cleanup_drag_temp(file_id: String) {
    vault_files::vault_cleanup_drag_temp(&file_id);
}

/// 스트리밍 프로토콜 핸들러: stream://localhost/{file_id}
fn handle_stream_request(
    request: http::Request<Vec<u8>>,
) -> Result<http::Response<Vec<u8>>, Box<dyn std::error::Error>> {
    use http::header::*;
    use http::status::StatusCode;

    let path = percent_encoding::percent_decode(request.uri().path().as_bytes())
        .decode_utf8_lossy()
        .to_string();
    let file_id = path.trim_start_matches('/');

    if file_id.is_empty() {
        return Ok(http::Response::builder()
            .status(404)
            .body(Vec::new())?);
    }

    let base = vault_base_path();
    let dek = match key_cache::get_dek() {
        Some(d) => d,
        None => {
            return Ok(http::Response::builder()
                .status(403)
                .body(b"locked".to_vec())?);
        }
    };

    let info = match vault_files::get_stream_info(&base, file_id) {
        Ok(i) => i,
        Err(_) => {
            return Ok(http::Response::builder()
                .status(404)
                .body(Vec::new())?);
        }
    };

    let total_len = info.size_bytes;
    let mut resp = http::Response::builder().header(CONTENT_TYPE, &info.mime_type);

    if let Some(range_header) = request.headers().get("range") {
        let range_str = range_header.to_str().unwrap_or("");
        let ranges = match http_range::HttpRange::parse(range_str, total_len) {
            Ok(r) => r,
            Err(_) => {
                return Ok(http::Response::builder()
                    .status(StatusCode::RANGE_NOT_SATISFIABLE)
                    .header(CONTENT_RANGE, format!("bytes */{total_len}"))
                    .body(Vec::new())?);
            }
        };

        if let Some(range) = ranges.first() {
            let start = range.start;
            let mut end = start + range.length - 1;
            const MAX_CHUNK: u64 = 2 * 1024 * 1024;
            end = end.min(start + MAX_CHUNK - 1).min(total_len - 1);
            let bytes_len = end + 1 - start;

            let conn = rusqlite::Connection::open(crate::db::db_path(&base)).ok();
            let header_enc: Option<Vec<u8>> = conn.and_then(|c| {
                let hash = info.enc_path.file_name()?.to_str()?;
                c.query_row(
                    "SELECT header_encrypted FROM files WHERE hash_name = ?1",
                    [hash],
                    |r| r.get(0),
                )
                .ok()
            });
            let buf = if info.is_chunked {
                vault_files::decrypt_range(
                    &info.enc_path,
                    &dek,
                    info.chunk_size,
                    header_enc.as_deref(),
                    start,
                    end,
                )
            } else {
                vault_files::decrypt_range_legacy(
                    &info.enc_path,
                    header_enc.as_deref(),
                    &dek,
                    start,
                    end,
                )
            };

            match buf {
                Ok(data) => {
                    resp = resp.header(CONTENT_RANGE, format!("bytes {start}-{end}/{total_len}"));
                    resp = resp.header(CONTENT_LENGTH, bytes_len);
                    resp = resp.status(StatusCode::PARTIAL_CONTENT);
                    Ok(resp.body(data)?)
                }
                Err(_) => Ok(http::Response::builder()
                    .status(500)
                    .body(Vec::new())?),
            }
        } else {
            Ok(http::Response::builder()
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .body(Vec::new())?)
        }
    } else {
        // Range 없으면 전체 반환 (소형 파일용)
        let conn = rusqlite::Connection::open(crate::db::db_path(&base)).ok();
        let header_enc: Option<Vec<u8>> = conn.and_then(|c| {
            let hash = info.enc_path.file_name()?.to_str()?;
            c.query_row(
                "SELECT header_encrypted FROM files WHERE hash_name = ?1",
                [hash],
                |r| r.get(0),
            )
            .ok()
        });
        let buf: Result<Vec<u8>, String> = if info.is_chunked {
            vault_files::decrypt_range(
                &info.enc_path,
                &dek,
                info.chunk_size,
                header_enc.as_deref(),
                0,
                total_len.saturating_sub(1),
            )
        } else {
            vault_files::decrypt_range_legacy(
                &info.enc_path,
                header_enc.as_deref(),
                &dek,
                0,
                total_len.saturating_sub(1),
            )
        };
        match buf {
            Ok(data) => {
                resp = resp.header(CONTENT_LENGTH, data.len());
                Ok(resp.body(data)?)
            }
            Err(_) => Ok(http::Response::builder()
                .status(500)
                .body(Vec::new())?),
        }
    }
}

/// Tauri 앱 실행 - 플러그인 등록, invoke 핸들러 등록
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_drag::init())
        .register_asynchronous_uri_scheme_protocol("stream", move |_ctx, request, responder| {
            std::thread::spawn(move || {
                match handle_stream_request(request) {
                    Ok(resp) => responder.respond(resp),
                    Err(e) => responder.respond(
                        http::Response::builder()
                            .status(500)
                            .header("Content-Type", "text/plain")
                            .body(e.to_string().into_bytes())
                            .unwrap(),
                    ),
                }
            });
        })
        .invoke_handler(tauri::generate_handler![
            check_quota,
            get_vault_path,
            get_default_vault_path,
            get_disk_free_for_path,
            vault_exists,
            vault_init,
            vault_verify,
            vault_cache_key,
            vault_clear_key,
            vault_verify_recovery_key,
            vault_reset_password,
            vault_change_password,
            vault_reset,
            list_folders,
            list_all_folders,
            create_folder,
            rename_folder,
            delete_folder,
            change_folder_parent,
            vault_move_file,
            vault_move_folder,
            vault_extract_archive,
            vault_delete_file,
            vault_rename_file,
            vault_change_folder,
            get_file_thumbnail,
            get_file_data,
            list_files,
            list_files_paged,
            vault_extract_file,
            vault_extract_folder,
            vault_copy_out,
            vault_prepare_drag_out,
            vault_confirm_drag_out,
            vault_cleanup_drag_temp,
            change_vault_location,
            verify_and_activate_license,
            get_license_status,
            send_purchase_request
        ])
        .run(tauri::generate_context!())
        .expect("StealthVault 실행 실패");
}
