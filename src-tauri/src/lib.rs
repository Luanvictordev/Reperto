use std::fs;
use std::path::PathBuf;

use tauri::Manager;

pub mod commands;

#[derive(Clone)]
pub struct DbPool {
    pub path: PathBuf,
}

fn database_path(app: &tauri::App) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;

    fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;
    Ok(app_data_dir.join("reperto.db"))
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            let db_pool = DbPool {
                path: database_path(app)?,
            };
            app.manage(db_pool);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::setlist::get_all_setlists,
            commands::setlist::get_setlist,
            commands::setlist::save_setlist,
            commands::setlist::delete_setlist,
            commands::setlist::duplicate_setlist,
            commands::pdf::export_pdf,
            commands::pdf::prepare_print_pdf,
            commands::pdf::print_setlist
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
