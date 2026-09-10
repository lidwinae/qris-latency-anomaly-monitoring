import React, { useEffect, useRef, useState } from "react";
import { api, dateTime, payAndObserve, rupiah } from "../api.js";

export default function PaymentPage({ transactionID, onScanner }) {
  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const alive = useRef(false);
  const paymentLock = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    setLoading(true);
    setError("");

    api(`/transactions/${encodeURIComponent(transactionID)}`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!active) return;
        setTransaction(result);
        setNeedsRefresh(false);
      })
      .catch((error) => {
        if (active && error.name !== "AbortError") {
          setError(error.message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [transactionID, refreshKey]);

  async function pay() {
    if (
      paymentLock.current ||
      !transaction ||
      transaction.status !== "pending" ||
      needsRefresh
    ) {
      return;
    }

    paymentLock.current = true;
    setPaying(true);
    setError("");
    setNotice("");

    try {
      const result = await payAndObserve(transactionID);

      if (alive.current) {
        setTransaction(result.transaction);
        setNotice(
          result.warning ||
            "Pembayaran simulasi berhasil. Pengukuran sudah tersimpan.",
        );
      }
    } catch (error) {
      if (alive.current) {
        setError(error.message);
        setNeedsRefresh(true);
      }
    } finally {
      paymentLock.current = false;
      if (alive.current) setPaying(false);
    }
  }

  return (
    <section className="card payment-card">
      <p className="eyebrow">KONFIRMASI CUSTOMER</p>
      <h2>Periksa tagihan</h2>
      <p className="muted">Pembayaran ini merupakan simulasi tanpa perpindahan dana.</p>

      {loading && <p role="status">Memuat transaksi...</p>}
      {error && <p className="message error" role="alert">{error}</p>}
      {notice && <p className="message" role="status">{notice}</p>}

      {transaction && (
        <>
          <p className="amount">{rupiah(transaction.amount)}</p>
          <h3>{transaction.merchant_name || transaction.merchant_id}</h3>
          <p className="mono">{transaction.id}</p>

          <p>
            Status:{" "}
            <span className={`status ${transaction.status}`}>
              {transaction.status}
            </span>
          </p>

          <p>Dibuat: {dateTime(transaction.created_at)}</p>
          <p>Dibayar: {dateTime(transaction.paid_at)}</p>

          <div className="actions">
            <button
              onClick={pay}
              disabled={
                loading ||
                paying ||
                needsRefresh ||
                transaction.status !== "pending"
              }
            >
              {paying
                ? "Memproses..."
                : transaction.status === "paid"
                  ? "Sudah dibayar"
                  : "Konfirmasi pembayaran"}
            </button>

            <button
              className="secondary"
              disabled={loading || paying}
              onClick={() => setRefreshKey((value) => value + 1)}
            >
              Muat ulang status
            </button>
          </div>
        </>
      )}

      <button
        className="text-button"
        onClick={onScanner}
        disabled={paying}
      >
        Kembali ke scanner
      </button>
    </section>
  );
}