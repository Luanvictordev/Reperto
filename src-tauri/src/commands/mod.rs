use serde::{Deserialize, Serialize};

pub mod pdf;
pub mod setlist;

fn default_line_spacing() -> f64 {
    1.5
}

fn deserialize_line_spacing<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let raw = f64::deserialize(deserializer)?;
    let normalized = if raw > 4.0 { raw / 14.0 } else { raw };
    Ok(normalized.clamp(1.0, 2.5))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongPayload {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chord: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockPayload {
    pub id: String,
    pub label: String,
    pub songs: Vec<SongPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintSettingsPayload {
    pub font: String,
    pub title_size: f64,
    pub block_size: f64,
    pub song_size: f64,
    #[serde(
        default = "default_line_spacing",
        alias = "lineHeight",
        deserialize_with = "deserialize_line_spacing"
    )]
    pub line_spacing: f64,
    pub columns: u8,
    pub truncate_at: u32,
    pub chord_color: String,
    #[serde(default)]
    pub chord_inline: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetlistPayload {
    pub id: Option<i64>,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub blocks: Vec<BlockPayload>,
    pub settings: PrintSettingsPayload,
}
