## 1. 後端（Code.gs）

- [x] 1.1 實作 `summarize()` 純函式（總數、各戶、未回覆、不去、過期過濾、排序），並以 `node test.js` 驗證通過
- [x] 1.2 實作試算表存取（自動建表、讀取、upsert）與 `load`/`join`/`create`/`signup` API，以 `node test.js` 驗證 upsert 覆蓋行為
- [x] 1.3 實作 LINE webhook：join 登記群組並回覆連結、「報名」回覆連結、hook 密鑰檢查，以 `node test.js` 驗證其他訊息不回應

## 2. 前端（index.html）

- [x] 2.1 LIFF 初始化、取得 profile、無效連結提示，在瀏覽器以無效 g 開啟驗證顯示錯誤
- [x] 2.2 家庭選擇／新增、活動清單、報名人數按鈕、新增活動表單，長輩友善（字 ≥20px、按鈕 ≥52px），以手機寬度預覽驗證
- [ ] 2.3 送出後 `liff.sendMessages()` 通知，失敗不影響報名，於 LINE 群組實測驗證

## 3. 部署文件

- [ ] 3.1 撰寫 README.md：LINE 官方帳號／Messaging API／LIFF 設定、Apps Script 部署與 Script Properties、GitHub Pages、邀 Bot 入群；依文件從頭操作一次驗證

## 4. 多個家族群組

- [ ] 4.0 驗證 Apps Script `HtmlService` 提供 LIFF 頁面是否可行（init、getProfile、群組 sendMessages），依結果決定前端託管並更新 design
- [x] 4.1 （已由 4.9 取代）主試算表／用戶試算表路由（依 groupId 開對應試算表），以 `node test.js` 驗證兩群組資料分存不同試算表
- [x] 4.2 （已由 4.9 取代）私訊「設定試算表」：解析網址、驗證寫入、成功／失敗／說明回覆，以 `node test.js` 驗證
- [x] 4.3 （已由 4.9 取代）join 回覆綁定提示；群組「綁定」：成功、未設定、已綁定不變更，以 `node test.js` 驗證
- [x] 4.9 改回單一試算表（取代 4.1–4.3）：join 自動登記、「#報名」補登記（關鍵字加 # 前綴、接受全形與空白，避免誤觸）、私訊不曝露帳號；日期時間以顯示文字還原（修正差 8 小時），以 `node test.js` 驗證
- [x] 4.5 接龍匯入：`parseChain` 與 `parse` API、`create` 帶 entries，以 `node test.js` 驗證範例與解析失敗
- [x] 4.6 新增活動頁「貼上接龍」區塊（依 Gemini 設計），以手機寬度截圖驗證
- [ ] 4.7 建立活動後以 Flex 卡片通知群組（依 Gemini 設計），失敗不影響建立；於 LINE 群組實測驗證
- [ ] 4.8 編輯活動：後端 `edit`（僅建立者、日期 ≥ 今天、報名保留）與 `canEdit`，以 `node test.js` 驗證；前端編輯按鈕、表單、異動卡片，截圖驗證
- [x] 4.4 README：補實際設定踩到的坑（Webhook 開啟時機、Bot link 選項、Google 未驗證警告、redelivery、新版本部署）、新功能用法、單一試算表隱私提醒；之後再執行 3.1
