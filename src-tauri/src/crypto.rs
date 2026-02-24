// ============================================
// crypto.rs - AES-256-GCM 파일 암호화/복호화
// DEK(Data Encryption Key)로 파일 암호화
// Nonce 12바이트, Tag 16바이트
// ============================================

use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit};
use argon2::Argon2;
use rand::RngCore;

pub const KEY_LEN: usize = 32;
const NONCE_LEN: usize = 12;
const TAG_LEN: usize = 16;

/// Argon2로 비밀번호/복구키 → 32바이트 KEK 파생
pub fn derive_kek(password: &str, salt: &[u8]) -> Result<[u8; KEY_LEN], String> {
    let mut key = [0u8; KEY_LEN];
    Argon2::default()
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| e.to_string())?;
    Ok(key)
}

/// AES-256-GCM으로 암호화 (plaintext → ciphertext = nonce + cipher + tag)
pub fn encrypt(plaintext: &[u8], key: &[u8; KEY_LEN]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let mut nonce = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut nonce);
    let ciphertext = cipher
        .encrypt(&nonce.into(), plaintext)
        .map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

/// AES-256-GCM으로 복호화
pub fn decrypt(ciphertext: &[u8], key: &[u8; KEY_LEN]) -> Result<Vec<u8>, String> {
    if ciphertext.len() < NONCE_LEN + TAG_LEN {
        return Err("암호문이 너무 짧습니다.".into());
    }
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let (nonce_bytes, rest) = ciphertext.split_at(NONCE_LEN);
    let nonce = nonce_bytes.try_into().map_err(|_| "Nonce 형식 오류")?;
    cipher.decrypt(nonce, rest).map_err(|e| e.to_string())
}
