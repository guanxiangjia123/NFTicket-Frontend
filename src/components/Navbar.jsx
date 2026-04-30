import { Link } from "react-router-dom";
import { useWallet } from "../hooks/useWallet";

function shortenAddress(addr) {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";
}

export default function Navbar({ role = "guest", roleLoading = false }) {
  const { account, connect, disconnect } = useWallet();

  const showCustomerLinks = account && !roleLoading && role === "customer";
  const showAdminLinks = account && !roleLoading && role === "admin";

  return (
    <nav className="flex items-center justify-between bg-indigo-700 px-6 py-4 text-white shadow-md">
      <div className="flex items-center gap-6">
        <Link to="/" className="text-xl font-bold tracking-tight hover:text-indigo-200">
          NFTicket
        </Link>
        <Link to="/" className="text-sm hover:text-indigo-200">
          Events
        </Link>
        {showCustomerLinks && (
          <Link to="/my-tickets" className="text-sm hover:text-indigo-200">
            My Tickets
          </Link>
        )}
        {showAdminLinks && (
          <Link to="/admin" className="text-sm hover:text-indigo-200">
            Administrator
          </Link>
        )}
      </div>

      <div>
        {account ? (
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-indigo-800 px-3 py-1 font-mono text-sm">
              {shortenAddress(account)}
            </span>
            <button
              onClick={disconnect}
              className="rounded bg-red-500 px-3 py-1 text-sm transition hover:bg-red-600"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={connect}
            className="rounded bg-white px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
          >
            Connect Wallet
          </button>
        )}
      </div>
    </nav>
  );
}
