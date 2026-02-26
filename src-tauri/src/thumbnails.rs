// ============================================
// thumbnails.rs - 파일별 썸네일/아이콘 생성
// 이미지: 리사이즈 | 음악: 앨범커버 | 영상: ffmpeg 첫 프레임
// Phase 7: 썸네일 캐시 방어 - 임시 파일 zero-fill 후 삭제, Windows TEMPORARY 플래그
// ============================================

use std::fs;
use std::io::{Cursor, Seek, SeekFrom, Write};
use std::path::Path;
use std::process::Command;

#[cfg(windows)]
use std::os::windows::fs::OpenOptionsExt;

const THUMB_SIZE: u32 = 128;
const ZERO_CHUNK: usize = 64 * 1024; // 64KB

/// 포렌식 방지: 임시 파일을 0으로 덮어쓴 후 삭제 (썸네일 캐시 DB 유출 완화)
fn secure_remove(path: &Path) {
    if !path.exists() {
        return;
    }
    let meta = match fs::metadata(path) {
        Ok(m) => m,
        Err(_) => {
            let _ = fs::remove_file(path);
            return;
        }
    };
    let size = meta.len();
    if let Ok(mut f) = fs::OpenOptions::new().write(true).open(path) {
        let zeros = [0u8; ZERO_CHUNK];
        let mut written = 0u64;
        while written < size {
            let to_write = ((size - written) as usize).min(ZERO_CHUNK);
            let _ = f.write_all(&zeros[..to_write]);
            written += to_write as u64;
        }
        let _ = f.sync_all();
    }
    let _ = fs::remove_file(path);
}

fn temp_base() -> std::path::PathBuf {
    std::env::temp_dir().join("StealthVault")
}

/// 파일 타입 (프론트에서 아이콘 선택용)
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FileKind {
    Image,
    Video,
    Audio,
    Document,
    Other,
}

pub fn file_kind_from_ext(path: &Path) -> FileKind {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "ico" | "tiff" | "tif" => FileKind::Image,
        "mp4" | "avi" | "mkv" | "mov" | "webm" | "wmv" | "flv" | "m4v" => FileKind::Video,
        "mp3" | "wav" | "flac" | "ogg" | "m4a" | "aac" | "wma" => FileKind::Audio,
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "csv" | "ppt" | "pptx" | "txt" | "md" | "json" | "xml" | "html" | "htm" | "hwp" | "hwpx" | "rtf" | "log" => FileKind::Document,
        _ => FileKind::Other,
    }
}

/// 이미지 파일에서 썸네일 생성 (평문 바이트 → 리사이즈 → JPEG)
pub fn make_image_thumbnail(data: &[u8]) -> Result<Vec<u8>, String> {
    if data.is_empty() {
        return Err("빈 데이터".into());
    }
    let img = image::load_from_memory(data)
        .or_else(|_| make_image_thumbnail_from_tempfile(data))
        .map_err(|e| e.to_string())?;
    make_thumb_from_image(&img)
}

/// 임시 파일 경유 로드 (메모리 로드 실패 시 폴백) - 확장자 무관, 매직 바이트로 포맷 추측.
/// Phase 7: Windows에서 FILE_FLAG_DELETE_ON_CLOSE | FILE_ATTRIBUTE_TEMPORARY 사용 → thumbcache 유출 완화
fn make_image_thumbnail_from_tempfile(data: &[u8]) -> Result<image::DynamicImage, image::ImageError> {
    let base = temp_base();
    let _ = fs::create_dir_all(&base);
    let temp = base.join(format!("thumb_{}.tmp", uuid::Uuid::new_v4()));

    let mut opts = fs::OpenOptions::new();
    opts.read(true).write(true).create(true).truncate(true);
    #[cfg(windows)]
    opts.custom_flags(0x04000102); // FILE_FLAG_DELETE_ON_CLOSE | FILE_ATTRIBUTE_TEMPORARY | FILE_ATTRIBUTE_HIDDEN

    let mut file = opts.open(&temp).map_err(image::ImageError::IoError)?;
    file.write_all(data).map_err(image::ImageError::IoError)?;
    file.flush().map_err(image::ImageError::IoError)?;
    file.seek(SeekFrom::Start(0)).map_err(image::ImageError::IoError)?;

    let reader = image::ImageReader::new(std::io::BufReader::new(file)).with_guessed_format()?;
    let img = reader.decode()?;
    // Windows: handle drop → DELETE_ON_CLOSE로 자동 삭제
    #[cfg(not(windows))]
    {
        let _ = fs::remove_file(&temp);
    }
    Ok(img)
}

/// 확장자로 포맷 지정 후 디코딩 (실패 시 일반 로드 폴백)
pub fn make_image_thumbnail_with_format(data: &[u8], ext: &str) -> Result<Vec<u8>, String> {
    use image::ImageFormat;
    let fmt = match ext.to_lowercase().as_str() {
        "jpg" | "jpeg" => ImageFormat::Jpeg,
        "png" => ImageFormat::Png,
        "gif" => ImageFormat::Gif,
        "webp" => ImageFormat::WebP,
        "bmp" => ImageFormat::Bmp,
        "tiff" | "tif" => ImageFormat::Tiff,
        "ico" => ImageFormat::Ico,
        _ => return make_image_thumbnail(data),
    };
    image::load_from_memory_with_format(data, fmt)
        .map_err(|e| format!("포맷: {}", e))
        .or_else(|_| image::load_from_memory(data).map_err(|e| format!("메모리: {}", e)))
        .or_else(|_| make_image_thumbnail_from_tempfile(data).map_err(|e| e.to_string()))
        .and_then(|img| make_thumb_from_image(&img))
}

fn make_thumb_from_image(img: &image::DynamicImage) -> Result<Vec<u8>, String> {
    let thumb = image::imageops::thumbnail(img, THUMB_SIZE, THUMB_SIZE);
    let rgb = image::DynamicImage::ImageRgba8(thumb).to_rgb8();
    let mut out = Vec::new();
    image::DynamicImage::ImageRgb8(rgb)
        .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Jpeg)
        .map_err(|e| format!("인코딩: {}", e))?;
    Ok(out)
}

/// 영상 첫 프레임 추출 (ffmpeg 필수, PATH에 있어야 함)
/// Phase 7: 임시 파일 secure_remove로 zero-fill 후 삭제
pub fn extract_video_frame(data: &[u8], ext: &str) -> Result<Option<Vec<u8>>, String> {
    let ext = if ext.is_empty() { "mp4" } else { ext };
    let _ = fs::create_dir_all(temp_base());
    let temp_in = temp_base().join(format!("vid_{}.{}", uuid::Uuid::new_v4(), ext));
    let temp_out = temp_base().join(format!("vid_thumb_{}.jpg", uuid::Uuid::new_v4()));
    fs::write(&temp_in, data).map_err(|e| e.to_string())?;
    let status = Command::new("ffmpeg")
        .args([
            "-y", "-i", temp_in.to_str().unwrap_or(""),
            "-vframes", "1", "-f", "image2",
            temp_out.to_str().unwrap_or(""),
        ])
        .output()
        .map_err(|e| e.to_string())?;
    secure_remove(&temp_in);
    if !status.status.success() {
        secure_remove(&temp_out);
        return Ok(None);
    }
    let out = fs::read(&temp_out).map_err(|e| e.to_string())?;
    secure_remove(&temp_out);
    Ok(Some(out))
}

/// 음악 파일에서 앨범커버 추출 (lofty는 Path+확장자 필요 → 임시 파일 사용)
/// Phase 7: 임시 파일 secure_remove로 zero-fill 후 삭제
pub fn extract_audio_cover(data: &[u8], ext: &str) -> Result<Option<Vec<u8>>, String> {
    use lofty::file::TaggedFileExt;
    use lofty::picture::PictureType;

    let ext = if ext.is_empty() { "bin" } else { ext };
    let _ = fs::create_dir_all(temp_base());
    let temp_path = temp_base().join(format!("audio_{}.{}", uuid::Uuid::new_v4(), ext));
    fs::write(&temp_path, data).map_err(|e| e.to_string())?;
    let tagged = lofty::read_from_path(&temp_path).map_err(|e| e.to_string())?;
    secure_remove(&temp_path);

    if let Some(tag) = tagged.primary_tag() {
        for pic in tag.pictures() {
            if pic.pic_type() == PictureType::CoverFront {
                let img_data = pic.data();
                return Ok(Some(img_data.to_vec()));
            }
        }
        if let Some(pic) = tag.pictures().first() {
            return Ok(Some(pic.data().to_vec()));
        }
    }
    Ok(None)
}
