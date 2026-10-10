// 家族活動報名：LINE webhook + LIFF 前端 API。
// 主試算表（綁定本程式）只存 users、groups 對照；家庭、活動、報名存在各用戶自己的試算表。
// 設定放在 Apps Script「專案設定 → 指令碼屬性」：CHANNEL_TOKEN、LIFF_ID、HOOK_KEY

const MAIN_TABLES = ['users', 'groups'];
const TABLES = {
  users: ['userId', 'sheetId', 'updatedAt'],
  groups: ['groupId', 'name', 'sheetId', 'joinedAt'],
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

// ---- LINE Bot：私訊「設定試算表」；群組只處理加入、「綁定」、「報名」，其他訊息一律忽略、不儲存 ----

const HELP = '我是活動報名小幫手 🎉\n① 建一個 Google 試算表，共用給 %s（編輯者）\n' +
  '② 在這裡傳：設定試算表 <試算表網址>\n③ 把我邀進家族群組，在群組輸入「綁定」';

function onLineEvent(ev) {
  const src = ev.source || {};
  const text = ev.type === 'message' && ev.message.type === 'text' ? ev.message.text.trim() : null;
  if (src.type === 'user') {
    if (text === null) return;
    const m = text.match(/^設定試算表\s*(\S+)/);
    return reply(ev.replyToken, m ? setSheet(src.userId, m[1]) : HELP.replace('%s', shareTo()));
  }
  const g = src.groupId;
  if (!g) return;
  const group = rows('groups').find(r => r.groupId === g);
  if (ev.type === 'join') {
    reply(ev.replyToken, '大家好！我是活動報名小幫手 🎉\n請已設定試算表的人在群組輸入「綁定」，就能開始使用。\n' +
      '還沒設定？加我好友後私訊我，我會教你。');
  } else if (text === '綁定' || text === '報名') {
    if (group) return reply(ev.replyToken, '活動報名請點：\n' + link(g));
    if (text === '報名') return reply(ev.replyToken, '這個群組還沒綁定，請已設定試算表的人輸入「綁定」。');
    const user = rows('users').find(r => r.userId === src.userId);
    if (!user) return reply(ev.replyToken, '找不到你的試算表。請先加我好友，私訊「設定試算表 <試算表網址>」，再回來輸入「綁定」。');
    add('groups', { groupId: g, name: groupName(g), sheetId: user.sheetId, joinedAt: new Date().toISOString() });
    reply(ev.replyToken, '✅ 綁定完成！報名、看名單、新增活動都點這裡：\n' + link(g) +
      '\n\n💡 建議把這則訊息設為公告。忘記連結時，在群組輸入「報名」即可。');
  }
}

// 驗證能寫入（順便建好分頁）才記錄；已綁定的群組各自存了 sheetId，不受影響
function setSheet(userId, url) {
  const id = (url.match(/\/d\/([\w-]+)/) || [, url])[1];
  try {
    const ss = SpreadsheetApp.openById(id);
    Object.keys(TABLES).filter(n => !MAIN_TABLES.includes(n)).forEach(n => table(n, ss));
  } catch (e) {
    return '❌ 打不開這份試算表。請確認網址正確，並已共用給 ' + shareTo() + '（編輯者）。';
  }
  upsert('users', ['userId'], { userId: userId, sheetId: id, updatedAt: new Date().toISOString() });
  return '✅ 試算表設定完成！把我邀進家族群組，在群組輸入「綁定」即可。';
}

function shareTo() { return Session.getEffectiveUser().getEmail(); }

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
  if (!group) throw Object.assign(new Error('這個群組還沒綁定'), { code: 'unbound' }); // 前端依 code 顯示專用說明
  userSheet = SpreadsheetApp.openById(group.sheetId);
  if (!b.userId) throw new Error('無法取得 LINE 身分，請從 LINE 裡打開');
  const today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  if (b.action === 'parse') return parseChain(b.text, today); // 只解析、不寫入，讓發起人先確認
  if (b.action !== 'load') {
    const lock = LockService.getScriptLock(); // 多人同時送出時排隊寫入，避免互相覆蓋
    lock.waitLock(10000);
    try { write(b); } finally { lock.releaseLock(); }
  }
  const families = rows('families').filter(r => r.groupId === b.g).map(r => r.name);
  const me = rows('members').find(r => r.groupId === b.g && r.userId === b.userId);
  const events = rows('events').filter(r => r.groupId === b.g);
  return { groupName: group.name, families: families, family: me ? me.family : null,
           events: summarize(events, rows('signups'), families, today) };
}

function write(b) {
  const now = new Date().toISOString();
  if (b.action === 'join') {
    const name = String(b.family || '').trim().slice(0, 10);
    if (!name) throw new Error('請輸入家庭名稱');
    addFamily(b.g, name);
    upsert('members', ['groupId', 'userId'], { groupId: b.g, userId: b.userId, family: name });
  } else if (b.action === 'create') {
    const title = String(b.title || '').trim().slice(0, 30);
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) throw new Error('請填寫活動名稱與日期');
    const id = Utilities.getUuid().slice(0, 8);
    add('events', { id: id, groupId: b.g, title: title, date: b.date,
                    time: String(b.time || ''), place: String(b.place || '').trim().slice(0, 50), createdBy: b.userId, createdAt: now });
    (b.entries || []).forEach(en => { // 從接龍帶入的報名，發起人已在畫面上確認過
      const family = String(en.family || '').trim().slice(0, 10);
      const count = Number(en.count);
      if (!family || !(Number.isInteger(count) && count >= 0 && count <= 8)) return;
      addFamily(b.g, family);
      upsert('signups', ['eventId', 'family'], { eventId: id, family: family, count: count, userId: b.userId, updatedAt: now });
    });
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
    const m = l.match(/^(.{1,10}?)\s*[*＊xX×]\s*(\d+)$/);
    if (m && Number(m[2]) <= 8) entries.set(m[1], Number(m[2]));
  });
  return { title: (lines[0] || '').replace(/邀約$/, '').slice(0, 30), date: date, time: hm ? pad(hm[1]) + ':' + hm[2] : '',
           place: place.slice(0, 50), entries: [...entries].map(([family, count]) => ({ family: family, count: count })) };
}

// 統計：只列今天以後的活動，依日期時間排序；count 0 代表「不去」，不算尚未回覆
function summarize(events, signups, families, today) {
  return events
    .filter(e => e.date >= today)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .map(e => {
      const replies = signups.filter(s => s.eventId === e.id).map(s => ({ family: s.family, count: Number(s.count) }));
      return { id: e.id, title: e.title, date: e.date, time: e.time, place: e.place, replies: replies,
               total: replies.reduce((n, r) => n + r.count, 0),
               pending: families.filter(f => !replies.some(r => r.family === f)) };
    });
}

// ---- 試算表：每個分頁一張表，第一列是欄位名，首次使用自動建立 ----

let userSheet; // 本次請求所屬群組的用戶試算表；每次請求都是獨立執行，不會互相干擾

function table(name, ss = MAIN_TABLES.includes(name) ? SpreadsheetApp.getActive() : userSheet) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange('A:Z').setNumberFormat('@'); // 純文字，避免日期、時間被自動轉型
    sh.appendRow(TABLES[name]);
  }
  return sh;
}

function rows(name) {
  const [head, ...data] = table(name).getDataRange().getValues();
  return data.map((r, i) => {
    const o = { _row: i + 2 };
    head.forEach((h, j) => { o[h] = String(r[j]); });
    return o;
  });
}

function add(name, obj) { table(name).appendRow(TABLES[name].map(h => String(obj[h] ?? ''))); }

function upsert(name, keys, obj) {
  const hit = rows(name).find(r => keys.every(k => r[k] === String(obj[k])));
  if (!hit) return add(name, obj);
  table(name).getRange(hit._row, 1, 1, TABLES[name].length).setValues([TABLES[name].map(h => String(obj[h] ?? ''))]);
}

function prop(k) { return PropertiesService.getScriptProperties().getProperty(k); }
