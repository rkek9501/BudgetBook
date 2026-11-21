use rusqlite::{params, Connection, OptionalExtension, Transaction};

use crate::error::{AppError, AppResult};
use crate::models::{Category, CategoryUsage, NewCategory};
use crate::time::now_kst_iso;

fn clean_name(name: &str) -> AppResult<String> {
    let n = name.trim();
    if n.is_empty() {
        return Err(AppError::InvalidInput("카테고리 이름을 입력하세요.".into()));
    }
    Ok(n.to_string())
}

fn clean_color(color: &str) -> AppResult<String> {
    let b = color.as_bytes();
    if b.len() == 7 && b[0] == b'#' && b[1..].iter().all(|c| c.is_ascii_hexdigit()) {
        Ok(color.to_ascii_uppercase())
    } else {
        Err(AppError::InvalidInput("색은 #RRGGBB 형식이어야 합니다.".into()))
    }
}

fn duplicate() -> AppError {
    AppError::DuplicateName("이미 있는 카테고리 이름입니다.".into())
}

fn not_found() -> AppError {
    AppError::NotFound("카테고리를 찾을 수 없습니다.".into())
}

fn map_write_err(e: rusqlite::Error) -> AppError {
    if let rusqlite::Error::SqliteFailure(f, _) = &e {
        if f.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE {
            return duplicate();
        }
    }
    e.into()
}

fn name_taken(conn: &Connection, name: &str, except_id: i64) -> AppResult<bool> {
    Ok(conn
        .query_row(
            "SELECT 1 FROM categories WHERE name = ?1 COLLATE NOCASE AND id <> ?2",
            params![name, except_id],
            |_| Ok(()),
        )
        .optional()?
        .is_some())
}

fn exists(conn: &Connection, id: i64) -> AppResult<bool> {
    Ok(conn
        .query_row("SELECT 1 FROM categories WHERE id = ?1", [id], |_| Ok(()))
        .optional()?
        .is_some())
}

fn get(conn: &Connection, id: i64) -> AppResult<Category> {
    conn.query_row("SELECT id, name, color FROM categories WHERE id = ?1", [id], |r| {
        Ok(Category { id: r.get(0)?, name: r.get(1)?, color: r.get(2)? })
    })
    .optional()?
    .ok_or_else(not_found)
}

pub fn list(conn: &Connection) -> AppResult<Vec<Category>> {
    let mut stmt = conn.prepare("SELECT id, name, color FROM categories ORDER BY id")?;
    let rows = stmt.query_map([], |r| Ok(Category { id: r.get(0)?, name: r.get(1)?, color: r.get(2)? }))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn create(conn: &Connection, name: &str, color: &str) -> AppResult<Category> {
    let name = clean_name(name)?;
    let color = clean_color(color)?;
    if name_taken(conn, &name, 0)? {
        return Err(duplicate());
    }
    let now = now_kst_iso();
    conn.execute(
        "INSERT INTO categories (name, color, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
        params![name, color, now],
    )
    .map_err(map_write_err)?;
    Ok(Category { id: conn.last_insert_rowid(), name, color })
}

pub fn update(conn: &Connection, id: i64, name: &str, color: &str) -> AppResult<Category> {
    let name = clean_name(name)?;
    let color = clean_color(color)?;
    if !exists(conn, id)? {
        return Err(not_found());
    }
    if name_taken(conn, &name, id)? {
        return Err(duplicate());
    }
    conn.execute(
        "UPDATE categories SET name = ?1, color = ?2, updated_at = ?3 WHERE id = ?4",
        params![name, color, now_kst_iso(), id],
    )
    .map_err(map_write_err)?;
    get(conn, id)
}

pub fn usage(conn: &Connection, id: i64) -> AppResult<CategoryUsage> {
    Ok(CategoryUsage {
        expense_count: conn.query_row("SELECT count(*) FROM expenses WHERE category_id = ?1", [id], |r| r.get(0))?,
        note_count: conn.query_row("SELECT count(*) FROM category_notes WHERE category_id = ?1", [id], |r| r.get(0))?,
    })
}

fn delete_in_tx(tx: &Transaction, id: i64, move_to: Option<i64>) -> AppResult<()> {
    if !exists(tx, id)? {
        return Err(not_found());
    }
    let total: i64 = tx.query_row("SELECT count(*) FROM categories", [], |r| r.get(0))?;
    if total <= 1 {
        return Err(AppError::LastCategory("마지막 카테고리는 삭제할 수 없습니다.".into()));
    }
    let expenses: i64 = tx.query_row("SELECT count(*) FROM expenses WHERE category_id = ?1", [id], |r| r.get(0))?;
    if expenses > 0 && move_to.is_none() {
        return Err(AppError::CategoryInUse("지출이 있는 카테고리입니다. 옮길 카테고리를 선택하세요.".into()));
    }
    if let Some(target) = move_to {
        tx.execute("UPDATE expenses SET category_id = ?1 WHERE category_id = ?2", params![target, id])?;
        let now = now_kst_iso();
        let moved: Vec<(String, String)> = {
            let mut stmt = tx.prepare("SELECT month, note FROM category_notes WHERE category_id = ?1")?;
            let rows = stmt.query_map([id], |r| Ok((r.get(0)?, r.get(1)?)))?;
            rows.collect::<Result<_, _>>()?
        };
        for (month, note) in moved {
            let existing: Option<String> = tx
                .query_row(
                    "SELECT note FROM category_notes WHERE month = ?1 AND category_id = ?2",
                    params![month, target],
                    |r| r.get(0),
                )
                .optional()?;
            match existing {
                Some(base) => {
                    tx.execute(
                        "UPDATE category_notes SET note = ?1, updated_at = ?2 WHERE month = ?3 AND category_id = ?4",
                        params![format!("{base}\n{note}"), now, month, target],
                    )?;
                }
                None => {
                    tx.execute(
                        "UPDATE category_notes SET category_id = ?1, updated_at = ?2 WHERE month = ?3 AND category_id = ?4",
                        params![target, now, month, id],
                    )?;
                }
            }
        }
    }
    tx.execute("DELETE FROM categories WHERE id = ?1", [id])?;
    Ok(())
}

pub fn delete(conn: &mut Connection, id: i64, move_to: Option<i64>) -> AppResult<()> {
    let tx = conn.transaction()?;
    if let Some(t) = move_to {
        if t == id || !exists(&tx, t)? {
            return Err(AppError::InvalidInput("옮길 카테고리가 올바르지 않습니다.".into()));
        }
    }
    delete_in_tx(&tx, id, move_to)?;
    tx.commit()?;
    Ok(())
}

pub fn seed_defaults(conn: &mut Connection, defaults: &[NewCategory]) -> AppResult<Vec<Category>> {
    let tx = conn.transaction()?;
    let n: i64 = tx.query_row("SELECT count(*) FROM categories", [], |r| r.get(0))?;
    if n == 0 {
        for c in defaults {
            create(&tx, &c.name, &c.color)?;
        }
    }
    let out = list(&tx)?;
    tx.commit()?;
    Ok(out)
}

#[cfg(test)]
mod tests {
use super::*;
use crate::db::test_util::test_db;
use crate::models::NewCategory;
use crate::repo::notes;

fn add_expense(conn: &Connection, id: &str, cat: i64) {
    conn.execute(
        "INSERT INTO expenses (id, date, description, amount, category_id, created_at, updated_at)
         VALUES (?1, '2026-11-01', 'x', 100, ?2, 't', 't')",
        rusqlite::params![id, cat],
    )
    .unwrap();
}

fn count_expenses(conn: &Connection, cat: i64) -> i64 {
    conn.query_row("SELECT count(*) FROM expenses WHERE category_id=?1", [cat], |r| r.get(0)).unwrap()
}

fn code<T: std::fmt::Debug>(r: AppResult<T>) -> &'static str {
    r.unwrap_err().code()
}

#[test]
fn create_trims_and_rejects_duplicates_case_insensitive() {
    let (_d, conn) = test_db();
    let c = create(&conn, "식비 ", "#aabbcc").unwrap();
    assert_eq!(c.name, "식비");
    assert_eq!(c.color, "#AABBCC");
    assert_eq!(code(create(&conn, "식비", "#112233")), "duplicate_name");
    create(&conn, "Food", "#112233").unwrap();
    assert_eq!(code(create(&conn, "food", "#112233")), "duplicate_name");
    assert_eq!(code(create(&conn, "  ", "#112233")), "invalid_input");
    assert_eq!(code(create(&conn, "x", "red")), "invalid_input");
    assert_eq!(code(create(&conn, "x", "#12345")), "invalid_input");
}

#[test]
fn update_checks_missing_and_duplicates() {
    let (_d, conn) = test_db();
    let a = create(&conn, "A", "#000000").unwrap();
    let b = create(&conn, "B", "#000000").unwrap();
    assert_eq!(update(&conn, a.id, " a ", "#ffffff").unwrap().name, "a");
    assert_eq!(code(update(&conn, a.id, "b", "#000000")), "duplicate_name");
    assert_eq!(code(update(&conn, 999, "Z", "#000000")), "not_found");
    assert_eq!(list(&conn).unwrap().len(), 2);
    assert_eq!(b.id, list(&conn).unwrap()[1].id);
}

#[test]
fn ids_are_never_reused() {
    let (_d, mut conn) = test_db();
    let a = create(&conn, "A", "#000000").unwrap();
    let b = create(&conn, "B", "#000000").unwrap();
    delete(&mut conn, b.id, None).unwrap();
    let c = create(&conn, "C", "#000000").unwrap();
    assert!(c.id > b.id && c.id > a.id);
}

#[test]
fn last_category_cannot_be_deleted() {
    let (_d, mut conn) = test_db();
    let a = create(&conn, "A", "#000000").unwrap();
    assert_eq!(code(delete(&mut conn, a.id, None)), "last_category");
    assert_eq!(list(&conn).unwrap().len(), 1);
}

#[test]
fn delete_in_use_without_target_fails() {
    let (_d, mut conn) = test_db();
    let a = create(&conn, "A", "#000000").unwrap();
    create(&conn, "B", "#000000").unwrap();
    add_expense(&conn, "e1", a.id);
    assert_eq!(code(delete(&mut conn, a.id, None)), "category_in_use");
    assert_eq!(list(&conn).unwrap().len(), 2);
    assert_eq!(count_expenses(&conn, a.id), 1);
}

#[test]
fn delete_validates_arguments() {
    let (_d, mut conn) = test_db();
    let a = create(&conn, "A", "#000000").unwrap();
    create(&conn, "B", "#000000").unwrap();
    assert_eq!(code(delete(&mut conn, 999, None)), "not_found");
    assert_eq!(code(delete(&mut conn, a.id, Some(a.id))), "invalid_input");
    assert_eq!(code(delete(&mut conn, a.id, Some(999))), "invalid_input");
    assert_eq!(list(&conn).unwrap().len(), 2);
}

#[test]
fn delete_with_move_moves_expenses_and_merges_notes() {
    let (_d, mut conn) = test_db();
    let a = create(&conn, "A", "#000000").unwrap();
    let b = create(&conn, "B", "#000000").unwrap();
    add_expense(&conn, "e1", a.id);
    add_expense(&conn, "e2", a.id);
    notes::save(&conn, "2026-11", a.id, "a").unwrap();
    notes::save(&conn, "2026-11", b.id, "b").unwrap();
    notes::save(&conn, "2026-10", a.id, "old").unwrap();
    delete(&mut conn, a.id, Some(b.id)).unwrap();
    assert_eq!(count_expenses(&conn, b.id), 2);
    let ns = notes::list_month(&conn, "2026-11").unwrap();
    assert_eq!(ns.len(), 1);
    assert_eq!(ns[0].note, "b\na");
    let oct = notes::list_month(&conn, "2026-10").unwrap();
    assert_eq!((oct.len(), oct[0].category_id, oct[0].note.as_str()), (1, b.id, "old"));
    let cats = list(&conn).unwrap();
    assert_eq!(cats.len(), 1);
    assert_eq!(cats[0].id, b.id);
}

#[test]
fn delete_notes_only_category_cascades_notes() {
    let (_d, mut conn) = test_db();
    let a = create(&conn, "A", "#000000").unwrap();
    create(&conn, "B", "#000000").unwrap();
    notes::save(&conn, "2026-11", a.id, "memo").unwrap();
    assert_eq!(usage(&conn, a.id).unwrap(), CategoryUsage { expense_count: 0, note_count: 1 });
    delete(&mut conn, a.id, None).unwrap();
    assert!(notes::list_month(&conn, "2026-11").unwrap().is_empty());
}

#[test]
fn seed_only_when_empty() {
    let (_d, mut conn) = test_db();
    let defaults = vec![
        NewCategory { name: "식비".into(), color: "#ff0000".into() },
        NewCategory { name: "교통".into(), color: "#00ff00".into() },
    ];
    let first = seed_defaults(&mut conn, &defaults).unwrap();
    assert_eq!(first.len(), 2);
    assert_eq!(first[0].color, "#FF0000");
    let other = vec![NewCategory { name: "기타".into(), color: "#0000ff".into() }];
    let second = seed_defaults(&mut conn, &other).unwrap();
    assert_eq!(second, first);
}
}
