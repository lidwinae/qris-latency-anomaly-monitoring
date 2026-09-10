import argparse
import json
import platform
from datetime import datetime, timezone
from importlib.metadata import version

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from common import ARTIFACTS, PAYMENT_ENDPOINT, connect, validate_id

CANDIDATE_FEATURES = [
    "p50_ms",
    "p95_ms",
    "iqr_ms",
    "request_rate",
    "technical_error_rate",
    "timeout_rate",
]


def read_manifest(run_id, expected_mode):
    path = ARTIFACTS / "runs" / f"{run_id}.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))

    if manifest.get("protocol") != "demo-v1":
        raise RuntimeError(f"Protokol run {run_id} tidak cocok.")

    if manifest.get("status") != "completed":
        raise RuntimeError(f"Run {run_id} belum selesai.")

    if manifest.get("mode") != expected_mode:
        raise RuntimeError(f"Run {run_id} harus bermode {expected_mode}.")

    return manifest


def read_observations(run_id, manifest):
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT *
            FROM observations
            WHERE run_id = %s AND source = 'python_demo'
            ORDER BY window_index, observed_at
            """,
            (run_id,),
        ).fetchall()

    df = pd.DataFrame(rows)

    expected_count = (
        manifest["windows"] * manifest["requests_per_window"]
    )

    if len(df) != expected_count:
        raise RuntimeError(
            f"{run_id}: jumlah pengukuran {len(df)}; "
            f"manifest mengharapkan {expected_count}."
        )

    if df.empty or df["window_index"].isna().any():
        raise RuntimeError(f"{run_id}: data jendela tidak lengkap.")

    indices = sorted(df["window_index"].astype(int).unique().tolist())
    if indices != list(range(manifest["windows"])):
        raise RuntimeError(f"{run_id}: indeks jendela tidak lengkap.")

    if set(df["endpoint"]) != {PAYMENT_ENDPOINT}:
        raise RuntimeError("Demo ini hanya memodelkan endpoint pembayaran.")

    df["observed_at"] = pd.to_datetime(df["observed_at"], utc=True)
    df["window_start"] = pd.to_datetime(df["window_start"], utc=True)

    return df


def aggregate_windows(df, manifest):
    results = []

    for (endpoint, window_index), group in df.groupby(
        ["endpoint", "window_index"], sort=True
    ):
        if len(group) != manifest["requests_per_window"]:
            raise RuntimeError(f"Jendela {window_index}: jumlah request tidak lengkap.")

        for column in ["window_start", "window_seconds", "scenario_id"]:
            if group[column].nunique(dropna=False) != 1:
                raise RuntimeError(
                    f"Jendela {window_index}: metadata {column} tidak konsisten."
                )

        duration = float(group["window_seconds"].iloc[0])
        if not np.isfinite(duration) or duration <= 0:
            raise RuntimeError("Durasi kelompok akuisisi tidak valid.")

        # Kuantil hanya dari permintaan dengan respons lengkap.
        # Timeout dan kegagalan jaringan tetap dihitung dalam rate.
        complete = group.loc[
            (group["http_status"] > 0)
            & (~group["is_timeout"].astype(bool)),
            "elapsed_ms",
        ].astype(float)

        if complete.empty:
            raise RuntimeError(
                f"Jendela {window_index}: tidak ada respons lengkap "
                "untuk menghitung kuantil. Perlu kebijakan khusus "
                "sebelum menganalisis skenario seperti ini."
            )

        if not np.isfinite(complete.to_numpy()).all():
            raise RuntimeError("Durasi mengandung nilai non-finite.")

        q25, p50, q75, p95 = np.quantile(
            complete.to_numpy(),
            [0.25, 0.50, 0.75, 0.95],
        )

        technical_error = (
            group["failure_kind"].isin(["timeout", "network_error"])
            | (group["http_status"] >= 500)
        )

        results.append({
            "run_id": str(group["run_id"].iloc[0]),
            "endpoint": endpoint,
            "window_index": int(window_index),
            "scenario_id": str(group["scenario_id"].iloc[0]),
            "window_start": group["window_start"].iloc[0],
            "window_seconds": duration,
            "request_count": len(group),
            "p50_ms": float(p50),
            "p95_ms": float(p95),
            "iqr_ms": float(q75 - q25),
            "request_rate": len(group) / duration,
            "technical_error_rate": float(technical_error.mean()),
            "timeout_rate": float(group["is_timeout"].astype(bool).mean()),
        })

    return pd.DataFrame(results)


def write_results(results):
    columns = [
        "analysis_id",
        "run_id",
        "endpoint",
        "window_index",
        "train_run_id",
        "scenario_id",
        "window_start",
        "window_seconds",
        "request_count",
        "p50_ms",
        "p95_ms",
        "iqr_ms",
        "request_rate",
        "technical_error_rate",
        "timeout_rate",
        "if_score",
        "if_anomaly",
        "iqr_upper_ms",
        "iqr_anomaly",
        "created_at",
    ]

    float_columns = [
        "window_seconds",
        "p50_ms",
        "p95_ms",
        "iqr_ms",
        "request_rate",
        "technical_error_rate",
        "timeout_rate",
        "if_score",
        "iqr_upper_ms",
    ]

    records = []

    for row in results.to_dict(orient="records"):
        record = {column: row[column] for column in columns}

        for column in float_columns:
            record[column] = float(record[column])

        record["window_index"] = int(record["window_index"])
        record["request_count"] = int(record["request_count"])
        record["if_anomaly"] = bool(record["if_anomaly"])
        record["iqr_anomaly"] = bool(record["iqr_anomaly"])

        for column in ["window_start", "created_at"]:
            if isinstance(record[column], pd.Timestamp):
                record[column] = record[column].to_pydatetime()

        records.append(record)

    placeholders = ", ".join(f"%({column})s" for column in columns)
    sql = (
        f"INSERT INTO window_results ({', '.join(columns)}) "
        f"VALUES ({placeholders})"
    )

    # Nama kolom di atas merupakan konstanta program.
    # Nilai data dikirim sebagai parameter SQL.
    with connect() as conn:
        with conn.cursor() as cursor:
            cursor.executemany(sql, records)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--train-run", required=True, type=validate_id)
    parser.add_argument("--test-run", required=True, type=validate_id)
    parser.add_argument("--analysis-id", required=True, type=validate_id)
    args = parser.parse_args()

    if args.train_run == args.test_run:
        raise RuntimeError("Run train dan test harus berbeda.")

    train_manifest = read_manifest(args.train_run, "train")
    test_manifest = read_manifest(args.test_run, "test")

    train_raw = read_observations(args.train_run, train_manifest)
    test_raw = read_observations(args.test_run, test_manifest)

    if set(train_raw["scenario_id"]) != {"demo_normal"}:
        raise RuntimeError("Training demo harus berasal dari perlakuan normal.")

    train = aggregate_windows(train_raw, train_manifest)
    test = aggregate_windows(test_raw, test_manifest)

    if len(train) < 2:
        raise RuntimeError("Jumlah jendela train belum cukup untuk demo ini.")

    # Pemilihan fitur hanya memakai train.
    features = [
        column
        for column in CANDIDATE_FEATURES
        if train[column].nunique() > 1
    ]

    if not features:
        raise RuntimeError("Semua fitur train konstan.")

    x_train = train[features].to_numpy(dtype=float)
    x_test = test[features].to_numpy(dtype=float)

    if not np.isfinite(x_train).all() or not np.isfinite(x_test).all():
        raise RuntimeError("Fitur mengandung nilai non-finite.")

    with connect() as conn:
        existing = conn.execute(
            "SELECT 1 FROM window_results WHERE analysis_id = %s LIMIT 1",
            (args.analysis_id,),
        ).fetchone()

    if existing:
        raise RuntimeError("analysis_id sudah digunakan.")

    analysis_dir = ARTIFACTS / "analyses" / args.analysis_id
    analysis_dir.mkdir(parents=True, exist_ok=False)

    model = IsolationForest(
        n_estimators=200,
        contamination="auto",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(x_train)

    scores = model.decision_function(x_test)

    q1, q3 = np.quantile(train["p95_ms"].to_numpy(), [0.25, 0.75])
    iqr_upper_ms = float(q3 + 1.5 * (q3 - q1))

    results = test.copy()
    results["analysis_id"] = args.analysis_id
    results["train_run_id"] = args.train_run
    results["if_score"] = scores
    results["if_anomaly"] = scores < 0
    results["iqr_upper_ms"] = iqr_upper_ms
    results["iqr_anomaly"] = results["p95_ms"] > iqr_upper_ms
    results["created_at"] = datetime.now(timezone.utc)

    bundle = {
        "model": model,
        "features": features,
        "train_run_id": args.train_run,
        "if_threshold": 0.0,
        "iqr_upper_ms": iqr_upper_ms,
        "protocol": "demo-v1",
    }

    joblib.dump(bundle, analysis_dir / "model.joblib")
    train.to_csv(analysis_dir / "train_windows.csv", index=False)
    results.to_csv(analysis_dir / "test_results.csv", index=False)

    metadata = {
        "analysis_id": args.analysis_id,
        "train_run_id": args.train_run,
        "test_run_id": args.test_run,
        "features": features,
        "excluded_constant_features": [
            column for column in CANDIDATE_FEATURES if column not in features
        ],
        "if_threshold": 0.0,
        "iqr_upper_ms": iqr_upper_ms,
        "python": platform.python_version(),
        "versions": {
            package: version(package)
            for package in [
                "numpy", "pandas", "scikit-learn", "psycopg", "joblib"
            ]
        },
        "database_saved": False,
    }

    metadata_path = analysis_dir / "analysis.json"
    metadata_path.write_text(
        json.dumps(metadata, indent=2),
        encoding="utf-8",
    )

    write_results(results)

    metadata["database_saved"] = True
    metadata_path.write_text(
        json.dumps(metadata, indent=2),
        encoding="utf-8",
    )

    print(f"Fitur: {features}")
    print(f"Jendela train: {len(train)}")
    print(f"Jendela test: {len(results)}")
    print(f"Ambang IQR p95: {iqr_upper_ms:.3f} ms")
    print(f"Anomali IF: {int(results['if_anomaly'].sum())}/{len(results)}")
    print(f"Anomali IQR: {int(results['iqr_anomaly'].sum())}/{len(results)}")
    print(f"Artefak: {analysis_dir}")
    print("Hasil tersimpan. Muat ulang dashboard.")


if __name__ == "__main__":
    main()