import { cellValue, columns, fmtDateTime, sortedRecords, type ExportInput } from './common';

function q(v: string): string {
  return '"' + v.replace(/"/g, '""') + '"';
}

/** Flat CSV, same columns as the workbook. UTF-8 with BOM so Excel reads
 *  accents correctly; CRLF line endings; every field quoted. */
export function buildCsv(input: ExportInput): string {
  const cols = columns(input);
  const lines = [cols.map((c) => q(c.title)).join(',')];
  for (const r of sortedRecords(input.records)) {
    lines.push(
      cols
        .map((c) => {
          const v = cellValue(r, c.key, input);
          if (c.kind === 'datetime') return q(fmtDateTime(Number(v)));
          if (c.kind === 'int') return String(v);
          return q(String(v));
        })
        .join(','),
    );
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}
