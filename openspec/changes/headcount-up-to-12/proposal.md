## Why

人數按鈕只有 1–8，後端也限制 8 位，大家族報不了；接龍匯入時超過 8 人的那一行會被靜默丟棄，主揪以為全部匯入了。使用者也希望平常畫面不要排太多按鈕。

## What Changes

- 每戶每場人數上限 8 → 12（前端按鈕、後端 create／signup／parseChain 一致）。
- 人數按鈕預設 1–6，「7 位以上 ▾」就地展開 7–12；可「收起 ▴」，但已選 7 以上時自動展開且不顯示收起。新活動一律收合。
- 接龍超過 12 人的家庭不帶入，但明確提示：網頁顯示警告；「#新活動」在新活動卡片後另回一則文字（卡片本身不變）。

## Capabilities

### Modified Capabilities
- `event-signup`: 報名人數範圍與選擇方式、接龍與群組指令的超限處理。

## Impact

- `index.html`、`Code.gs`、`test.js`。Code.gs 改動後需在 Apps Script 重新部署新版本。
- LINE Flex 卡片（signupFlex、eventFlex、changeFlex、eventCard）不變。
