## 1. 實作

- [x] 1.1 index.html `eventFlex` 加第三個參數 `head`（預設「📢 新活動」），既有呼叫不變
- [x] 1.2 index.html `detail()`：設定 `shareCard = [eventFlex({ ...ev, entries: ev.replies }, ev.id, '📢 邀請報名')]`；支援 shareTargetPicker 時在名單下方、編輯按鈕前顯示 `id="share"` 的「📤 分享此活動」按鈕呼叫 `share()`，不支援時顯示提示文字
- [x] 1.3 index.html `<head>` 加 `og:title`、`og:description`、`og:image`（`https://memory140662.github.io/family-events/icon.png`）、`description`
- [x] 1.4 確認 `pastDetail()` 沒有分享按鈕（不改）

## 2. 驗證

- [x] 2.1 `node test.js` 照常通過（後端未改）
- [ ] 2.2 LINE App 內：從群組開啟詳細頁 → 分享給好友，卡片內容正確、按鈕改「✅ 已發送」；取消可再按
- [ ] 2.3 外部瀏覽器（電腦版 LINE 點連結）：分享視窗可開啟並送出
- [ ] 2.4 收到的人（未選家庭）按「我要報名」→ 選家庭 → 直接進入該活動
- [ ] 2.5 新活動卡片標頭仍為「📢 新活動」
- [ ] 2.6 部署後把 GitHub Pages 網址與 `liff.line.me` 網址分別貼到 LINE，預覽顯示標題、說明與圖示（不是「載入中…」）
