import React, { useCallback, useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import CameraScanner from "../components/CameraScanner.jsx";
import { api } from "../api.js";
import { parsePaymentQR } from "../qr.js";

export default function ScannerPage({ onPayment }) {
  const [cameraSession, setCameraSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const nextSession = useRef(0);
  const working = useRef(false);
  const alive = useRef(false);
  const requestController = useRef(null);

  useEffect(() => {
    alive.current = true;

    return () => {
      alive.current = false;
      requestController.current?.abort();
    };
  }, []);

  const processQR = useCallback(async (readText) => {
    if (!alive.current || working.current) return;

    working.current = true;
    setBusy(true);
    setError("");
    setCameraSession(null);

    const controller = new AbortController();
    requestController.current = controller;

    try {
      const text = await readText();
      if (controller.signal.aborted) return;

      const transactionID = parsePaymentQR(text);

      // Pastikan transaksi benar-benar ada sebelum berpindah halaman.
      await api(`/transactions/${transactionID}`, {
        signal: controller.signal,
      });

      if (alive.current && !controller.signal.aborted) {
        onPayment(transactionID);
      }
    } catch (error) {
      if (alive.current && error?.name !== "AbortError") {
        const message = String(error) === QrScanner.NO_QR_CODE_FOUND
          ? "QR tidak ditemukan pada gambar. Gunakan PNG dari halaman merchant."
          : error?.message || String(error);

        setError(message);
      }
    } finally {
      working.current = false;

      if (requestController.current === controller) {
        requestController.current = null;
      }

      if (alive.current) setBusy(false);
    }
  }, [onPayment]);

  const handleDecoded = useCallback((text) => {
    void processQR(async () => text);
  }, [processQR]);

  const handleCameraError = useCallback((message) => {
    if (!alive.current) return;
    setCameraSession(null);
    setError(message);
  }, []);

  function startCamera() {
    if (working.current || cameraSession !== null) return;

    setError("");
    nextSession.current += 1;
    setCameraSession(nextSession.current);
  }

  function stopCamera() {
    setCameraSession(null);
  }

  function uploadImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || working.current) return;

    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setError("Pilih gambar PNG atau JPEG.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Ukuran gambar maksimal 10 MB.");
      return;
    }

    void processQR(async () => {
      const result = await QrScanner.scanImage(file, {
        returnDetailedScanResult: true,
      });
      return result.data;
    });
  }

  return (
    <section className="card scanner-card">
      <p className="eyebrow">CUSTOMER</p>
      <h2>Pindai QR pembayaran</h2>
      <p className="muted">
        Pindai QR, periksa tagihan, lalu konfirmasi pembayaran.
      </p>

      {error && <p className="message error" role="alert">{error}</p>}
      {busy && (
        <p className="message" role="status">
          Membaca QR dan memeriksa transaksi...
        </p>
      )}

      {cameraSession === null ? (
        <div className="camera-placeholder">
          <span aria-hidden="true">▣</span>
          <p>Kamera belum aktif</p>
        </div>
      ) : (
        <CameraScanner
          key={cameraSession}
          onDecoded={handleDecoded}
          onError={handleCameraError}
        />
      )}

      <div className="actions">
        <button
          onClick={startCamera}
          disabled={busy || cameraSession !== null}
        >
          Mulai kamera
        </button>

        <button
          className="secondary"
          onClick={stopCamera}
          disabled={cameraSession === null}
        >
          Hentikan kamera
        </button>
      </div>

      <label>
        Atau pilih gambar QR
        <input
          type="file"
          accept="image/png,image/jpeg"
          onChange={uploadImage}
          disabled={busy || cameraSession !== null}
        />
      </label>

      <p className="note">
        Gambar diproses di browser. Untuk demo satu laptop, unduh PNG dari
        halaman merchant lalu pilih file tersebut di sini.
      </p>
    </section>
  );
}