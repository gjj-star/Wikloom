import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Tag as TagIcon, X } from "lucide-react";
import type { Note } from "../../core/notes/types";
import { useUiStore } from "../../app/uiStore";
import { cn } from "../../ui/cn";
import { Tag } from "../../ui/Tag";
import { useNotesStore } from "./store";

function cleanDraft(value: string): string {
  return value.replace(/^#+/, "").trim();
}

function EditableTag({
  tag,
  onRemove,
}: {
  tag: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full border border-line bg-card py-0.5 pl-1.5 pr-0.5 text-[10px] font-medium leading-none text-muted">
      <span>#{tag}</span>
      <button
        type="button"
        aria-label={`删除标签 ${tag}`}
        onClick={onRemove}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-faint transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25"
      >
        <X size={9} />
      </button>
    </span>
  );
}

export function TagProperties({ note }: { note: Note }) {
  const mode = useUiStore((state) => state.mode);
  const notes = useNotesStore((state) => state.notes);
  const updateTags = useNotesStore((state) => state.updateTags);

  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    setDraft("");
    setOpen(false);
    setActiveIndex(-1);
  }, [note.id]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const item of notes) {
      for (const tag of item.tags) tags.add(tag);
    }
    return [...tags].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [notes]);

  const query = cleanDraft(draft).toLowerCase();
  const suggestions = useMemo(() => {
    const existing = new Set(note.tags);
    return allTags
      .filter((tag) => !existing.has(tag))
      .filter((tag) => !query || tag.toLowerCase().includes(query))
      .slice(0, 8);
  }, [allTags, note.tags, query]);

  function currentTags(): string[] {
    return (
      useNotesStore.getState().notes.find((item) => item.id === note.id)?.tags ??
      note.tags
    );
  }

  function addTag(value: string): void {
    const tag = cleanDraft(value);
    if (!tag) return;
    const tags = currentTags();
    if (!tags.some((item) => item.toLowerCase() === tag.toLowerCase())) {
      updateTags(note.id, [...tags, tag]);
    }
    setDraft("");
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  function removeTag(tag: string): void {
    updateTags(
      note.id,
      currentTags().filter((item) => item !== tag),
    );
    inputRef.current?.focus();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (suggestions.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => {
        if (index < 0) {
          return event.key === "ArrowDown" ? 0 : suggestions.length - 1;
        }
        return event.key === "ArrowDown"
          ? (index + 1) % suggestions.length
          : (index - 1 + suggestions.length) % suggestions.length;
      });
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const picked =
        open && activeIndex >= 0 ? suggestions[activeIndex] : undefined;
      addTag(picked ?? draft);
      return;
    }

    if (event.key === "Escape") {
      if (!open && !draft) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === "Backspace" && draft === "") {
      const tags = currentTags();
      if (tags.length === 0) return;
      event.preventDefault();
      removeTag(tags[tags.length - 1]);
    }
  }

  const editing = mode === "edit";

  return (
    <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-line bg-surface/60 px-4 py-1.5">
      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">
        <TagIcon size={11} />
        标签
      </span>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {note.tags.map((tag) =>
          editing ? (
            <EditableTag
              key={tag}
              tag={tag}
              onRemove={() => removeTag(tag)}
            />
          ) : (
            <Tag key={tag}>{tag}</Tag>
          ),
        )}

        {editing ? (
          <div className="relative">
            <input
              ref={inputRef}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setOpen(true);
                setActiveIndex(-1);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onKeyDown={handleKeyDown}
              role="combobox"
              aria-label="添加标签"
              aria-autocomplete="list"
              aria-expanded={open && suggestions.length > 0}
              aria-controls={listId}
              aria-activedescendant={
                open && activeIndex >= 0
                  ? `${listId}-${activeIndex}`
                  : undefined
              }
              placeholder="添加标签…"
              className="h-6 w-[112px] rounded-full border border-dashed border-line-strong bg-transparent px-2 text-[10.5px] text-ink placeholder:text-faint focus:border-accent focus:bg-card focus:outline-none focus:ring-2 focus:ring-accent/10"
            />

            {open && suggestions.length > 0 ? (
              <div
                id={listId}
                role="listbox"
                aria-label="已有标签"
                className="absolute left-0 top-full z-40 mt-1 max-h-56 w-56 overflow-y-auto rounded-lg border border-line bg-card p-1 shadow-[var(--c-shadow)]"
              >
                {suggestions.map((tag, index) => (
                  <div
                    key={tag}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => addTag(tag)}
                    className={cn(
                      "flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px]",
                      index === activeIndex
                        ? "bg-accent-soft text-accent"
                        : "text-muted hover:bg-hover hover:text-ink",
                    )}
                  >
                    <span className="text-faint">#</span>
                    <span className="truncate">{tag}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : note.tags.length === 0 ? (
          <span className="text-[11px] text-faint">暂无标签</span>
        ) : null}
      </div>
    </div>
  );
}
