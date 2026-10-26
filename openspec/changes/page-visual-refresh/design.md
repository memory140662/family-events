## Context

UI/UX 由 Gemini 主導定稿（2026-10-26，三方討論），Codex 審查實作風險。ui-ux-pro-max skill 建議「不用 emoji 當圖示」，Gemini 主張保留長輩熟悉的 📅📍✅、只拿掉裝飾性 📜，採 Gemini。

## Decisions

- body `font: 20px/1.6 …`；`.card` 加 `border: 1px solid #e5e7eb`；`.link.minor` `18px #4b5563`
- 狀態：`.mine.joined` #065f2d/#e8f5e9（6.96:1）、`.mine.declined` #4b5563/#f3f4f6、`.mine.pending` #92400e/#fef3c7（6.37:1）；文字不變，`.ok` 只留給完成頁
- 待選：`.grid button, .btn-decline` 白底、#087f3c 字、2px 綠框（含選稱呼、整理稱呼）；`.grid button.primary` 實心綠白字
- `.btn-decline.primary` 深灰實心 #4b5563 白字：未選已是白底綠框，舊的「白底 3px 綠框」會分不出選中；灰色也與「不去」語意一致、不跟「建立活動」主按鈕撞色
- `.back` 白底綠字 2px 綠框膠囊 48px：詳細頁、歷史列表、歷史詳細頁、選稱呼頁「不換了」
- 名單三列（空列省略、全無回覆沿用原空狀態文字）；歷史頁無「尚未回覆」
- 接龍區 `<details class="relay">`，summary「從 LINE 接龍快速帶入（選填，點此展開）」，保留原生三角
- 維持原生 confirm()/alert()，不改流程

## Risks

- `.card.ev.past` 原有 `1px solid #ddd` 邊框，會覆蓋新的 `.card` 邊框，維持即可。
