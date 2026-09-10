export async function api(path, options = {}) {
  const controller = new AbortController();
  const externalSignal = options.signal;
  const cancel = () => controller.abort();

  externalSignal?.addEventListener("abort", cancel, { once: true });
  if (externalSignal?.aborted) controller.abort();

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 10000);

  try {
    const response = await fetch(`/api${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    const text = await response.text();
    let data;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error("Respons API bukan JSON. Periksa backend dan proxy Vite.");
    }

    if (!response.ok) {
      throw new Error(data?.error || `HTTP ${response.status}`);
    }

    return data;
  } catch (error) {
    if (timedOut) {
      throw new Error("API belum merespons dalam 10 detik.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", cancel);
  }
}

export function rupiah(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function dateTime(value) {
  return value ? new Date(value).toLocaleString("id-ID") : "-";
}

export async function payAndObserve(transactionID) {
  const requestID = crypto.randomUUID();
  const observedAt = new Date().toISOString();
  const controller = new AbortController();

  let response = null;
  let responseText = "";
  let requestError = null;

  const timeout = setTimeout(() => controller.abort(), 10000);
  const started = performance.now();

  try {
    response = await fetch(
      `/api/transactions/${encodeURIComponent(transactionID)}/pay`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Request-ID": requestID,
        },
        body: "{}",
        signal: controller.signal,
      },
    );

    responseText = await response.text();
  } catch (error) {
    requestError = error;
  }

  const elapsedMS = performance.now() - started;
  clearTimeout(timeout);

  // Parsing JSON dan upload pengukuran berada di luar timer pembayaran.
  let data = null;
  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch {
    data = null;
  }

  const isTimeout = requestError?.name === "AbortError";
  const httpStatus = requestError ? 0 : response?.status ?? 0;

  let failureKind = "none";
  if (requestError) {
    failureKind = isTimeout ? "timeout" : "network_error";
  } else if (httpStatus >= 400) {
    failureKind = "http_error";
  }

  const observation = {
    request_id: requestID,
    transaction_id: transactionID,
    observed_at: observedAt,
    source: "browser_manual",
    run_id: "manual",
    scenario_id: "manual",
    window_index: null,
    window_start: null,
    window_seconds: 0,
    elapsed_ms: elapsedMS,
    http_status: httpStatus,
    failure_kind: failureKind,
    transaction_status: requestError ? "unknown" : data?.status ?? "unknown",
    is_timeout: isTimeout,
    demo_delay_ms: 0,
  };

  let warning = "";

  try {
    await api("/observations", {
      method: "POST",
      body: JSON.stringify(observation),
    });
  } catch (error) {
    warning = `Pengukuran belum tersimpan: ${error.message}`;
  }

  if (requestError) {
    throw new Error(
      `Client ${isTimeout ? "timeout" : "mengalami kegagalan jaringan"}. ` +
        `Muat ulang status sebelum mencoba pembayaran lagi. ${warning}`,
    );
  }

  if (!response.ok) {
    throw new Error(`${data?.error || `HTTP ${httpStatus}`} ${warning}`);
  }

  if (!data?.id) {
    throw new Error(
      `Respons pembayaran tidak valid. Muat ulang status transaksi. ${warning}`,
    );
  }

  return { transaction: data, warning };
}