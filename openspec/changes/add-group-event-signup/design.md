## Context

見 proposal.md - Why。限制：全部免費、維護量最小、使用者（開發者）一人維護；終端使用者是長輩。

## Goals / Non-Goals

**Goals:** 一個前端檔、一個後端檔；主試算表＋各用戶自己的試算表；Bot 不消耗訊息額度。

**Non-Goals:** 刪除活動、編輯活動（直接改試算表）、提醒推播（Bot push）、管理後台、ID Token 驗證、解除群組綁定（直接改主試算表）。

## Decisions

### 1. 架構：GitHub Pages（LIFF 前端）＋ Google Apps Script（後端）＋ Google 試算表
- 前端 `index.html`：原生 JS＋LIFF SDK，無建置流程。
- 後端 `Code.gs`：綁定試算表的 Apps Script Web App，一個 `doPost` 同時處理 LINE webhook 與前端 API。
- 前端託管待 task 4.0 驗證：若 LIFF（init、getProfile、sendMessages）在 Apps Script `HtmlService` 頁面（iframe、googleusercontent 網域）內可正常運作，改由 `doGet` 提供頁面並移除 GitHub Pages；否則維持 GitHub Pages。Google 雲端硬碟已不支援網頁託管。
- 替代方案：Firebase / Cloudflare Workers——需帳號與部署工具，維護成本較高；試算表可讓使用者直接查看與修正資料。

### 2. 群組辨識靠 Bot 的群組事件
LIFF 無法取得 groupId。join 事件只有 groupId、沒有邀請者，故 join 時只回覆「請輸入綁定」；成員輸入「綁定」時，由該訊息的 `source.groupId`＋`source.userId` 登記到 `groups` 表，並以 reply 回覆 `https://liff.line.me/<LIFF_ID>?g=<groupId>`。groupId 長且不可猜，兼作存取憑證；後端只接受已綁定的 groupId。

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

### 6a. 主試算表（綁定 Apps Script）只存路由
| 分頁 | 欄位 |
|---|---|
| users | userId, sheetId, updatedAt |
| groups | groupId, name, sheetId, joinedAt |

上表 6 的分頁存在用戶的試算表（首次使用自動建立），保留 groupId 欄，故一份試算表可服務同一用戶的多個群組。

### 7. API（POST，`Content-Type: text/plain` 避免 CORS preflight）
`{action: 'load'|'join'|'create'|'signup', g, userId, ...}`，每個寫入動作回傳與 `load` 相同的最新狀態，前端只需一個 render。

### 8. 統計邏輯抽成純函式 `summarize()`，以 Node 測試
`test.js` 用 `vm` 載入 `Code.gs` 測試，不需框架。

### 9. 用戶試算表的設定與路由
- 私訊「設定試算表 <網址>」：以 `/d/([\w-]+)` 取出 ID，`openById` 開啟並建立分頁以驗證可寫入，成功才寫入 `users`。
- 群組綁定時把 `sheetId` 複製到 `groups`：用戶日後改設定別的試算表，已綁定群組不受影響。
- 所有資料存取先由 groupId 查 `groups.sheetId` 再開該試算表。`openById` 需完整 `spreadsheets` 權限，部署後需重新授權。
- 已綁定群組再輸入「綁定」：不變更，回覆目前連結（多半是在找連結，reply 不計費）。

### 10. 接龍匯入：後端解析、發起人確認
- 新增 API `parse`（不寫入）回傳 `{title, date, time, place, entries:[{family,count}]}`；`create` 接受 `entries`，建立活動後逐筆建立家庭並 upsert 報名（userId 記為建立者）。
- 解析放後端（`parseChain` 純函式），與 `summarize` 一樣可用 Node 測試；前端不重複實作。
- 規則（正規表示式，不用模型）：首個非空行為名稱並去掉「邀約」；第一個 `月/日` 為日期，年份取今天（含）之後最近的一次；第一個 `時:分` 為時間；`場所/地點：` 後的文字（若為空取下一行）為地點；`家庭 [*＊xX×] 數字` 行為接龍（人數 0–8，名稱 ≤10 字）。
- 不讀群組聊天：避免推翻「Bot 不儲存聊天」承諾、避免無回饋或洗版兩難（三方討論結論）。

### 11. 新活動卡片：發起人帳號代發 Flex，不用 Bot
Messaging API 無法設定群組公告；Bot push 計額度（所有用戶共用）。故建立活動後以 `liff.sendMessages()` 發 Flex bubble（只用 URI action），發起人長按「設為公告」。卡片樣式由 Gemini 設計。

## Risks / Trade-offs

- [Apps Script 對 POST 回 302，LINE 後台的 Verify 按鈕會失敗] → 事件仍會送達並執行；README 註明忽略 Verify 結果，以實際邀 Bot 入群測試。
- [第一次開啟要按 LINE 授權「許可」] → 無法避免；README 建議由年輕家人協助第一次。
- [Bot 在群組會收到所有訊息] → 程式不儲存；README 提醒告知家人。
- [Apps Script 冷啟動約 1–3 秒] → 前端顯示「載入中」。
- [部署帳號可讀寫所有用戶共用的試算表] → 技術上無法避免，靠信任；README 明示並建議用專用 Google 帳號部署。
- [所有用戶共用部署帳號的 Apps Script 每日額度] → 數十個家族內無虞，超過再評估。
- [群組訊息缺 `source.userId` 時無法綁定] → 回覆請對方先加 Bot 好友再試。

## Migration Plan

新專案。部署步驟見 README.md。回滾：從群組移除 Bot 即可。
