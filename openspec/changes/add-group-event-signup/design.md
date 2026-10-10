## Context

見 proposal.md - Why。限制：全部免費、維護量最小、使用者（開發者）一人維護；終端使用者是長輩。

## Goals / Non-Goals

**Goals:** 一個前端檔、一個後端檔、一份試算表（所有群組共用、以 groupId 區分）；Bot 不消耗訊息額度。

**Non-Goals:** 刪除活動（改標題加「（取消）」或直接改試算表）、提醒推播（Bot push）、管理後台、ID Token 驗證、解除群組綁定（直接改主試算表）。

## Decisions

### 1. 架構：GitHub Pages（LIFF 前端）＋ Google Apps Script（後端）＋ Google 試算表
- 前端 `index.html`：原生 JS＋LIFF SDK，無建置流程。
- 後端 `Code.gs`：綁定試算表的 Apps Script Web App，一個 `doPost` 同時處理 LINE webhook 與前端 API。
- 前端託管待 task 4.0 驗證：若 LIFF（init、getProfile、sendMessages）在 Apps Script `HtmlService` 頁面（iframe、googleusercontent 網域）內可正常運作，改由 `doGet` 提供頁面並移除 GitHub Pages；否則維持 GitHub Pages。Google 雲端硬碟已不支援網頁託管。
- 替代方案：Firebase / Cloudflare Workers——需帳號與部署工具，維護成本較高；試算表可讓使用者直接查看與修正資料。

### 2. 群組辨識靠 Bot 的群組事件
LIFF 無法取得 groupId，故 Bot 在 join 事件取得 `source.groupId` 自動登記到 `groups` 表，並以 reply 回覆 `https://liff.line.me/<LIFF_ID>?g=<groupId>`。groupId 長且不可猜，兼作存取憑證；後端只接受已登記的 groupId。群組輸入「#報名」時若未登記（舊版「綁定」流程加入的群組）則補登記。

### 3. 群組通知用 `liff.sendMessages()`，不用 Bot push
push 到群組按成員數計入額度；sendMessages 以使用者本人身分發送、不計額度。需 `chat_message.write` scope，僅在從聊天室開啟時可用。

### 4. 身分：信任前端傳來的 LINE userId（不驗 ID Token）
使用者決定。家族內部使用，冒用風險可接受。

### 5. Webhook 驗證：URL 帶密鑰參數
Apps Script 的 `doPost` 讀不到 HTTP header，無法驗 `x-line-signature`。改在 webhook URL 加 `?hook=<HOOK_KEY>`，不符即忽略。

### 6. 資料表（試算表分頁，首次使用自動建立）
| 分頁 | 欄位 |
|---|---|
| families | groupId, name |
| members | groupId, userId, family |
| events | id, groupId, title, date, time, place, createdBy, createdAt |
| signups | eventId, family, count, userId, updatedAt |

signups 以 (eventId, family) 為鍵 upsert；寫入時用 `LockService` 避免同時送出互相覆蓋。

### 7. API（POST，`Content-Type: text/plain` 避免 CORS preflight）
`{action: 'load'|'join'|'create'|'signup', g, userId, ...}`，每個寫入動作回傳與 `load` 相同的最新狀態，前端只需一個 render。

### 8. 統計邏輯抽成純函式 `summarize()`，以 Node 測試
`test.js` 用 `vm` 載入 `Code.gs` 測試，不需框架。

### 9. 單一試算表（取代「各用戶設定自己的試算表」）
- 曾實作：用戶私訊「設定試算表」並在群組「綁定」，資料存各自試算表。三方評估後改回單一試算表：流程大幅簡化（Bot 進群即用）、不再曝露部署者 Gmail；規模（數個家族、數千列）遠低於試算表上限。
- 相容：既有試算表的 `groups` 仍有 `sheetId` 欄，保留不用以免欄位錯位；舊 `users` 分頁不再使用，可手動刪除。
- 試算表會把日期／時間自動轉型且 Date 物件換算時區曾差 8 小時：寫入前設為純文字，讀取時遇到 Date 改用 `getDisplayValues()` 的顯示文字還原。

### 10. 接龍匯入：後端解析、發起人確認
- 新增 API `parse`（不寫入）回傳 `{title, date, time, place, entries:[{family,count}]}`；`create` 接受 `entries`，建立活動後逐筆建立家庭並 upsert 報名（userId 記為建立者）。
- 解析放後端（`parseChain` 純函式），與 `summarize` 一樣可用 Node 測試；前端不重複實作。
- 規則（正規表示式，不用模型）：首個非空行為名稱並去掉「邀約」；第一個 `月/日` 為日期，年份取今天（含）之後最近的一次；第一個 `時:分` 為時間；`場所/地點：` 後的文字（若為空取下一行）為地點；`家庭 [*＊xX×] 數字` 行為接龍（人數 0–8，名稱 ≤10 字）。
- 不讀群組聊天：避免推翻「Bot 不儲存聊天」承諾、避免無回饋或洗版兩難（三方討論結論）。

### 11. 新活動卡片：發起人帳號代發 Flex，不用 Bot
Messaging API 無法設定群組公告；Bot push 計額度（所有用戶共用）。故建立活動後以 `liff.sendMessages()` 發 Flex bubble（只用 URI action），發起人長按「設為公告」。卡片樣式由 Gemini 設計。

### 12. 編輯活動：僅建立者、報名保留、改期才通知
- API `edit`：比對 `events.createdBy === userId`，驗證名稱必填、日期 ≥ 今天（台灣時間），只覆寫 title/date/time/place。`load` 回傳每場活動的 `canEdit`（不外流 createdBy 的 userId）。
- 前端沿用新增活動表單（不顯示接龍匯入），儲存前 `confirm()` 二次確認；日期/時間/地點有變才發「活動異動」卡片（Gemini 設計）。
- 否決：所有人可編輯（長輩誤觸）、刪除（不可逆）、允許過去日期並標「已結束」（列表本就不顯示過去活動，多一套狀態不值得）。

### 13. 群組指令「#新活動」：明確指令才解析接龍，直接建立
- 先前否決「Bot 自動解析群組接龍」的理由（隱私、誤觸、洗版／無回饋）在明確指令下不成立：只處理 # 前綴訊息、有 reply 回饋（免費、可回 Flex）。
- 直接建立不另確認（群組多輪確認易被打斷），錯誤由建立者到網頁編輯；同名同日不重複建；缺 userId 不建（否則無人能編輯）。
- 新活動卡片在後端（`eventCard`）與前端（`eventFlex`）各有一份同款模板，因執行環境不同；改樣式時兩邊要一起改。

### 14. 活動結束：開始後 3 小時（三方共識）
- `ended(e, now)`：有時間＝開始＋3 小時，無時間＝當天結束；列表過濾與 signup／edit 拒絕共用同一判斷（後端擋，不只靠前端）。
- 保留 3 小時：晚到、現場臨時改人數、查誰還沒到。被擋時沿用 `run()` 錯誤畫面＋「回首頁」重新載入。

### 15. 刪除稱呼：只刪沒人選用的（三方共識）
- 入口在選稱呼頁底部次要連結「整理打錯的稱呼」，只列 `unclaimed`（無成員）；`confirm()` 列出會一起取消的報名；空清單顯示「目前沒有打錯或閒置的稱呼喔！」（Gemini）。
- 後端 `drop` 鎖內再查成員；刪未結束活動的報名、保留已結束的（Codex）。不防接龍再次匯入同名稱呼、不做穩定 ID（已結束報名不再顯示，YAGNI）。

## Risks / Trade-offs

- [Apps Script 對 POST 回 302，LINE 後台的 Verify 按鈕會失敗] → 事件仍會送達並執行；README 註明忽略 Verify 結果，以實際邀 Bot 入群測試。
- [第一次開啟要按 LINE 授權「許可」] → 無法避免；README 建議由年輕家人協助第一次。
- [Bot 在群組會收到所有訊息] → 程式不儲存；README 提醒告知家人。
- [Apps Script 冷啟動約 1–3 秒] → 前端顯示「載入中」。
- [所有家族資料集中在開發者的試算表] → 開放其他家族使用前告知。
- [每次請求讀整張分頁、全域寫入鎖] → 數千列內無感；數萬列再實測。
- [所有群組共用部署帳號的 Apps Script 每日額度] → 數十個家族內無虞，超過再評估。

## Migration Plan

新專案。部署步驟見 README.md。回滾：從群組移除 Bot 即可。
