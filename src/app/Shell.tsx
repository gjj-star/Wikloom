import { BacklinkDrawer } from "../features/links/BacklinkDrawer";
import { ClipperPage } from "../features/clipper/ClipperPage";
import { ClipDialog } from "../features/clipper/ClipDialog";
import { GenerateNoteDialog } from "../features/ai/GenerateNoteDialog";
import { InlineActionDialog } from "../features/ai/InlineActionDialog";
import { CreateLinkNoteDialog } from "../features/ai/CreateLinkNoteDialog";
import { NoteList } from "../features/notes/NoteList";
import { NotePane } from "../features/notes/NotePane";
import { TagsPage } from "../features/notes/TagsPage";
import { GraphPage } from "../features/graph/GraphPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { useUiStore } from "./uiStore";
import { CommandPalette } from "./CommandPalette";
import { Sidebar } from "./Sidebar";
import { Splitter } from "../ui/Splitter";

export function Shell() {
  const route = useUiStore((state) => state.route);
  const backlinksOpen = useUiStore((state) => state.backlinksOpen);

  return (
    <div className="flex h-full w-full overflow-hidden bg-canvas text-ink">
      <Sidebar />
      <Splitter
        pane="sidebar"
        label="调整侧栏宽度"
        drawerOpen={route === "notes" && backlinksOpen}
      />
      <main className="flex min-w-0 flex-1">
        {route === "notes" ? (
          <>
            <NoteList />
            <Splitter
              pane="noteList"
              label="调整笔记列表宽度"
              drawerOpen={backlinksOpen}
            />
            <NotePane />
            {backlinksOpen ? (
              <Splitter
                pane="backlinks"
                label="调整反链面板宽度"
                growDirection="left"
                drawerOpen
              />
            ) : null}
            <BacklinkDrawer />
          </>
        ) : route === "tags" ? (
          <TagsPage />
        ) : route === "graph" ? (
          <GraphPage />
        ) : route === "clipper" ? (
          <ClipperPage />
        ) : (
          <SettingsPage />
        )}
      </main>
      <CommandPalette />
      <GenerateNoteDialog />
      <InlineActionDialog />
      <CreateLinkNoteDialog />
      <ClipDialog />
    </div>
  );
}
