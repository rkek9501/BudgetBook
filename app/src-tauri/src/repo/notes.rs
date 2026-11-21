use rusqlite::{Connection, params};

use crate::error::{AppError, AppResult};
use crate::models::CategoryNote;
use crate::time::now_kst_iso;

pub fn list_month(conn: &Connection, month: &str) -> AppResult<Vec<CategoryNote>> {
    let mut stmt = conn.prepare(
        "SELECT month, category_id, note FROM category_notes WHERE month = ?1 ORDER BY category_id",
    )?;
    let rows = stmt.query_map([month], |r| {
        Ok(CategoryNote {
            month: r.get(0)?,
            category_id: r.get(1)?,
            note: r.get(2)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn save(conn: &Connection, month: &str, category_id: i64, note: &str) -> AppResult<()> {
    let note = note.trim();
    if note.is_empty() {
        conn.execute(
            "DELETE FROM category_notes WHERE month = ?1 AND category_id = ?2",
            params![month, category_id],
        )?;
        return Ok(());
    }
    let res = conn.execute(
        "INSERT INTO category_notes (month, category_id, note, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(month, category_id) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at",
        params![month, category_id, note, now_kst_iso()],
    );
    match res {
        Ok(_) => Ok(()),
        Err(rusqlite::Error::SqliteFailure(f, _))
            if f.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_FOREIGNKEY =>
        {
            Err(AppError::NotFound("카테고리를 찾을 수 없습니다.".into()))
        }
        Err(e) => Err(e.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_util::test_db;
    use crate::repo::categories;

    #[test]
    fn note_empty_deletes_row() {
        let (_d, conn) = test_db();
        let c = categories::create(&conn, "A", "#000000").unwrap();
        save(&conn, "2026-11", c.id, "  hi  ").unwrap();
        let l = list_month(&conn, "2026-11").unwrap();
        assert_eq!(l.len(), 1);
        assert_eq!(l[0].note, "hi");
        save(&conn, "2026-11", c.id, "hello").unwrap();
        assert_eq!(list_month(&conn, "2026-11").unwrap()[0].note, "hello");
        save(&conn, "2026-11", c.id, "   ").unwrap();
        assert!(list_month(&conn, "2026-11").unwrap().is_empty());
        save(&conn, "2026-11", c.id, "").unwrap();
    }

    #[test]
    fn note_for_missing_category_is_not_found() {
        let (_d, conn) = test_db();
        assert_eq!(
            save(&conn, "2026-11", 999, "x").unwrap_err().code(),
            "not_found"
        );
    }
}
