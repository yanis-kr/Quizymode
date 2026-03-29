const LoadingSpinner = () => {
  return (
    <div
      className="flex justify-center items-center py-12"
      role="status"
      aria-live="polite"
    >
      <div
        className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"
        aria-hidden="true"
      ></div>
      <span className="sr-only">Loading...</span>
    </div>
  );
};

export default LoadingSpinner;

