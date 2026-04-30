export default function VenueMapModal({ title = "Venue Map", imageUrl, onClose }) {
  if (!imageUrl) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className="w-full max-w-3xl rounded-2xl bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            Close
          </button>
        </div>
        <div className="overflow-hidden rounded-xl border bg-gray-50">
          <img
            src={imageUrl}
            alt={title}
            className="max-h-[70vh] w-full object-contain"
            loading="lazy"
          />
        </div>
      </div>
    </div>
  );
}
