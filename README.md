# QRIS Latency Anomaly Monitoring

Prototipe lokal skripsi untuk simulasi pembayaran melalui QR dan
monitoring anomali durasi permintaan HTTP per jendela.

Alur prototipe:

Merchant membuat tagihan → customer memindai QR → customer
mengonfirmasi pembayaran → transaksi dan pengukuran tersimpan
di PostgreSQL.

Untuk analisis, generator Python membuat run train dan test terpisah.
Python menghitung fitur jendela, menjalankan Isolation Forest dan
baseline IQR, lalu menyimpan hasil yang dibaca dashboard.

QR berisi URL pembayaran demo. Aplikasi tidak memindahkan dana
dan tidak menghasilkan payload QRIS resmi.

## Fitur

- Pembuatan tagihan berdasarkan merchant dan nominal.
- Pembuatan dan pengunduhan QR dalam format PNG.
- Pemindaian QR melalui kamera atau berkas gambar.
- Validasi URL dan ID transaksi hasil pemindaian.
- Konfirmasi pembayaran secara eksplisit.
- Pembacaan ulang status pembayaran.
- Pencatatan pengukuran pembayaran manual.
- Generator data demo dengan perlakuan normal dan delay.
- Analisis Isolation Forest dan baseline IQR per jendela.
- Dashboard hasil analisis dan detail pengukuran.

Halaman merchant menggunakan aksen biru. Halaman scanner dan
konfirmasi pembayaran menggunakan warna abu-abu/netral.
Video kamera tetap menggunakan warna aslinya.

## Teknologi

| Komponen | Teknologi | Tempat berjalan |
| --- | --- | --- |
| Backend | Go, Fiber v3, GORM | Host Windows |
| Database | PostgreSQL 17 | Docker Compose |
| Frontend | React 19, Vite 7, JavaScript, CSS | Vite pada host; UI di browser |
| Scanner | qr-scanner 1.4.2 | Browser |
| Generator dan analisis | Python, pandas, scikit-learn, psycopg | Virtual environment pada host |

Python dijalankan sebagai proses batch, bukan layanan HTTP terpisah.

## Prasyarat

- Windows PowerShell.
- Docker Desktop dengan Linux containers.
- Go 1.26.2 sesuai deklarasi `go.mod`.
- Python 3.13; lingkungan lokal yang digunakan adalah Python 3.13.7.
- Node.js yang memenuhi persyaratan Vite 7.
- npm.
- Git untuk pengelolaan repository.

Build frontend telah berhasil pada lingkungan lokal dengan
Node.js 22.14.0 dan npm 10.9.2. Pembaruan npm ke major terbaru
bukan prasyarat menjalankan prototipe.

Dependensi frontend dikunci melalui `web/package-lock.json`.
Dependensi Python dikunci melalui
`services/anomaly/requirements-lock.txt`.

Semua perintah berikut dijalankan dari root repository menggunakan
PowerShell. Path pada perintah bersifat relatif terhadap root
repository.

## Konfigurasi lokal

Untuk penyiapan pertama, salin contoh konfigurasi jika `.env`
belum tersedia:

```powershell
if (-not (Test-Path -LiteralPath '.env')) {
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
}
```

Contoh konfigurasi demo lokal:

```dotenv
DATABASE_URL=postgresql://demo:demo_local@localhost:55432/qris_demo?sslmode=disable
APP_ADDR=127.0.0.1:8080
API_BASE_URL=http://127.0.0.1:8080
PUBLIC_BASE_URL=http://localhost:5173
DEMO_MODE=true
```

Keterangan:

- `DATABASE_URL`: koneksi PostgreSQL untuk Go dan Python pada host.
- `APP_ADDR`: alamat backend Go.
- `API_BASE_URL`: alamat backend yang dipanggil generator Python.
- `PUBLIC_BASE_URL`: alamat frontend dalam QR pembayaran.
- `DEMO_MODE`: mengaktifkan dukungan delay pembayaran untuk demo.

Kredensial contoh hanya untuk demo lokal. `.env` diabaikan Git.
Jangan memasukkan connection string database ke kode frontend.

## Menjalankan database

Repository menyediakan `compose.yaml` untuk PostgreSQL 17,
healthcheck, dan volume persisten.

```powershell
docker compose up -d
docker compose ps
```

Tunggu layanan `db` berstatus `healthy`.

Konfigurasi port:

- Host: `127.0.0.1:55432`.
- Container: `5432`.
- Database: `qris_demo`.

Go dan Python berjalan pada host, sehingga menggunakan port
`55432`, bukan hostname layanan Compose `db`.

Mengubah password dalam konfigurasi Compose tidak otomatis
mengubah password database yang sudah tersimpan pada volume lama.

## Menjalankan backend

Pada terminal backend:

```powershell
go mod download
go run ./cmd/api
```

Backend membaca `.env`, menjalankan GORM AutoMigrate, dan
menambahkan merchant demo jika belum tersedia.

Biarkan terminal ini berjalan.

Pada terminal lain, periksa kesehatan layanan:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/health'
```

Hasil yang diharapkan:

```text
database demo_mode status
-------- --------- ------
ok            True ok
```

`go build` hanya membangun executable; perintah tersebut tidak
menjalankan server.

## Menjalankan frontend

Pada penyiapan pertama atau saat menyelaraskan instalasi dengan
lockfile:

```powershell
npm.cmd --prefix web ci
```

Jalankan Vite pada terminal terpisah:

```powershell
npm.cmd --prefix web run dev
```

Buka [aplikasi lokal](http://localhost:5173/).

Vite menggunakan port `5173` dengan `strictPort: true`.
Permintaan browser `/api` diteruskan ke backend tanpa menghapus
prefix tersebut.

Pemeriksaan build:

```powershell
npm.cmd --prefix web run build
```

Hasil build berada di `web/dist`. Backend saat ini belum
menyajikan hasil build tersebut; demo menggunakan Vite dev server.

## Menggunakan generator QR dan scanner

1. Buka halaman merchant.
2. Pilih merchant dan masukkan nominal.
3. Buat tagihan.
4. Pastikan QR, merchant, nominal, dan status `pending` tampil.
5. Unduh QR sebagai PNG jika menggunakan satu laptop.
6. Buka halaman scanner.
7. Mulai kamera atau pilih gambar QR.
8. Setelah QR terbaca, periksa detail transaksi dari API.
9. Tekan tombol konfirmasi pembayaran.
10. Periksa status `paid`.
11. Kembali ke halaman merchant dan muat ulang status.

Pemindaian QR tidak otomatis melakukan pembayaran.
Nominal dan identitas merchant diambil dari backend.

Tautan pembayaran disediakan sebagai jalur cadangan.
Membuka tautan tidak dihitung sebagai pengujian scanner.

### Kamera dan berkas gambar

- Kamera dimulai melalui tindakan pengguna.
- Browser memerlukan izin kamera.
- Gunakan `http://localhost:5173` untuk demo lokal.
- Pengujian kamera dapat memakai QR pada perangkat kedua
  atau cetakan.
- Unggah PNG memungkinkan pengujian decode QR pada satu laptop.
- Gambar di-decode di browser tanpa dikirim ke layanan eksternal.
- Keberhasilan unggah gambar tidak membuktikan kamera telah diuji.
- Periksa bahwa kamera berhenti ketika dihentikan atau ketika
  pengguna meninggalkan halaman scanner.

Scanner saat ini menerima URL transaksi demo dengan origin
`http://localhost:5173`, path `/`, dan satu parameter `pay`
berisi UUID.

Jika alamat frontend diubah, konfigurasi Vite, `PUBLIC_BASE_URL`,
dan daftar origin tepercaya scanner perlu diselaraskan.

Akses dari HP melalui IP LAN belum dikonfigurasi. `localhost`
pada HP menunjuk HP tersebut, bukan laptop.

## Menyiapkan Python

Untuk penyiapan pertama:

```powershell
py -3.13 -m venv .venv
```

Pasang dependensi yang telah dikunci:

```powershell
.\.venv\Scripts\python.exe -m pip install -r services/anomaly/requirements-lock.txt
```

Periksa dependensi:

```powershell
.\.venv\Scripts\python.exe -m pip check
```

```powershell
.\.venv\Scripts\python.exe -c "import numpy, pandas, sklearn, psycopg, requests, dotenv, joblib; print('Semua import dependency berhasil')"
```

Tidak perlu menjalankan `Activate.ps1` jika menggunakan executable
virtual environment secara langsung seperti di atas.

`requirements.txt` menyatakan rentang dependensi.
`requirements-lock.txt` merekam versi paket dari lingkungan
Windows/Python yang berhasil digunakan. Kesesuaian pada sistem
operasi atau versi Python lain tetap perlu diuji.

## Menghasilkan data demo

Backend dan database harus tetap berjalan.
Jalankan train dan test secara berurutan.

Contoh berikut menggunakan ID untuk pelaksanaan pertama.
Jika ID sudah digunakan, pilih ID baru dan sesuaikan perintah
analisis.

### Run train

```powershell
.\.venv\Scripts\python.exe services/anomaly/generate.py --run-id demo_train_001 --mode train --windows 30 --seed 42
```

Jika selesai, run menghasilkan:

- 30 kelompok akuisisi.
- 20 permintaan pembayaran per kelompok.
- 600 pengukuran.
- Perlakuan delay normal 0–40 ms.

### Run test

Setelah train selesai:

```powershell
.\.venv\Scripts\python.exe services/anomaly/generate.py --run-id demo_test_001 --mode test --windows 20 --seed 84
```

Jika selesai, run menghasilkan:

- 20 kelompok akuisisi.
- 20 permintaan pembayaran per kelompok.
- 400 pengukuran.
- Lima kelompok dengan perlakuan delay 400–800 ms.
- Kelompok lainnya menggunakan delay normal 0–40 ms.

Target laju pengiriman adalah 4 permintaan per detik.
Kelompok akuisisi menargetkan durasi minimal 5 detik;
durasi aktual disimpan dan digunakan untuk menghitung request rate.

Pembuatan tagihan dan upload pengukuran dilakukan di luar
timer akuisisi pembayaran.

Hindari menjalankan train dan test secara bersamaan atau
menambahkan beban manual yang tidak direncanakan selama akuisisi.

### Memeriksa kelengkapan run

```powershell
Get-Content -LiteralPath 'artifacts/runs/demo_train_001.json'
Get-Content -LiteralPath 'artifacts/runs/demo_test_001.json'
```

Kedua manifest harus memiliki `status: completed`.
Jumlah `completed_windows` harus sesuai dengan jumlah yang diminta.

Periksa database:

```powershell
docker compose exec db psql -U demo -d qris_demo -c "SELECT run_id, COUNT(*) AS observations, COUNT(DISTINCT window_index) AS windows FROM observations WHERE source = 'python_demo' AND run_id IN ('demo_train_001', 'demo_test_001') GROUP BY run_id ORDER BY run_id;"
```

Hasil yang diharapkan untuk contoh tersebut:

| Run | Pengukuran | Jendela |
| --- | ---: | ---: |
| demo_train_001 | 600 | 30 |
| demo_test_001 | 400 | 20 |

Run yang terhenti tidak dilanjutkan otomatis. Pertahankan data
dan manifestnya, lalu gunakan ID baru untuk pelaksanaan ulang.

## Menjalankan analisis

Setelah kedua run lengkap:

```powershell
.\.venv\Scripts\python.exe services/anomaly/analyze.py --train-run demo_train_001 --test-run demo_test_001 --analysis-id demo_analysis_001
```

Analisis melakukan:

1. Validasi manifest dan kelengkapan pengukuran.
2. Agregasi fitur per endpoint dan indeks jendela.
3. Pemilihan fitur yang tidak konstan pada train.
4. Pelatihan Isolation Forest menggunakan train.
5. Penilaian test dengan Isolation Forest dan baseline IQR.
6. Penyimpanan model, CSV, dan metadata lokal.
7. Penyimpanan hasil test ke PostgreSQL.

Skrip saat ini mencetak ringkasan setelah seluruh tahap selesai;
belum tersedia log kemajuan per tahap.

Keberadaan model atau CSV saja belum membuktikan penyimpanan
database selesai. Periksa metadata dan hasil database.

```powershell
Get-Content -LiteralPath 'artifacts/analyses/demo_analysis_001/analysis.json'
```

Setelah berhasil, `database_saved` bernilai `true`.

```powershell
docker compose exec db psql -U demo -d qris_demo -c "SELECT analysis_id, COUNT(*) AS windows, COUNT(*) FILTER (WHERE if_anomaly) AS if_anomalies, COUNT(*) FILTER (WHERE iqr_anomaly) AS iqr_anomalies FROM window_results WHERE analysis_id = 'demo_analysis_001' GROUP BY analysis_id;"
```

Contoh test di atas menghasilkan 20 jendela hasil.
Jumlah prediksi anomali mengikuti hasil aktual dan tidak harus
sama dengan jumlah kelompok yang diberi delay.

Gunakan `analysis_id` baru untuk analisis berikutnya.
Skrip menolak ID yang sudah tersimpan di database atau direktori
artefak analisis yang sudah ada.

## Membaca dashboard

1. Buka halaman Dashboard.
2. Klik **Muat ulang data**.
3. Pilih ID analisis.
4. Cocokkan jumlah jendela dan prediksi dengan database.
5. Klik **Lihat** pada satu jendela untuk membaca pengukurannya.

Dashboard menampilkan:

- Jumlah jendela hasil analisis.
- Jumlah jendela anomali menurut IF dan IQR.
- Tren p95 dan ambang IQR.
- p50, p95, request rate, technical error rate, dan timeout rate.
- Skor dan prediksi IF serta prediksi IQR.
- Detail pengukuran pada jendela terpilih.
- Maksimal 100 transaksi terbaru.

Tombol muat ulang hanya membaca hasil tersimpan.
Tombol tersebut tidak menjalankan pelatihan atau analisis Python.

Jika hasil belum tampil, periksa API:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/analyses'
```

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/windows?analysis_id=demo_analysis_001'
```

## Pengukuran dan metode demo

### Sumber pengukuran

Pembayaran manual ditandai `browser_manual`.
Generator Python ditandai `python_demo`.

Timer browser tidak mencakup pembukaan kamera, pemindaian QR,
atau waktu pengguna mempertimbangkan pembayaran.

Generator menggunakan `requests` dan `perf_counter`.
Pengukuran ini berbeda dari metrik k6 `http_req_duration`.

Status bisnis transaksi, kode HTTP, kegagalan jaringan, dan
timeout dicatat sebagai hal yang berbeda. Timeout pada client
tidak membuktikan pembayaran di backend pasti gagal.

### Unit analisis

Satu observation mewakili satu percobaan permintaan pembayaran.

Unit pemodelan adalah ringkasan per endpoint dan jendela generator.
Pembayaran manual tidak otomatis mendapat prediksi anomali individual.

Kandidat fitur:

- p50 durasi.
- p95 durasi.
- IQR durasi.
- Request rate.
- Technical error rate.
- Timeout rate.

Fitur konstan dikeluarkan berdasarkan data train.
Metadata run, skenario, merchant, dan parameter delay tidak
dimasukkan sebagai fitur model.

Kuantil dihitung dari permintaan yang menerima respons lengkap.
Timeout dan kegagalan jaringan tetap diperhitungkan dalam rate.

Jika satu jendela sama sekali tidak memiliki respons lengkap,
analisis saat ini berhenti dengan error karena belum ada
kebijakan kuantil untuk kondisi tersebut.

### Isolation Forest dan IQR

Isolation Forest menggunakan:

- 200 estimator.
- `contamination="auto"`.
- `random_state=42`.
- Train dari run perlakuan normal.
- Prediksi anomali ketika `decision_function < 0`.

Baseline IQR menggunakan ambang:

```text
Q3(p95 train) + 1.5 × IQR(p95 train)
```

Jendela test ditandai anomali oleh baseline jika p95-nya
melampaui ambang tersebut.

Prediksi berlaku per jendela. Prediksi satu jendela tidak berarti
setiap transaksi di dalamnya dinilai anomali secara individual.

Perlakuan delay adalah metadata eksperimen, bukan bukti bahwa
setiap hasil harus mendapat prediksi tertentu.

## Artefak dan data lokal

Manifest pelaksanaan berada di `artifacts/runs`.

Setiap direktori dalam `artifacts/analyses` dapat berisi:

- `model.joblib`: model dan konfigurasi fitur.
- `train_windows.csv`: agregasi train.
- `test_results.csv`: agregasi dan prediksi test.
- `analysis.json`: metadata analisis dan status penyimpanan.

Data PostgreSQL disimpan pada volume persisten Docker.

`.env`, `.venv`, `web/node_modules`, `web/dist`, executable,
dan `artifacts` diabaikan Git.

Artefak dan database lokal perlu dicadangkan secara terpisah
jika digunakan sebagai bukti pelaksanaan. Git tidak mencadangkan
berkas yang diabaikan.

## Pemeriksaan teknis dan fungsional

Pemeriksaan teknis:

```powershell
go build ./cmd/api
go vet ./...
npm.cmd --prefix web run build
.\.venv\Scripts\python.exe -m pip check
```

Pemeriksaan fungsional:

- Buat tagihan dan periksa QR serta detail transaksi.
- Unduh PNG dan decode melalui unggah gambar.
- Uji kamera secara terpisah jika perangkat dan izin tersedia.
- Pastikan QR tidak valid ditolak.
- Pastikan pemindaian tidak otomatis membayar.
- Konfirmasi pembayaran dan baca ulang status.
- Pastikan pengukuran manual tersimpan.
- Pastikan kamera berhenti saat scanner ditutup.
- Jalankan train dan test terpisah hingga lengkap.
- Jalankan analisis dan periksa hasil database.
- Cocokkan dashboard dengan hasil database.

Daftar tersebut merupakan prosedur pemeriksaan, bukan pernyataan
bahwa semua pengujian telah dilakukan.

## Status verifikasi lokal — 10 September 2026

Berdasarkan log pelaksanaan dan pemeriksaan hasil yang tersedia:

- Build dan vet backend dilaporkan berhasil.
- Health endpoint berhasil mengakses database.
- Build frontend berhasil.
- Satu pembayaran manual tercatat dengan HTTP 200 dan status paid.
- Instalasi, pemeriksaan dependensi, dan import Python berhasil.
- Run train selesai dengan 600 pengukuran dalam 30 jendela.
- Run test selesai dengan 400 pengukuran dalam 20 jendela.
- Metadata `demo_analysis_001` menunjukkan `database_saved: true`.
- API hasil analisis mengembalikan 20 jendela.

Pengujian kamera, seluruh kasus penolakan QR, dan pencocokan
visual dashboard belum dicatat sebagai selesai pada snapshot ini.

Analisis sempat memerlukan waktu tunggu panjang sebelum selesai.
Penyebabnya belum teridentifikasi; belum ada pengukuran waktu
per tahap untuk menyimpulkan sumber keterlambatan.

## Batas prototipe dan pekerjaan berikutnya

Prototipe hanya memodelkan endpoint pembayaran demo.

Delay backend belum merupakan gangguan jaringan melalui Toxiproxy.
Kelompok akuisisi demo sekitar 5 detik belum menggantikan rancangan
jendela eksperimen final.

Jumlah data demo ditujukan untuk memeriksa keterhubungan alur,
bukan untuk menyimpulkan performa penelitian.

Implementasi belum mencakup:

- Eksperimen final menggunakan k6 dan Toxiproxy.
- Validation dan test independen untuk kalibrasi serta evaluasi final.
- Ground truth dan perhitungan metrik evaluasi penelitian.
- Redis untuk optimasi penyajian dashboard.
- Analisis otomatis terjadwal atau peringatan real-time.
- Integrasi pembayaran nyata atau diagnosis akar penyebab.

Posisi dan rincian komponen penelitian berikutnya mengikuti
rancangan penelitian serta hasil bimbingan.

## Menghentikan aplikasi

Tunggu generator atau analisis selesai agar pelaksanaan tidak
terputus.

Hentikan Vite dan backend dengan Ctrl+C pada terminal masing-masing.

Hentikan database:

```powershell
docker compose stop
```

Volume database tetap tersimpan. Jangan menggunakan
`docker compose down -v` sebagai prosedur penghentian rutin
karena opsi tersebut menghapus volume.