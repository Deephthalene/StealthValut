// ============================================
// vault.rs - 금고 초기화 및 비밀번호 검증
// .vault_config 파일에 비밀번호 해시, 복구 키 해시 저장
// vault.db SQLite 초기화 (파일 인덱싱용)
// ============================================

use crate::db;
use base64::Engine;
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

/// 금고 설정 파일명 (금고 폴더 안에 숨김 파일로 저장)
const CONFIG_FILE: &str = ".vault_config";

/// .vault_config JSON 구조 (평문 비밀번호/복구키는 절대 저장 안 함)
#[derive(Serialize, Deserialize)]
struct VaultConfig {
    password_hash: String,
    recovery_key_hash: String,
}

/// 설정 파일 전체 경로 반환
pub fn vault_config_path(base: &Path) -> std::path::PathBuf {
    base.join(CONFIG_FILE)
}

/// 금고가 이미 초기화됐는지 (.vault_config 존재 여부)
pub fn vault_exists(base: &Path) -> bool {
    vault_config_path(base).exists()
}

/// 비밀번호를 해시로 변환 (Salt 랜덤, 역산 불가)
fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| e.to_string())
}

/// 입력 비밀번호가 저장된 해시와 일치하는지 검증
fn verify_password(password: &str, hash: &str) -> Result<bool, String> {
    let parsed = PasswordHash::new(hash).map_err(|e| e.to_string())?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

/// 금고 최초 설정: 비밀번호 해시·복구 키 생성·저장 후 복구 키(평문) 반환
pub fn vault_init(base: &Path, password: &str) -> Result<String, String> {
    let path = vault_config_path(base);
    if path.exists() {
        return Err("이미 금고가 초기화되어 있습니다.".into());
    }
    fs::create_dir_all(base).map_err(|e| e.to_string())?;

    let password_hash = hash_password(password)?;
    let recovery_key = generate_recovery_key();
    let recovery_key_hash = hash_password(&recovery_key)?;

    let config = VaultConfig {
        password_hash,
        recovery_key_hash,
    };
    let json = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;

    // SQLite DB 생성 (파일 목록 인덱싱용)
    db::init(base)?;

    Ok(recovery_key)
}

/// 비밀번호가 맞는지 확인
pub fn vault_verify(base: &Path, password: &str) -> Result<bool, String> {
    let path = vault_config_path(base);
    let data = fs::read_to_string(&path).map_err(|_| "금고 설정을 찾을 수 없습니다.")?;
    let config: VaultConfig = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    verify_password(password, &config.password_hash)
}

/// 복구 키로 금고 열기 (비밀번호 분실 시) - 검증만 수행
pub fn vault_verify_recovery_key(base: &Path, recovery_key: &str) -> Result<bool, String> {
    let path = vault_config_path(base);
    let data = fs::read_to_string(&path).map_err(|_| "금고 설정을 찾을 수 없습니다.")?;
    let config: VaultConfig = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    verify_password(recovery_key, &config.recovery_key_hash)
}

/// 복구 키로 비밀번호 재설정 (복구 키 검증 후 새 비밀번호로 교체)
pub fn vault_reset_password(
    base: &Path,
    recovery_key: &str,
    new_password: &str,
) -> Result<(), String> {
    let path = vault_config_path(base);
    let data = fs::read_to_string(&path).map_err(|_| "금고 설정을 찾을 수 없습니다.")?;
    let mut config: VaultConfig =
        serde_json::from_str(&data).map_err(|e| e.to_string())?;

    if !verify_password(recovery_key, &config.recovery_key_hash)? {
        return Err("복구 키가 올바르지 않습니다.".into());
    }

    config.password_hash = hash_password(new_password)?;
    let json = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;

    Ok(())
}

/// 개발용: 금고 초기화 (설정·DB 삭제)
pub fn vault_reset(base: &Path) -> Result<(), String> {
    let config_path = vault_config_path(base);
    let db_path = db::db_path(base);
    if config_path.exists() {
        fs::remove_file(&config_path).map_err(|e| e.to_string())?;
    }
    if db_path.exists() {
        fs::remove_file(&db_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 24바이트 랜덤 → Base64 문자열 (사용자에게 딱 한 번만 보여줌)
fn generate_recovery_key() -> String {
    let mut bytes = [0u8; 24];
    rand::thread_rng().fill_bytes(&mut bytes);
    base64::engine::general_purpose::STANDARD.encode(&bytes)
}
