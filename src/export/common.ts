import type { Batch, Rec } from '../types';
import { SOURCE_LABEL } from '../constants';

export interface ExportInput {
  batch: Pick<Batch, 'name' | 'status'>;
  records: Rec[];
  exportedAt: Date;
  /** Resolved display names for record.by ids (optional; names are never stored). */
  names?: Record<string, string>;
}

export interface Column {
  key: string;
  title: string;
  kind: 'int' | 'text' | 'mono' | 'wrap' | 'datetime';
  width: number; // Excel character widths
}

export function notesText(r: Rec): string {
  return [...(r.notes || []), (r.freeNotes || '').trim()].filter(Boolean).join('; ');
}

export function sortedRecords(records: Rec[]): Rec[] {
  return [...records].sort((a, b) => a.no - b.no || a.createdAt - b.createdAt);
}

export function columns(input: ExportInput): Column[] {
  const cols: Column[] = [
    { key: 'no', title: 'Unit No.', kind: 'int', width: 9 },
    { key: 'type', title: 'Appliance Type', kind: 'text', width: 34 },
    { key: 'brand', title: 'Brand', kind: 'text', width: 14 },
    { key: 'model', title: 'Model', kind: 'mono', width: 22 },
    { key: 'serial', title: 'Serial', kind: 'mono', width: 22 },
    { key: 'color', title: 'Color', kind: 'text', width: 16 },
    { key: 'notes', title: 'Notes', kind: 'wrap', width: 42 },
    { key: 'source', title: 'Source', kind: 'text', width: 14 },
    { key: 'logged', title: 'Logged', kind: 'datetime', width: 21 },
  ];
  if (hasNames(input)) cols.push({ key: 'by', title: 'Logged By', kind: 'text', width: 18 });
  return cols;
}

function hasNames(input: ExportInput): boolean {
  if (!input.names) return false;
  return input.records.some((r) => r.by && input.names![r.by]);
}

/** Cell values per column key. Model and serial are always strings so
 *  leading zeros and dotted numbers (Kenmore 110.27102310) survive. */
export function cellValue(r: Rec, key: string, input: ExportInput): string | number {
  switch (key) {
    case 'no':
      return r.no;
    case 'type':
      return r.type || '';
    case 'brand':
      return r.brand || '';
    case 'model':
      return r.model || '';
    case 'serial':
      return r.serial || '';
    case 'color':
      return r.color || '';
    case 'notes':
      return notesText(r);
    case 'source':
      return SOURCE_LABEL[r.source] || '';
    case 'logged':
      return r.createdAt;
    case 'by':
      return (r.by && input.names?.[r.by]) || '';
    default:
      return '';
  }
}

export function unitRange(records: Rec[]): string {
  if (!records.length) return '—';
  const nos = records.map((r) => r.no);
  const lo = Math.min(...nos);
  const hi = Math.max(...nos);
  return lo === hi ? `#${lo}` : `#${lo}–#${hi}`;
}

export function slug(name: string): string {
  return (name || 'inventory').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'inventory';
}

export function exportBaseName(name: string, records: Rec[]): string {
  const s = slug(name);
  if (!records.length) return `${s}_empty`;
  const nos = records.map((r) => r.no);
  return `${s}_units_${Math.min(...nos)}-${Math.max(...nos)}`;
}

export function countBy(records: Rec[], f: (r: Rec) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const r of records) {
    const k = f(r) || '(not set)';
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function fmtDateTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Excel serial date in local time (1900 date system). */
export function excelSerial(ms: number): number {
  const d = new Date(ms);
  const local = ms - d.getTimezoneOffset() * 60000;
  return local / 86400000 + 25569;
}
