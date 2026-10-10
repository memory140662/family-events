// 執行：node test.js —— 用假的 Apps Script 環境載入 Code.gs，驗證報名與 Bot 的核心規則
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const sheets = {}; // 綁定本程式的那一份試算表（所有群組共用）
const fetched = [];
let reads = 0; // 讀試算表次數：每次約 0.5～1 秒，是載入慢的主因
const fakeSheet = () => {
  const data = [];
  return {
    // 格子可放 { v, disp } 模擬「被試算表轉成日期」：getValues 拿到日期物件 v，畫面上顯示 disp
    appendRow: r => data.push(r),
    getLastRow: () => data.length,
    getDataRange: () => ({
      getValues: () => data.map(r => r.map(x => x && x.disp ? x.v : x)),
      getDisplayValues: () => (reads++, data).map(r => r.map(x => x && x.disp ? x.disp : String(x))),
    }),
    getRange: row => ({ setNumberFormat() { return this; }, setValues: ([v]) => { data[row - 1] = v; } }),
    deleteRow: row => data.splice(row - 1, 1),
  };
};
let lineGroupName = '江家群組'; // LINE 上目前的群組名稱
let uuid = 0, clock = '2026-11-01T12:00';
const ctx = {
  SpreadsheetApp: { getActive: () => ({ getSheetByName: n => sheets[n], insertSheet: n => (sheets[n] = fakeSheet()) }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => ({ HOOK_KEY: 'k', LIFF_ID: 'L', CHANNEL_TOKEN: 't' })[k] }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: { formatDate: (d, tz, f) => f.includes('HH') ? clock : clock.slice(0, 10), getUuid: () => 'ev' + ++uuid + '-xxxxxxx' }, // 「今天」固定為 2026-11-01
  UrlFetchApp: { fetch: (url, opt) => { fetched.push({ url, opt }); return { getContentText: () => JSON.stringify({ groupName: lineGroupName }) }; } },
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

// 私訊只回使用說明，不再要求共用試算表（也就不會曝露部署者的 Gmail）
say('你好', dm('u1'));
assert.match(lastReply(), /邀進家族群組/);
assert.doesNotMatch(lastReply(), /@/);

// 密鑰不對的 webhook 不能登記群組（防止有人偽造 LINE 事件）
hook([{ type: 'join', source: inGroup('G1'), replyToken: 'r' }], 'wrong');
assert.equal(call('u1', 'load').code, 'unbound', '未登記的群組連結無效，且前端能辨識原因');

// Bot 被邀進群組 → 自動登記並回覆帶群組 ID 的連結，不用任何設定
hook([{ type: 'join', source: inGroup('G1'), replyToken: 'r' }]);
assert.match(lastReply(), /liff\.line\.me\/L\?g=G1/);
assert.equal(call('u1', 'load').groupName, '江家群組');

// 舊版流程中加入、還沒登記的群組：打「#報名」就補登記，不會卡住
say('#報名', inGroup('G0', 'u1'));
assert.match(lastReply(), /g=G0/);
assert.ok(!call('u1', 'load', {}, 'G0').error);
say('#報名', inGroup('G0', 'u1'));
assert.equal(sheets.groups.getDataRange().getValues().filter(r => r[0] === 'G0').length, 1, '重複打「#報名」不會重複登記');

// 一般聊天不回應（不洗版、不碰聊天內容）；家人日常只打「報名」也不能觸發，要加 # 前綴
const before = fetched.length;
['晚餐吃什麼', '報名', '我要報名', '綁定', '#報名吧'].forEach(t => say(t, inGroup('G1', 'u1')));
assert.equal(fetched.length, before);
// 長輩用注音／手寫常打出全形「＃」或多一個空白，都要認得
[' #報名 ', '＃報名', '# 報名'].forEach(t => say(t, inGroup('G1', 'u1')));
assert.equal(fetched.length, before + 3);

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
assert.equal(sheets.events.getDataRange().getValues().filter(r => r[0] === party)[0][6], 'u1', '編輯後建立者不變');

// 稱呼打錯：新增了「汪」又換回原本的「江」→ 沒人用、也沒報名的「汪」自動消失，不會一直掛在「尚未回覆」
call('u6', 'join', { family: '汪' });
call('u6', 'join', { family: '江' });
assert.ok(!call('u6', 'load').families.includes('汪'));
// 但已經有報名的稱呼不能自動刪（報名會不見），留給管理者判斷
call('u7', 'join', { family: '汪汪' });
call('u7', 'signup', { eventId: party, count: 1 });
call('u7', 'join', { family: '江' });
assert.ok(call('u7', 'load').families.includes('汪汪'));

// 修改稱呼：自己的稱呼改名，同稱呼的其他成員與報名都跟著改，總數不變
call('u5', 'signup', { eventId: party, count: 2 });
const total0 = call('u5', 'load').events.find(e => e.id === party).total;
s = call('u5', 'rename', { family: '林家' });
assert.equal(s.family, '林家');
assert.ok(s.families.includes('林家') && !s.families.includes('林'));
ev = s.events.find(e => e.id === party);
assert.deepEqual([ev.replies.find(r => r.family === '林家').count, ev.total], [2, total0]);
// 不能改成已經有的稱呼（同場兩邊都有報名時無法判斷要留哪筆）
assert.match(call('u5', 'rename', { family: '江' }).error, /已經有了/);
assert.ok(call('u99', 'rename', { family: 'X' }).error, '還沒選稱呼的人不能改');

// 人數超出範圍、別的群組的活動、別的群組的連結都要擋下
assert.ok(call('u1', 'signup', { eventId: party, count: 9 }).error);
hook([{ type: 'join', source: inGroup('G2'), replyToken: 'r' }]);
call('u9', 'join', { family: '陳' }, 'G2');
assert.ok(call('u9', 'signup', { eventId: party, count: 2 }, 'G2').error, '不能報名別的群組的活動');
assert.equal(call('u9', 'load', {}, 'G2').events.length, 0, '看不到別的群組的活動');
assert.ok(call('u1', 'load', {}, 'GX').error, '未登記的群組連結無效');


// 試算表會把「2026-11-20」「18:00」自動轉成日期／時間（家人手動改試算表時也一定會）。
// 日期物件換算時區曾讓「週六 11:30」變成「週五 03:30」，所以要以試算表畫面上顯示的文字為準（日期物件故意給錯的時區）
sheets.events.appendRow(['evD', 'G1', '手改的聚餐', { v: new Date(Date.UTC(2026, 10, 19, 16)), disp: '2026/11/20' },
  { v: new Date(Date.UTC(1899, 11, 30, 10)), disp: '下午 6:00:00' }, '', 'u1', '']);
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
const n = sheets.events.getDataRange().getValues().length;
assert.deepEqual(call('u1', 'parse', { text: '晚餐吃什麼' }), { title: '晚餐吃什麼', date: '', time: '', place: '', entries: [] });
assert.equal(sheets.events.getDataRange().getValues().length, n, 'parse 只解析不寫入');

// 確認後建立：接龍的報名一併寫入，沒見過的家庭一併建立
s = call('u3', 'create', { title: '尾牙', date: '2026-12-20', entries: [{ family: '花', count: 1 }, { family: '阿姨', count: 2 }, { family: '壞', count: 99 }] });
ev = s.events.find(e => e.id === s.created); // 回傳新活動 id，卡片連結才能直接開到這一場
assert.equal(ev.title, '尾牙');
assert.equal(ev.total, 3);
assert.ok(s.families.includes('阿姨') && !s.families.includes('壞'), '人數不合理的行不匯入');

// #新活動：群組裡用家人原本的接龍格式直接建立活動，Bot 回新活動卡片
const lastMsg = () => JSON.parse(fetched.at(-1).opt.payload).messages[0];
const eventsIn = g => sheets.events.getDataRange().getValues().filter(r => r[1] === g);
say('#新活動\n12月慶生餐會邀約\n日時：\n12/12（六）11:30\n場所：龍潭-蔣府宴\n出席請接龍：\n花*1\n周*3+1', inGroup('G1', 'u3'));
assert.equal(lastMsg().type, 'flex');
assert.match(lastMsg().altText, /新活動：12月慶生餐會/);
assert.match(JSON.stringify(lastMsg()), /新增稱呼：周/, '接龍裡沒見過的稱呼要讓大家看得到，打錯字才發現得了');
assert.match(JSON.stringify(lastMsg()), /g=G1&e=/, '卡片按鈕直達這一場');
ev = call('u3', 'load').events.find(e => e.title === '12月慶生餐會');
assert.deepEqual([ev.date, ev.time, ev.place, ev.total, ev.canEdit], ['2026-12-12', '11:30', '龍潭-蔣府宴', 5, true], '發指令的人就是建立者，之後能用網頁編輯');
// 同一則再貼一次：不重複建立，回原本那場
const count = eventsIn('G1').length;
say('#新活動\n12月慶生餐會邀約\n12/12 11:30\n花*1', inGroup('G1', 'u1'));
assert.equal(eventsIn('G1').length, count);
assert.match(lastMsg().altText, /已建立/);
assert.match(JSON.stringify(lastMsg()), /花 1、周 4/, '重複時顯示這場實際的報名，不是這次貼的名單');
// 只打指令、缺日期、拿不到身分：都不建立，並告訴對方怎麼做
say('＃新活動', inGroup('G1', 'u1'));
assert.match(lastReply(), /例如/);
say('#新活動\n聚餐\n花*1', inGroup('G1', 'u1'));
assert.match(lastReply(), /找不到活動日期/);
say('#新活動\n春酒\n1/5', inGroup('G1'));
assert.match(lastReply(), /無法辨識/);
assert.equal(eventsIn('G1').length, count);
// 還沒登記的群組也能直接用
say('#新活動\n春酒\n1/5 18:00', inGroup('G7', 'u1'));
assert.equal(call('u1', 'load', {}, 'G7').events[0].date, '2027-01-05');

// 活動結束（開始後 3 小時；沒填時間＝當天結束）就從列表消失，也不能再報名或編輯——長輩不會對著已結束的聚會改人數
const listed = (u, title) => call(u, 'load').events.some(e => e.title === title);
clock = '2026-11-14T14:59'; // 慶生餐會 12:00 開始，晚到的還能改人數
assert.ok(listed('u1', '11月慶生餐會'));
assert.ok(!call('u3', 'signup', { eventId: party, count: 2 }).error);
clock = '2026-11-14T15:00';
assert.ok(!listed('u1', '11月慶生餐會'));
const old = call('u1', 'load').past.find(e => e.id === party); // 結束後移到「以前辦過的聚會」，報名照樣看得到
assert.ok(old && old.total > 0 && old.replies.length);
assert.deepEqual(old.pending, [], '已結束的不列尚未回覆（成員會變，無法還原當時）');
assert.match(call('u3', 'signup', { eventId: party, count: 1 }).error, /結束/);
assert.match(edit('u1', { date: '2026-11-14', time: '12:00' }).error, /結束/, '結束後不能改（列表已看不到，只擋直接呼叫 API）');
clock = '2026-12-20T23:59'; // 尾牙沒填時間
assert.ok(listed('u3', '尾牙'));
clock = '2026-12-21T00:00';
assert.ok(!listed('u3', '尾牙'));

// 刪除打錯的稱呼：只能刪沒人選用的；未結束活動的報名一起取消，已結束的留作紀錄
clock = '2026-12-21T09:00'; // 尾牙（12/20，阿姨 2 位）已結束
const winter = call('u1', 'create', { title: '冬至', date: '2026-12-22', entries: [{ family: '阿姨', count: 2 }, { family: '花', count: 1 }] }).created;
const newYear = call('u1', 'create', { title: '元旦', date: '2027-01-01', entries: [{ family: '阿姨', count: 1 }] }).created;
s = call('u1', 'load');
assert.ok(s.unclaimed.includes('阿姨') && !s.unclaimed.includes('江'));
assert.match(call('u1', 'drop', { family: '江' }).error, /有人在用/, '有人選用的不能刪，否則那人會變成沒有稱呼');
assert.ok(call('u1', 'drop', { family: '不存在' }).error);
s = call('u1', 'drop', { family: '阿姨' });
assert.ok(!s.families.includes('阿姨'));
assert.deepEqual(s.events.find(e => e.id === winter).replies, [{ family: '花', count: 1 }], '刪掉的稱呼不再計入人數');
assert.deepEqual(s.events.find(e => e.id === newYear).replies, [], '多筆報名都要刪到，不能刪錯列');
assert.ok(sheets.signups.getDataRange().getValues().some(r => r[1] === '阿姨'), '已結束活動的報名保留');

// 進群歡迎：連結、隱私說明，以及可長按複製的「#新活動」範例——範例原封不動傳回群組就要能建立活動
hook([{ type: 'join', source: inGroup('G8'), replyToken: 'r' }]);
const welcome = JSON.parse(fetched.at(-1).opt.payload).messages.map(m => m.text);
assert.equal(welcome.length, 3);
assert.match(welcome[0], /g=G8[\s\S]*privacy\.html/);
say(welcome[2], inGroup('G8', 'u1'));
assert.equal(lastMsg().type, 'flex', '複製範例直接送出就建立活動');
assert.equal(call('u1', 'load', {}, 'G8').events[0].title, welcome[2].split('\n')[1], '活動名稱就是範例第一行（改範例不用改測試）');

// 群組在 LINE 改名：網頁打開後背景同步；查不到名稱（例如 Bot 已被移出）就保留原名
lineGroupName = '江家大家庭';
assert.equal(call('u1', 'syncName').groupName, '江家大家庭');
assert.equal(call('u1', 'load').groupName, '江家大家庭');
lineGroupName = '';
call('u1', 'syncName');
assert.equal(call('u1', 'load').groupName, '江家大家庭');

// 歷史活動：新到舊、最多 20 場，只看自己群組
hook([{ type: 'join', source: inGroup('G9'), replyToken: 'r' }]);
for (let d = 1; d <= 22; d++) call('u1', 'create', { title: '聚' + d, date: '2026-01-' + String(d).padStart(2, '0') }, 'G9');
const past = call('u1', 'load', {}, 'G9').past;
assert.equal(past.length, 20);
assert.deepEqual([past[0].title, past[19].title], ['聚22', '聚3']);

// 效能：每張分頁一次請求只讀一次
reads = 0; call('u1', 'load');
assert.equal(reads, 5, '打開網頁只讀 groups、families、members、events、signups 各一次');
reads = 0; call('u1', 'signup', { eventId: winter, count: 2 });
assert.equal(reads, 6, '報名：groups＋鎖內 members、events、signups＋寫入後只重讀 families 與被改的 signups');

console.log('全部通過 ✅');
