use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

use rusqlite::Connection;
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::models::*;
use crate::repo;
use crate::{backup, db, transfer};

const MAX_TEXT_FILE_BYTES: u64 = 50 * 1024 * 1024;

pub struct AppState {
    pub db: Mutex<Option<Connection>>,
    pub db_path: PathBuf,
    pub backup_dir: PathBuf,
    pub open_error: Mutex<Option<String>>,
    /// 마지막 자동 백업 실패 메시지(성공하면 None). 앱 사용은 막지 않고 화면에 알린다.
    pub backup_error: Mutex<Option<String>>,
}

impl AppState {
    /// Resolves paths, opens the database and runs the daily backup.
    /// An open failure is recorded in `open_error`; the file is never replaced.
    pub fn initialize(data_dir: PathBuf) -> AppState {
        let db_path = data_dir.join("budgetbook.db");
        let backup_dir = data_dir.join("backups");
        let mut backup_error = None;
        let (conn, open_error) = match fs::create_dir_all(&backup_dir) {
            Err(e) => (None, Some(format!("데이터 폴더를 만들 수 없습니다: {e}"))),
            Ok(()) => match db::open(&db_path) {
                Ok(conn) => {
                    if let Err(e) = backup::daily_backup(&conn, &backup_dir) {
                        eprintln!("daily backup failed: {e}");
                        backup_error = Some(e.to_string());
                    }
                    (Some(conn), None)
                }
                Err(e) => (None, Some(e.to_string())),
            },
        };
        AppState {
            db: Mutex::new(conn),
            db_path,
            backup_dir,
            open_error: Mutex::new(open_error),
            backup_error: Mutex::new(backup_error),
        }
    }
}

/// Locks a mutex, recovering from poisoning: the guarded value is still valid.
fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn unavailable() -> AppError {
    AppError::DbUnavailable("데이터베이스를 사용할 수 없습니다.".into())
}

/// Locks `db` once for the whole closure; fails with `db_unavailable` if closed.
fn with_db<T>(state: &AppState, f: impl FnOnce(&mut Connection) -> AppResult<T>) -> AppResult<T> {
    let mut guard = lock(&state.db);
    match guard.as_mut() {
        Some(conn) => f(conn),
        None => Err(unavailable()),
    }
}

fn status(state: &AppState) -> DbStatus {
    let open = lock(&state.db).is_some();
    if open {
        return DbStatus {
            ok: true,
            error: None,
            backup_error: lock(&state.backup_error).clone(),
        };
    }
    let error = lock(&state.open_error).clone();
    DbStatus {
        ok: false,
        error: Some(error.unwrap_or_else(|| "데이터베이스를 열 수 없습니다.".into())),
        backup_error: None,
    }
}

pub fn db_status_impl(state: &AppState) -> DbStatus {
    status(state)
}

pub fn retry_open_impl(state: &AppState) -> AppResult<DbStatus> {
    {
        let mut guard = lock(&state.db);
        if guard.is_none() {
            match db::open(&state.db_path) {
                Ok(conn) => {
                    *lock(&state.backup_error) =
                        match backup::daily_backup(&conn, &state.backup_dir) {
                            Ok(_) => None,
                            Err(e) => {
                                eprintln!("daily backup failed: {e}");
                                Some(e.to_string())
                            }
                        };
                    *guard = Some(conn);
                    *lock(&state.open_error) = None;
                }
                Err(e) => {
                    *lock(&state.open_error) = Some(e.to_string());
                }
            }
        }
    }
    Ok(status(state))
}

/// 앱을 켜 둔 채 날짜가 바뀔 때 호출한다. 그날 백업이 있으면 아무것도 하지 않는다.
pub fn run_daily_backup_impl(state: &AppState) -> AppResult<()> {
    with_db(state, |conn| {
        let result = backup::daily_backup(conn, &state.backup_dir).map(|_| ());
        *lock(&state.backup_error) = result.as_ref().err().map(|e| e.to_string());
        result
    })
}

pub fn bootstrap_impl(state: &AppState) -> AppResult<Bootstrap> {
    with_db(state, |conn| {
        let settings = repo::settings::load(conn)?;
        let categories = repo::categories::list(conn)?;
        let is_fresh = categories.is_empty();
        Ok(Bootstrap {
            settings,
            categories,
            is_fresh,
        })
    })
}

pub fn seed_default_categories_impl(
    state: &AppState,
    categories: Vec<NewCategory>,
) -> AppResult<Vec<Category>> {
    with_db(state, |conn| {
        repo::categories::seed_defaults(conn, &categories)
    })
}

pub fn load_period_impl(
    state: &AppState,
    start: &str,
    end: &str,
    month: &str,
) -> AppResult<PeriodData> {
    with_db(state, |conn| {
        Ok(PeriodData {
            expenses: repo::expenses::list_range(conn, start, end)?,
            no_expense_days: repo::days::list_no_expense(conn, start, end)?,
            notes: repo::notes::list_month(conn, month)?,
            fixed_amounts: repo::fixed::amounts_for_month(conn, month)?,
        })
    })
}

pub fn add_expense_impl(state: &AppState, input: NewExpense) -> AppResult<Expense> {
    with_db(state, |conn| repo::expenses::add(conn, input))
}

pub fn update_expense_impl(state: &AppState, input: ExpenseUpdate) -> AppResult<Expense> {
    with_db(state, |conn| repo::expenses::update(conn, input))
}

pub fn delete_expense_impl(state: &AppState, id: &str) -> AppResult<()> {
    with_db(state, |conn| repo::expenses::delete(conn, id))
}

pub fn set_no_expense_day_impl(state: &AppState, date: &str, on: bool) -> AppResult<()> {
    with_db(state, |conn| repo::days::set_no_expense(conn, date, on))
}

pub fn create_category_impl(state: &AppState, name: &str, color: &str) -> AppResult<Category> {
    with_db(state, |conn| repo::categories::create(conn, name, color))
}

pub fn update_category_impl(
    state: &AppState,
    id: i64,
    name: &str,
    color: &str,
) -> AppResult<Category> {
    with_db(state, |conn| {
        repo::categories::update(conn, id, name, color)
    })
}

pub fn category_usage_impl(state: &AppState, id: i64) -> AppResult<CategoryUsage> {
    with_db(state, |conn| repo::categories::usage(conn, id))
}

pub fn delete_category_impl(state: &AppState, id: i64, move_to: Option<i64>) -> AppResult<()> {
    with_db(state, |conn| repo::categories::delete(conn, id, move_to))
}

pub fn save_note_impl(
    state: &AppState,
    month: &str,
    category_id: i64,
    note: &str,
) -> AppResult<()> {
    with_db(state, |conn| {
        repo::notes::save(conn, month, category_id, note)
    })
}

pub fn load_fixed_impl(state: &AppState) -> AppResult<FixedData> {
    with_db(state, |conn| repo::fixed::load(conn))
}

pub fn save_fixed_impl(
    state: &AppState,
    items: Vec<FixedItem>,
    amounts: Vec<FixedAmount>,
) -> AppResult<()> {
    with_db(state, |conn| repo::fixed::save(conn, items, amounts))
}

pub fn set_setting_impl(state: &AppState, key: &str, value: &str) -> AppResult<()> {
    with_db(state, |conn| repo::settings::set(conn, key, value))
}

pub fn list_backups_impl(state: &AppState) -> AppResult<Vec<BackupInfo>> {
    backup::list(&state.backup_dir)
}

pub fn restore_backup_impl(state: &AppState, file_name: &str) -> AppResult<()> {
    let mut guard = lock(&state.db);
    backup::restore(&mut guard, &state.db_path, &state.backup_dir, file_name)?;
    *lock(&state.open_error) = None;
    Ok(())
}

pub fn read_text_file_impl(path: &str) -> AppResult<String> {
    let meta = fs::metadata(path)?;
    if meta.len() > MAX_TEXT_FILE_BYTES {
        return Err(AppError::InvalidInput(
            "파일이 너무 큽니다(최대 50MB).".into(),
        ));
    }
    Ok(fs::read_to_string(path)?)
}

pub fn import_replace_all_impl(
    state: &AppState,
    payload: ImportPayload,
) -> AppResult<ImportResult> {
    with_db(state, |conn| {
        backup::create_backup(conn, &state.backup_dir)?;
        transfer::import_replace_all(conn, payload)
    })
}

pub fn export_json_impl(state: &AppState, path: &str) -> AppResult<()> {
    let json = with_db(state, |conn| transfer::export_json(conn))?;
    fs::write(path, json)?;
    Ok(())
}

// ---- Tauri command wrappers (forward only) ----

#[tauri::command]
pub fn db_status(state: State<AppState>) -> DbStatus {
    db_status_impl(&state)
}
#[tauri::command]
pub fn retry_open(state: State<AppState>) -> AppResult<DbStatus> {
    retry_open_impl(&state)
}
#[tauri::command]
pub fn run_daily_backup(state: State<AppState>) -> AppResult<()> {
    run_daily_backup_impl(&state)
}

#[tauri::command]
pub fn bootstrap(state: State<AppState>) -> AppResult<Bootstrap> {
    bootstrap_impl(&state)
}
#[tauri::command]
pub fn seed_default_categories(
    state: State<AppState>,
    categories: Vec<NewCategory>,
) -> AppResult<Vec<Category>> {
    seed_default_categories_impl(&state, categories)
}
#[tauri::command]
pub fn load_period(
    state: State<AppState>,
    start: String,
    end: String,
    month: String,
) -> AppResult<PeriodData> {
    load_period_impl(&state, &start, &end, &month)
}
#[tauri::command]
pub fn add_expense(state: State<AppState>, input: NewExpense) -> AppResult<Expense> {
    add_expense_impl(&state, input)
}
#[tauri::command]
pub fn update_expense(state: State<AppState>, input: ExpenseUpdate) -> AppResult<Expense> {
    update_expense_impl(&state, input)
}
#[tauri::command]
pub fn delete_expense(state: State<AppState>, id: String) -> AppResult<()> {
    delete_expense_impl(&state, &id)
}
#[tauri::command]
pub fn set_no_expense_day(state: State<AppState>, date: String, on: bool) -> AppResult<()> {
    set_no_expense_day_impl(&state, &date, on)
}
#[tauri::command]
pub fn create_category(state: State<AppState>, name: String, color: String) -> AppResult<Category> {
    create_category_impl(&state, &name, &color)
}
#[tauri::command]
pub fn update_category(
    state: State<AppState>,
    id: i64,
    name: String,
    color: String,
) -> AppResult<Category> {
    update_category_impl(&state, id, &name, &color)
}
#[tauri::command]
pub fn category_usage(state: State<AppState>, id: i64) -> AppResult<CategoryUsage> {
    category_usage_impl(&state, id)
}
#[tauri::command]
pub fn delete_category(state: State<AppState>, id: i64, move_to: Option<i64>) -> AppResult<()> {
    delete_category_impl(&state, id, move_to)
}
#[tauri::command]
pub fn save_note(
    state: State<AppState>,
    month: String,
    category_id: i64,
    note: String,
) -> AppResult<()> {
    save_note_impl(&state, &month, category_id, &note)
}
#[tauri::command]
pub fn load_fixed(state: State<AppState>) -> AppResult<FixedData> {
    load_fixed_impl(&state)
}
#[tauri::command]
pub fn save_fixed(
    state: State<AppState>,
    items: Vec<FixedItem>,
    amounts: Vec<FixedAmount>,
) -> AppResult<()> {
    save_fixed_impl(&state, items, amounts)
}
#[tauri::command]
pub fn set_setting(state: State<AppState>, key: String, value: String) -> AppResult<()> {
    set_setting_impl(&state, &key, &value)
}
#[tauri::command]
pub fn list_backups(state: State<AppState>) -> AppResult<Vec<BackupInfo>> {
    list_backups_impl(&state)
}
#[tauri::command]
pub fn restore_backup(state: State<AppState>, file_name: String) -> AppResult<()> {
    restore_backup_impl(&state, &file_name)
}
#[tauri::command]
pub fn open_backup_folder(app: tauri::AppHandle, state: State<AppState>) -> AppResult<()> {
    use tauri_plugin_opener::OpenerExt;
    fs::create_dir_all(&state.backup_dir)?;
    app.opener()
        .open_path(state.backup_dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| AppError::Io(e.to_string()))
}
#[tauri::command]
pub fn read_text_file(path: String) -> AppResult<String> {
    read_text_file_impl(&path)
}
#[tauri::command]
pub fn import_replace_all(
    state: State<AppState>,
    payload: ImportPayload,
) -> AppResult<ImportResult> {
    import_replace_all_impl(&state, payload)
}
#[tauri::command]
pub fn export_json(state: State<AppState>, path: String) -> AppResult<()> {
    export_json_impl(&state, &path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn closed_state() -> AppState {
        AppState {
            db: Mutex::new(None),
            db_path: PathBuf::from("none.db"),
            backup_dir: PathBuf::from("none-backups"),
            open_error: Mutex::new(Some("boom".into())),
            backup_error: Mutex::new(None),
        }
    }

    fn open_state() -> (tempfile::TempDir, AppState) {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::initialize(dir.path().to_path_buf());
        (dir, state)
    }

    #[test]
    fn commands_fail_with_db_unavailable_when_closed() {
        let s = closed_state();
        assert_eq!(bootstrap_impl(&s).unwrap_err().code(), "db_unavailable");
        assert_eq!(
            load_period_impl(&s, "2026-10-25", "2026-11-24", "2026-11")
                .unwrap_err()
                .code(),
            "db_unavailable"
        );
        assert_eq!(load_fixed_impl(&s).unwrap_err().code(), "db_unavailable");
        assert_eq!(
            export_json_impl(&s, "x.json").unwrap_err().code(),
            "db_unavailable"
        );
    }

    #[test]
    fn status_reports_open_error_when_closed() {
        let st = db_status_impl(&closed_state());
        assert!(!st.ok);
        assert_eq!(st.error.as_deref(), Some("boom"));
    }

    #[test]
    fn initialize_creates_db_and_backups_and_bootstrap_is_fresh() {
        let (dir, s) = open_state();
        assert!(dir.path().join("budgetbook.db").is_file());
        assert!(dir.path().join("backups").is_dir());
        assert!(db_status_impl(&s).ok);
        assert!(bootstrap_impl(&s).unwrap().is_fresh);
        let cats = seed_default_categories_impl(
            &s,
            vec![NewCategory {
                name: "식비".into(),
                color: "#ff0000".into(),
            }],
        )
        .unwrap();
        assert_eq!(cats.len(), 1);
        assert!(!bootstrap_impl(&s).unwrap().is_fresh);
    }

    #[test]
    fn initialize_with_unopenable_db_keeps_file_and_records_error() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("budgetbook.db");
        let garbage = b"not a database at all, just garbage bytes".to_vec();
        fs::write(&path, &garbage).unwrap();
        let s = AppState::initialize(dir.path().to_path_buf());
        assert!(!db_status_impl(&s).ok);
        assert!(s.open_error.lock().unwrap().is_some());
        assert_eq!(fs::read(&path).unwrap(), garbage);
    }

    #[test]
    fn retry_open_recovers_from_closed_state() {
        let dir = tempfile::tempdir().unwrap();
        let s = AppState::initialize(dir.path().to_path_buf());
        *s.db.lock().unwrap() = None;
        *s.open_error.lock().unwrap() = Some("x".into());
        assert!(retry_open_impl(&s).unwrap().ok);
        assert!(s.open_error.lock().unwrap().is_none());
    }

    fn broken_backup_dir(dir: &std::path::Path) -> PathBuf {
        let blocker = dir.join("blocker");
        fs::write(&blocker, b"file").unwrap();
        blocker.join("backups")
    }

    #[test]
    fn initialize_success_has_no_backup_error() {
        let (_d, s) = open_state();
        assert!(s.backup_error.lock().unwrap().is_none());
        assert_eq!(db_status_impl(&s).backup_error, None);
    }

    #[test]
    fn retry_open_records_backup_error_and_clears_it() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = AppState::initialize(dir.path().to_path_buf());
        let good = s.backup_dir.clone();
        s.backup_dir = broken_backup_dir(dir.path());
        *s.db.lock().unwrap() = None;
        let st = retry_open_impl(&s).unwrap();
        assert!(st.ok);
        assert!(st.backup_error.is_some());
        s.backup_dir = good;
        *s.db.lock().unwrap() = None;
        let st = retry_open_impl(&s).unwrap();
        assert_eq!(st.backup_error, None);
    }

    #[test]
    fn run_daily_backup_records_result() {
        let (d, mut s) = open_state();
        let good = s.backup_dir.clone();
        // 시작 때 이미 오늘 백업이 있으므로 no-op
        let before = backup::list(&good).unwrap().len();
        run_daily_backup_impl(&s).unwrap();
        assert_eq!(backup::list(&good).unwrap().len(), before);
        // 오늘 백업이 없고 폴더가 막혀 있으면 실패를 기록한다
        s.backup_dir = broken_backup_dir(d.path());
        assert!(run_daily_backup_impl(&s).is_err());
        assert!(db_status_impl(&s).backup_error.is_some());
        // 복구되면 성공으로 지워진다
        s.backup_dir = d.path().join("fresh-backups");
        run_daily_backup_impl(&s).unwrap();
        assert_eq!(db_status_impl(&s).backup_error, None);
        assert_eq!(backup::list(&s.backup_dir).unwrap().len(), 1);
    }

    #[test]
    fn run_daily_backup_fails_when_db_closed() {
        assert_eq!(
            run_daily_backup_impl(&closed_state()).unwrap_err().code(),
            "db_unavailable"
        );
    }

    #[test]
    fn read_text_file_reads_and_errors() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a.txt");
        fs::write(&p, "안녕").unwrap();
        assert_eq!(read_text_file_impl(p.to_str().unwrap()).unwrap(), "안녕");
        assert!(read_text_file_impl(dir.path().join("none").to_str().unwrap()).is_err());
    }

    #[test]
    fn export_json_writes_file() {
        let (dir, s) = open_state();
        let out = dir.path().join("out.json");
        export_json_impl(&s, out.to_str().unwrap()).unwrap();
        let text = fs::read_to_string(out).unwrap();
        assert!(serde_json::from_str::<serde_json::Value>(&text).is_ok());
    }

    #[test]
    fn import_creates_backup_first_then_replaces() {
        let (_dir, s) = open_state();
        let payload = ImportPayload {
            categories: vec![ImportCategory {
                source_id: 1,
                name: "식비".into(),
                color: "#112233".into(),
            }],
            expenses: vec![ImportExpense {
                date: "2026-11-01".into(),
                description: "점심".into(),
                amount: 5000,
                source_category_id: 1,
            }],
            no_expense_days: vec![],
            fixed_items: vec![],
            notes: vec![],
            accounting_start_day: 25,
        };
        let r = import_replace_all_impl(&s, payload).unwrap();
        assert_eq!(r.expenses, 1);
        assert!(!backup::list(&s.backup_dir).unwrap().is_empty());
    }

    fn expense_count(s: &AppState) -> i64 {
        lock(&s.db)
            .as_ref()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM expenses", [], |r| r.get(0))
            .unwrap()
    }

    fn new_expense(cat: i64, desc: &str) -> NewExpense {
        NewExpense {
            date: "2026-11-01".into(),
            description: desc.into(),
            amount: 100,
            category_id: cat,
        }
    }

    fn seeded_state() -> (tempfile::TempDir, AppState, i64) {
        let (dir, s) = open_state();
        let cats = seed_default_categories_impl(
            &s,
            vec![NewCategory {
                name: "식비".into(),
                color: "#ff0000".into(),
            }],
        )
        .unwrap();
        let cat = cats[0].id;
        add_expense_impl(&s, new_expense(cat, "기존")).unwrap();
        (dir, s, cat)
    }

    fn sample_payload(n: usize) -> ImportPayload {
        ImportPayload {
            categories: vec![ImportCategory {
                source_id: 1,
                name: "새".into(),
                color: "#112233".into(),
            }],
            expenses: (0..n)
                .map(|i| ImportExpense {
                    date: "2026-11-02".into(),
                    description: format!("e{i}"),
                    amount: 1,
                    source_category_id: 1,
                })
                .collect(),
            no_expense_days: vec![],
            fixed_items: vec![],
            notes: vec![],
            accounting_start_day: 25,
        }
    }

    #[test]
    fn list_backups_works_with_db_closed() {
        let (_dir, s, _) = seeded_state();
        backup::create_backup(lock(&s.db).as_ref().unwrap(), &s.backup_dir).unwrap();
        *lock(&s.db) = None;
        *lock(&s.open_error) = Some("boom".into());
        assert!(!list_backups_impl(&s).unwrap().is_empty());
    }

    #[test]
    fn import_fails_and_keeps_data_when_backup_fails() {
        let (dir, mut s, _) = seeded_state();
        let bogus = dir.path().join("not-a-dir");
        fs::write(&bogus, b"x").unwrap();
        s.backup_dir = bogus;
        assert!(import_replace_all_impl(&s, sample_payload(3)).is_err());
        assert_eq!(expense_count(&s), 1);
    }

    #[test]
    fn import_backup_holds_pre_import_data() {
        let (_dir, s, _) = seeded_state();
        import_replace_all_impl(&s, sample_payload(3)).unwrap();
        assert_eq!(expense_count(&s), 3);
        let list = backup::list(&s.backup_dir).unwrap();
        assert!(list.iter().any(|b| b.expense_count == 1));
        assert!(list.iter().all(|b| b.expense_count != 3));
    }

    #[test]
    fn restore_restores_data_and_clears_open_error_from_closed() {
        let (_dir, s, cat) = seeded_state();
        let p = backup::create_backup(lock(&s.db).as_ref().unwrap(), &s.backup_dir).unwrap();
        let name = p.file_name().unwrap().to_string_lossy().to_string();
        add_expense_impl(&s, new_expense(cat, "추가")).unwrap();
        assert_eq!(expense_count(&s), 2);
        *lock(&s.db) = None;
        *lock(&s.open_error) = Some("boom".into());
        restore_backup_impl(&s, &name).unwrap();
        assert!(lock(&s.open_error).is_none());
        assert_eq!(expense_count(&s), 1);
    }

    #[test]
    fn read_text_file_rejects_over_50mb() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("big.txt");
        let f = fs::File::create(&p).unwrap();
        f.set_len(MAX_TEXT_FILE_BYTES + 1).unwrap();
        drop(f);
        assert_eq!(
            read_text_file_impl(p.to_str().unwrap()).unwrap_err().code(),
            "invalid_input"
        );
    }

    #[test]
    fn retry_open_is_noop_when_already_open() {
        let (_dir, s, _) = seeded_state();
        *lock(&s.open_error) = Some("stale".into());
        assert!(retry_open_impl(&s).unwrap().ok);
        assert_eq!(expense_count(&s), 1);
        assert_eq!(lock(&s.open_error).as_deref(), Some("stale"));
    }

    #[test]
    fn poisoned_locks_are_recovered() {
        let (_dir, s, _) = seeded_state();
        let s = std::sync::Arc::new(s);
        let s2 = s.clone();
        let _ = std::thread::spawn(move || {
            let _g = s2.db.lock().unwrap();
            let _h = s2.open_error.lock().unwrap();
            panic!("poison");
        })
        .join();
        assert!(db_status_impl(&s).ok);
        assert!(bootstrap_impl(&s).is_ok());
    }
}
