# 编辑器与阅读态

正文默认是**阅读态**：排版优先。点一下右上角的「编辑」，或者按 `Ctrl E` 进入编辑态，CodeMirror 接管正文。

## 两种状态

- 阅读态：适合回看、复制、顺着链接跳
- 编辑态：适合长写；`Ctrl S` 保存后回到阅读态

编辑器用 CodeMirror 6，Markdown 高亮、行内代码和标题都会着色：

```ts
export function wordCount(text: string): number {
  return text.replace(/\s/g, "").length;
}
```

排版相关的选择记在 [[主题与排版]]，完整语法在 [[Markdown 速查]]。
