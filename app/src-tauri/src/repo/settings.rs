use rusqlite::{Connection, OptionalExtension, params};

use crate::error::{AppError, AppResult};
use crate::models::Settings;

const THEMES: [&str; 3] = ["macos", "diary", "mono"];
const APPEARANCES: [&str; 3] = ["system", "light", "dark"];

fn parse_start_day(v: &str) -> Option<i64> {
    v.parse::<i64>().ok().filter(|d| (1..=31).contains(d))
}

fn read(conn: &Connection, key: &str) -> AppResult<Option<String>> {
    Ok(conn
        .query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| {
            r.get(0)
        })
        .optional()?)
}

pub fn load(conn: &Connection) -> AppResult<Settings> {
    let accounting_start_day = read(conn, "accounting_start_day")?
        .and_then(|v| parse_start_day(&v))
        .unwrap_or(25);
    let theme = read(conn, "theme")?
        .filter(|v| THEMES.contains(&v.as_str()))
        .unwrap_or_else(|| "macos".into());
    let appearance = read(conn, "appearance")?
        .filter(|v| APPEARANCES.contains(&v.as_str()))
        .unwrap_or_else(|| "system".into());
    Ok(Settings {
        accounting_start_day,
        theme,
        appearance,
    })
}

pub fn set(conn: &Connection, key: &str, value: &str) -> AppResult<()> {
    let valid = match key {
        "accounting_start_day" => parse_start_day(value).is_some(),
        "theme" => THEMES.contains(&value),
        "appearance" => APPEARANCES.contains(&value),
        _ => {
            return Err(AppError::InvalidInput("알 수 없는 설정입니다.".into()));
        }
    };
    if !valid {
        return Err(AppError::InvalidInput(
            "설정 값이 올바르지 않습니다.".into(),
        ));
    }
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_util::test_db;

    #[test]
    fn settings_defaults_and_validation() {
        let (_d, conn) = test_db();
        let s = load(&conn).unwrap();
        assert_eq!(
            (
                s.accounting_start_day,
                s.theme.as_str(),
                s.appearance.as_str()
            ),
            (25, "macos", "system")
        );
        for (k, v) in [
            ("accounting_start_day", "32"),
            ("accounting_start_day", "0"),
            ("accounting_start_day", "x"),
            ("theme", "ocean"),
            ("appearance", "x"),
            ("foo", "1"),
        ] {
            assert_eq!(
                set(&conn, k, v).unwrap_err().code(),
                "invalid_input",
                "{k}={v}"
            );
        }
        set(&conn, "accounting_start_day", "1").unwrap();
        set(&conn, "theme", "diary").unwrap();
        set(&conn, "theme", "mono").unwrap();
        set(&conn, "appearance", "dark").unwrap();
        let s = load(&conn).unwrap();
        assert_eq!(
            (
                s.accounting_start_day,
                s.theme.as_str(),
                s.appearance.as_str()
            ),
            (1, "mono", "dark")
        );
    }

    #[test]
    fn invalid_stored_value_falls_back_to_default() {
        let (_d, conn) = test_db();
        conn.execute("INSERT INTO settings(key, value) VALUES ('theme','ocean'),('accounting_start_day','99')", []).unwrap();
        let s = load(&conn).unwrap();
        assert_eq!((s.accounting_start_day, s.theme.as_str()), (25, "macos"));
    }
}
