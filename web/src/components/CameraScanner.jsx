import React, { useEffect, useRef, useState } from "react";
import QrScanner from "qr-scanner";

function stopVideo(video) {
  const stream = video.srcObject;

  if (stream && typeof stream.getTracks === "function") {
    stream.getTracks().forEach((track) => track.stop());
  }

  video.pause();
  video.srcObject = null;
}

function cameraError(error) {
  if (error?.name === "NotAllowedError") {
    return "Izin kamera ditolak. Periksa izin kamera melalui pengaturan situs browser.";
  }

  if (error?.name === "NotFoundError") {
    return "Kamera tidak ditemukan. Gunakan unggah gambar QR sebagai cadangan.";
  }

  if (error?.name === "NotReadableError") {
    return "Kamera tidak dapat dibuka. Periksa apakah sedang dipakai aplikasi lain.";
  }

  return `Kamera/scanner gagal: ${error?.message || String(error)}`;
}

export default function CameraScanner({ onDecoded, onError }) {
  const videoRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    let cancelled = false;
    let scanner = null;

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      onError(
        "Kamera memerlukan konteks aman. Untuk demo laptop, buka http://localhost:5173.",
      );
      return;
    }

    try {
      scanner = new QrScanner(
        video,
        (result) => {
          if (!cancelled) onDecoded(result.data);
        },
        {
          preferredCamera: "environment",
          maxScansPerSecond: 5,
          returnDetailedScanResult: true,
          highlightScanRegion: false,
          highlightCodeOutline: false,
          onDecodeError: (error) => {
            // Tidak menemukan QR pada suatu frame merupakan kondisi biasa.
            if (
              !cancelled &&
              String(error) !== QrScanner.NO_QR_CODE_FOUND
            ) {
              onError(`Decoder gagal: ${error?.message || String(error)}`);
            }
          },
        },
      );

      scanner.start()
        .then(() => {
          if (cancelled) {
            stopVideo(video);
            return;
          }
          setReady(true);
        })
        .catch((error) => {
          if (!cancelled) onError(cameraError(error));
        });
    } catch (error) {
      onError(cameraError(error));
    }

    return () => {
      cancelled = true;
      scanner?.destroy();
      stopVideo(video);
    };
  }, [onDecoded, onError]);

  return (
    <>
      <div className="camera-stage">
        <video ref={videoRef} muted playsInline />
        <div className="scan-frame" aria-hidden="true" />
      </div>
      <p className="muted" role="status">
        {ready ? "Arahkan QR ke bagian tengah kamera." : "Menunggu kamera atau izin..."}
      </p>
    </>
  );
}