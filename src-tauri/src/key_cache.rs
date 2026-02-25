// ============================================
// key_cache.rs - DEK 메모리 캐시
// 금고 잠금 시 반드시 clear
// ============================================

use std::sync::Mutex;

static DEK_CACHE: Mutex<Option<[u8; 32]>> = Mutex::new(None);

fn zeroize_key(key: &mut [u8; 32]) {
    for b in key.iter_mut() {
        *b = 0;
    }
}

/// 암호화 키 캐시 (unlock 시 저장)
pub fn set_dek(key: [u8; 32]) {
    let _ = DEK_CACHE.lock().map(|mut g| {
        if let Some(ref mut existing) = *g {
            zeroize_key(existing);
        }
        *g = Some(key);
    });
}

/// 캐시된 키 반환 (없으면 None)
pub fn get_dek() -> Option<[u8; 32]> {
    DEK_CACHE.lock().ok().and_then(|g| g.clone())
}

/// 잠금 시 키 제거 (메모리 제로아웃 포함)
pub fn clear_dek() {
    let _ = DEK_CACHE.lock().map(|mut g| {
        if let Some(ref mut key) = *g {
            zeroize_key(key);
        }
        *g = None;
    });
}
