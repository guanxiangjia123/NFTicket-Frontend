import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { useContract } from "../hooks/useContract";
import { useWallet } from "../hooks/useWallet";
import BuyModal from "../components/BuyModal";
import VenueMapModal from "../components/VenueMapModal";
import DescriptionPreview from "../components/DescriptionPreview";
import { fetchNftMetadata, fetchSeatMap } from "../utils/ipfs";
import { CHECKIN_STAFF_WALLETS } from "../contract/config";
import { buildEntryPassMessage, normalizeEntryPassPayload } from "../utils/entryPass";
import {
  buildStaffDirectory,
  listStaffPasses,
  registerActiveStaff,
  updateStaffPass,
} from "../utils/staffInbox";

function makeFallbackSeats(totalTickets) {
  const total = Number(totalTickets || 0);
  return Array.from({ length: total }, (_, i) => ({
    id: i,
    label: `Seat ${i + 1}`,
    section: "",
    row: "",
    number: i + 1,
    location: "",
  }));
}

export default function Home({ role = "guest", roleLoading = false }) {
  const { getNextEventId, getEventDetails, getNextTokenId, getTicketInfo, checkIn } = useContract();
  const { account, connect } = useWallet();

  const [events, setEvents] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buyModal, setBuyModal] = useState(null);
  const [venueMapModal, setVenueMapModal] = useState(null);

  const [staffPasses, setStaffPasses] = useState([]);
  const [selectedCheckInEventId, setSelectedCheckInEventId] = useState(null);
  const [passOps, setPassOps] = useState({});

  const isCustomer = account && !roleLoading && role === "customer";
  const isCheckInStaff = account && !roleLoading && role === "checkin";
  const canViewVenueMap = !account || isCustomer;

  const staffDirectory = useMemo(
    () => buildStaffDirectory(CHECKIN_STAFF_WALLETS || []),
    []
  );

  const currentStaff = useMemo(() => {
    const acc = String(account || "").toLowerCase();
    return staffDirectory.find((s) => s.address === acc) || null;
  }, [account, staffDirectory]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!isCheckInStaff || !account) {
      setStaffPasses([]);
      setSelectedCheckInEventId(null);
      return;
    }

    const refresh = () => {
      const rows = listStaffPasses(account, { includeProcessed: false });
      setStaffPasses(rows);
    };

    refresh();
    const timer = window.setInterval(refresh, 2000);
    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", onStorage);
    };
  }, [isCheckInStaff, account]);

  async function loadData() {
    setLoading(true);
    try {
      const numEvents = await getNextEventId();
      const eventRows = [];

      for (let i = 0; i < numEvents; i++) {
        const ev = await getEventDetails(i);
        if (!ev?.isActive) continue;

        let metadata = null;
        try {
          metadata = await fetchNftMetadata(ev.metadataURI);
        } catch {
          metadata = null;
        }

        let seatMap = { seats: [] };
        try {
          seatMap = await fetchSeatMap(ev.seatMapURI);
        } catch {
          seatMap = { seats: [] };
        }

        const seats = seatMap.seats?.length
          ? seatMap.seats
          : makeFallbackSeats(ev.totalTickets);

        eventRows.push({
          id: i,
          ...ev,
          name: metadata?.name || `Event #${i}`,
          date: metadata?.date || "",
          description: metadata?.description || "",
          imageUrl: metadata?.imageUrl || "",
          venue: metadata?.venue || "",
          seatMapImageUrl: seatMap?.imageUrl || "",
          seats,
        });
      }

      setEvents(eventRows);
      const eventMap = new Map(eventRows.map((e) => [e.id, e]));

      const numTickets = await getNextTokenId();
      const tkArr = [];
      for (let i = 0; i < numTickets; i++) {
        try {
          const info = await getTicketInfo(i);
          const eventId = Number(info.eventId);
          const event = eventMap.get(eventId);
          if (!event) continue;
          const seatId = Number(info.seatId);
          const seatLabel =
            event?.seats?.find((s) => Number(s.id) === seatId)?.label || `Seat ${seatId + 1}`;

          tkArr.push({
            id: i,
            ...info,
            seatLabel,
            eventName: event?.name || `Event #${eventId}`,
            eventDate: event?.date || "",
            description: event?.description || "",
            imageUrl: event?.imageUrl || "",
            seatMapImageUrl: event?.seatMapImageUrl || "",
          });
        } catch {
          // token may not exist
        }
      }

      setTickets(tkArr);
    } catch (e) {
      console.error("Failed to load data:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedCheckInEventId === null || selectedCheckInEventId === undefined) return;
    const exists = events.some((event) => Number(event.id) === Number(selectedCheckInEventId));
    if (!exists) setSelectedCheckInEventId(null);
  }, [events, selectedCheckInEventId]);

  const eventMapById = useMemo(
    () => new Map(events.map((event) => [Number(event.id), event])),
    [events]
  );

  const secondaryTickets = useMemo(
    () => tickets.filter((t) => t.forSaleStatus && !t.isUsed),
    [tickets]
  );

  const staffPassesByEvent = useMemo(() => {
    const map = new Map();
    for (const pass of staffPasses) {
      const eventId = Number(pass.eventId);
      if (!map.has(eventId)) map.set(eventId, []);
      map.get(eventId).push(pass);
    }
    return map;
  }, [staffPasses]);

  const selectedEventPasses = useMemo(() => {
    if (selectedCheckInEventId === null || selectedCheckInEventId === undefined) return [];
    return staffPassesByEvent.get(Number(selectedCheckInEventId)) || [];
  }, [selectedCheckInEventId, staffPassesByEvent]);

  function setPassOp(passId, next) {
    setPassOps((prev) => ({
      ...prev,
      [passId]: {
        ...(prev[passId] || {}),
        ...next,
      },
    }));
  }

  async function handleStartVerify(pass) {
    setPassOp(pass.id, { loading: true, isError: false, message: "Verifying..." });
    try {
      const payload = normalizeEntryPassPayload(pass.payload || {});
      if (!payload.signature) throw new Error("Missing pass signature.");

      const now = Date.now();
      if (now > payload.expiresAt) throw new Error("Entry pass expired.");

      const ticket = await getTicketInfo(payload.tokenId);
      if (ticket.isUsed) throw new Error("Ticket already checked in.");

      if (Number(ticket.eventId) !== payload.eventId) {
        throw new Error("Pass event mismatch.");
      }

      if (Number(ticket.seatId) !== payload.seatId) {
        throw new Error("Pass seat mismatch.");
      }

      const holder = String(payload.holder || "").toLowerCase();
      const ownerOnChain = String(ticket.currentOwner || "").toLowerCase();
      if (holder !== ownerOnChain) {
        throw new Error("Pass holder does not match current owner.");
      }

      const signedMessage = buildEntryPassMessage(payload);
      const recovered = ethers.verifyMessage(signedMessage, payload.signature).toLowerCase();
      if (recovered !== holder) {
        throw new Error("Signature verification failed.");
      }

      updateStaffPass(pass.id, { status: "verified", error: "" });
      setPassOp(pass.id, { loading: false, isError: false, message: "Verification success." });
      setStaffPasses(listStaffPasses(account, { includeProcessed: false }));
    } catch (err) {
      const message = err?.reason || err?.message || "Verification failed.";
      updateStaffPass(pass.id, { status: "invalid", error: message });
      setPassOp(pass.id, { loading: false, isError: true, message });
      setStaffPasses(listStaffPasses(account, { includeProcessed: false }));
    }
  }

  async function handleConfirmCheckIn(pass) {
    setPassOp(pass.id, { loading: true, isError: false, message: "Submitting check-in..." });
    try {
      const payload = normalizeEntryPassPayload(pass.payload || {});
      await checkIn(payload.tokenId);
      updateStaffPass(pass.id, { status: "checked_in", error: "" });
      setPassOp(pass.id, { loading: false, isError: false, message: "Checked in successfully." });
      setStaffPasses(listStaffPasses(account, { includeProcessed: false }));
      loadData();
    } catch (err) {
      setPassOp(pass.id, {
        loading: false,
        isError: true,
        message: err?.reason || err?.message || "Check-in transaction failed.",
      });
    }
  }

  function openCheckInQueue(eventId) {
    if (account) registerActiveStaff(account, eventId);
    setSelectedCheckInEventId(eventId);
  }

  if (loading) {
    return (
      <div className="py-16 text-center text-gray-400">
        <p className="text-lg">Loading from blockchain...</p>
        <p className="mt-1 text-sm">Make sure your RPC node is running.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold">Events</h1>

      {events.length === 0 ? (
        <div className="mb-10 rounded-xl border bg-gray-50 p-8 text-center text-gray-400">
          No events yet. An admin needs to create one.
        </div>
      ) : (
        <div className="mb-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          {events.map((ev) => {
            const minted = Number(ev.ticketsMinted);
            const total = Number(ev.totalTickets);
            const soldOut = minted >= total;
            const pct = total > 0 ? Math.round((minted / total) * 100) : 0;

            const takenSeatIds = new Set(
              tickets
                .filter((t) => Number(t.eventId) === ev.id)
                .map((t) => Number(t.seatId))
            );
            const seatOptions = (ev.seats || []).map((s) => ({
              ...s,
              taken: takenSeatIds.has(Number(s.id)),
            }));

            const checkInCount = (staffPassesByEvent.get(Number(ev.id)) || []).filter(
              (p) => p.status === "pending" || p.status === "verified"
            ).length;

            return (
              <div
                key={ev.id}
                className="overflow-hidden rounded-xl border-2 border-gray-200 bg-white shadow transition hover:border-indigo-300"
              >
                {ev.imageUrl && (
                  <div className="aspect-[16/9] w-full bg-gray-100">
                    <img
                      src={ev.imageUrl}
                      alt={`${ev.name} ticket`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                )}

                <div className="p-5">
                  <div className="mb-1">
                    <h2 className="text-lg font-bold leading-tight">{ev.name}</h2>
                  </div>
                  <p className="mb-1 text-sm text-gray-500">{ev.date}</p>
                  {ev.venue && <p className="mb-2 text-xs text-gray-400">{ev.venue}</p>}
                  <DescriptionPreview
                    text={ev.description}
                    modalTitle={`${ev.name} Description`}
                  />
                  {canViewVenueMap && !isCheckInStaff && (
                    <div className="mb-3 h-9">
                      {ev.seatMapImageUrl ? (
                        <button
                          onClick={() =>
                            setVenueMapModal({
                              title: `${ev.name} - Venue Map`,
                              imageUrl: ev.seatMapImageUrl,
                            })
                          }
                          className="h-9 rounded border border-gray-200 px-3 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
                        >
                          View Venue Map
                        </button>
                      ) : (
                        <div className="flex h-9 w-36 items-center justify-center rounded border border-dashed border-gray-300 text-xs font-medium text-gray-400">
                          Unknown
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mb-3">
                    <div className="mb-1 flex justify-between text-xs text-gray-400">
                      <span>
                        {minted} / {total} sold
                      </span>
                      <span>{soldOut ? "SOLD OUT" : `${total - minted} left`}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-gray-200">
                      <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xl font-bold text-indigo-700">
                        {ethers.formatEther(ev.ticketPrice)} ETH
                      </p>
                      <p className="text-xs text-gray-400">
                        Resale ceiling: {ethers.formatEther(ev.maxResalePrice)} ETH
                      </p>
                    </div>

                    {isCheckInStaff ? (
                      <button
                        onClick={() => openCheckInQueue(ev.id)}
                        className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-700"
                      >
                        Check In ({checkInCount})
                      </button>
                    ) : soldOut ? (
                      <span className="text-sm font-medium text-red-500">Sold Out</span>
                    ) : !account ? (
                      <button
                        onClick={connect}
                        className="rounded bg-indigo-600 px-4 py-2 text-sm text-white transition hover:bg-indigo-700"
                      >
                        Connect
                      </button>
                    ) : isCustomer ? (
                      <button
                        onClick={() =>
                          setBuyModal({
                            type: "primary",
                            eventId: ev.id,
                            priceWei: ev.ticketPrice,
                            name: ev.name,
                            seatOptions,
                          })
                        }
                        className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
                      >
                        Buy Ticket
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isCheckInStaff && selectedCheckInEventId !== null && (
        <section className="mb-10 rounded-xl border bg-white p-5 shadow">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-bold">
              Check-In Queue - {eventMapById.get(Number(selectedCheckInEventId))?.name || `Event #${selectedCheckInEventId}`}
            </h2>
            <button
              onClick={() => setSelectedCheckInEventId(null)}
              className="text-sm text-gray-500 hover:underline"
            >
              Close
            </button>
          </div>

          {selectedEventPasses.length === 0 ? (
            <div className="rounded border bg-gray-50 p-4 text-sm text-gray-500">
              No pass assigned to this staff for current event.
            </div>
          ) : (
            <div className="space-y-3">
              {selectedEventPasses.map((pass) => {
                const payload = normalizeEntryPassPayload(pass.payload || {});
                const eventInfo = eventMapById.get(Number(pass.eventId));
                const seatLabel =
                  eventInfo?.seats?.find((s) => Number(s.id) === Number(pass.seatId))?.label ||
                  `Seat ${Number(pass.seatId) + 1}`;

                const op = passOps[pass.id] || {};
                const canVerify = pass.status === "pending" || pass.status === "invalid";
                const canCheckIn = pass.status === "verified";

                return (
                  <div key={pass.id} className="rounded border p-3">
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        {eventInfo?.name || "Event"} - {seatLabel}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          pass.status === "verified"
                            ? "bg-green-100 text-green-700"
                            : pass.status === "invalid"
                              ? "bg-red-100 text-red-600"
                              : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {pass.status}
                      </span>
                    </div>

                    <p className="text-xs text-gray-500">
                      Holder: <span className="font-mono">{payload.holder || "-"}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      Expires: {payload.expiresAt ? new Date(payload.expiresAt).toLocaleString() : "-"}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {canVerify && (
                        <button
                          onClick={() => handleStartVerify(pass)}
                          disabled={op.loading}
                          className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {op.loading ? "Verifying..." : "Start Verify"}
                        </button>
                      )}
                      {canCheckIn && (
                        <button
                          onClick={() => handleConfirmCheckIn(pass)}
                          disabled={op.loading}
                          className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          {op.loading ? "Submitting..." : "Confirm Check In"}
                        </button>
                      )}
                    </div>

                    {pass.error && (
                      <p className="mt-2 text-xs text-red-500">{pass.error}</p>
                    )}
                    {op.message && (
                      <p className={`mt-2 text-xs ${op.isError ? "text-red-500" : "text-green-600"}`}>
                        {op.message}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {!isCheckInStaff && (
        <>
          <h2 className="mb-6 text-3xl font-bold">Secondary Market</h2>

          {secondaryTickets.length === 0 ? (
            <div className="rounded-xl border bg-gray-50 p-6 text-center text-gray-400">
              No tickets listed for resale right now.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {secondaryTickets.map((t) => {
                const isOwnListing = account && t.currentOwner?.toLowerCase() === account.toLowerCase();
                const eventRef = eventMapById.get(Number(t.eventId));
                const displayEventName =
                  eventRef?.name || t.eventName || `Event #${Number(t.eventId)}`;
                const seatMapImageUrl =
                  eventRef?.seatMapImageUrl || t.seatMapImageUrl || "";

                return (
                  <div
                    key={t.id}
                    className="overflow-hidden rounded-xl border-2 border-gray-200 bg-white shadow transition hover:border-indigo-300"
                  >
                    {t.imageUrl && (
                      <div className="aspect-[16/9] w-full bg-gray-100">
                        <img
                          src={t.imageUrl}
                          alt={`Resale ticket for ${t.eventName || "event"}`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}

                    <div className="p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold">Resale Ticket</p>
                          <p className="text-sm font-medium text-gray-700">
                            {displayEventName}
                          </p>
                          {t.eventDate && <p className="mb-2 text-xs text-gray-400">{t.eventDate}</p>}
                        </div>
                        {isOwnListing && (
                          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                            Yours
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        Seat: {t.seatLabel || `Seat ${Number(t.seatId) + 1}`}
                      </p>
                      <p className="text-lg font-semibold text-indigo-700">
                        {ethers.formatEther(t.currentPrice)} ETH
                      </p>
                      {canViewVenueMap && (
                        <div className="mb-3 h-9">
                          {seatMapImageUrl ? (
                            <button
                              onClick={() =>
                                setVenueMapModal({
                                  title: `${displayEventName} - Venue Map`,
                                  imageUrl: seatMapImageUrl,
                                })
                              }
                              className="h-9 rounded border border-gray-200 px-3 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
                            >
                              View Venue Map
                            </button>
                          ) : (
                            <div className="flex h-9 w-36 items-center justify-center rounded border border-dashed border-gray-300 text-xs font-medium text-gray-400">
                              Unknown
                            </div>
                          )}
                        </div>
                      )}
                      <DescriptionPreview
                        text={t.description}
                        modalTitle={`${displayEventName} Description`}
                      />
                      <p className="text-xs text-gray-400">
                        Ceiling: {ethers.formatEther(t.maxAllowedPrice)} ETH
                      </p>
                      <p className="mb-3 text-xs text-gray-400">
                        Resales: {Number(t.totalResales)} /{" "}
                        {Number(t.maxResales) === 0 ? "Unlimited" : Number(t.maxResales)}
                      </p>

                      {!account ? (
                        <button
                          onClick={connect}
                          className="w-full rounded bg-indigo-600 py-1.5 text-sm text-white hover:bg-indigo-700"
                        >
                          Connect
                        </button>
                      ) : isOwnListing ? (
                        <button
                          disabled
                          className="w-full cursor-not-allowed rounded bg-gray-200 py-1.5 text-sm text-gray-500"
                        >
                          Your Listing
                        </button>
                      ) : isCustomer ? (
                        <button
                          onClick={() =>
                            setBuyModal({ type: "secondary", tokenId: t.id, priceWei: t.currentPrice })
                          }
                          className="w-full rounded bg-indigo-600 py-1.5 text-sm text-white hover:bg-indigo-700"
                        >
                          Buy
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {buyModal && (
        <BuyModal
          {...buyModal}
          onClose={() => setBuyModal(null)}
          onSuccess={() => {
            setBuyModal(null);
            loadData();
          }}
        />
      )}
      {venueMapModal && (
        <VenueMapModal
          title={venueMapModal.title}
          imageUrl={venueMapModal.imageUrl}
          onClose={() => setVenueMapModal(null)}
        />
      )}
    </div>
  );
}
