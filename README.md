# QRIS Latency Anomaly Monitoring

Prototipe lokal skripsi untuk simulasi pembayaran dan monitoring
anomali latensi per jendela.

QR berisi URL pembayaran demo. Aplikasi tidak memindahkan dana dan
belum menghasilkan payload QRIS resmi.

## Komponen

- Go Fiber v3 dan GORM pada host.
- PostgreSQL 17 melalui Docker Compose.
- React 19 dan Vite 7 pada host.
- Python batch untuk generator demo, Isolation Forest, dan baseline IQR.

## Prasyarat

- Docker Desktop dengan Linux containers.
- Go 1.25+.
- Python 3.12.
- Node.js 22.12+ pada lini Node 22.
- Git.

Semua perintah berikut dijalankan dari root repository menggunakan
Windows PowerShell.

## Konfigurasi dan database

Salin `.env.example` menjadi `.env` untuk penggunaan lokal.
Jangan menimpa `.env` yang sudah dikonfigurasi.

```powershell
Copy-Item .env.example .env
docker compose up -d
docker compose ps
```

Database menggunakan `localhost:55432`, database `qris_demo`.
Tunggu layanan `db` berstatus healthy.

## Backend

```powershell
go mod download
go run ./cmd/api
```

Backend membaca `.env`, menjalankan AutoMigrate, dan menambahkan
merchant demo jika belum tersedia.

Health endpoint: http://127.0.0.1:8080/api/health

## Frontend

Pada terminal lain:

```powershell
npm.cmd --prefix web ci
npm.cmd --prefix web run dev
```

Buka http://localhost:5173.

Vite meneruskan `/api` ke backend tanpa menghapus prefix.
`PUBLIC_BASE_URL` digunakan untuk tautan pembayaran.
`API_BASE_URL` digunakan oleh generator Python.

Pemeriksaan build:

```powershell
npm.cmd --prefix web run build
```

Mode demo menggunakan Vite dev server. Hasil build belum disajikan Go.

## Python

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r services/anomaly/requirements-lock.txt
```

Backend dan database harus tetap berjalan.

```powershell
.\.venv\Scripts\python.exe services/anomaly/generate.py --run-id demo_train_001 --mode train --windows 30 --seed 42
.\.venv\Scripts\python.exe services/anomaly/generate.py --run-id demo_test_001 --mode test --windows 20 --seed 84
.\.venv\Scripts\python.exe services/anomaly/analyze.py --train-run demo_train_001 --test-run demo_test_001 --analysis-id demo_analysis_001
```

Gunakan ID baru untuk run atau analisis berikutnya.
Muat ulang dashboard setelah analisis selesai.

## Pengukuran dan analisis demo

- Pembayaran manual diukur browser dan ditandai `browser_manual`.
- Generator memakai `requests` dan `perf_counter`, ditandai `python_demo`.
- Timer pembayaran tidak mencakup pembuatan tagihan atau upload observation.
- Kelompok akuisisi menargetkan 5 detik; durasi aktual disimpan.
- Analisis hanya membaca kelompok dari generator.
- Kuantil menggunakan respons lengkap.
- Timeout dan kegagalan jaringan tetap dihitung dalam rate.
- IF dilatih pada run normal; test memakai run terpisah.
- Fitur konstan dikeluarkan berdasarkan train.
- Ambang IF: decision_function < 0.
- Ambang IQR: Q3 + 1.5 × IQR dari p95 train.
- Metadata perlakuan tidak dimasukkan ke fitur.
- Prediksi berlaku per jendela, bukan setiap transaksi di dalamnya.

## Artefak

`artifacts/runs` menyimpan manifest pelaksanaan.
`artifacts/analyses` menyimpan model, konfigurasi, dan hasil CSV.

Artefak lokal diabaikan Git. Simpan dan cadangkan jika diperlukan
sebagai bukti eksperimen. Publikasi dataset/hasil dilakukan secara
terpisah setelah dipilih dan didokumentasikan.

## Pemeriksaan

```powershell
go build ./cmd/api
go vet ./...
npm.cmd --prefix web run build
.\.venv\Scripts\python.exe -m compileall services/anomaly
```

Verifikasi manual:
1. Buat tagihan pada web.
2. Buka halaman customer.
3. Bayar secara simulasi.
4. Periksa transaksi dan observation di PostgreSQL.
5. Jalankan generator dan analisis.
6. Cocokkan hasil database dengan dashboard.

Perintah pemeriksaan merupakan prosedur; status keberhasilannya
perlu dicatat setelah benar-benar dijalankan.

## Batas prototipe

Demo hanya memantau endpoint pembayaran.
Delay backend bukan gangguan jaringan Toxiproxy.
`elapsed_ms` bukan metrik k6 `http_req_duration`.

Demo belum merupakan evaluasi penelitian final, diagnosis akar
penyebab, atau sistem produksi.

Tahap penelitian berikutnya mencakup k6, Toxiproxy, agregasi waktu
final, validation/test independen, ground truth, dan evaluasi.
Posisi Redis mengikuti keputusan penelitian selanjutnya.

## Menghentikan aplikasi

Hentikan terminal Go/Vite dengan Ctrl+C.

```powershell
docker compose stop
```

Volume database tetap tersimpan.