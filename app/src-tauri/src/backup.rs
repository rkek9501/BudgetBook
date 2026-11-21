use std::path::{Path, PathBuf};

use chrono::{FixedOffset, Utc};
use rusqlite::{Connection, OpenFlags};

use crate::db;
use crate::error::{AppError, AppResult};
use crate::models::BackupInfo;
use crate::time::today_kst_compact;

const PREFIX: &str = "budgetbook-";
const SUFFIX: &str = ".db";

/// Parses `budgetbook-YYYYMMDD-HHMMSS(-N)?.db` into (YYYYMMDD, HHMMSS).
pub fn parse_name(name: &str) -> Option<(String, String)> {
    let mid = name.strip_prefix(PREFIX)?.strip_suffix(SUFFIX)?;
    let mut parts = mid.split('-');
    let date = parts.next()?;
    let time = parts.next()?;
    let digits = |s: &str, n: usize| s.len() == n && s.bytes().all(|b| b.is_ascii_digit());
    if !digits(date, 8) || !digits(time, 6) {
        return None;
    }
    if let Some(n) = parts.next() {
        if n.is_empty() || !n.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
    }
    if parts.next().is_some() {
        return None;
    }
    Some((date.to_string(), time.to_string()))
}

fn now_stamp() -> String {
    let kst = FixedOffset::east_opt(9 * 3600).expect("valid offset");
    Utc::now()
        .with_timezone(&kst)
        .format("%Y%m%d-%H%M%S")
        .to_string()
}

/// Backup file names in `dir`, newest first. Missing dir -> empty.
fn backup_names(dir: &Path) -> AppResult<Vec<String>> {
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut names = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_file() && !entry.file_type()?.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if parse_name(&name).is_some() {
            names.push(name);
        }
    }
    names.sort_by(|a, b| b.cmp(a));
    Ok(names)
}

pub fn create_backup(conn: &Connection, dir: &Path) -> AppResult<PathBuf> {
    std::fs::create_dir_all(dir)?;
    let stamp = now_stamp();
    let mut path = dir.join(format!("{PREFIX}{stamp}{SUFFIX}"));
    let mut n = 0;
    while path.exists() {
        n += 1;
        path = dir.join(format!("{PREFIX}{stamp}-{n}{SUFFIX}"));
    }
    let target = path
        .to_str()
        .ok_or_else(|| AppError::Io("백업 경로를 사용할 수 없습니다.".into()))?;
    if let Err(e) = conn.execute("VACUUM INTO ?1", [target]) {
        let _ = std::fs::remove_file(&path);
        return Err(e.into());
    }
    Ok(path)
}

pub fn daily_backup(conn: &Connection, dir: &Path) -> AppResult<Option<PathBuf>> {
    let today = today_kst_compact();
    let done = backup_names(dir)?
        .iter()
        .any(|n| parse_name(n).is_some_and(|(d, _)| d == today));
    if done {
        return Ok(None);
    }
    let path = create_backup(conn, dir)?;
    prune(dir, 14)?;
    Ok(Some(path))
}

pub fn prune(dir: &Path, keep: usize) -> AppResult<()> {
    for name in backup_names(dir)?.into_iter().skip(keep) {
        let p = dir.join(&name);
        if p.is_dir() {
            continue;
        }
        std::fs::remove_file(p)?;
    }
    Ok(())
}

fn count_expenses(path: &Path) -> Option<i64> {
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .ok()?;
    conn.query_row("SELECT count(*) FROM expenses", [], |r| r.get(0))
        .ok()
}

pub fn list(dir: &Path) -> AppResult<Vec<BackupInfo>> {
    let mut out = Vec::new();
    for name in backup_names(dir)? {
        let (d, t) = parse_name(&name).expect("filtered by backup_names");
        out.push(BackupInfo {
            created_at: format!(
                "{}-{}-{} {}:{}",
                &d[0..4],
                &d[4..6],
                &d[6..8],
                &t[0..2],
                &t[2..4]
            ),
            expense_count: count_expenses(&dir.join(&name)).unwrap_or(-1),
            file_name: name,
        });
    }
    Ok(out)
}

fn damaged() -> AppError {
    AppError::InvalidInput("백업 파일이 손상되어 복원할 수 없습니다.".into())
}

/// The file must open read-only, have a known schema version and a readable expenses table.
fn verify_usable(path: &Path) -> AppResult<()> {
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|_| damaged())?;
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(|_| damaged())?;
    if !(1..=db::LATEST_VERSION).contains(&version) {
        return Err(damaged());
    }
    conn.query_row("SELECT count(*) FROM expenses", [], |r| r.get::<_, i64>(0))
        .map_err(|_| damaged())?;
    Ok(())
}

/// Byte-for-byte copy of an unopenable live DB (and its -wal/-shm) next to the backups.
fn preserve_unopenable(db_path: &Path, dir: &Path) -> AppResult<()> {
    if !db_path.exists() {
        return Ok(());
    }
    std::fs::create_dir_all(dir)?;
    let file = db_path
        .file_name()
        .ok_or_else(|| AppError::Io("DB 경로가 올바르지 않습니다.".into()))?
        .to_string_lossy()
        .into_owned();
    let stamp = now_stamp();
    let mut base = format!("unopenable-{stamp}");
    let mut n = 0;
    while dir.join(format!("{base}.db")).exists() {
        n += 1;
        base = format!("unopenable-{stamp}-{n}");
    }
    for (suffix, out_suffix) in [("", ""), ("-wal", "-wal"), ("-shm", "-shm")] {
        let src = db_path.with_file_name(format!("{file}{suffix}"));
        if src.exists() {
            std::fs::copy(&src, dir.join(format!("{base}.db{out_suffix}")))?;
        }
    }
    Ok(())
}

fn restore_swap(db_path: &Path, backup: &Path) -> AppResult<()> {
    let file = db_path
        .file_name()
        .ok_or_else(|| AppError::Io("DB 경로가 올바르지 않습니다.".into()))?
        .to_string_lossy()
        .into_owned();
    let tmp = db_path.with_file_name(format!("{file}.restore-tmp"));
    if let Err(e) = std::fs::copy(backup, &tmp) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.into());
    }
    if let Err(e) = verify_usable(&tmp) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e);
    }
    for suffix in ["-wal", "-shm"] {
        let side = db_path.with_file_name(format!("{file}{suffix}"));
        if side.exists() {
            if let Err(e) = std::fs::remove_file(&side) {
                let _ = std::fs::remove_file(&tmp);
                return Err(e.into());
            }
        }
    }
    if let Err(e) = std::fs::rename(&tmp, db_path) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e.into());
    }
    Ok(())
}

pub fn restore(
    slot: &mut Option<Connection>,
    db_path: &Path,
    dir: &Path,
    file_name: &str,
) -> AppResult<()> {
    if file_name.contains(['/', '\\'])
        || file_name.contains("..")
        || parse_name(file_name).is_none()
    {
        return Err(AppError::InvalidInput(
            "올바른 백업 파일 이름이 아닙니다.".into(),
        ));
    }
    let backup = dir.join(file_name);
    if !backup.is_file() {
        return Err(AppError::NotFound("백업 파일을 찾을 수 없습니다.".into()));
    }
    if let Some(conn) = slot.as_ref() {
        // VACUUM INTO가 실패하면(일부 페이지 손상 등) 연결이 열린 채로 바이트 복사로 보관한다.
        // 먼저 닫으면 WAL이 원본에 합쳐져 원본이 바뀐다.
        if create_backup(conn, dir).is_err() {
            preserve_unopenable(db_path, dir)?;
        }
    } else {
        preserve_unopenable(db_path, dir)?;
    }
    drop(slot.take());
    if let Err(e) = restore_swap(db_path, &backup) {
        // keep the app working on the untouched original
        if let Ok(conn) = db::open(db_path) {
            *slot = Some(conn);
        }
        return Err(e);
    }
    *slot = Some(db::open(db_path)?);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_util::test_db;
    use crate::models::NewExpense;
    use crate::repo::{categories, expenses};

    fn add_exp(conn: &mut Connection, cat: i64, desc: &str) {
        expenses::add(
            conn,
            NewExpense {
                date: "2026-11-01".into(),
                description: desc.into(),
                amount: 100,
                category_id: cat,
            },
        )
        .unwrap();
    }

    fn count(conn: &Connection) -> i64 {
        conn.query_row("SELECT count(*) FROM expenses", [], |r| r.get(0))
            .unwrap()
    }

    fn code<T: std::fmt::Debug>(r: AppResult<T>) -> &'static str {
        r.unwrap_err().code()
    }

    fn names(dir: &Path) -> Vec<String> {
        let mut v: Vec<String> = std::fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        v.sort();
        v
    }

    #[test]
    fn daily_backup_once_per_day_and_prune_keeps_14() {
        let (d, conn) = test_db();
        let dir = d.path().join("backups");
        std::fs::create_dir_all(&dir).unwrap();
        for i in 0..20 {
            std::fs::write(
                dir.join(format!("budgetbook-202001{:02}-010101.db", i + 1)),
                b"x",
            )
            .unwrap();
        }
        std::fs::write(dir.join("notes.txt"), b"keep me").unwrap();
        let first = daily_backup(&conn, &dir).unwrap().expect("created");
        let all = names(&dir);
        let backups: Vec<&String> = all.iter().filter(|n| parse_name(n).is_some()).collect();
        assert_eq!(backups.len(), 14);
        assert!(all.contains(&"notes.txt".to_string()));
        // newest 14: today's + 13 newest dummies (0108..0120)
        assert!(backups.contains(&&first.file_name().unwrap().to_string_lossy().into_owned()));
        assert!(!all.contains(&"budgetbook-20200107-010101.db".to_string()));
        assert!(all.contains(&"budgetbook-20200108-010101.db".to_string()));
        // second call the same day: skipped
        assert!(daily_backup(&conn, &dir).unwrap().is_none());
        assert_eq!(names(&dir).len(), 15);
    }

    #[test]
    fn same_second_backups_get_suffix() {
        let (d, conn) = test_db();
        let dir = d.path().join("b");
        let a = create_backup(&conn, &dir).unwrap();
        let b = create_backup(&conn, &dir).unwrap();
        let c = create_backup(&conn, &dir).unwrap();
        assert_ne!(a, b);
        assert_ne!(b, c);
        assert!(a.exists() && b.exists() && c.exists());
        assert_eq!(list(&dir).unwrap().len(), 3);
    }

    #[test]
    fn list_newest_first_with_counts() {
        let (d, mut conn) = test_db();
        let dir = d.path().join("b");
        let cat = categories::create(&conn, "식비", "#112233").unwrap();
        add_exp(&mut conn, cat.id, "a");
        let p = create_backup(&conn, &dir).unwrap();
        std::fs::write(dir.join("budgetbook-20200101-101500.db"), b"garbage").unwrap();
        std::fs::write(dir.join("other.db"), b"x").unwrap();
        let l = list(&dir).unwrap();
        assert_eq!(l.len(), 2);
        assert_eq!(l[0].file_name, p.file_name().unwrap().to_string_lossy());
        assert_eq!(l[0].expense_count, 1);
        assert_eq!(l[1].file_name, "budgetbook-20200101-101500.db");
        assert_eq!(l[1].created_at, "2020-01-01 10:15");
        assert_eq!(l[1].expense_count, -1);
        assert!(list(&d.path().join("missing")).unwrap().is_empty());
    }

    #[test]
    fn restore_replaces_data_and_backs_up_current() {
        let (d, mut conn) = test_db();
        let db_path = d.path().join("test.db");
        let dir = d.path().join("backups");
        let cat = categories::create(&conn, "식비", "#112233").unwrap();
        add_exp(&mut conn, cat.id, "before");
        let bk = create_backup(&conn, &dir).unwrap();
        add_exp(&mut conn, cat.id, "after");
        assert_eq!(count(&conn), 2);
        let name = bk.file_name().unwrap().to_string_lossy().into_owned();
        let mut slot = Some(conn);
        restore(&mut slot, &db_path, &dir, &name).unwrap();
        assert_eq!(count(slot.as_ref().unwrap()), 1);
        let l = list(&dir).unwrap();
        assert_eq!(l.len(), 2);
        assert!(
            l.iter().any(|b| b.expense_count == 2),
            "pre-restore state kept as backup"
        );
        assert!(!d.path().join("test.db.restore-tmp").exists());
        // FK pragma active on the reopened connection
        let fk: i64 = slot
            .as_ref()
            .unwrap()
            .query_row("PRAGMA foreign_keys", [], |r| r.get(0))
            .unwrap();
        assert_eq!(fk, 1);
    }

    #[test]
    fn restore_rejects_path_traversal() {
        let (d, conn) = test_db();
        let db_path = d.path().join("test.db");
        let dir = d.path().join("backups");
        let mut slot = Some(conn);
        for bad in [
            "../x.db",
            r"..\x.db",
            "a/budgetbook-20200101-010101.db",
            "x.db",
            "budgetbook-2020-1.db",
            "",
        ] {
            assert_eq!(
                code(restore(&mut slot, &db_path, &dir, bad)),
                "invalid_input",
                "{bad}"
            );
        }
        assert!(slot.is_some());
    }

    #[test]
    fn restore_missing_backup_leaves_live_db_unchanged() {
        let (d, mut conn) = test_db();
        let db_path = d.path().join("test.db");
        let dir = d.path().join("backups");
        let cat = categories::create(&conn, "식비", "#112233").unwrap();
        add_exp(&mut conn, cat.id, "keep");
        let mut slot = Some(conn);
        let r = restore(&mut slot, &db_path, &dir, "budgetbook-20200101-010101.db");
        assert_eq!(code(r), "not_found");
        assert_eq!(count(slot.as_ref().unwrap()), 1);
        assert!(!dir.exists() || list(&dir).unwrap().is_empty());
    }

    #[test]
    fn restore_copy_failure_reopens_original() {
        let (d, mut conn) = test_db();
        let db_path = d.path().join("test.db");
        let dir = d.path().join("backups");
        let cat = categories::create(&conn, "식비", "#112233").unwrap();
        add_exp(&mut conn, cat.id, "keep");
        let bk = create_backup(&conn, &dir).unwrap();
        let name = bk.file_name().unwrap().to_string_lossy().into_owned();
        // a directory at the temp path makes fs::copy fail for real
        std::fs::create_dir_all(d.path().join("test.db.restore-tmp")).unwrap();
        let mut slot = Some(conn);
        let e = restore(&mut slot, &db_path, &dir, &name).unwrap_err();
        assert_eq!(e.code(), "io");
        assert_eq!(count(slot.as_ref().expect("reopened")), 1);
    }

    fn assert_rejected_and_intact(bad: &str, bytes: &[u8]) {
        let (d, mut conn) = test_db();
        let db_path = d.path().join("test.db");
        let dir = d.path().join("backups");
        let cat = categories::create(&conn, "식비", "#112233").unwrap();
        add_exp(&mut conn, cat.id, "keep");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(bad), bytes).unwrap();
        let mut slot = Some(conn);
        let e = restore(&mut slot, &db_path, &dir, bad).unwrap_err();
        assert_eq!(e.code(), "invalid_input");
        assert_eq!(count(slot.as_ref().expect("slot kept")), 1);
        assert!(!d.path().join("test.db.restore-tmp").exists());
    }

    #[test]
    fn restore_rejects_corrupt_backup() {
        assert_rejected_and_intact("budgetbook-20200101-010101.db", &[7u8; 5000]);
    }

    #[test]
    fn restore_rejects_empty_backup() {
        assert_rejected_and_intact("budgetbook-20200101-010102.db", b"");
    }

    #[test]
    fn restore_removes_leftover_wal_and_shm() {
        let (d, mut conn) = test_db();
        let db_path = d.path().join("test.db");
        let dir = d.path().join("backups");
        let cat = categories::create(&conn, "식비", "#112233").unwrap();
        add_exp(&mut conn, cat.id, "before");
        let bk = create_backup(&conn, &dir).unwrap();

        let mut slot = Some(conn);
        // leftovers appear after the connection is dropped inside restore: simulate by
        // placing stale files when the slot is already empty
        slot.take();
        std::fs::write(d.path().join("test.db-wal"), b"stale").unwrap();
        std::fs::write(d.path().join("test.db-shm"), b"stale").unwrap();
        restore_swap(&db_path, &bk).unwrap();
        assert!(!d.path().join("test.db-wal").exists());
        assert!(!d.path().join("test.db-shm").exists());
        let conn = db::open(&db_path).unwrap();
        assert_eq!(count(&conn), 1);
    }

    #[test]
    fn restore_from_corrupted_open_connection_preserves_original() {
        let d = tempfile::tempdir().unwrap();
        let (_gd, good) = test_db();
        let mut good = good;
        let cat = categories::create(&good, "식비", "#112233").unwrap();
        add_exp(&mut good, cat.id, "good");
        let dir = d.path().join("backups");
        let bk = create_backup(&good, &dir).unwrap();
        let name = bk.file_name().unwrap().to_string_lossy().into_owned();
        let db_path = d.path().join("live.db");
        db::tests::make_corrupt_page_db(&db_path);
        let original = std::fs::read(&db_path).unwrap();
        // db::open를 거치지 않고 손상된 DB를 연결 슬롯에 넣는다
        let conn = Connection::open(&db_path).unwrap();
        assert!(create_backup(&conn, &dir.join("x")).is_err());
        let mut slot = Some(conn);
        restore(&mut slot, &db_path, &dir, &name).unwrap();
        assert_eq!(count(slot.as_ref().unwrap()), 1);
        let copies: Vec<String> = names(&dir)
            .into_iter()
            .filter(|n| n.starts_with("unopenable-") && n.ends_with(".db"))
            .collect();
        assert_eq!(copies.len(), 1, "{copies:?}");
        assert_eq!(std::fs::read(dir.join(&copies[0])).unwrap(), original);
    }

    #[test]
    fn preserve_unopenable_same_second_gets_suffix() {
        let d = tempfile::tempdir().unwrap();
        let db_path = d.path().join("x.db");
        let dir = d.path().join("backups");
        std::fs::write(&db_path, b"first").unwrap();
        std::fs::write(d.path().join("x.db-wal"), b"wal1").unwrap();
        preserve_unopenable(&db_path, &dir).unwrap();
        std::fs::write(&db_path, b"second").unwrap();
        std::fs::write(d.path().join("x.db-wal"), b"wal2").unwrap();
        preserve_unopenable(&db_path, &dir).unwrap();
        let mut mains: Vec<Vec<u8>> = names(&dir)
            .into_iter()
            .filter(|n| n.ends_with(".db"))
            .map(|n| std::fs::read(dir.join(n)).unwrap())
            .collect();
        mains.sort();
        assert_eq!(mains, vec![b"first".to_vec(), b"second".to_vec()]);
        let mut wals: Vec<Vec<u8>> = names(&dir)
            .into_iter()
            .filter(|n| n.ends_with("-wal"))
            .map(|n| std::fs::read(dir.join(n)).unwrap())
            .collect();
        wals.sort();
        assert_eq!(wals, vec![b"wal1".to_vec(), b"wal2".to_vec()]);
    }

    #[test]
    fn restore_from_error_screen_preserves_unopenable_files() {
        let (d, mut conn) = test_db();
        let dir = d.path().join("backups");
        let cat = categories::create(&conn, "식비", "#112233").unwrap();
        add_exp(&mut conn, cat.id, "good");
        let bk = create_backup(&conn, &dir).unwrap();
        let name = bk.file_name().unwrap().to_string_lossy().into_owned();
        drop(conn);
        let db_path = d.path().join("broken.db");
        std::fs::write(&db_path, b"garbage-main").unwrap();
        std::fs::write(d.path().join("broken.db-wal"), b"garbage-wal").unwrap();
        let mut slot: Option<Connection> = None;
        restore(&mut slot, &db_path, &dir, &name).unwrap();
        assert_eq!(count(slot.as_ref().unwrap()), 1);
        let copies: Vec<String> = names(&dir)
            .into_iter()
            .filter(|n| n.starts_with("unopenable-"))
            .collect();
        assert_eq!(copies.len(), 2, "{copies:?}");
        for c in &copies {
            let bytes = std::fs::read(dir.join(c)).unwrap();
            if c.ends_with("-wal") {
                assert_eq!(bytes, b"garbage-wal");
            } else {
                assert!(c.ends_with(".db"));
                assert_eq!(bytes, b"garbage-main");
            }
        }
        assert_eq!(list(&dir).unwrap().len(), 1, "unopenable copies not listed");
        prune(&dir, 0).unwrap();
        assert!(names(&dir).iter().any(|n| n.starts_with("unopenable-")));
    }
}
