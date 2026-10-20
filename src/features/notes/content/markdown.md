# Markdown 速查

## 文本

**加粗**、*斜体*、~~删除线~~、`行内代码`。

## 表格

| 语法 | 作用 | 示例 |
| --- | --- | --- |
| `#` | 标题 | `## 二级标题` |
| `-` | 无序列表 | `- 一项` |
| `>` | 引用 | `> 一段话` |
| `$$` | 公式 | `$$a^2+b^2=c^2$$` |

## 代码

```python
def backlinks(note, all_notes):
    return [n for n in all_notes
            if f"[[{note.title}]]" in n.content]
```

## 公式

$$
\frac{n!}{k!(n-k)!} = \binom{n}{k}
$$

回到 [[编辑器与阅读态]]。
