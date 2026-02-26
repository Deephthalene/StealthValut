// ============================================
// license.rs - Ed25519 오프라인 라이센스 검증
// 서버 없이 공개키로 서명 검증, 이메일 해시 일치 확인
// ============================================

use crate::crypto;
use data_encoding::BASE32_NOPAD;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;

/// 앱에 하드코딩되는 Ed25519 공개키 (개인키는 tools/keygen에서만 보관)
const PUBLIC_KEY_BYTES: [u8; 32] = [94, 121, 77, 54, 52, 25, 145, 17, 106, 154, 205, 98, 197, 201, 213, 55, 225, 72, 201, 196, 168, 75, 142, 177, 180, 153, 237, 100, 66, 133, 25, 237];

const LICENSE_FILE: &str = "license.dat";
const PAYLOAD_SIZE: usize = 44; // 1 + 1 + 32 + 10
const SIGNATURE_SIZE: usize = 64;

#[derive(Debug, Clone)]
pub struct LicenseInfo {
    pub tier: u8,
    pub email: String,
}

#[derive(Debug)]
pub enum LicenseError {
    InvalidSignature,
    EmailMismatch,
    Corrupted,
    NotFound,
}

impl std::fmt::Display for LicenseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LicenseError::InvalidSignature => write!(f, "유효하지 않은 라이센스 키입니다."),
            LicenseError::EmailMismatch => write!(f, "이메일이 일치하지 않습니다."),
            LicenseError::Corrupted => write!(f, "라이센스 파일이 손상되었습니다."),
            LicenseError::NotFound => write!(f, "라이센스가 없습니다."),
        }
    }
}

impl std::error::Error for LicenseError {}

fn decode_license_key(key_str: &str) -> Result<Vec<u8>, LicenseError> {
    let clean: String = key_str
        .trim()
        .to_uppercase()
        .chars()
        .filter(|c| *c != '-' && *c != ' ')
        .collect();
    BASE32_NOPAD
        .decode(clean.as_bytes())
        .map_err(|_| LicenseError::InvalidSignature)
}

/// 라이센스 키 서명 검증 + 이메일 해시 일치 확인
pub fn verify_license(key_str: &str, email: &str) -> Result<LicenseInfo, LicenseError> {
    if PUBLIC_KEY_BYTES == [0u8; 32] {
        return Err(LicenseError::InvalidSignature);
    }

    let decoded = decode_license_key(key_str)?;
    if decoded.len() < PAYLOAD_SIZE + SIGNATURE_SIZE {
        return Err(LicenseError::InvalidSignature);
    }

    let (payload, sig_bytes) = decoded.split_at(PAYLOAD_SIZE);
    let signature =
        Signature::from_slice(sig_bytes).map_err(|_| LicenseError::InvalidSignature)?;
    let verifying_key =
        VerifyingKey::from_bytes(&PUBLIC_KEY_BYTES).map_err(|_| LicenseError::InvalidSignature)?;

    verifying_key
        .verify(payload, &signature)
        .map_err(|_| LicenseError::InvalidSignature)?;

    let _version = payload[0];
    let tier = payload[1];
    let mut email_hash = [0u8; 32];
    email_hash.copy_from_slice(&payload[2..34]);

    let mut hasher = Sha256::new();
    hasher.update(email.trim().to_lowercase().as_bytes());
    let expected_hash = hasher.finalize();
    if email_hash != expected_hash[..] {
        return Err(LicenseError::EmailMismatch);
    }

    Ok(LicenseInfo {
        tier,
        email: email.trim().to_string(),
    })
}

/// 검증된 라이센스를 AES-GCM 암호화하여 license.dat 저장
/// DEK 사용 (key_cache에 있어야 함)
pub fn save_license(key_str: &str, email: &str, vault_path: &Path) -> Result<(), LicenseError> {
    let info = verify_license(key_str, email)?;
    let dek = crate::key_cache::get_dek().ok_or(LicenseError::Corrupted)?;

    let mut blob = vec![info.tier];
    blob.extend_from_slice(info.email.as_bytes());

    let encrypted = crypto::encrypt(&blob, &dek).map_err(|_| LicenseError::Corrupted)?;
    let path = vault_path.join(LICENSE_FILE);
    fs::write(&path, &encrypted).map_err(|_| LicenseError::Corrupted)?;
    Ok(())
}

/// 저장된 license.dat 로드 및 복호화
pub fn load_license(vault_path: &Path) -> Result<Option<LicenseInfo>, LicenseError> {
    let path = vault_path.join(LICENSE_FILE);
    if !path.exists() {
        return Ok(None);
    }

    let dek = match crate::key_cache::get_dek() {
        Some(d) => d,
        None => return Ok(None),
    };

    let encrypted = fs::read(&path).map_err(|_| LicenseError::Corrupted)?;
    let decrypted = crypto::decrypt(&encrypted, &dek).map_err(|_| LicenseError::Corrupted)?;

    if decrypted.len() < 2 {
        return Err(LicenseError::Corrupted);
    }

    let tier = decrypted[0];
    let email = if decrypted.len() > 1 {
        String::from_utf8_lossy(&decrypted[1..]).to_string()
    } else {
        String::new()
    };
    Ok(Some(LicenseInfo { tier, email }))
}
