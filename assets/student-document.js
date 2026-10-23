// Normalize structure only; this does not verify a government-issued identity.
export function normalizeStudentDocument(type, number) {
  const value = String(number ?? '').trim().toUpperCase().replace(/[–—]/g, '-');
  if (value.length > 48) throw Error('Revisa el número de documento');
  if (type === 'cedula') {
    const parts = value.match(/^([1-9]|1[0-3])((?:AV|PI))?[\s-]+([0-9]{1,4})[\s-]+([0-9]{1,6})$/)
      || value.match(/^(PE|E|N)()[\s-]+([0-9]{1,4})[\s-]+([0-9]{1,6})$/);
    if (!parts) throw Error('Revisa la cédula: selecciona el prefijo y escribe tomo y asiento');
    return parts[1] + (parts[2] || '') + '-' + Number(parts[3]) + '-' + Number(parts[4]);
  }
  if (type === 'passport' && /^[A-Z0-9\s-]{4,32}$/.test(value)) {
    const compact = value.replace(/[\s-]/g, '');
    if (compact.length >= 4 && compact.length <= 24) return compact;
  }
  throw Error(type === 'passport' ? 'Revisa el número de pasaporte' : 'Selecciona cédula o pasaporte');
}
export const DOCUMENT_COUNTRIES = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
