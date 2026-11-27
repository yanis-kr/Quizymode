interface LoadOlderCommentsProps {
  hasOlder: boolean;
  isFetching: boolean;
  isLoadingOlder: boolean;
  errorMessage: string | null;
  onLoadOlder: () => void;
}

/** The button after the last comment. It is also the retry when loading older comments fails. */
const LoadOlderComments = ({
  hasOlder,
  isFetching,
  isLoadingOlder,
  errorMessage,
  onLoadOlder,
}: LoadOlderCommentsProps) => {
  if (!hasOlder) return null;

  return (
    <>
      {errorMessage && (
        <p role="alert" className="mt-2 text-sm text-red-600 break-words">
          {errorMessage}
        </p>
      )}
      <button
        type="button"
        onClick={onLoadOlder}
        disabled={isFetching}
        className="w-full sm:w-auto sm:mx-auto sm:block mt-3 px-4 py-2 text-sm font-medium text-gray-700 bg-surface border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
      >
        {isLoadingOlder ? "Loading..." : "Load older comments"}
      </button>
    </>
  );
};

export default LoadOlderComments;
