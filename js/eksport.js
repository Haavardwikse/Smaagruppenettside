// Eksport av fremmøte: én Excel-fil per gruppe, samlet i en mappe (zip).
// Formatet følger «Fremmøte smågrupper»-arket: datoer, starttid, gjennomføring og timer
// øverst, én rad per deltaker med «x» for oppmøte.
// Lager .xlsx og .zip selv (ingen eksterne biblioteker).

const enc = new TextEncoder();

// ---------------------------------------------------------------------
//  Zip (lagret uten komprimering, UTF-8-filnavn)
// ---------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

/** files: [{ name: 'mappe/fil.xlsx', data: Uint8Array | string }] → Uint8Array */
export function zip(files, when = new Date()) {
  const { time, date } = dosDateTime(when);
  const local = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(6, 0x0800, true); // UTF-8-filnavn
    head.setUint16(8, 0, true); // lagret
    head.setUint16(10, time, true);
    head.setUint16(12, date, true);
    head.setUint32(14, crc, true);
    head.setUint32(18, data.length, true);
    head.setUint32(22, data.length, true);
    head.setUint16(26, name.length, true);
    head.setUint16(28, 0, true);
    local.push(new Uint8Array(head.buffer), name, data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, time, true);
    cd.setUint16(14, date, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const parts = [...local, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of parts) { out.set(p, pos); pos += p.length; }
  return out;
}

// ---------------------------------------------------------------------
//  Excel (.xlsx)
// ---------------------------------------------------------------------

const xml = (s) => String(s)
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function colName(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// Stiler (cellXfs): 0 vanlig, 1 fet, 2 fet høyrejustert, 3 midtstilt, 4 klokkeslett midtstilt
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="20" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** rows: Array<Array<{v, s?} | null>> ; tall blir tall, tekst blir tekst */
function sheetXml(rows, widths) {
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const body = rows.map((cells, r) => {
    const cs = cells.map((c, i) => {
      if (!c || c.v === null || c.v === undefined || c.v === '') return '';
      const ref = `${colName(i)}${r + 1}`;
      const s = c.s ? ` s="${c.s}"` : '';
      if (typeof c.v === 'number') return `<c r="${ref}"${s}><v>${c.v}</v></c>`;
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(c.v)}</t></is></c>`;
    }).join('');
    return `<row r="${r + 1}">${cs}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${body}</sheetData></worksheet>`;
}

export function xlsx(sheetName, rows, widths) {
  const name = xml(safeSheetName(sheetName));
  return zip([
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: STYLES },
    { name: 'xl/worksheets/sheet1.xml', data: sheetXml(rows, widths) },
  ]);
}

function safeSheetName(s) {
  const clean = String(s || 'Fremmøte').replace(/[[\]:*?/\\]/g, '-').replace(/^'+|'+$/g, '').trim();
  return (clean || 'Fremmøte').slice(0, 31);
}

/** Filnavn som virker på Windows, Mac og telefon. */
export function safeFileName(s) {
  const clean = String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').replace(/[. ]+$/, '').trim();
  return clean.slice(0, 120) || 'Gruppe';
}

// ---------------------------------------------------------------------
//  Fremmøteark for én gruppe
// ---------------------------------------------------------------------

const GENDER = { mann: 'Male', kvinne: 'Female' };

function dateText(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function timeFraction(t) {
  const [h, m] = String(t || '19:00').split(':').map(Number);
  return Math.round(((h * 60 + (m || 0)) / 1440) * 1e10) / 1e10;
}

/**
 * meetings: [{ meeting_date, start_time, hours, mode, attendance: [{member_id}] }] sortert på dato
 * people:   [{ id, full_name, postal_code, city, gender, birth_year }]
 */
export function attendanceRows(meetings, people) {
  const L = 7; // kolonne H er første samling (A–F deltakerinfo, G etiketter)
  const pad = (row) => { while (row.length < L) row.push(null); return row; };
  const r1 = pad([]); r1[6] = { v: 'Dato', s: 2 };
  const r2 = pad([]); r2[6] = { v: 'Starttid', s: 2 };
  const r3 = pad([]); r3[6] = { v: 'Hvordan er samlingen gjennomført?', s: 2 };
  const r4 = ['Navn', 'Postnummer', 'Poststed', 'Telefon', 'Kjønn', 'Fødselsår'].map((v) => ({ v, s: 1 }));
  r4.push({ v: 'Timer', s: 2 });
  for (const mt of meetings) {
    r1.push({ v: dateText(mt.meeting_date), s: 3 });
    r2.push({ v: timeFraction(mt.start_time), s: 4 });
    r3.push({ v: mt.mode || 'Fysisk', s: 3 });
    r4.push({ v: Number(mt.hours ?? 2), s: 3 });
  }
  const present = meetings.map((mt) => new Set((mt.attendance || []).map((a) => a.member_id)));
  const rows = [r1, r2, r3, r4];
  for (const p of people) {
    const row = [
      { v: p.full_name },
      { v: p.postal_code || '' },
      { v: p.city || '' },
      null,
      { v: GENDER[p.gender] || '' },
      p.birth_year ? { v: Number(p.birth_year) } : null,
      null,
    ];
    for (const set of present) row.push(set.has(p.id) ? { v: 'x', s: 3 } : null);
    rows.push(row);
  }
  const widths = [26, 12, 14, 11, 9, 10, 32, ...meetings.map(() => 11)];
  return { rows, widths };
}

/**
 * Lager zip med én .xlsx per gruppe.
 * groups: [{ id, name, active }], meetings: [{ group_id, ... }], members: alle deltakere (også arkiverte)
 */
export function buildExport({ groups, meetings, members, folder }) {
  const byGroup = new Map();
  for (const mt of meetings) {
    if (!(mt.attendance || []).length) continue; // tomme samlinger tas ikke med
    if (!byGroup.has(mt.group_id)) byGroup.set(mt.group_id, []);
    byGroup.get(mt.group_id).push(mt);
  }
  const memberById = new Map(members.map((m) => [m.id, m]));
  const used = new Set();
  const files = [];
  const sorted = [...groups].sort((a, b) => a.name.localeCompare(b.name, 'nb'));
  for (const g of sorted) {
    const mts = (byGroup.get(g.id) || []).sort((a, b) => a.meeting_date.localeCompare(b.meeting_date));
    if (!g.active && mts.length === 0) continue;
    // Med i lista: aktive deltakere i gruppen + alle som har vært til stede i perioden
    // (også hvis de senere er arkivert eller flyttet).
    const ids = new Set(members.filter((m) => m.group_id === g.id && !m.archived_at).map((m) => m.id));
    for (const mt of mts) for (const a of mt.attendance || []) ids.add(a.member_id);
    const people = [...ids].map((id) => memberById.get(id)).filter(Boolean)
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'nb'));
    const { rows, widths } = attendanceRows(mts, people);
    let base = safeFileName(g.name);
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n})`;
    used.add(name.toLowerCase());
    files.push({ name: `${folder}/${name}.xlsx`, data: xlsx(g.name, rows, widths), group: g.name, meetings: mts.length, people: people.length });
  }
  return { files, zip: zip(files.map(({ name, data }) => ({ name, data }))) };
}
