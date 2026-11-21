use std::collections::HashMap;

use rusqlite::{Connection, params};

use crate::error::{AppError, AppResult};
use crate::models::{CategoryNote, Expense, FixedAmount, FixedItem, ImportPayload, ImportResult};
use crate::repo::expenses::{clean_description, validate_amount, validate_date};
use crate::repo::fixed::{validate as validate_fixed, validate_month};
use crate::repo::{categories, fixed, settings};
use crate::time::now_kst_iso;

fn invalid(msg: &str) -> AppError {
    AppError::InvalidInput(msg.into())
}

fn missing_category() -> AppError {
    invalid("가져오기 데이터에 없는 카테고리를 가리키는 항목이 있습니다.")
}

/// Replaces all data with the payload in one transaction (settings other than
/// `accounting_start_day` are kept). Any error rolls everything back.
pub fn import_replace_all(conn: &mut Connection, p: ImportPayload) -> AppResult<ImportResult> {
    if !(1..=31).contains(&p.accounting_start_day) {
        return Err(invalid("회계 시작일은 1~31이어야 합니다."));
    }
    let tx = conn.transaction()?;
    for table in [
        "category_notes",
        "fixed_expense_amounts",
        "fixed_expense_items",
        "no_expense_days",
        "expenses",
        "categories",
    ] {
        tx.execute(&format!("DELETE FROM {table}"), [])?;
    }

    let mut map: HashMap<i64, i64> = HashMap::new();
    for c in &p.categories {
        let created = categories::create(&tx, &c.name, &c.color)?;
        if map.insert(c.source_id, created.id).is_some() {
            return Err(invalid("카테고리 ID가 중복되었습니다."));
        }
    }

    let now = now_kst_iso();
    for e in &p.expenses {
        validate_date(&e.date)?;
        let description = clean_description(&e.description)?;
        validate_amount(e.amount)?;
        let category_id = *map
            .get(&e.source_category_id)
            .ok_or_else(missing_category)?;
        tx.execute(
            "INSERT INTO expenses (id, date, description, amount, category_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
            params![uuid::Uuid::new_v4().to_string(), e.date, description, e.amount, category_id, now],
        )?;
    }

    let mut days = 0;
    for d in &p.no_expense_days {
        validate_date(d)?;
        let has: i64 = tx.query_row("SELECT count(*) FROM expenses WHERE date = ?1", [d], |r| {
            r.get(0)
        })?;
        if has > 0 {
            continue;
        }
        days += tx.execute(
            "INSERT OR IGNORE INTO no_expense_days (date, created_at) VALUES (?1, ?2)",
            params![d, now],
        )? as i64;
    }

    let mut items = Vec::new();
    let mut amounts = Vec::new();
    for it in &p.fixed_items {
        let id = uuid::Uuid::new_v4().to_string();
        items.push(FixedItem {
            id: id.clone(),
            name: it.name.clone(),
            sort_order: it.sort_order,
        });
        for a in &it.amounts {
            amounts.push(FixedAmount {
                item_id: id.clone(),
                month: a.month.clone(),
                amount: a.amount,
            });
        }
    }
    let items = validate_fixed(&items, &amounts)?;
    for it in &items {
        tx.execute(
            "INSERT INTO fixed_expense_items (id, name, sort_order, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![it.id, it.name, it.sort_order, now],
        )?;
    }
    for a in &amounts {
        tx.execute(
            "INSERT INTO fixed_expense_amounts (item_id, month, amount) VALUES (?1, ?2, ?3)",
            params![a.item_id, a.month, a.amount],
        )?;
    }

    let mut note_count = 0;
    for n in &p.notes {
        validate_month(&n.month)?;
        let category_id = *map
            .get(&n.source_category_id)
            .ok_or_else(missing_category)?;
        let note = n.note.trim();
        if note.is_empty() {
            continue;
        }
        let exists: i64 = tx.query_row(
            "SELECT count(*) FROM category_notes WHERE month = ?1 AND category_id = ?2",
            params![n.month, category_id],
            |r| r.get(0),
        )?;
        if exists > 0 {
            return Err(invalid("같은 월·카테고리의 메모가 중복되었습니다."));
        }
        tx.execute(
            "INSERT INTO category_notes (month, category_id, note, updated_at) VALUES (?1, ?2, ?3, ?4)",
            params![n.month, category_id, note, now],
        )?;
        note_count += 1;
    }

    settings::set(
        &tx,
        "accounting_start_day",
        &p.accounting_start_day.to_string(),
    )?;
    tx.commit()?;
    Ok(ImportResult {
        categories: p.categories.len() as i64,
        expenses: p.expenses.len() as i64,
        no_expense_days: days,
        fixed_items: items.len() as i64,
        notes: note_count,
    })
}

pub fn export_json(conn: &Connection) -> AppResult<String> {
    let mut stmt = conn.prepare(
        "SELECT id, date, description, amount, category_id FROM expenses ORDER BY date, created_at, id",
    )?;
    let expenses = stmt
        .query_map([], |r| {
            Ok(Expense {
                id: r.get(0)?,
                date: r.get(1)?,
                description: r.get(2)?,
                amount: r.get(3)?,
                category_id: r.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut stmt = conn.prepare("SELECT date FROM no_expense_days ORDER BY date")?;
    let days = stmt
        .query_map([], |r| r.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    let mut stmt = conn.prepare(
        "SELECT month, category_id, note FROM category_notes ORDER BY month, category_id",
    )?;
    let notes = stmt
        .query_map([], |r| {
            Ok(CategoryNote {
                month: r.get(0)?,
                category_id: r.get(1)?,
                note: r.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let fixed = fixed::load(conn)?;
    let doc = serde_json::json!({
        "formatVersion": 1,
        "exportedAt": now_kst_iso(),
        "settings": settings::load(conn)?,
        "categories": categories::list(conn)?,
        "expenses": expenses,
        "noExpenseDays": days,
        "fixedItems": fixed.items,
        "fixedAmounts": fixed.amounts,
        "notes": notes,
    });
    serde_json::to_string_pretty(&doc).map_err(|e| AppError::Io(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_util::test_db;
    use crate::models::*;
    use crate::repo::{categories, expenses, fixed, notes, settings};

    fn payload() -> ImportPayload {
        ImportPayload {
            categories: vec![
                ImportCategory {
                    source_id: 7,
                    name: "식비".into(),
                    color: "#aa0000".into(),
                },
                ImportCategory {
                    source_id: 9,
                    name: "교통".into(),
                    color: "#00aa00".into(),
                },
            ],
            expenses: vec![
                ImportExpense {
                    date: "2026-11-01".into(),
                    description: " 점심 ".into(),
                    amount: 9000,
                    source_category_id: 9,
                },
                ImportExpense {
                    date: "2026-11-02".into(),
                    description: "버스".into(),
                    amount: 1500,
                    source_category_id: 7,
                },
            ],
            no_expense_days: vec!["2026-11-03".into(), "2026-11-01".into()],
            fixed_items: vec![ImportFixedItem {
                name: "월세".into(),
                sort_order: 1,
                amounts: vec![ImportFixedAmount {
                    month: "2026-11".into(),
                    amount: 500000,
                }],
            }],
            notes: vec![
                ImportNote {
                    month: "2026-11".into(),
                    source_category_id: 7,
                    note: " 메모 ".into(),
                },
                ImportNote {
                    month: "2026-11".into(),
                    source_category_id: 9,
                    note: "  ".into(),
                },
            ],
            accounting_start_day: 10,
        }
    }

    fn seed_old(conn: &mut Connection) -> i64 {
        let c = categories::create(conn, "옛카테고리", "#112233").unwrap();
        expenses::add(
            conn,
            NewExpense {
                date: "2026-10-01".into(),
                description: "old".into(),
                amount: 1,
                category_id: c.id,
            },
        )
        .unwrap();
        notes::save(conn, "2026-10", c.id, "old note").unwrap();
        crate::repo::days::set_no_expense(conn, "2026-10-05", true).unwrap();
        fixed::save(
            conn,
            vec![FixedItem {
                id: "old-item".into(),
                name: "옛고정".into(),
                sort_order: 1,
            }],
            vec![FixedAmount {
                item_id: "old-item".into(),
                month: "2026-10".into(),
                amount: 5,
            }],
        )
        .unwrap();
        settings::set(conn, "theme", "mono").unwrap();
        c.id
    }

    fn count(conn: &Connection, table: &str) -> i64 {
        conn.query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn import_maps_ids_and_replaces_everything() {
        let (_d, mut conn) = test_db();
        let old = seed_old(&mut conn);
        let res = import_replace_all(&mut conn, payload()).unwrap();
        assert_eq!(
            res,
            ImportResult {
                categories: 2,
                expenses: 2,
                no_expense_days: 1,
                fixed_items: 1,
                notes: 1
            }
        );
        let cats = categories::list(&conn).unwrap();
        assert_eq!(cats.len(), 2);
        assert!(cats.iter().all(|c| c.id != old && c.name != "옛카테고리"));
        let food = cats.iter().find(|c| c.name == "식비").unwrap();
        let transit = cats.iter().find(|c| c.name == "교통").unwrap();
        assert_eq!(food.color, "#AA0000");
        let ex = expenses::list_range(&conn, "2026-11-01", "2026-11-30").unwrap();
        assert_eq!(ex.len(), 2);
        let lunch = ex.iter().find(|e| e.description == "점심").unwrap();
        assert_eq!(lunch.category_id, transit.id);
        assert_eq!(
            ex.iter()
                .find(|e| e.description == "버스")
                .unwrap()
                .category_id,
            food.id
        );
        assert_ne!(ex[0].id, ex[1].id);
        assert_eq!(count(&conn, "expenses"), 2, "old expense gone");
        assert_eq!(
            crate::repo::days::list_no_expense(&conn, "2026-01-01", "2026-12-31").unwrap(),
            vec!["2026-11-03".to_string()]
        );
        let f = fixed::load(&conn).unwrap();
        assert_eq!(f.items.len(), 1);
        assert_eq!(f.items[0].name, "월세");
        assert_eq!(f.amounts.len(), 1);
        assert_eq!(f.amounts[0].item_id, f.items[0].id);
        let n = notes::list_month(&conn, "2026-11").unwrap();
        assert_eq!(
            n,
            vec![CategoryNote {
                month: "2026-11".into(),
                category_id: food.id,
                note: "메모".into()
            }]
        );
        assert_eq!(count(&conn, "category_notes"), 1);
        let s = settings::load(&conn).unwrap();
        assert_eq!(s.accounting_start_day, 10);
        assert_eq!(s.theme, "mono", "other settings kept");
    }

    fn assert_old_intact(conn: &Connection, old: i64) {
        let cats = categories::list(conn).unwrap();
        assert_eq!(cats.len(), 1);
        assert_eq!(cats[0].id, old);
        assert_eq!(count(conn, "expenses"), 1);
        assert_eq!(count(conn, "category_notes"), 1);
        assert_eq!(count(conn, "no_expense_days"), 1);
        assert_eq!(count(conn, "fixed_expense_items"), 1);
        assert_eq!(count(conn, "fixed_expense_amounts"), 1);
        assert_eq!(settings::load(conn).unwrap().accounting_start_day, 25);
    }

    #[test]
    fn import_failure_rolls_back() {
        let (_d, mut conn) = test_db();
        let old = seed_old(&mut conn);
        let mut p = payload();
        p.categories[1].name = "식비".into();
        let e = import_replace_all(&mut conn, p).unwrap_err();
        assert_eq!(e.code(), "duplicate_name");
        assert_old_intact(&conn, old);
    }

    #[test]
    fn import_late_failures_roll_back_too() {
        let (_d, mut conn) = test_db();
        let old = seed_old(&mut conn);
        let cases: Vec<(&str, Box<dyn Fn(&mut ImportPayload)>)> = vec![
            (
                "unmapped category",
                Box::new(|p| p.expenses[0].source_category_id = 99),
            ),
            ("bad amount", Box::new(|p| p.expenses[1].amount = -1)),
            (
                "bad date",
                Box::new(|p| p.no_expense_days.push("2026-13-01".into())),
            ),
            ("bad start day", Box::new(|p| p.accounting_start_day = 32)),
            (
                "note unmapped",
                Box::new(|p| p.notes[0].source_category_id = 99),
            ),
            (
                "dup note",
                Box::new(|p| {
                    let n = p.notes[0].clone();
                    p.notes.push(n)
                }),
            ),
            ("dup source id", Box::new(|p| p.categories[1].source_id = 7)),
            (
                "dup fixed name",
                Box::new(|p| {
                    let f = p.fixed_items[0].clone();
                    p.fixed_items.push(f)
                }),
            ),
        ];
        for (label, mutate) in cases {
            let mut p = payload();
            mutate(&mut p);
            let e = import_replace_all(&mut conn, p).unwrap_err();
            assert!(
                ["invalid_input", "duplicate_name"].contains(&e.code()),
                "{label}: {}",
                e.code()
            );
            assert_old_intact(&conn, old);
        }
    }

    #[test]
    fn export_contains_all_tables() {
        let (_d, mut conn) = test_db();
        import_replace_all(&mut conn, payload()).unwrap();
        let v: serde_json::Value = serde_json::from_str(&export_json(&conn).unwrap()).unwrap();
        assert_eq!(v["formatVersion"], 1);
        assert!(v["exportedAt"].as_str().unwrap().ends_with("+09:00"));
        assert_eq!(v["settings"]["accountingStartDay"], 10);
        assert_eq!(v["categories"].as_array().unwrap().len(), 2);
        assert_eq!(v["expenses"].as_array().unwrap().len(), 2);
        assert_eq!(v["expenses"][0]["date"], "2026-11-01");
        assert_eq!(v["noExpenseDays"], serde_json::json!(["2026-11-03"]));
        assert_eq!(v["fixedItems"].as_array().unwrap().len(), 1);
        assert_eq!(v["fixedAmounts"][0]["amount"], 500000);
        assert_eq!(v["notes"].as_array().unwrap().len(), 1);
        assert_eq!(v["notes"][0]["note"], "메모");
    }
}
