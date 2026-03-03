// ============================================
// vault.rs - 금고 초기화 및 비밀번호 검증
// .vault_config: 비밀번호 해시, 복구 키 해시, DEK 암호화 저장
// vault.db SQLite 초기화 (파일 인덱싱용)
// ============================================

use crate::crypto::{self, KEY_LEN};
use crate::db;
use crate::key_cache;
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use base64::Engine;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

/// 금고 설정 파일명
const CONFIG_FILE: &str = ".vault_config";
const DEK_SALT_LEN: usize = 16;

/// .vault_config JSON (평문 비밀번호/복구키/DEK 절대 저장 안 함)
#[derive(Serialize, Deserialize)]
struct VaultConfig {
    password_hash: String,
    recovery_key_hash: String,
    #[serde(default)]
    dek_salt_b64: Option<String>,
    #[serde(default)]
    encrypted_dek_pw_b64: Option<String>,
    #[serde(default)]
    encrypted_dek_rk_b64: Option<String>,
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

/// 금고 최초 설정: 비밀번호 해시·복구 키·DEK 암호화 저장 후 복구 키 반환
pub fn vault_init(base: &Path, password: &str) -> Result<String, String> {
    let path = vault_config_path(base);
    if path.exists() {
        return Err("이미 금고가 초기화되어 있습니다.".into());
    }
    fs::create_dir_all(base).map_err(|e| e.to_string())?;

    let password_hash = hash_password(password)?;
    let recovery_key = generate_recovery_key();
    let recovery_key_hash = hash_password(&recovery_key)?;

    let mut dek = [0u8; KEY_LEN];
    rand::thread_rng().fill_bytes(&mut dek);
    let mut dek_salt = [0u8; DEK_SALT_LEN];
    rand::thread_rng().fill_bytes(&mut dek_salt);

    let kek_pw = crypto::derive_kek(password, &dek_salt)?;
    let kek_rk = crypto::derive_kek(&recovery_key, &dek_salt)?;
    let encrypted_dek_pw = crypto::encrypt(&dek, &kek_pw)?;
    let encrypted_dek_rk = crypto::encrypt(&dek, &kek_rk)?;

    let config = VaultConfig {
        password_hash,
        recovery_key_hash,
        dek_salt_b64: Some(base64::engine::general_purpose::STANDARD.encode(&dek_salt)),
        encrypted_dek_pw_b64: Some(base64::engine::general_purpose::STANDARD.encode(&encrypted_dek_pw)),
        encrypted_dek_rk_b64: Some(base64::engine::general_purpose::STANDARD.encode(&encrypted_dek_rk)),
    };
    let json = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;

    db::init(base)?;
    Ok(recovery_key)
}

/// 비밀번호 검증 후 DEK 캐시 (파일 암호화용, unlock 시 호출)
pub fn vault_cache_key(base: &Path, password: &str) -> Result<(), String> {
    let path = vault_config_path(base);
    let data = fs::read_to_string(&path).map_err(|_| "금고 설정을 찾을 수 없습니다.")?;
    let config: VaultConfig =
        serde_json::from_str(&data).map_err(|e| e.to_string())?;

    if !verify_password(password, &config.password_hash)? {
        return Err("비밀번호가 올바르지 않습니다.".into());
    }

    let (salt_b64, enc_pw_b64) = config
        .dek_salt_b64
        .as_ref()
        .zip(config.encrypted_dek_pw_b64.as_ref())
        .ok_or("금고가 이전 형식입니다. 개발 메뉴에서 금고 초기화 후 다시 생성해 주세요.")?;

    let dek_salt = base64::engine::general_purpose::STANDARD
        .decode(salt_b64)
        .map_err(|e| e.to_string())?;
    let enc_pw = base64::engine::general_purpose::STANDARD
        .decode(enc_pw_b64)
        .map_err(|e| e.to_string())?;
    let kek = crypto::derive_kek(password, &dek_salt)?;
    let dec = crypto::decrypt(&enc_pw, &kek)?;
    let dek: [u8; KEY_LEN] = dec
        .try_into()
        .map_err(|_| "DEK 길이 오류".to_string())?;

    key_cache::set_dek(dek);
    Ok(())
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

/// 복구 키로 비밀번호 재설정 + DEK 재암호화
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

    if let (Some(salt_b64), Some(enc_rk_b64)) =
        (config.dek_salt_b64.as_ref(), config.encrypted_dek_rk_b64.as_ref())
    {
        let dek_salt = base64::engine::general_purpose::STANDARD
            .decode(salt_b64)
            .map_err(|e| e.to_string())?;
        let enc_rk = base64::engine::general_purpose::STANDARD
            .decode(enc_rk_b64)
            .map_err(|e| e.to_string())?;
        let kek_rk = crypto::derive_kek(recovery_key, &dek_salt)?;
        let kek_arr: [u8; KEY_LEN] = kek_rk;
        let dek = crypto::decrypt(&enc_rk, &kek_arr)?;
        let dek_arr: [u8; KEY_LEN] = dek.as_slice().try_into().map_err(|_| "DEK 길이 오류")?;
        let kek_pw = crypto::derive_kek(new_password, &dek_salt)?;
        let enc_pw = crypto::encrypt(&dek_arr, &kek_pw)?;
        config.encrypted_dek_pw_b64 =
            Some(base64::engine::general_purpose::STANDARD.encode(&enc_pw));
    }

    let json = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

/// 현재 비밀번호로 인증 후 새 비밀번호로 변경 + DEK 재암호화
pub fn vault_change_password(
    base: &Path,
    current_password: &str,
    new_password: &str,
) -> Result<(), String> {
    let path = vault_config_path(base);
    let data = fs::read_to_string(&path).map_err(|_| "금고 설정을 찾을 수 없습니다.")?;
    let mut config: VaultConfig =
        serde_json::from_str(&data).map_err(|e| e.to_string())?;

    if !verify_password(current_password, &config.password_hash)? {
        return Err("현재 비밀번호가 올바르지 않습니다.".into());
    }

    config.password_hash = hash_password(new_password)?;

    if let (Some(salt_b64), Some(enc_pw_b64)) = (
        config.dek_salt_b64.as_ref(),
        config.encrypted_dek_pw_b64.as_ref(),
    ) {
        let dek_salt = base64::engine::general_purpose::STANDARD
            .decode(salt_b64)
            .map_err(|e| e.to_string())?;
        let enc_pw = base64::engine::general_purpose::STANDARD
            .decode(enc_pw_b64)
            .map_err(|e| e.to_string())?;
        let kek_old = crypto::derive_kek(current_password, &dek_salt)?;
        let dek = crypto::decrypt(&enc_pw, &kek_old)?;
        let dek_arr: [u8; KEY_LEN] = dek
            .as_slice()
            .try_into()
            .map_err(|_| "DEK 길이 오류".to_string())?;
        let kek_new = crypto::derive_kek(new_password, &dek_salt)?;
        let enc_new = crypto::encrypt(&dek_arr, &kek_new)?;
        config.encrypted_dek_pw_b64 =
            Some(base64::engine::general_purpose::STANDARD.encode(&enc_new));
    }

    let json = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;

    // 캐시된 DEK 갱신 (새 비밀번호 기반)
    key_cache::clear_dek();
    vault_cache_key(base, new_password)?;

    Ok(())
}

/// 개발용: 금고 초기화 (설정·DB·암호화 데이터 삭제)
pub fn vault_reset(base: &Path) -> Result<(), String> {
    let config_path = vault_config_path(base);
    let db_path = db::db_path(base);
    let data_dir = base.join("data");
    if config_path.exists() {
        fs::remove_file(&config_path).map_err(|e| e.to_string())?;
    }
    if db_path.exists() {
        fs::remove_file(&db_path).map_err(|e| e.to_string())?;
    }
    if data_dir.exists() {
        fs::remove_dir_all(&data_dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 24바이트 랜덤 → Base64 문자열 (사용자에게 딱 한 번만 보여줌)
fn generate_recovery_key() -> String {
    let mut bytes = [0u8; 24];
    rand::thread_rng().fill_bytes(&mut bytes);
    base64::engine::general_purpose::STANDARD.encode(&bytes)
}
