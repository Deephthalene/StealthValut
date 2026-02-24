// ============================================
// folders.rs - 폴더 CRUD (트리 구조)
// ============================================

use rusqlite::Connection;
use std::path::Path;

#[derive(serde::Serialize)]
pub struct FolderItem {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub created_at: i64,
}

fn conn(base: &Path) -> Result<Connection, String> {
    crate::db::ensure_schema(base)?;
    Connection::open(crate::db::db_path(base)).map_err(|e| e.to_string())
}

/// 자식 폴더 목록 조회 (parent_id가 None이면 루트)
pub fn list_folders(base: &Path, parent_id: Option<&str>) -> Result<Vec<FolderItem>, String> {
    let conn = conn(base)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, parent_id, created_at FROM folders WHERE (?1 IS NULL AND parent_id IS NULL) OR parent_id = ?1 ORDER BY name",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([parent_id], |row| {
            Ok(FolderItem {
                id: row.get(0)?,
                name: row.get(1)?,
                parent_id: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let items: Vec<FolderItem> = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(items)
}

/// 전체 폴더 트리 (재귀)
pub fn list_all_folders(base: &Path) -> Result<Vec<FolderItem>, String> {
    let conn = conn(base)?;
    let mut stmt = conn
        .prepare("SELECT id, name, parent_id, created_at FROM folders ORDER BY COALESCE(parent_id,''), name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(FolderItem {
                id: row.get(0)?,
                name: row.get(1)?,
                parent_id: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let items: Vec<FolderItem> = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(items)
}

/// 폴더 생성
pub fn create_folder(
    base: &Path,
    name: &str,
    parent_id: Option<&str>,
) -> Result<FolderItem, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs() as i64;

    let conn = conn(base)?;
    conn.execute(
        "INSERT INTO folders (id, name, parent_id, created_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, name.trim(), parent_id, created_at],
    )
    .map_err(|e| e.to_string())?;

    Ok(FolderItem {
        id: id.clone(),
        name: name.trim().to_string(),
        parent_id: parent_id.map(String::from),
        created_at,
    })
}

/// 폴더 이름 변경
pub fn rename_folder(base: &Path, id: &str, new_name: &str) -> Result<(), String> {
    let conn = conn(base)?;
    let n = conn
        .execute(
            "UPDATE folders SET name = ?1 WHERE id = ?2",
            rusqlite::params![new_name.trim(), id],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("폴더를 찾을 수 없습니다.".into());
    }
    Ok(())
}

/// 폴더 삭제 (하위 폴더·파일 포함)
pub fn delete_folder(base: &Path, id: &str) -> Result<(), String> {
    delete_folder_recursive(base, id)
}

fn delete_folder_recursive(base: &Path, id: &str) -> Result<(), String> {
    let conn = conn(base)?;
    let children: Vec<String> = conn
        .prepare("SELECT id FROM folders WHERE parent_id = ?1")
        .map_err(|e| e.to_string())?
        .query_map([id], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    for c in children {
        delete_folder_recursive(base, &c)?;
    }

    conn.execute("UPDATE files SET folder_id = NULL WHERE folder_id = ?1", [id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM folders WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    Ok(())
}
