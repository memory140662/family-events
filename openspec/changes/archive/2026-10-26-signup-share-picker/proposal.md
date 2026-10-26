## Why

從外部瀏覽器（例如電腦版 LINE 點連結）開啟報名網頁時，`liff.sendMessages` 無法使用，報名後群組收不到通知，目前只顯示提示文字。機器人 push 會依群組人數計入額度且所有群組共用，不採用。

## What Changes

- 非聊天室開啟時，報名完成頁改顯示「選擇群組發送通知」按鈕，按下後以 `liff.shareTargetPicker` 讓本人自選群組送出同一張報名小卡片（不計額度）。
- 由使用者按下才開啟（外部瀏覽器以彈出視窗開啟，非使用者觸發會被擋）。
- 環境不支援 shareTargetPicker（例如後台未開啟）時，維持原本的提示文字。
- README 補 LIFF 後台開啟 shareTargetPicker 的步驟。

## Capabilities

### Modified Capabilities
- `event-signup`: 群組通知的「非聊天室開啟」情境。

## Impact

- `index.html`（報名完成頁）、`README.md`；後端不變。
