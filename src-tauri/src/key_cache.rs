// ============================================
// key_cache.rs - DEK 메모리 캐시
// 금고 잠금 시 반드시 clear
// ============================================

use std::sync::Mutex;

static DEK_CACHE: Mutex<Option<[u8; 32]>> = Mutex::new(None);

/// 암호화 키 캐시 (unlock 시 저장)
pub fn set_dek(key: [u8; 32]) {
    let _ = DEK_CACHE.lock().map(|mut g| *g = Some(key));
}

/// 캐시된 키 반환 (없으면 None)
pub fn get_dek() -> Option<[u8; 32]> {
    DEK_CACHE.lock().ok().and_then(|g| g.clone())
}

/// 잠금 시 키 제거
pub fn clear_dek() {
    let _ = DEK_CACHE.lock().map(|mut g| *g = None);
}
