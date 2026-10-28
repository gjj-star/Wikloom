import { describe, it, expect, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { createMemoryFileSystem } from '../src/core/fs/memoryFs';
import { useNotesStore } from '../src/features/notes/store';
import { getEditorSelection, selectTextInActiveEditor, setActiveEditor, replaceSelectionWithLink } from '../src/features/editor/editorBridge';

const fault = vi.hoisted(() => ({ fail: false }));
vi.mock('../src/core/vault/write', async (original) => {
  const actual = await original<typeof import('../src/core/vault/write')>();
  return { ...actual, writeNoteFile: async (...args: Parameters<typeof actual.writeNoteFile>) => {
    if (fault.fail) throw new Error('Permission denied (audit fault injection)');
    return actual.writeNoteFile(...args);
  }};
});

describe('completed PRD audit reproductions', () => {
  it('reproduces loss of failed-save draft on rescan', async () => {
    const values = new Map<string,string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string,v: string) => values.set(k,v) });
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    const root = '/audit-completed';
    const original = '---\nid: audit-note\ntitle: Original\ncreated: 2026-10-21T00:00:00Z\nupdated: 2026-10-21T00:00:00Z\n---\n\noriginal body';
    createMemoryFileSystem(root, { seed: { 'Original.md': original } });
    await useNotesStore.getState().openVault({kind:'memory',root,name:'audit'});
    fault.fail = true;
    useNotesStore.getState().updateContent('audit-note', 'important unsaved changes');
    await useNotesStore.getState().flush();
    expect(useNotesStore.getState().saveState).toBe('error');
    expect(useNotesStore.getState().notes[0].content).toBe('important unsaved changes');
    await useNotesStore.getState().rescan();
    expect(useNotesStore.getState().notes[0].content).toContain('original body');
    expect(useNotesStore.getState().saveError).toBeNull();
    fault.fail = false;
    vi.unstubAllGlobals();
  });

  it('reproduces wrong selection after hidden Markdown URL occurrence', () => {
    const original = '[reference](https://example.org/recursion)\n\nrecursion first\nrecursion second\nrecursion third';
    let state = EditorState.create({ doc: original });
    const view = {get state(){return state}, dom:{isConnected:true}, dispatch(spec: any){state=state.update(spec).state}, focus(){}} as unknown as EditorView;
    setActiveEditor(view);
    // Rendered prefix before second visible recursion contains exactly one recursion.
    expect(selectTextInActiveEditor('recursion', 1)).toBe(true);
    const selection = getEditorSelection()!;
    expect(selection.from).toBe(original.indexOf('recursion first'));
    expect(replaceSelectionWithLink(selection, 'recursion')).toEqual({ ok: true });
    expect(state.doc.toString()).toContain('[[recursion]] first\nrecursion second');
    setActiveEditor(null);
  });
});

