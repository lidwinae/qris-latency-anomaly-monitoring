const TRUSTED_ORIGINS = new Set([
  "http://localhost:5173",
]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parsePaymentQR(text) {
  let url;

  try {
    url = new URL(text.trim());
  } catch {
    throw new Error("QR tidak berisi URL pembayaran demo yang valid.");
  }

  if (
    !TRUSTED_ORIGINS.has(url.origin) ||
    url.pathname !== "/" ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error("QR berasal dari alamat atau format yang tidak diizinkan.");
  }

  const paymentIDs = url.searchParams.getAll("pay");
  const hasOtherParameter = [...url.searchParams.keys()].some(
    (key) => key !== "pay",
  );

  if (
    paymentIDs.length !== 1 ||
    hasOtherParameter ||
    !UUID_PATTERN.test(paymentIDs[0])
  ) {
    throw new Error("ID transaksi pada QR tidak valid.");
  }

  return paymentIDs[0].toLowerCase();
}