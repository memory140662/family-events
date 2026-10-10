# 家族活動報名

LINE 群組用的活動報名小幫手：Bot 認群組、LIFF 小網頁報名與統計、報名後以本人帳號在群組通知。全部免費。

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
2. 設定 → Messaging API → 啟用，選一個 Provider（記住是哪個）。
3. 設定 → 回應設定：**自動回應訊息：停用**、**Webhook：啟用**。
4. 設定 → 帳號設定 → **加入群組或多人聊天室：接受邀請**。
5. 到 [LINE Developers](https://developers.line.biz/console/) → 同一個 Provider → 這個 Messaging API channel → Messaging API 分頁 → 最下方發行 **Channel access token (long-lived)**，記下來。

### 3. LIFF（報名網頁）
1. LINE Developers → **同一個 Provider** → Create a new channel → **LINE Login**。
   （一定要同一個 Provider，Bot 和網頁拿到的使用者 ID 才會一致）
2. 該 channel → LIFF 分頁 → Add：
   - Size：**Full**
   - Endpoint URL：第 1 步的 GitHub Pages 網址
   - Scopes：勾 **profile**、**chat_message.write**
   - Bot link feature：Off
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
2. 打開 **Use webhook**。
3. ⚠️ 按 **Verify** 會顯示失敗，這是 Apps Script 會回 302 轉址的關係，**可以忽略**，實際事件會正常送達。以下一步實測為準。

### 7. 邀 Bot 進群組
1. 在家族群組邀請這個官方帳號。
2. Bot 會回覆一則含報名連結的訊息 → 長按設為**公告**。
3. 記得跟家人說一聲：Bot 在群組會收到訊息，但程式只回應「報名」兩個字，不會儲存任何聊天內容。

完成！之後忘記連結時，在群組輸入「報名」，Bot 會再回一次。

## 日常使用

- **長輩**：點公告連結 → 點活動 → 點人數，群組會自動出現「江家報名…目前共 N 位」。
  第一次會跳出 LINE 授權畫面（按「許可」）和「您是哪一家」，建議由年輕家人陪著做第一次。
- **辦活動**：點連結 → ＋新增活動。
- **修正資料**：直接改試算表（例如改活動時間、刪錯的家庭）。

## 更新程式

- `index.html`：改完推上 GitHub 即可。
- `Code.gs`：貼上新版後 → 部署 → 管理部署作業 → 編輯（鉛筆）→ 版本選「新版本」→ 部署。**網址不變**，不用改 LINE 設定。

## 疑難排解

| 狀況 | 原因 |
|---|---|
| 邀 Bot 進群組沒反應 | Webhook URL 的 `hook=` 跟 `HOOK_KEY` 不一致，或 Apps Script 沒部署成「所有人」 |
| 網頁顯示「連結無效」 | 群組連結被手動改過，或 Bot 是在設定 webhook 前就加入群組（移除再邀一次） |
| 報名成功但群組沒出現通知 | 不是從群組裡點連結打開，或第一次授權時沒按許可 |
| 別人打開說無法使用 | LINE Login channel 還在 Developing，改成 Published |
