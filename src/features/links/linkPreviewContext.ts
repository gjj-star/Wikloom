import { createContext, useContext } from "react";

export interface LinkPreviewApi {
  showPreview: (target: string, element: HTMLElement) => void;
  hidePreview: () => void;
  closePreview: () => void;
}

export const LinkPreviewContext = createContext<LinkPreviewApi | null>(null);

export function useLinkPreview(): LinkPreviewApi | null {
  return useContext(LinkPreviewContext);
}
