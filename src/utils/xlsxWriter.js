// Minimal, dependency-free .xlsx (OOXML SpreadsheetML) writer.
//
// WHY hand-rolled instead of a library: the only well-known npm package (`xlsx` /
// SheetJS CE) is frozen on the registry at a version flagged for prototype-pollution
// and ReDoS vulnerabilities in its PARSER — this app only ever WRITES a workbook from
// its own trusted in-memory data (never parses an uploaded file), so pulling in that
// exposure for a feature we don't use isn't worth it. This module covers exactly what
// Lead Lists needs: one sheet, a frozen header row, autofilter, column widths, no
// merged cells, and wrapped text on selected long-text columns — nothing more.
//
// Entries are stored UNCOMPRESSED (ZIP method 0) — Excel/Sheets/Numbers all accept
// that, and it avoids needing a DEFLATE implementation.

function crc32(bytes) {
  let c
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      c = n
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
      t[n] = c >>> 0
    }
    return t
  })())
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

const enc = new TextEncoder()

function dosDateTime(date) {
  const d = date ?? new Date()
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f)
  const dt = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f)
  return { time, dt }
}

/** Build a ZIP (STORED entries) from [{ name, content: string|Uint8Array }]. Returns Uint8Array. */
function buildZip(files) {
  const { time, dt } = dosDateTime()
  const localChunks = []
  const centralChunks = []
  let offset = 0

  for (const f of files) {
    const nameBytes = enc.encode(f.name)
    const dataBytes = typeof f.content === 'string' ? enc.encode(f.content) : f.content
    const crc = crc32(dataBytes)
    const size = dataBytes.length

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)   // version needed
    local.setUint16(6, 0, true)    // flags
    local.setUint16(8, 0, true)    // method: stored
    local.setUint16(10, time, true)
    local.setUint16(12, dt, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, size, true) // compressed size
    local.setUint32(22, size, true) // uncompressed size
    local.setUint16(26, nameBytes.length, true)
    local.setUint16(28, 0, true)   // extra length
    localChunks.push(new Uint8Array(local.buffer), nameBytes, dataBytes)

    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true)
    central.setUint16(4, 20, true)  // version made by
    central.setUint16(6, 20, true)  // version needed
    central.setUint16(8, 0, true)
    central.setUint16(10, 0, true)  // method: stored
    central.setUint16(12, time, true)
    central.setUint16(14, dt, true)
    central.setUint32(16, crc, true)
    central.setUint32(20, size, true)
    central.setUint32(24, size, true)
    central.setUint16(28, nameBytes.length, true)
    central.setUint16(30, 0, true) // extra length
    central.setUint16(32, 0, true) // comment length
    central.setUint16(34, 0, true) // disk number
    central.setUint16(36, 0, true) // internal attrs
    central.setUint32(38, 0, true) // external attrs
    central.setUint32(42, offset, true) // local header offset
    centralChunks.push(new Uint8Array(central.buffer), nameBytes)

    offset += local.byteLength + nameBytes.length + dataBytes.length
  }

  const centralStart = offset
  let centralSize = 0
  for (const c of centralChunks) centralSize += c.length

  const eocd = new DataView(new ArrayBuffer(22))
  eocd.setUint32(0, 0x06054b50, true)
  eocd.setUint16(4, 0, true)
  eocd.setUint16(6, 0, true)
  eocd.setUint16(8, files.length, true)
  eocd.setUint16(10, files.length, true)
  eocd.setUint32(12, centralSize, true)
  eocd.setUint32(16, centralStart, true)
  eocd.setUint16(20, 0, true)

  const total = offset + centralSize + 22
  const out = new Uint8Array(total)
  let p = 0
  for (const chunk of [...localChunks, ...centralChunks, new Uint8Array(eocd.buffer)]) {
    out.set(chunk, p); p += chunk.length
  }
  return out
}

function xmlEscape(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/\r?\n/g, '&#10;')
}
function colLetter(n) {
  let s = ''
  let x = n
  while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = Math.floor((x - 1) / 26) }
  return s
}

/**
 * Build an .xlsx workbook with ONE sheet from row objects.
 * @param {object} spec
 * @param {string} spec.sheetName
 * @param {{key:string, header:string, width?:number, wrap?:boolean}[]} spec.columns
 * @param {object[]} spec.rows        plain objects keyed by column `key`
 * @param {boolean} [spec.freezeHeader=true]
 * @param {boolean} [spec.autoFilter=true]
 * @returns {Uint8Array}
 */
export function buildXlsx({ sheetName = 'Sheet1', columns, rows, freezeHeader = true, autoFilter = true }) {
  const cols = Array.isArray(columns) ? columns : []
  const data = Array.isArray(rows) ? rows : []
  const lastColLetter = colLetter(cols.length || 1)
  const lastRow = data.length + 1

  // ---- styles.xml (0 = default, 1 = bold header, 2 = wrap text) -------------------
  const stylesXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><sz val="11"/><name val="Calibri"/><b/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="3">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>'

  // ---- sheet1.xml -------------------------------------------------------------------
  const colsXml = cols.length
    ? '<cols>' + cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 18}" customWidth="1"/>`).join('') + '</cols>'
    : ''
  const headerRow = '<row r="1">' + cols.map((c, i) =>
    `<c r="${colLetter(i + 1)}1" s="1" t="inlineStr"><is><t>${xmlEscape(c.header)}</t></is></c>`).join('') + '</row>'
  const dataRows = data.map((row, r) => {
    const rowNum = r + 2
    const cells = cols.map((c, i) => {
      const v = row[c.key]
      const ref = `${colLetter(i + 1)}${rowNum}`
      if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" t="n"><v>${v}</v></c>`
      const style = c.wrap ? ' s="2"' : ''
      return `<c r="${ref}"${style} t="inlineStr"><is><t>${xmlEscape(v)}</t></is></c>`
    }).join('')
    return `<row r="${rowNum}">${cells}</row>`
  }).join('')

  const sheetView = freezeHeader
    ? `<sheetViews><sheetView tabSelected="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView tabSelected="1" workbookViewId="0"/></sheetViews>`
  const autoFilterXml = autoFilter ? `<autoFilter ref="A1:${lastColLetter}${lastRow}"/>` : ''

  const sheetXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    sheetView + colsXml +
    `<sheetData>${headerRow}${dataRows}</sheetData>` +
    autoFilterXml +
    '</worksheet>'

  // ---- workbook + rels + content types ---------------------------------------------
  const workbookXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${xmlEscape(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets>` +
    '</workbook>'

  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>'

  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>'

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '</Types>'

  return buildZip([
    { name: '[Content_Types].xml', content: contentTypes },
    { name: '_rels/.rels', content: rootRels },
    { name: 'xl/workbook.xml', content: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookRels },
    { name: 'xl/styles.xml', content: stylesXml },
    { name: 'xl/worksheets/sheet1.xml', content: sheetXml },
  ])
}
