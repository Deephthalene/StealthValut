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

/// 같은 파일시스템인지 확인 (같으면 rename 사용 가능)
fn same_filesystem(a: &Path, b: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if let (Ok(ma), Ok(mb)) = (fs::metadata(a), fs::metadata(b)) {
            return ma.dev() == mb.dev();
        }
    }
    #[cfg(windows)]
    {
        // Windows: 드라이브 레터가 같으면 같은 파일시스템으로 간주
        let to_drive = |p: &Path| {
            p.components()
                .next()
                .and_then(|c| c.as_os_str().to_str())
                .and_then(|s| s.chars().next())
                .map(|c| if ('a'..='z').contains(&c) { ((c as u8) - 32) as char } else { c })
        };
        if let (Some(a_d), Some(b_d)) = (to_drive(a), to_drive(b)) {
            return a_d == b_d;
        }
    }
    false
}

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

/// 폴더 재귀 복사 (진행률 콜백)
fn copy_dir_recursive_with_progress<F: FnMut(u64, u64)>(
    src: &Path,
    dst: &Path,
    total_bytes: u64,
    done: &mut u64,
    cb: &mut F,
) -> Result<(), io::Error> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let dst_path = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive_with_progress(&entry.path(), &dst_path, total_bytes, done, cb)?;
        } else {
            let len = entry.metadata().map(|m| m.len()).unwrap_or(0);
            fs::copy(entry.path(), &dst_path)?;
            *done += len;
            cb(*done, total_bytes);
        }
    }
    Ok(())
}




/// 진행률 콜백 (done_bytes, total_bytes). 없으면 None.
pub type ProgressFn = Option<Box<dyn FnMut(u64, u64) + Send>>;

/// 금고 저장 위치 변경 (잘라내기 방식)
/// - 같은 드라이브: fs::rename으로 실제 이동
/// - 다른 드라이브: 복사 후 삭제
/// - 대상에 이미 금고가 있으면: 포인터만 전환(되돌리기 지원)
/// 반환: 새 경로 문자열 (`.vault_location`에 쓸 값)
pub fn change_vault_location_with_progress(
    new_path: &Path,
    mut progress: ProgressFn,
) -> Result<String, String> {
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

    // 모드 1: 대상에 이미 금고가 있음 → 포인터만 전환 (되돌리기)
    if crate::vault::vault_exists(&new_abs) {
        write_vault_path(&new_abs)?;
        return Ok(new_abs.to_string_lossy().to_string());
    }

    // 모드 2: 대상이 비어야 함
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

    let mut do_progress = |done: u64, total: u64| {
        if let Some(ref mut f) = progress {
            f(done, total);
        }
    };

    let same_fs = same_filesystem(&old_canon, &new_abs);
    let config_src = old_path.join(VAULT_CONFIG);
    let config_dst = new_abs.join(VAULT_CONFIG);
    let db_src = old_path.join(VAULT_DB);
    let db_dst = new_abs.join(VAULT_DB);
    let data_src = old_path.join(DATA_DIR);
    let data_dst = new_abs.join(DATA_DIR);
    let license_src = old_path.join(LICENSE_FILE);
    let license_dst = new_abs.join(LICENSE_FILE);

    let mut done_bytes: u64 = 0;

    // 1) config
    if same_fs {
        fs::rename(&config_src, &config_dst)
            .map_err(|e| format!("이동 중 오류: {}", e))?;
        done_bytes += fs::metadata(&config_dst).map(|m| m.len()).unwrap_or(0);
        do_progress(done_bytes, vault_used);
    } else {
        fs::copy(&config_src, &config_dst)
            .map_err(|e| format!("이동 중 오류: {}", e))?;
        done_bytes += fs::metadata(&config_src).map(|m| m.len()).unwrap_or(0);
        do_progress(done_bytes, vault_used);
    }

    // 2) db
    if db_src.exists() {
        if same_fs {
            fs::rename(&db_src, &db_dst).map_err(|e| format!("이동 중 오류: {}", e))?;
            done_bytes += fs::metadata(&db_dst).map(|m| m.len()).unwrap_or(0);
            do_progress(done_bytes, vault_used);
        } else {
            fs::copy(&db_src, &db_dst).map_err(|e| format!("이동 중 오류: {}", e))?;
            done_bytes += fs::metadata(&db_src).map(|m| m.len()).unwrap_or(0);
            do_progress(done_bytes, vault_used);
        }
    }

    // 3) data
    if data_src.exists() {
        if same_fs {
            fs::rename(&data_src, &data_dst).map_err(|e| format!("이동 중 오류: {}", e))?;
            done_bytes = vault_used;
            do_progress(done_bytes, vault_used);
        } else {
            copy_dir_recursive_with_progress(
                &data_src,
                &data_dst,
                vault_used,
                &mut done_bytes,
                &mut |d, t| do_progress(d, t),
            )
            .map_err(|e| format!("이동 중 오류: {}", e))?;
        }
    }

    // 4) license
    if license_src.exists() {
        if same_fs {
            let _ = fs::rename(&license_src, &license_dst);
        } else {
            let _ = fs::copy(&license_src, &license_dst);
        }
    }

    if !crate::vault::vault_exists(&new_abs) {
        let _ = fs::remove_dir_all(&new_abs);
        return Err("이동 검증에 실패했습니다. 기존 경로를 유지합니다.".into());
    }

    // 기존 경로에서 삭제 (같은 fs면 이미 rename으로 옮겼으므로 없을 수 있음)
    if !same_fs {
        let mut delete_failed = Vec::new();
        if config_src.exists() && fs::remove_file(&config_src).is_err() {
            delete_failed.push(VAULT_CONFIG);
        }
        if db_src.exists() && fs::remove_file(&db_src).is_err() {
            delete_failed.push(VAULT_DB);
        }
        if data_src.exists() && fs::remove_dir_all(&data_src).is_err() {
            delete_failed.push(DATA_DIR);
        }
        if license_src.exists() {
            let _ = fs::remove_file(&license_src);
        }
        if !delete_failed.is_empty() {
            // 이동은 완료됐지만 기존 삭제 실패 → 앱 재시작 후 수동 삭제 안내
            eprintln!(
                "[vault_location] 기존 파일 삭제 실패 (앱 재시작 후 수동 삭제 권장): {:?}",
                delete_failed
            );
        }
    }

    let _ = fs::remove_dir(&old_path);
    write_vault_path(&new_abs)?;
    Ok(new_abs.to_string_lossy().to_string())
}



