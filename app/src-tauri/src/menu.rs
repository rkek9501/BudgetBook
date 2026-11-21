use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Wry};

/// Builds the native menu. Custom items emit the `menu` event with their id.
/// prev-month / next-month deliberately have no native accelerator: the front
/// end handles Cmd+Left/Right so caret movement in text inputs keeps working.
pub fn build(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let item =
        |id: &str, label: &str, accel: Option<&str>| MenuItem::with_id(app, id, label, true, accel);

    let app_menu = Submenu::with_items(
        app,
        "가계부",
        true,
        &[
            &PredefinedMenuItem::about(app, Some("가계부 정보"), None)?,
            &item("settings", "설정…", Some("CmdOrCtrl+,"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, Some("가계부 가리기"))?,
            &PredefinedMenuItem::hide_others(app, Some("다른 앱 가리기"))?,
            &PredefinedMenuItem::show_all(app, Some("모두 보기"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some("가계부 종료"))?,
        ],
    )?;
    let file_menu = Submenu::with_items(
        app,
        "파일",
        true,
        &[
            &item("import", "Windows 데이터 가져오기…", None)?,
            &item("export", "JSON으로 내보내기…", None)?,
            &item("open-backups", "백업 폴더 열기", None)?,
        ],
    )?;
    let edit_menu = Submenu::with_items(
        app,
        "편집",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;
    let view_menu = Submenu::with_items(
        app,
        "보기",
        true,
        &[
            &item("prev-month", "이전 회계월", None)?,
            &item("next-month", "다음 회계월", None)?,
            &item("today", "오늘", Some("CmdOrCtrl+T"))?,
            &PredefinedMenuItem::separator(app)?,
            &item("tab-day", "날짜 탭", Some("CmdOrCtrl+1"))?,
            &item("tab-summary", "요약 탭", Some("CmdOrCtrl+2"))?,
        ],
    )?;
    let window_menu = Submenu::with_items(
        app,
        "윈도우",
        true,
        &[
            &PredefinedMenuItem::minimize(app, Some("최소화"))?,
            &PredefinedMenuItem::maximize(app, Some("확대/축소"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, Some("윈도우 닫기"))?,
        ],
    )?;
    Menu::with_items(
        app,
        &[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu],
    )
}

pub fn handle_event(app: &AppHandle, id: &str) {
    if let Err(e) = app.emit("menu", id.to_string()) {
        eprintln!("menu event emit failed: {e}");
    }
}
