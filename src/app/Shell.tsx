import { BacklinkDrawer } from "../features/links/BacklinkDrawer";
import { ClipperPage } from "../features/clipper/ClipperPage";
import { GenerateNoteDialog } from "../features/ai/GenerateNoteDialog";
import { InlineActionDialog } from "../features/ai/InlineActionDialog";
import { NoteList } from "../features/notes/NoteList";
import { NotePane } from "../features/notes/NotePane";
import { TagsPage } from "../features/notes/TagsPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { useUiStore } from "./uiStore";
import { CommandPalette } from "./CommandPalette";
import { Sidebar } from "./Sidebar";

export function Shell() {
  const route = useUiStore((state) => state.route);

  return (
    <div className="flex h-full w-full overflow-hidden bg-canvas text-ink">
      <Sidebar />
      <main className="flex min-w-0 flex-1">
        {route === "notes" ? (
          <>
            <NoteList />
            <NotePane />
            <BacklinkDrawer />
          </>
        ) : route === "tags" ? (
          <TagsPage />
        ) : route === "clipper" ? (
          <ClipperPage />
        ) : (
          <SettingsPage />
        )}
      </main>
      <CommandPalette />
      <GenerateNoteDialog />
      <InlineActionDialog />
    </div>
  );
}
