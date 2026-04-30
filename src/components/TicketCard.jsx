import { useState } from "react";
import { ethers } from "ethers";
import { useContract } from "../hooks/useContract";
import DescriptionPreview from "./DescriptionPreview";

export default function TicketCard({ tokenId, info, isOwned, onRefresh }) {
  const { setTicketPrice } = useContract();
  const [newPrice, setNewPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function handleRelist() {
    if (!newPrice) return;
    setLoading(true);
    setMsg("");
    try {
      await setTicketPrice(tokenId, parseFloat(newPrice), true);
      setMsg("Ticket listed for sale.");
      setNewPrice("");
      onRefresh?.();
    } catch (e) {
      setMsg("Error: " + (e.reason || e.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelist() {
    setLoading(true);
    setMsg("");
    try {
      await setTicketPrice(tokenId, parseFloat(ethers.formatEther(info.currentPrice)), false);
      setMsg("Ticket delisted.");
      onRefresh?.();
    } catch (e) {
      setMsg("Error: " + (e.reason || e.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  }

  const statusLabel = info.isUsed
    ? { text: "Used", cls: "bg-red-100 text-red-600" }
    : info.forSaleStatus
      ? { text: "For Sale", cls: "bg-green-100 text-green-700" }
      : { text: "Not Listed", cls: "bg-gray-100 text-gray-500" };

  return (
    <div className="overflow-hidden">
      {info.imageUrl && (
        <div className="aspect-[16/9] w-full bg-gray-100">
          <img
            src={info.imageUrl}
            alt={`${info.eventName || "Event"} ticket poster`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      <div className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-lg font-bold">Admission Ticket</p>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusLabel.cls}`}>
            {statusLabel.text}
          </span>
        </div>

        <div className="mb-3">
          <p className="text-base font-semibold text-gray-900">
            {info.eventName || `Event #${Number(info.eventId)}`}
          </p>
          {info.eventDate && <p className="text-sm text-gray-500">{info.eventDate}</p>}
          {info.venue && <p className="text-xs text-gray-400">{info.venue}</p>}
          {info.seatLabel && <p className="text-sm font-medium text-indigo-700">{info.seatLabel}</p>}
          {info.seatLocation && <p className="text-xs text-gray-500">{info.seatLocation}</p>}
        </div>

        <DescriptionPreview
          text={info.description}
          modalTitle={`${info.eventName || "Event"} Description`}
        />

        <div className="mb-3 space-y-0.5 text-sm text-gray-600">
          <p>
            Price: <span className="font-medium">{ethers.formatEther(info.currentPrice)} ETH</span>
          </p>
          <p>Max Price: {ethers.formatEther(info.maxAllowedPrice)} ETH</p>
          <p>
            Resales: {Number(info.totalResales)} /{" "}
            {Number(info.maxResales) === 0 ? "Unlimited" : Number(info.maxResales)}
          </p>
        </div>

        {isOwned && !info.isUsed && (
          <div className="space-y-2 border-t pt-2">
            <div className="flex gap-2">
              <input
                type="number"
                step="0.001"
                min="0"
                placeholder="Price (ETH)"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                className="w-28 rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <button
                onClick={handleRelist}
                disabled={loading || !newPrice}
                className="rounded bg-indigo-600 px-3 py-1 text-sm text-white transition hover:bg-indigo-700 disabled:opacity-40"
              >
                {loading ? "..." : "Relist"}
              </button>
              {info.forSaleStatus && (
                <button
                  onClick={handleDelist}
                  disabled={loading}
                  className="rounded bg-gray-200 px-3 py-1 text-sm text-gray-700 transition hover:bg-gray-300 disabled:opacity-40"
                >
                  Delist
                </button>
              )}
            </div>
          </div>
        )}

        {msg && (
          <p className={`mt-2 text-xs ${msg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>
            {msg}
          </p>
        )}
      </div>
    </div>
  );
}
