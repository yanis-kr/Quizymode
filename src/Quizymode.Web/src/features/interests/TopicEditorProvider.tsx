import { useMemo, useState, type ReactNode } from "react";
import { TopicEditorContext } from "./topicEditorContext";
import { TopicPicker } from "./TopicPicker";
import { useInterests } from "./useInterests";

/** Only mounted while open, so the topics are not fetched on every page just because the provider exists. */
function TopicEditorDialog({ onClose }: { onClose: () => void }) {
  const { interests, status, retry, retrying, save, saving, saveError, resetSave } = useInterests();
  return (
    <TopicPicker
      initial={interests}
      status={status}
      saving={saving}
      error={saveError}
      onSave={(categories) => void save(categories).then(onClose, () => {})}
      retrying={retrying}
      onRetry={retry}
      onClose={() => {
        resetSave();
        onClose();
      }}
    />
  );
}

/** Owns the single My topics dialog (#382); every entry point calls useTopicEditor().open() instead of mounting its own. */
export function TopicEditorProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const value = useMemo(() => ({ open: () => setIsOpen(true) }), []);
  return (
    <TopicEditorContext.Provider value={value}>
      {children}
      {isOpen && <TopicEditorDialog onClose={() => setIsOpen(false)} />}
    </TopicEditorContext.Provider>
  );
}
