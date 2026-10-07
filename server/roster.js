import ExcelJS from 'exceljs';
import { InputError } from './errors.js';

const clean = value => String(value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
const key = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
const heading = value => key(value).replace(/[^a-z0-9]/g, '');
const columns = {
  user: ['usuario', 'usuari o', 'userid', 'idusuario', 'matricula', 'codigoestudiante'],
  last: ['apellido', 'apellidos'],
  first: ['nombre', 'nombres'],
};

function cellText(value) {
  if (typeof value === 'string' || typeof value === 'number') return clean(value);
  if (value && typeof value === 'object') {
    if (typeof value.text === 'string') return clean(value.text);
    if (Array.isArray(value.richText)) return clean(value.richText.map(part => part.text).join(''));
  }
  return '';
}

function parseDelimited(text, delimiter) {
  const rows = []; let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (ch === '"') quoted = false;
      else value += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(clean(value)); value = ''; }
    else if (ch === '\n') { row.push(clean(value)); rows.push(row); row = []; value = ''; }
    else if (ch !== '\r') value += ch;
  }
  if (quoted) throw new InputError('Hay comillas sin cerrar en la lista.');
  row.push(clean(value)); rows.push(row);
  return rows;
}

function parseMarkdown(text) {
  return text.split(/\r?\n/).map(line => line.trim())
    .filter(line => line.startsWith('|') && line.endsWith('|'))
    .map(line => line.slice(1, -1).split('|').map(clean))
    .filter(row => !row.every(value => /^[-: ]+$/.test(value)));
}

export function rowsFromPaste(text) {
  if (typeof text !== 'string' || text.length > 180_000) throw new InputError('Pega una lista de hasta 180 000 caracteres.');
  const source = text.trim();
  if (!source) throw new InputError('Pega una tabla con estudiantes.');
  const rows = source.startsWith('|') ? parseMarkdown(source) : parseDelimited(source, source.includes('\t') ? '\t' : ',');
  return normalizeRows(rows);
}

export async function rowsFromXlsx(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.byteLength < 100 || buffer.byteLength > 1_000_000) throw new InputError('El archivo XLSX debe tener menos de 1 MB.');
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer); }
  catch { throw new InputError('No se pudo leer el archivo XLSX.'); }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new InputError('El archivo no contiene hojas de cálculo.');
  const rows = [];
  for (let n = 1; n <= Math.min(sheet.rowCount, 1500); n++) {
    const row = sheet.getRow(n);
    rows.push(Array.from({ length: Math.min(Math.max(row.cellCount, 3), 30) }, (_, i) => cellText(row.getCell(i + 1).value)));
  }
  return normalizeRows(rows);
}

export function normalizeRows(rows) {
  if (rows.length > 1500) throw new InputError('Importa un máximo de 1 500 filas a la vez.');
  const headerAt = rows.findIndex(row => row.some(v => columns.last.map(heading).includes(heading(v))) && row.some(v => columns.first.map(heading).includes(heading(v))));
  const header = headerAt >= 0 ? rows[headerAt].map(heading) : ['apellido', 'nombre'];
  const pick = options => header.findIndex(value => options.map(heading).includes(value));
  const lastIndex = pick(columns.last), firstIndex = pick(columns.first), userIndex = pick(columns.user);
  if (lastIndex < 0 || firstIndex < 0) throw new InputError('La lista necesita las columnas Apellido y Nombre.');
  const source = rows.slice(headerAt >= 0 ? headerAt + 1 : 0);
  const parsed = source.map((row, index) => ({
    institutionalUser: userIndex >= 0 ? clean(row[userIndex]) : '',
    lastName: clean(row[lastIndex]), firstName: clean(row[firstIndex]),
    sourceRow: (headerAt >= 0 ? headerAt + 1 : 0) + index + 1,
  })).filter(row => (row.firstName || row.lastName) &&
    !(columns.first.map(heading).includes(heading(row.firstName)) && columns.last.map(heading).includes(heading(row.lastName))));
  if (!parsed.length) throw new InputError('No se encontraron estudiantes en esa lista.');
  if (parsed.length > 1000) throw new InputError('Importa un máximo de 1 000 estudiantes a la vez.');
  for (const row of parsed) {
    if (!row.firstName || !row.lastName || row.firstName.length > 80 || row.lastName.length > 100 || row.institutionalUser.length > 80)
      throw new InputError(`Revisa nombre y apellido en la fila ${row.sourceRow}.`);
  }
  return parsed;
}

export function rosterKey(row) { return key(`${row.lastName} ${row.firstName}`); }
export function userKey(row) { return key(row.institutionalUser); }
