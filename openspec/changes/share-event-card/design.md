## Context

- `eventFlex(d, id)` 已產生新活動卡片，`d.entries` 為 `{family, count}` 陣列，與 `state.events[i].replies` 結構相同。
- 報名完成頁已有「選擇群組發送通知」：把卡片存進 `shareCard`，按鈕觸發 `share()` 呼叫 `liff.shareTargetPicker`。
- 活動連結 `link(e)` 帶 `?g=&e=`；後端只依群組 ID 讀資料，收到的人登入後若尚未選家庭會先選家庭，再自動進入該活動（現有行為）。

## Goals / Non-Goals

**Goals:** 在 LINE App 與外部瀏覽器都能把指定活動以卡片分享出去，卡片顯示當下內容。

**Non-Goals:** 動態網址預覽、Bot 推播、已結束活動分享。

## Decisions

1. **一律用 shareTargetPicker，不用 sendMessages。** 分享的目的是給「其他人」，在群組內開啟時也可能要轉給別的聊天室或好友；shareTargetPicker 在 LINE App 與外部瀏覽器都可用，行為一致。
2. **重用 `eventFlex`，加第三個參數標頭文字**（預設「📢 新活動」，分享時傳「📢 邀請報名」）。呼叫：`eventFlex({ ...ev, entries: ev.replies }, ev.id, '📢 邀請報名')`。不另寫一份卡片，避免兩張版面分歧。
3. **重用 `shareCard` / `share()`**：詳細頁設定 `shareCard` 後，按鈕呼叫 `share()`。`share()` 目前以 `id="share"` 找按鈕改成「✅ 已發送」；詳細頁按鈕沿用同一個 id。詳細頁與完成頁不會同時存在，id 不衝突。
4. **不支援時**：`liff.isApiAvailable('shareTargetPicker')` 為 false 就不顯示按鈕，改顯示一行提示「此環境無法分享，請在 LINE 中開啟」。

5. **固定網址預覽**：在 `<head>` 加 `og:title`「家族活動報名」、`og:description` 與 `description`「點開即可報名家族聚餐、查看誰會參加」、`og:image` 用已有的 `icon.png`（640×640）絕對網址 `https://memory140662.github.io/family-events/icon.png`。預覽與用哪個瀏覽器開啟無關，而是貼網址的 App（LINE、Messenger 等）抓網頁產生；內容固定、不含活動資料。

## Risks / Trade-offs

- [外部瀏覽器擋彈出視窗] → 只在按鈕點擊中直接呼叫 shareTargetPicker（已驗證過的模式）。
- [卡片人數是發送當下的快照] → 卡片上的按鈕開啟後看到即時資料，可接受。
- [LINE 預覽有快取] → 舊連結可能仍顯示「載入中…」，以新貼的網址驗證。
- [`liff.line.me` 網址的預覽由 LINE 決定，未必讀我們的 og 標籤] → 實機驗證；不行就只保證 GitHub Pages 網址正確。
- [Flex 不接受空字串] → `eventFlex` 已處理沒有地點（「地點待定」）與時間（`trim()`）。
