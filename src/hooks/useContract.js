import { ethers } from "ethers";
import { useWallet } from "./useWallet";
import { CONTRACT_ADDRESS, TARGET_CHAIN_ID, LOCAL_CHAIN_ID, DEPLOY_BLOCK } from "../contract/config";

const CONTRACT_ABI = [
  "function owner() view returns (address)",
  "function developerBalance() view returns (uint256)",
  "function protocolFeePercent() view returns (uint256)",
  "function isAdmin(address account) view returns (bool)",
  "function isCheckInStaff(address account) view returns (bool)",
  "function hasBeenAppointed(address account) view returns (bool)",
  "function isSeatTaken(uint256 eventId, uint256 seatId) view returns (bool)",
  "function nextEventId() view returns (uint256)",
  "function nextTokenId() view returns (uint256)",
  "function getEventDetails(uint256 eventId) view returns (address organizer,uint256 totalTickets,uint256 ticketsMinted,uint256 ticketPrice,uint256 maxResalePrice,uint256 maxResaleCount,bool isActive,string metadataURI,string seatMapURI)",
  "function getTicketInfo(uint256 tokenId) view returns (address currentOwner,uint256 eventId,uint256 seatId,uint256 maxAllowedPrice,uint256 currentPrice,bool forSaleStatus,bool isUsed,uint256 totalResales,uint256 maxResales,string metadataURI)",
  "function createEvent(uint256 totalTickets,uint256 ticketPrice,uint256 maxResalePrice,uint256 maxResaleCount,string metadataURI,string seatMapURI) returns (uint256)",
  "function setEventActive(uint256 eventId,bool active)",
  "function setAdmin(address account,bool enabled)",
  "function setCheckInStaff(address account,bool enabled)",
  "function buyFromEvent(uint256 eventId,uint256 seatId) payable",
  "function buyTicket(uint256 tokenId) payable",
  "function setTicketPrice(uint256 tokenId,uint256 newPrice,bool forSale)",
  "function checkIn(uint256 tokenId)",
  "function withdrawDeveloperProfits()",
  "event DeveloperProfitsWithdrawn(uint256 amount)",
  "event CheckInStaffRoleUpdated(address indexed account, bool enabled)",
];

const RPC_URL =
  TARGET_CHAIN_ID === LOCAL_CHAIN_ID
    ? "http://127.0.0.1:8545"
    : "https://eth-sepolia.g.alchemy.com/v2/jpRt3t_qe7WGiL-6dxz7M";

function getReadContract() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
}

export function useContract() {
  const { provider } = useWallet();

  async function getWriteContract() {
    if (!provider) throw new Error("Connect your wallet first.");
    const signer = await provider.getSigner();
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  }

  async function getOwner() {
    const c = getReadContract();
    return (await c.owner()).toLowerCase();
  }

  async function isAdmin(account) {
    const c = getReadContract();
    return Boolean(await c.isAdmin(account));
  }

  async function isCheckInStaff(account) {
    const c = getReadContract();
    return Boolean(await c.isCheckInStaff(account));
  }

  async function hasBeenAppointed(account) {
    const c = getReadContract();
    return Boolean(await c.hasBeenAppointed(account));
  }

  async function isSeatTaken(eventId, seatId) {
    const c = getReadContract();
    return Boolean(await c.isSeatTaken(eventId, seatId));
  }

  async function getNextEventId() {
    const c = getReadContract();
    return Number(await c.nextEventId());
  }

  async function getNextTokenId() {
    const c = getReadContract();
    return Number(await c.nextTokenId());
  }

  async function getEventDetails(eventId) {
    const c = getReadContract();
    const r = await c.getEventDetails(eventId);
    return {
      organizer: r[0],
      totalTickets: r[1],
      ticketsMinted: r[2],
      ticketPrice: r[3],
      maxResalePrice: r[4],
      maxResaleCount: r[5],
      isActive: r[6],
      metadataURI: r[7],
      seatMapURI: r[8],
    };
  }

  async function getTicketInfo(tokenId) {
    const c = getReadContract();
    const r = await c.getTicketInfo(tokenId);
    return {
      currentOwner: r[0],
      eventId: r[1],
      seatId: r[2],
      maxAllowedPrice: r[3],
      currentPrice: r[4],
      forSaleStatus: r[5],
      isUsed: r[6],
      totalResales: r[7],
      maxResales: r[8],
      metadataURI: r[9],
    };
  }

  async function createEvent(
    totalTickets,
    ticketPriceEth,
    maxResalePriceEth,
    maxResaleCount,
    metadataURI,
    seatMapURI
  ) {
    const c = await getWriteContract();
    const tx = await c.createEvent(
      totalTickets,
      ethers.parseEther(String(ticketPriceEth)),
      ethers.parseEther(String(maxResalePriceEth)),
      maxResaleCount,
      metadataURI,
      seatMapURI
    );
    return tx.wait();
  }

  async function setAdmin(account, enabled) {
    const c = await getWriteContract();
    const tx = await c.setAdmin(account, enabled);
    return tx.wait();
  }

  async function setEventActive(eventId, active) {
    const c = await getWriteContract();
    const tx = await c.setEventActive(eventId, active);
    return tx.wait();
  }

  async function setCheckInStaff(account, enabled) {
    const c = await getWriteContract();
    const tx = await c.setCheckInStaff(account, enabled);
    return tx.wait();
  }

  async function buyFromEvent(eventId, seatId, priceWei) {
    const c = await getWriteContract();
    const tx = await c.buyFromEvent(eventId, seatId, { value: priceWei });
    return tx.wait();
  }

  async function buyTicket(tokenId, priceWei) {
    const c = await getWriteContract();
    const tx = await c.buyTicket(tokenId, { value: priceWei });
    return tx.wait();
  }

  async function setTicketPrice(tokenId, priceEth, forSale) {
    const c = await getWriteContract();
    const tx = await c.setTicketPrice(tokenId, ethers.parseEther(String(priceEth)), forSale);
    return tx.wait();
  }

  async function checkIn(tokenId) {
    const c = await getWriteContract();
    const tx = await c.checkIn(tokenId);
    return tx.wait();
  }

  async function getDeveloperBalance() {
    const c = getReadContract();
    return c.developerBalance();
  }

  async function withdrawDeveloperProfits() {
    const c = await getWriteContract();
    const tx = await c.withdrawDeveloperProfits();
    return tx.wait();
  }

  // Query blockchain events to get all currently-active check-in staff addresses.
  // Uses MetaMask provider to avoid Alchemy free-tier eth_getLogs block-range limit.
  // Works across devices because it reads from the chain, not localStorage.
  async function getCheckInStaffAddresses() {
    try {
      const walletProvider = window.ethereum
        ? new ethers.BrowserProvider(window.ethereum)
        : new ethers.JsonRpcProvider(RPC_URL);
      const c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, walletProvider);
      const filter = c.filters.CheckInStaffRoleUpdated();
      const logs = await c.queryFilter(filter, DEPLOY_BLOCK, "latest");

      // Build a map of address → latest enabled status
      const statusMap = new Map();
      for (const log of logs) {
        const addr = log.args[0].toLowerCase();
        const enabled = Boolean(log.args[1]);
        statusMap.set(addr, enabled);
      }

      // Keep only addresses whose latest event was enable=true
      const candidates = [...statusMap.entries()]
        .filter(([, enabled]) => enabled)
        .map(([addr]) => addr);

      // Double-check current on-chain role (in case role was revoked without an event)
      const readC = getReadContract();
      const results = await Promise.all(
        candidates.map(async (addr) => {
          try {
            const still = await readC.isCheckInStaff(addr);
            return still ? addr : null;
          } catch {
            return null;
          }
        })
      );

      return results.filter(Boolean);
    } catch (err) {
      console.warn("getCheckInStaffAddresses failed:", err.message);
      return [];
    }
  }

  async function getWithdrawHistory() {
    try {
      // Use MetaMask's own provider (window.ethereum) for log queries to avoid
      // Alchemy free-tier 10-block range restriction on eth_getLogs.
      const walletProvider = window.ethereum
        ? new ethers.BrowserProvider(window.ethereum)
        : new ethers.JsonRpcProvider(RPC_URL);
      const c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, walletProvider);
      const filter = c.filters.DeveloperProfitsWithdrawn();
      const logs = await c.queryFilter(filter, DEPLOY_BLOCK, "latest");
      return Promise.all(
        logs.map(async (log) => {
          const block = await log.getBlock();
          return {
            amount: log.args[0],
            timestamp: Number(block.timestamp),
            txHash: log.transactionHash,
          };
        })
      );
    } catch (err) {
      console.warn("getWithdrawHistory failed, returning empty:", err.message);
      return [];
    }
  }

  return {
    getOwner,
    isAdmin,
    isCheckInStaff,
    hasBeenAppointed,
    isSeatTaken,
    getNextEventId,
    getNextTokenId,
    getEventDetails,
    getTicketInfo,
    createEvent,
    setEventActive,
    setAdmin,
    setCheckInStaff,
    buyFromEvent,
    buyTicket,
    setTicketPrice,
    checkIn,
    getDeveloperBalance,
    withdrawDeveloperProfits,
    getWithdrawHistory,
    getCheckInStaffAddresses,
  };
}
