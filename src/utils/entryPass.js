import { CONTRACT_ADDRESS } from "../contract/config";

export function buildEntryPassMessage({
  tokenId,
  eventId,
  seatId,
  holder,
  issuedAt,
  expiresAt,
}) {
  return [
    "NFTicket Entry Pass",
    `contract:${CONTRACT_ADDRESS.toLowerCase()}`,
    `tokenId:${Number(tokenId)}`,
    `eventId:${Number(eventId)}`,
    `seatId:${Number(seatId)}`,
    `holder:${String(holder).toLowerCase()}`,
    `issuedAt:${Number(issuedAt)}`,
    `expiresAt:${Number(expiresAt)}`,
  ].join("\n");
}

export function normalizeEntryPassPayload(payload) {
  return {
    tokenId: Number(payload.tokenId),
    eventId: Number(payload.eventId),
    seatId: Number(payload.seatId),
    holder: String(payload.holder).toLowerCase(),
    issuedAt: Number(payload.issuedAt),
    expiresAt: Number(payload.expiresAt),
    signature: String(payload.signature || ""),
  };
}
