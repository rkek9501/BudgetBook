use rusqlite::{Connection, OptionalExtension, params};

use crate::error::{AppError, AppResult};
use crate::models::{Expense, ExpenseUpdate, NewExpense};
use crate::time::now_kst_iso;

const MAX_AMOUNT: i64 = 99_999_999_999;

pub(crate) fn validate_date(date: &str) -> AppResult<()> {
    if date.len() == 10 && chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").is_ok() {
        Ok(())
    } else {
        Err(AppError::InvalidInput(
            "날짜는 YYYY-MM-DD 형식이어야 합니다.".into(),
        ))
    }
}

pub(crate) fn clean_description(description: &str) -> AppResult<String> {
    let d = description.trim();
    if d.is_empty() {
        return Err(AppError::InvalidInput("내용을 입력하세요.".into()));
    }
    Ok(d.to_string())
}

pub(crate) fn validate_amount(amount: i64) -> AppResult<()> {
    if (0..=MAX_AMOUNT).contains(&amount) {
        Ok(())
    } else {
        Err(AppError::InvalidInput(
            "금액은 0원 이상 99,999,999,999원 이하여야 합니다.".into(),
        ))
    }
}

fn category_missing() -> AppError {
    AppError::NotFound("카테고리를 찾을 수 없습니다.".into())
}

fn ensure_category(conn: &Connection, id: i64) -> AppResult<()> {
    conn.query_row("SELECT 1 FROM categories WHERE id = ?1", [id], |_| Ok(()))
        .optional()?
        .map(|_| ())
        .ok_or_else(category_missing)
}

fn map_write_err(e: rusqlite::Error) -> AppError {
    if let rusqlite::Error::SqliteFailure(f, _) = &e {
        if f.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_FOREIGNKEY {
            return category_missing();
        }
    }
    e.into()
}

fn row_to_expense(r: &rusqlite::Row) -> rusqlite::Result<Expense> {
    Ok(Expense {
        id: r.get(0)?,
        date: r.get(1)?,
        description: r.get(2)?,
        amount: r.get(3)?,
        category_id: r.get(4)?,
    })
}

fn get(conn: &Connection, id: &str) -> AppResult<Expense> {
    conn.query_row(
        "SELECT id, date, description, amount, category_id FROM expenses WHERE id = ?1",
        [id],
        row_to_expense,
    )
    .optional()?
    .ok_or_else(|| AppError::NotFound("지출을 찾을 수 없습니다.".into()))
}

pub fn list_range(conn: &Connection, start: &str, end: &str) -> AppResult<Vec<Expense>> {
    let mut stmt = conn.prepare(
        "SELECT id, date, description, amount, category_id FROM expenses
         WHERE date >= ?1 AND date <= ?2 ORDER BY date, created_at, rowid",
    )?;
    let rows = stmt.query_map(params![start, end], row_to_expense)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn add(conn: &mut Connection, e: NewExpense) -> AppResult<Expense> {
    validate_date(&e.date)?;
    let description = clean_description(&e.description)?;
    validate_amount(e.amount)?;
    let tx = conn.transaction()?;
    ensure_category(&tx, e.category_id)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_kst_iso();
    tx.execute(
        "INSERT INTO expenses (id, date, description, amount, category_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![id, e.date, description, e.amount, e.category_id, now],
    )
    .map_err(map_write_err)?;
    tx.execute("DELETE FROM no_expense_days WHERE date = ?1", [&e.date])?;
    tx.commit()?;
    Ok(Expense {
        id,
        date: e.date,
        description,
        amount: e.amount,
        category_id: e.category_id,
    })
}

pub fn update(conn: &Connection, u: ExpenseUpdate) -> AppResult<Expense> {
    let description = clean_description(&u.description)?;
    validate_amount(u.amount)?;
    get(conn, &u.id)?;
    ensure_category(conn, u.category_id)?;
    conn.execute(
        "UPDATE expenses SET description = ?1, amount = ?2, category_id = ?3, updated_at = ?4 WHERE id = ?5",
        params![description, u.amount, u.category_id, now_kst_iso(), u.id],
    )
    .map_err(map_write_err)?;
    get(conn, &u.id)
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    let n = conn.execute("DELETE FROM expenses WHERE id = ?1", [id])?;
    if n == 0 {
        return Err(AppError::NotFound("지출을 찾을 수 없습니다.".into()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_util::test_db;
    use crate::models::{ExpenseUpdate, NewExpense};
    use crate::repo::{categories, days};

    fn new(date: &str, desc: &str, amount: i64, cat: i64) -> NewExpense {
        NewExpense {
            date: date.into(),
            description: desc.into(),
            amount,
            category_id: cat,
        }
    }

    fn code<T: std::fmt::Debug>(r: AppResult<T>) -> &'static str {
        r.unwrap_err().code()
    }

    #[test]
    fn add_clears_no_expense_mark_same_day() {
        let (_d, mut conn) = test_db();
        let c = categories::create(&conn, "A", "#000000").unwrap();
        days::set_no_expense(&mut conn, "2026-11-05", true).unwrap();
        days::set_no_expense(&mut conn, "2026-11-06", true).unwrap();
        let e = add(&mut conn, new("2026-11-05", " 점심 ", 9000, c.id)).unwrap();
        assert_eq!(e.description, "점심");
        assert_eq!(e.id.len(), 36);
        assert_eq!(
            days::list_no_expense(&conn, "2026-11-01", "2026-11-30").unwrap(),
            vec!["2026-11-06"]
        );
    }

    #[test]
    fn rejects_unknown_category_and_bad_input() {
        let (_d, mut conn) = test_db();
        let c = categories::create(&conn, "A", "#000000").unwrap();
        assert_eq!(
            code(add(&mut conn, new("2026-11-05", "x", 1, 999))),
            "not_found"
        );
        assert_eq!(
            code(add(&mut conn, new("2026-11-05", "x", -1, c.id))),
            "invalid_input"
        );
        assert_eq!(
            code(add(
                &mut conn,
                new("2026-11-05", "x", 100_000_000_000, c.id)
            )),
            "invalid_input"
        );
        assert_eq!(
            code(add(&mut conn, new("2026-11-05", "  ", 1, c.id))),
            "invalid_input"
        );
        assert_eq!(
            code(add(&mut conn, new("2026-02-30", "x", 1, c.id))),
            "invalid_input"
        );
        assert_eq!(
            code(add(&mut conn, new("2026-2-3", "x", 1, c.id))),
            "invalid_input"
        );
        assert!(
            list_range(&conn, "2000-01-01", "2100-01-01")
                .unwrap()
                .is_empty()
        );
        add(&mut conn, new("2026-11-05", "x", 99_999_999_999, c.id)).unwrap();
        add(&mut conn, new("2026-11-05", "x", 0, c.id)).unwrap();
    }

    #[test]
    fn list_range_is_inclusive_and_ordered() {
        let (_d, mut conn) = test_db();
        let c = categories::create(&conn, "A", "#000000").unwrap();
        add(&mut conn, new("2026-11-10", "c", 1, c.id)).unwrap();
        add(&mut conn, new("2026-11-01", "a", 1, c.id)).unwrap();
        add(&mut conn, new("2026-11-01", "b", 1, c.id)).unwrap();
        add(&mut conn, new("2026-10-31", "out", 1, c.id)).unwrap();
        add(&mut conn, new("2026-11-11", "out", 1, c.id)).unwrap();
        let got: Vec<String> = list_range(&conn, "2026-11-01", "2026-11-10")
            .unwrap()
            .into_iter()
            .map(|e| e.description)
            .collect();
        assert_eq!(got, vec!["a", "b", "c"]);
    }

    #[test]
    fn update_changes_fields_but_not_date() {
        let (_d, mut conn) = test_db();
        let a = categories::create(&conn, "A", "#000000").unwrap();
        let b = categories::create(&conn, "B", "#000000").unwrap();
        let e = add(&mut conn, new("2026-11-05", "x", 1, a.id)).unwrap();
        let u = update(
            &conn,
            ExpenseUpdate {
                id: e.id.clone(),
                description: " y ".into(),
                amount: 5,
                category_id: b.id,
            },
        )
        .unwrap();
        assert_eq!(
            (
                u.date.as_str(),
                u.description.as_str(),
                u.amount,
                u.category_id
            ),
            ("2026-11-05", "y", 5, b.id)
        );
        let bad = |d: &str, amt, cat| ExpenseUpdate {
            id: e.id.clone(),
            description: d.into(),
            amount: amt,
            category_id: cat,
        };
        assert_eq!(code(update(&conn, bad("y", 5, 999))), "not_found");
        assert_eq!(code(update(&conn, bad("", 5, a.id))), "invalid_input");
        assert_eq!(code(update(&conn, bad("y", -1, a.id))), "invalid_input");
        let missing = ExpenseUpdate {
            id: "nope".into(),
            description: "y".into(),
            amount: 1,
            category_id: a.id,
        };
        assert_eq!(code(update(&conn, missing)), "not_found");
    }

    #[test]
    fn delete_removes_or_reports_missing() {
        let (_d, mut conn) = test_db();
        let c = categories::create(&conn, "A", "#000000").unwrap();
        let e = add(&mut conn, new("2026-11-05", "x", 1, c.id)).unwrap();
        delete(&conn, &e.id).unwrap();
        assert_eq!(code(delete(&conn, &e.id)), "not_found");
        assert!(
            list_range(&conn, "2026-11-01", "2026-11-30")
                .unwrap()
                .is_empty()
        );
    }
}
