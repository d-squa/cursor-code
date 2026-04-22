// Post-processes a SheetJS-generated .xlsx blob to inject Excel data
// validation dropdowns on specific columns.
//
// SheetJS community edition can't write <dataValidations> directly, so we
// unzip the xlsx (it's just an OOXML zip), patch the relevant sheet XML,
// and rezip. Works in Excel, Google Sheets, and Numbers.

import JSZip from 'jszip';

export interface SheetDropdownSpec {
  /** Sheet/tab name as written in the workbook. */
  sheetName: string;
  /** 0-based column index where the dropdown should appear. */
  columnIndex: number;
  /** 1-based start row (header is row 1; data usually starts at row 2). */
  startRow: number;
  /** 1-based end row (inclusive). Default 1000 to cover future inserts. */
  endRow?: number;
  /** Allowed values. Excel limits inline list source to ~255 chars total. */
  options: string[];
  /** Tooltip prompt shown when the cell is selected. */
  prompt?: string;
};

/** Convert 0-based column index to A1 letters (0 → A, 26 → AA, …). */
function colToLetter(col: number): string {
  let s = '';
  let n = col;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

/** Escape XML attribute / text content. */
function xmlEscape(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Read workbook.xml.rels + workbook.xml to map sheet name → sheet file path. */
async function buildSheetPathMap(zip: JSZip): Promise<Map<string, string>> {
  const wbXml = await zip.file('xl/workbook.xml')?.async('string');
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  const map = new Map<string, string>();
  if (!wbXml || !relsXml) return map;

  // Parse rels: id → target
  const relsById = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    relsById.set(m[1], m[2]);
  }

  // Parse sheets: name → r:id
  for (const m of wbXml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const target = relsById.get(m[2]);
    if (!target) continue;
    // Targets are like "worksheets/sheet1.xml" — relative to xl/.
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    map.set(m[1], path);
  }
  return map;
}

/** Build a single <dataValidation> element XML for an inline list. */
function buildDataValidationXml(spec: SheetDropdownSpec): string {
  const colLetter = colToLetter(spec.columnIndex);
  const range = `${colLetter}${spec.startRow}:${colLetter}${spec.endRow ?? 1000}`;
  // Excel inline list syntax: "&quot;a,b,c&quot;" inside formula1.
  // Commas separate items; if any item contains a comma, switch to a hidden range.
  const joined = spec.options.join(',');
  const formula = `&quot;${xmlEscape(joined)}&quot;`;
  const promptAttrs = spec.prompt
    ? ` showInputMessage="1" prompt="${xmlEscape(spec.prompt)}" promptTitle="${xmlEscape('Allowed values')}"`
    : '';
  return (
    `<dataValidation type="list" allowBlank="1" showErrorMessage="1" ` +
    `errorTitle="${xmlEscape('Invalid value')}" error="${xmlEscape('Pick a value from the list.')}"` +
    promptAttrs +
    ` sqref="${range}">` +
    `<formula1>${formula}</formula1>` +
    `</dataValidation>`
  );
}

/** Inject <dataValidations> into a single sheet xml string. */
function injectIntoSheetXml(sheetXml: string, dvElements: string[]): string {
  if (dvElements.length === 0) return sheetXml;
  const block = `<dataValidations count="${dvElements.length}">${dvElements.join('')}</dataValidations>`;

  // Insertion order matters in OOXML. <dataValidations> must come after
  // <mergeCells> (if any) and before <hyperlinks>/<printOptions>/<pageMargins>.
  // We try a list of safe insertion anchors in order.
  const anchors = [
    /<\/mergeCells>/,
    /<hyperlinks/,
    /<printOptions/,
    /<pageMargins/,
    /<\/sheetData>/, // last-resort: insert right after sheetData close
  ];
  for (const re of anchors) {
    const m = sheetXml.match(re);
    if (m && m.index !== undefined) {
      const idx = re === anchors[0] ? m.index + m[0].length : m.index;
      return sheetXml.slice(0, idx) + block + sheetXml.slice(idx);
    }
  }
  // Fallback: insert before </worksheet>.
  return sheetXml.replace(/<\/worksheet>/, `${block}</worksheet>`);
}

/**
 * Patch an xlsx ArrayBuffer to add dropdown validations on specific columns.
 * Returns a new ArrayBuffer.
 */
export async function injectDropdownsIntoXlsx(
  xlsxBuffer: ArrayBuffer,
  specs: SheetDropdownSpec[],
): Promise<ArrayBuffer> {
  if (specs.length === 0) return xlsxBuffer;
  const zip = await JSZip.loadAsync(xlsxBuffer);
  const sheetPaths = await buildSheetPathMap(zip);

  // Group specs by sheet path.
  const bySheetPath = new Map<string, SheetDropdownSpec[]>();
  for (const spec of specs) {
    const path = sheetPaths.get(spec.sheetName);
    if (!path) continue;
    const arr = bySheetPath.get(path) ?? [];
    arr.push(spec);
    bySheetPath.set(path, arr);
  }

  for (const [path, sheetSpecs] of bySheetPath.entries()) {
    const file = zip.file(path);
    if (!file) continue;
    const xml = await file.async('string');
    const dvEls = sheetSpecs.map(buildDataValidationXml);
    const patched = injectIntoSheetXml(xml, dvEls);
    zip.file(path, patched);
  }

  return zip.generateAsync({ type: 'arraybuffer' });
}
