// ============================================
// thumbnails.rs - 파일별 썸네일/아이콘 생성
// 이미지: 리사이즈 | 음악: 앨범커버 | 영상: ffmpeg 첫 프레임
// ============================================

use std::io::Cursor;
use std::path::Path;
use std::process::Command;

const THUMB_SIZE: u32 = 128;

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
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "md" => FileKind::Document,
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

/// 임시 파일 경유 로드 (메모리 로드 실패 시 폴백) - 확장자 무관, 매직 바이트로 포맷 추측. 파일명 UUID로 동시 업로드 충돌 방지.
fn make_image_thumbnail_from_tempfile(data: &[u8]) -> Result<image::DynamicImage, image::ImageError> {
    let temp = std::env::temp_dir().join(format!("stealthvault_thumb_{}.tmp", uuid::Uuid::new_v4()));
    std::fs::write(&temp, data).map_err(image::ImageError::IoError)?;
    let file = std::fs::File::open(&temp)?;
    let reader = image::ImageReader::new(std::io::BufReader::new(file)).with_guessed_format()?;
    let img = reader.decode()?;
    let _ = std::fs::remove_file(&temp);
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
pub fn extract_video_frame(data: &[u8], ext: &str) -> Result<Option<Vec<u8>>, String> {
    let ext = if ext.is_empty() { "mp4" } else { ext };
    let temp_in = std::env::temp_dir().join(format!("stealthvault_vid.{}", ext));
    let temp_out = std::env::temp_dir().join("stealthvault_vid_thumb.jpg");
    std::fs::write(&temp_in, data).map_err(|e| e.to_string())?;
    let status = Command::new("ffmpeg")
        .args([
            "-y", "-i", temp_in.to_str().unwrap_or(""),
            "-vframes", "1", "-f", "image2",
            temp_out.to_str().unwrap_or(""),
        ])
        .output()
        .map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&temp_in);
    if !status.status.success() {
        let _ = std::fs::remove_file(&temp_out);
        return Ok(None);
    }
    let out = std::fs::read(&temp_out).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&temp_out);
    Ok(Some(out))
}

/// 음악 파일에서 앨범커버 추출 (lofty는 Path+확장자 필요 → 임시 파일 사용)
pub fn extract_audio_cover(data: &[u8], ext: &str) -> Result<Option<Vec<u8>>, String> {
    use lofty::file::TaggedFileExt;
    use lofty::picture::PictureType;
    use std::fs;

    let ext = if ext.is_empty() { "bin" } else { ext };
    let temp_path = std::env::temp_dir().join(format!("stealthvault_audio.{}", ext));
    fs::write(&temp_path, data).map_err(|e| e.to_string())?;
    let tagged = lofty::read_from_path(&temp_path).map_err(|e| e.to_string())?;
    let _ = fs::remove_file(&temp_path);

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
