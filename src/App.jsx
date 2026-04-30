import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { WalletProvider, useWallet } from "./hooks/useWallet";
import { useContract } from "./hooks/useContract";
import {
  ADMIN_WALLETS,
  CHECKIN_STAFF_WALLETS,
} from "./contract/config";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import MyTickets from "./pages/MyTickets";
import Admin from "./pages/Admin";

const ADMIN_ALLOWLIST = new Set((ADMIN_WALLETS || []).map((addr) => addr.toLowerCase()));
const CHECKIN_ALLOWLIST = new Set(
  (CHECKIN_STAFF_WALLETS || []).map((addr) => addr.toLowerCase())
);

export default function App() {
  return (
    <WalletProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </WalletProvider>
  );
}

function RoleLoading() {
  return (
    <div className="py-16 text-center text-gray-400">
      <p>Checking wallet role...</p>
    </div>
  );
}

function getDefaultRouteByRole(role) {
  if (role === "admin") return "/admin";
  return "/";
}

function AppShell() {
  const { account } = useWallet();
  const { getOwner, isAdmin, isCheckInStaff } = useContract();

  const [role, setRole] = useState("guest"); // guest | customer | admin | checkin
  const [roleLoading, setRoleLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function resolveRole() {
      if (!account) {
        setRole("guest");
        setRoleLoading(false);
        return;
      }

      setRoleLoading(true);
      const accountLc = account.toLowerCase();

      // Frontend allowlists are checked first for fast routing.
      const inAdminAllowlist = ADMIN_ALLOWLIST.has(accountLc);
      const inCheckInAllowlist = CHECKIN_ALLOWLIST.has(accountLc);

      if (inAdminAllowlist && !inCheckInAllowlist) {
        if (!cancelled) {
          setRole("admin");
          setRoleLoading(false);
        }
        return;
      }

      if (inCheckInAllowlist && !inAdminAllowlist) {
        if (!cancelled) {
          setRole("checkin");
          setRoleLoading(false);
        }
        return;
      }

      try {
        const owner = await getOwner();
        if (owner === accountLc) {
          if (!cancelled) setRole("admin");
          return;
        }

        const [adminRole, checkInRole] = await Promise.all([
          isAdmin(accountLc),
          isCheckInStaff(accountLc),
        ]);

        if (!cancelled) {
          if (adminRole && checkInRole) {
            // Role conflict should not happen after role-mutex upgrade.
            // Fall back to customer and ask owner to revoke one role.
            console.error("Role conflict: account has both admin and check-in roles.");
            setRole("customer");
          } else if (adminRole) setRole("admin");
          else if (checkInRole) setRole("checkin");
          else setRole("customer");
        }
      } catch (err) {
        console.error("Role resolution failed, defaulting to customer:", err);
        if (!cancelled) setRole("customer");
      } finally {
        if (!cancelled) setRoleLoading(false);
      }
    }

    resolveRole();
    return () => {
      cancelled = true;
    };
  }, [account]);

  const defaultRoute = getDefaultRouteByRole(role);

  return (
    <>
      <Navbar role={role} roleLoading={roleLoading} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Routes>
          <Route path="/" element={<Home role={role} roleLoading={roleLoading} />} />
          <Route
            path="/my-tickets"
            element={
              !account ? (
                <Navigate to="/" replace />
              ) : roleLoading ? (
                <RoleLoading />
              ) : role === "customer" ? (
                <MyTickets />
              ) : (
                <Navigate to={defaultRoute} replace />
              )
            }
          />
          <Route
            path="/admin"
            element={
              !account ? (
                <Navigate to="/" replace />
              ) : roleLoading ? (
                <RoleLoading />
              ) : role === "admin" ? (
                <Admin />
              ) : (
                <Navigate to={defaultRoute} replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
