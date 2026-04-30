/**
 * config.js — Contract address and network configuration.
 *
 * ⚠️  After deploying the contract, update CONTRACT_ADDRESS with the
 *     address printed by: npx hardhat run scripts/deploy.js --network sepolia
 *
 * Chain IDs:
 *   Sepolia testnet = 11155111
 *   Hardhat local   = 31337
 */

export const CONTRACT_ADDRESS = "0x544F68a88EF1291a2f3343253F743F4b36FAeb5d";

// Block number when the contract was deployed on Sepolia.
// Used as fromBlock for event log queries to avoid scanning the entire chain.
export const DEPLOY_BLOCK = 10756400;

export const SEPOLIA_CHAIN_ID = 11155111;
export const LOCAL_CHAIN_ID   = 31337;

// Use LOCAL_CHAIN_ID during local development, SEPOLIA_CHAIN_ID for testnet
export const TARGET_CHAIN_ID = SEPOLIA_CHAIN_ID;

// Optional role allowlists used by the frontend for quick role routing.
// Final authorization is still enforced on-chain by contract role checks.
// Recommended:
// - Keep 1 super admin (contract owner)
// - Add 1-3 admin operation wallets
// - Add multiple check-in staff wallets for gate devices
export const ADMIN_WALLETS = ["0xffB52B512CB7eE480104F1316ab25b477b0A2a4B"];
export const CHECKIN_STAFF_WALLETS = [];

// Pinata IPFS upload configuration.
// WARNING: this JWT is visible to anyone who opens the frontend bundle.
export const PINATA_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI0MjRmMDNjYS0yZjZhLTQ3YmItYTdmMy0yMjljNGIwYWNiYWEiLCJlbWFpbCI6ImR2MjUyNzVAYnJpc3RvbC5hYy51ayIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaW5fcG9saWN5Ijp7InJlZ2lvbnMiOlt7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6IkZSQTEifSx7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6Ik5ZQzEifV0sInZlcnNpb24iOjF9LCJtZmFfZW5hYmxlZCI6ZmFsc2UsInN0YXR1cyI6IkFDVElWRSJ9LCJhdXRoZW50aWNhdGlvblR5cGUiOiJzY29wZWRLZXkiLCJzY29wZWRLZXlLZXkiOiJjZTQ5NGE0ODM4ZDkyZTY3OGEyYiIsInNjb3BlZEtleVNlY3JldCI6ImU5NTczZWNjN2RhNzY2ZmRjNzA3ZDBkM2U3ZGFhMmRmOWQzYmIxN2IxMmU2NjhlMzM0MTIzOGQ0ZGU0YWY5YjAiLCJleHAiOjE4MDgyMzY1NDh9.vXzpKIt4htBkcMWM9LyptaXOwS42HcmRD7mjPe_-q0s";
