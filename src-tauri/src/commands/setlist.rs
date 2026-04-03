use chrono::Utc;
use rusqlite::{params, types::Type, Connection};
use tauri::State;

use super::{BlockPayload, PrintSettingsPayload, SetlistPayload};
use crate::DbPool;

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS setlists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL,
  blocks     TEXT    NOT NULL,
  settings   TEXT    NOT NULL
);
";

fn log_db_error(context: &str, error: impl std::fmt::Display) -> String {
    let message = format!("{context}: {error}");
    eprintln!("{message}");
    message
}

fn open_connection(path: &std::path::Path) -> Result<Connection, String> {
    let connection = Connection::open(path).map_err(|error| log_db_error("Erro ao abrir SQLite", error))?;
    connection
        .execute_batch(SCHEMA)
        .map_err(|error| log_db_error("Erro ao inicializar schema SQLite", error))?;
    Ok(connection)
}

fn deserialize_json<T: serde::de::DeserializeOwned>(value: String, column_index: usize) -> rusqlite::Result<T> {
    serde_json::from_str(&value).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(column_index, Type::Text, Box::new(error))
    })
}

fn map_setlist_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SetlistPayload> {
    let blocks_json: String = row.get("blocks")?;
    let settings_json: String = row.get("settings")?;

    Ok(SetlistPayload {
        id: Some(row.get("id")?),
        title: row.get("title")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        blocks: deserialize_json::<Vec<BlockPayload>>(blocks_json, 4)?,
        settings: deserialize_json::<PrintSettingsPayload>(settings_json, 5)?,
    })
}

fn fetch_setlist_by_id(connection: &Connection, id: i64) -> Result<SetlistPayload, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, title, created_at, updated_at, blocks, settings
             FROM setlists
             WHERE id = ?1",
        )
        .map_err(|error| log_db_error("Erro ao preparar consulta de repertório", error))?;

    statement
        .query_row([id], map_setlist_row)
        .map_err(|error| log_db_error("Erro ao carregar repertório", error))
}

#[tauri::command]
pub async fn get_all_setlists(db: State<'_, DbPool>) -> Result<Vec<SetlistPayload>, String> {
    let db_path = db.path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let connection = open_connection(&db_path)?;
        let mut statement = connection
            .prepare(
                "SELECT id, title, created_at, updated_at, blocks, settings
                 FROM setlists
                 ORDER BY datetime(updated_at) DESC, id DESC",
            )
            .map_err(|error| log_db_error("Erro ao preparar listagem de repertórios", error))?;

        let rows = statement
            .query_map([], map_setlist_row)
            .map_err(|error| log_db_error("Erro ao listar repertórios", error))?;

        let mut setlists = Vec::new();
        for row in rows {
            setlists.push(row.map_err(|error| log_db_error("Erro ao converter repertório do banco", error))?);
        }

        Ok(setlists)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn get_setlist(id: i64, db: State<'_, DbPool>) -> Result<SetlistPayload, String> {
    let db_path = db.path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let connection = open_connection(&db_path)?;
        fetch_setlist_by_id(&connection, id)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn save_setlist(setlist: SetlistPayload, db: State<'_, DbPool>) -> Result<i64, String> {
    let db_path = db.path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let connection = open_connection(&db_path)?;
        let blocks_json =
            serde_json::to_string(&setlist.blocks).map_err(|error| log_db_error("Erro ao serializar blocos", error))?;
        let settings_json = serde_json::to_string(&setlist.settings)
            .map_err(|error| log_db_error("Erro ao serializar configurações de impressão", error))?;

        if let Some(id) = setlist.id {
            connection
                .execute(
                    "UPDATE setlists
                     SET title = ?1, updated_at = ?2, blocks = ?3, settings = ?4
                     WHERE id = ?5",
                    params![
                        setlist.title,
                        setlist.updated_at,
                        blocks_json,
                        settings_json,
                        id
                    ],
                )
                .map_err(|error| log_db_error("Erro ao atualizar repertório", error))?;
            Ok(id)
        } else {
            connection
                .execute(
                    "INSERT INTO setlists (title, created_at, updated_at, blocks, settings)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![
                        setlist.title,
                        setlist.created_at,
                        setlist.updated_at,
                        blocks_json,
                        settings_json
                    ],
                )
                .map_err(|error| log_db_error("Erro ao inserir repertório", error))?;
            Ok(connection.last_insert_rowid())
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn delete_setlist(id: i64, db: State<'_, DbPool>) -> Result<(), String> {
    let db_path = db.path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let connection = open_connection(&db_path)?;
        connection
            .execute("DELETE FROM setlists WHERE id = ?1", [id])
            .map_err(|error| log_db_error("Erro ao excluir repertório", error))?;
        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn duplicate_setlist(id: i64, db: State<'_, DbPool>) -> Result<i64, String> {
    let db_path = db.path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let connection = open_connection(&db_path)?;
        let original = fetch_setlist_by_id(&connection, id)?;
        let now = Utc::now().to_rfc3339();

        connection
            .execute(
                "INSERT INTO setlists (title, created_at, updated_at, blocks, settings)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    format!("{} (cópia)", original.title),
                    now,
                    Utc::now().to_rfc3339(),
                    serde_json::to_string(&original.blocks)
                        .map_err(|error| log_db_error("Erro ao serializar blocos duplicados", error))?,
                    serde_json::to_string(&original.settings).map_err(|error| {
                        log_db_error("Erro ao serializar configurações duplicadas", error)
                    })?,
                ],
            )
            .map_err(|error| log_db_error("Erro ao duplicar repertório", error))?;

        Ok(connection.last_insert_rowid())
    })
    .await
    .map_err(|error| error.to_string())?
}
