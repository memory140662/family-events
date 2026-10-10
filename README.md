# 家族活動報名

LINE 群組用的活動報名小幫手：Bot 認群組、LIFF 小網頁報名與統計、報名後以本人帳號在群組發卡片通知。全部免費。
可同時服務多個家族群組，所有資料存在同一份試算表、以群組區分。

| 檔案 | 用途 | 放哪裡 |
|---|---|---|
| `index.html` | 報名網頁（LIFF） | GitHub Pages |
| `Code.gs` | Bot webhook＋資料 API | Google 試算表的 Apps Script |
| `test.js` | 後端規則測試：`node test.js` | 本機 |

## 一次性設定（約 30 分鐘）

### 1. GitHub Pages
1. 把這個資料夾推到 GitHub（公開 repo）。
2. Settings → Pages → Branch 選 `main`、`/ (root)` → Save。
3. 記下網址，例如 `https://<帳號>.github.io/family-events/`。

### 2. LINE 官方帳號（Bot）
1. 到 [LINE Official Account Manager](https://manager.line.biz/) 建立官方帳號。
2. 設定 → Messaging API → 啟用，選一個 Provider（記住是哪個）。系統會自動在該 Provider 底下建立 Messaging API channel，**不要**在 LINE Developers 直接建。
3. 設定 → 回應設定：**自動回應訊息：停用**（Webhook 等第 6 步拿到網址再開）。
4. 設定 → 帳號設定 → **加入群組或多人聊天室：接受邀請**。
5. 到 [LINE Developers](https://developers.line.biz/console/) → 同一個 Provider → 這個 Messaging API channel → Messaging API 分頁 → 最下方發行 **Channel access token (long-lived)**，記下來。

### 3. LIFF（報名網頁）
1. LINE Developers → **同一個 Provider** → Create a new channel → **LINE Login**。
   （一定要同一個 Provider，Bot 和網頁拿到的使用者 ID 才會一致）
2. 該 channel → LIFF 分頁 → Add：
   - Size：**Full**
   - Endpoint URL：第 1 步的 GitHub Pages 網址
   - Scopes：勾 **profile**、**chat_message.write**
   - Bot link feature（或 Add friend option）：有的話選 Off，沒有就略過
3. 記下 **LIFF ID**（像 `2001234567-AbCdEfGh`）。
4. LINE Login channel 右上角狀態從 Developing 改成 **Published**，否則只有你自己能用。

### 4. Google 試算表＋Apps Script
1. 建立一個新的 Google 試算表 → 擴充功能 → Apps Script。
2. 把 `Code.gs` 全部內容貼上，取代預設程式碼。
3. 專案設定（齒輪）→ 指令碼屬性，新增三個：
   - `CHANNEL_TOKEN`：第 2-5 步的 token
   - `LIFF_ID`：第 3-3 步的 LIFF ID
   - `HOOK_KEY`：自己亂打一串英數，例如 `k8f2m9xq`
4. 部署 → 新增部署作業 → 類型「網頁應用程式」→ 執行身分：**我**、存取權：**所有人** → 部署 → 授權。
   授權時會出現「Google 尚未驗證這個應用程式」：按「進階」→「前往（不安全）」→ 允許。這是自己寫的程式沒送 Google 審核，正常。
   分頁（groups、families、members、events、signups）會在第一次使用時自動建立。
5. 記下網頁應用程式網址（結尾是 `/exec`）。

### 5. 把設定填回網頁
1. 打開 `index.html`，填入最上方兩個常數：
   ```js
   const LIFF_ID = '第 3 步的 LIFF ID';
   const API = '第 4 步的 /exec 網址';
   ```
2. 推上 GitHub。

### 6. 接上 webhook
1. LINE Developers → Messaging API channel → Messaging API 分頁 → Webhook URL 填：
   `第 4 步的 /exec 網址?hook=你的HOOK_KEY`
2. 打開 **Use webhook**；**Webhook redelivery 保持關閉**（否則 302 會讓同一事件重送）。
3. ⚠️ 按 **Verify** 會顯示失敗，這是 Apps Script 會回 302 轉址的關係，**可以忽略**，實際事件會正常送達。以下一步實測為準。

### 7. 邀 Bot 進群組
1. 先私訊 Bot 任意一句，收到使用說明就代表 webhook 通了。
2. 在家族群組邀請這個官方帳號，Bot 會自動登記群組並回覆含報名連結的訊息 → 長按設為**公告**。
3. 記得跟家人說一聲：Bot 在群組會收到訊息，但程式只回應「#報名」，不會儲存任何聊天內容。

完成！之後忘記連結時，在群組輸入「#報名」（全形「＃」也可以），Bot 會再回一次。只打「報名」不會觸發，避免日常聊天誤觸。

## 日常使用

- **長輩**：點公告連結 → 點活動 → 直接點人數，群組會自動出現報名小卡片「🏠江 報名 3 位 ✅」。
  第一次會跳出 LINE 授權畫面（按「許可」）和「您是哪一家」，建議由年輕家人陪著做第一次。
- **辦活動**：點連結 → ＋新增活動。可把家人原本的接龍文字貼進「從 LINE 接龍快速帶入」，自動填好欄位與已接龍的家庭。
  建立後群組會出現活動卡片，長按設為公告。卡片按鈕會直接開到該活動。
- **改活動**：只有建立者在活動頁最下方看得到「✏️ 編輯活動內容」。改日期／時間／地點會自動發「活動異動」卡片；報名會保留。
  要取消活動，把標題改成「（取消）…」；沒有刪除功能，真要刪請直接刪試算表那一列。
- **修正資料**：直接改試算表（例如刪錯的家庭）。
- **隱私**：所有家族的資料都在你的試算表，開放給其他家族使用前請先告知。

## 更新程式

- `index.html`：改完推上 GitHub 即可。
- `Code.gs`：貼上新版後 → 部署 → 管理部署作業 → 編輯（鉛筆）→ 版本選「新版本」→ 部署。**網址不變**，不用改 LINE 設定。

## 疑難排解

| 狀況 | 原因 |
|---|---|
| 邀 Bot 進群組沒反應 | Webhook URL 的 `hook=` 跟 `HOOK_KEY` 不一致，或 Apps Script 沒部署成「所有人」 |
| 網頁顯示「此群組尚未啟用」 | Bot 是在設定 webhook 前就加入群組：在群組傳「#報名」即可補登記 |
| 報名成功但群組沒出現通知 | 不是從群組裡點連結打開，或第一次授權時沒按許可 |
| 別人打開說無法使用 | LINE Login channel 還在 Developing，改成 Published |
| 改了 `Code.gs` 卻沒生效 | 部署時版本沒選「新版本」，跑的還是舊程式 |
| 貼上接龍後中文變成「?」 | 從電腦透過通用剪貼簿貼到手機時會發生；改在手機 LINE 裡複製，或先貼到 LINE 輸入框再複製一次 |
| 改 `/exec` 網址後網頁壞掉 | 用「新增部署作業」會產生新網址，要同步改 `index.html` 的 `API` 與 webhook；更新請用「管理部署作業 → 編輯」 |
