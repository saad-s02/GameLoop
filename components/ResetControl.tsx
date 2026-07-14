"use client";

const APP_STORAGE_KEYS = ["gameloop.session.v1"] as const;

/** Removes exactly the app's localStorage keys, then navigates to the canonical clean URL. */
export function ResetControl() {
  const reset = () => {
    for (const key of APP_STORAGE_KEYS) window.localStorage.removeItem(key);
    window.location.assign("/");
  };

  return (
    <button
      type="button"
      onClick={reset}
      className="rounded border border-black/20 px-3 py-1.5 text-sm font-medium"
    >
      Reset
    </button>
  );
}
