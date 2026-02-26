// ============================================
// vault_location.rs - 금고 저장 위치 설정
// AppData\Local\StealthVault\.vault_location 에 선택한 경로 저장
// 최초 설정 후 변경 가능: 설정 화면에서 change_vault_location 호출 (잘라내기 방식)
// ============================================

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

const LOCATION_FILE: &str = ".vault_location";
const VAULT_CONFIG: &str = ".vault_config";
const VAULT_DB: &str = "vault.db";
const DATA_DIR: &str = "data";
const LICENSE_FILE: &str = "license.dat";

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

/// 새 경로가 비어있는지 확인 (vault 파일 없음)
fn is_path_empty_for_vault(path: &Path) -> bool {
    let config = path.join(VAULT_CONFIG);
    let db = path.join(VAULT_DB);
    let data = path.join(DATA_DIR);
    !config.exists() && !db.exists() && !data.exists()
}

/// 폴더 재귀 복사
fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), io::Error> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let dst_path = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&entry.path(), &dst_path)?;
        } else {
            fs::copy(entry.path(), dst_path)?;
        }
    }
    Ok(())
}

/// 금고 저장 위치 변경 (잘라내기 방식)
/// 기존 경로의 .vault_config, vault.db, data/, license.dat를 새 경로로 이동
pub fn change_vault_location(new_path: &Path) -> Result<(), String> {
    let old_path = resolve_vault_path();

    let new_path = {
        let p = PathBuf::from(new_path);
        if p.to_string_lossy().trim().is_empty() {
            return Err("경로가 비어있습니다.".into());
        }
        p
    };

    let old_canon = old_path.canonicalize().map_err(|e| e.to_string())?;
    let new_abs = if new_path.exists() {
        new_path.canonicalize().map_err(|_| "대상 경로를 확인할 수 없습니다.")?
    } else {
        fs::create_dir_all(&new_path).map_err(|e| format!("폴더 생성 실패: {}", e))?;
        new_path.canonicalize().map_err(|_| "대상 경로를 확인할 수 없습니다.")?
    };

    if old_canon == new_abs {
        return Err("현재 경로와 동일합니다.".into());
    }

    if !crate::vault::vault_exists(&old_path) {
        return Err("금고가 초기화되지 않았습니다.".into());
    }

    if !is_path_empty_for_vault(&new_abs) {
        return Err("선택한 폴더가 비어있지 않습니다.".into());
    }

    let vault_used = crate::quota::get_quota_info(&old_path)
        .map(|i| i.vault_used_bytes)
        .unwrap_or(0);
    let disk_free = crate::quota::get_disk_free_for_path(&new_abs);
    if disk_free < vault_used {
        return Err("대상 드라이브의 여유 공간이 부족합니다.".into());
    }

    fs::create_dir_all(&new_abs).map_err(|e| e.to_string())?;

    let copy_result = (|| -> Result<(), String> {
        let config_src = old_path.join(VAULT_CONFIG);
        let config_dst = new_abs.join(VAULT_CONFIG);
        fs::copy(&config_src, &config_dst).map_err(|e| format!("이동 중 오류: {}", e))?;

        let db_src = old_path.join(VAULT_DB);
        let db_dst = new_abs.join(VAULT_DB);
        if db_src.exists() {
            fs::copy(&db_src, &db_dst).map_err(|e| format!("이동 중 오류: {}", e))?;
        }

        let data_src = old_path.join(DATA_DIR);
        let data_dst = new_abs.join(DATA_DIR);
        if data_src.exists() {
            copy_dir_recursive(&data_src, &data_dst).map_err(|e| format!("이동 중 오류: {}", e))?;
        }

        let license_src = old_path.join(LICENSE_FILE);
        if license_src.exists() {
            let _ = fs::copy(&license_src, new_abs.join(LICENSE_FILE));
        }

        Ok(())
    })();

    if let Err(e) = copy_result {
        let _ = fs::remove_dir_all(&new_abs);
        return Err(format!(
            "이동 중 오류가 발생했습니다. 기존 경로를 유지합니다. ({})",
            e
        ));
    }

    if !crate::vault::vault_exists(&new_abs) {
        let _ = fs::remove_dir_all(&new_abs);
        return Err("이동 검증에 실패했습니다. 기존 경로를 유지합니다.".into());
    }

    let remove_old = || {
        let _ = fs::remove_file(old_path.join(VAULT_CONFIG));
        let _ = fs::remove_file(old_path.join(VAULT_DB));
        let _ = fs::remove_dir_all(old_path.join(DATA_DIR));
        let _ = fs::remove_file(old_path.join(LICENSE_FILE));
    };

    remove_old();
    let _ = fs::remove_dir(&old_path);

    write_vault_path(&new_abs)?;
    Ok(())
}
