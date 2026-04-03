use std::fs::File;
use std::io::{BufWriter, Cursor};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use printpdf::{Color, IndirectFontRef, Mm, PdfDocument, PdfDocumentReference, PdfLayerReference, Rgb};
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, FilePath};

use super::SetlistPayload;

const PAGE_WIDTH_MM: f64 = 210.0;
const PAGE_HEIGHT_MM: f64 = 297.0;
const PAGE_MARGIN_MM: f64 = 15.0;
const COLUMN_GAP_MM: f64 = 8.0;

const ARIAL_REGULAR: &[u8] = include_bytes!("../../assets/fonts/arial.ttf");
const ARIAL_BOLD: &[u8] = include_bytes!("../../assets/fonts/arialbd.ttf");
const COURIER_REGULAR: &[u8] = include_bytes!("../../assets/fonts/cour.ttf");
const COURIER_BOLD: &[u8] = include_bytes!("../../assets/fonts/courbd.ttf");
const GEORGIA_REGULAR: &[u8] = include_bytes!("../../assets/fonts/georgia.ttf");
const GEORGIA_BOLD: &[u8] = include_bytes!("../../assets/fonts/georgiab.ttf");
const TIMES_REGULAR: &[u8] = include_bytes!("../../assets/fonts/times.ttf");
const TIMES_BOLD: &[u8] = include_bytes!("../../assets/fonts/timesbd.ttf");
const TREBUCHET_REGULAR: &[u8] = include_bytes!("../../assets/fonts/trebuc.ttf");
const TREBUCHET_BOLD: &[u8] = include_bytes!("../../assets/fonts/trebucbd.ttf");

fn sanitize_filename(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            _ => character,
        })
        .collect::<String>()
        .trim()
        .to_owned();

    if sanitized.is_empty() {
        "reperto".to_string()
    } else {
        sanitized
    }
}

fn font_bytes_for(name: &str) -> (&'static [u8], &'static [u8]) {
    match name {
        "Arial" => (ARIAL_REGULAR, ARIAL_BOLD),
        "Courier New" => (COURIER_REGULAR, COURIER_BOLD),
        "Times New Roman" => (TIMES_REGULAR, TIMES_BOLD),
        "Trebuchet MS" => (TREBUCHET_REGULAR, TREBUCHET_BOLD),
        _ => (GEORGIA_REGULAR, GEORGIA_BOLD),
    }
}

fn px_to_pt(px: f64) -> f64 {
    px * 0.75
}

fn px_to_mm(px: f64) -> f64 {
    px * 25.4 / 96.0
}

fn truncate_name(name: &str, limit: u32) -> String {
    if limit == 0 || name.chars().count() <= limit as usize {
        return name.to_string();
    }

    let truncated = name.chars().take(limit.saturating_sub(1) as usize).collect::<String>();
    format!("{}\u{2026}", truncated.trim_end())
}

fn estimate_text_width_mm(text: &str, font_size_pt: f64) -> f64 {
    let visual_chars = text.chars().count() as f64;
    visual_chars * font_size_pt * 0.18
}

fn color_from_hex(hex: &str) -> (f64, f64, f64) {
    let normalized = hex.trim().trim_start_matches('#');
    if normalized.len() != 6 {
        return (192.0 / 255.0, 57.0 / 255.0, 43.0 / 255.0);
    }

    let parse = |slice: &str| u8::from_str_radix(slice, 16).unwrap_or(0) as f64 / 255.0;
    (
        parse(&normalized[0..2]),
        parse(&normalized[2..4]),
        parse(&normalized[4..6]),
    )
}

fn add_external_font(
    document: &PdfDocumentReference,
    bytes: &'static [u8],
) -> Result<IndirectFontRef, String> {
    document
        .add_external_font(Cursor::new(bytes))
        .map_err(|error| format!("printpdf error loading font: {error}"))
}

fn draw_text(
    layer: &PdfLayerReference,
    text: &str,
    font: &IndirectFontRef,
    font_size_pt: f64,
    x_mm: f64,
    y_mm: f64,
    color: (f64, f64, f64),
) {
    layer.set_fill_color(Color::Rgb(Rgb::new(
        color.0 as f32,
        color.1 as f32,
        color.2 as f32,
        None,
    )));
    layer.use_text(text, font_size_pt as f32, Mm(x_mm as f32), Mm(y_mm as f32), font);
}

fn draw_page_header(
    layer: &PdfLayerReference,
    title: &str,
    title_font: &IndirectFontRef,
    title_size_pt: f64,
) -> f64 {
    let title_width = estimate_text_width_mm(title, title_size_pt);
    let title_x = ((PAGE_WIDTH_MM - title_width) / 2.0).max(PAGE_MARGIN_MM);
    let title_y = PAGE_HEIGHT_MM - PAGE_MARGIN_MM;
    draw_text(layer, title, title_font, title_size_pt, title_x, title_y, (0.0, 0.0, 0.0));
    title_y - px_to_mm(36.0)
}

fn next_flow_position(
    document: &PdfDocumentReference,
    layer: &mut PdfLayerReference,
    current_column: &mut usize,
    title: &str,
    title_font: &IndirectFontRef,
    title_size_pt: f64,
    columns: usize,
) -> f64 {
    *current_column += 1;

    if *current_column >= columns {
        let (page_index, layer_index) =
            document.add_page(Mm(PAGE_WIDTH_MM as f32), Mm(PAGE_HEIGHT_MM as f32), "Layer");
        *layer = document.get_page(page_index).get_layer(layer_index);
        *current_column = 0;
    }

    draw_page_header(layer, title, title_font, title_size_pt)
}

fn render_pdf_to_path(setlist: &SetlistPayload, output_path: &Path) -> Result<(), String> {
    let title = if setlist.title.trim().is_empty() {
        "Novo repert\u{00F3}rio"
    } else {
        setlist.title.trim()
    };

    let (document, first_page, first_layer) = PdfDocument::new(
        title,
        Mm(PAGE_WIDTH_MM as f32),
        Mm(PAGE_HEIGHT_MM as f32),
        "Layer 1",
    );
    let (regular_bytes, bold_bytes) = font_bytes_for(&setlist.settings.font);
    let regular_font = add_external_font(&document, regular_bytes)?;
    let bold_font = add_external_font(&document, bold_bytes)?;
    let title_font_size_pt = px_to_pt(setlist.settings.title_size);
    let block_font_size_pt = px_to_pt(setlist.settings.block_size);
    let song_font_size_pt = px_to_pt(setlist.settings.song_size);
    let line_height_mm = px_to_mm(setlist.settings.song_size * setlist.settings.line_spacing);
    let block_gap_mm = px_to_mm(12.0);
    let columns = setlist.settings.columns.clamp(1, 3) as usize;
    let usable_width =
        PAGE_WIDTH_MM - (PAGE_MARGIN_MM * 2.0) - COLUMN_GAP_MM * (columns.saturating_sub(1) as f64);
    let column_width = usable_width / columns as f64;
    let chord_color = color_from_hex(&setlist.settings.chord_color);
    let chord_inline = setlist.settings.chord_inline;

    let mut layer = document.get_page(first_page).get_layer(first_layer);
    let mut current_column = 0usize;
    let mut current_y = draw_page_header(&layer, title, &bold_font, title_font_size_pt);

    for block in &setlist.blocks {
        let estimated_block_height =
            px_to_mm(setlist.settings.block_size) + block.songs.len() as f64 * line_height_mm + block_gap_mm;

        if current_y - estimated_block_height < PAGE_MARGIN_MM {
            current_y = next_flow_position(
                &document,
                &mut layer,
                &mut current_column,
                title,
                &bold_font,
                title_font_size_pt,
                columns,
            );
        }

        let column_x = PAGE_MARGIN_MM + current_column as f64 * (column_width + COLUMN_GAP_MM);
        draw_text(
            &layer,
            &block.label,
            &bold_font,
            block_font_size_pt,
            column_x,
            current_y,
            (0.0, 0.0, 0.0),
        );
        current_y -= line_height_mm * 0.85;

        for song in &block.songs {
            if current_y - line_height_mm < PAGE_MARGIN_MM {
                current_y = next_flow_position(
                    &document,
                    &mut layer,
                    &mut current_column,
                    title,
                    &bold_font,
                    title_font_size_pt,
                    columns,
                );
            }

            let current_column_x = PAGE_MARGIN_MM + current_column as f64 * (column_width + COLUMN_GAP_MM);
            let truncated_name = truncate_name(&song.name, setlist.settings.truncate_at);
            draw_text(
                &layer,
                &truncated_name,
                &regular_font,
                song_font_size_pt,
                current_column_x,
                current_y,
                (0.0, 0.0, 0.0),
            );

            if let Some(chord) = song.chord.as_ref().filter(|value| !value.trim().is_empty()) {
                if chord_inline {
                    let name_width = estimate_text_width_mm(&truncated_name, song_font_size_pt);
                    let dash_x = (current_column_x + name_width + 2.0).min(current_column_x + column_width - 8.0);
                    let chord_x = (dash_x + 3.4).min(current_column_x + column_width - 6.0);

                    draw_text(
                        &layer,
                        "\u{2013}",
                        &regular_font,
                        song_font_size_pt,
                        dash_x,
                        current_y,
                        (0.0, 0.0, 0.0),
                    );
                    draw_text(
                        &layer,
                        chord,
                        &bold_font,
                        song_font_size_pt,
                        chord_x,
                        current_y,
                        chord_color,
                    );
                } else {
                    let chord_width = estimate_text_width_mm(chord, song_font_size_pt);
                    let chord_x = current_column_x + column_width - chord_width;
                    draw_text(
                        &layer,
                        chord,
                        &bold_font,
                        song_font_size_pt,
                        chord_x,
                        current_y,
                        chord_color,
                    );

                    let dash_x = (chord_x - 3.4).max(current_column_x);
                    draw_text(
                        &layer,
                        "\u{2013}",
                        &regular_font,
                        song_font_size_pt,
                        dash_x,
                        current_y,
                        (0.0, 0.0, 0.0),
                    );
                }
            }

            current_y -= line_height_mm;
        }

        current_y -= block_gap_mm;
    }

    let file = File::create(output_path).map_err(|error| {
        format!("Erro ao exportar PDF: n\u{00E3}o foi poss\u{00ED}vel criar o arquivo: {error}")
    })?;
    let mut writer = BufWriter::new(file);
    document
        .save(&mut writer)
        .map_err(|error| format!("printpdf error saving document: {error}"))?;

    Ok(())
}

#[tauri::command]
pub async fn export_pdf(setlist: SetlistPayload, app: AppHandle) -> Result<String, String> {
    let default_filename = format!("{}.pdf", sanitize_filename(&setlist.title));
    let selected = app
        .dialog()
        .file()
        .add_filter("PDF", &["pdf"])
        .set_file_name(&default_filename)
        .blocking_save_file()
        .ok_or_else(|| "Exporta\u{00E7}\u{00E3}o cancelada.".to_string())?;

    let output_path = match selected {
        FilePath::Path(path) => path,
        _ => {
            return Err("Erro ao exportar PDF: caminho de exporta\u{00E7}\u{00E3}o inv\u{00E1}lido.".to_string())
        }
    };

    render_pdf_to_path(&setlist, &output_path)?;
    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn prepare_print_pdf(setlist: SetlistPayload) -> Result<String, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("Erro ao preparar impress\u{00E3}o: {error}"))?
        .as_millis();

    let output_path: PathBuf = std::env::temp_dir().join(format!("reperto-print-{timestamp}.pdf"));
    render_pdf_to_path(&setlist, &output_path)?;
    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn print_setlist(setlist: SetlistPayload) -> Result<String, String> {
    let output_path = prepare_print_pdf(setlist).await?;
    opener::open(&output_path)
        .map_err(|error| format!("Erro ao abrir o PDF de impress\u{00E3}o: {error}"))?;
    Ok(output_path)
}
