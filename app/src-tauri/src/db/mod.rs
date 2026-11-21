use std::path::Path;

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
pub fn open(path: &Path) -> AppResult<Connection> {
    let mut flags = OpenFlags::SQLITE_OPEN_READ_WRITE
        | OpenFlags::SQLITE_OPEN_URI
        | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    if !path.exists() {
        flags |= OpenFlags::SQLITE_OPEN_CREATE;
    }
    let mut conn = Connection::open_with_flags(path, flags).map_err(unavailable)?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(unavailable)?;
    let mode: String = conn
        .query_row("PRAGMA journal_mode = WAL", [], |r| r.get(0))
        .map_err(unavailable)?;
    if !mode.eq_ignore_ascii_case("wal") {
        return Err(unavailable(format!("could not enable WAL mode ({mode})")));
    }
    migrate(&mut conn).map_err(|e| match e {
        AppError::DbUnavailable(_) => e,
        other => unavailable(other),
    })?;
    Ok(conn)
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
    use super::test_util::test_db;
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
