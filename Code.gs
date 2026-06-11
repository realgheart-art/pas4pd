/*************************************************************
 *  PA S4PD — Backend Google Apps Script (API JSON)
 *  ---------------------------------------------------------
 *  Sistem pengurusan jadual pergerakan pegawai.
 *  Backend ini bercakap dengan frontend di GitHub Pages.
 *
 *  >>> LANGKAH WAJIB SEBELUM DEPLOY <<<
 *  1. Tukar nilai ADMIN_CODE dan GUEST_CODE di bawah.
 *     - ADMIN_CODE : untuk PA / pegawai yang boleh kemaskini.
 *     - GUEST_CODE : kod kongsi untuk lihat kalendar sahaja.
 *  2. Deploy > New deployment > Web app
 *       Execute as       : Me
 *       Who has access   : Anyone
 *  3. Salin URL Web App, tampal dalam fail config.js di frontend.
 *************************************************************/

const CONFIG = {
  SHEET_NAME: 'Jadual',

  // ===== TUKAR DUA KOD INI =====
  ADMIN_CODE: 'GANTI-KOD-ADMIN-2026',
  GUEST_CODE: 'GANTI-KOD-GUEST-2026'
  // =============================
};

// Susunan header — JANGAN ubah turutan tanpa kemaskini frontend.
const HEADERS = [
  'ID', 'Timestamp', 'Tarikh Mula', 'Tarikh Akhir', 'Agenda', 'Kategori',
  'Tempat', 'Masa', 'Pakaian', 'Mod Perjalanan', 'PIC Program',
  'Jawatan PIC', 'No Telefon PIC', 'Attachment URL'
];

// Indeks lajur No Telefon PIC (1-based) — disimpan sebagai teks supaya sifar di hadapan tak hilang.
const PHONE_COL = 13;

/* ============================ ROUTER ============================ */

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const action = body.action;
    const role = roleFromCode(body.code);

    // Semua tindakan perlu kod sah (guest atau admin).
    if (action === 'verify') {
      return json({ success: true, role: role });
    }

    if (!role) {
      return json({ success: false, error: 'Kod tidak sah.' });
    }

    if (action === 'list') {
      return json({ success: true, data: listEvents() });
    }

    // Mulai sini — tindakan tulis. Wajib admin.
    if (action === 'add' || action === 'update' || action === 'delete') {
      if (role !== 'admin') {
        return json({ success: false, error: 'Tindakan ini memerlukan akses admin.' });
      }
      if (action === 'add')    return json({ success: true, data: addEvent(body.event) });
      if (action === 'update') return json({ success: true, data: updateEvent(body.id, body.event) });
      if (action === 'delete') return json({ success: true, data: deleteEvent(body.id) });
    }

    return json({ success: false, error: 'Tindakan tidak dikenali: ' + action });
  } catch (err) {
    return json({ success: false, error: String(err) });
  }
}

function doGet() {
  // Pemeriksaan kesihatan ringkas bila URL dibuka dalam pelayar.
  return json({ success: true, message: 'PA S4PD API aktif.' });
}

/* ============================ AUTH ============================ */

function roleFromCode(code) {
  if (!code) return null;
  if (code === CONFIG.ADMIN_CODE) return 'admin';
  if (code === CONFIG.GUEST_CODE) return 'guest';
  return null;
}

/* ============================ DATA ============================ */

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
  }
  // Pastikan baris header wujud & betul.
  const firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const needsHeader = firstRow.join('') === '' || firstRow[0] !== 'ID';
  if (needsHeader) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    // Paksa lajur telefon jadi teks.
    sheet.getRange(2, PHONE_COL, sheet.getMaxRows() - 1, 1).setNumberFormat('@');
  }
  return sheet;
}

function listEvents() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  return rows.map(rowToObj).filter(function (o) { return o.id; });
}

function addEvent(ev) {
  const sheet = getSheet();
  const id = 'EV' + Date.now() + Math.floor(Math.random() * 1000);
  const row = objToRow(ev, id, new Date());
  sheet.appendRow(row);
  // Pastikan sel telefon baris baru kekal sebagai teks.
  sheet.getRange(sheet.getLastRow(), PHONE_COL).setNumberFormat('@').setValue(String(ev.telefon || ''));
  return { id: id };
}

function updateEvent(id, ev) {
  const sheet = getSheet();
  const rowNum = findRow(sheet, id);
  if (rowNum === -1) throw 'Rekod tidak dijumpai: ' + id;
  // Kekalkan Timestamp asal (lajur 2).
  const ts = sheet.getRange(rowNum, 2).getValue();
  const row = objToRow(ev, id, ts);
  sheet.getRange(rowNum, 1, 1, HEADERS.length).setValues([row]);
  sheet.getRange(rowNum, PHONE_COL).setNumberFormat('@').setValue(String(ev.telefon || ''));
  return { id: id };
}

function deleteEvent(id) {
  const sheet = getSheet();
  const rowNum = findRow(sheet, id);
  if (rowNum === -1) throw 'Rekod tidak dijumpai: ' + id;
  sheet.deleteRow(rowNum);
  return { id: id };
}

/* ============================ HELPERS ============================ */

function findRow(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function objToRow(ev, id, timestamp) {
  return [
    id,
    timestamp,
    ev.tarikhMula || '',
    ev.tarikhAkhir || '',
    ev.agenda || '',
    ev.kategori || '',
    ev.tempat || '',
    ev.masa || '',
    ev.pakaian || '',
    ev.modPerjalanan || '',
    ev.pic || '',
    ev.jawatanPic || '',
    String(ev.telefon || ''),
    ev.attachmentUrl || ''
  ];
}

function rowToObj(r) {
  return {
    id: r[0],
    timestamp: r[1] ? formatTs(r[1]) : '',
    tarikhMula: formatDate(r[2]),
    tarikhAkhir: formatDate(r[3]),
    agenda: r[4],
    kategori: r[5],
    tempat: r[6],
    masa: r[7],
    pakaian: r[8],
    modPerjalanan: r[9],
    pic: r[10],
    jawatanPic: r[11],
    telefon: String(r[12]),
    attachmentUrl: r[13]
  };
}

// Pastikan tarikh sentiasa dalam format YYYY-MM-DD walaupun Sheets simpan sebagai objek Date.
function formatDate(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(v);
}

function formatTs(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  }
  return String(v);
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
