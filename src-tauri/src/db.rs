// ============================================
// db.rs - SQLite DB 초기화 및 스키마
// vault_init 시 vault.db 생성, 파일 목록 인덱싱용
// ============================================

use rusqlite::Connection;
use std::path::Path;

const DB_FILE: &str = "vault.db";

/// 금고 폴더 기준 vault.db 경로
pub fn db_path(base: &Path) -> std::path::PathBuf {
    base.join(DB_FILE)
}

fn conn(base: &Path) -> Result<Connection, String> {
    Connection::open(db_path(base)).map_err(|e| e.to_string())
}

/// DB 초기화: 테이블 생성 (vault_init에서 한 번만 호출)
pub fn init(base: &Path) -> Result<(), String> {
    let conn = conn(base)?;

    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            parent_id TEXT,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);

        CREATE TABLE IF NOT EXISTS files (
            id TEXT PRIMARY KEY,
            folder_id TEXT,
            original_name TEXT NOT NULL,
            original_path TEXT,
            hash_name TEXT NOT NULL,
            mime_type TEXT,
            size_bytes INTEGER NOT NULL,
            thumbnail_blob BLOB,
            header_encrypted BLOB,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_files_mime_type ON files(mime_type);
        CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id);

        CREATE TABLE IF NOT EXISTS vault_config (
            key TEXT PRIMARY KEY,
            value TEXT
        );
        INSERT OR IGNORE INTO vault_config (key, value) VALUES ('storage_limit', '5368709120');
        "#,
    )
    .map_err(|e| e.to_string())?;

    migrate_add_folder_id(base)?;

    Ok(())
}

/// 스키마 최신화 (list_folders 등 호출 전에 사용)
pub fn ensure_schema(base: &Path) -> Result<(), String> {
    let path = db_path(base);
    if !path.exists() {
        return Ok(());
    }
    let conn = conn(base)?;
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            parent_id TEXT,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
        "#,
    )
    .map_err(|e| e.to_string())?;
    migrate_add_folder_id(base)
}

/// 기존 DB에 folder_id 컬럼 추가 (마이그레이션)
fn migrate_add_folder_id(base: &Path) -> Result<(), String> {
    let conn = conn(base)?;
    let has_col: bool = conn
        .query_row(
            "SELECT COUNT(1) FROM pragma_table_info('files') WHERE name='folder_id'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !has_col {
        conn.execute("ALTER TABLE files ADD COLUMN folder_id TEXT", [])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
