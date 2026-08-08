// Shared formatting helpers so address/number/date formatting isn't
// copy-pasted (and drifting out of sync) across Navbar, Dashboard, SendFunds.

export function short(addr, head = 6, tail = 4) {
  if (!addr) return "";
  return `${addr.slice(0, head)}...${addr.slice(-tail)}`;
}

export function formatDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }) + ", " + d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " " +
    Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop();
}

export function formatAmount(value, maxDecimals = 5) {
  const n = Number(value);
  if (!isFinite(n)) return "0";
  return n.toLocaleString("en-US", { maximumFractionDigits: maxDecimals });
}

export function formatUsd(value) {
  const n = Number(value);
  if (!isFinite(n)) return null;
  if (n === 0) return "$0.00";
  if (n < 0.01) return "< $0.01";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}
