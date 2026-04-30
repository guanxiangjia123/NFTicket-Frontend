import { useEffect, useMemo, useRef, useState } from "react";

const MAX_PREVIEW_CHARS = 300;

export default function DescriptionPreview({ text = "", modalTitle = "Description" }) {
  const [open, setOpen] = useState(false);
  const [isVisuallyClipped, setIsVisuallyClipped] = useState(false);
  const previewContainerRef = useRef(null);
  const normalized = String(text || "").trim();

  const { preview, isTruncated } = useMemo(() => {
    if (!normalized) return { preview: "", isTruncated: false };
    if (normalized.length <= MAX_PREVIEW_CHARS) {
      return { preview: normalized, isTruncated: false };
    }
    return {
      preview: `${normalized.slice(0, MAX_PREVIEW_CHARS).trimEnd()}...`,
      isTruncated: true,
    };
  }, [normalized]);

  useEffect(() => {
    const checkClipped = () => {
      const el = previewContainerRef.current;
      if (!el) {
        setIsVisuallyClipped(false);
        return;
      }
      setIsVisuallyClipped(el.scrollHeight > el.clientHeight + 1);
    };

    checkClipped();
    window.addEventListener("resize", checkClipped);
    return () => window.removeEventListener("resize", checkClipped);
  }, [preview]);

  if (!normalized) return null;

  const canExpand = isTruncated || isVisuallyClipped;

  return (
    <>
      <div className="mb-3">
        <div ref={previewContainerRef} className="h-[4.5rem] overflow-hidden">
          <p className="text-sm leading-relaxed text-gray-600">{preview}</p>
        </div>
        {canExpand && (
          <button
            onClick={() => setOpen(true)}
            className="mt-1 text-xs font-medium text-indigo-700 hover:underline"
          >
            View Full Description
          </button>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">{modalTitle}</h3>
              <button
                onClick={() => setOpen(false)}
                className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                Close
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto rounded-lg border bg-gray-50 p-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                {normalized}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
