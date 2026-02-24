// ============================================
// quota.rs - 디스크 용량 조회
// 하드 여유공간, 금고 폴더 사용량 계산
// ============================================

use serde::Serialize;
use std::path::Path;
use sysinfo::Disks;

/// 용량 정보 (lib.rs에서 QuotaResult로 변환해 프론트에 전달)
#[derive(Serialize)]
pub struct QuotaInfo {
    pub disk_free_bytes: u64,
    pub disk_free_gb: f64,
    pub vault_used_bytes: u64,
    pub vault_used_gb: f64,
}

/// 경로가 있는 드라이브의 여유 공간(바이트) 반환 (설정 시 선택 가능 여부 판단용)
pub fn get_disk_free_for_path(path: &Path) -> u64 {
    let check = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let mut path_str = check.to_string_lossy().to_string();
    // Windows: canonicalize가 "\\?\D:\..." 반환 시 mount "D:\"와 매칭 실패 → 접두사 제거
    #[cfg(windows)]
    if path_str.starts_with(r"\\?\") {
        path_str = path_str[r"\\?\".len()..].to_string();
    }
    let path_str = path_str.replace('/', std::path::MAIN_SEPARATOR_STR);
    let disks = Disks::new_with_refreshed_list();
    for disk in disks.list() {
        let mount = disk.mount_point().to_string_lossy();
        let mount_norm = mount.trim_end_matches(std::path::MAIN_SEPARATOR);
        if !mount_norm.is_empty() && path_str.starts_with(&*mount) {
            return disk.available_space();
        }
    }
    disks.list().first().map(|d| d.available_space()).unwrap_or(0)
}

/// 폴더 크기 재귀 합산 (하위 폴더 포함)
fn dir_size(path: &Path) -> u64 {
    let mut total = 0u64;
    if path.exists() {
        if let Ok(entries) = std::fs::read_dir(path) {
            for entry in entries.flatten() {
                if let Ok(m) = entry.metadata() {
                    if m.is_dir() {
                        total += dir_size(&entry.path());
                    } else {
                        total += m.len();
                    }
                }
            }
        }
    }
    total
}

/// 금고 경로 기준으로 디스크 여유 + 금고 사용량 계산
pub fn get_quota_info(vault_path: &Path) -> Result<QuotaInfo, String> {
    let disk_free_bytes = if vault_path.exists() {
        get_disk_free_for_path(vault_path)
    } else {
        get_disk_free_for_path(vault_path.parent().unwrap_or(Path::new(".")))
    };
    let vault_used_bytes = dir_size(vault_path);
    Ok(QuotaInfo {
        disk_free_bytes,
        disk_free_gb: disk_free_bytes as f64 / (1024.0 * 1024.0 * 1024.0),
        vault_used_bytes,
        vault_used_gb: vault_used_bytes as f64 / (1024.0 * 1024.0 * 1024.0),
    })
}
