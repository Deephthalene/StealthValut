// ============================================
// vault_files.rs - 파일 입고/출고 (이동 + 암호화/복호화)
// 입고: 원본 삭제 | 출고: 금고에서 삭제
// ============================================

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use crate::crypto;
use crate::key_cache;
use crate::thumbnails;
use rusqlite::Connection;
use std::fs;
use std::io::{BufReader, BufWriter, Read, Seek, SeekFrom, Write};
use std::path::Path;

const DATA_DIR: &str = "data";
/// 썸네일 생성용 최대 읽기 크기 (대형 파일은 앞부분만 읽어서 시도)
const THUMB_MAX_READ: u64 = 100 * 1024 * 1024;

/// 금고 data 폴더 경로
fn data_dir(base: &Path) -> std::path::PathBuf {
    base.join(DATA_DIR)
}

fn conn(base: &Path) -> Result<Connection, String> {
    crate::db::ensure_schema(base)?;
    let c = Connection::open(crate::db::db_path(base)).map_err(|e| e.to_string())?;
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
    let original_name = source_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();
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
            let cross_dev = cfg!(unix) && e.raw_os_error() == Some(18); // EXDEV
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

        // 썸네일: 소형 파일은 전체, 대형 파일은 앞부분만 읽어서 시도
        let thumbnail_plain = {
            let file_len = fs::metadata(&temp_path).map_err(|e| e.to_string())?.len();
            let read_len = file_len.min(THUMB_MAX_READ) as usize;
            let mut f = fs::File::open(&temp_path).map_err(|e| e.to_string())?;
            let mut buf = vec![0u8; read_len];
            f.read_exact(&mut buf).map_err(|e| e.to_string())?;
            if file_len <= THUMB_MAX_READ {
                make_thumbnail(&buf, Path::new(&original_name))?
            } else {
                make_thumbnail(&buf, Path::new(&original_name)).unwrap_or(None)
            }
        };

        // 청크 스트리밍 암호화 (메모리 = 1MB)
        let hash_name = format!("{}.dat", id);
        let dest_file = data_path.join(&hash_name);
        {
            let src = fs::File::open(&temp_path).map_err(|e| e.to_string())?;
            let dst = fs::File::create(&dest_file).map_err(|e| e.to_string())?;
            let mut reader = BufReader::new(src);
            let mut writer = BufWriter::new(dst);
            crypto::encrypt_file_chunked(&mut reader, &mut writer, &dek, crypto::CHUNK_SIZE)?;
        }

        secure_delete(&temp_path).map_err(|e| {
            fs::remove_file(&dest_file).ok();
            format!("임시 파일 삭제 실패: {}. 암호화된 파일은 저장되었습니다.", e)
        })?;

        let original_name_enc = encrypt_field(&original_name, &dek)?;
        let original_path_enc = encrypt_field(&original_path_str, &dek)?;

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
                "INSERT INTO files (id, folder_id, original_name, original_path, hash_name, mime_type, size_bytes, thumbnail_blob, header_encrypted, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                rusqlite::params![
                    id,
                    folder_id,
                    original_name_enc,
                    original_path_enc,
                    hash_name,
                    None::<String>,
                    size_bytes,
                    thumbnail_encrypted,
                    None::<Vec<u8>>,
                    created_at,
                ],
            )
            .map_err(|e| e.to_string())?;

            conn.execute(
                "INSERT INTO files_index (id, folder_id, hash_name, display_name, thumbnail_blob, created_at, file_kind, size_bytes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![
                    id,
                    folder_id,
                    hash_name,
                    original_name,
                    thumbnail_plain,
                    created_at,
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
        let mut reader = BufReader::new(file);
        crypto::decrypt_file_chunked(&mut reader, writer, dek)
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
#[derive(serde::Serialize)]
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
    let to_backfill: Vec<(String, String, Option<Vec<u8>>, i64, i64)> = conn
        .prepare("SELECT f.id, f.original_name, f.thumbnail_blob, f.created_at, f.size_bytes FROM files f WHERE f.id NOT IN (SELECT id FROM files_index)")
        .map_err(|e| e.to_string())?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    for (id, name_raw, thumb_enc, created_at, size_bytes) in to_backfill {
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
            "INSERT OR IGNORE INTO files_index (id, folder_id, hash_name, display_name, thumbnail_blob, created_at, file_kind, size_bytes) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![id, folder_id, hash_name, display_name, thumb_plain, created_at, file_kind_str, size_bytes],
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

/// 파일 목록: index 테이블만 읽음 (복호화 없음)
pub fn list_files(base: &Path, folder_id: Option<&str>) -> Result<Vec<FileItem>, String> {
    let conn = conn(base)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, display_name, size_bytes, created_at, thumbnail_blob, file_kind FROM files_index WHERE (folder_id IS ?1 OR (folder_id IS NULL AND ?1 IS NULL)) ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![folder_id], |r| {
            let id: String = r.get(0)?;
            let display_name: String = r.get(1)?;
            let size_bytes: i64 = r.get(2)?;
            let created_at: i64 = r.get(3)?;
            let thumb_blob: Option<Vec<u8>> = r.get(4)?;
            let file_kind_str: String = r.get(5)?;
            let file_kind = parse_file_kind(&file_kind_str);
            let thumbnail_base64 = thumb_blob.map(|b| BASE64.encode(&b));
            Ok(FileItem {
                id,
                original_name: display_name,
                size_bytes,
                created_at,
                file_kind,
                thumbnail_base64,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
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

/// 드래그아웃용: 임시 경로에 스트리밍 복호화 후 경로 반환
pub fn vault_prepare_drag_out(base: &Path, file_id: &str) -> Result<String, String> {
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
    let display_name: String = conn
        .query_row("SELECT display_name FROM files_index WHERE id = ?1", [file_id], |r| r.get(0))
        .unwrap_or_else(|_| "file".to_string());

    let enc_path = data_dir(base).join(&hash_name);
    if !enc_path.exists() {
        return Err("암호화된 파일이 없습니다.".into());
    }

    let temp_dir = std::env::temp_dir().join("stealthvault_drag");
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    let safe_name = Path::new(&display_name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file");
    let temp_path = temp_dir.join(format!("{}_{}", file_id, safe_name));

    let dest = fs::File::create(&temp_path).map_err(|e| e.to_string())?;
    let mut writer = BufWriter::new(dest);
    decrypt_to_writer(&enc_path, header_enc.as_deref(), &dek, &mut writer)?;

    Ok(temp_path.to_string_lossy().to_string())
}

/// 드래그 완료 후 금고에서 삭제 (vault_prepare_drag_out 후 startDrag 끝난 시점에 호출)
pub fn vault_confirm_drag_out(base: &Path, file_id: &str) -> Result<(), String> {
    let conn = conn(base)?;
    let hash_name: String = conn
        .query_row("SELECT hash_name FROM files WHERE id = ?1", [file_id], |r| r.get(0))
        .map_err(|_| "파일을 찾을 수 없습니다.")?;

    let enc_path = data_dir(base).join(&hash_name);
    if enc_path.exists() {
        fs::remove_file(&enc_path).map_err(|e| e.to_string())?;
    }

    conn.execute("DELETE FROM files WHERE id = ?1", [file_id])
        .map_err(|e| e.to_string())?;
    let _ = conn.execute("DELETE FROM files_index WHERE id = ?1", [file_id]);

    let temp_dir = std::env::temp_dir().join("stealthvault_drag");
    if let Ok(entries) = fs::read_dir(&temp_dir) {
        for e in entries.flatten() {
            let p = e.path();
            if p.file_stem()
                .and_then(|s| s.to_str())
                .map_or(false, |s| s.starts_with(file_id))
            {
                let _ = fs::remove_file(&p);
            }
        }
    }

    Ok(())
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

    let mime_type = mime_from_name(&display_name);

    Ok(StreamFileInfo {
        enc_path,
        size_bytes: size_bytes as u64,
        mime_type,
        is_chunked,
        chunk_size,
    })
}

/// 청크 파일에서 Range [start, end] (inclusive) 복호화
pub fn decrypt_range(
    enc_path: &Path,
    dek: &[u8; crypto::KEY_LEN],
    chunk_size: u32,
    start: u64,
    end: u64,
) -> Result<Vec<u8>, String> {
    let mut file = fs::File::open(enc_path).map_err(|e| e.to_string())?;
    let cs = chunk_size as u64;
    let first = start / cs;
    let last = end / cs;

    let mut result = Vec::with_capacity((end - start + 1) as usize);
    for i in first..=last {
        let plain = crypto::decrypt_chunk_at(&mut file, dek, i, chunk_size)?;
        let chunk_offset = i * cs;
        let slice_start = if i == first {
            (start - chunk_offset) as usize
        } else {
            0
        };
        let slice_end = if i == last {
            ((end - chunk_offset) as usize + 1).min(plain.len())
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
