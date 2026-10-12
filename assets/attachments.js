export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const FILE_TYPES = Object.freeze({
  jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp', gif:'image/gif',
  pdf:'application/pdf', txt:'text/plain', csv:'text/csv', doc:'application/msword',
  docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls:'application/vnd.ms-excel', xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt:'application/vnd.ms-powerpoint', pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation', zip:'application/zip'
});
export const ATTACHMENT_ACCEPT = Object.keys(FILE_TYPES).map(extension => '.' + extension).join(',');
export function attachmentInfo(file) {
  if (!file || !file.size) throw new Error('Elige un archivo que tenga contenido.');
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('El archivo supera los 10 MB. Elige uno más pequeño.');
  const extension = file.name.split('.').at(-1).toLowerCase();
  const type = FILE_TYPES[extension];
  if (!type) throw new Error('Puedes adjuntar imágenes, PDF, Word, Excel, PowerPoint, TXT, CSV o ZIP.');
  const name = file.name.replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(0,180);
  return { name, extension, type, size: file.size };
}
export function fileSizeLabel(size) {
  return size >= 1024*1024 ? (size/(1024*1024)).toLocaleString('es', {maximumFractionDigits:1}) + ' MB'
    : Math.max(1, Math.ceil(size/1024)) + ' KB';
}
