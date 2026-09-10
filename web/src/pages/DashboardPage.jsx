import React, { useEffect, useRef, useState } from "react";
import { api, dateTime, rupiah } from "../api.js";

function Trend({ rows }) {
  if (!rows.length) return null;

  const maximum = Math.max(
    1,
    ...rows.map((row) => row.p95_ms),
    rows[0].iqr_upper_ms,
  );

  const x = (index) => 40 + index * 560 / Math.max(1, rows.length - 1);
  const y = (value) => 155 - value * 125 / maximum;

  return (
    <figure className="trend">
      <svg viewBox="0 0 640 185" role="img" aria-label="Tren p95 per jendela">
        <text x="4" y="18" fontSize="11" fill="#475569">
          {maximum.toFixed(0)} ms
        </text>

        <line x1="40" y1="155" x2="610" y2="155" stroke="#cbd5e1" />

        <line
          x1="40"
          x2="600"
          y1={y(rows[0].iqr_upper_ms)}
          y2={y(rows[0].iqr_upper_ms)}
          stroke="#64748b"
          strokeDasharray="6 4"
        />

        <polyline
          fill="none"
          stroke="#2563eb"
          strokeWidth="3"
          points={rows.map((row, index) => `${x(index)},${y(row.p95_ms)}`).join(" ")}
        />

        {rows.map((row, index) => (
          <circle
            key={`${row.endpoint}-${row.window_index}`}
            cx={x(index)}
            cy={y(row.p95_ms)}
            r="4"
            fill={row.if_anomaly ? "#b91c1c" : "#2563eb"}
          >
            <title>
              {`Jendela ${row.window_index}: ${row.p95_ms.toFixed(2)} ms`}
            </title>
          </circle>
        ))}

        <text x="40" y="176" fontSize="11" fill="#475569">
          Urutan jendela
        </text>
      </svg>

      <figcaption>
        Biru: p95. Titik merah: anomali IF. Garis putus: ambang IQR.
      </figcaption>
    </figure>
  );
}

export default function DashboardPage() {
  const [analyses, setAnalyses] = useState([]);
  const [analysisID, setAnalysisID] = useState("");
  const [windows, setWindows] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [observations, setObservations] = useState([]);
  const [detailTitle, setDetailTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const alive = useRef(false);
  const controllerRef = useRef(null);

  async function refresh(preferredID = analysisID) {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setBusy(true);
    setError("");

    try {
      const [analysisRows, transactionRows] = await Promise.all([
        api("/analyses", { signal: controller.signal }),
        api("/transactions", { signal: controller.signal }),
      ]);

      const selectedID = analysisRows.some(
        (row) => row.analysis_id === preferredID,
      )
        ? preferredID
        : analysisRows[0]?.analysis_id ?? "";

      const windowRows = selectedID
        ? await api(
            `/windows?analysis_id=${encodeURIComponent(selectedID)}`,
            { signal: controller.signal },
          )
        : [];

      if (!alive.current || controller.signal.aborted) return;

      setAnalyses(analysisRows);
      setTransactions(transactionRows);
      setAnalysisID(selectedID);
      setWindows(windowRows);
      setObservations([]);
      setDetailTitle("");
    } catch (error) {
      if (alive.current && !controller.signal.aborted) {
        setError(error.message);
      }
    } finally {
      if (alive.current && controllerRef.current === controller) {
        setBusy(false);
      }
    }
  }

  useEffect(() => {
    alive.current = true;
    refresh();

    return () => {
      alive.current = false;
      controllerRef.current?.abort();
    };
  }, []);

  async function showDetails(row) {
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setError("");

    try {
      const query = new URLSearchParams({
        run_id: row.run_id,
        window_index: String(row.window_index),
      });

      const rows = await api(`/observations?${query}`, {
        signal: controller.signal,
      });

      if (!alive.current || controller.signal.aborted) return;
      setObservations(rows);
      setDetailTitle(`${row.run_id}, jendela ${row.window_index}`);
    } catch (error) {
      if (alive.current && !controller.signal.aborted) {
        setError(error.message);
      }
    } finally {
      if (alive.current && controllerRef.current === controller) {
        setBusy(false);
      }
    }
  }

  const ifCount = windows.filter((row) => row.if_anomaly).length;
  const iqrCount = windows.filter((row) => row.iqr_anomaly).length;

  return (
    <section>
      <div className="card">
        <div className="section-top">
          <div>
            <p className="eyebrow">MONITORING</p>
            <h2>Hasil analisis</h2>
          </div>
          <button onClick={() => refresh()} disabled={busy}>
            {busy ? "Memuat..." : "Muat ulang data"}
          </button>
        </div>

        {error && <p className="message error" role="alert">{error}</p>}

        <label>
          Analisis
          <select
            value={analysisID}
            disabled={busy || !analyses.length}
            onChange={(event) => refresh(event.target.value)}
          >
            {!analyses.length && <option value="">Belum ada hasil</option>}
            {analyses.map((row) => (
              <option key={row.analysis_id} value={row.analysis_id}>
                {row.analysis_id} — {row.run_id}
              </option>
            ))}
          </select>
        </label>

        {!windows.length ? (
          <p className="empty">Belum ada hasil analisis untuk ditampilkan.</p>
        ) : (
          <>
            <div className="stats">
              <div>
                <strong>{windows.length}</strong>
                <span>Jendela dianalisis</span>
              </div>
              <div>
                <strong>{ifCount}/{windows.length}</strong>
                <span>Jendela anomali IF</span>
              </div>
              <div>
                <strong>{iqrCount}/{windows.length}</strong>
                <span>Jendela anomali IQR</span>
              </div>
            </div>

            <p>Run train: <code>{windows[0].train_run_id}</code></p>
            <p>Endpoint: <code>{windows[0].endpoint}</code></p>

            <Trend rows={windows} />

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Indeks</th>
                    <th>Mulai</th>
                    <th>Perlakuan demo</th>
                    <th>N</th>
                    <th>p50 ms</th>
                    <th>p95 ms</th>
                    <th>Req/s</th>
                    <th>Error teknis</th>
                    <th>Timeout</th>
                    <th>Skor IF</th>
                    <th>IF</th>
                    <th>IQR</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {windows.map((row) => (
                    <tr key={`${row.endpoint}-${row.window_index}`}>
                      <td>{row.window_index}</td>
                      <td>{dateTime(row.window_start)}</td>
                      <td>{row.scenario_id}</td>
                      <td>{row.request_count}</td>
                      <td>{row.p50_ms.toFixed(2)}</td>
                      <td>{row.p95_ms.toFixed(2)}</td>
                      <td>{row.request_rate.toFixed(2)}</td>
                      <td>{(row.technical_error_rate * 100).toFixed(1)}%</td>
                      <td>{(row.timeout_rate * 100).toFixed(1)}%</td>
                      <td>{row.if_score.toFixed(4)}</td>
                      <td className={row.if_anomaly ? "anomaly" : ""}>
                        {row.if_anomaly ? "Anomali" : "Normal"}
                      </td>
                      <td className={row.iqr_anomaly ? "anomaly" : ""}>
                        {row.iqr_anomaly ? "Anomali" : "Normal"}
                      </td>
                      <td>
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => showDetails(row)}
                        >
                          Lihat
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="note">
              Prediksi berlaku per jendela. Perlakuan demo adalah metadata.
            </p>
          </>
        )}
      </div>

      {detailTitle && (
        <div className="card">
          <h2>Pengukuran: {detailTitle}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Transaksi</th>
                  <th>Merchant</th>
                  <th>Nominal</th>
                  <th>Durasi ms</th>
                  <th>HTTP</th>
                  <th>Kegagalan</th>
                  <th>Status dilihat client</th>
                </tr>
              </thead>
              <tbody>
                {observations.map((row) => (
                  <tr key={row.request_id}>
                    <td className="mono">{row.transaction_id}</td>
                    <td>{row.merchant_id}</td>
                    <td>{rupiah(row.amount)}</td>
                    <td>{row.elapsed_ms.toFixed(2)}</td>
                    <td>{row.http_status || "Tidak ada"}</td>
                    <td>{row.failure_kind}</td>
                    <td>{row.transaction_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Transaksi terbaru</h2>
        <p className="muted">Maksimal 100 transaksi terbaru.</p>

        {!transactions.length ? (
          <p className="empty">Belum ada transaksi.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Merchant</th>
                  <th>Nominal</th>
                  <th>Status bisnis</th>
                  <th>Dibuat</th>
                  <th>Dibayar</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((row) => (
                  <tr key={row.id}>
                    <td className="mono">{row.id}</td>
                    <td>{row.merchant_name || row.merchant_id}</td>
                    <td>{rupiah(row.amount)}</td>
                    <td>{row.status}</td>
                    <td>{dateTime(row.created_at)}</td>
                    <td>{dateTime(row.paid_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}