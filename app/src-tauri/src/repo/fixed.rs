use std::collections::{HashMap, HashSet};

use rusqlite::{Connection, params};

use crate::error::{AppError, AppResult};
use crate::models::{FixedAmount, FixedData, FixedItem};
use crate::time::now_kst_iso;

const MAX_AMOUNT: i64 = 99_999_999_999;

fn invalid(msg: &str) -> AppError {
    AppError::InvalidInput(msg.into())
}

fn validate_month(month: &str) -> AppResult<()> {
    if month.len() == 7
        && chrono::NaiveDate::parse_from_str(&format!("{month}-01"), "%Y-%m-%d").is_ok()
    {
        Ok(())
    } else {
        Err(invalid("월은 YYYY-MM 형식이어야 합니다."))
    }
}

/// Validates the whole payload and returns the items with trimmed names.
fn validate(items: &[FixedItem], amounts: &[FixedAmount]) -> AppResult<Vec<FixedItem>> {
    let mut ids = HashSet::new();
    let mut names = HashSet::new();
    let mut cleaned = Vec::with_capacity(items.len());
    for it in items {
        if it.id.is_empty() {
            return Err(invalid("항목 ID가 비어 있습니다."));
        }
        let name = it.name.trim();
        if name.is_empty() {
            return Err(invalid("항목 이름을 입력하세요."));
        }
        if !ids.insert(it.id.clone()) {
            return Err(invalid("항목 ID가 중복되었습니다."));
        }
        if !names.insert(name.to_lowercase()) {
            return Err(AppError::DuplicateName(
                "이미 있는 고정 지출 이름입니다.".into(),
            ));
        }
        cleaned.push(FixedItem {
            id: it.id.clone(),
            name: name.to_string(),
            sort_order: it.sort_order,
        });
    }
    let mut pairs = HashSet::new();
    for a in amounts {
        if !ids.contains(&a.item_id) {
            return Err(invalid("목록에 없는 항목의 금액입니다."));
        }
        validate_month(&a.month)?;
        if !(0..=MAX_AMOUNT).contains(&a.amount) {
            return Err(invalid("금액은 0원 이상 99,999,999,999원 이하여야 합니다."));
        }
        if !pairs.insert((a.item_id.as_str(), a.month.as_str())) {
            return Err(invalid("같은 항목·월의 금액이 중복되었습니다."));
        }
    }
    Ok(cleaned)
}

fn row_to_amount(r: &rusqlite::Row) -> rusqlite::Result<FixedAmount> {
    Ok(FixedAmount {
        item_id: r.get(0)?,
        month: r.get(1)?,
        amount: r.get(2)?,
    })
}

pub fn load(conn: &Connection) -> AppResult<FixedData> {
    let mut stmt = conn.prepare(
        "SELECT id, name, sort_order FROM fixed_expense_items ORDER BY sort_order, created_at",
    )?;
    let items = stmt
        .query_map([], |r| {
            Ok(FixedItem {
                id: r.get(0)?,
                name: r.get(1)?,
                sort_order: r.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut stmt = conn.prepare(
        "SELECT item_id, month, amount FROM fixed_expense_amounts ORDER BY month, item_id",
    )?;
    let amounts = stmt
        .query_map([], row_to_amount)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(FixedData { items, amounts })
}

pub fn amounts_for_month(conn: &Connection, month: &str) -> AppResult<Vec<FixedAmount>> {
    let mut stmt = conn.prepare(
        "SELECT item_id, month, amount FROM fixed_expense_amounts WHERE month = ?1 ORDER BY item_id",
    )?;
    Ok(stmt
        .query_map([month], row_to_amount)?
        .collect::<Result<Vec<_>, _>>()?)
}

/// Replaces all fixed-expense data in one transaction.
pub fn save(
    conn: &mut Connection,
    items: Vec<FixedItem>,
    amounts: Vec<FixedAmount>,
) -> AppResult<()> {
    let items = validate(&items, &amounts)?;
    let tx = conn.transaction()?;
    let existing: HashMap<String, String> = {
        let mut stmt = tx.prepare("SELECT id, created_at FROM fixed_expense_items")?;
        stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<Result<_, _>>()?
    };
    tx.execute("DELETE FROM fixed_expense_items", [])?;
    let now = now_kst_iso();
    for it in &items {
        let created = existing.get(&it.id).unwrap_or(&now);
        tx.execute(
            "INSERT INTO fixed_expense_items (id, name, sort_order, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![it.id, it.name, it.sort_order, created],
        )?;
    }
    for a in &amounts {
        tx.execute(
            "INSERT INTO fixed_expense_amounts (item_id, month, amount) VALUES (?1, ?2, ?3)",
            params![a.item_id, a.month, a.amount],
        )?;
    }
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_util::test_db;

    fn item(id: &str, name: &str, order: i64) -> FixedItem {
        FixedItem {
            id: id.into(),
            name: name.into(),
            sort_order: order,
        }
    }
    fn amt(id: &str, month: &str, amount: i64) -> FixedAmount {
        FixedAmount {
            item_id: id.into(),
            month: month.into(),
            amount,
        }
    }

    #[test]
    fn save_replaces_and_cascades_removed_items() {
        let (_d, mut conn) = test_db();
        save(
            &mut conn,
            vec![item("a", "월세", 0), item("b", "통신", 1)],
            vec![amt("a", "2026-01", 500), amt("b", "2026-01", 50)],
        )
        .unwrap();
        save(
            &mut conn,
            vec![item("a", "월세", 0)],
            vec![amt("a", "2026-02", 600)],
        )
        .unwrap();
        let d = load(&conn).unwrap();
        assert_eq!(d.items, vec![item("a", "월세", 0)]);
        assert_eq!(d.amounts, vec![amt("a", "2026-02", 600)]);
        let n: i64 = conn
            .query_row("SELECT count(*) FROM fixed_expense_amounts", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn swapping_names_and_trimming_work() {
        let (_d, mut conn) = test_db();
        save(
            &mut conn,
            vec![item("a", "A", 0), item("b", "B", 1)],
            vec![],
        )
        .unwrap();
        save(
            &mut conn,
            vec![item("a", " B ", 0), item("b", "A", 1)],
            vec![],
        )
        .unwrap();
        let d = load(&conn).unwrap();
        assert_eq!(d.items, vec![item("a", "B", 0), item("b", "A", 1)]);
    }

    #[test]
    fn zero_amount_is_kept_distinct_from_blank() {
        let (_d, mut conn) = test_db();
        save(
            &mut conn,
            vec![item("a", "월세", 0)],
            vec![amt("a", "2026-01", 0), amt("a", "2026-03", 10)],
        )
        .unwrap();
        let d = load(&conn).unwrap();
        assert_eq!(
            d.amounts,
            vec![amt("a", "2026-01", 0), amt("a", "2026-03", 10)]
        );
        assert!(amounts_for_month(&conn, "2026-02").unwrap().is_empty());
        assert_eq!(
            amounts_for_month(&conn, "2026-01").unwrap(),
            vec![amt("a", "2026-01", 0)]
        );
    }

    #[test]
    fn duplicate_fixed_names_rejected_and_nothing_changes() {
        let (_d, mut conn) = test_db();
        save(
            &mut conn,
            vec![item("a", "월세", 0)],
            vec![amt("a", "2026-01", 5)],
        )
        .unwrap();
        let before = load(&conn).unwrap();
        let err = save(
            &mut conn,
            vec![item("x", "Rent", 0), item("y", "rent", 1)],
            vec![],
        )
        .unwrap_err();
        assert_eq!(err.code(), "duplicate_name");
        assert_eq!(load(&conn).unwrap(), before);
    }

    #[test]
    fn invalid_payloads_rejected_and_nothing_changes() {
        let (_d, mut conn) = test_db();
        save(
            &mut conn,
            vec![item("a", "월세", 0)],
            vec![amt("a", "2026-01", 5)],
        )
        .unwrap();
        let before = load(&conn).unwrap();
        let ok = || vec![item("a", "월세", 0)];
        let cases: Vec<(Vec<FixedItem>, Vec<FixedAmount>)> = vec![
            (vec![item("", "x", 0)], vec![]),
            (vec![item("a", "  ", 0)], vec![]),
            (ok(), vec![amt("zz", "2026-01", 1)]),
            (ok(), vec![amt("a", "2026-13", 1)]),
            (ok(), vec![amt("a", "2026-1", 1)]),
            (ok(), vec![amt("a", "2026-01", -1)]),
            (ok(), vec![amt("a", "2026-01", 100_000_000_000)]),
            (ok(), vec![amt("a", "2026-01", 1), amt("a", "2026-01", 2)]),
            (vec![item("a", "x", 0), item("a", "y", 1)], vec![]),
        ];
        for (items, amounts) in cases {
            let err = save(&mut conn, items, amounts).unwrap_err();
            assert_eq!(err.code(), "invalid_input");
            assert_eq!(load(&conn).unwrap(), before);
        }
    }

    #[test]
    fn created_at_kept_for_existing_ids() {
        let (_d, mut conn) = test_db();
        save(&mut conn, vec![item("a", "월세", 0)], vec![]).unwrap();
        conn.execute(
            "UPDATE fixed_expense_items SET created_at = '2000-01-01T00:00:00+09:00'",
            [],
        )
        .unwrap();
        save(&mut conn, vec![item("a", "월세2", 0)], vec![]).unwrap();
        let c: String = conn
            .query_row(
                "SELECT created_at FROM fixed_expense_items WHERE id='a'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(c, "2000-01-01T00:00:00+09:00");
    }
}
