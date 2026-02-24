// ============================================
// lib.rs - StealthVault 핵심 로직
// React(프론트)에서 invoke()로 호출하는 함수들이 여기 정의됨
// ============================================

mod crypto;
mod db;
mod folders;
mod quota;
mod vault;
mod vault_location;

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
}

/// 무료 사용자 용량 제한 (GB)
const FREE_TIER_GB: u64 = 5;

/// 금고 데이터 저장 경로 (저장된 위치 또는 기본 C:)
fn vault_base_path() -> PathBuf {
    vault_location::resolve_vault_path()
}

#[tauri::command]
fn check_quota() -> Result<QuotaResult, String> {
    let info = quota::get_quota_info(&vault_base_path())?;
    let limit_bytes = FREE_TIER_GB * 1024 * 1024 * 1024;
    Ok(QuotaResult {
        disk_free_bytes: info.disk_free_bytes,
        disk_free_gb: info.disk_free_gb,
        vault_used_bytes: info.vault_used_bytes,
        vault_used_gb: info.vault_used_gb,
        limit_bytes,
        limit_gb: FREE_TIER_GB as f64,
        can_deposit: info.vault_used_bytes < limit_bytes,
    })
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

/// 금고 초기화: 저장 경로 + 비밀번호로 설정, 복구 키 반환 (딱 한 번만! 경로 변경 불가)
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

/// Tauri 앱 실행 - 플러그인 등록, invoke 핸들러 등록
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            check_quota,
            get_vault_path,
            get_default_vault_path,
            get_disk_free_for_path,
            vault_exists,
            vault_init,
            vault_verify,
            vault_verify_recovery_key,
            vault_reset_password,
            vault_reset,
            list_folders,
            list_all_folders,
            create_folder,
            rename_folder,
            delete_folder
        ])
        .run(tauri::generate_context!())
        .expect("StealthVault 실행 실패");
}
