## Context

使用者 2026-10-26 定案；UI 由 Gemini 定稿，Codex 審查。上限 Gemini 主張 12（一張大圓桌、展開只多兩排）、Codex 主張 20（展開將近 5 排，太擠），使用者選 12。

## Decisions

- 後端 `MAX = 12` 常數；parseChain 先以「同一家最後一行為準」合併，再拆成 `entries`（≤12）與 `over`（>12）。
- `.btn-more { background:#e8f5e9; color:#065f2d; border:2px dashed #087f3c; font-weight:bold }`：虛線淡綠，與實線白底的「不克參加」區分。
- 結構：`.counts` 內含 1–6 格線、`.more`、7–12 格線（`.extra`）、`.less`；以 `open`／`locked` class 切換顯示，展開／收起不送出、不重畫。
- 已選 >6：`open locked`（自動展開、不給收起，避免藏住選中值）。新活動不依其他活動推斷，一律收合。
- 網頁超限警告（Gemini 文案）：「⚠️ 超過 12 人上限未帶入：陳（15 人）<br>每戶最多 12 人，建立活動後可改報 12 位，或新增第二個稱呼分開報名。」；只有超限項目時顯示它而不是「無法辨識」。
- Bot：新活動卡片不變，`over` 非空時回覆 `[卡片, 文字]`；重複建立分支不匯入，不附提示。

## Alternatives rejected

- +/- 加減器加確定鈕：詳細頁變成雙軌操作，長輩易漏按。
- 數字輸入框：會彈出鍵盤。
- 上限 20：展開後按鈕過多。
