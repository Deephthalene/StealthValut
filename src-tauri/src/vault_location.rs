// ============================================
// vault_location.rs - 금고 저장 위치 설정
// AppData\Local\StealthVault\.vault_location 에 선택한 경로 저장
// 한번 설정 후 변경 불가
// ============================================

use std::fs;
use std::path::{Path, PathBuf};

const LOCATION_FILE: &str = ".vault_location";

/// 앱 설정 폴더 (고정 위치, C: 기반)
fn app_config_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("StealthVault")
}

/// 기본 금고 경로 (C: 드라이브)
pub fn get_default_vault_path() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("StealthVault")
}

/// 저장된 금고 경로 읽기 (없으면 None)
pub fn read_vault_path() -> Option<PathBuf> {
    let path = app_config_dir().join(LOCATION_FILE);
    let s = fs::read_to_string(&path).ok()?;
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    Some(PathBuf::from(s))
}

/// 드라이브 루트(D:\, C:\)이면 StealthVault 하위폴더 사용 (dir_size가 전체 드라이브를 세는 것 방지)
pub fn normalize_vault_path(path: &Path) -> PathBuf {
    let s = path.to_string_lossy();
    #[cfg(windows)]
    {
        let trimmed = s.trim_end_matches(std::path::MAIN_SEPARATOR);
        if trimmed.len() <= 3 && trimmed.ends_with(':') {
            return path.join("StealthVault");
        }
    }
    #[cfg(not(windows))]
    {
        if s == "/" || s.is_empty() {
            return path.join("StealthVault");
        }
    }
    path.to_path_buf()
}

/// 금고 경로 저장 (vault_init 시 한 번만 호출)
pub fn write_vault_path(vault_path: &Path) -> Result<(), String> {
    let config_dir = app_config_dir();
    fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let path = config_dir.join(LOCATION_FILE);
    fs::write(&path, vault_path.to_string_lossy().as_bytes()).map_err(|e| e.to_string())
}

/// 실제 사용할 금고 경로 (저장된 값 또는 기본값)
pub fn resolve_vault_path() -> PathBuf {
    read_vault_path().unwrap_or_else(get_default_vault_path)
}

/// 저장된 경로 초기화 (개발용 reset 시)
pub fn clear_vault_path() -> Result<(), String> {
    let path = app_config_dir().join(LOCATION_FILE);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
