import { useEffect, useMemo, useState } from "react";
import TicketCard from "../components/TicketCard";
import VenueMapModal from "../components/VenueMapModal";
import { useContract } from "../hooks/useContract";
import { useWallet } from "../hooks/useWallet";
import { fetchNftMetadata, fetchSeatMap, uploadEntryPassToIpfs } from "../utils/ipfs";
import { buildEntryPassMessage, normalizeEntryPassPayload } from "../utils/entryPass";
import {
  buildStaffDirectory,
  findLatestIssuedPassForTicketHolder,
  listActiveStaff,
  listIssuedPassesForHolder,
  pushStaffPass,
} from "../utils/staffInbox";

const PASS_VALIDITY_MS = 5 * 60 * 1000;

function isPersistedPassValidForTicket(passRow, ticket, holderAddress) {
  if (!passRow || !ticket) return false;
  const holder = String(holderAddress || "").toLowerCase();
  if (!holder) return false;

  const payload = normalizeEntryPassPayload(passRow.payload || {});
  const tokenId = Number(ticket.id);
  const eventId = Number(ticket.eventId);
  const seatId = Number(ticket.seatId);

  if (Number(passRow.tokenId) !== tokenId) return false;
  if (Number(payload.tokenId) !== tokenId) return false;
  if (Number(payload.eventId) !== eventId) return false;
  if (Number(payload.seatId) !== seatId) return false;
  if (String(payload.holder || "").toLowerCase() !== holder) return false;
  if (Number(payload.expiresAt || 0) <= Date.now()) return false;

  return true;
}

export default function MyTickets() {
  const { getNextTokenId, getTicketInfo, getEventDetails } = useContract();
  const { account, connect, provider } = useWallet();

  const [myTickets, setMyTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [entryPasses, setEntryPasses] = useState({});
  const [venueMapModal, setVenueMapModal] = useState(null);

  const [activeStaffByEvent, setActiveStaffByEvent] = useState({});
  const [issuedPassByToken, setIssuedPassByToken] = useState({});

  useEffect(() => {
    if (account) loadMyTickets();
  }, [account]);

  const eventIds = useMemo(() => {
    const uniq = new Set(myTickets.map((t) => Number(t.eventId)));
    return Array.from(uniq).sort((a, b) => a - b);
  }, [myTickets]);

  useEffect(() => {
    const refresh = () => {
      const next = {};
      for (const eventId of eventIds) {
        next[eventId] = listActiveStaff(eventId);
      }
      setActiveStaffByEvent(next);

      const issued = listIssuedPassesForHolder(account || "");
      const issuedMap = {};
      for (const row of issued) {
        const tokenId = Number(row.tokenId);
        if (!Number.isFinite(tokenId)) continue;
        if (!issuedMap[tokenId]) issuedMap[tokenId] = row;
      }
      setIssuedPassByToken(issuedMap);
    };

    refresh();
    const timer = window.setInterval(refresh, 1500);
    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", onStorage);
    };
  }, [account, eventIds]);

  async function loadMyTickets() {
    setLoading(true);
    try {
      const total = await getNextTokenId();
      const owned = [];
      const eventCache = new Map();
      const seatCache = new Map();

      for (let i = 0; i < total; i++) {
        try {
          const info = await getTicketInfo(i);
          if (info.currentOwner?.toLowerCase() !== account.toLowerCase()) continue;

          const eventId = Number(info.eventId);
          let event = eventCache.get(eventId);
          if (!event) {
            event = await getEventDetails(eventId);
            eventCache.set(eventId, event);
          }
          if (!event?.isActive) continue;

          let metadata = null;
          try {
            metadata = await fetchNftMetadata(event.metadataURI);
          } catch {
            metadata = null;
          }

          let seatManifest = seatCache.get(eventId);
          if (!seatManifest) {
            try {
              seatManifest = await fetchSeatMap(event.seatMapURI);
            } catch {
              seatManifest = { seats: [] };
            }
            seatCache.set(eventId, seatManifest);
          }

          const seatId = Number(info.seatId);
          const seatLabel =
            seatManifest?.seats?.find((s) => Number(s.id) === seatId)?.label || `Seat ${seatId + 1}`;
          const seatLocation =
            seatManifest?.seats?.find((s) => Number(s.id) === seatId)?.location || "";

          owned.push({
            id: i,
            ...info,
            eventName: metadata?.name || `Event #${eventId}`,
            eventDate: metadata?.date || "",
            description: metadata?.description || "",
            imageUrl: metadata?.imageUrl || "",
            venue: metadata?.venue || "",
            seatMapImageUrl: seatManifest?.imageUrl || "",
            seatLabel,
            seatLocation,
          });
        } catch {
          // token might not exist; skip
        }
      }
      setMyTickets(owned);
    } catch (e) {
      console.error("Failed to load tickets:", e);
    } finally {
      setLoading(false);
    }
  }

  const sortedTickets = useMemo(
    () => [...myTickets].sort((a, b) => Number(a.id) - Number(b.id)),
    [myTickets]
  );

  function updateAssignedStaff(tokenId, value) {
    setEntryPasses((prev) => ({
      ...prev,
      [tokenId]: {
        ...(prev[tokenId] || {}),
        assignedStaff: String(value || "").toLowerCase(),
      },
    }));
  }

  async function createAndSendEntryPass(ticket) {
    if (!provider || !account) return;
    if (ticket.forSaleStatus) return;

    const tokenId = Number(ticket.id);
    const eventId = Number(ticket.eventId);
    const seatId = Number(ticket.seatId);
    const alreadyIssued = findLatestIssuedPassForTicketHolder(tokenId, account);
    if (isPersistedPassValidForTicket(alreadyIssued, ticket, account)) {
      const normalizedPayload = normalizeEntryPassPayload(alreadyIssued.payload || {});
      setEntryPasses((prev) => ({
        ...prev,
        [tokenId]: {
          ...(prev[tokenId] || {}),
          status: "ready",
          payload: normalizedPayload,
          passURI: alreadyIssued.passURI || "",
          assignedStaff: alreadyIssued.staffAddress || "",
          assignedStaffName: alreadyIssued.staffName || "",
          error: "Entry pass already generated for this ticket.",
          sentAt: Number(alreadyIssued.createdAt || Date.now()),
        },
      }));
      return;
    }

    if (entryPasses[tokenId]?.status === "pending") return;

    const eventStaffDirectory = buildStaffDirectory(activeStaffByEvent[eventId] || []);
    const assignedStaff = String(entryPasses[tokenId]?.assignedStaff || "").toLowerCase();
    const assignedStaffName = eventStaffDirectory.find((s) => s.address === assignedStaff)?.name || "";

    if (!assignedStaff) {
      setEntryPasses((prev) => ({
        ...prev,
        [tokenId]: {
          ...(prev[tokenId] || {}),
          status: "error",
          error: "Please select staff before generating pass.",
        },
      }));
      return;
    }

    if (!eventStaffDirectory.some((s) => s.address === assignedStaff)) {
      setEntryPasses((prev) => ({
        ...prev,
        [tokenId]: {
          ...(prev[tokenId] || {}),
          status: "error",
          error: "Selected staff is not active for this event.",
        },
      }));
      return;
    }

    const issuedAt = Date.now();
    const expiresAt = issuedAt + PASS_VALIDITY_MS;

    const payload = normalizeEntryPassPayload({
      tokenId,
      eventId,
      seatId,
      holder: account,
      issuedAt,
      expiresAt,
      signature: "",
    });

    const message = buildEntryPassMessage(payload);
    setEntryPasses((prev) => ({
      ...prev,
      [tokenId]: {
        ...(prev[tokenId] || {}),
        status: "pending",
        payload: null,
        error: "",
      },
    }));

    try {
      const signer = await provider.getSigner();
      const signature = await signer.signMessage(message);
      const signedPayload = normalizeEntryPassPayload({ ...payload, signature });
      const { passURI } = await uploadEntryPassToIpfs(
        signedPayload,
        `entry-pass-token-${tokenId}-${issuedAt}`
      );

      pushStaffPass({
        staffAddress: assignedStaff,
        staffName: assignedStaffName,
        payload: signedPayload,
        eventId,
        tokenId,
        seatId,
        passURI,
      });

      setEntryPasses((prev) => ({
        ...prev,
        [tokenId]: {
          ...(prev[tokenId] || {}),
          status: "ready",
          payload: signedPayload,
          passURI,
          error: "",
          assignedStaff,
          assignedStaffName,
          sentAt: Date.now(),
        },
      }));
      setIssuedPassByToken((prev) => ({
        ...prev,
        [tokenId]: {
          tokenId,
          eventId,
          seatId,
          createdAt: Date.now(),
          passURI,
          payload: signedPayload,
          staffAddress: assignedStaff,
          staffName: assignedStaffName,
        },
      }));
    } catch (err) {
      setEntryPasses((prev) => ({
        ...prev,
        [tokenId]: {
          ...(prev[tokenId] || {}),
          status: "error",
          payload: null,
          error: err?.reason || err?.message || "Signing or sending failed",
        },
      }));
    }
  }

  if (!account) {
    return (
      <div className="py-16 text-center">
        <p className="mb-4 text-lg text-gray-500">Connect your wallet to see your tickets.</p>
        <button
          onClick={connect}
          className="rounded bg-indigo-600 px-6 py-2 text-white transition hover:bg-indigo-700"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="py-16 text-center text-gray-400">
        <p>Scanning the blockchain for your tickets...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">My Tickets</h1>
        <button onClick={loadMyTickets} className="text-sm text-indigo-600 hover:underline">
          Refresh
        </button>
      </div>

      {sortedTickets.length === 0 ? (
        <div className="rounded-xl border bg-gray-50 py-12 text-center">
          <p className="text-lg text-gray-400">You don't own any tickets yet.</p>
          <p className="mt-1 text-sm text-gray-400">
            Browse the <a href="/" className="text-indigo-500 hover:underline">Events</a> page to buy one.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sortedTickets.map((t) => {
            const rawPersistedPass = issuedPassByToken[Number(t.id)] || null;
            const persistedIssuedPass = isPersistedPassValidForTicket(rawPersistedPass, t, account)
              ? rawPersistedPass
              : null;
            const persistedPassState = persistedIssuedPass
              ? {
                  status: "ready",
                  payload: normalizeEntryPassPayload(persistedIssuedPass.payload || {}),
                  passURI: persistedIssuedPass.passURI || "",
                  assignedStaff: persistedIssuedPass.staffAddress || "",
                  assignedStaffName: persistedIssuedPass.staffName || "",
                  sentAt: Number(persistedIssuedPass.createdAt || Date.now()),
                }
              : null;
            const pass = entryPasses[t.id] || persistedPassState || {};
            const eventId = Number(t.eventId);
            const eventStaffDirectory = buildStaffDirectory(activeStaffByEvent[eventId] || []);
            const hasStaffOptions = eventStaffDirectory.length > 0;
            const isUsedTicket = Boolean(t.isUsed);
            const isListedForSale = Boolean(t.forSaleStatus);
            const hasGeneratedPass = Boolean(persistedIssuedPass || pass.status === "ready");
            const isGeneratingPass = pass.status === "pending";
            const selectedStaff = pass.assignedStaff || "";
            const selectedStaffName = eventStaffDirectory.find((s) => s.address === selectedStaff)?.name || "";

            return (
              <section
                key={t.id}
                className="h-full overflow-hidden rounded-xl border-2 border-gray-200 bg-white shadow transition hover:border-indigo-300"
              >
                <TicketCard tokenId={t.id} info={t} isOwned={true} onRefresh={loadMyTickets} />
                <div className="border-t px-4 py-3">
                  {t.seatMapImageUrl ? (
                    <button
                      onClick={() =>
                        setVenueMapModal({
                          title: `${t.eventName || `Event #${Number(t.eventId)}`} - Venue Map`,
                          imageUrl: t.seatMapImageUrl,
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

                <div className="border-t bg-indigo-50/50 p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-indigo-900">Entry Pass</h3>
                    <button
                      onClick={() => createAndSendEntryPass(t)}
                      disabled={
                        isUsedTicket ||
                        isListedForSale ||
                        isGeneratingPass ||
                        hasGeneratedPass ||
                        !hasStaffOptions ||
                        !selectedStaff
                      }
                      className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {hasGeneratedPass ? "Pass Already Generated" : "Generate & Send Pass"}
                    </button>
                  </div>

                  {!isUsedTicket && isListedForSale && (
                    <p className="mb-2 text-xs text-amber-600">
                      Delist this ticket from the secondary market before generating an entry pass.
                    </p>
                  )}
                  {!isUsedTicket && !isListedForSale && !hasStaffOptions && (
                    <p className="mb-2 text-xs text-red-500">
                      No staff has clicked Check In for this event yet.
                    </p>
                  )}
                  {!isUsedTicket && hasGeneratedPass && (
                    <p className="mb-2 text-xs text-gray-500">
                      Entry pass already generated for this ticket. Each wallet can generate only once.
                    </p>
                  )}

                  <div className="mb-3">
                    <p className="mb-1 text-[11px] text-gray-500">Choose Staff</p>
                    <select
                      value={selectedStaff}
                      onChange={(e) => updateAssignedStaff(t.id, e.target.value)}
                      disabled={isUsedTicket || isListedForSale || hasGeneratedPass || !hasStaffOptions}
                      className="w-full rounded border px-2 py-1 text-xs font-mono text-gray-700 disabled:bg-gray-100"
                    >
                      <option value="" disabled>
                        Select staff
                      </option>
                      {eventStaffDirectory.map((staff) => (
                        <option key={staff.address} value={staff.address}>
                          {staff.name} - {staff.address}
                        </option>
                      ))}
                    </select>
                  </div>

                  {isUsedTicket && (
                    <p className="mb-2 text-xs text-gray-500">
                      This ticket is already used. Entry pass actions are disabled.
                    </p>
                  )}

                  {pass?.status === "pending" && (
                    <p className="text-xs text-gray-500">Signing and sending pass...</p>
                  )}

                  {pass?.status === "error" && (
                    <p className="text-xs text-red-500">{pass.error}</p>
                  )}

                  {pass?.status === "ready" && pass.payload && (
                    <div>
                      <p className="text-xs text-green-700">
                        Sent to {pass.assignedStaffName || selectedStaffName}. Expires at{" "}
                        {new Date(pass.payload.expiresAt).toLocaleTimeString()}.
                      </p>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
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
