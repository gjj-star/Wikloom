#!/usr/bin/env python3
"""Extract prompt templates and settings from the Second Brain Builder bundle.

The plugin ships as a single esbuild bundle. The mode/action arrays are plain
JS object literals, so instead of eval (unsafe) this parses the small subset of
JS syntax they use: strings (single/double/backtick with escapes), booleans,
numbers, arrays, objects, and `+` concatenation.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


def _plugin_dir() -> Path:
    """Locate the second-brain-builder plugin directory without hardcoding it.

    Precedence: OBSIDIAN_PLUGIN_DIR env var, then the first CLI argument.
    """
    env = os.environ.get("OBSIDIAN_PLUGIN_DIR")
    if env:
        return Path(env)
    if len(sys.argv) > 1:
        return Path(sys.argv[1])
    raise SystemExit(
        "未指定 second-brain-builder 插件目录：设置 OBSIDIAN_PLUGIN_DIR 环境变量，"
        "或把插件目录作为第一个参数传入"
    )


SRC = _plugin_dir() / "main.js"
MANIFEST = SRC.with_name("manifest.json")
OUT = Path(__file__).resolve().parent.parent / "docs" / "plugin-modes.json"

TEXT = SRC.read_text(encoding="utf-8")


def skip_ws(s: str, i: int) -> int:
    while i < len(s) and s[i] in " \t\r\n":
        i += 1
    return i


class ParseError(Exception):
    pass


def parse_string(s: str, i: int):
    quote = s[i]
    if quote not in "'\"`":
        raise ParseError(f"not a string at {i}: {s[i:i+20]!r}")
    i += 1
    out: list[str] = []
    dynamic = False
    while i < len(s):
        c = s[i]
        if c == "\\":
            if i + 1 >= len(s):
                raise ParseError("trailing backslash")
            nxt = s[i + 1]
            if nxt == "n":
                out.append("\n"); i += 2
            elif nxt == "r":
                out.append("\r"); i += 2
            elif nxt == "t":
                out.append("\t"); i += 2
            elif nxt == "b":
                out.append("\b"); i += 2
            elif nxt == "f":
                out.append("\f"); i += 2
            elif nxt == "v":
                out.append("\v"); i += 2
            elif nxt == "0" and (i + 2 >= len(s) or not s[i + 2].isdigit()):
                out.append("\0"); i += 2
            elif nxt == "x":
                out.append(chr(int(s[i + 2:i + 4], 16))); i += 4
            elif nxt == "u":
                if s[i + 2] == "{":
                    end = s.index("}", i + 3)
                    out.append(chr(int(s[i + 3:end], 16))); i = end + 1
                else:
                    out.append(chr(int(s[i + 2:i + 6], 16))); i += 6
            elif nxt == "\n":
                i += 2  # line continuation
            elif nxt == "\r":
                i += 3 if s[i + 2] == "\n" else 2
            else:
                out.append(nxt); i += 2
        elif quote == "`" and c == "$" and i + 1 < len(s) and s[i + 1] == "{":
            depth = 1
            j = i + 2
            while j < len(s) and depth:
                if s[j] == "{":
                    depth += 1
                elif s[j] == "}":
                    depth -= 1
                j += 1
            out.append("${" + s[i + 2:j - 1] + "}")
            dynamic = True
            i = j
        elif c == quote:
            return "".join(out), i + 1, {"dynamic": dynamic}
        else:
            out.append(c)
            i += 1
    raise ParseError("unterminated string")


def parse_primary(s: str, i: int):
    i = skip_ws(s, i)
    if i >= len(s):
        raise ParseError("unexpected end of input")
    c = s[i]
    if c in "'\"`":
        return parse_string(s, i)
    if c == "[":
        arr = []
        item_meta = []
        i = skip_ws(s, i + 1)
        while i < len(s) and s[i] != "]":
            value, i, meta = parse_value(s, i)
            arr.append(value)
            item_meta.append(meta)
            i = skip_ws(s, i)
            if i < len(s) and s[i] == ",":
                i = skip_ws(s, i + 1)
        if i >= len(s):
            raise ParseError("unterminated array")
        return arr, i + 1, {"dynamic": False, "itemMeta": item_meta}
    if c == "{":
        obj = {}
        metas = {}
        i = skip_ws(s, i + 1)
        while i < len(s) and s[i] != "}":
            i = skip_ws(s, i)
            if s[i] in "'\"":
                key, i, _ = parse_string(s, i)
            else:
                m = re.match(r"[A-Za-z_$][\w$]*", s[i:])
                if not m:
                    raise ParseError(f"bad object key at {i}: {s[i:i+20]!r}")
                key = m.group(0)
                i += len(key)
            i = skip_ws(s, i)
            if s[i] != ":":
                raise ParseError(f"expected ':' at {i}: {s[i:i+20]!r}")
            value, i, meta = parse_value(s, i + 1)
            obj[key] = value
            metas[key] = meta
            i = skip_ws(s, i)
            if i < len(s) and s[i] == ",":
                i = skip_ws(s, i + 1)
        if i >= len(s):
            raise ParseError("unterminated object")
        return obj, i + 1, {"dynamic": False, "fieldMeta": metas}
    m = re.match(r"-?\d+(?:\.\d+)?", s[i:])
    if m:
        raw = m.group(0)
        value = float(raw) if "." in raw else int(raw)
        return value, i + len(raw), {"dynamic": False}
    for literal, value in (("true", True), ("false", False), ("null", None), ("undefined", None)):
        if s.startswith(literal, i):
            return value, i + len(literal), {"dynamic": False}
    raise ParseError(f"unsupported token at {i}: {s[i:i+40]!r}")


def parse_value(s: str, i: int):
    value, i, meta = parse_primary(s, i)
    parts = [value]
    concat = False
    dynamic = meta.get("dynamic", False)
    while True:
        j = skip_ws(s, i)
        if j < len(s) and s[j] == "+":
            concat = True
            nxt, i, nmeta = parse_primary(s, skip_ws(s, j + 1))
            parts.append(nxt)
            dynamic = dynamic or nmeta.get("dynamic", False)
        else:
            break
    if concat:
        if not all(isinstance(p, str) for p in parts):
            return parts, i, {"dynamic": dynamic, "concatenated": True, "unresolved": True}
        return "".join(parts), i, {"dynamic": dynamic, "concatenated": True}
    return value, i, meta


def find_array(var_name: str):
    m = re.search(rf"\bvar\s+{re.escape(var_name)}\s*=\s*", TEXT)
    if not m:
        raise SystemExit(f"variable {var_name} not found")
    start = TEXT.index("[", m.end())
    return (*parse_primary(TEXT, start), start)


def find_object(var_name: str):
    m = re.search(rf"\bvar\s+{re.escape(var_name)}\s*=\s*", TEXT)
    if not m:
        raise SystemExit(f"variable {var_name} not found")
    start = TEXT.index("{", m.end())
    return (*parse_primary(TEXT, start), start)


def find_string(var_name: str):
    m = re.search(rf"\bvar\s+{re.escape(var_name)}\s*=\s*", TEXT)
    if not m:
        raise SystemExit(f"variable {var_name} not found")
    start = skip_ws(TEXT, m.end())
    value, end, meta = parse_string(TEXT, start)
    return value, meta


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


modes, modes_end, modes_meta, modes_start = find_array("modes_default")
actions, actions_end, actions_meta, actions_start = find_array("INLINE_ACTIONS")
settings, settings_end, settings_meta, settings_start = find_object("DEFAULT_SETTINGS")
inline_rules, _ = find_string("INLINE_OUTPUT_RULES")
append_rules, _ = find_string("APPEND_OUTPUT_RULES")

# getOutputRules() returns a template literal containing ${today}. Keep the
# text exactly, but mark the interpolation explicitly.
m = re.search(r"function getOutputRules\(\) \{(.*?)\n\}", TEXT, re.S)
if not m:
    raise SystemExit("getOutputRules not found")
body = m.group(1)
full_rules, full_meta = None, None
for qmatch in re.finditer(r"`", body):
    try:
        full_rules, _, full_meta = parse_string(body, qmatch.start())
        break
    except ParseError:
        continue
if full_rules is None:
    raise SystemExit("getOutputRules template literal not found")

manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))

# ---------------------------------------------------------------------------
# Self-checks
# ---------------------------------------------------------------------------
problems = []
notes_added = []


def label_for(name, idx, item):
    return f"{name}[{idx}] {item.get('id')!r}"


def check_collection(name, items):
    seen = set()
    for idx, item in enumerate(items):
        label = label_for(name, idx, item)
        ident = item.get("id")
        if not ident:
            problems.append(f"{label}: missing id")
        elif ident in seen:
            problems.append(f"{label}: duplicate id")
        seen.add(ident)
        prompt = item.get("prompt")
        if not isinstance(prompt, str) or not prompt.strip():
            problems.append(f"{label}: empty prompt")
            continue
        if len(prompt) <= 200:
            problems.append(f"{label}: short prompt ({len(prompt)} chars)")
        if "{selection}" not in prompt and "{context}" not in prompt:
            problems.append(f"{label}: no {{selection}}/{{context}} placeholder")
        for field in ("name", "icon", "description"):
            if not item.get(field):
                problems.append(f"{label}: missing {field}")
        if "${" in prompt:
            problems.append(f"{label}: unresolved template interpolation")


check_collection("noteMode", modes)
check_collection("inlineAction", actions)

defaults = [i for i, m in enumerate(modes) if m.get("isDefault")]
if len(defaults) != 1:
    problems.append(f"expected exactly one isDefault mode, found {len(defaults)}")
elif defaults[0] != 0:
    problems.append(f"isDefault mode is not first: {modes[defaults[0]].get('id')}")

for name, items, meta in (("noteMode", modes, modes_meta), ("inlineAction", actions, actions_meta)):
    for idx, item in enumerate(items):
        pmeta = (meta.get("itemMeta") or [])[idx].get("fieldMeta", {}).get("prompt", {})
        if pmeta.get("unresolved") or pmeta.get("dynamic"):
            item["note"] = "原始为动态拼接，已尽量还原"
            notes_added.append(f"{name}[{idx}] {item.get('id')}")
        elif pmeta.get("concatenated"):
            item["note"] = "原始为 + 拼接，已还原为最终字符串"
            notes_added.append(f"{name}[{idx}] {item.get('id')}")

# ---------------------------------------------------------------------------
# Custom mode contract, taken from SettingsTab (src/settings-tab.ts)
# ---------------------------------------------------------------------------
push_idx = TEXT.index('"Add custom mode"')
m_custom = re.search(r"prompt:\s*('(?:[^'\\]|\\.)*')", TEXT[push_idx:], re.S)
if not m_custom:
    raise SystemExit("default custom mode prompt not found")
custom_prompt, _, _ = parse_string(m_custom.group(1), 0)

custom_modes = {
    "description": "自定义模式保存在 data.json 的 customModes 数组中，与内置模式合并后供选择。",
    "storage": "data.json -> customModes: []",
    "requiredFields": ["id", "name", "description", "prompt"],
    "userEditableFields": ["name", "description", "prompt"],
    "autoGeneratedFields": ["id", "icon"],
    "fieldDetails": {
        "id": "添加时自动生成 `custom-<Date.now()>`；在设置里修改名称时按 idDerivation 规则重新生成。UI 文案把 ID 列为必需字段，但用户不直接输入。内置模式也有 id。",
        "name": "模式名称，显示在模式选择器中。设置项标签为 “Mode name”。",
        "icon": "Lucide 图标名。默认 `pencil`；设置 UI 不暴露该字段，新自定义模式固定使用 `pencil`。",
        "description": "一句话说明，显示在模式选择器中。设置项标签为 “Description”。",
        "prompt": "提示词模板。设置项标签为 “Prompt”，文本域 6 行。应包含占位符才能拿到选中文本/上下文。",
        "fullNote": "可选布尔值。true 表示整篇笔记模式（不出现在标准模式列表）。设置 UI 不暴露，自定义模式不会带此字段。",
        "analyzesExisting": "可选布尔值，供分析/文件夹类命令筛选使用。设置 UI 不暴露。",
        "folderDecompositionGuide": "可选字符串，文件夹批量生成时用于指导子笔记拆分。设置 UI 不暴露。",
        "isDefault": "只有内置 `explain` 模式带此标记；自定义模式不设置。"
    },
    "idDerivation": 'mode.id = value.toLowerCase().replace(/\\s+/g, "-").replace(/[^a-z0-9-]/g, "")',
    "placeholders": {
        "{selection}": "全局替换为当前选中文本；选中文本中的双引号会被转义为 \\\"。",
        "{context}": "全局替换为上下文（通常为当前笔记内容）。普通选中流程最多 2000 字符，超出截断并追加 `\\n...(truncated)`；子笔记流程使用以选区为中心的 2000 字符窗口；追加模式传入整篇笔记内容；填充笔记模式传入反向链接上下文（最多 5 个来源、每个 1500 字符）或一句无上下文兜底提示。",
        "unmatched": "未出现的占位符不会被补充；模板里写了 `{selection}`/`{context}` 才会替换，缺少时对应内容不会进入提示词。",
        "caseSensitive": "占位符区分大小写，且只识别这两个精确标记。"
    },
    "outputRulesAppended": "插件会在模式提示词之后自动追加输出规则：标准流程追加 getOutputRules()（YAML frontmatter、mermaid、callout 等规则），整篇追加流程使用 APPEND_OUTPUT_RULES，内联动作使用 INLINE_OUTPUT_RULES。自定义模式无法关闭这些追加规则。",
    "defaultTemplate": custom_prompt,
    "defaultObject": {
        "id": "custom-<Date.now()>",
        "name": "New Mode",
        "icon": "pencil",
        "description": "My custom mode",
        "prompt": custom_prompt
    },
    "uiCopy": "Add your own modes. Each mode needs an ID, name, description, and prompt template. Use {selection} and {context} as placeholders in your prompt.",
    "mergeBehavior": "getAllModes() = [...modes_default, ...this.settings.customModes]；getStandardModes() 过滤掉 fullNote 为真的模式；getFullNoteModes() 只保留 fullNote 为真的模式。",
    "validation": "没有显式校验/规范化逻辑：设置页按下按钮即 push 默认对象，加载时不校验字段。若 prompt 缺失或不是字符串，调用 `.replace` 时会抛错；空 prompt 会生成没有指令的提示词。"
}

default_settings = settings
default_settings_meta = {
    "description": "src/types.ts 中的 DEFAULT_SETTINGS（原样对象），loadSettings() 用 Object.assign({}, DEFAULT_SETTINGS, await this.loadData()) 合并；持久化在插件目录的 data.json。",
    "storage": "data.json",
    "fieldDetails": {
        "claudePath": {"label": "Claude CLI path", "default": "claude", "note": "Claude Code CLI 可执行文件路径。"},
        "modelFlag": {"label": "Claude model", "default": "", "note": "Claude 的 --model 值；空值运行时回退为 sonnet。"},
        "defaultModeId": {"label": "Preferred mode", "default": "", "note": "没有历史模式时的预选模式；空字符串表示不预选。"},
        "lastModeId": {"label": "（无 UI）", "default": "", "note": "记住上次使用的模式；与 defaultModeId 组成 lastModeId || defaultModeId。"},
        "lastSubfolder": {"label": "（无 UI）", "default": "Deep Dives", "note": "上次使用的子文件夹默认值。"},
        "customModes": {"label": "Custom modes", "default": [], "note": "自定义模式对象数组。"},
        "enableLogging": {"label": "Enable logging", "default": True, "note": "把 CLI 调用、错误和耗时写入内存日志。"},
        "aiProvider": {"label": "AI provider", "default": "claude", "note": "可选 claude / gemini / codex / ollama。"},
        "geminiPath": {"label": "Gemini CLI path", "default": "gemini"},
        "geminiModel": {"label": "Gemini model", "default": "", "note": "可选 --model 覆盖；空值用 CLI 默认。"},
        "codexPath": {"label": "Codex CLI path", "default": "codex"},
        "codexModel": {"label": "Codex model", "default": "", "note": "可选 --model 覆盖；空值用 CLI 默认。"},
        "ollamaUrl": {"label": "Ollama server URL", "default": "http://localhost:11434"},
        "ollamaModel": {"label": "Ollama model", "default": "llama3"},
        "setupNoticeShown": {"label": "（无 UI）", "default": False, "note": "首次运行提示是否已展示。"}
    },
    "providerOptions": {
        "claude": "Claude",
        "gemini": "Gemini",
        "codex": "Codex",
        "ollama": "Ollama (local)"
    }
}

result = {
    "source": {
        "plugin": manifest.get("id", "second-brain-builder"),
        "name": manifest.get("name", "Second Brain Builder"),
        "version": manifest.get("version", "1.0.12"),
        "license": "MIT",
        "licenseSource": "https://raw.githubusercontent.com/algometrix/second_brain_builder/master/LICENSE",
        "licenseNote": "本地 bundle / manifest 中没有 license 字段，插件目录也没有 LICENSE 文件；MIT 来自上游仓库的 LICENSE（Copyright (c) 2026 algometrix）。",
        "file": "main.js",
        "manifestFile": "manifest.json",
        "mainJsBytes": SRC.stat().st_size,
        "mainJsSha256": sha256(SRC),
        "manifest": manifest,
        "extractedAt": datetime.now(timezone.utc).isoformat(),
        "bundleHeader": TEXT.splitlines()[0],
        "scope": "四类：noteModes（modes_default）、inlineActions（INLINE_ACTIONS）、customModes 契约、defaultSettings（DEFAULT_SETTINGS）；promptSuffixes 额外记录自动追加的输出规则。内部文件夹拆解/索引/CLI 系统提示词不属于这四类，未纳入。",
        "note": "提示词以原样字符串提取：JS 单/双引号转义已还原为真实字符，模板字面量中的换行保留；{selection} 与 {context} 占位符原样保留。"
    },
    "counts": {
        "noteModes": len(modes),
        "inlineActions": len(actions),
        "noteModesPromptChars": sum(len(m.get("prompt", "")) for m in modes),
        "inlineActionsPromptChars": sum(len(a.get("prompt", "")) for a in actions),
        "customModes": len(settings.get("customModes", []))
    },
    "noteModes": modes,
    "inlineActions": actions,
    "customModes": custom_modes,
    "defaultSettings": default_settings,
    "defaultSettingsMeta": default_settings_meta,
    "promptSuffixes": {
        "description": "自动追加到提示词末尾的输出规则（原样提取）。它们不是模式模板，但会影响最终提示词。",
        "fullNoteRules": full_rules,
        "fullNoteRulesNote": "原始为动态模板字符串，包含 ${today} 插值（当日日期）；已原样保留插值标记。" if full_meta.get("dynamic") else None,
        "inlineRules": inline_rules,
        "appendRules": append_rules
    },
    "validation": {
        "status": "ok" if not problems else "warnings",
        "method": "自写递归下降 JS 字面量解析器（不执行 bundle）；提取后用 Node 独立 eval 原始数组声明并逐字节对比。",
        "problems": problems,
        "notesAdded": notes_added,
        "checks": [
            "每条 noteMode / inlineAction 的 prompt 非空且长度 > 200 字符",
            "id 唯一且存在",
            "name / icon / description 均存在",
            "noteMode prompt 保留 {selection} 和/或 {context}",
            "内置 isDefault 模式位于数组首位",
            "提示词中未发现未还原的 ${...} 模板插值（getOutputRules 除外，见 promptSuffixes）"
        ]
    }
}

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

print(f"wrote {OUT}")
print(f"noteModes={len(modes)} inlineActions={len(actions)}")
print(f"problems={len(problems)}")
for p in problems:
    print("  -", p)
print(f"notes_added={notes_added}")
print("mode ids:", ", ".join(m["id"] for m in modes))
print("action ids:", ", ".join(a["id"] for a in actions))
print("full rules dynamic:", full_meta.get("dynamic"), "chars:", len(full_rules))
