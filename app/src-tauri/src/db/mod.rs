use std::path::Path;

use rusqlite::config::DbConfig;
use rusqlite::{Connection, OpenFlags};

use crate::error::{AppError, AppResult};

#[cfg(test)]
pub mod test_util;

const MIGRATION_0001: &str = include_str!("migrations/0001_init.sql");
pub(crate) const LATEST_VERSION: i64 = 1;

fn unavailable(e: impl std::fmt::Display) -> AppError {
    AppError::DbUnavailable(e.to_string())
}

/// Opens (or creates, only if absent) the database. Never deletes, renames or
/// overwrites an existing file; any failure is reported as `db_unavailable`.
/// 기존 파일은 받아들이기 전(스키마 버전·손상 검사)에는 아무것도 쓰지 않는다.
/// 거부할 때 연결을 닫으며 남은 -wal이 본 파일에 합쳐지지 않도록, 기존 파일은
/// 받아들이기 전까지 NO_CKPT_ON_CLOSE를 켠다. (읽으려면 SQLite가 -shm을 만들거나
/// wal-index를 복구할 수 있다. 이것은 허용한다.)
pub fn open(path: &Path) -> AppResult<Connection> {
    // 메타데이터 오류는 "있음"으로 보고 검사한다(새 파일로 착각해 검사를 건너뛰지 않는다).
    let existed = path.try_exists().unwrap_or(true);
    let mut flags = OpenFlags::SQLITE_OPEN_READ_WRITE
        | OpenFlags::SQLITE_OPEN_URI
        | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    if !existed {
        flags |= OpenFlags::SQLITE_OPEN_CREATE;
    }
    let mut conn = Connection::open_with_flags(path, flags).map_err(unavailable)?;
    if existed {
        conn.set_db_config(DbConfig::SQLITE_DBCONFIG_NO_CKPT_ON_CLOSE, true)
            .map_err(unavailable)?;
    }
    accept(&mut conn, existed)?;
    if existed {
        // 받아들인 연결은 닫을 때 정상적으로 체크포인트한다(복원이 -wal을 지우기 전에 필요).
        conn.set_db_config(DbConfig::SQLITE_DBCONFIG_NO_CKPT_ON_CLOSE, false)
            .map_err(unavailable)?;
    }
    Ok(conn)
}

fn accept(conn: &mut Connection, existed: bool) -> AppResult<()> {
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(unavailable)?;
    if existed {
        check_existing(conn)?;
    }
    let mode: String = conn
        .query_row("PRAGMA journal_mode = WAL", [], |r| r.get(0))
        .map_err(unavailable)?;
    if !mode.eq_ignore_ascii_case("wal") {
        return Err(unavailable(format!("could not enable WAL mode ({mode})")));
    }
    migrate(conn).map_err(|e| match e {
        AppError::DbUnavailable(_) => e,
        other => unavailable(other),
    })
}

/// 기존 DB 검사: 새 스키마 거부, quick_check로 손상 검출. 읽기만 한다.
fn check_existing(conn: &Connection) -> AppResult<()> {
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(unavailable)?;
    if version > LATEST_VERSION {
        return Err(unavailable(format!(
            "newer schema (user_version {version})"
        )));
    }
    let mut stmt = conn.prepare("PRAGMA quick_check").map_err(unavailable)?;
    let mut rows = stmt.query([]).map_err(unavailable)?;
    let first: Option<String> = match rows.next() {
        Ok(Some(r)) => Some(r.get(0).map_err(unavailable)?),
        Ok(None) => None,
        Err(e) => return Err(unavailable(format!("database file is damaged ({e})"))),
    };
    if first.as_deref() != Some("ok") {
        return Err(unavailable(format!(
            "database file is damaged (quick_check: {})",
            first.unwrap_or_default()
        )));
    }
    Ok(())
}

pub fn migrate(conn: &mut Connection) -> AppResult<()> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version > LATEST_VERSION {
        return Err(AppError::DbUnavailable(format!(
            "newer schema (user_version {version})"
        )));
    }
    if version == 0 {
        let tx = conn.transaction()?;
        tx.execute_batch(MIGRATION_0001)?;
        tx.pragma_update(None, "user_version", LATEST_VERSION)?;
        tx.commit()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::test_util::{leftover_wal_with, make_corrupt_page_db, test_db};
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn fresh_db_migrates_to_v1() {
        let (_d, conn) = test_db();
        let v: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v, 1);
        let n: i64 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN
                 ('categories','expenses','no_expense_days','fixed_expense_items',
                  'fixed_expense_amounts','category_notes','settings')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 7);
    }

    #[test]
    fn foreign_keys_and_wal_enabled() {
        let (_d, conn) = test_db();
        let fk: i64 = conn
            .query_row("PRAGMA foreign_keys", [], |r| r.get(0))
            .unwrap();
        assert_eq!(fk, 1);
        let jm: String = conn
            .query_row("PRAGMA journal_mode", [], |r| r.get(0))
            .unwrap();
        assert_eq!(jm, "wal");
    }

    #[test]
    fn reopen_keeps_data() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.db");
        {
            let conn = open(&path).unwrap();
            conn.execute(
                "INSERT INTO settings(key, value) VALUES ('theme', 'ocean')",
                [],
            )
            .unwrap();
        }
        let conn = open(&path).unwrap();
        let v: String = conn
            .query_row("SELECT value FROM settings WHERE key='theme'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(v, "ocean");
    }

    #[test]
    fn corrupted_file_is_reported_and_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("bad.db");
        let bytes = b"not a database at all";
        std::fs::write(&path, bytes).unwrap();
        let err = open(&path).unwrap_err();
        assert_eq!(err.code(), "db_unavailable");
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
    }

    #[test]
    fn corrupted_page_is_unavailable_and_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("c.db");
        make_corrupt_page_db(&path);
        let before = std::fs::read(&path).unwrap();
        let err = open(&path).unwrap_err();
        assert_eq!(err.code(), "db_unavailable");
        assert_eq!(std::fs::read(&path).unwrap(), before);
    }

    fn wal_path(p: &Path) -> std::path::PathBuf {
        p.with_file_name(format!("{}-wal", p.file_name().unwrap().to_string_lossy()))
    }

    #[test]
    fn rejected_newer_schema_keeps_main_and_leftover_wal_bytes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("w.db");
        leftover_wal_with(&path, "PRAGMA user_version = 99;");
        let wal = wal_path(&path);
        let (main_before, wal_before) =
            (std::fs::read(&path).unwrap(), std::fs::read(&wal).unwrap());
        assert!(!wal_before.is_empty());
        assert_eq!(open(&path).unwrap_err().code(), "db_unavailable");
        assert_eq!(std::fs::read(&path).unwrap(), main_before);
        assert_eq!(std::fs::read(&wal).unwrap(), wal_before);
    }

    #[test]
    fn rejected_corrupt_page_keeps_main_and_leftover_wal_bytes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("w.db");
        make_corrupt_page_db(&path);
        // 손상과 별개 페이지에 커밋된 프레임이 남은 WAL을 만든다
        {
            let c = Connection::open(&path).unwrap();
            c.set_db_config(
                rusqlite::config::DbConfig::SQLITE_DBCONFIG_NO_CKPT_ON_CLOSE,
                true,
            )
            .unwrap();
            c.execute("INSERT INTO categories VALUES (1, 'a')", [])
                .unwrap();
        }
        let wal = wal_path(&path);
        let (main_before, wal_before) =
            (std::fs::read(&path).unwrap(), std::fs::read(&wal).unwrap());
        assert!(!wal_before.is_empty());
        assert_eq!(open(&path).unwrap_err().code(), "db_unavailable");
        assert_eq!(std::fs::read(&path).unwrap(), main_before);
        assert_eq!(std::fs::read(&wal).unwrap(), wal_before);
    }

    #[test]
    fn accepted_db_with_leftover_wal_shows_wal_data_and_checkpoints_on_close() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("w.db");
        {
            let c = open(&path).unwrap();
            c.set_db_config(
                rusqlite::config::DbConfig::SQLITE_DBCONFIG_NO_CKPT_ON_CLOSE,
                true,
            )
            .unwrap();
            c.execute(
                "INSERT INTO settings(key, value) VALUES ('theme', 'ocean')",
                [],
            )
            .unwrap();
        }
        assert!(std::fs::metadata(wal_path(&path)).unwrap().len() > 0);
        let c = open(&path).unwrap();
        let v: String = c
            .query_row("SELECT value FROM settings WHERE key='theme'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(v, "ocean");
        // 받아들인 연결에는 닫을 때 체크포인트가 켜져 있어야 한다
        drop(c);
        assert!(
            !wal_path(&path).exists() || std::fs::metadata(wal_path(&path)).unwrap().len() == 0
        );
        let c = open(&path).unwrap();
        let n: i64 = c
            .query_row("SELECT count(*) FROM settings WHERE key='theme'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn newer_schema_non_wal_file_is_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("n.db");
        {
            let c = Connection::open(&path).unwrap();
            c.execute_batch("CREATE TABLE t(x);").unwrap();
            c.pragma_update(None, "user_version", 99).unwrap();
        }
        let before = std::fs::read(&path).unwrap();
        assert_eq!(open(&path).unwrap_err().code(), "db_unavailable");
        assert_eq!(std::fs::read(&path).unwrap(), before);
    }

    #[test]
    fn newer_schema_is_unavailable() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("new.db");
        {
            let c = Connection::open(&path).unwrap();
            c.pragma_update(None, "user_version", 99).unwrap();
        }
        assert_eq!(open(&path).unwrap_err().code(), "db_unavailable");
    }

    #[test]
    fn category_ids_are_not_reused() {
        let (_d, conn) = test_db();
        for n in ["a", "b", "c"] {
            conn.execute(
                "INSERT INTO categories(name,color,created_at,updated_at) VALUES (?1,'#000000','t','t')",
                [n],
            )
            .unwrap();
        }
        conn.execute("DELETE FROM categories WHERE id = 3", [])
            .unwrap();
        conn.execute(
            "INSERT INTO categories(name,color,created_at,updated_at) VALUES ('d','#000000','t','t')",
            [],
        )
        .unwrap();
        let id: i64 = conn
            .query_row("SELECT id FROM categories WHERE name='d'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(id, 4);
    }

    #[test]
    fn kst_time_format() {
        let s = crate::time::now_kst_iso();
        assert!(s.ends_with("+09:00"), "{s}");
        assert_eq!(s.len(), 25);
        assert_eq!(crate::time::today_kst_compact().len(), 8);
    }
}
