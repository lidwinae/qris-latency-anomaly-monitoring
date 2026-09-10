import React, { useCallback, useEffect, useState } from "react";
import MerchantPage from "./pages/MerchantPage.jsx";
import ScannerPage from "./pages/ScannerPage.jsx";
import PaymentPage from "./pages/PaymentPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";

function readRoute() {
  const params = new URLSearchParams(window.location.search);

  if (params.has("pay")) {
    return { page: "payment", transactionID: params.get("pay") };
  }

  const page = params.get("page");
  return {
    page: ["scanner", "dashboard"].includes(page) ? page : "merchant",
    transactionID: null,
  };
}

export default function App() {
  const [route, setRoute] = useState(readRoute);

  const navigate = useCallback((url) => {
    window.history.pushState(null, "", url);
    setRoute(readRoute());
  }, []);

  useEffect(() => {
    const handleBack = () => setRoute(readRoute());
    window.addEventListener("popstate", handleBack);

    return () => window.removeEventListener("popstate", handleBack);
  }, []);

  const openPayment = useCallback((id) => {
    navigate(`/?pay=${encodeURIComponent(id)}`);
  }, [navigate]);

  const openScanner = useCallback(() => {
    navigate("/?page=scanner");
  }, [navigate]);

  const customerPage = ["scanner", "payment"].includes(route.page);

  return (
    <main className={`app ${customerPage ? "theme-customer" : ""}`}>
      <header className="app-header">
        <div>
          <h1>Monitoring Simulasi QRIS</h1>
          <p className="muted">Tagihan, pemindaian, pembayaran, dan monitoring latensi.</p>
        </div>
        <span className="demo-label">Demo lokal</span>
      </header>

      <nav className="navigation" aria-label="Navigasi aplikasi">
        <button
          className={route.page === "merchant" ? "" : "secondary"}
          onClick={() => navigate("/")}
        >
          Generator merchant
        </button>
        <button
          className={customerPage ? "" : "secondary"}
          onClick={openScanner}
        >
          Scanner customer
        </button>
        <button
          className={route.page === "dashboard" ? "" : "secondary"}
          onClick={() => navigate("/?page=dashboard")}
        >
          Dashboard
        </button>
      </nav>

      {route.page === "merchant" && (
        <MerchantPage onPayment={openPayment} onScanner={openScanner} />
      )}

      {route.page === "scanner" && (
        <ScannerPage onPayment={openPayment} />
      )}

      {route.page === "payment" && (
        <PaymentPage
          key={route.transactionID}
          transactionID={route.transactionID}
          onScanner={openScanner}
        />
      )}

      {route.page === "dashboard" && <DashboardPage />}
    </main>
  );
}