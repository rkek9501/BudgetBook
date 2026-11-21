use rusqlite::{Connection, config::DbConfig};
use std::path::Path;
use tempfile::TempDir;

/// Opens a fresh migrated DB in a temp dir. Keep the `TempDir` alive while using the connection.
pub fn test_db() -> (TempDir, Connection) {
    let dir = tempfile::tempdir().expect("tempdir");
    let conn = super::open(&dir.path().join("test.db")).expect("open test db");
    (dir, conn)
}

/// 5000행을 쓰고 체크포인트한 뒤 데이터 페이지 하나를 망가뜨린 DB를 만든다.
pub fn make_corrupt_page_db(path: &Path) {
    {
        let c = Connection::open(path).unwrap();
        c.query_row("PRAGMA journal_mode = WAL", [], |r| r.get::<_, String>(0))
            .unwrap();
        c.execute_batch(
            "CREATE TABLE categories(id INTEGER PRIMARY KEY, name TEXT);
             CREATE TABLE expenses(id TEXT PRIMARY KEY, date TEXT, description TEXT, amount INTEGER, category_id INTEGER);",
        )
        .unwrap();
        c.pragma_update(None, "user_version", 1).unwrap();
        let tx = c.unchecked_transaction().unwrap();
        for i in 0..5000 {
            tx.execute(
                "INSERT INTO expenses VALUES (?1, '2026-11-01', 'some description text here', 1000, 1)",
                [format!("id-{i:06}-xxxxxxxxxxxxxxxxxxxxxxxx")],
            )
            .unwrap();
        }
        tx.commit().unwrap();
        c.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);").unwrap();
    }
    let mut bytes = std::fs::read(path).unwrap();
    let target = 4096 * 40;
    for b in &mut bytes[target..target + 4096] {
        *b = 0xAB;
    }
    std::fs::write(path, &bytes).unwrap();
}

/// WAL 모드 DB를 만들고 `sql`을 실행한 뒤, 체크포인트 없이 닫아 커밋된 프레임이 든 -wal을 남긴다.
pub fn leftover_wal_with(path: &Path, sql: &str) {
    let c = Connection::open(path).unwrap();
    c.set_db_config(DbConfig::SQLITE_DBCONFIG_NO_CKPT_ON_CLOSE, true)
        .unwrap();
    c.query_row("PRAGMA journal_mode = WAL", [], |r| r.get::<_, String>(0))
        .unwrap();
    c.execute_batch("CREATE TABLE t(x); INSERT INTO t VALUES (1);")
        .unwrap();
    c.execute_batch(sql).unwrap();
}
