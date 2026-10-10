// 家族活動報名：LINE webhook + LIFF 前端 API，所有群組的資料都存在綁定本程式的試算表（以 groupId 區分）。
// 設定放在 Apps Script「專案設定 → 指令碼屬性」：CHANNEL_TOKEN、LIFF_ID、HOOK_KEY

const TABLES = {
  groups: ['groupId', 'name', 'sheetId', 'joinedAt'], // sheetId：舊版「各用戶試算表」留下的欄位，已不使用，保留以相容既有試算表
  families: ['groupId', 'name'],
  members: ['groupId', 'userId', 'family'],
  events: ['id', 'groupId', 'title', 'date', 'time', 'place', 'createdBy', 'createdAt'],
  signups: ['eventId', 'family', 'count', 'userId', 'updatedAt'],
};

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (body.events) { // LINE webhook（Apps Script 讀不到 header，改用網址上的密鑰驗證）
    if (e.parameter.hook === prop('HOOK_KEY')) body.events.forEach(onLineEvent);
    return ContentService.createTextOutput('ok');
  }
  let res;
  try { res = api(body); } catch (err) { res = { error: err.message, code: err.code }; }
  return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
}

// ---- LINE Bot：被邀進群組就自動登記並回覆連結；群組只回應「報名」，其他訊息一律忽略、不儲存 ----

function onLineEvent(ev) {
  const src = ev.source || {};
  const text = ev.type === 'message' && ev.message.type === 'text' ? ev.message.text.trim() : null;
  if (src.type === 'user') { // 私訊：只回使用說明
    if (text !== null) reply(ev.replyToken, '我是活動報名小幫手 🎉\n把我邀進家族群組，我就會回覆報名連結。');
    return;
  }
  const g = src.groupId;
  // 「綁定」：舊版流程的指令，舊群組可能還沒登記，照樣接受
  if (!g || !(ev.type === 'join' || text === '報名' || text === '綁定')) return;
  if (!rows('groups').some(r => r.groupId === g)) add('groups', { groupId: g, name: groupName(g), joinedAt: new Date().toISOString() });
  reply(ev.replyToken, ev.type === 'join'
    ? '大家好！我是活動報名小幫手 🎉\n報名、看名單、新增活動都點這裡：\n' + link(g) + '\n\n💡 建議把這則訊息設為公告。忘記連結時，在群組輸入「報名」即可。'
    : '活動報名請點：\n' + link(g));
}

function link(g) { return 'https://liff.line.me/' + prop('LIFF_ID') + '?g=' + g; }

function lineApi(path, payload) {
  const opt = { headers: { Authorization: 'Bearer ' + prop('CHANNEL_TOKEN') }, muteHttpExceptions: true };
  if (payload) Object.assign(opt, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload) });
  return UrlFetchApp.fetch('https://api.line.me/v2/bot/' + path, opt);
}

function reply(token, text) { lineApi('message/reply', { replyToken: token, messages: [{ type: 'text', text: text }] }); }

function groupName(g) {
  try { return JSON.parse(lineApi('group/' + g + '/summary').getContentText()).groupName || ''; } catch (e) { return ''; }
}

// ---- 前端 API：每個動作都回傳最新的完整狀態 ----

function api(b) {
  const group = rows('groups').find(r => r.groupId === b.g);
  if (!group) throw Object.assign(new Error('這個群組還沒登記'), { code: 'unbound' }); // 前端依 code 顯示專用說明
  if (!b.userId) throw new Error('無法取得 LINE 身分，請從 LINE 裡打開');
  const today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  if (b.action === 'parse') return parseChain(b.text, today); // 只解析、不寫入，讓發起人先確認
  let created; // 新活動的 id，讓前端的卡片連結能直接開到這一場
  if (b.action !== 'load') {
    const lock = LockService.getScriptLock(); // 多人同時送出時排隊寫入，避免互相覆蓋
    lock.waitLock(10000);
    try { created = write(b); } finally { lock.releaseLock(); }
  }
  const families = rows('families').filter(r => r.groupId === b.g).map(r => r.name);
  const me = rows('members').find(r => r.groupId === b.g && r.userId === b.userId);
  const events = rows('events').filter(r => r.groupId === b.g);
  return { groupName: group.name, families: families, family: me ? me.family : null, created: created,
           events: summarize(events, rows('signups'), families, today, b.userId) };
}

function write(b) {
  const now = new Date().toISOString();
  if (b.action === 'join') {
    const name = String(b.family || '').trim().slice(0, 10);
    if (!name) throw new Error('請輸入家庭名稱');
    addFamily(b.g, name);
    upsert('members', ['groupId', 'userId'], { groupId: b.g, userId: b.userId, family: name });
  } else if (b.action === 'create') {
    const id = Utilities.getUuid().slice(0, 8);
    add('events', Object.assign(eventFields(b), { id: id, groupId: b.g, createdBy: b.userId, createdAt: now }));
    (b.entries || []).forEach(en => { // 從接龍帶入的報名，發起人已在畫面上確認過
      const family = String(en.family || '').trim().slice(0, 10);
      const count = Number(en.count);
      if (!family || !(Number.isInteger(count) && count >= 0 && count <= 8)) return;
      addFamily(b.g, family);
      upsert('signups', ['eventId', 'family'], { eventId: id, family: family, count: count, userId: b.userId, updatedAt: now });
    });
    return id;
  } else if (b.action === 'edit') { // 只有建立者能改；報名不動，改期後大家不用重報
    const ev = rows('events').find(r => r.id === b.eventId && r.groupId === b.g);
    if (!ev) throw new Error('找不到這個活動');
    if (ev.createdBy !== b.userId) throw new Error('只有建立活動的人可以編輯');
    if (b.date < Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd')) throw new Error('日期不能早於今天');
    upsert('events', ['id'], Object.assign(ev, eventFields(b)));
  } else if (b.action === 'signup') {
    const me = rows('members').find(r => r.groupId === b.g && r.userId === b.userId);
    const count = Number(b.count);
    if (!me) throw new Error('請先選擇您是哪一家');
    if (!rows('events').some(r => r.id === b.eventId && r.groupId === b.g)) throw new Error('找不到這個活動');
    if (!(Number.isInteger(count) && count >= 0 && count <= 8)) throw new Error('人數不正確');
    upsert('signups', ['eventId', 'family'], { eventId: b.eventId, family: me.family, count: count, userId: b.userId, updatedAt: now });
  } else {
    throw new Error('未知的動作');
  }
}

// 新增與編輯共用的活動欄位檢查；日期要真的存在（擋 2026-02-31），時間只能空白或 HH:mm
function eventFields(b) {
  const title = String(b.title || '').trim().slice(0, 30);
  const date = String(b.date || ''), time = String(b.time || '');
  const real = /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(new Date(date + 'T00:00:00Z')) &&
    new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date;
  if (!title || !real) throw new Error('請填寫活動名稱與正確的日期');
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('時間格式不正確');
  return { title: title, date: date, time: time, place: String(b.place || '').trim().slice(0, 50) };
}

function addFamily(g, name) {
  if (!rows('families').some(r => r.groupId === g && r.name === name)) add('families', { groupId: g, name: name });
}

// 解析家族原本的接龍訊息；解析不到的欄位留空，由發起人手填
function parseChain(text, today) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const all = lines.join('\n');
  const pad = n => String(n).padStart(2, '0');
  let date = '';
  const md = all.match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/);
  if (md && md[1] >= 1 && md[1] <= 12 && md[2] >= 1 && md[2] <= 31) {
    const y = Number(today.slice(0, 4)), mmdd = pad(md[1]) + '-' + pad(md[2]);
    date = (y + '-' + mmdd >= today ? y : y + 1) + '-' + mmdd; // 接龍不寫年份：取今天以後最近的一次
  }
  const hm = all.match(/(\d{1,2})[:：](\d{2})/);
  const pi = lines.findIndex(l => /^(場所|地點|地址)\s*[:：]/.test(l));
  const place = pi < 0 ? '' : lines[pi].replace(/^(場所|地點|地址)\s*[:：]\s*/, '') || lines[pi + 1] || '';
  const entries = new Map(); // 同一家出現多次以最後一行為準
  lines.forEach(l => {
    const m = l.match(/^(.{1,10}?)\s*[*＊xX×]\s*(\d+(?:\s*[+＋]\s*\d+)*)$/); // 「華*3+1」＝大人 3＋小孩 1
    const n = m ? m[2].split(/[+＋]/).reduce((a, b) => a + Number(b), 0) : 0;
    if (m && n <= 8) entries.set(m[1], n);
  });
  return { title: (lines[0] || '').replace(/邀約$/, '').slice(0, 30), date: date, time: hm ? pad(hm[1]) + ':' + hm[2] : '',
           place: place.slice(0, 50), entries: [...entries].map(([family, count]) => ({ family: family, count: count })) };
}

// 統計：只列今天以後的活動，依日期時間排序；count 0 代表「不去」，不算尚未回覆
function summarize(events, signups, families, today, userId) {
  return events
    .filter(e => e.date >= today)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .map(e => {
      const replies = signups.filter(s => s.eventId === e.id).map(s => ({ family: s.family, count: Number(s.count) }));
      return { id: e.id, title: e.title, date: e.date, time: e.time, place: e.place, replies: replies,
               canEdit: e.createdBy === userId, // 只回布林，不把建立者的 userId 傳給其他人
               total: replies.reduce((n, r) => n + r.count, 0),
               pending: families.filter(f => !replies.some(r => r.family === f)) };
    });
}

// ---- 試算表：每個分頁一張表，第一列是欄位名，首次使用自動建立 ----

function table(name) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange('A:Z').setNumberFormat('@'); // 純文字，避免日期、時間被自動轉型
    sh.appendRow(TABLES[name]);
  }
  return sh;
}

function rows(name) {
  const range = table(name).getDataRange();
  const [head, ...data] = range.getValues(), shown = range.getDisplayValues().slice(1);
  return data.map((r, i) => {
    const o = { _row: i + 2 };
    head.forEach((h, j) => { o[h] = cell(r[j], shown[i][j], h); });
    return o;
  });
}

// 試算表會把「2026-11-14」「11:30」自動轉成日期（手動編輯時一定會）。日期物件換算時區曾差 8 小時，
// 所以改讀畫面上顯示的文字（如「2026/11/14」「下午 1:30:00」），畫面上看到幾點就是幾點
function cell(v, shown, h) {
  if (Object.prototype.toString.call(v) !== '[object Date]') return String(v);
  const pad = n => String(n).padStart(2, '0');
  if (h === 'time') {
    const m = shown.match(/(\d{1,2}):(\d{2})/);
    if (!m) return shown;
    let hh = Number(m[1]);
    if (/下午|PM/i.test(shown) && hh < 12) hh += 12;
    if (/上午|AM/i.test(shown) && hh === 12) hh = 0;
    return pad(hh) + ':' + m[2];
  }
  const d = shown.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  return d ? d[1] + '-' + pad(d[2]) + '-' + pad(d[3]) : shown;
}

// 寫入前先把那一列設成純文字，避免試算表把日期、時間自動轉型
function add(name, obj) {
  const sh = table(name), n = TABLES[name].length;
  sh.getRange(sh.getLastRow() + 1, 1, 1, n).setNumberFormat('@').setValues([TABLES[name].map(h => String(obj[h] ?? ''))]);
}

function upsert(name, keys, obj) {
  const hit = rows(name).find(r => keys.every(k => r[k] === String(obj[k])));
  if (!hit) return add(name, obj);
  table(name).getRange(hit._row, 1, 1, TABLES[name].length).setNumberFormat('@').setValues([TABLES[name].map(h => String(obj[h] ?? ''))]);
}

function prop(k) { return PropertiesService.getScriptProperties().getProperty(k); }
