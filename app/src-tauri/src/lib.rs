pub mod error;
pub mod time;
pub mod models;
pub mod db;
pub mod repo;
pub mod backup;
pub mod transfer;
pub mod commands;
pub mod menu;

use std::fs;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&data_dir)?;
            app.manage(commands::AppState::initialize(data_dir));
            app.set_menu(menu::build(app.handle())?)?;
            Ok(())
        })
        .on_menu_event(|app, event| menu::handle_event(app, event.id().as_ref()))
        .invoke_handler(tauri::generate_handler![
            commands::db_status,
            commands::retry_open,
            commands::bootstrap,
            commands::seed_default_categories,
            commands::load_period,
            commands::add_expense,
            commands::update_expense,
            commands::delete_expense,
            commands::set_no_expense_day,
            commands::create_category,
            commands::update_category,
            commands::category_usage,
            commands::delete_category,
            commands::save_note,
            commands::load_fixed,
            commands::save_fixed,
            commands::set_setting,
            commands::list_backups,
            commands::restore_backup,
            commands::open_backup_folder,
            commands::read_text_file,
            commands::import_replace_all,
            commands::export_json,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
