import { PINATA_JWT } from "../contract/config";

const PINATA_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const PINATA_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

function toIpfsUri(hash) {
  return `ipfs://${hash}`;
}

export function resolveIpfsUri(uri) {
  if (!uri) return "";
  if (!uri.startsWith("ipfs://")) return uri;
  const path = uri.replace("ipfs://", "").replace(/^ipfs\//, "");
  return `https://gateway.pinata.cloud/ipfs/${path}`;
}

export function normalizeIpfsRef(ref) {
  if (!ref) return "";
  if (ref.startsWith("ipfs://")) return ref;
  if (ref.startsWith("http://") || ref.startsWith("https://")) return ref;
  return `ipfs://${String(ref).trim()}`;
}

export function extractIpfsCid(ref) {
  if (!ref) return "";
  const trimmed = String(ref).trim();
  if (trimmed.startsWith("ipfs://")) {
    return trimmed.replace("ipfs://", "").replace(/^ipfs\//, "");
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      const parts = url.pathname.split("/").filter(Boolean);
      const ipfsIndex = parts.findIndex((p) => p === "ipfs");
      if (ipfsIndex >= 0 && parts[ipfsIndex + 1]) return parts[ipfsIndex + 1];
      return parts[parts.length - 1] || "";
    } catch {
      return "";
    }
  }
  return trimmed;
}

async function parsePinataResponse(response, fallbackMessage) {
  if (!response.ok) {
    let details = "";
    try {
      const data = await response.json();
      details = data?.error?.details || data?.error || data?.message || "";
    } catch {
      details = await response.text();
    }
    throw new Error(details || fallbackMessage);
  }
  return response.json();
}

export async function fetchJsonFromIpfs(uri) {
  const normalized = normalizeIpfsRef(uri);
  if (!normalized) return null;
  const response = await fetch(resolveIpfsUri(normalized));
  if (!response.ok) {
    throw new Error("Failed to load JSON from IPFS.");
  }
  return response.json();
}

export async function fetchNftMetadata(metadataURI) {
  if (!metadataURI) return null;
  const metadata = await fetchJsonFromIpfs(metadataURI);
  return {
    ...metadata,
    imageUrl: resolveIpfsUri(metadata?.image),
  };
}

export async function fetchSeatMap(seatMapURI) {
  if (!seatMapURI) return { seats: [] };
  const data = await fetchJsonFromIpfs(seatMapURI);
  const seats = Array.isArray(data?.seats) ? data.seats : [];
  const sections = Array.isArray(data?.sections) ? data.sections : [];
  return {
    ...data,
    imageUrl: resolveIpfsUri(data?.image),
    sections: sections.map((sec, idx) => ({
      code: String(sec?.code || sec?.sectionCode || `S${idx + 1}`),
      rows: Number(sec?.rows || 0),
      seatsPerRow: Number(sec?.seatsPerRow || 0),
      seatCount: Number(sec?.seatCount || 0),
    })),
    seats: seats.map((s, idx) => ({
      id: Number(s.id ?? idx),
      label: s.label || `Seat ${idx + 1}`,
      section: String(s.section || ""),
      row: Number(s.row || 0),
      number: Number(s.number || 0),
      location: s.location || "",
    })),
  };
}

async function uploadFileToIpfs(file, name) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("pinataMetadata", JSON.stringify({ name }));

  const response = await fetch(PINATA_FILE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${PINATA_JWT}` },
    body: formData,
  });

  const data = await parsePinataResponse(response, "Failed to upload file to IPFS.");
  return toIpfsUri(data.IpfsHash);
}

export async function uploadJsonToIpfs(content, name = "nfticket-json") {
  const response = await fetch(PINATA_JSON_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pinataMetadata: { name },
      pinataContent: content,
    }),
  });

  const data = await parsePinataResponse(response, "Failed to upload JSON to IPFS.");
  return toIpfsUri(data.IpfsHash);
}

export async function uploadEntryPassToIpfs(payload, name = "nfticket-entry-pass") {
  const passPayload = {
    version: "entry-pass-v1",
    createdAt: Date.now(),
    payload,
  };
  const passURI = await uploadJsonToIpfs(passPayload, name);
  return {
    passURI,
    passCID: extractIpfsCid(passURI),
  };
}

export async function fetchEntryPassFromIpfs(ref) {
  const data = await fetchJsonFromIpfs(ref);
  if (data?.version === "entry-pass-v1" && data?.payload) {
    return data.payload;
  }
  return data;
}

export async function uploadEventMetadataToIpfs({
  imageFile,
  eventName,
  eventDate,
  eventDescription = "",
  venueName = "",
}) {
  if (!imageFile) {
    throw new Error("Please choose an event image.");
  }

  const imageURI = await uploadFileToIpfs(imageFile, `${eventName || "event"}-image`);

  const metadata = {
    name: eventName,
    date: eventDate,
    venue: venueName,
    description: eventDescription.trim(),
    image: imageURI,
    attributes: [
      { trait_type: "Event", value: eventName || "" },
      { trait_type: "Date", value: eventDate || "" },
      { trait_type: "Venue", value: venueName || "" },
    ],
  };

  const metadataURI = await uploadJsonToIpfs(metadata, `${eventName || "event"}-metadata`);
  return { imageURI, metadataURI };
}

export async function uploadSeatMapToIpfs({
  eventName,
  sections,
  seats,
  seatMapImageFile = null,
}) {
  let seatMapImageURI = "";
  if (seatMapImageFile) {
    seatMapImageURI = await uploadFileToIpfs(
      seatMapImageFile,
      `${eventName || "event"}-seatmap-image`
    );
  }

  const payload = {
    event: eventName || "",
    image: seatMapImageURI,
    sections: Array.isArray(sections) ? sections : [],
    seats: Array.isArray(seats) ? seats : [],
  };

  const seatMapURI = await uploadJsonToIpfs(payload, `${eventName || "event"}-seats`);
  return { seatMapURI, seatMapImageURI };
}

// Backward-compatible wrapper for old imports
export async function uploadTicketMetadataToIpfs({
  imageFile,
  eventName,
  eventDate,
  eventDescription = "",
}) {
  return uploadEventMetadataToIpfs({
    imageFile,
    eventName,
    eventDate,
    eventDescription,
  });
}
