// 三栏可调宽 L2 浏览器证据：三处分隔条的拖动、持久化、双击重置、键盘调整。
// 覆盖：
// - S1 侧栏：默认 220、拖动 +60 写盘、刷新保持、End 到 320、双击回 220、拖到下限 180；
// - S2 笔记列表：拖动 +80 写盘、双击回 320；
// - S3 反链抽屉：只在打开时出现、拖动 -60 写盘、拖动期间宽度过渡为 none、
//   关闭再打开沿用上次宽度、双击回 340。
// 用法：先 `pnpm build && pnpm exec vite preview --port 4173 --strictPort`，
// 再 `node audit/layout-l2/browser-evidence.mjs`；CHROMIUM_PATH 可指向本机 Chromium。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:4173";
const OUT = "screenshots/layout-l2";
const LOG_DIR = "audit/layout-l2";
const EXEC = process.env.CHROMIUM_PATH;
const STORAGE_KEY = "wikloom:layout.v1";

mkdirSync(OUT, { recursive: true });
mkdirSync(LOG_DIR, { recursive: true });

const steps = [];
const checks = [];
const consoleErrors = [];

function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  if (!ok) throw new Error(`${name}: ${detail}`);
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

const splitter = (pane) => page.locator(`[data-splitter="${pane}"]`);
const sidebar = page.locator("aside").first();
const noteList = page.locator("main > section").first();
const drawer = page.locator('aside[aria-label="反向链接"]');
const widthOf = async (locator) => (await locator.boundingBox()).width;
const stored = async () =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), STORAGE_KEY);
const ariaValue = async (pane) =>
  Number(await splitter(pane).getAttribute("aria-valuenow"));
const near = (value, expected, tolerance = 2) =>
  Math.abs(value - expected) <= tolerance;

async function step(n, name) {
  const file = path.join(OUT, `${n}-${name}.png`);
  await page.screenshot({ path: file });
  steps.push({ step: n, name, file, url: page.url() });
  console.log(`[ok] ${n} ${name} -> ${file}`);
}

async function dragPane(pane, dx) {
  const box = await splitter(pane).boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(150);
}

let failure = null;

try {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /演示知识库/ }).click();
  await page.getByRole("heading", { name: "全部笔记" }).waitFor();

  // ---- S1 侧栏 ----
  check("默认侧栏宽度 220", near(await widthOf(sidebar), 220, 1), String(await widthOf(sidebar)));
  check("默认笔记列表宽度 320", near(await widthOf(noteList), 320, 1), String(await widthOf(noteList)));
  check("S3 抽屉关闭时不渲染", (await splitter("backlinks").count()) === 0);
  await step("01", "default");

  await dragPane("sidebar", 60);
  const sidebarAfterDrag = await widthOf(sidebar);
  const storedAfterDrag = await stored();
  check("S1 拖动 +60 后宽度约 280", near(sidebarAfterDrag, 280), String(sidebarAfterDrag));
  check(
    "S1 松手后写入 localStorage 且其他栏不变",
    storedAfterDrag?.version === 1 &&
      near(storedAfterDrag.sidebar, sidebarAfterDrag) &&
      storedAfterDrag.noteList === 320 &&
      storedAfterDrag.backlinks === 340,
    JSON.stringify(storedAfterDrag),
  );
  check("S1 拖动后 aria-valuenow 同步", near(await ariaValue("sidebar"), sidebarAfterDrag), String(await ariaValue("sidebar")));
  await step("02", "s1-drag-280");

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "全部笔记" }).waitFor();
  check("S1 刷新后宽度保持", near(await widthOf(sidebar), sidebarAfterDrag), String(await widthOf(sidebar)));
  await step("03", "s1-after-reload");

  await splitter("sidebar").focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(150);
  check("S1 End 到上限 320", near(await widthOf(sidebar), 320, 1), String(await widthOf(sidebar)));
  check("S1 键盘调整后写入 localStorage", (await stored())?.sidebar === 320, JSON.stringify(await stored()));
  await step("04", "s1-keyboard-end");

  await splitter("sidebar").dblclick();
  await page.waitForTimeout(150);
  check("S1 双击恢复默认 220", near(await widthOf(sidebar), 220, 1), String(await widthOf(sidebar)));
  await step("05", "s1-double-click-reset");

  await dragPane("sidebar", -200);
  check("S1 拖过头停在最小值 180", near(await widthOf(sidebar), 180, 1), String(await widthOf(sidebar)));
  await splitter("sidebar").dblclick();
  await page.waitForTimeout(150);

  // ---- S2 笔记列表 ----
  await dragPane("noteList", 80);
  const listAfterDrag = await widthOf(noteList);
  check("S2 拖动 +80 后列表宽度约 400", near(listAfterDrag, 400), String(listAfterDrag));
  check("S2 松手后写入 localStorage", near((await stored())?.noteList ?? 0, listAfterDrag), JSON.stringify(await stored()));
  await step("06", "s2-drag-400");

  await splitter("noteList").dblclick();
  await page.waitForTimeout(150);
  check("S2 双击恢复默认 320", near(await widthOf(noteList), 320, 1), String(await widthOf(noteList)));
  await step("07", "s2-double-click-reset");

  // ---- S3 反链抽屉 ----
  await page.getByRole("button", { name: "反向链接" }).click();
  await page.waitForTimeout(350);
  check("S3 抽屉打开后分隔条出现", (await splitter("backlinks").count()) === 1);
  check("抽屉默认宽度 340", near(await widthOf(drawer), 340, 1), String(await widthOf(drawer)));
  await step("08", "s3-drawer-open");

  // 拖动中途检查：抽屉过渡被关掉，松手后恢复由 CSS 决定（不在检查内）。
  const box = await splitter("backlinks").boundingBox();
  const startX = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX - 30, y, { steps: 6 });
  const durationDuringDrag = await drawer.evaluate(
    (element) => getComputedStyle(element).transitionDuration,
  );
  check("拖动期间抽屉宽度过渡为 none", durationDuringDrag === "0s", durationDuringDrag);
  await page.mouse.move(startX - 60, y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const drawerAfterDrag = await widthOf(drawer);
  check("S3 向左拖 60 后抽屉约 400", near(drawerAfterDrag, 400), String(drawerAfterDrag));
  check("S3 松手后写入 localStorage", near((await stored())?.backlinks ?? 0, drawerAfterDrag), JSON.stringify(await stored()));
  await step("09", "s3-drag-400");

  await page.getByRole("button", { name: "关闭反链面板" }).click();
  await page.waitForTimeout(350);
  check("S3 关闭后分隔条移除", (await splitter("backlinks").count()) === 0);
  check("S3 关闭后保存值不变 400", (await stored())?.backlinks === 400, JSON.stringify(await stored()));
  await page.getByRole("button", { name: "反向链接" }).click();
  await page.waitForTimeout(350);
  check("S3 重新打开沿用上次宽度 400", near(await widthOf(drawer), 400), String(await widthOf(drawer)));
  await step("10", "s3-reopen-kept");

  await splitter("backlinks").dblclick();
  await page.waitForTimeout(350);
  check("S3 双击恢复默认 340", near(await widthOf(drawer), 340, 1), String(await widthOf(drawer)));
  check("S3 双击后 localStorage 记录 340", (await stored())?.backlinks === 340, JSON.stringify(await stored()));
  await step("11", "s3-double-click-reset");

  await page.getByRole("button", { name: "关闭反链面板" }).click();
  await page.waitForTimeout(350);

  check(
    "整页没有横向滚动条",
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    await page.evaluate(() => `${document.documentElement.scrollWidth}>${window.innerWidth}`),
  );
  await step("12", "final");
} catch (error) {
  failure = String(error);
  console.error(`[FAIL] ${failure}`);
  try {
    await page.screenshot({ path: path.join(OUT, "FAILED.png") });
  } catch {
    // 页面打不开时不再重试截图
  }
}

const evidence = {
  ok: failure === null,
  failure,
  generatedAt: new Date().toISOString(),
  base: BASE,
  viewport: { width: 1440, height: 900 },
  storageKey: STORAGE_KEY,
  checks,
  steps,
  consoleErrors,
  finalStorage: await stored().catch(() => null),
};
writeFileSync(
  path.join(LOG_DIR, "browser-evidence.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);

await browser.close();
if (failure) process.exit(1);
