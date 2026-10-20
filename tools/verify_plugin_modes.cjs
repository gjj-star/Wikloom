// Independent parity check: evaluate the literal declarations from the bundle
// with Node and compare them byte-for-byte with the Python-extracted JSON.
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const pluginDir = process.env.OBSIDIAN_PLUGIN_DIR;
if (!pluginDir) {
  console.error("未指定 OBSIDIAN_PLUGIN_DIR（second-brain-builder 插件目录）");
  process.exit(1);
}
const SRC = path.join(pluginDir, "main.js");
const OUT = path.join(__dirname, "..", "docs", "plugin-modes.json");

const text = fs.readFileSync(SRC, "utf8");
const json = JSON.parse(fs.readFileSync(OUT, "utf8"));

function exprAt(start) {
  let i = start;
  let depth = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      i++;
      while (i < text.length) {
        if (text[i] === "\\") { i += 2; continue; }
        if (text[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === "[" || c === "{" || c === "(") depth++;
    else if (c === "]" || c === "}" || c === ")") depth--;
    else if (c === ";" && depth === 0) break;
    i++;
  }
  return text.slice(start, i);
}

function getVar(name) {
  const re = new RegExp("\\bvar\\s+" + name + "\\s*=\\s*");
  const m = re.exec(text);
  if (!m) throw new Error("missing " + name);
  return eval("(" + exprAt(m.index + m[0].length) + ")");
}

const modes = getVar("modes_default");
const actions = getVar("INLINE_ACTIONS");
const settings = getVar("DEFAULT_SETTINGS");
const inlineRules = getVar("INLINE_OUTPUT_RULES");
const appendRules = getVar("APPEND_OUTPUT_RULES");

assert.deepStrictEqual(json.noteModes, modes, "noteModes mismatch");
assert.deepStrictEqual(json.inlineActions, actions, "inlineActions mismatch");
assert.deepStrictEqual(json.defaultSettings, settings, "settings mismatch");
assert.deepStrictEqual(Object.keys(json.defaultSettingsMeta.fieldDetails), Object.keys(settings), "settings meta keys mismatch");
assert.strictEqual(json.promptSuffixes.inlineRules, inlineRules, "inline rules mismatch");
assert.strictEqual(json.promptSuffixes.appendRules, appendRules, "append rules mismatch");

// getOutputRules() interpolates today's date; normalize the date back to the
// ${today} token preserved in the extraction.
const getOutputRulesSrc = text.slice(
  text.indexOf("function getOutputRules()"),
  text.indexOf("var INLINE_OUTPUT_RULES")
);
const getOutputRules = eval("(" + getOutputRulesSrc.slice(0, getOutputRulesSrc.lastIndexOf("}") + 1) + ")");
const rendered = getOutputRules();
const today = new Date().toISOString().slice(0, 10);
const normalized = rendered.split(today).join("${today}");
assert.strictEqual(json.promptSuffixes.fullNoteRules, normalized, "full rules mismatch");

const customIdx = text.indexOf('"Add custom mode"');
const customMatch = /prompt:\s*('(?:[^'\\]|\\.)*')/.exec(text.slice(customIdx));
if (!customMatch) throw new Error("custom mode prompt not found");
const customPrompt = eval("(" + customMatch[1] + ")");
assert.strictEqual(json.customModes.defaultTemplate, customPrompt, "custom template mismatch");
assert.strictEqual(json.customModes.defaultObject.prompt, customPrompt, "custom default object mismatch");

const uiIdx = text.indexOf('Add your own modes. Each mode needs');
const uiMatch = /text:\s*("(?:[^"\\]|\\.)*")/.exec(text.slice(uiIdx - 30));
if (!uiMatch) throw new Error("custom mode UI copy not found");
assert.strictEqual(json.customModes.uiCopy, eval("(" + uiMatch[1] + ")"), "custom UI copy mismatch");

assert.strictEqual(json.counts.noteModes, modes.length);
assert.strictEqual(json.counts.inlineActions, actions.length);
assert.ok(modes.every((m) => typeof m.prompt === "string" && m.prompt.length > 200));
assert.ok(actions.every((a) => typeof a.prompt === "string" && a.prompt.length > 200));
assert.deepStrictEqual(json.validation.problems, []);
assert.strictEqual(json.validation.status, "ok");

console.log("PARITY OK");
console.log("noteModes:", modes.length, "inlineActions:", actions.length);
console.log("prompt chars:", modes.reduce((n, m) => n + m.prompt.length, 0), actions.reduce((n, a) => n + a.prompt.length, 0));
console.log("settings keys:", Object.keys(settings).length);
console.log("suffix lengths:", inlineRules.length, appendRules.length, normalized.length);
