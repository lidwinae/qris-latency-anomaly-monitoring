# QRIS Latency Anomaly Monitoring

Prototipe skripsi untuk simulasi pembayaran melalui QR dan monitoring
anomali latensi menggunakan Isolation Forest serta baseline IQR.

QR berisi tautan pembayaran demo. Tidak ada perpindahan dana atau
integrasi QRIS resmi.

## Fitur dan teknologi

- Tagihan merchant, QR yang dapat diunduh, dan scanner kamera/gambar.
- Konfirmasi pembayaran dan pembaruan status transaksi.
- Generator data simulasi serta dashboard hasil analisis.

Dibangun dengan Go Fiber v3, GORM, PostgreSQL 17, React/Vite,
dan Python/scikit-learn.

## Persiapan

Siapkan Docker Desktop, Go 1.26.2, Python 3.13, serta Node.js/npm.
Frontend telah berhasil dibangun menggunakan Node.js 22.14.0
dan npm 10.9.2.

Jalankan semua perintah dari root repository melalui PowerShell.

Untuk penyiapan pertama, salin `.env.example` menjadi `.env`:

```powershell
Copy-Item .env.example .env
```

Lewati penyalinan jika `.env` sudah tersedia. Konfigurasi bawaan
menggunakan PostgreSQL pada port `55432`, backend `8080`,
dan frontend `5173`.

## Menjalankan aplikasi

### 1. Database

Pastikan Docker Desktop aktif, lalu jalankan:

```powershell
docker compose up -d
docker compose ps
```

Tunggu layanan `db` berstatus `healthy`.

### 2. Backend

```powershell
go mod download
go run ./cmd/api
```

Biarkan terminal berjalan. Backend menyiapkan tabel dan merchant
demo secara otomatis.

### 3. Frontend

Buka terminal lain:

```powershell
npm.cmd --prefix web ci
npm.cmd --prefix web run dev
```

`npm ci` diperlukan saat penyiapan atau pembaruan dependensi,
bukan setiap kali menjalankan aplikasi.

Buka [aplikasi lokal](http://localhost:5173/).

### 4. Coba pembayaran

1. Buat tagihan pada halaman merchant.
2. Unduh QR, lalu buka halaman scanner.
3. Pilih gambar QR atau pindai melalui kamera dengan izin browser.
4. Periksa detail tagihan, lalu konfirmasi pembayaran.
5. Muat ulang status pada halaman merchant.

Pemindaian tidak otomatis membayar. Untuk demo satu laptop,
gunakan gambar QR sebagai alternatif kamera.

## Menjalankan analisis

Siapkan Python sekali pada awal penggunaan:

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r services/anomaly/requirements-lock.txt
```

Biarkan backend dan database aktif. Jalankan tiga perintah berikut
satu per satu, menunggu setiap proses selesai:

```powershell
.\.venv\Scripts\python.exe services/anomaly/generate.py --run-id demo_train_001 --mode train --windows 30 --seed 42
```

```powershell
.\.venv\Scripts\python.exe services/anomaly/generate.py --run-id demo_test_001 --mode test --windows 20 --seed 84
```

```powershell
.\.venv\Scripts\python.exe services/anomaly/analyze.py --train-run demo_train_001 --test-run demo_test_001 --analysis-id demo_analysis_001
```

Contoh tersebut menghasilkan 600 pengukuran train dan 400 pengukuran
test, kemudian menganalisis 20 jendela test.

**Gunakan ID baru jika ID contoh sudah pernah digunakan.**
Sesuaikan juga ID pada perintah analisis.

Setelah muncul **Hasil tersimpan**, buka Dashboard, klik
**Muat ulang data**, lalu pilih analisis. Tombol ini membaca hasil
tersimpan, bukan menjalankan ulang Python.

Model, CSV, dan metadata disimpan di `artifacts`. Hasil analisis
juga disimpan di PostgreSQL.

## Catatan analisis

- Prediksi berlaku per jendela generator, bukan per transaksi.
- Pembayaran manual dicatat terpisah dan tidak otomatis dinilai model.
- Isolation Forest dilatih pada run normal; IQR menjadi pembanding.
- Data demo belum menjadi evaluasi penelitian final.
- k6, Toxiproxy, dan Redis belum diterapkan pada tahap ini.

## Pemeriksaan

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/health'
go build ./cmd/api
go vet ./...
npm.cmd --prefix web run build
.\.venv\Scripts\python.exe -m pip check
```

Demo menggunakan Vite dev server; hasil build frontend belum
disajikan oleh backend Go.

## Menghentikan aplikasi

Setelah proses Python selesai, hentikan terminal backend dan
frontend dengan Ctrl+C, lalu:

```powershell
docker compose stop
```

Data database tetap tersimpan pada volume Docker.
`.env`, virtual environment, dan artefak lokal tidak dimasukkan ke Git.