// ============================================
// crypto.rs - AES-256-GCM 파일 암호화/복호화
//
// 1) 단건 암호화: encrypt/decrypt (메타데이터, 썸네일 등 작은 데이터)
// 2) 청크 암호화: encrypt_file_chunked / decrypt_file_chunked (파일)
//
// 파일 포맷 구분:
//   - 레거시: 매직 없음. 전체 파일을 encrypt() 한 블롭. (구 형식, 신규 업로드는 청크만 사용)
//   - 청크(SV): 아래 포맷. format_version으로 향후 확장 가능.
//
// 청크 파일 포맷 (SV):
//   [헤더 8B] "SV" + version(1) + reserved(1) + chunk_size(4 BE)
//   [청크 0]  nonce(12) + ciphertext(≤chunk_size) + tag(16)
//   [청크 1]  ...
//   [청크 N]  (마지막 청크는 짧을 수 있음)
// ============================================

use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit};
use argon2::Argon2;
use rand::RngCore;
use std::io::{Read, Seek, SeekFrom, Write};

pub const KEY_LEN: usize = 32;
const NONCE_LEN: usize = 12;
const TAG_LEN: usize = 16;

// --- 청크 포맷 상수 ---
pub const CHUNK_SIZE: u32 = 1_048_576; // 1MB 평문 단위
pub const FILE_HEADER_SIZE: usize = 8;
pub const MAGIC: [u8; 2] = *b"SV";
/// 청크 포맷 버전 (레거시 = 매직 없음, SV 매직 + 이 버전 = 청크)
pub const FORMAT_V1: u8 = 1;

pub struct ChunkedHeader {
    #[allow(dead_code)]
    pub version: u8,
    pub chunk_size: u32,
}

// ===================== 기본 encrypt/decrypt (메타·썸네일용) =====================

/// Argon2로 비밀번호/복구키 → 32바이트 KEK 파생
pub fn derive_kek(password: &str, salt: &[u8]) -> Result<[u8; KEY_LEN], String> {
    let mut key = [0u8; KEY_LEN];
    Argon2::default()
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| e.to_string())?;
    Ok(key)
}

/// AES-256-GCM 단건 암호화 (nonce + ciphertext + tag)
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

/// AES-256-GCM 단건 복호화
pub fn decrypt(ciphertext: &[u8], key: &[u8; KEY_LEN]) -> Result<Vec<u8>, String> {
    if ciphertext.len() < NONCE_LEN + TAG_LEN {
        return Err("암호문이 너무 짧습니다.".into());
    }
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let (nonce_bytes, rest) = ciphertext.split_at(NONCE_LEN);
    let nonce = nonce_bytes.try_into().map_err(|_| "Nonce 형식 오류")?;
    cipher.decrypt(nonce, rest).map_err(|e| e.to_string())
}

// ===================== 청크 암호화 =====================

/// 파일 앞 2바이트가 "SV" 매직인지 확인
pub fn is_chunked(magic: &[u8]) -> bool {
    magic.len() >= 2 && magic[0] == MAGIC[0] && magic[1] == MAGIC[1]
}

/// 8바이트 헤더 파싱
pub fn parse_chunked_header(buf: &[u8]) -> Result<ChunkedHeader, String> {
    if buf.len() < FILE_HEADER_SIZE {
        return Err("청크 헤더가 너무 짧습니다.".into());
    }
    if !is_chunked(buf) {
        return Err("SV 매직 바이트가 아닙니다.".into());
    }
    Ok(ChunkedHeader {
        version: buf[2],
        chunk_size: u32::from_be_bytes([buf[4], buf[5], buf[6], buf[7]]),
    })
}

/// EOF까지 최대 buf.len() 바이트 읽기. 읽은 바이트 수 반환.
fn read_full(reader: &mut impl Read, buf: &mut [u8]) -> Result<usize, String> {
    let mut total = 0;
    while total < buf.len() {
        match reader.read(&mut buf[total..]) {
            Ok(0) => break,
            Ok(n) => total += n,
            Err(ref e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(total)
}

/// 파일 → 청크 암호화 스트리밍 (메모리 = 1 청크 크기)
pub fn encrypt_file_chunked<R: Read, W: Write>(
    reader: &mut R,
    writer: &mut W,
    key: &[u8; KEY_LEN],
    chunk_size: u32,
) -> Result<(), String> {
    writer.write_all(&MAGIC).map_err(|e| e.to_string())?;
    writer.write_all(&[FORMAT_V1, 0]).map_err(|e| e.to_string())?;
    writer.write_all(&chunk_size.to_be_bytes()).map_err(|e| e.to_string())?;

    let mut buf = vec![0u8; chunk_size as usize];
    loop {
        let n = read_full(reader, &mut buf)?;
        if n == 0 {
            break;
        }
        let enc = encrypt(&buf[..n], key)?;
        writer.write_all(&enc).map_err(|e| e.to_string())?;
    }
    writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

/// 청크 파일 → 전체 복호화 스트리밍 (메모리 = 1 청크 크기)
pub fn decrypt_file_chunked<R: Read, W: Write>(
    reader: &mut R,
    writer: &mut W,
    key: &[u8; KEY_LEN],
) -> Result<(), String> {
    let mut hdr = [0u8; FILE_HEADER_SIZE];
    reader.read_exact(&mut hdr).map_err(|e| e.to_string())?;
    let h = parse_chunked_header(&hdr)?;

    let enc_max = NONCE_LEN + h.chunk_size as usize + TAG_LEN;
    let mut buf = vec![0u8; enc_max];
    loop {
        let n = read_full(reader, &mut buf)?;
        if n == 0 {
            break;
        }
        let plain = decrypt(&buf[..n], key)?;
        writer.write_all(&plain).map_err(|e| e.to_string())?;
    }
    writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

/// 특정 청크 1개만 복호화 (랜덤 액세스 — 스트리밍 뷰어용)
pub fn decrypt_chunk_at<R: Read + Seek>(
    reader: &mut R,
    key: &[u8; KEY_LEN],
    chunk_index: u64,
    chunk_size: u32,
) -> Result<Vec<u8>, String> {
    let enc_max = (NONCE_LEN + chunk_size as usize + TAG_LEN) as u64;
    let offset = FILE_HEADER_SIZE as u64 + chunk_index * enc_max;
    reader
        .seek(SeekFrom::Start(offset))
        .map_err(|e| e.to_string())?;

    let mut buf = vec![0u8; enc_max as usize];
    let n = read_full(reader, &mut buf)?;
    if n == 0 {
        return Err("청크가 존재하지 않습니다.".into());
    }
    decrypt(&buf[..n], key)
}

/// 평문 바이트 오프셋 → (청크 인덱스, 청크 내 오프셋)
pub fn byte_to_chunk(offset: u64, chunk_size: u32) -> (u64, usize) {
    let cs = chunk_size as u64;
    (offset / cs, (offset % cs) as usize)
}
