import { useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import { useContract } from "../hooks/useContract";
import { useWallet } from "../hooks/useWallet";
import {
  fetchNftMetadata,
  uploadEventMetadataToIpfs,
  uploadSeatMapToIpfs,
} from "../utils/ipfs";

function Field({ label, hint, ...inputProps }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {hint && <p className="mb-1 text-xs text-gray-400">{hint}</p>}
      <input
        className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        {...inputProps}
      />
    </div>
  );
}

function TextAreaField({ label, hint, ...textareaProps }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {hint && <p className="mb-1 text-xs text-gray-400">{hint}</p>}
      <textarea
        className="min-h-24 w-full resize-y rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        {...textareaProps}
      />
    </div>
  );
}

function FileInputField({ label, file, inputKey, onFileChange, accept = "image/*" }) {
  const inputRef = useRef(null);

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <input
        key={inputKey}
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(e) => onFileChange(e.target.files?.[0] || null)}
        className="hidden"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
        >
          Choose File
        </button>
        <span className="text-sm text-gray-600">{file?.name || "No file selected"}</span>
      </div>
    </div>
  );
}

function defaultSectionCode(index) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return chars[index] || `S${index + 1}`;
}

function createEmptySection(index = 0) {
  return {
    code: defaultSectionCode(index),
    rows: "",
    seatsPerRow: "",
  };
}

function parsePositiveInt(value) {
  const n = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function buildSeatsFromSections(sectionInputs) {
  const seats = [];
  const sections = [];
  const usedCodes = new Set();
  let id = 0;

  for (let i = 0; i < sectionInputs.length; i++) {
    const rawCode = String(sectionInputs[i]?.code || "").trim().toUpperCase();
    const code = rawCode || defaultSectionCode(i);
    const rows = parsePositiveInt(sectionInputs[i]?.rows);
    const seatsPerRow = parsePositiveInt(sectionInputs[i]?.seatsPerRow);

    if (!code) throw new Error(`Area ${i + 1} code is required.`);
    if (usedCodes.has(code)) throw new Error(`Duplicate area code: ${code}.`);
    if (!rows || !seatsPerRow) {
      throw new Error(`Area ${code} needs valid rows and seats per row.`);
    }

    usedCodes.add(code);
    sections.push({
      code,
      rows,
      seatsPerRow,
      seatCount: rows * seatsPerRow,
    });

    for (let row = 1; row <= rows; row++) {
      for (let seat = 1; seat <= seatsPerRow; seat++) {
        seats.push({
          id,
          section: code,
          row,
          number: seat,
          label: `${code}-${row}-${seat}`,
          location: `Area ${code}, Row ${row}, Seat ${seat}`,
        });
        id++;
      }
    }
  }

  return {
    seats,
    sections,
    totalTickets: seats.length,
  };
}

export default function Admin() {
  const {
    createEvent,
    getNextEventId,
    getEventDetails,
    getOwner,
    isAdmin,
    isCheckInStaff,
    hasBeenAppointed,
    setEventActive,
    setAdmin,
    setCheckInStaff,
    getDeveloperBalance,
    withdrawDeveloperProfits,
    getWithdrawHistory,
  } = useContract();
  const { account, connect } = useWallet();

  const [accessLoading, setAccessLoading] = useState(true);
  const [canUseAdminPanel, setCanUseAdminPanel] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkAccess() {
      if (!account) {
        setAccessLoading(false);
        setCanUseAdminPanel(false);
        setIsOwner(false);
        return;
      }

      setAccessLoading(true);
      try {
        const accountLc = account.toLowerCase();
        const owner = await getOwner();
        const ownerMatch = owner === accountLc;
        let adminMatch = false;

        if (!ownerMatch) {
          try {
            adminMatch = await isAdmin(accountLc);
          } catch {
            adminMatch = false;
          }
        }

        if (!cancelled) {
          setIsOwner(ownerMatch);
          setCanUseAdminPanel(ownerMatch || adminMatch);
        }
      } catch {
        if (!cancelled) {
          setIsOwner(false);
          setCanUseAdminPanel(false);
        }
      } finally {
        if (!cancelled) setAccessLoading(false);
      }
    }

    checkAccess();
    return () => {
      cancelled = true;
    };
  }, [account]);

  const [evForm, setEvForm] = useState({
    name: "",
    date: "",
    venue: "",
    ticketPrice: "",
    maxResalePrice: "",
    maxResaleCount: "0",
    description: "",
  });
  const [seatSections, setSeatSections] = useState([]);
  const [sectionDraft, setSectionDraft] = useState(createEmptySection(0));
  const [ticketImage, setTicketImage] = useState(null);
  const [seatMapImage, setSeatMapImage] = useState(null);
  const [ticketImageInputKey, setTicketImageInputKey] = useState(0);
  const [seatMapImageInputKey, setSeatMapImageInputKey] = useState(0);
  const [ticketImagePreview, setTicketImagePreview] = useState("");
  const [seatMapImagePreview, setSeatMapImagePreview] = useState("");
  const [evMsg, setEvMsg] = useState("");
  const [evLoading, setEvLoad] = useState(false);

  const [adminWallet, setAdminWallet] = useState("");
  const [checkInWallet, setCheckInWallet] = useState("");
  const [roleLoading, setRoleLoading] = useState(false);
  const [roleMsg, setRoleMsg] = useState("");
  const [managedEvents, setManagedEvents] = useState([]);
  const [managedEventsLoading, setManagedEventsLoading] = useState(false);
  const [deleteEventId, setDeleteEventId] = useState("");
  const [confirmDeleteEventId, setConfirmDeleteEventId] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState("");

  const [profitBalance, setProfitBalance] = useState(null);
  const [profitLoading, setProfitLoading] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawMsg, setWithdrawMsg] = useState("");
  const [withdrawHistory, setWithdrawHistory] = useState([]);

  const estimatedTotalTickets = useMemo(
    () =>
      seatSections.reduce(
        (sum, s) => sum + parsePositiveInt(s.rows) * parsePositiveInt(s.seatsPerRow),
        0
      ),
    [seatSections]
  );

  useEffect(() => {
    if (!ticketImage) {
      setTicketImagePreview("");
      return;
    }

    const previewUrl = URL.createObjectURL(ticketImage);
    setTicketImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [ticketImage]);

  useEffect(() => {
    if (!seatMapImage) {
      setSeatMapImagePreview("");
      return;
    }

    const previewUrl = URL.createObjectURL(seatMapImage);
    setSeatMapImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [seatMapImage]);

  useEffect(() => {
    if (!canUseAdminPanel) {
      setManagedEvents([]);
      setDeleteEventId("");
      setConfirmDeleteEventId(null);
      return;
    }
    loadManagedEvents();
  }, [canUseAdminPanel, account]);

  useEffect(() => {
    if (!isOwner) return;
    loadProfitData();
  }, [isOwner]);

  async function loadManagedEvents() {
    if (!canUseAdminPanel) return;

    setManagedEventsLoading(true);
    try {
      const totalEvents = await getNextEventId();
      const rows = [];

      for (let i = 0; i < totalEvents; i++) {
        const event = await getEventDetails(i);
        if (!event?.isActive) continue;

        let metadata = null;
        try {
          metadata = await fetchNftMetadata(event.metadataURI);
        } catch {
          metadata = null;
        }

        rows.push({
          id: i,
          name: metadata?.name || `Event ${i + 1}`,
          date: metadata?.date || "",
          venue: metadata?.venue || "",
        });
      }

      setManagedEvents(rows);
      if (rows.length === 0) {
        setDeleteEventId("");
        setConfirmDeleteEventId(null);
        return;
      }

      const normalizedSelectedId =
        deleteEventId === "" || deleteEventId === null || deleteEventId === undefined
          ? null
          : Number(deleteEventId);
      const hasSelected =
        normalizedSelectedId !== null &&
        Number.isFinite(normalizedSelectedId) &&
        rows.some((event) => Number(event.id) === normalizedSelectedId);
      if (!hasSelected) {
        setDeleteEventId(String(rows[0].id));
        setConfirmDeleteEventId(null);
      }
    } catch (err) {
      setDeleteMsg("Error: " + (err?.reason || err?.message || "Failed to load events."));
    } finally {
      setManagedEventsLoading(false);
    }
  }

  async function loadProfitData() {
    setProfitLoading(true);
    setWithdrawMsg("");
    try {
      const [bal, history] = await Promise.all([
        getDeveloperBalance(),
        getWithdrawHistory(),
      ]);
      setProfitBalance(bal);
      setWithdrawHistory(history.slice().reverse());
    } catch (err) {
      setWithdrawMsg("Error: " + (err?.reason || err?.message || "Failed to load balance."));
    } finally {
      setProfitLoading(false);
    }
  }

  async function handleWithdraw() {
    setWithdrawLoading(true);
    setWithdrawMsg("");
    try {
      await withdrawDeveloperProfits();
      setWithdrawMsg("Withdrawn successfully.");
      await loadProfitData();
    } catch (err) {
      setWithdrawMsg("Error: " + (err?.reason || err?.message || "Withdrawal failed."));
    } finally {
      setWithdrawLoading(false);
    }
  }

  function requestDeleteEvent() {
    if (deleteEventId === "" || deleteEventId === null || deleteEventId === undefined) {
      setDeleteMsg("Error: Please select an event to delete.");
      return;
    }
    setDeleteMsg("");
    setConfirmDeleteEventId(Number(deleteEventId));
  }

  function cancelDeleteEvent() {
    setConfirmDeleteEventId(null);
    setDeleteMsg("");
  }

  async function confirmDeleteEvent() {
    const targetEventId = Number(deleteEventId);
    if (!Number.isFinite(targetEventId)) {
      setDeleteMsg("Error: Invalid event selection.");
      return;
    }
    if (confirmDeleteEventId !== targetEventId) {
      setDeleteMsg("Error: Please click Delete Event first, then confirm.");
      return;
    }

    setDeleteLoading(true);
    setDeleteMsg("");
    try {
      await setEventActive(targetEventId, false);
      setDeleteMsg("Event deleted successfully. Related cards are now hidden across the DApp.");
      setConfirmDeleteEventId(null);
      await loadManagedEvents();
    } catch (err) {
      const raw = err?.reason || err?.message || "Delete event failed.";
      const text = String(raw);
      if (
        text.includes("require(false)") ||
        text.includes("missing revert data") ||
        text.includes("CALL_EXCEPTION")
      ) {
        setDeleteMsg(
          "Error: Delete transaction reverted. Your deployed contract likely does not include setEventActive yet, or wallet/network/address is mismatched."
        );
      } else {
        setDeleteMsg("Error: " + raw);
      }
    } finally {
      setDeleteLoading(false);
    }
  }

  function addSection() {
    const code = String(sectionDraft.code || "").trim().toUpperCase();
    const rows = parsePositiveInt(sectionDraft.rows);
    const seatsPerRow = parsePositiveInt(sectionDraft.seatsPerRow);

    if (!code) {
      setEvMsg("Error: Area code is required.");
      return;
    }
    if (!rows || !seatsPerRow) {
      setEvMsg("Error: Please enter valid rows and seats per row.");
      return;
    }
    if (seatSections.some((s) => String(s.code || "").toUpperCase() === code)) {
      setEvMsg(`Error: Duplicate area code ${code}.`);
      return;
    }

    setEvMsg("");
    setSeatSections((prev) => [...prev, { code, rows: String(rows), seatsPerRow: String(seatsPerRow) }]);
    setSectionDraft(createEmptySection(seatSections.length + 1));
  }

  function removeSection(index) {
    setSeatSections((prev) => prev.filter((_, i) => i !== index));
  }

  function updateSectionDraft(key, value) {
    setSectionDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCreateEvent(e) {
    e.preventDefault();
    setEvLoad(true);
    setEvMsg("");

    try {
      if (!ticketImage) {
        throw new Error("Event image is required.");
      }

      const { seats, sections, totalTickets } = buildSeatsFromSections(seatSections);
      if (!totalTickets) {
        throw new Error("Please configure at least one valid area with seats.");
      }

      setEvMsg("Uploading event metadata to IPFS...");
      const { metadataURI } = await uploadEventMetadataToIpfs({
        imageFile: ticketImage,
        eventName: evForm.name,
        eventDate: evForm.date,
        eventDescription: evForm.description,
        venueName: evForm.venue,
      });

      setEvMsg("Uploading seat map to IPFS...");
      const { seatMapURI } = await uploadSeatMapToIpfs({
        eventName: evForm.name,
        sections,
        seats,
        seatMapImageFile: seatMapImage,
      });

      setEvMsg("IPFS upload complete. Please confirm blockchain transaction...");
      await createEvent(
        totalTickets,
        parseFloat(evForm.ticketPrice),
        parseFloat(evForm.maxResalePrice),
        parseInt(evForm.maxResaleCount, 10),
        metadataURI,
        seatMapURI
      );

      setEvMsg("Event created successfully.");
      setEvForm({
        name: "",
        date: "",
        venue: "",
        ticketPrice: "",
        maxResalePrice: "",
        maxResaleCount: "0",
        description: "",
      });
      setSeatSections([]);
      setSectionDraft(createEmptySection(0));
      setTicketImage(null);
      setSeatMapImage(null);
      setTicketImageInputKey((key) => key + 1);
      setSeatMapImageInputKey((key) => key + 1);
      await loadManagedEvents();
    } catch (err) {
      setEvMsg("Error: " + (err.reason || err.message || "Unknown error"));
    } finally {
      setEvLoad(false);
    }
  }

  async function updateRole(type, enabled) {
    const rawAddress = type === "admin" ? adminWallet : checkInWallet;
    const address = rawAddress.trim();
    const addressLc = address.toLowerCase();

    if (!ethers.isAddress(address)) {
      setRoleMsg("Error: Invalid wallet address.");
      return;
    }

    setRoleLoading(true);
    setRoleMsg("");
    try {
      if (enabled) {
        const owner = await getOwner();
        if (addressLc === owner) {
          setRoleMsg("Error: This wallet is already the super owner.");
          return;
        }

        const appointed = await hasBeenAppointed(addressLc);
        if (appointed) {
          setRoleMsg(
            "Error: This wallet has already been appointed before. One wallet can only be appointed once."
          );
          return;
        }

        const [adminRole, checkInRole] = await Promise.all([
          isAdmin(addressLc),
          isCheckInStaff(addressLc),
        ]);

        if (type === "admin") {
          if (adminRole) {
            setRoleMsg("Error: This wallet is already an administrator.");
            return;
          }
          if (checkInRole) {
            setRoleMsg("Error: This wallet is already check in staff. Revoke that role first.");
            return;
          }
        } else {
          if (checkInRole) {
            setRoleMsg("Error: This wallet is already check in staff.");
            return;
          }
          if (adminRole) {
            setRoleMsg(
              "Error: This wallet is already an administrator. One wallet can only be appointed once."
            );
            return;
          }
        }
      }

      if (type === "admin") {
        await setAdmin(address, enabled);
      } else {
        await setCheckInStaff(address, enabled);
      }
      setRoleMsg(
        `${type === "admin" ? "Administrator" : "Check In Staff"} role ${
          enabled ? "granted" : "revoked"
        } for ${address}.`
      );
    } catch (err) {
      const raw = err?.reason || err?.message || "Role update failed";
      const text = String(raw);
      if (
        text.includes("require(false)") ||
        text.includes("missing revert data") ||
        text.includes("CALL_EXCEPTION")
      ) {
        setRoleMsg(
          "Error: Transaction reverted. Usually this means contract address/ABI/network is mismatched, or current wallet is not super owner."
        );
      } else {
        setRoleMsg("Error: " + raw);
      }
    } finally {
      setRoleLoading(false);
    }
  }

  if (!account) {
    return (
      <div className="py-16 text-center">
        <p className="mb-4 text-lg text-gray-500">
          Connect your wallet to access the administrator panel.
        </p>
        <button
          onClick={connect}
          className="rounded bg-indigo-600 px-6 py-2 text-white transition hover:bg-indigo-700"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  if (accessLoading) {
    return (
      <div className="py-16 text-center text-gray-400">
        <p>Checking administrator access...</p>
      </div>
    );
  }

  if (!canUseAdminPanel) {
    return (
      <div className="py-16 text-center">
        <p className="mb-2 text-lg font-semibold text-red-500">Access Denied</p>
        <p className="text-sm text-gray-500">
          Only wallets with administrator role can use this panel.
          <br />
          Connected: <span className="font-mono">{account}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold">Administrator Panel</h1>
      </div>

      <section className="rounded-xl border bg-white p-6 shadow">
        <h2 className="mb-1 text-xl font-semibold">Create Event</h2>
        <form onSubmit={handleCreateEvent} className="space-y-4">
          <Field
            label="Event Name"
            placeholder="e.g. Summer Concert 2026"
            required
            value={evForm.name}
            onChange={(e) => setEvForm((p) => ({ ...p, name: e.target.value }))}
          />
          <FileInputField
            label="Event Image"
            file={ticketImage}
            inputKey={ticketImageInputKey}
            onFileChange={setTicketImage}
          />
          {ticketImagePreview && (
            <img
              src={ticketImagePreview}
              alt="Event preview"
              className="mt-3 h-36 w-full rounded-lg border object-cover"
            />
          )}
          <Field
            label="Date"
            placeholder="e.g. 2026-08-15"
            required
            value={evForm.date}
            onChange={(e) => setEvForm((p) => ({ ...p, date: e.target.value }))}
          />
          <Field
            label="Venue"
            placeholder="e.g. Bristol Arena"
            required
            value={evForm.venue}
            onChange={(e) => setEvForm((p) => ({ ...p, venue: e.target.value }))}
          />
          <TextAreaField
            label="Description (optional)"
            placeholder="e.g. VIP entry, venue notes."
            value={evForm.description}
            onChange={(e) => setEvForm((p) => ({ ...p, description: e.target.value }))}
          />

          <div className="rounded-lg border bg-gray-50 p-4">
            <div className="mb-3">
              <div>
                <p className="text-sm text-gray-800">Seat Areas</p>
              </div>
            </div>

            <div className="rounded-lg border bg-white p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-500">Section</p>
                  <input
                    placeholder="A"
                    value={sectionDraft.code}
                    onChange={(e) => updateSectionDraft("code", e.target.value.toUpperCase())}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-500">Rows</p>
                  <input
                    type="number"
                    min="1"
                    value={sectionDraft.rows}
                    onChange={(e) => updateSectionDraft("rows", e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-500">Seats</p>
                  <input
                    type="number"
                    min="1"
                    value={sectionDraft.seatsPerRow}
                    onChange={(e) => updateSectionDraft("seatsPerRow", e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <button
                  type="button"
                  onClick={addSection}
                  className="h-10 rounded bg-indigo-600 px-4 text-sm font-medium text-white transition hover:bg-indigo-700"
                >
                  Add Area
                </button>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {seatSections.length === 0 ? (
                <p className="rounded-lg border border-dashed bg-white px-3 py-2 text-xs text-gray-400">
                  No area added yet.
                </p>
              ) : (
                seatSections.map((section, idx) => (
                  <div
                    key={`area-${idx}`}
                    className="flex flex-wrap items-center gap-2 rounded-lg border bg-white px-3 py-2"
                  >
                    <p className="text-sm font-semibold text-gray-800">Section: {section.code}</p>
                    <p className="text-sm text-gray-600">Rows: {section.rows}</p>
                    <p className="text-sm text-gray-600">Seats: {section.seatsPerRow}</p>
                    <button
                      type="button"
                      onClick={() => removeSection(idx)}
                      className="ml-auto rounded border px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>

            <p className="mt-3 text-xs font-medium text-gray-600">
              Total Tickets (Auto): {estimatedTotalTickets}
            </p>
          </div>

          <FileInputField
            label="Seat Map Overview Image"
            file={seatMapImage}
            inputKey={seatMapImageInputKey}
            onFileChange={setSeatMapImage}
          />
          {seatMapImagePreview && (
            <img
              src={seatMapImagePreview}
              alt="Seat map preview"
              className="mt-3 h-36 w-full rounded-lg border object-cover"
            />
          )}

          <Field
            label="Ticket Price (ETH)"
            type="number"
            step="0.001"
            min="0"
            required
            value={evForm.ticketPrice}
            onChange={(e) => setEvForm((p) => ({ ...p, ticketPrice: e.target.value }))}
          />
          <Field
            label="Max Resale Price (ETH)"
            type="number"
            step="0.001"
            min="0"
            required
            value={evForm.maxResalePrice}
            onChange={(e) => setEvForm((p) => ({ ...p, maxResalePrice: e.target.value }))}
          />
          <Field
            label="Max Resale Count"
            hint="0 = unlimited."
            type="number"
            min="0"
            value={evForm.maxResaleCount}
            onChange={(e) => setEvForm((p) => ({ ...p, maxResaleCount: e.target.value }))}
          />
          <button
            type="submit"
            disabled={evLoading}
            className="rounded bg-indigo-600 px-5 py-2 font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {evLoading ? "Creating..." : "Create Event"}
          </button>
          {evMsg && (
            <p className={`text-sm ${evMsg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>
              {evMsg}
            </p>
          )}
        </form>
      </section>

      <section className="rounded-xl border bg-white p-6 shadow">
        <h2 className="mb-1 text-xl font-semibold">Delete Event</h2>

        {managedEventsLoading ? (
          <p className="text-sm text-gray-500">Loading current events...</p>
        ) : managedEvents.length === 0 ? (
          <p className="text-sm text-gray-500">No active events available.</p>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Select Event
              </label>
              <select
                value={deleteEventId}
                onChange={(e) => {
                  setDeleteEventId(e.target.value);
                  setConfirmDeleteEventId(null);
                  setDeleteMsg("");
                }}
                className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                {managedEvents.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                    {event.date ? ` (${event.date})` : ""}
                    {event.venue ? ` - ${event.venue}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={requestDeleteEvent}
                disabled={deleteLoading}
                className="rounded bg-red-600 px-3 py-1.5 text-sm text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                Delete Event
              </button>
              <button
                type="button"
                onClick={loadManagedEvents}
                disabled={deleteLoading || managedEventsLoading}
                className="rounded bg-gray-200 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-300 disabled:opacity-50"
              >
                Refresh List
              </button>
            </div>

            {confirmDeleteEventId !== null && Number(deleteEventId) === confirmDeleteEventId && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-700">
                  Confirm deletion: this event will be hidden in Events, Secondary Market, and My
                  Tickets.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={confirmDeleteEvent}
                    disabled={deleteLoading}
                    className="rounded bg-red-600 px-3 py-1.5 text-sm text-white transition hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleteLoading ? "Deleting..." : "Confirm Delete"}
                  </button>
                  <button
                    type="button"
                    onClick={cancelDeleteEvent}
                    disabled={deleteLoading}
                    className="rounded bg-gray-200 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-300 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {deleteMsg && (
              <p className={`text-sm ${deleteMsg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>
                {deleteMsg}
              </p>
            )}
          </div>
        )}
      </section>

      {isOwner && (
        <>
        <section className="rounded-xl border bg-white p-6 shadow">
          <h2 className="mb-1 text-xl font-semibold">Role Management</h2>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Administrator Wallet
              </label>
              <input
                value={adminWallet}
                onChange={(e) => setAdminWallet(e.target.value)}
                placeholder="0x..."
                className="w-full rounded border px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => updateRole("admin", true)}
                  disabled={roleLoading}
                  className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Grant Administrator
                </button>
                <button
                  onClick={() => updateRole("admin", false)}
                  disabled={roleLoading}
                  className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Revoke Administrator
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Check In Staff Wallet
              </label>
              <input
                value={checkInWallet}
                onChange={(e) => setCheckInWallet(e.target.value)}
                placeholder="0x..."
                className="w-full rounded border px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => updateRole("checkin", true)}
                  disabled={roleLoading}
                  className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Grant Check In
                </button>
                <button
                  onClick={() => updateRole("checkin", false)}
                  disabled={roleLoading}
                  className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Revoke Check In
                </button>
              </div>
            </div>

            {roleMsg && (
              <p className={`text-sm ${roleMsg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>
                {roleMsg}
              </p>
            )}
          </div>
        </section>

        <section className="rounded-xl border bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-semibold">Developer Profits</h2>

          <div className="mb-4">
            <p className="mb-1 text-sm font-medium text-gray-700">Accumulated balance</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 rounded-lg border bg-gray-50 px-4 py-3">
                <span className="text-2xl font-bold text-indigo-700">
                  {profitLoading
                    ? "..."
                    : profitBalance === null
                      ? "—"
                      : `${ethers.formatEther(profitBalance)} ETH`}
                </span>
              </div>
              <button
                onClick={loadProfitData}
                disabled={profitLoading}
                className="rounded border px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                title="Refresh balance"
              >
                ↻
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Sends entire balance to your connected wallet. Cannot be undone.
            </p>
          </div>

          <button
            onClick={handleWithdraw}
            disabled={
              profitLoading ||
              withdrawLoading ||
              profitBalance === null ||
              profitBalance === 0n
            }
            className="rounded bg-indigo-600 px-5 py-2 font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {withdrawLoading ? "Withdrawing..." : "Withdraw to My Wallet"}
          </button>

          {withdrawMsg && (
            <p className={`mt-2 text-sm ${withdrawMsg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>
              {withdrawMsg}
            </p>
          )}

          {withdrawHistory.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">Withdraw History</h3>
              <div className="space-y-2">
                {withdrawHistory.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border bg-gray-50 px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-indigo-700">
                      {ethers.formatEther(item.amount)} ETH
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(item.timestamp * 1000).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
        </>
      )}
    </div>
  );
}
