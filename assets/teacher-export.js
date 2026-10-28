const HEADERS = ['Nombre de la materia', 'Nombre', 'Apellido', 'Correo', 'Teléfono', 'Equipo',
  'Tipo de documento', 'País emisor (ISO)', 'Cédula o pasaporte', 'Edad (años)', 'Revisión de matrícula'];
const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

function xmlText(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}

function studentRows(overviews) {
  return overviews.flatMap(overview => {
    const teams = new Map(overview.topics.map(topic => [topic.id, topic.name]));
    return overview.students.map(student => [
      overview.course.name, student.firstName, student.lastName, student.email, student.phone,
      student.topicId ? teams.get(student.topicId) || 'Equipo no disponible' : 'Sin equipo',
      student.documentType === 'cedula' ? 'Cédula' : student.documentType === 'passport' ? 'Pasaporte' : '',
      student.documentCountry || '', student.documentNumber || student.nationalId || '',
      Number.isInteger(student.age) && student.age >= 1 && student.age <= 120 ? student.age : null,
      student.enrollmentReview === true ? 'Por verificar' : ''
    ]);
  }).sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'es') ||
    String(a[2]).localeCompare(String(b[2]), 'es') || String(a[1]).localeCompare(String(b[1]), 'es'));
}

function worksheet(rows) {
  const lastColumn = String.fromCharCode(64 + HEADERS.length);
  const range = `A1:${lastColumn}${rows.length + 1}`;
  const cells = [HEADERS, ...rows].map((row, index) => `<row r="${index + 1}">${row.map((value, column) =>
    index && column === 9 && value === null
      ? `<c r="J${index + 1}" s="2"/>`
      : index && column === 9 && typeof value === 'number'
      ? `<c r="${String.fromCharCode(65 + column)}${index + 1}" t="n" s="2"><v>${value}</v></c>`
      : `<c r="${String.fromCharCode(65 + column)}${index + 1}" t="inlineStr" s="${index ? 0 : 1}"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`
  ).join('')}</row>`).join('');
  return `${XML_HEADER}<worksheet xmlns="${MAIN_NS}"><dimension ref="${range}"/>` +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="17"/><cols><col min="1" max="1" width="48" customWidth="1"/><col min="2" max="3" width="22" customWidth="1"/>' +
    '<col min="4" max="4" width="35" customWidth="1"/><col min="5" max="6" width="22" customWidth="1"/>' +
    '<col min="7" max="7" width="22" customWidth="1"/><col min="8" max="8" width="24" customWidth="1"/>' +
    '<col min="9" max="9" width="28" customWidth="1"/><col min="10" max="10" width="16" customWidth="1"/><col min="11" max="11" width="26" customWidth="1"/></cols>' +
    `<sheetData>${cells}</sheetData><autoFilter ref="${range}"/></worksheet>`;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(chunks) {
  const result = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

// XLSX is a ZIP of XML parts. Stored entries keep the browser bundle small.
function zip(parts) {
  const encoder = new TextEncoder(), files = [], directory = [];
  let offset = 0;
  for (const [path, content] of Object.entries(parts)) {
    const name = encoder.encode(path), data = encoder.encode(content), crc = crc32(data);
    const local = new Uint8Array(30 + name.length), header = new DataView(local.buffer);
    header.setUint32(0, 0x04034b50, true); header.setUint16(4, 20, true);
    header.setUint16(10, 0, true); header.setUint16(12, 0x0021, true);
    header.setUint32(14, crc, true); header.setUint32(18, data.length, true); header.setUint32(22, data.length, true);
    header.setUint16(26, name.length, true); local.set(name, 30);
    files.push(local, data);
    const central = new Uint8Array(46 + name.length), info = new DataView(central.buffer);
    info.setUint32(0, 0x02014b50, true); info.setUint16(4, 20, true); info.setUint16(6, 20, true);
    info.setUint16(12, 0, true); info.setUint16(14, 0x0021, true);
    info.setUint32(16, crc, true); info.setUint32(20, data.length, true); info.setUint32(24, data.length, true);
    info.setUint16(28, name.length, true); info.setUint32(42, offset, true); central.set(name, 46);
    directory.push(central); offset += local.length + data.length;
  }
  const directoryLength = directory.reduce((length, entry) => length + entry.length, 0);
  const end = new Uint8Array(22), footer = new DataView(end.buffer);
  footer.setUint32(0, 0x06054b50, true); footer.setUint16(8, directory.length, true);
  footer.setUint16(10, directory.length, true); footer.setUint32(12, directoryLength, true);
  footer.setUint32(16, offset, true);
  return concat([...files, ...directory, end]);
}

export function allCoursesXlsx(overviews) {
  const rows = studentRows(overviews);
  return zip({
    '[Content_Types].xml': `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    '_rels/.rels': `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `${XML_HEADER}<workbook xmlns="${MAIN_NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Estudiantes" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml': worksheet(rows),
    'xl/styles.xml': `${XML_HEADER}<styleSheet xmlns="${MAIN_NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF28594C"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
  });
}
