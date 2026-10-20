import { create } from "zustand";
import {
  DEFAULT_AI_SETTINGS,
  loadAiSettings,
  normalizeAiSettings,
  saveAiSettings,
  type AiSettings,
} from "../../core/ai/settings";

interface AiSettingsState {
  settings: AiSettings;
  patch: (partial: Partial<AiSettings>) => void;
  reset: () => void;
}

export const useAiSettingsStore = create<AiSettingsState>((set, get) => ({
  settings: loadAiSettings(),

  patch(partial) {
    const settings = normalizeAiSettings({
      ...get().settings,
      ...partial,
    });
    saveAiSettings(settings);
    set({ settings });
  },

  reset() {
    const settings = { ...DEFAULT_AI_SETTINGS };
    saveAiSettings(settings);
    set({ settings });
  },
}));
