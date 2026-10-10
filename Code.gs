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
  cache = {};
  const body = JSON.parse(e.postData.contents);
  if (body.events) { // LINE webhook（Apps Script 讀不到 header，改用網址上的密鑰驗證）
    if (e.parameter.hook === prop('HOOK_KEY')) body.events.forEach(onLineEvent);
    return ContentService.createTextOutput('ok');
  }
  let res;
  try { res = api(body); } catch (err) { res = { error: err.message, code: err.code }; }
  return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
}

// ---- LINE Bot：被邀進群組就自動登記並回覆連結；群組只回應「#報名」「#新活動」，其他訊息一律忽略、不儲存 ----

function onLineEvent(ev) {
  const src = ev.source || {};
  const text = ev.type === 'message' && ev.message.type === 'text' ? ev.message.text.trim() : null;
  if (src.type === 'user') { // 私訊：只回使用說明
    if (text !== null) reply(ev.replyToken, '我是活動報名小幫手 🎉\n把我邀進家族群組，我就會回覆報名連結。');
    return;
  }
  const g = src.groupId;
  // 加 # 前綴避免家人日常只打「報名」就誤觸；全形、半形、中間有空白都接受。舊群組若還沒登記，打這個也會補登記
  const newEvent = text !== null && /^[#＃]\s*新活動/.test(text);
  if (!g || !(ev.type === 'join' || /^[#＃]\s*報名$/.test(text) || newEvent)) return;
  if (!rows('groups').some(r => r.groupId === g)) add('groups', { groupId: g, name: groupName(g), joinedAt: new Date().toISOString() });
  if (newEvent) return reply(ev.replyToken, chatEvent(g, src.userId, text.replace(/^[#＃]\s*新活動/, '')));
  reply(ev.replyToken, ev.type === 'join' ? [ // 範例獨立一則：長按複製整則就是可直接送出的指令（Gemini 文案）
    '大家好！我是活動報名小幫手 🎉\n報名、看名單、新增活動都點這裡：\n' + link(g) + '\n\n💡 建議把這則訊息設為公告。忘記連結時，在群組輸入「#報名」即可。' +
      '\n\n📌 小幫手會收到群組訊息，但只處理「#報名」「#新活動」指令，不儲存一般聊天，請安心使用。\n隱私說明：' + PRIVACY,
    '💬 想用接龍辦活動？\n長按複製下一則，改成你的活動內容後傳到群組，小幫手就會自動建立活動。\n\n💡 建立後要改時間、地點，建立的人點進網頁就能修改。',
    CHAT_EXAMPLE]
    : '活動報名請點：\n' + link(g));
}

const PRIVACY = 'https://memory140662.github.io/family-events/privacy.html';
const CHAT_EXAMPLE = '#新活動\n生餐會\n日時：01/01 11:30\n場所：家中\n小明*1\n小花*3';

// 「#新活動＋接龍內容」直接建立活動（明確指令才處理，不碰一般聊天）；回覆新活動卡片，有錯由建立者到網頁編輯
function chatEvent(g, userId, body) {
  if (!body.trim()) return '請在「#新活動」下面貼上活動內容，例如：\n' + CHAT_EXAMPLE;
  if (!userId) return '無法辨識你的 LINE 身分，請改用報名網頁新增活動：\n' + link(g); // 沒有建立者就沒人能編輯
  const p = parseChain(body, Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd'));
  if (!p.title || !p.date) return '找不到活動' + (p.title ? '日期（例如 11/14）' : '名稱') + '，沒有建立。格式範例：\n' +
    CHAT_EXAMPLE + '\n\n或點這裡用網頁新增：\n' + link(g);
  return locked(() => { // 查重與建立在同一個鎖裡，同時貼兩次也只會建一場
    const dup = rows('events').find(r => r.groupId === g && r.title === p.title && r.date === p.date);
    if (dup) { // 重複貼同一則：不重複建，卡片顯示這場「實際」的報名，而不是這次貼的名單
      const actual = rows('signups').filter(r => r.eventId === dup.id).map(r => ({ family: r.family, count: Number(r.count) }));
      return eventCard(g, dup, actual, [], '📢 此活動已建立');
    }
    const known = rows('families').filter(r => r.groupId === g).map(r => r.name);
    const added = p.entries.map(e => e.family).filter(f => !known.includes(f));
    const id = write(Object.assign({ action: 'create', g: g, userId: userId }, p));
    return eventCard(g, Object.assign({ id: id }, p), p.entries, added, '📢 新活動');
  });
}

// 新活動卡片（與網頁發的同款，Gemini 設計）；Bot 用 reply 回，不計訊息額度
function eventCard(g, e, entries, added, head) {
  const total = entries.reduce((n, x) => n + x.count, 0);
  const when = Number(e.date.slice(5, 7)) + '/' + Number(e.date.slice(8)) + '（' +
    '日一二三四五六'[new Date(e.date + 'T00:00:00Z').getUTCDay()] + '）' + (e.time ? ' ' + e.time : '');
  const text = (t, size, color, bold) => Object.assign({ type: 'text', text: t, size: size, color: color, wrap: true }, bold ? { weight: 'bold' } : {});
  const lines = [text('📅 ' + when, 'lg', '#1e293b', true), text('📍 ' + (e.place || '地點待定'), 'md', '#475569'),
    text('👥 ' + (entries.length ? '已報名：' + entries.map(x => x.family + ' ' + (x.count || '不去')).join('、') + '（共 ' + total + ' 位）' : '尚無人報名'), 'md', '#64748b')];
  if (added.length) lines.push(text('⚠️ 新增稱呼：' + added.join('、'), 'md', '#b45309'));
  return { type: 'flex', altText: head + '：' + e.title, contents: { type: 'bubble', size: 'mega',
    header: { type: 'box', layout: 'vertical', paddingBottom: 'none', contents: [text(head, 'lg', '#087f3c', true)] },
    body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [text(e.title, 'xxl', '#111111', true), { type: 'separator' },
      { type: 'box', layout: 'vertical', spacing: 'sm', contents: lines }] },
    footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#087f3c', height: 'md',
      action: { type: 'uri', label: '我要報名', uri: link(g) + '&e=' + e.id } }] } } };
}

function link(g) { return 'https://liff.line.me/' + prop('LIFF_ID') + '?g=' + g; }

function lineApi(path, payload) {
  const opt = { headers: { Authorization: 'Bearer ' + prop('CHANNEL_TOKEN') }, muteHttpExceptions: true };
  if (payload) Object.assign(opt, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload) });
  return UrlFetchApp.fetch('https://api.line.me/v2/bot/' + path, opt);
}

// msg 可以是一則或多則（reply 一次最多 5 則，都不計額度）
function reply(token, msg) { lineApi('message/reply', { replyToken: token, messages: [].concat(msg).map(m => typeof m === 'string' ? { type: 'text', text: m } : m) }); }

// 多人同時送出時排隊寫入，避免互相覆蓋
function locked(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  cache = {}; // 等鎖期間別人可能寫入過，鎖內重新讀
  try { return fn(); } finally { lock.releaseLock(); }
}

function groupName(g) {
  try { return JSON.parse(lineApi('group/' + g + '/summary').getContentText()).groupName || ''; } catch (e) { return ''; }
}

// ---- 前端 API：每個動作都回傳最新的完整狀態 ----

function api(b) {
  const group = rows('groups').find(r => r.groupId === b.g);
  if (!group) throw Object.assign(new Error('這個群組還沒登記'), { code: 'unbound' }); // 前端依 code 顯示專用說明
  if (!b.userId) throw new Error('無法取得 LINE 身分，請從 LINE 裡打開');
  const now = Utilities.formatDate(new Date(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm"), today = now.slice(0, 10);
  if (b.action === 'parse') return parseChain(b.text, today); // 只解析、不寫入，讓發起人先確認
  if (b.action === 'syncName') { // 前端畫面出來後在背景呼叫，不拖慢載入；LINE 改群組名稱不會通知 Bot，只能自己查
    const name = groupName(b.g);
    if (name && name !== group.name) locked(() => put('groups', group._row, Object.assign(group, { name: name })));
    return { groupName: group.name };
  }
  let created; // 新活動的 id，讓前端的卡片連結能直接開到這一場
  if (b.action !== 'load') created = locked(() => write(b));
  const families = rows('families').filter(r => r.groupId === b.g).map(r => r.name);
  const members = rows('members').filter(r => r.groupId === b.g), me = members.find(r => r.userId === b.userId);
  const events = rows('events').filter(r => r.groupId === b.g);
  return { groupName: group.name, families: families, family: me ? me.family : null, created: created,
           unclaimed: families.filter(f => !members.some(r => r.family === f)), // 可刪的稱呼：沒有人選用
           events: summarize(events, rows('signups'), families, now, b.userId),
           past: summarize(events, rows('signups'), families, now, b.userId, true) };
}

function write(b) {
  const now = new Date().toISOString();
  const taipei = Utilities.formatDate(new Date(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm"); // 鎖內才取時間，排隊等鎖時活動可能剛好結束
  if (b.action === 'join') {
    const name = String(b.family || '').trim().slice(0, 10);
    if (!name) throw new Error('請輸入稱呼');
    const prev = rows('members').find(r => r.groupId === b.g && r.userId === b.userId);
    addFamily(b.g, name);
    upsert('members', ['groupId', 'userId'], { groupId: b.g, userId: b.userId, family: name });
    if (prev && prev.family !== name) dropIfEmpty(b.g, prev.family); // 打錯後換回正確的稱呼，打錯的那個就自動消失
  } else if (b.action === 'rename') { // 只能改自己的稱呼；不能改成已有的（合併時同場兩邊都有報名無法判斷）
    const me = rows('members').find(r => r.groupId === b.g && r.userId === b.userId);
    const name = String(b.family || '').trim().slice(0, 10);
    if (!me) throw new Error('請先選擇您的稱呼');
    if (!name) throw new Error('請輸入稱呼');
    if (name === me.family) return;
    if (rows('families').some(r => r.groupId === b.g && r.name === name)) throw new Error('「' + name + '」已經有了，請回上一頁直接選它');
    const ids = rows('events').filter(r => r.groupId === b.g).map(r => r.id);
    updateWhere('families', r => r.groupId === b.g && r.name === me.family, { name: name });
    updateWhere('members', r => r.groupId === b.g && r.family === me.family, { family: name });
    updateWhere('signups', r => ids.includes(r.eventId) && r.family === me.family, { family: name });
  } else if (b.action === 'drop') { // 刪打錯的稱呼：有人選用就不能刪（那人換稱呼時會自動消失）
    const name = String(b.family || '');
    const hit = rows('families').find(r => r.groupId === b.g && r.name === name);
    if (!hit) throw new Error('找不到「' + name + '」');
    if (rows('members').some(r => r.groupId === b.g && r.family === name)) throw new Error('「' + name + '」有人在用，不能刪除');
    const open = rows('events').filter(r => r.groupId === b.g && !ended(r, taipei)).map(r => r.id); // 已結束的報名留作紀錄
    rows('signups').filter(r => open.includes(r.eventId) && r.family === name).reverse().forEach(r => del('signups', r._row)); // 由下往上刪，列號才不會位移
    del('families', hit._row);
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
    if (ended(ev, taipei)) throw new Error(ENDED);
    if (b.date < taipei.slice(0, 10)) throw new Error('日期不能早於今天');
    upsert('events', ['id'], Object.assign(ev, eventFields(b)));
  } else if (b.action === 'signup') {
    const me = rows('members').find(r => r.groupId === b.g && r.userId === b.userId);
    const count = Number(b.count);
    if (!me) throw new Error('請先選擇您的稱呼');
    const ev = rows('events').find(r => r.id === b.eventId && r.groupId === b.g);
    if (!ev) throw new Error('找不到這個活動');
    if (ended(ev, taipei)) throw new Error(ENDED);
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

// 沒有任何成員、也沒有任何報名的稱呼才移除；有報名的留給管理者到試算表判斷
function dropIfEmpty(g, name) {
  const ids = rows('events').filter(r => r.groupId === g).map(r => r.id);
  if (rows('members').some(r => r.groupId === g && r.family === name)) return;
  if (rows('signups').some(r => ids.includes(r.eventId) && r.family === name)) return;
  const hit = rows('families').find(r => r.groupId === g && r.name === name);
  if (hit) del('families', hit._row);
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

// 結束＝開始後 3 小時（晚到、現場臨時改人數還來得及）；沒填時間＝當天結束。now 為台灣時間 yyyy-MM-ddTHH:mm
function ended(e, now) {
  const end = e.time ? new Date(Date.parse(e.date + 'T' + e.time + 'Z') + 3 * 3600e3).toISOString().slice(0, 16) : e.date + 'T24:00';
  return now >= end;
}
const ENDED = '這場聚會已經結束囉！下次再一起參加';

// 統計：還沒結束的活動依日期時間排序；past 為已結束的最近 20 場（新到舊）。count 0 代表「不去」，不算尚未回覆
function summarize(events, signups, families, now, userId, past) {
  const list = events.filter(e => ended(e, now) === !!past).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return (past ? list.reverse().slice(0, 20) : list).map(e => {
      const replies = signups.filter(s => s.eventId === e.id).map(s => ({ family: s.family, count: Number(s.count) }));
      return { id: e.id, title: e.title, date: e.date, time: e.time, place: e.place, replies: replies,
               canEdit: e.createdBy === userId, // 只回布林，不把建立者的 userId 傳給其他人
               total: replies.reduce((n, r) => n + r.count, 0),
               pending: past ? [] : families.filter(f => !replies.some(r => r.family === f)) }; // 成員會變，已結束的無法還原當時誰沒回
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

// 每張分頁一次執行只讀一次（每次讀試算表約 0.5～1 秒）；寫入後清掉該表快取。回傳副本，呼叫端改了也不影響快取
let cache = {};
function rows(name) {
  if (!cache[name]) {
    const [head, ...data] = table(name).getDataRange().getDisplayValues();
    cache[name] = data.map((r, i) => {
      const o = { _row: i + 2 };
      head.forEach((h, j) => { o[h] = cell(r[j], h); });
      return o;
    });
  }
  return cache[name].map(o => Object.assign({}, o));
}

// 試算表會把「2026-11-14」「11:30」自動轉成日期（手動編輯時一定會）。日期物件換算時區曾差 8 小時，
// 所以一律讀畫面上顯示的文字（如「2026/11/14」「下午 1:30:00」），畫面上看到幾點就是幾點
function cell(shown, h) {
  if (h !== 'date' && h !== 'time') return shown;
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
  delete cache[name];
  const sh = table(name), n = TABLES[name].length;
  sh.getRange(sh.getLastRow() + 1, 1, 1, n).setNumberFormat('@').setValues([TABLES[name].map(h => String(obj[h] ?? ''))]);
}

function upsert(name, keys, obj) {
  const hit = rows(name).find(r => keys.every(k => r[k] === String(obj[k])));
  hit ? put(name, hit._row, obj) : add(name, obj);
}

function updateWhere(name, match, patch) { rows(name).filter(match).forEach(r => put(name, r._row, Object.assign(r, patch))); }

function del(name, row) { table(name).deleteRow(row); delete cache[name]; }

function put(name, row, obj) {
  delete cache[name];
  table(name).getRange(row, 1, 1, TABLES[name].length).setNumberFormat('@').setValues([TABLES[name].map(h => String(obj[h] ?? ''))]);
}

function prop(k) { return PropertiesService.getScriptProperties().getProperty(k); }
