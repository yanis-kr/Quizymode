import { createContext, useContext } from "react";

interface TopicEditor {
  /** Opens the My topics editor. A no-op outside the provider, so pages render without Layout in tests. */
  open: () => void;
}

export const TopicEditorContext = createContext<TopicEditor>({ open() {} });

export function useTopicEditor(): TopicEditor {
  return useContext(TopicEditorContext);
}
