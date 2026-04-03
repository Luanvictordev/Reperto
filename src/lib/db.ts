import { invoke } from '@tauri-apps/api/core';
import type { Setlist, SetlistSummary } from '../types';

export async function getAllSetlists() {
  return invoke<SetlistSummary[]>('get_all_setlists');
}

export async function getSetlist(id: number) {
  return invoke<Setlist>('get_setlist', { id });
}

export async function saveSetlist(setlist: Setlist) {
  return invoke<number>('save_setlist', { setlist });
}

export async function deleteSetlist(id: number) {
  return invoke<void>('delete_setlist', { id });
}

export async function duplicateSetlist(id: number) {
  return invoke<number>('duplicate_setlist', { id });
}

export async function exportPdf(setlist: Setlist) {
  return invoke<string>('export_pdf', { setlist });
}

export async function preparePrintPdf(setlist: Setlist) {
  return invoke<string>('prepare_print_pdf', { setlist });
}

export async function printSetlist(setlist: Setlist) {
  return invoke<string>('print_setlist', { setlist });
}
