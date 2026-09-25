import { xmlEsc, zipStore } from './zip';
import {
  cellValue,
  columns,
  countBy,
  excelSerial,
  notesText,
  sortedRecords,
  unitRange,
  type ExportInput,
} from './common';

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// cellXfs indexes (see STYLES)
const S = {
  header: 1,
  text: 2,
  int: 3,
  datetime: 4,
  wrap: 5,
  title: 6,
  label: 7,
  plainInt: 8,
  plainDate: 9,
  plainText: 10,
  muted: 11,
};

const STYLES = `${HEAD}<styleSheet xmlns="${NS}">
<numFmts count="1"><numFmt numFmtId="164" formatCode="mmm d, yyyy h:mm AM/PM"/></numFmts>
<fonts count="5">
<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="15"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><sz val="10"/><color rgb="FF57544D"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF0F0F0E"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FFDAD6CC"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="12">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
<dxfs count="0"/>
<tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;

function colLetter(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function strCell(ref: string, v: string, s: number): string {
  if (v === '') return `<c r="${ref}" s="${s}"/>`;
  return `<c r="${ref}" t="inlineStr" s="${s}"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
}

function numCell(ref: string, v: number, s: number): string {
  return `<c r="${ref}" s="${s}"><v>${Number.isFinite(v) ? v : 0}</v></c>`;
}

function sheetName(s: string): string {
  return s.replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31);
}

export function buildXlsx(input: ExportInput): Uint8Array {
  const cols = columns(input);
  const recs = sortedRecords(input.records);
  const lastCol = colLetter(cols.length - 1);
  const lastRow = Math.max(recs.length + 1, 1);

  // ---- Sheet 1: Inventory (clean table from A1: sortable, filterable, re-importable)
  const rows: string[] = [];
  rows.push(
    `<row r="1" ht="20" customHeight="1">${cols
      .map((c, i) => strCell(`${colLetter(i)}1`, c.title, S.header))
      .join('')}</row>`,
  );
  recs.forEach((r, idx) => {
    const rn = idx + 2;
    const cells = cols
      .map((c, i) => {
        const ref = `${colLetter(i)}${rn}`;
        const v = cellValue(r, c.key, input);
        if (c.kind === 'int') return numCell(ref, Number(v), S.int);
        if (c.kind === 'datetime') return numCell(ref, excelSerial(Number(v)), S.datetime);
        if (c.kind === 'wrap') return strCell(ref, String(v), S.wrap);
        return strCell(ref, String(v), S.text);
      })
      .join('');
    rows.push(`<row r="${rn}">${cells}</row>`);
  });

  const sheet1 = `${HEAD}<worksheet xmlns="${NS}" xmlns:r="${NS_R}">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<dimension ref="A1:${lastCol}${lastRow}"/>
<sheetViews><sheetView tabSelected="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`)
    .join('')}</cols>
<sheetData>${rows.join('')}</sheetData>
<autoFilter ref="A1:${lastCol}${lastRow}"/>
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;

  // ---- Sheet 2: Summary block
  const srows: string[] = [];
  let rn = 1;
  const put = (a: string, b: string | number | null, sa: number, sb?: number, kind?: 'date') => {
    let row = strCell(`A${rn}`, a, sa);
    if (b !== null && b !== undefined) {
      if (kind === 'date') row += numCell(`B${rn}`, excelSerial(Number(b)), S.plainDate);
      else if (typeof b === 'number') row += numCell(`B${rn}`, b, sb ?? S.plainInt);
      else row += strCell(`B${rn}`, b, sb ?? S.plainText);
    }
    srows.push(`<row r="${rn}">${row}</row>`);
    rn++;
  };
  const gap = () => {
    rn++;
  };
  put(input.batch.name || 'Inventory', null, S.title);
  put(`Appliance inventory · ${input.batch.status === 'closed' ? 'closed batch' : 'open batch'}`, null, S.muted);
  gap();
  put('Units', recs.length, S.label);
  put('Unit range', unitRange(recs), S.label);
  put('No nameplate', recs.filter((r) => r.source === 'noplate').length, S.label);
  put('With notes', recs.filter((r) => notesText(r)).length, S.label);
  put('Exported', input.exportedAt.getTime(), S.label, undefined, 'date');
  const section = (title: string, pairs: [string, number][]) => {
    gap();
    put(title, 'Units', S.label, S.label);
    for (const [k, n] of pairs) put(k, n, S.plainText);
  };
  section('By appliance type', countBy(recs, (r) => r.type));
  section('By brand', countBy(recs, (r) => r.brand));
  section('By color', countBy(recs, (r) => r.color));

  const sheet2 = `${HEAD}<worksheet xmlns="${NS}" xmlns:r="${NS_R}">
<dimension ref="A1:B${Math.max(rn - 1, 1)}"/>
<sheetViews><sheetView workbookViewId="0"/></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols><col min="1" max="1" width="40" customWidth="1"/><col min="2" max="2" width="22" customWidth="1"/></cols>
<sheetData>${srows.join('')}</sheetData>
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
</worksheet>`;

  const inv = sheetName('Inventory');
  const workbook = `${HEAD}<workbook xmlns="${NS}" xmlns:r="${NS_R}">
<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="16000" activeTab="0"/></bookViews>
<sheets><sheet name="${inv}" sheetId="1" r:id="rId1"/><sheet name="Summary" sheetId="2" r:id="rId2"/></sheets>
<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${inv}'!$A$1:$${lastCol}$${lastRow}</definedName><definedName name="_xlnm.Print_Titles" localSheetId="0">'${inv}'!$1:$1</definedName></definedNames>
</workbook>`;

  const created = input.exportedAt.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const title = xmlEsc(input.batch.name || 'Inventory');

  return zipStore(
    [
      {
        name: '[Content_Types].xml',
        data: `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
      },
      {
        name: '_rels/.rels',
        data: `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
      },
      {
        name: 'docProps/core.xml',
        data: `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${title}</dc:title><dc:creator>Inventory Logger</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified>
</cp:coreProperties>`,
      },
      {
        name: 'docProps/app.xml',
        data: `${HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Inventory Logger</Application></Properties>`,
      },
      { name: 'xl/workbook.xml', data: workbook },
      {
        name: 'xl/_rels/workbook.xml.rels',
        data: `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
      },
      { name: 'xl/styles.xml', data: STYLES },
      { name: 'xl/worksheets/sheet1.xml', data: sheet1 },
      { name: 'xl/worksheets/sheet2.xml', data: sheet2 },
    ],
    input.exportedAt,
  );
}
