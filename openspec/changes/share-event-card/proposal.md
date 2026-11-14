## Why

把報名網址直接貼給別人時，LINE 預覽只會顯示固定的「家族活動報名／載入中…」，看不出是哪場活動。網頁是 GitHub Pages 靜態檔，預覽爬蟲不執行 JavaScript，無法依活動產生不同預覽。改由網頁發出活動卡片，收到的人就能直接看到活動內容。

## What Changes

- 活動詳細頁（未結束的活動）新增「📤 分享此活動」按鈕，按下以 `liff.shareTargetPicker` 讓使用者自選聊天室或好友，發出活動卡片。
- 卡片沿用新活動卡片版面：活動名稱、日期時間、地點、目前已報名摘要與總人數、「我要報名」按鈕（直接開啟該活動詳細頁）；標頭改為「📢 邀請報名」，避免被誤認為新活動。
- LINE App 內與外部瀏覽器（含電腦版）都 SHALL 可用；一律由使用者按下才開啟選擇視窗。
- 不支援選擇傳送對象時，顯示提示文字，不影響其他操作。
- 網頁 `<head>` 加固定預覽設定（`og:title`、`og:description`、`og:image`、`description`），直接貼網址到 LINE 或其他 App 時顯示「家族活動報名」＋說明＋圖示，不再出現「載入中…」。

## 不在範圍內

- 依活動動態產生網址預覽（需另架伺服器，且會讓未登入者看到活動名稱）。
- 已結束的活動不提供分享。

## Capabilities

### New Capabilities
（無）

### Modified Capabilities
- `event-signup`: 新增「分享活動」需求。

## Impact

- `index.html`：`<head>` 預覽設定、詳細頁按鈕、卡片產生（重用 `eventFlex`）、分享函式（沿用 `share()` 模式）。
- 後端 `Code.gs` 不變；LIFF 後台 shareTargetPicker 已在 signup-share-picker 開啟。
