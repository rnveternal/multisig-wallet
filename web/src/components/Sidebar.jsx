import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: "🏠", end: true },
  { to: "/create", label: "Multi Sign", icon: "👥" },
  { to: "/send", label: "Kirim Dana", icon: "📤" },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <img src="/logo.png" alt="RNV Eternal" />
        <div className="titles">
          <span className="main">MULTI SIGN <span>WALLET</span></span>
          <span className="sub">Powered by RNV Eternal</span>
        </div>
      </div>

      <nav className="sidenav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => "sidenav-item" + (isActive ? " active" : "")}
          >
            <span className="icon">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-status">
        <span className="dot good" />
        <div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Network Status</div>
          <div className="muted" style={{ fontSize: 11 }}>Semua sistem berjalan normal</div>
        </div>
      </div>

      <div className="sidebar-callout">
        <strong>No Genesis, No Point.</strong>
        <p>
          Contract dibuat tanpa genesis block. Semua data dimulai dari
          deployment kamu sendiri — bukan dari server siapa pun.
        </p>
      </div>

      <div className="sidebar-footer">
        <span>© {new Date().getFullYear()} RNV Eternal</span>
      </div>
    </aside>
  );
}
