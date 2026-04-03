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

fn estimate_line_height_mm(song_size_px: f64, line_spacing: f64) -> f64 {
    px_to_mm(song_size_px * line_spacing)
}

fn estimate_column_height_mm(title_size_px: f64) -> f64 {
    let title_band = px_to_mm(title_size_px * 1.15) + px_to_mm(36.0);
    PAGE_HEIGHT_MM - PAGE_MARGIN_MM * 2.0 - title_band
}

fn estimate_block_height_mm(
    block: &super::BlockPayload,
    block_size_px: f64,
    song_size_px: f64,
    line_spacing: f64,
) -> f64 {
    px_to_mm(block_size_px * 1.2)
        + block.songs.len() as f64 * estimate_line_height_mm(song_size_px, line_spacing)
        + px_to_mm(12.0)
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

fn build_pdf_pages<'a>(setlist: &'a SetlistPayload) -> Vec<Vec<Vec<&'a super::BlockPayload>>> {
    let columns = setlist.settings.columns.clamp(1, 3) as usize;
    let max_column_height = estimate_column_height_mm(setlist.settings.title_size);
    let mut pages: Vec<(Vec<Vec<&super::BlockPayload>>, Vec<f64>)> = Vec::new();

    for block in &setlist.blocks {
        let block_height = estimate_block_height_mm(
            block,
            setlist.settings.block_size,
            setlist.settings.song_size,
            setlist.settings.line_spacing,
        );
        let preferred_page = block.layout.as_ref().map(|layout| layout.page as usize).unwrap_or(0);
        let preferred_column = block
            .layout
            .as_ref()
            .map(|layout| layout.column as usize)
            .unwrap_or(0)
            .min(columns.saturating_sub(1));
        let mut page_index = preferred_page;

        loop {
            while pages.len() <= page_index {
                pages.push(((0..columns).map(|_| Vec::new()).collect(), vec![0.0; columns]));
            }

            let page = &mut pages[page_index];
            let next_height = page.1[preferred_column] + block_height;
            let can_place = next_height <= max_column_height || page.0[preferred_column].is_empty();

            if can_place {
                page.0[preferred_column].push(block);
                page.1[preferred_column] = next_height;
                break;
            }

            page_index += 1;
        }
    }

    if pages.is_empty() {
        pages.push(((0..columns).map(|_| Vec::new()).collect(), vec![0.0; columns]));
    }

    pages.into_iter().map(|(page_columns, _)| page_columns).collect()
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
    let line_height_mm = estimate_line_height_mm(setlist.settings.song_size, setlist.settings.line_spacing);
    let block_gap_mm = px_to_mm(12.0);
    let columns = setlist.settings.columns.clamp(1, 3) as usize;
    let usable_width =
        PAGE_WIDTH_MM - (PAGE_MARGIN_MM * 2.0) - COLUMN_GAP_MM * (columns.saturating_sub(1) as f64);
    let column_width = usable_width / columns as f64;
    let chord_color = color_from_hex(&setlist.settings.chord_color);
    let chord_inline = setlist.settings.chord_inline;
    let pages = build_pdf_pages(setlist);

    let mut layer = document.get_page(first_page).get_layer(first_layer);
    for (page_index, page_columns) in pages.iter().enumerate() {
        if page_index > 0 {
            let (new_page, new_layer) =
                document.add_page(Mm(PAGE_WIDTH_MM as f32), Mm(PAGE_HEIGHT_MM as f32), "Layer");
            layer = document.get_page(new_page).get_layer(new_layer);
        }

        let page_start_y = draw_page_header(&layer, title, &bold_font, title_font_size_pt);

        for (column_index, column) in page_columns.iter().enumerate() {
            let column_x = PAGE_MARGIN_MM + column_index as f64 * (column_width + COLUMN_GAP_MM);
            let mut current_y = page_start_y;

            for block in column {
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
                    let truncated_name = truncate_name(&song.name, setlist.settings.truncate_at);
                    draw_text(
                        &layer,
                        &truncated_name,
                        &regular_font,
                        song_font_size_pt,
                        column_x,
                        current_y,
                        (0.0, 0.0, 0.0),
                    );

                    if let Some(chord) = song.chord.as_ref().filter(|value| !value.trim().is_empty()) {
                        if chord_inline {
                            let name_width = estimate_text_width_mm(&truncated_name, song_font_size_pt);
                            let dash_x = (column_x + name_width + 2.0).min(column_x + column_width - 8.0);
                            let chord_x = (dash_x + 3.4).min(column_x + column_width - 6.0);

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
                            let chord_x = column_x + column_width - chord_width;
                            draw_text(
                                &layer,
                                chord,
                                &bold_font,
                                song_font_size_pt,
                                chord_x,
                                current_y,
                                chord_color,
                            );

                            let dash_x = (chord_x - 3.4).max(column_x);
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
        }
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
