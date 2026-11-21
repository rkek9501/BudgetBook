use rusqlite::{Connection, params};

use crate::error::{AppError, AppResult};
use crate::repo::expenses::validate_date;
use crate::time::now_kst_iso;

pub fn list_no_expense(conn: &Connection, start: &str, end: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT date FROM no_expense_days WHERE date >= ?1 AND date <= ?2 ORDER BY date",
    )?;
    let rows = stmt.query_map(params![start, end], |r| r.get(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn set_no_expense(conn: &mut Connection, date: &str, on: bool) -> AppResult<()> {
    validate_date(date)?;
    let tx = conn.transaction()?;
    if on {
        let n: i64 = tx.query_row(
            "SELECT count(*) FROM expenses WHERE date = ?1",
            [date],
            |r| r.get(0),
        )?;
        if n > 0 {
            return Err(AppError::DayHasExpenses(
                "지출이 있는 날은 무지출로 표시할 수 없습니다.".into(),
            ));
        }
        tx.execute(
            "INSERT OR IGNORE INTO no_expense_days (date, created_at) VALUES (?1, ?2)",
            params![date, now_kst_iso()],
        )?;
    } else {
        tx.execute("DELETE FROM no_expense_days WHERE date = ?1", [date])?;
    }
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_util::test_db;
    use crate::models::NewExpense;
    use crate::repo::{categories, expenses};

    #[test]
    fn cannot_mark_no_expense_when_expenses_exist() {
        let (_d, mut conn) = test_db();
        let c = categories::create(&conn, "A", "#000000").unwrap();
        expenses::add(
            &mut conn,
            NewExpense {
                date: "2026-11-05".into(),
                description: "x".into(),
                amount: 1,
                category_id: c.id,
            },
        )
        .unwrap();
        let err = set_no_expense(&mut conn, "2026-11-05", true).unwrap_err();
        assert_eq!(err.code(), "day_has_expenses");
        assert!(
            list_no_expense(&conn, "2026-11-01", "2026-11-30")
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn set_and_clear_mark_with_validation_and_range() {
        let (_d, mut conn) = test_db();
        for d in ["2026-11-03", "2026-11-01", "2026-11-09"] {
            set_no_expense(&mut conn, d, true).unwrap();
        }
        set_no_expense(&mut conn, "2026-11-01", true).unwrap();
        assert_eq!(
            list_no_expense(&conn, "2026-11-01", "2026-11-03").unwrap(),
            vec!["2026-11-01", "2026-11-03"]
        );
        set_no_expense(&mut conn, "2026-11-03", false).unwrap();
        set_no_expense(&mut conn, "2026-11-04", false).unwrap();
        assert_eq!(
            list_no_expense(&conn, "2026-11-01", "2026-11-30").unwrap(),
            vec!["2026-11-01", "2026-11-09"]
        );
        assert_eq!(
            set_no_expense(&mut conn, "2026-13-01", true)
                .unwrap_err()
                .code(),
            "invalid_input"
        );
    }
}
