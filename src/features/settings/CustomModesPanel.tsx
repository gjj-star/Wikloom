import { useState } from "react";
import { AlertTriangle, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import type { CustomMode } from "../../core/ai/settings";
import { mergeModes } from "../../core/ai/prompt";
import {
  createCustomMode,
  deriveCustomModeId,
  uniqueCustomModeId,
  validateCustomModeDraft,
} from "../../core/ai/customModes";
import { useAiSettingsStore } from "../ai/aiSettingsStore";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Panel } from "../../ui/Panel";

interface EditingState {
  previousId: string | null;
  draft: CustomMode;
}

export function CustomModesPanel() {
  const settings = useAiSettingsStore((state) => state.settings);
  const patch = useAiSettingsStore((state) => state.patch);

  const [editing, setEditing] = useState<EditingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  function beginAdd() {
    setEditing({
      previousId: null,
      draft: createCustomMode(settings.customModes),
    });
    setError(null);
    setPendingDelete(null);
  }

  function beginEdit(mode: CustomMode) {
    setEditing({ previousId: mode.id, draft: { ...mode } });
    setError(null);
    setPendingDelete(null);
  }

  function cancelEdit() {
    setEditing(null);
    setError(null);
  }

  function updateName(value: string) {
    setEditing((previous) => {
      if (!previous) return previous;
      const derived = deriveCustomModeId(value);
      const others = mergeModes(settings.customModes).filter(
        (mode) => mode.id !== previous.previousId,
      );
      return {
        ...previous,
        draft: {
          ...previous.draft,
          name: value,
          id: derived
            ? uniqueCustomModeId(derived, others, previous.draft.id)
            : previous.draft.id,
        },
      };
    });
  }

  function save() {
    if (!editing) return;
    const draft: CustomMode = {
      ...editing.draft,
      name: editing.draft.name.trim(),
      description: editing.draft.description.trim(),
    };
    const validation = validateCustomModeDraft(draft);
    if (validation) {
      setError(validation);
      return;
    }

    const others = mergeModes(settings.customModes).filter(
      (mode) => mode.id !== editing.previousId,
    );
    const id = uniqueCustomModeId(draft.id, others, editing.draft.id);
    const mode: CustomMode = { ...draft, id };

    const customModes = editing.previousId
      ? settings.customModes.map((item) =>
          item.id === editing.previousId ? mode : item,
        )
      : [...settings.customModes, mode];
    const defaultModeId =
      settings.defaultModeId === editing.previousId
        ? id
        : settings.defaultModeId;

    patch({
      customModes,
      ...(defaultModeId !== settings.defaultModeId ? { defaultModeId } : {}),
    });
    setEditing(null);
    setError(null);
    setPendingDelete(null);
  }

  function remove(mode: CustomMode) {
    if (pendingDelete !== mode.id) {
      setPendingDelete(mode.id);
      return;
    }
    const customModes = settings.customModes.filter(
      (item) => item.id !== mode.id,
    );
    patch({
      customModes,
      ...(settings.defaultModeId === mode.id
        ? { defaultModeId: "explain" }
        : {}),
    });
    if (editing?.previousId === mode.id) setEditing(null);
    setPendingDelete(null);
  }

  return (
    <div id="custom-modes">
      <Panel
        title={
          <span className="inline-flex items-center gap-1.5">
            <Pencil size={14} className="text-accent" />
            自定义模式
          </span>
        }
        description="新增、编辑、删除模式；只保存在本机设置，不写入 Markdown。提示词可用 {selection} 和 {context} 占位符。"
        actions={
          <Button
            size="sm"
            variant="ghost"
            className="border border-line"
            icon={<Plus size={12} />}
            onClick={beginAdd}
          >
            新增模式
          </Button>
        }
      >
        {editing ? (
          <form
            className="mb-4 grid gap-3 rounded-xl border border-accent/25 bg-accent-soft/40 p-3.5"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <div className="flex items-center gap-2">
              <h4 className="text-[12px] font-semibold text-ink">
                {editing.previousId ? "编辑模式" : "新增模式"}
              </h4>
              <span className="font-mono text-[9.5px] text-faint">
                ID: {editing.draft.id}
              </span>
            </div>

            <div className="grid gap-1.5">
              <label
                htmlFor="custom-mode-name"
                className="text-[11px] font-medium text-ink"
              >
                模式名称
              </label>
              <Input
                id="custom-mode-name"
                value={editing.draft.name}
                onChange={(event) => updateName(event.target.value)}
                placeholder="例如：Learning Coach"
                autoFocus
              />
            </div>

            <div className="grid gap-1.5">
              <label
                htmlFor="custom-mode-description"
                className="text-[11px] font-medium text-ink"
              >
                说明
              </label>
              <Input
                id="custom-mode-description"
                value={editing.draft.description}
                onChange={(event) =>
                  setEditing((previous) =>
                    previous
                      ? {
                          ...previous,
                          draft: {
                            ...previous.draft,
                            description: event.target.value,
                          },
                        }
                      : previous,
                  )
                }
                placeholder="一句话说明这个模式怎么用"
              />
            </div>

            <div className="grid gap-1.5">
              <label
                htmlFor="custom-mode-prompt"
                className="text-[11px] font-medium text-ink"
              >
                提示词
              </label>
              <textarea
                id="custom-mode-prompt"
                value={editing.draft.prompt}
                onChange={(event) =>
                  setEditing((previous) =>
                    previous
                      ? {
                          ...previous,
                          draft: {
                            ...previous.draft,
                            prompt: event.target.value,
                          },
                        }
                      : previous,
                  )
                }
                rows={6}
                placeholder={'例如：The user selected "{selection}" while reading:\n\n---\n{context}\n---\n\nWrite…'}
                className="w-full resize-y rounded-lg border border-line bg-card px-3 py-2 font-mono text-[11px] leading-relaxed text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/15"
              />
              <p className="text-[10px] leading-relaxed text-faint">
                用 {"{selection}"} 取当前选中文本，用 {"{context}"} 取当前笔记内容（最多 2000 字符）。
              </p>
            </div>

            {error ? (
              <p className="flex items-center gap-1.5 text-[10.5px] text-red-500 dark:text-red-400">
                <AlertTriangle size={11} />
                {error}
              </p>
            ) : null}

            <div className="flex items-center gap-2 border-t border-line pt-3">
              <Button
                type="submit"
                size="sm"
                variant="primary"
                icon={<Check size={12} />}
              >
                保存模式
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<X size={12} />}
                onClick={cancelEdit}
              >
                取消
              </Button>
            </div>
          </form>
        ) : null}

        {settings.customModes.length === 0 && !editing ? (
          <p className="rounded-lg border border-dashed border-line bg-surface px-3 py-4 text-center text-[11px] leading-relaxed text-faint">
            还没有自定义模式。新增后会出现在生成对话框和默认模式列表里。
          </p>
        ) : null}

        <div className="grid gap-2">
          {settings.customModes.map((mode) => (
            <div
              key={mode.id}
              className="rounded-lg border border-line bg-surface p-3"
            >
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[12px] font-medium text-ink">
                      {mode.name}
                    </span>
                    <span className="font-mono text-[9.5px] text-faint">
                      {mode.id}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
                    {mode.description}
                  </p>
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words font-mono text-[9.5px] leading-relaxed text-faint">
                    {mode.prompt}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="border border-line"
                    aria-label={`编辑 ${mode.name}`}
                    icon={<Pencil size={11} />}
                    onClick={() => beginEdit(mode)}
                  >
                    编辑
                  </Button>
                  {pendingDelete === mode.id ? (
                    <>
                      <Button
                        size="sm"
                        variant="danger"
                        aria-label={`确认删除 ${mode.name}`}
                        icon={<Trash2 size={11} />}
                        onClick={() => remove(mode)}
                      >
                        确认删除
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setPendingDelete(null)}
                      >
                        取消
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`删除 ${mode.name}`}
                      icon={<Trash2 size={11} />}
                      onClick={() => remove(mode)}
                    >
                      删除
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
