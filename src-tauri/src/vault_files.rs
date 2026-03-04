// ============================================
// vault_files.rs - 파일 입고/출고 (이동 + 암호화/복호화)
// 입고: 원본 삭제 | 출고: 금고에서 삭제
//
// 물리 파일 형식:
//   - 레거시: 전체 파일을 crypto::encrypt 한 블롭 (매직 없음). header_encrypted 있으면 DB 헤더 + 본문 복호화 합침.
//   - 청크: crypto SV 포맷 [8B 헤더][청크0][청크1]... 신규 업로드는 모두 청크.
//   - Phase 3 (header_encrypted): 청크 파일의 평문 = [더미 1~8KB][원본 나머지]. DB에 헤더 암호화 저장, 물리에는 더미+청크.
// ============================================

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use crate::crypto;
use crate::key_cache;
use crate::thumbnails;
use rusqlite::Connection;
use std::fs;
use std::io::{BufReader, BufWriter, Cursor, Read, Seek, SeekFrom, Write};
use std::collections::HashMap;
use std::path::Path;
use rand::RngCore;

const DATA_DIR: &str = "data";
/// 썸네일 생성용 최대 읽기 크기 (대형 파일은 앞부분만 읽어서 시도)
const THUMB_MAX_READ: u64 = 100 * 1024 * 1024;
/// Phase 3: 물리 파일에서 분리해 DB에 넣을 헤더 크기 (파일 종류 추측 방지)
const STEALTH_HEADER_LEN: usize = 8192;

/// 금고 data 폴더 경로
fn data_dir(base: &Path) -> std::path::PathBuf {
    base.join(DATA_DIR)
}

fn conn(base: &Path) -> Result<Connection, String> {
    crate::db::ensure_schema(base)?;
    let c =
        Connection::open(crate::db::db_path(base)).map_err(|e| e.to_string())?;
    c.execute_batch("PRAGMA journal_mode=DELETE;")
        .map_err(|e| e.to_string())?;
    c.busy_timeout(std::time::Duration::from_secs(5)).map_err(|e| e.to_string())?;
    Ok(c)
}

const ENC_PREFIX: &str = "ENC:";
const ZERO_CHUNK: usize = 64 * 1024; // 64KB

/// 포렌식 방지: 파일을 0으로 덮어쓴 후 삭제
fn secure_delete(path: &Path) -> Result<(), String> {
    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    let size = meta.len();
    let mut f = fs::OpenOptions::new().write(true).open(path).map_err(|e| e.to_string())?;
    let mut written = 0u64;
    let zeros = [0u8; ZERO_CHUNK];
    while written < size {
        let to_write = ((size - written) as usize).min(ZERO_CHUNK);
        f.write_all(&zeros[..to_write]).map_err(|e| e.to_string())?;
        written += to_write as u64;
    }
    f.sync_all().map_err(|e| e.to_string())?;
    drop(f);
    fs::remove_file(path).map_err(|e| e.to_string())?;
    Ok(())
}

fn encrypt_field(s: &str, dek: &[u8; crate::crypto::KEY_LEN]) -> Result<String, String> {
    let enc = crypto::encrypt(s.as_bytes(), dek)?;
    Ok(format!("{}{}", ENC_PREFIX, BASE64.encode(&enc)))
}

fn decrypt_field(
    enc: &str,
    dek: Option<&[u8; crate::crypto::KEY_LEN]>,
) -> Result<String, String> {
    if let Some(b64) = enc.strip_prefix(ENC_PREFIX) {
        let Some(dek) = dek else {
            return Ok("[잠금됨]".to_string());
        };
        let bytes = BASE64.decode(b64).map_err(|e| e.to_string())?;
        let dec = crypto::decrypt(&bytes, dek)?;
        String::from_utf8(dec).map_err(|e| e.to_string())
    } else {
        Ok(enc.to_string())
    }
}

/// created_at 값 복호화 (ENC: 문자열 또는 레거시 정수 문자열 → i64)
fn decrypt_created_at(s: &str, dek: Option<&[u8; crypto::KEY_LEN]>) -> Result<i64, String> {
    if let Some(b64) = s.strip_prefix(ENC_PREFIX) {
        let dek = dek.ok_or("DEK 없음")?;
        let bytes = BASE64.decode(b64).map_err(|e: base64::DecodeError| e.to_string())?;
        let dec = crypto::decrypt(&bytes, dek)?;
        String::from_utf8(dec)
            .map_err(|e: std::string::FromUtf8Error| e.to_string())?
            .parse()
            .map_err(|e: std::num::ParseIntError| e.to_string())
    } else {
        s.parse().map_err(|e: std::num::ParseIntError| e.to_string())
    }
}

/// header_encrypted blob 파싱 (레거시 파일 호환용) → (header_len, encrypted_bytes)
fn parse_header_encrypted(blob: &[u8]) -> Result<(u16, &[u8]), String> {
    if blob.len() < 2 {
        return Err("header_encrypted 형식 오류".into());
    }
    let len = u16::from_be_bytes([blob[0], blob[1]]);
    Ok((len, &blob[2..]))
}

/// 물리 파일 + header_encrypted → 원본 평문 (레거시: header_encrypted 없으면 전체 복호화)
fn decrypt_file_full(
    physical_bytes: &[u8],
    header_encrypted: Option<&[u8]>,
    dek: &[u8; crate::crypto::KEY_LEN],
) -> Result<Vec<u8>, String> {
    let Some(blob) = header_encrypted else {
        return crypto::decrypt(physical_bytes, dek);
    };
    let (header_len_usize, enc_header) = parse_header_encrypted(blob)?;
    let header_len = header_len_usize as usize;
    if physical_bytes.len() < header_len {
        return Err("물리 파일이 손상되었습니다.".into());
    }
    let header = crypto::decrypt(enc_header, dek)?;
    let body_encrypted = &physical_bytes[header_len..];
    let body = crypto::decrypt(body_encrypted, dek)?;
    let mut plaintext = Vec::with_capacity(header.len() + body.len());
    plaintext.extend_from_slice(&header);
    plaintext.extend_from_slice(&body);
    Ok(plaintext)
}

/// Phase 3: [랜덤 N바이트][파일 offset N~끝] 순서로 읽는 Reader (업로드 시 물리 파일에 더미 헤더 쓰기 위함)
struct DummyHeaderThenFileReader {
    dummy: Vec<u8>,
    dummy_pos: usize,
    file: fs::File,
}

impl Read for DummyHeaderThenFileReader {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        if self.dummy_pos < self.dummy.len() {
            let n = (self.dummy.len() - self.dummy_pos).min(buf.len());
            buf[..n].copy_from_slice(&self.dummy[self.dummy_pos..self.dummy_pos + n]);
            self.dummy_pos += n;
            return Ok(n);
        }
        self.file.read(buf)
    }
}

/// Phase 3: 처음 skip_len 바이트는 버리고, 그 다음부터만 inner에 전달하는 Writer
struct SkipWriter<W: Write> {
    skip_len: usize,
    skipped: usize,
    inner: W,
}

impl<W: Write> SkipWriter<W> {
    fn new(skip_len: usize, inner: W) -> Self {
        Self {
            skip_len,
            skipped: 0,
            inner,
        }
    }
}

impl<W: Write> Write for SkipWriter<W> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        if self.skipped >= self.skip_len {
            return self.inner.write(buf);
        }
        let to_skip = (self.skip_len - self.skipped).min(buf.len());
        self.skipped += to_skip;
        if to_skip < buf.len() {
            self.inner.write_all(&buf[to_skip..])?;
        }
        Ok(buf.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        self.inner.flush()
    }
}

/// 썸네일 생성. 이미지: 디코딩 실패 시 Err(업로드 중단). 음악/영상/기타: 실패 시 Ok(None).
fn make_thumbnail(plaintext: &[u8], path: &Path) -> Result<Option<Vec<u8>>, String> {
    let kind = thumbnails::file_kind_from_ext(path);
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    eprintln!("[thumb] path={:?} ext={:?} kind={:?} data_len={}", path, ext, kind, plaintext.len());
    let result = match kind {
        thumbnails::FileKind::Image => {
            let r1 = thumbnails::make_image_thumbnail(plaintext);
            eprintln!("[thumb] make_image_thumbnail => ok={} err={:?}",
                r1.is_ok(), r1.as_ref().err());
            r1.map(Some).or_else(|_| {
                let r2 = thumbnails::make_image_thumbnail_with_format(plaintext, ext);
                eprintln!("[thumb] make_image_thumbnail_with_format => ok={} err={:?}",
                    r2.is_ok(), r2.as_ref().err());
                r2.map(Some)
            })
        }
        thumbnails::FileKind::Audio => Ok(thumbnails::extract_audio_cover(plaintext, ext)
            .ok()
            .and_then(|o| o.and_then(|cover| thumbnails::make_image_thumbnail(&cover).ok()))),
        thumbnails::FileKind::Video => Ok(thumbnails::extract_video_frame(plaintext, ext).ok().flatten()),
        _ => Ok(None),
    };
    eprintln!("[thumb] result => is_ok={} is_some={}", result.is_ok(),
        result.as_ref().map_or(false, |o| o.is_some()));
    result
}

/// 파일 이동+암호화 (원본 삭제)
pub fn vault_move_file(
    base: &Path,
    source_path: &Path,
    folder_id: Option<&str>,
) -> Result<String, String> {
    let dek = key_cache::get_dek()
        .ok_or("암호화 키가 없습니다. 금고를 잠근 후 비밀번호로 다시 열어주세요.")?;

    if !source_path.exists() {
        return Err("원본 파일을 찾을 수 없습니다.".into());
    }
    let meta = fs::metadata(source_path).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("폴더는 업로드할 수 없습니다.".into());
    }
    let mut original_name = source_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();
    if let Some(idx) = original_name.find('_') {
        let prefix = &original_name[..idx];
        if prefix.len() == 36
            && uuid::Uuid::parse_str(prefix).is_ok()
            && idx + 1 < original_name.len()
        {
            original_name = original_name[idx + 1..].to_string();
        }
    }
    let original_path_str = source_path.to_string_lossy().to_string();
    let size_bytes = meta.len() as i64;
    let created_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs() as i64;

    let data_path = data_dir(base);
    fs::create_dir_all(&data_path).map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let temp_path = data_path.join(format!(".tmp_{}", id));

    match fs::rename(source_path, &temp_path) {
        Ok(()) => {}
        Err(e) => {
            // 크로스 디바이스/드라이브 이동 실패 시 복사 + 원본 삭제
            let cross_dev = if cfg!(unix) {
                e.raw_os_error() == Some(18) // EXDEV
            } else if cfg!(windows) {
                e.raw_os_error() == Some(17) // ERROR_NOT_SAME_DEVICE
            } else {
                false
            };
            if cross_dev {
                fs::copy(source_path, &temp_path).map_err(|e| e.to_string())?;
                secure_delete(source_path)?;
            } else {
                return Err(format!("파일 이동 실패: {}", e));
            }
        }
    }

    let do_upload = || -> Result<String, String> {
        let file_kind = thumbnails::file_kind_from_ext(Path::new(&original_name));

        let file_len = fs::metadata(&temp_path).map_err(|e| e.to_string())?.len();
        let read_len = file_len.min(THUMB_MAX_READ) as usize;
        let mut head_buf = vec![0u8; read_len];
        {
            let mut f = fs::File::open(&temp_path).map_err(|e| e.to_string())?;
            f.read_exact(&mut head_buf).map_err(|e| e.to_string())?;
        }

        // 썸네일
        let thumbnail_plain = if file_len <= THUMB_MAX_READ {
            make_thumbnail(&head_buf, Path::new(&original_name))?
        } else {
            make_thumbnail(&head_buf, Path::new(&original_name)).unwrap_or(None)
        };

        // Phase 3: 헤더 분리 (1~8KB) → DB에 암호화 저장, 물리 파일에는 더미+본문만 청크 암호화
        let header_len_actual = if file_len == 0 {
            0
        } else {
            (STEALTH_HEADER_LEN as u64).min(file_len) as usize
        };
        let header_encrypted_blob: Option<Vec<u8>> = if header_len_actual > 0 {
            let header_plain = head_buf[..header_len_actual.min(head_buf.len())].to_vec();
            let enc = crypto::encrypt(&header_plain, &dek)?;
            let mut blob = (header_len_actual as u16).to_be_bytes().to_vec();
            blob.extend_from_slice(&enc);
            Some(blob)
        } else {
            None
        };

        // 청크 스트리밍 암호화 (메모리 = 1MB)
        let hash_name = format!("{}.dat", id);
        let dest_file = data_path.join(&hash_name);
        if header_len_actual > 0 {
            let mut dummy = vec![0u8; header_len_actual];
            rand::thread_rng().fill_bytes(&mut dummy);
            let mut file = fs::File::open(&temp_path).map_err(|e| e.to_string())?;
            file.seek(SeekFrom::Start(header_len_actual as u64))
                .map_err(|e| e.to_string())?;
            let comb = DummyHeaderThenFileReader {
                dummy,
                dummy_pos: 0,
                file,
            };
            let mut reader = BufReader::new(comb);
            let dst = fs::File::create(&dest_file).map_err(|e| e.to_string())?;
            let mut writer = BufWriter::new(dst);
            crypto::encrypt_file_chunked(&mut reader, &mut writer, &dek, crypto::CHUNK_SIZE)?;
        } else {
            let src = fs::File::open(&temp_path).map_err(|e| e.to_string())?;
            let mut reader = BufReader::new(src);
            let dst = fs::File::create(&dest_file).map_err(|e| e.to_string())?;
            let mut writer = BufWriter::new(dst);
            crypto::encrypt_file_chunked(&mut reader, &mut writer, &dek, crypto::CHUNK_SIZE)?;
        }

        secure_delete(&temp_path).map_err(|e| {
            fs::remove_file(&dest_file).ok();
            format!("임시 파일 삭제 실패: {}. 암호화된 파일은 저장되었습니다.", e)
        })?;

        let original_name_enc = encrypt_field(&original_name, &dek)?;
        let original_path_enc = encrypt_field(&original_path_str, &dek)?;
        let mime_type_enc = encrypt_field(&mime_from_name(&original_name), &dek)?;
        let created_at_enc = encrypt_field(&created_at.to_string(), &dek)?;

        let thumbnail_encrypted = thumbnail_plain
            .as_ref()
            .and_then(|t| crypto::encrypt(t, &dek).ok());

        let file_kind_str = match file_kind {
            thumbnails::FileKind::Image => "image",
            thumbnails::FileKind::Video => "video",
            thumbnails::FileKind::Audio => "audio",
            thumbnails::FileKind::Document => "document",
            thumbnails::FileKind::Other => "other",
        };

        let conn = conn(base)?;
        conn.execute_batch("BEGIN IMMEDIATE").map_err(|e| e.to_string())?;

        let tx_result = (|| -> Result<(), String> {
            conn.execute(
                "INSERT INTO files (id, folder_id, original_name, original_path, hash_name, mime_type, size_bytes, thumbnail_blob, header_encrypted, created_at, created_at_enc) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, ?10)",
                rusqlite::params![
                    id,
                    folder_id,
                    original_name_enc,
                    original_path_enc,
                    hash_name,
                    mime_type_enc,
                    size_bytes,
                    thumbnail_encrypted,
                    header_encrypted_blob,
                    created_at_enc,
                ],
            )
            .map_err(|e| e.to_string())?;

            conn.execute(
                "INSERT INTO files_index (id, folder_id, hash_name, display_name, thumbnail_blob, created_at, created_at_enc, file_kind, size_bytes) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, ?8)",
                rusqlite::params![
                    id,
                    folder_id,
                    hash_name,
                    original_name,
                    thumbnail_plain,
                    created_at_enc,
                    file_kind_str,
                    size_bytes,
                ],
            )
            .map_err(|e| e.to_string())?;
            Ok(())
        })();

        match tx_result {
            Ok(()) => {
                conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
            }
            Err(e) => {
                let _ = conn.execute_batch("ROLLBACK");
                return Err(e);
            }
        }

        Ok(id)
    };

    match do_upload() {
        Ok(id) => Ok(id),
        Err(e) => {
            if temp_path.exists() {
                let _ = fs::rename(&temp_path, source_path).or_else(|_| {
                    let _ = fs::copy(&temp_path, source_path);
                    let _ = fs::remove_file(&temp_path);
                    Err(())
                });
            }
            Err(e)
        }
    }
}

/// 메모리 버퍼에서 직접 입고 — 임시 복호화 파일 디스크 저장 없음 (ZIP 해제 등용)
pub fn vault_move_file_from_bytes(
    base: &Path,
    data: Vec<u8>,
    original_name: &str,
    folder_id: Option<&str>,
) -> Result<String, String> {
    let dek = key_cache::get_dek()
        .ok_or("암호화 키가 없습니다. 금고를 잠근 후 비밀번호로 다시 열어주세요.")?;

    let size_bytes = data.len() as i64;
    let original_path_str = "";
    let created_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs() as i64;

    let data_path = data_dir(base);
    fs::create_dir_all(&data_path).map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let hash_name = format!("{}.dat", id);
    let dest_file = data_path.join(&hash_name);

    let file_kind = thumbnails::file_kind_from_ext(Path::new(original_name));
    let read_len = (THUMB_MAX_READ as usize).min(data.len());
    let head_buf = &data[..read_len];

    let thumbnail_plain = if data.len() <= THUMB_MAX_READ as usize {
        make_thumbnail(head_buf, Path::new(original_name))?
    } else {
        make_thumbnail(head_buf, Path::new(original_name)).unwrap_or(None)
    };

    let header_len_actual = if data.is_empty() {
        0
    } else {
        STEALTH_HEADER_LEN.min(data.len())
    };
    let header_encrypted_blob: Option<Vec<u8>> = if header_len_actual > 0 {
        let header_plain = data[..header_len_actual].to_vec();
        let enc = crypto::encrypt(&header_plain, &dek)?;
        let mut blob = (header_len_actual as u16).to_be_bytes().to_vec();
        blob.extend_from_slice(&enc);
        Some(blob)
    } else {
        None
    };

    // 청크 암호화: [더미 헤더][본문] — Cursor로 메모리에서만 처리, 디스크 임시파일 없음
    let mut reader: Box<dyn Read> = if header_len_actual > 0 {
        let mut dummy = vec![0u8; header_len_actual];
        rand::thread_rng().fill_bytes(&mut dummy);
        let body_slice = &data[header_len_actual..];
        Box::new(BufReader::new(
            Cursor::new(dummy).chain(Cursor::new(body_slice)),
        ))
    } else {
        Box::new(BufReader::new(Cursor::new(&data)))
    };
    let dst = fs::File::create(&dest_file).map_err(|e| e.to_string())?;
    let mut writer = BufWriter::new(dst);
    crypto::encrypt_file_chunked(&mut reader, &mut writer, &dek, crypto::CHUNK_SIZE)?;

    let original_name_enc = encrypt_field(original_name, &dek)?;
    let original_path_enc = encrypt_field(original_path_str, &dek)?;
    let mime_type_enc = encrypt_field(&mime_from_name(original_name), &dek)?;
    let created_at_enc = encrypt_field(&created_at.to_string(), &dek)?;
    let thumbnail_encrypted = thumbnail_plain
        .as_ref()
        .and_then(|t| crypto::encrypt(t, &dek).ok());

    let file_kind_str = match file_kind {
        thumbnails::FileKind::Image => "image",
        thumbnails::FileKind::Video => "video",
        thumbnails::FileKind::Audio => "audio",
        thumbnails::FileKind::Document => "document",
        thumbnails::FileKind::Other => "other",
    };

    let conn = conn(base)?;
    conn.execute_batch("BEGIN IMMEDIATE").map_err(|e| e.to_string())?;
    let tx_result = (|| -> Result<(), String> {
        conn.execute(
            "INSERT INTO files (id, folder_id, original_name, original_path, hash_name, mime_type, size_bytes, thumbnail_blob, header_encrypted, created_at, created_at_enc) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, ?10)",
            rusqlite::params![
                id,
                folder_id,
                original_name_enc,
                original_path_enc,
                hash_name,
                mime_type_enc,
                size_bytes,
                thumbnail_encrypted,
                header_encrypted_blob,
                created_at_enc,
            ],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO files_index (id, folder_id, hash_name, display_name, thumbnail_blob, created_at, created_at_enc, file_kind, size_bytes) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, ?8)",
            rusqlite::params![
                id,
                folder_id,
                hash_name,
                original_name,
                thumbnail_plain,
                created_at_enc,
                file_kind_str,
                size_bytes,
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })();
    match tx_result {
        Ok(()) => {
            conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            fs::remove_file(&dest_file).ok();
            return Err(e);
        }
    }

    Ok(id)
}

/// 암호화 파일 → writer 스트리밍 복호화 (청크/레거시 자동 감지)
fn decrypt_to_writer(
    enc_path: &Path,
    header_encrypted: Option<&[u8]>,
    dek: &[u8; crypto::KEY_LEN],
    writer: &mut impl Write,
) -> Result<(), String> {
    let mut file = fs::File::open(enc_path).map_err(|e| e.to_string())?;
    let mut magic = [0u8; 2];
    file.read_exact(&mut magic).map_err(|e| e.to_string())?;
    file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;

    if crypto::is_chunked(&magic) {
        if let Some(blob) = header_encrypted {
            let (header_len_u16, enc_header) = parse_header_encrypted(blob)?;
            let header_len = header_len_u16 as usize;
            let header_plain = crypto::decrypt(enc_header, dek)?;
            writer.write_all(&header_plain).map_err(|e| e.to_string())?;
            let mut skip_w = SkipWriter::new(header_len, writer);
            let mut reader = BufReader::new(file);
            crypto::decrypt_file_chunked(&mut reader, &mut skip_w, dek)?;
            Ok(())
        } else {
            let mut reader = BufReader::new(file);
            crypto::decrypt_file_chunked(&mut reader, writer, dek)?;
            Ok(())
        }
    } else {
        let mut physical = Vec::new();
        file.read_to_end(&mut physical).map_err(|e| e.to_string())?;
        let plaintext = decrypt_file_full(&physical, header_encrypted, dek)?;
        writer.write_all(&plaintext).map_err(|e| e.to_string())?;
        Ok(())
    }
}

/// 암호화 파일 → Vec<u8> 전체 복호화 (썸네일 생성 등 메모리 필요 시)
fn decrypt_to_vec(
    enc_path: &Path,
    header_encrypted: Option<&[u8]>,
    dek: &[u8; crypto::KEY_LEN],
) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    decrypt_to_writer(enc_path, header_encrypted, dek, &mut out)?;
    Ok(out)
}

/// 파일 목록용 아이템
#[derive(Clone, serde::Serialize)]
pub struct FileItem {
    pub id: String,
    pub original_name: String,
    pub size_bytes: i64,
    pub created_at: i64,
    pub file_kind: thumbnails::FileKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_base64: Option<String>,
}

/// 뷰어용: 파일 전체 복호화 → base64 반환 (이미지 등 소형 파일)
pub fn get_file_data_base64(base: &Path, file_id: &str) -> Result<String, String> {
    let dek = key_cache::get_dek()
        .ok_or("암호화 키가 없습니다. 금고를 잠근 후 비밀번호로 다시 열어주세요.")?;

    let conn = conn(base)?;
    let (hash_name, header_enc): (String, Option<Vec<u8>>) = conn
        .query_row(
            "SELECT hash_name, header_encrypted FROM files WHERE id = ?1",
            [file_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "파일을 찾을 수 없습니다.")?;

    let enc_path = data_dir(base).join(&hash_name);
    if !enc_path.exists() {
        return Err("암호화된 파일이 없습니다.".into());
    }

    let plaintext = decrypt_to_vec(&enc_path, header_enc.as_deref(), &dek)?;
    Ok(BASE64.encode(&plaintext))
}

/// 썸네일 없을 때 on-demand 생성 (기존 업로드 파일용)
pub fn get_or_create_thumbnail(
    base: &Path,
    file_id: &str,
) -> Result<Option<String>, String> {
    use base64::{engine::general_purpose::STANDARD as BASE64, Engine};

    let conn = conn(base)?;

    if let Ok(Some(thumb_blob)) = conn.query_row("SELECT thumbnail_blob FROM files_index WHERE id = ?1", [file_id], |r| r.get::<_, Option<Vec<u8>>>(0)) {
        return Ok(Some(BASE64.encode(&thumb_blob)));
    }

    let dek = key_cache::get_dek()
        .ok_or("암호화 키가 없습니다. 금고를 잠근 후 비밀번호로 다시 열어주세요.")?;

    let (hash_name, original_name_raw, thumb_enc, header_enc): (String, String, Option<Vec<u8>>, Option<Vec<u8>>) = conn
        .query_row(
            "SELECT hash_name, original_name, thumbnail_blob, header_encrypted FROM files WHERE id = ?1",
            [file_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .map_err(|_| "파일을 찾을 수 없습니다.")?;
    let original_name = decrypt_field(&original_name_raw, Some(&dek)).unwrap_or(original_name_raw);

    if let Some(enc) = thumb_enc {
        let dec = crypto::decrypt(&enc, &dek)?;
        return Ok(Some(BASE64.encode(&dec)));
    }

    let enc_path = data_dir(base).join(&hash_name);
    if !enc_path.exists() {
        return Ok(None);
    }

    let plaintext = decrypt_to_vec(&enc_path, header_enc.as_deref(), &dek)?;
    let path = Path::new(&original_name);

    let thumb = make_thumbnail(&plaintext, path).ok().flatten();
    let Some(thumb_data) = thumb else {
        return Ok(None);
    };

    let thumb_encrypted = crypto::encrypt(&thumb_data, &dek)?;
    conn.execute("UPDATE files SET thumbnail_blob = ?1 WHERE id = ?2", rusqlite::params![thumb_encrypted, file_id])
        .map_err(|e| e.to_string())?;
    let _ = conn.execute("UPDATE files_index SET thumbnail_blob = ?1 WHERE id = ?2", rusqlite::params![&thumb_data, file_id]);

    Ok(Some(BASE64.encode(&thumb_data)))
}

/// files에 있으나 index에 없는 레거시 항목 백필 + thumbnail NULL 복구 (앱 시작 시 1회)
pub fn backfill_files_index(base: &Path) -> Result<(), String> {
    let dek = match key_cache::get_dek() {
        Some(d) => d,
        None => return Ok(()),
    };
    let conn = conn(base)?;

    // 1) files_index에 아예 없는 항목 삽입
    let to_backfill: Vec<(String, String, Option<Vec<u8>>, i64, Option<String>, i64)> = conn
        .prepare("SELECT f.id, f.original_name, f.thumbnail_blob, f.created_at, f.created_at_enc, f.size_bytes FROM files f WHERE f.id NOT IN (SELECT id FROM files_index)")
        .map_err(|e| e.to_string())?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for (id, name_raw, thumb_enc, created_at, created_at_enc, size_bytes) in to_backfill {
        let display_name = decrypt_field(&name_raw, Some(&dek)).unwrap_or_else(|_| name_raw.clone());
        let file_kind = thumbnails::file_kind_from_ext(Path::new(&display_name));
        let file_kind_str = match file_kind {
            thumbnails::FileKind::Image => "image",
            thumbnails::FileKind::Video => "video",
            thumbnails::FileKind::Audio => "audio",
            thumbnails::FileKind::Document => "document",
            thumbnails::FileKind::Other => "other",
        };
        let hash_name: String = conn.query_row("SELECT hash_name FROM files WHERE id = ?1", [&id], |r| r.get(0)).map_err(|e| e.to_string())?;
        let folder_id: Option<String> = conn.query_row("SELECT folder_id FROM files WHERE id = ?1", [&id], |r| r.get(0)).ok();
        let thumb_plain = thumb_enc.and_then(|enc| crypto::decrypt(&enc, &dek).ok());
        let _ = conn.execute(
            "INSERT OR IGNORE INTO files_index (id, folder_id, hash_name, display_name, thumbnail_blob, created_at, created_at_enc, file_kind, size_bytes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![id, folder_id, hash_name, display_name, thumb_plain, created_at, created_at_enc, file_kind_str, size_bytes],
        );
    }

    // 2) files_index에 thumbnail_blob이 NULL인데 files에는 있는 경우 복구
    let to_fix: Vec<(String, Vec<u8>)> = conn
        .prepare("SELECT fi.id, f.thumbnail_blob FROM files_index fi JOIN files f ON fi.id = f.id WHERE fi.thumbnail_blob IS NULL AND f.thumbnail_blob IS NOT NULL")
        .map_err(|e| e.to_string())?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for (id, thumb_enc) in to_fix {
        if let Ok(thumb_plain) = crypto::decrypt(&thumb_enc, &dek) {
            let _ = conn.execute(
                "UPDATE files_index SET thumbnail_blob = ?1 WHERE id = ?2",
                rusqlite::params![thumb_plain, id],
            );
        }
    }

    Ok(())
}

/// 파일 목록 개수 (페이징/가상 리스트용)
pub fn list_files_count(base: &Path, folder_id: Option<&str>) -> Result<u64, String> {
    let conn = conn(base)?;
    let total: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM files_index WHERE (folder_id IS ?1 OR (folder_id IS NULL AND ?1 IS NULL))",
            rusqlite::params![folder_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(total.max(0) as u64)
}

/// 파일 목록 한 페이지: (id, created_at_enc)로 정렬 후 [offset..offset+limit]만 풀 row 조회.
pub fn list_files_page(
    base: &Path,
    folder_id: Option<&str>,
    limit: u32,
    offset: u32,
) -> Result<(Vec<FileItem>, u64), String> {
    let dek = key_cache::get_dek()
        .ok_or("암호화 키가 없습니다. 금고를 열어주세요.")?;
    let conn = conn(base)?;
    let total = list_files_count(base, folder_id)?;

    let mut stmt = conn
        .prepare(
            "SELECT id, created_at, created_at_enc FROM files_index WHERE (folder_id IS ?1 OR (folder_id IS NULL AND ?1 IS NULL))",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![folder_id], |r| {
            let id: String = r.get(0)?;
            let created_at_legacy: i64 = r.get::<_, i64>(1).unwrap_or(0);
            let created_at_enc: Option<String> = r.get(2).ok();
            let created_at = created_at_enc
                .as_deref()
                .and_then(|s| decrypt_created_at(s, Some(&dek)).ok())
                .unwrap_or(created_at_legacy);
            Ok((id, created_at))
        })
        .map_err(|e| e.to_string())?;
    let mut order: Vec<(String, i64)> = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    order.sort_by(|a, b| b.1.cmp(&a.1));

    let limit = limit.min(500) as usize;
    let offset = offset as usize;
    let ids: Vec<&str> = order
        .iter()
        .skip(offset)
        .take(limit)
        .map(|(id, _)| id.as_str())
        .collect();
    if ids.is_empty() {
        return Ok((Vec::new(), total));
    }

    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT id, display_name, size_bytes, created_at, created_at_enc, thumbnail_blob, file_kind FROM files_index WHERE id IN ({})",
        placeholders
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let id_to_item: std::collections::HashMap<String, FileItem> = stmt
        .query_map(rusqlite::params_from_iter(ids.iter().copied()), |row| {
            let id: String = row.get(0)?;
            let display_name: String = row.get(1)?;
            let size_bytes: i64 = row.get(2)?;
            let created_at_legacy: i64 = row.get::<_, i64>(3).unwrap_or(0);
            let created_at_enc: Option<String> = row.get(4).ok();
            let thumb_blob: Option<Vec<u8>> = row.get(5)?;
            let file_kind_str: String = row.get(6)?;
            let file_kind = parse_file_kind(&file_kind_str);
            let thumbnail_base64 = thumb_blob.map(|b| BASE64.encode(&b));
            let created_at = created_at_enc
                .as_deref()
                .and_then(|s| decrypt_created_at(s, Some(&dek)).ok())
                .unwrap_or(created_at_legacy);
            Ok((
                id.clone(),
                FileItem {
                    id,
                    original_name: display_name,
                    size_bytes,
                    created_at,
                    file_kind,
                    thumbnail_base64,
                },
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<std::collections::HashMap<_, _>, _>>()
        .map_err(|e| e.to_string())?;
    let items: Vec<FileItem> = ids
        .iter()
        .filter_map(|&id| id_to_item.get(id).cloned())
        .collect();
    Ok((items, total))
}

/// 파일 목록 전체 반환 (limit/offset 없이 한 번에, 기존 호환)
pub fn list_files(base: &Path, folder_id: Option<&str>) -> Result<Vec<FileItem>, String> {
    let (items, _) = list_files_page(base, folder_id, 100_000, 0)?;
    Ok(items)
}

fn parse_file_kind(s: &str) -> thumbnails::FileKind {
    match s {
        "image" => thumbnails::FileKind::Image,
        "video" => thumbnails::FileKind::Video,
        "audio" => thumbnails::FileKind::Audio,
        "document" => thumbnails::FileKind::Document,
        _ => thumbnails::FileKind::Other,
    }
}

/// 파일 출고 (스트리밍 복호화 → 저장 → 금고에서 삭제)
pub fn vault_extract_file(
    base: &Path,
    file_id: &str,
    dest_path: &Path,
) -> Result<(), String> {
    let dek = key_cache::get_dek()
        .ok_or("암호화 키가 없습니다. 금고를 잠근 후 비밀번호로 다시 열어주세요.")?;

    let conn = conn(base)?;
    let (hash_name, _original_name_raw, header_enc): (String, String, Option<Vec<u8>>) = conn
        .query_row(
            "SELECT hash_name, original_name, header_encrypted FROM files WHERE id = ?1",
            [file_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|_| "파일을 찾을 수 없습니다.")?;

    let enc_path = data_dir(base).join(&hash_name);
    if !enc_path.exists() {
        return Err("암호화된 파일이 없습니다.".into());
    }

    let dest = fs::File::create(dest_path).map_err(|e| e.to_string())?;
    let mut writer = BufWriter::new(dest);
    decrypt_to_writer(&enc_path, header_enc.as_deref(), &dek, &mut writer)?;

    fs::remove_file(&enc_path).map_err(|e| {
        format!("암호화 파일 삭제 실패: {}", e)
    })?;

    conn.execute("DELETE FROM files WHERE id = ?1", [file_id])
        .map_err(|e| e.to_string())?;
    let _ = conn.execute("DELETE FROM files_index WHERE id = ?1", [file_id]);

    Ok(())
}

/// 폴더 내보내기 (재귀: 하위 파일+폴더 전부 복호화하여 내보내고 금고에서 삭제)
pub fn vault_extract_folder(
    base: &Path,
    folder_id: &str,
    dest_dir: &Path,
) -> Result<(usize, usize), String> {
    let conn = conn(base)?;

    let folder_name: String = conn
        .query_row(
            "SELECT name FROM folders WHERE id = ?1",
            [folder_id],
            |r| r.get(0),
        )
        .map_err(|_| "폴더를 찾을 수 없습니다.".to_string())?;

    let out_dir = dest_dir.join(&folder_name);
    fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;

    let file_ids: Vec<(String, String)> = {
        let mut stmt = conn
            .prepare("SELECT id, display_name FROM files_index WHERE folder_id = ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([folder_id], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };

    let mut file_count = 0usize;
    for (fid, display_name) in &file_ids {
        let file_dest = out_dir.join(display_name);
        match vault_extract_file(base, fid, &file_dest) {
            Ok(()) => file_count += 1,
            Err(e) => eprintln!("폴더 내보내기 중 파일 실패: {} - {}", display_name, e),
        }
    }

    let child_ids: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT id FROM folders WHERE parent_id = ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map([folder_id], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };

    let mut folder_count = 1usize;
    for child_id in &child_ids {
        let (fc, dc) = vault_extract_folder(base, child_id, &out_dir)?;
        file_count += fc;
        folder_count += dc;
    }

    let _ = conn.execute("DELETE FROM folders WHERE id = ?1", [folder_id]);

    Ok((file_count, folder_count))
}

/// 파일 복사 내보내기 (금고에서 삭제하지 않음)
pub fn vault_copy_out(
    base: &Path,
    file_id: &str,
    dest_path: &Path,
) -> Result<(), String> {
    let dek = key_cache::get_dek()
        .ok_or("암호화 키가 없습니다. 금고를 잠근 후 비밀번호로 다시 열어주세요.")?;

    let conn = conn(base)?;
    let (hash_name, header_enc): (String, Option<Vec<u8>>) = conn
        .query_row(
            "SELECT hash_name, header_encrypted FROM files WHERE id = ?1",
            [file_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "파일을 찾을 수 없습니다.")?;

    let enc_path = data_dir(base).join(&hash_name);
    if !enc_path.exists() {
        return Err("암호화된 파일이 없습니다.".into());
    }

    let dest = fs::File::create(dest_path).map_err(|e| e.to_string())?;
    let mut writer = BufWriter::new(dest);
    decrypt_to_writer(&enc_path, header_enc.as_deref(), &dek, &mut writer)?;

    Ok(())
}

// ===================== 파일 관리 (삭제/이름변경/이동) =====================

/// 파일 영구 삭제 (금고에서 완전히 제거)
pub fn vault_delete_file(base: &Path, file_id: &str) -> Result<(), String> {
    let conn = conn(base)?;
    let hash_name: String = conn
        .query_row(
            "SELECT hash_name FROM files WHERE id = ?1",
            [file_id],
            |r| r.get(0),
        )
        .map_err(|_| "파일을 찾을 수 없습니다.".to_string())?;

    let enc_path = data_dir(base).join(&hash_name);
    if enc_path.exists() {
        secure_delete(&enc_path)?;
    }

    conn.execute("DELETE FROM files WHERE id = ?1", [file_id])
        .map_err(|e| e.to_string())?;
    let _ = conn.execute("DELETE FROM files_index WHERE id = ?1", [file_id]);
    Ok(())
}

/// 파일 이름 변경
pub fn vault_rename_file(base: &Path, file_id: &str, new_name: &str) -> Result<(), String> {
    let name = new_name.trim();
    if name.is_empty() {
        return Err("파일 이름을 입력해주세요.".into());
    }
    let conn = conn(base)?;
    conn.execute(
        "UPDATE files_index SET display_name = ?1 WHERE id = ?2",
        rusqlite::params![name, file_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 파일을 다른 폴더로 이동
pub fn vault_change_folder(base: &Path, file_id: &str, folder_id: Option<&str>) -> Result<(), String> {
    let conn = conn(base)?;
    conn.execute(
        "UPDATE files_index SET folder_id = ?1 WHERE id = ?2",
        rusqlite::params![folder_id, file_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE files SET folder_id = ?1 WHERE id = ?2",
        rusqlite::params![folder_id, file_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ===================== 폴더 업로드 (재귀) =====================

/// 폴더 전체를 금고에 재귀적으로 업로드
pub fn vault_move_folder(
    base: &Path,
    source_path: &Path,
    parent_folder_id: Option<&str>,
) -> Result<(usize, usize), String> {
    if !source_path.exists() {
        return Err("원본 폴더를 찾을 수 없습니다.".into());
    }
    let meta = fs::metadata(source_path).map_err(|e| e.to_string())?;
    if !meta.is_dir() {
        return Err("폴더가 아닙니다.".into());
    }

    let folder_name = source_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("folder")
        .to_string();

    let created = crate::folders::create_folder(base, &folder_name, parent_folder_id)?;
    let new_folder_id = created.id;

    let mut file_count = 0usize;
    let mut folder_count = 1usize;

    let entries: Vec<_> = fs::read_dir(source_path)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .collect();

    for entry in entries {
        let path = entry.path();
        if path.is_dir() {
            let (fc, dc) = vault_move_folder(base, &path, Some(&new_folder_id))?;
            file_count += fc;
            folder_count += dc;
        } else if path.is_file() {
            match vault_move_file(base, &path, Some(&new_folder_id)) {
                Ok(_) => file_count += 1,
                Err(e) => {
                    eprintln!("폴더 업로드 중 파일 실패: {:?} - {}", path, e);
                }
            }
        }
    }

    let _ = fs::remove_dir_all(source_path);

    Ok((file_count, folder_count))
}

// ===================== 압축 해제 (금고 내) =====================

/// 금고에 저장된 ZIP 파일을 금고 내에서 해제
/// RAM 전용: 임시 디스크 사용 없이 메모리에서 ZIP 파싱 후 vault_move_file_from_bytes로 입고
pub fn vault_extract_archive(
    base: &Path,
    file_id: &str,
    target_folder_id: Option<&str>,
) -> Result<(usize, usize), String> {
    let dek = key_cache::get_dek()
        .ok_or("암호화 키가 없습니다. 금고를 잠근 후 비밀번호로 다시 열어주세요.")?;

    let conn = conn(base)?;
    let (hash_name, display_name): (String, String) = conn
        .query_row(
            "SELECT hash_name, display_name FROM files_index WHERE id = ?1",
            [file_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "파일을 찾을 수 없습니다.".to_string())?;

    let enc_path = data_dir(base).join(&hash_name);
    let header_enc: Option<Vec<u8>> = conn
        .query_row(
            "SELECT header_encrypted FROM files WHERE id = ?1",
            [file_id],
            |r| r.get(0),
        )
        .map_err(|_| "파일 메타를 찾을 수 없습니다.".to_string())?;

    let plaintext = decrypt_to_vec(&enc_path, header_enc.as_deref(), &dek)?;
    let cursor = Cursor::new(&plaintext);
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| format!("ZIP 파일을 열 수 없습니다: {}", e))?;

    let archive_stem = Path::new(&display_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("extracted")
        .to_string();

    let root = crate::folders::create_folder(base, &archive_stem, target_folder_id)?;
    let mut path_to_folder: HashMap<String, String> = HashMap::new();
    path_to_folder.insert(String::new(), root.id.clone());

    fn ensure_path(
        base: &Path,
        path: &str,
        root_id: &str,
        map: &mut HashMap<String, String>,
    ) -> Result<String, String> {
        if path.is_empty() {
            return Ok(root_id.to_string());
        }
        if let Some(id) = map.get(path) {
            return Ok(id.clone());
        }
        let parent = Path::new(path)
            .parent()
            .and_then(|p| p.to_str())
            .unwrap_or("");
        let parent_id = ensure_path(base, parent, root_id, map)?;
        let name = Path::new(path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        let folder = crate::folders::create_folder(base, name, Some(&parent_id))?;
        map.insert(path.to_string(), folder.id.clone());
        Ok(folder.id)
    }

    let mut file_count = 0usize;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string().replace('\\', "/");
        let name = name.trim_end_matches('/').to_string();

        if entry.is_dir() {
            let _ = ensure_path(base, &name, &root.id, &mut path_to_folder)?;
        } else {
            let parent_path = Path::new(&name)
                .parent()
                .and_then(|p| p.to_str())
                .unwrap_or("")
                .to_string();
            let file_name = Path::new(&name)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("file")
                .to_string();

            let parent_id = ensure_path(base, &parent_path, &root.id, &mut path_to_folder)?;
            let mut data = Vec::new();
            std::io::copy(&mut entry, &mut data).map_err(|e| e.to_string())?;

            match vault_move_file_from_bytes(base, data, &file_name, Some(&parent_id)) {
                Ok(_) => file_count += 1,
                Err(e) => eprintln!("압축 해제 중 파일 실패: {} - {}", name, e),
            }
        }
    }

    let folder_count = path_to_folder.len();
    Ok((file_count, folder_count.max(1)))
}

// ===================== 스트리밍 프로토콜 헬퍼 =====================

/// 스트리밍용 파일 정보
pub struct StreamFileInfo {
    pub enc_path: std::path::PathBuf,
    pub size_bytes: u64,
    pub mime_type: String,
    pub is_chunked: bool,
    pub chunk_size: u32,
}

/// file_id → 스트리밍에 필요한 정보 조회
pub fn get_stream_info(base: &Path, file_id: &str) -> Result<StreamFileInfo, String> {
    let conn = conn(base)?;
    let (hash_name, size_bytes): (String, i64) = conn
        .query_row(
            "SELECT hash_name, size_bytes FROM files_index WHERE id = ?1",
            [file_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "파일을 찾을 수 없습니다.")?;
    let display_name: String = conn
        .query_row(
            "SELECT display_name FROM files_index WHERE id = ?1",
            [file_id],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "file".into());

    let mime_type: String = conn
        .query_row("SELECT mime_type FROM files WHERE id = ?1", [file_id], |r| r.get(0))
        .ok()
        .and_then(|s: String| {
            if s.starts_with(ENC_PREFIX) {
                key_cache::get_dek().and_then(|dek| decrypt_field(&s, Some(&dek)).ok())
            } else {
                Some(s)
            }
        })
        .unwrap_or_else(|| mime_from_name(&display_name));

    let enc_path = data_dir(base).join(&hash_name);
    if !enc_path.exists() {
        return Err("암호화된 파일이 없습니다.".into());
    }

    let mut file = fs::File::open(&enc_path).map_err(|e| e.to_string())?;
    let mut magic = [0u8; 2];
    file.read_exact(&mut magic).map_err(|e| e.to_string())?;

    let (is_chunked, chunk_size) = if crypto::is_chunked(&magic) {
        file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
        let mut hdr = [0u8; crypto::FILE_HEADER_SIZE];
        file.read_exact(&mut hdr).map_err(|e| e.to_string())?;
        let h = crypto::parse_chunked_header(&hdr)?;
        (true, h.chunk_size)
    } else {
        (false, 0)
    };

    Ok(StreamFileInfo {
        enc_path,
        size_bytes: size_bytes as u64,
        mime_type,
        is_chunked,
        chunk_size,
    })
}

/// 청크 파일에서 Range [start, end] (inclusive) 복호화.
/// header_encrypted가 있으면 논리 파일 = (DB 헤더) + (청크 본문, 앞 header_len 스킵).
pub fn decrypt_range(
    enc_path: &Path,
    dek: &[u8; crypto::KEY_LEN],
    chunk_size: u32,
    header_encrypted: Option<&[u8]>,
    start: u64,
    end: u64,
) -> Result<Vec<u8>, String> {
    let Some(blob) = header_encrypted else {
        return decrypt_range_body_only(enc_path, dek, chunk_size, start, end);
    };
    let (header_len_u16, enc_header) = parse_header_encrypted(blob)?;
    let header_len = header_len_u16 as usize;
    let header_plain = crypto::decrypt(enc_header, dek)?;
    let header_len_u = header_len as u64;

    if end < header_len_u {
        let e = (end as usize + 1).min(header_plain.len());
        let s = start as usize;
        return Ok(header_plain[s..e].to_vec());
    }
    // 본문 구간: 물리 스트림 = [더미 header_len][본문] 이므로 본문 byte 0 = 물리 byte header_len
    if start >= header_len_u {
        let body_start = start - header_len_u;
        let body_end = end - header_len_u;
        return decrypt_range_body_only(
            enc_path,
            dek,
            chunk_size,
            header_len_u + body_start,
            header_len_u + body_end,
        );
    }
    let mut result = header_plain[start as usize..].to_vec();
    let body_end = end - header_len_u;
    let body_bytes = decrypt_range_body_only(
        enc_path,
        dek,
        chunk_size,
        header_len_u,
        header_len_u + body_end,
    )?;
    result.extend_from_slice(&body_bytes);
    Ok(result)
}

/// 청크 평문 스트림 기준 [start, end] (inclusive) 복호화. start/end = 청크 복호화 스트림의 바이트 오프셋.
fn decrypt_range_body_only(
    enc_path: &Path,
    dek: &[u8; crypto::KEY_LEN],
    chunk_size: u32,
    start: u64,
    end: u64,
) -> Result<Vec<u8>, String> {
    let mut file = fs::File::open(enc_path).map_err(|e| e.to_string())?;
    let (first, offset_in_first) = crypto::byte_to_chunk(start, chunk_size);
    let (last, offset_in_last) = crypto::byte_to_chunk(end, chunk_size);

    let mut result = Vec::with_capacity((end - start + 1) as usize);
    for i in first..=last {
        let plain = crypto::decrypt_chunk_at(&mut file, dek, i, chunk_size)?;
        let slice_start = if i == first {
            offset_in_first
        } else {
            0
        };
        let slice_end = if i == last {
            (offset_in_last + 1).min(plain.len())
        } else {
            plain.len()
        };
        result.extend_from_slice(&plain[slice_start..slice_end]);
    }
    Ok(result)
}

/// 레거시(비청크) 파일 전체 복호화 후 Range 슬라이스
pub fn decrypt_range_legacy(
    enc_path: &Path,
    header_encrypted: Option<&[u8]>,
    dek: &[u8; crypto::KEY_LEN],
    start: u64,
    end: u64,
) -> Result<Vec<u8>, String> {
    let plaintext = decrypt_to_vec(enc_path, header_encrypted, dek)?;
    let s = start as usize;
    let e = (end as usize + 1).min(plaintext.len());
    if s >= plaintext.len() {
        return Ok(Vec::new());
    }
    Ok(plaintext[s..e].to_vec())
}

fn mime_from_name(name: &str) -> String {
    let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        "mov" => "video/quicktime",
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "wav" => "audio/wav",
        "ogg" | "oga" => "audio/ogg",
        "m4a" | "aac" => "audio/mp4",
        "wma" => "audio/x-ms-wma",
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
    .to_string()
}
