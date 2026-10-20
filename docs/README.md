# plugin-modes.json 来源与提取说明

## 这是什么

`plugin-modes.json` 是从本机 Obsidian 插件 **Second Brain Builder 1.0.12** 的
esbuild bundle 中原样提取的提示词与设置数据，供 Wikloom M3 的 AI 生成功能使用。

**它是 M3 的唯一权威源。** 提示词一个字都不要改写、翻译或精简；
`{selection}`、`{context}`、`${today}` 等占位符也按原文保留。

## 来源

- 插件：Second Brain Builder（`second-brain-builder`）
- 版本：`1.0.12`
- 作者：algometrix
- 上游仓库：<https://github.com/algometrix/second_brain_builder>
- 许可证：MIT，Copyright (c) 2026 algometrix
  - 本地 bundle / manifest 中没有 license 字段，插件目录也没有 LICENSE 文件；
    MIT 依据来自上游仓库的
    [LICENSE](https://raw.githubusercontent.com/algometrix/second_brain_builder/master/LICENSE)。
- 提取日期：2026-10-20（Asia/Shanghai）
- 提取时插件目录：由 `OBSIDIAN_PLUGIN_DIR` 指定（本机路径不入库）
- 输入文件：
  - `main.js`，223,298 bytes
  - SHA-256：`e5e63fb3546a966162c19a25420f866270f4409a947ec3c4f5a90b66d17ded9d`
  - `manifest.json`
- JSON 内记录的 `source.extractedAt`：
  `2026-10-20T06:01:21.818714+00:00`（即本机 14:01:21）

## 提取与校验方式

- [extract_plugin_modes.py](../tools/extract_plugin_modes.py)
  - 从 esbuild bundle 中定位 `modes_default`、`INLINE_ACTIONS`、
    `DEFAULT_SETTINGS`、`INLINE_OUTPUT_RULES`、`APPEND_OUTPUT_RULES`
    等声明；
  - 不执行 bundle，只用一个小型 JS 字面量解析器读取字符串、对象、数组和
    `+` 拼接；
  - 还原 JS 转义（`\n`、引号等），保留模板字面量换行和占位符原文。
- [verify_plugin_modes.cjs](../tools/verify_plugin_modes.cjs)
  - Node 独立 `eval` 同一批声明，与 Python 提取出的 JSON 做
    `deepStrictEqual` / 严格字符串比对（字符串逐字节一致）；
  - 对 `getOutputRules()` 渲染结果中的当天日期做归一化，再比对保留
    `${today}` 的原文；
  - 另外校验自定义模式模板、UI 文案、模式/动作数量和
    `validation.status` / `validation.problems`。
- 校验输出：`PARITY OK`
  - 24 个 note modes
  - 9 个 inline actions
  - 15 个 `defaultSettings` 字段
  - `validation.status = "ok"`，`validation.problems = []`

> 两个脚本从 `OBSIDIAN_PLUGIN_DIR` 读输入（也可用第一个命令行参数），输出固定写到
> `docs/plugin-modes.json`；换机器复核时设好该环境变量即可。

## 收录范围

JSON 收录四类核心内容，另附 `promptSuffixes` 输出规则：

1. `noteModes`（`modes_default`）：24 个整篇生成模式，含提示词、图标、
   描述、默认模式标记；
2. `inlineActions`（`INLINE_ACTIONS`）：9 个内联动作，含提示词和行为标记；
3. `customModes`：自定义模式的数据结构、默认模板和 UI 文案；
4. `defaultSettings`：15 个设置字段及字段说明；
5. `promptSuffixes`（附加）：自动追加的输出规则（整篇、内联、追加）。

插件内部用于文件夹拆解、索引页、CLI 系统提示词的内容不属于上述四类，
未纳入本文件。

## 许可证

本目录中的提示词与设置数据来自 Second Brain Builder，按 MIT 许可证使用：

```text
MIT License

Copyright (c) 2026 algometrix

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
