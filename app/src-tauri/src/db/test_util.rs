use rusqlite::Connection;
use tempfile::TempDir;

/// Opens a fresh migrated DB in a temp dir. Keep the `TempDir` alive while using the connection.
pub fn test_db() -> (TempDir, Connection) {
    let dir = tempfile::tempdir().expect("tempdir");
    let conn = super::open(&dir.path().join("test.db")).expect("open test db");
    (dir, conn)
}
