import { writeFileSync, mkdirSync } from 'node:fs';
import { buildXlsx } from '../src/export/xlsx';
import { buildDocx } from '../src/export/docx';
import { buildCsv } from '../src/export/csv';
import type { Rec } from '../src/types';

const out = process.argv[2] || 'test/out/exports';
mkdirSync(out, { recursive: true });

const base = Date.parse('2026-09-24T14:05:00-04:00');
const sample: Omit<Rec, 'id' | 'createdAt' | 'updatedAt' | 'by' | 'renumberedFrom'>[] = [
  { no: 101, brand: 'Samsung', model: 'RF28HFEDBSR/AA', serial: '0ALY4BBK500812A', type: 'French Door Refrigerator', typeReason: 'RF prefix', color: 'Stainless', notes: [], freeNotes: '', source: 'photo', photo: null },
  { no: 102, brand: 'Whirlpool', model: 'WTW5000DW2', serial: 'CT4521099W0', type: 'Top Load Washer', typeReason: 'WTW prefix', color: 'White', notes: ['Missing handles'], freeNotes: 'Lid hinge loose', source: 'photo', photo: null },
  { no: 103, brand: 'GE', model: 'JBS60RKSS', serial: 'TR1234SS6A', type: 'Coil Top Electric Range', typeReason: 'JBS = coil', color: 'Stainless', notes: ['Broken bottom oven door'], freeNotes: '', source: 'photo', photo: null },
  { no: 104, brand: 'Kenmore', model: '110.27102310', serial: '00081234567', type: 'Top Load Washer', typeReason: 'Kenmore 110.x', color: 'White', notes: [], freeNotes: 'Tub <rust> & "stain"', source: 'photo', photo: null },
  { no: 105, brand: 'Unknown', model: 'No Nameplate', serial: 'No Nameplate', type: 'Electric Dryer', typeReason: 'manual', color: 'Almond', notes: ['Nameplate worn off'], freeNotes: '', source: 'noplate', photo: null },
];
const records: Rec[] = [];
for (let i = 0; i < 60; i++) {
  const s = sample[i % sample.length];
  records.push({ ...s, no: 101 + i, id: 'r' + i, createdAt: base + i * 97000, updatedAt: base + i * 97000, by: null, renumberedFrom: null });
}

const input = { batch: { name: 'Riverbend Apartments — Bldg C', status: 'open' as const }, records, exportedAt: new Date(base + 7200000) };
writeFileSync(`${out}/test.xlsx`, buildXlsx(input));
writeFileSync(`${out}/test.docx`, buildDocx(input));
writeFileSync(`${out}/test.csv`, buildCsv(input));
writeFileSync(`${out}/empty.xlsx`, buildXlsx({ ...input, records: [] }));
writeFileSync(`${out}/empty.docx`, buildDocx({ ...input, records: [] }));
console.log('wrote', out);
