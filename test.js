// 執行：node test.js —— 用假的 Apps Script 環境載入 Code.gs，驗證報名與 Bot 的核心規則
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const books = { main: {}, S1: {}, S2: {} }; // main＝主試算表；S1、S2＝已共用給部署帳號的用戶試算表
const fetched = [];
const fakeSheet = () => {
  const data = [];
  return {
    appendRow: r => data.push(r),
    getDataRange: () => ({ getValues: () => data }),
    getRange: row => ({ setNumberFormat() {}, setValues: ([v]) => { data[row - 1] = v; } }),
    getParent: () => ({ getSpreadsheetTimeZone: () => 'Asia/Taipei' }),
  };
};
const book = id => ({ getSheetByName: n => books[id][n], insertSheet: n => (books[id][n] = fakeSheet()) });
let uuid = 0;
const ctx = {
  SpreadsheetApp: {
    getActive: () => book('main'),
    openById: id => { if (!books[id]) throw new Error('沒有權限'); return book(id); },
  },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'bot@gmail.com' }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => ({ HOOK_KEY: 'k', LIFF_ID: 'L', CHANNEL_TOKEN: 't' })[k] }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: { // 「現在」固定為 2026-11-01；其他日期照實格式化（假環境忽略時區，測試資料用 UTC）
    formatDate: (d, tz, f) => f === 'HH:mm' ? d.toISOString().slice(11, 16)
      : Math.abs(d - Date.now()) < 60000 ? '2026-11-01' : d.toISOString().slice(0, 10), getUuid: () => 'ev' + ++uuid + '-xxxxxxx' },
  UrlFetchApp: { fetch: (url, opt) => { fetched.push({ url, opt }); return { getContentText: () => '{"groupName":"江家群組"}' }; } },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return this; } }) },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/Code.gs', 'utf8'), ctx);

const hook = (events, key = 'k') => ctx.doPost({ parameter: { hook: key }, postData: { contents: JSON.stringify({ events }) } });
const call = (userId, action, data = {}, g = 'G1') =>
  JSON.parse(ctx.doPost({ parameter: {}, postData: { contents: JSON.stringify({ g, userId, action, ...data }) } }).s);

const say = (text, src) => hook([{ type: 'message', source: src, replyToken: 'r', message: { type: 'text', text } }]);
const lastReply = () => JSON.parse(fetched.at(-1).opt.payload).messages[0].text;
const dm = userId => ({ type: 'user', userId });
const inGroup = (g, userId) => ({ type: 'group', groupId: g, userId });

// 私訊設定試算表：沒共用的打不開，要告訴使用者該共用給哪個帳號
say('設定試算表 https://docs.google.com/spreadsheets/d/NOPE/edit', dm('u1'));
assert.match(lastReply(), /打不開.*bot@gmail\.com/);
say('設定試算表 https://docs.google.com/spreadsheets/d/S1/edit#gid=0', dm('u1'));
assert.match(lastReply(), /設定完成/);
assert.ok(books.S1.signups, '設定時就在用戶試算表建好分頁（等於驗證可寫入）');
say('你好', dm('u1'));
assert.match(lastReply(), /設定試算表/, '其他私訊回使用說明');

// 加入群組只提示綁定，此時連結還不能用
hook([{ type: 'join', source: inGroup('G1'), replyToken: 'r' }]);
assert.match(lastReply(), /綁定/);
assert.equal(call('u1', 'load').code, 'unbound', '未綁定的群組連結無效，且前端能辨識原因');

// 密鑰不對的 webhook 不能綁定（防止有人偽造 LINE 事件）
hook([{ type: 'message', source: inGroup('G1', 'u1'), replyToken: 'r', message: { type: 'text', text: '綁定' } }], 'wrong');
assert.ok(call('u1', 'load').error);

// 沒設定試算表的人綁定 → 提示先私訊設定，群組仍未綁定
say('綁定', inGroup('G1', 'u7'));
assert.match(lastReply(), /私訊/);
assert.ok(call('u1', 'load').error);

// 已設定的人綁定 → 回覆帶群組 ID 的連結
say('綁定', inGroup('G1', 'u1'));
assert.match(lastReply(), /liff\.line\.me\/L\?g=G1/);
assert.equal(call('u1', 'load').groupName, '江家群組');

// 已綁定的群組，別人再打「綁定」也不能把資料導到自己的試算表
say('設定試算表 S2', dm('u8'));
say('綁定', inGroup('G1', 'u8'));
assert.match(lastReply(), /g=G1/);
assert.deepEqual(books.main.groups.getDataRange().getValues().filter(r => r[0] === 'G1').map(r => r[2]), ['S1']);

// 一般聊天不回應（不洗版、不碰聊天內容），只有「報名」才回連結
const before = fetched.length;
say('晚餐吃什麼', inGroup('G1', 'u1'));
assert.equal(fetched.length, before);
say(' 報名 ', inGroup('G1', 'u1'));
assert.equal(fetched.length, before + 1);

// 未選家庭不能報名；選過之後記住
assert.equal(call('u1', 'load').family, null);
call('u1', 'join', { family: '江' });
call('u2', 'join', { family: '江' }); // 同一家另一位成員
call('u3', 'join', { family: '花' });
call('u4', 'join', { family: '蓉' });
call('u5', 'join', { family: '林' });
assert.equal(call('u1', 'load').family, '江');
assert.deepEqual(call('u1', 'load').families, ['江', '花', '蓉', '林']);

// 新增活動：過期的不列出，依日期排序
call('u1', 'create', { title: '掃墓', date: '2026-11-28', time: '08:00' });
call('u1', 'create', { title: '11月慶生餐會', date: '2026-11-14', time: '11:30', place: '龍潭蔣府宴' });
call('u1', 'create', { title: '上個月聚餐', date: '2026-10-01' });
assert.ok(call('u1', 'create', { title: '', date: '2026-12-01' }).error, '活動名稱必填');
let s = call('u1', 'load');
assert.deepEqual(s.events.map(e => e.title), ['11月慶生餐會', '掃墓']);
const party = s.events[0].id;

// 報名統計：spec 範例 —— 花 1、江 3、蓉 不去、林 未回覆 → 共 4 位
call('u3', 'signup', { eventId: party, count: 1 });
call('u1', 'signup', { eventId: party, count: 3 });
call('u4', 'signup', { eventId: party, count: 0 });
let ev = call('u1', 'load').events[0];
assert.equal(ev.total, 4);
assert.deepEqual(ev.pending, ['林']);

// 同一家另一位成員改人數 → 覆蓋而不是累加（這正是接龍會出錯的地方）
ev = call('u2', 'signup', { eventId: party, count: 2 }).events[0];
assert.equal(ev.total, 3);
assert.deepEqual(ev.replies.find(r => r.family === '江'), { family: '江', count: 2 });

// 編輯：只有建立者（u1）能改；改時間後報名照舊，不用大家重報
assert.equal(call('u1', 'load').events.find(e => e.id === party).canEdit, true);
assert.equal(call('u3', 'load').events.find(e => e.id === party).canEdit, false);
const edit = (u, data) => call(u, 'edit', { eventId: party, title: '11月慶生餐會', date: '2026-11-14', time: '11:30', place: '龍潭蔣府宴', ...data });
assert.match(edit('u3', { time: '12:00' }).error, /建立/, '非建立者不能改（長輩誤觸、或改到別人的活動）');
assert.match(edit('u1', { date: '2026-10-31' }).error, /早於今天/, '改成過去日期會讓活動從列表消失');
assert.ok(edit('u1', { date: '2027-02-31' }).error, '不存在的日期不能存（直接呼叫 API 時）');
assert.ok(edit('u1', { time: '25:99' }).error, '時間只能空白或 HH:mm');
ev = edit('u1', { time: '12:00' }).events.find(e => e.id === party);
assert.deepEqual([ev.time, ev.total, ev.replies.length], ['12:00', 3, 3]);
assert.equal(books.S1.events.getDataRange().getValues().filter(r => r[0] === party)[0][6], 'u1', '編輯後建立者不變');

// 人數超出範圍、別的群組的活動、別的群組的連結都要擋下
assert.ok(call('u1', 'signup', { eventId: party, count: 9 }).error);
say('綁定', inGroup('G2', 'u8')); // u8 的試算表是 S2
call('u9', 'join', { family: '陳' }, 'G2');
assert.ok(call('u9', 'signup', { eventId: party, count: 2 }, 'G2').error, '不能報名別的群組的活動');
assert.equal(call('u9', 'load', {}, 'G2').events.length, 0, '看不到別的群組的活動');
assert.ok(call('u1', 'load', {}, 'GX').error, '未登記的群組連結無效');


// 資料存在綁定時的用戶試算表：G1 → S1、G2 → S2，主試算表只有對照表
assert.ok(books.S1.events.getDataRange().getValues().some(r => r[1] === 'G1'));
assert.ok(books.S2.families.getDataRange().getValues().some(r => r[1] === '陳'));
assert.ok(!books.S1.families.getDataRange().getValues().some(r => r[1] === '陳'), 'G2 的資料不能寫進 S1');
assert.deepEqual(Object.keys(books.main).sort(), ['groups', 'users']);

// 用戶改設定別的試算表，已綁定的群組照舊用原本那份，資料不會「消失」
say('設定試算表 S2', dm('u1'));
assert.equal(call('u1', 'load').events.length, 2);

// 試算表會把「2026-11-20」「18:00」自動轉成日期／時間（家人手動改試算表時也一定會），讀回來要還原成字串，網頁才不會顯示 NaN
books.S1.events.appendRow(['evD', 'G1', '手改的聚餐', new Date(Date.UTC(2026, 10, 20)), new Date(Date.UTC(1899, 11, 30, 18)), '', 'u1', '']);
ev = call('u1', 'load').events.find(e => e.id === 'evD');
assert.deepEqual([ev.date, ev.time], ['2026-11-20', '18:00']);

// 接龍匯入：用家人真正的寫法（spec 範例）解析出活動與已接龍的家庭
const chain = '11月慶生餐會邀約\n日時：\n11/14（六）11:30\n場所：龍潭-蔣府宴\n出席請接龍：\n花*1\n江*3 \n';
assert.deepEqual(call('u1', 'parse', { text: chain }), { title: '11月慶生餐會', date: '2026-11-14', time: '11:30',
  place: '龍潭-蔣府宴', entries: [{ family: '花', count: 1 }, { family: '江', count: 3 }] });
// 家人會寫「3+1」（大人＋小孩），要加總，不能整行漏掉
assert.deepEqual(call('u1', 'parse', { text: chain + '華*3+1\n' }).entries.at(-1), { family: '華', count: 4 });
// 接龍沒寫年份：已過的月日要算明年，不然活動一建立就「過期」看不到
assert.equal(call('u1', 'parse', { text: '春酒\n1/5 18:00\n林*2' }).date, '2027-01-05');
// 不是接龍的文字：什麼都不帶入，也不寫入任何資料
const n = books.S1.events.getDataRange().getValues().length;
assert.deepEqual(call('u1', 'parse', { text: '晚餐吃什麼' }), { title: '晚餐吃什麼', date: '', time: '', place: '', entries: [] });
assert.equal(books.S1.events.getDataRange().getValues().length, n, 'parse 只解析不寫入');

// 確認後建立：接龍的報名一併寫入，沒見過的家庭一併建立
s = call('u3', 'create', { title: '尾牙', date: '2026-12-20', entries: [{ family: '花', count: 1 }, { family: '阿姨', count: 2 }, { family: '壞', count: 99 }] });
ev = s.events.find(e => e.id === s.created); // 回傳新活動 id，卡片連結才能直接開到這一場
assert.equal(ev.title, '尾牙');
assert.equal(ev.total, 3);
assert.ok(s.families.includes('阿姨') && !s.families.includes('壞'), '人數不合理的行不匯入');

console.log('全部通過 ✅');
