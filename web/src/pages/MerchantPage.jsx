import React, { useEffect, useRef, useState } from "react";
import { api, dateTime, rupiah } from "../api.js";

const LAST_TRANSACTION_KEY = "qris-demo:last-transaction";

export default function MerchantPage({ onPayment, onScanner }) {
  const [merchants, setMerchants] = useState([]);
  const [merchantID, setMerchantID] = useState("");
  const [amount, setAmount] = useState("25000");
  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(false);

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();

    async function load() {
      try {
        const rows = await api("/merchants", {
          signal: controller.signal,
        });

        if (!alive.current) return;
        setMerchants(rows);
        setMerchantID(rows[0]?.id ?? "");

        let savedID = "";
        try {
          savedID = sessionStorage.getItem(LAST_TRANSACTION_KEY) || "";
        } catch {
          // Penyimpanan ID terakhir bersifat opsional.
        }

        if (savedID) {
          try {
            const saved = await api(
              `/transactions/${encodeURIComponent(savedID)}`,
              { signal: controller.signal },
            );

            if (alive.current) setTransaction(saved);
          } catch (error) {
            if (alive.current && error.name !== "AbortError") {
              setError(`Tagihan terakhir tidak dapat dimuat: ${error.message}`);
            }
          }
        }
      } catch (error) {
        if (alive.current && error.name !== "AbortError") {
          setError(error.message);
        }
      } finally {
        if (alive.current) setLoading(false);
      }
    }

    load();

    return () => {
      alive.current = false;
      controller.abort();
    };
  }, []);

  async function createInvoice(event) {
    event.preventDefault();
    if (busy) return;

    const nominal = Number(amount);
    if (
      !Number.isSafeInteger(nominal) ||
      nominal < 1 ||
      nominal > 1_000_000_000
    ) {
      setError("Nominal harus bilangan bulat antara 1 dan 1.000.000.000 rupiah.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const result = await api("/transactions", {
        method: "POST",
        body: JSON.stringify({
          merchant_id: merchantID,
          amount: nominal,
        }),
      });

      try {
        sessionStorage.setItem(LAST_TRANSACTION_KEY, result.id);
      } catch {
        // Tagihan tetap berhasil meskipun sessionStorage tidak tersedia.
      }

      if (alive.current) setTransaction(result);
    } catch (error) {
      if (alive.current) setError(error.message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function refreshStatus() {
    if (!transaction || busy) return;

    setBusy(true);
    setError("");

    try {
      const result = await api(`/transactions/${transaction.id}`);
      if (alive.current) setTransaction(result);
    } catch (error) {
      if (alive.current) setError(error.message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  return (
    <section className="two-columns">
      <div className="card">
        <p className="eyebrow">MERCHANT</p>
        <h2>Buat tagihan</h2>
        <p className="muted">Masukkan nominal untuk membuat QR pembayaran simulasi.</p>

        {loading && <p role="status">Memuat merchant...</p>}
        {error && <p className="message error" role="alert">{error}</p>}

        <form onSubmit={createInvoice}>
          <label>
            Merchant
            <select
              value={merchantID}
              onChange={(event) => setMerchantID(event.target.value)}
              disabled={loading || busy}
            >
              {merchants.map((merchant) => (
                <option key={merchant.id} value={merchant.id}>
                  {merchant.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Nominal rupiah
            <input
              type="number"
              min="1"
              max="1000000000"
              step="1"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={busy}
              required
            />
          </label>

          <button disabled={loading || busy || !merchantID}>
            {busy ? "Memproses..." : "Buat QR tagihan"}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>QR tagihan</h2>

        {!transaction ? (
          <p className="empty">QR akan muncul setelah tagihan berhasil dibuat.</p>
        ) : (
          <>
            <p className="amount">{rupiah(transaction.amount)}</p>
            <p>{transaction.merchant_name}</p>
            <p className="mono">{transaction.id}</p>

            <span className={`status ${transaction.status}`}>
              {transaction.status}
            </span>

            <img
              key={transaction.id}
              className="qr-image"
              src={transaction.qr_url}
              alt={`QR tagihan ${transaction.id}`}
              onError={() => setError("Gambar QR gagal dimuat. Periksa backend.")}
            />

            <div className="actions">
              <a
                className="button"
                href={`${transaction.qr_url}?download=1`}
                download={`qris-demo-${transaction.id}.png`}
              >
                Unduh PNG
              </a>

              <button className="secondary" onClick={onScanner}>
                Buka scanner
              </button>
            </div>

            <div className="actions">
              <button
                className="secondary"
                onClick={refreshStatus}
                disabled={busy}
              >
                Muat ulang status
              </button>

              <button
                className="text-button"
                onClick={() => onPayment(transaction.id)}
              >
                Tautan pembayaran cadangan
              </button>
            </div>

            <p className="muted">Waktu pembayaran: {dateTime(transaction.paid_at)}</p>
            <p className="note">
              QR berisi URL demo lokal, belum payload QRIS resmi.
            </p>
          </>
        )}
      </div>
    </section>
  );
}