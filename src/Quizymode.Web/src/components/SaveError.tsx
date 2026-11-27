import { getServerErrorMessage } from "@/utils/apiError";

interface SaveErrorProps {
  /** The failed save's error; nothing renders while it is null. A mutation clears it on the next attempt. */
  error: unknown;
  /** Shown when the server sent no message. */
  fallback: string;
  className?: string;
}

/** Inline message under a control whose save was refused or failed. */
const SaveError = ({ error, fallback, className = "mt-2 text-sm text-red-600" }: SaveErrorProps) => {
  if (!error) return null;

  return (
    <p role="alert" className={`${className} break-words`}>
      {getServerErrorMessage(error, fallback)}
    </p>
  );
};

export default SaveError;
