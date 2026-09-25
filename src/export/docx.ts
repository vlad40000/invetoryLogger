import { xmlEsc, zipStore } from './zip';
import { countBy, fmtDateTime, notesText, sortedRecords, unitRange, type ExportInput } from './common';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const INK = '0F0F0E';
const MUTED = '57544D';
const RULE = 'DAD6CC';
const SIGNAL = 'E8472C';
const BAND = 'F4F2ED';

interface RunOpts {
  b?: boolean;
  caps?: boolean;
  mono?: boolean;
  color?: string;
  sz?: number; // half-points
  spacing?: number;
}

function run(text: string, o: RunOpts = {}): string {
  const rPr =
    (o.mono ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>' : '') +
    (o.b ? '<w:b/><w:bCs/>' : '') +
    (o.caps ? '<w:caps/>' : '') +
    (o.color ? `<w:color w:val="${o.color}"/>` : '') +
    (o.spacing ? `<w:spacing w:val="${o.spacing}"/>` : '') +
    (o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : '');
  return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r>`;
}

function para(runs: string, after = 0, jc?: string): string {
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="${after}"/>${jc ? `<w:jc w:val="${jc}"/>` : ''}</w:pPr>${runs}</w:p>`;
}

function cell(width: number, content: string, fill?: string): string {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${
    fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''
  }</w:tcPr>${para(content)}</w:tc>`;
}

/** Landscape Letter report: title block, summary line, and the full table
 *  with a header row that repeats on every page. */
export function buildDocx(input: ExportInput): Uint8Array {
  const recs = sortedRecords(input.records);
  const name = input.batch.name || 'Inventory';

  // Landscape Letter: 15840 x 12240 twips, 0.5" margins → 14400 usable.
  const cols: { title: string; w: number; get: (r: (typeof recs)[number]) => string; mono?: boolean; b?: boolean }[] = [
    { title: 'No.', w: 760, get: (r) => `#${r.no}`, mono: true, b: true },
    { title: 'Appliance type', w: 2640, get: (r) => r.type || '—' },
    { title: 'Brand', w: 1500, get: (r) => r.brand || '—' },
    { title: 'Model', w: 2160, get: (r) => r.model || '—', mono: true },
    { title: 'Serial', w: 2300, get: (r) => r.serial || '—', mono: true },
    { title: 'Color', w: 1340, get: (r) => r.color || '—' },
    { title: 'Notes', w: 3700, get: (r) => notesText(r) },
  ];

  const header =
    `<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>` +
    cols.map((c) => cell(c.w, run(c.title, { b: true, caps: true, color: 'FFFFFF', sz: 15, spacing: 10 }), INK)).join('') +
    `</w:tr>`;

  const body = recs
    .map(
      (r, i) =>
        `<w:tr><w:trPr><w:cantSplit/></w:trPr>` +
        cols
          .map((c) => cell(c.w, run(c.get(r), { mono: c.mono, b: c.b, sz: 17, color: INK }), i % 2 ? BAND : undefined))
          .join('') +
        `</w:tr>`,
    )
    .join('');

  const border = (tag: string) => `<w:${tag} w:val="single" w:sz="4" w:space="0" w:color="${RULE}"/>`;
  const table =
    `<w:tbl><w:tblPr><w:tblW w:w="14400" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map(border)
      .join('')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="50" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="50" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>` +
    `<w:tblGrid>${cols.map((c) => `<w:gridCol w:w="${c.w}"/>`).join('')}</w:tblGrid>` +
    header +
    body +
    `</w:tbl>`;

  const noPlate = recs.filter((r) => r.source === 'noplate').length;
  const withNotes = recs.filter((r) => notesText(r)).length;
  const meta = [
    `Units ${unitRange(recs)}`,
    `${recs.length} record${recs.length === 1 ? '' : 's'}`,
    noPlate ? `${noPlate} without nameplate` : '',
    withNotes ? `${withNotes} with notes` : '',
    `Exported ${fmtDateTime(input.exportedAt.getTime())}`,
  ]
    .filter(Boolean)
    .join('  ·  ');
  const byType = countBy(recs, (r) => r.type)
    .map(([k, n]) => `${k} ${n}`)
    .join('  ·  ');

  const doc = `${HEAD}<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>
${para(run('Appliance inventory', { b: true, caps: true, color: SIGNAL, sz: 16, spacing: 30 }), 40)}
${para(run(name, { b: true, sz: 36, color: INK }), 60)}
${para(run(meta, { color: MUTED, sz: 18 }), byType ? 60 : 220)}
${byType ? para(run(byType, { color: MUTED, sz: 16 }), 220) : ''}
${table}
${para('', 0)}
<w:sectPr><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr>
</w:body></w:document>`;

  const fr = (t: string) => run(t, { color: MUTED, sz: 15 });
  const fld = (instr: string) =>
    `<w:r><w:rPr><w:color w:val="${MUTED}"/><w:sz w:val="15"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r><w:rPr><w:color w:val="${MUTED}"/><w:sz w:val="15"/></w:rPr><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r>` +
    `<w:r><w:rPr><w:color w:val="${MUTED}"/><w:sz w:val="15"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r><w:rPr><w:color w:val="${MUTED}"/><w:sz w:val="15"/></w:rPr><w:t>1</w:t></w:r>` +
    `<w:r><w:rPr><w:color w:val="${MUTED}"/><w:sz w:val="15"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>`;
  const footer = `${HEAD}<w:ftr xmlns:w="${W}" xmlns:r="${R}">${para(
    fr(`${name}  ·  Page `) + fld('PAGE') + fr(' of ') + fld('NUMPAGES'),
    0,
    'right',
  )}</w:ftr>`;

  const styles = `${HEAD}<w:styles xmlns:w="${W}">
<w:docDefaults>
<w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="18"/><w:szCs w:val="18"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;

  const created = input.exportedAt.toISOString().replace(/\.\d{3}Z$/, 'Z');

  return zipStore(
    [
      {
        name: '[Content_Types].xml',
        data: `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
      },
      {
        name: '_rels/.rels',
        data: `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
      },
      {
        name: 'docProps/core.xml',
        data: `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${xmlEsc(name)}</dc:title><dc:creator>Inventory Logger</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified>
</cp:coreProperties>`,
      },
      {
        name: 'docProps/app.xml',
        data: `${HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Inventory Logger</Application></Properties>`,
      },
      { name: 'word/document.xml', data: doc },
      { name: 'word/styles.xml', data: styles },
      { name: 'word/footer1.xml', data: footer },
      {
        name: 'word/_rels/document.xml.rels',
        data: `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`,
      },
    ],
    input.exportedAt,
  );
}
