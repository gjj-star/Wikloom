// 真机复核（2026-10-28）：Tauri 窗口 + 只读目录，验证
// 1) 保存失败时 rescan 不会清空草稿；2) 关窗时确认框真的弹出。
// 用法：先设 WIKLOOM_STATE_DIR 指向含 vault-path.txt 的目录并启动 debug 版，
// 再 node audit/2026-10-28/tauri-check.mjs
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import path from "node:path";

const CDP = process.env.CDP_URL ?? "http://127.0.0.1:9223";
const STATE_DIR = process.env.AUDIT_STATE_DIR;
if (!STATE_DIR) throw new Error("缺少 AUDIT_STATE_DIR");

const OUT = "screenshots/audit-2026-10-28";
const LOG_DIR = "audit/2026-10-28";
const EDIT_TAG = " TAURI-AUDIT-保存失败草稿";

const steps = [];
const dialogs = [];
const errors = [];
const results = { draftKept: false, rescanBlocked: false, saveFailed: false };

function log(message) {
  console.log(message);
}

const browser = await chromium.connectOverCDP(CDP);
const context = browser.contexts()[0] ?? (await browser.newContext());
const page = context.pages()[0] ?? (await context.waitForEvent("page"));
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.setDefaultTimeout(20000);

let resolvingDialog;
const dialogSeen = new Promise((resolve) => {
  resolvingDialog = resolve;
});
page.on("dialog", async (dialog) => {
  dialogs.push({ type: dialog.type(), message: dialog.message() });
  log(`[dialog] ${dialog.type()}: ${dialog.message()}`);
  await dialog.dismiss();
  resolvingDialog?.(true);
  resolvingDialog = null;
});

async function shot(name) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file });
  steps.push({ name, file });
  log(`[ok] ${name} -> ${file}`);
}

async function ensureMode(mode) {
  const editing = (await page.locator(".cm-content").count()) > 0;
  if (mode === "edit" && !editing) {
    await page.keyboard.press("Control+e");
    await page.locator(".cm-content").waitFor();
  }
  if (mode === "read" && editing) {
    await page.keyboard.press("Control+e");
    await page.locator("article").waitFor();
  }
}

await page.getByRole("heading", { name: "全部笔记" }).waitFor({ timeout: 40000 });
await page.getByText("审计真机笔记", { exact: true }).first().waitFor();
log("[ok] 真机窗口已载入测试知识库");

// 1) 编辑并让自动保存失败（目录已设为只读）
await ensureMode("edit");
await page.locator(".cm-content").click();
await page.keyboard.press("Control+End");
await page.keyboard.type(EDIT_TAG, { delay: 12 });
await page.getByText("保存失败，内容还在编辑器里").waitFor({ timeout: 15000 });
results.saveFailed = true;
await shot("10-tauri-save-failed.png");

// 2) 去设置里点「重新扫描」，应被拦住并提示草稿已保留
await page.getByRole("button", { name: "设置", exact: true }).click();
await page.getByRole("button", { name: "重新扫描" }).click();
await page.getByText(/已保留草稿/).waitFor({ timeout: 10000 });
results.rescanBlocked = true;
await shot("11-tauri-rescan-blocked.png");

// 3) 回到笔记，确认草稿还在
await page.getByRole("button", { name: /全部笔记/ }).click();
await ensureMode("edit");
const body = await page.locator(".cm-content").innerText();
results.draftKept = body.includes(EDIT_TAG.trim());
if (!results.draftKept) throw new Error("rescan 后草稿丢失");
await shot("12-tauri-draft-kept.png");

// 4) 让外部关闭窗口（watcher 发 WM_CLOSE），应停在应用内确认框而不是直接关掉
writeFileSync(path.join(STATE_DIR, "close-requested"), "1", "utf8");
const prompt = page.getByRole("dialog", { name: "还有内容没有保存到磁盘" });
let closeConfirmShown = false;
try {
  await prompt.waitFor({ timeout: 20000 });
  closeConfirmShown = true;
} catch {
  closeConfirmShown = false;
}
results.closeConfirmShown = closeConfirmShown;
results.closeConfirmText = closeConfirmShown
  ? await prompt.innerText()
  : null;
await shot("13-tauri-close-confirm.png");
await page.getByRole("button", { name: "留在这里" }).click();
await page.waitForTimeout(600);
results.promptDismissed = (await prompt.count()) === 0;
results.windowStillOpen = !page.isClosed();
if (results.windowStillOpen) {
  await shot("14-tauri-after-close-cancel.png");
}

writeFileSync(
  path.join(LOG_DIR, "tauri-check.json"),
  JSON.stringify({ steps, dialogs, errors, results }, null, 2),
  "utf8",
);
await browser.close().catch(() => {});

if (
  !results.closeConfirmShown ||
  !results.promptDismissed ||
  !results.windowStillOpen ||
  !results.draftKept
) {
  console.error("真机复核未通过：", results);
  process.exit(1);
}
console.log("真机复核通过：保存失败提示、rescan 拦截、关窗确认框（可取消）均验证");
