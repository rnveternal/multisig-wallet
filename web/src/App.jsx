import { HashRouter, Routes, Route } from "react-router-dom";
import { WalletProvider } from "./lib/WalletContext";
import { SelectedWalletProvider } from "./lib/SelectedWalletContext";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import Dashboard from "./pages/Dashboard";
import CreateMultiSig from "./pages/CreateMultiSig";
import SendFunds from "./pages/SendFunds";

export default function App() {
  return (
    <WalletProvider>
      <SelectedWalletProvider>
        <HashRouter>
          <div className="app-shell">
            <Sidebar />
            <div className="app-main">
              <Topbar />
              <div className="container">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/create" element={<CreateMultiSig />} />
                  <Route path="/send" element={<SendFunds />} />
                </Routes>
              </div>
              <div className="footer">
                Berjalan 100% lokal di komputer ini — tidak ada backend, tidak ada relay pihak ketiga.
                <div className="powered">
                  <img src="/logo.png" alt="RNV Eternal" />
                  Powered by <span>RNVEternal</span>
                </div>
              </div>
            </div>
          </div>
        </HashRouter>
      </SelectedWalletProvider>
    </WalletProvider>
  );
}
