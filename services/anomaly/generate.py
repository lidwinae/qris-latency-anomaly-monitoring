import argparse
import json
import random
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import requests

from common import (
    API_BASE_URL,
    ARTIFACTS,
    api_request,
    connect,
    new_session,
    validate_id,
)

TARGET_WINDOW_SECONDS = 5.0
TARGET_RPS = 4
REQUESTS_PER_WINDOW = 20


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def measure_payment(transaction, delay_ms):
    request_id = str(uuid.uuid4())
    observed_at = utc_now()

    response = None
    failure_kind = "none"
    is_timeout = False
    http_status = 0

    with new_session() as session:
        started = time.perf_counter()

        try:
            response = session.post(
                f"{API_BASE_URL}/api/transactions/{transaction['id']}/pay",
                json={},
                headers={
                    "X-Request-ID": request_id,
                    "X-Demo-Delay-Ms": str(delay_ms),
                },
                timeout=(2, 3),
            )
            # requests secara default sudah membaca response body.
        except requests.Timeout:
            failure_kind = "timeout"
            is_timeout = True
        except requests.RequestException:
            failure_kind = "network_error"

        elapsed_ms = (time.perf_counter() - started) * 1000

    transaction_status = "unknown"

    if response is not None:
        http_status = response.status_code

        if not response.ok:
            failure_kind = "http_error"

        try:
            body = response.json()
            transaction_status = body.get("status", "unknown")
        except ValueError:
            pass

    return {
        "request_id": request_id,
        "transaction_id": transaction["id"],
        "observed_at": observed_at,
        "elapsed_ms": elapsed_ms,
        "http_status": http_status,
        "failure_kind": failure_kind,
        "transaction_status": transaction_status,
        "is_timeout": is_timeout,
        "demo_delay_ms": delay_ms,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-id", required=True, type=validate_id)
    parser.add_argument("--mode", required=True, choices=["train", "test"])
    parser.add_argument("--windows", required=True, type=int)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    if not 2 <= args.windows <= 200:
        parser.error("--windows harus antara 2 dan 200 untuk demo ini.")

    with connect() as conn:
        existing = conn.execute(
            "SELECT 1 FROM observations WHERE run_id = %s LIMIT 1",
            (args.run_id,),
        ).fetchone()

    if existing:
        raise RuntimeError("run_id sudah memiliki data. Gunakan run_id baru.")

    runs_dir = ARTIFACTS / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = runs_dir / f"{args.run_id}.json"

    manifest = {
        "protocol": "demo-v1",
        "run_id": args.run_id,
        "mode": args.mode,
        "seed": args.seed,
        "windows": args.windows,
        "requests_per_window": REQUESTS_PER_WINDOW,
        "target_window_seconds": TARGET_WINDOW_SECONDS,
        "target_rps": TARGET_RPS,
        "normal_delay_ms": [0, 40],
        "slow_delay_ms": [400, 800],
        "measurement": "requests_perf_counter",
        "started_at": utc_now(),
        "status": "running",
        "completed_windows": 0,
    }

    # Mode x menolak penimpaan manifest run yang sudah ada.
    with manifest_path.open("x", encoding="utf-8") as file:
        json.dump(manifest, file, indent=2)

    rng = random.Random(args.seed)

    try:
        with new_session() as session:
            health = api_request(session, "GET", "/api/health")
            if not health.get("demo_mode"):
                raise RuntimeError("Backend harus memakai DEMO_MODE=true.")

            merchants = api_request(session, "GET", "/api/merchants")
            if not merchants:
                raise RuntimeError("Merchant belum tersedia.")

            for window_index in range(args.windows):
                slow = args.mode == "test" and window_index % 4 == 0
                scenario_id = "demo_delay" if slow else "demo_normal"

                # Pembuatan tagihan berada di luar timer pembayaran.
                jobs = []

                for _ in range(REQUESTS_PER_WINDOW):
                    merchant = rng.choice(merchants)
                    transaction = api_request(
                        session,
                        "POST",
                        "/api/transactions",
                        json={
                            "merchant_id": merchant["id"],
                            "amount": rng.randint(10, 100) * 1000,
                        },
                    )

                    delay_ms = (
                        rng.randint(400, 800)
                        if slow
                        else rng.randint(0, 40)
                    )
                    jobs.append((transaction, delay_ms))

                window_start = utc_now()
                started = time.perf_counter()

                with ThreadPoolExecutor(max_workers=8) as executor:
                    futures = []

                    for index, (transaction, delay_ms) in enumerate(jobs):
                        target = started + index / TARGET_RPS
                        remaining = target - time.perf_counter()
                        if remaining > 0:
                            time.sleep(remaining)

                        futures.append(
                            executor.submit(measure_payment, transaction, delay_ms)
                        )

                    observations = [future.result() for future in futures]

                remaining = (
                    started + TARGET_WINDOW_SECONDS - time.perf_counter()
                )
                if remaining > 0:
                    time.sleep(remaining)

                window_seconds = time.perf_counter() - started

                # Upload pengukuran dilakukan setelah akuisisi kelompok.
                for observation in observations:
                    observation.update({
                        "source": "python_demo",
                        "run_id": args.run_id,
                        "scenario_id": scenario_id,
                        "window_index": window_index,
                        "window_start": window_start,
                        "window_seconds": window_seconds,
                    })

                    api_request(
                        session,
                        "POST",
                        "/api/observations",
                        json=observation,
                    )

                manifest["completed_windows"] = window_index + 1
                manifest_path.write_text(
                    json.dumps(manifest, indent=2),
                    encoding="utf-8",
                )

                print(
                    f"{args.run_id}: window {window_index + 1}/{args.windows}, "
                    f"{scenario_id}, "
                    f"{len(observations)} requests, "
                    f"{window_seconds:.2f} seconds"
                )

        manifest["status"] = "completed"
        manifest["finished_at"] = utc_now()

    except BaseException as error:
        manifest["status"] = "incomplete"
        manifest["failure_type"] = type(error).__name__
        raise

    finally:
        manifest_path.write_text(
            json.dumps(manifest, indent=2),
            encoding="utf-8",
        )

    print(f"Run selesai. Manifest: {manifest_path}")


if __name__ == "__main__":
    main()