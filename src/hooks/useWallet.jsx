/**
 * useWallet.js — MetaMask wallet connection hook + context.
 *
 * How it works:
 *  1. WalletProvider wraps the whole app (in App.jsx) and holds wallet state.
 *  2. Any component calls useWallet() to read { account, provider } or
 *     trigger connect() / disconnect().
 *
 * Key concepts:
 *  - window.ethereum  : MetaMask injects this into the browser. It is the
 *                       low-level interface for talking to the user's wallet.
 *  - BrowserProvider  : ethers.js v6 wrapper around window.ethereum.
 *  - eth_requestAccounts : MetaMask RPC method that opens the "Connect" popup.
 *  - wallet_switchEthereumChain : Prompts the user to switch to Sepolia if
 *                                 they are on the wrong network.
 */
import { createContext, useContext, useState, useCallback } from "react";
import { ethers } from "ethers";
import { TARGET_CHAIN_ID } from "../contract/config";

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const [account, setAccount]   = useState(null);   // connected wallet address
  const [provider, setProvider] = useState(null);   // ethers.js BrowserProvider

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      alert(
        "MetaMask is not installed.\n\nPlease install it from https://metamask.io and refresh the page."
      );
      return;
    }

    try {
      // Ask MetaMask to show account selection popup
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      // Verify the user is on the correct network
      const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
      const chainId    = parseInt(chainIdHex, 16);

      if (chainId !== TARGET_CHAIN_ID) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${TARGET_CHAIN_ID.toString(16)}` }],
          });
        } catch (switchErr) {
          // Error code 4902 means the chain isn't added to MetaMask yet
          if (switchErr.code === 4902) {
            alert("Please add the Hardhat local network (Chain ID 31337, RPC http://127.0.0.1:8545) to MetaMask manually.");
          } else {
            alert("Please switch MetaMask to the Hardhat local network (Chain ID 31337) and try again.");
          }
          return;
        }
      }

      const ethersProvider = new ethers.BrowserProvider(window.ethereum);
      setProvider(ethersProvider);
      setAccount(accounts[0]);

      // Keep state in sync when user switches accounts in MetaMask
      window.ethereum.on("accountsChanged", (newAccounts) => {
        if (newAccounts.length === 0) {
          setAccount(null);
          setProvider(null);
        } else {
          setAccount(newAccounts[0]);
        }
      });

      // Keep state in sync when user switches networks
      window.ethereum.on("chainChanged", () => {
        window.location.reload();
      });
    } catch (err) {
      console.error("Wallet connection failed:", err);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAccount(null);
    setProvider(null);
  }, []);

  return (
    <WalletContext.Provider value={{ account, provider, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}

/**
 * useWallet — returns wallet state and actions.
 *
 * @returns {{ account: string|null, provider: BrowserProvider|null, connect: Function, disconnect: Function }}
 */
export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
