// 审计冒烟（2026-10-28）：用 Playwright 把审计列的执行项在浏览器演示库上跑一遍并逐步截图。
// 用法：先 `pnpm build && pnpm exec vite preview --port 4173`，再 `node audit/2026-10-28/browser-smoke.mjs`。
// 没装 Playwright 自带浏览器时，用 CHROMIUM_PATH 指向本机已有的 Chromium/Chrome 可执行文件。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const OUT = "screenshots/audit-2026-10-28";
const LOG_DIR = "audit/2026-10-28";
const EXEC = process.env.CHROMIUM_PATH;

mkdirSync(OUT, { recursive: true });
mkdirSync(LOG_DIR, { recursive: true });

const steps = [];
const consoleErrors = [];
const failures = [];

function record(n, name) {
  return async () => {
    const file = path.join(OUT, `${n}-${name}.png`);
    await page.screenshot({ path: file });
    steps.push({ step: n, name, file, url: page.url() });
    console.log(`[ok] ${n} ${name} -> ${file}`);
  };
}

const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

async function run(n, name, fn) {
  try {
    await fn();
    await record(n, name)();
  } catch (error) {
    failures.push({ step: n, name, error: String(error) });
    console.error(`[FAIL] ${n} ${name}: ${error}`);
    try {
      await page.screenshot({ path: path.join(OUT, `${n}-${name}-FAILED.png`) });
    } catch {
      // 页面都打不开时不再重试截图
    }
  }
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

await page.goto(BASE, { waitUntil: "networkidle" });

await run("01", "open-vault", async () => {
  await page.getByRole("button", { name: /演示知识库/ }).click();
  await page.getByRole("heading", { name: "全部笔记" }).waitFor();
  await page.getByText("欢迎使用 Wikloom", { exact: true }).first().waitFor();
});

await run("02", "new-note", async () => {
  await page.getByRole("button", { name: "新建笔记", exact: true }).click();
  await page.locator(".cm-content").waitFor();
  await page.waitForTimeout(300);
});

const SMOKE_TEXT = "审计冒烟 2026-10-28：编辑并保存后的正文";

await run("03", "edit-note", async () => {
  await ensureMode("edit");
  await page.locator(".cm-content").click();
  await page.keyboard.type(SMOKE_TEXT, { delay: 8 });
  await page.waitForTimeout(200);
});

await run("04", "explicit-save", async () => {
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByText("已保存到磁盘").waitFor({ timeout: 5000 });
});

await run("05", "refresh-persists", async () => {
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "全部笔记" }).waitFor();
  // 新建的笔记刚保存，列表按更新时间排在最前。
  await page.locator("section button h3").first().click();
  await ensureMode("edit");
  const text = await page.locator(".cm-content").innerText();
  if (!text.includes(SMOKE_TEXT)) {
    throw new Error(`刷新后正文没有保留：${text.slice(0, 80)}`);
  }
  await page.waitForTimeout(200);
});

await run("06", "search", async () => {
  await ensureMode("read");
  const search = page.getByLabel("搜索笔记");
  await search.fill("Markdown");
  await page.waitForTimeout(300);
  const count = await page.locator("section button h3").count();
  if (count === 0) throw new Error("搜索 Markdown 没有结果");
});

await run("07", "table-formula", async () => {
  await page.getByLabel("清空搜索").click();
  await page.getByText("Markdown 速查", { exact: true }).first().click();
  await ensureMode("read");
  await page.waitForTimeout(400);
  if (!(await page.locator(".katex").count())) {
    throw new Error("阅读态没有渲染公式");
  }
  if (!(await page.locator("table").count())) {
    throw new Error("阅读态没有渲染表格");
  }
});

await run("08", "link-navigation", async () => {
  const link = page.locator("button.wiki-link").first();
  const target = await link.getAttribute("title");
  await link.click();
  await page.waitForTimeout(400);
  const heading = await page.locator("article h1, article h2").first().innerText();
  if (!target || !heading) throw new Error("链接跳转后没有标题");
});

await run("09", "backlinks", async () => {
  const summary = page.getByRole("button", { name: /被 \d+ 篇引用/ });
  await summary.click();
  await page.getByRole("button", { name: "关闭反链面板" }).waitFor();
  await page.waitForTimeout(300);
});

const report = {
  base: BASE,
  chromium: EXEC,
  steps,
  consoleErrors,
  failures,
};
writeFileSync(
  path.join(LOG_DIR, "browser-smoke.json"),
  JSON.stringify(report, null, 2),
  "utf8",
);
await browser.close();

if (failures.length > 0) {
  console.error(`${failures.length} 步失败，见 ${LOG_DIR}/browser-smoke.json`);
  process.exit(1);
}
console.log(`9 步全部完成，截图在 ${OUT}/`);
