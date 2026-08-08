# MultiSig Wallet — Web Coordinator

Web app lokal (jalan 100% di komputer kamu, tanpa backend/server pihak ketiga)
untuk mengelola `MultiSigWallet.sol` lewat UI, sebagai pelengkap `cli/multisig-cli.js`.

## Cara jalanin

Dari folder root repo (bukan folder `web/`):

- **Windows**: double-click `web.bat`
- **macOS/Linux**: `./web.sh`

Script ini akan:
1. Cek Node.js sudah terinstall (kalau belum, buka halaman download-nya)
2. `npm install` (sekali saja, di run berikutnya langsung skip)
3. Jalankan dev server dan buka `http://localhost:5173` otomatis

## Alur pemakaian

1. **Login** — connect "Wallet A" (browser extension wallet: MetaMask, Rabby, dll)
2. **Dashboard** — lihat saldo native token di 6 chain EVM sekaligus (Ethereum, BNB Chain,
   Polygon, Arbitrum, Optimism, Base). RPC publik dipakai secara default; kalau mau lebih
   stabil, isi RPC sendiri di `web/.env` (contoh: `web/.env.example`)
3. **Menu Multi Sign** — input 5 address owner, deploy `MultiSigWallet.sol` (threshold
   tetap 3-of-5) langsung dari Wallet A
4. **Kirim Dana** — isi tujuan + jumlah → app generate QR berisi data transaksi
   → **setiap owner** buka `signer.html` lewat *dApp browser* di wallet app HP mereka
     (bukan Chrome/Safari biasa), scan QR itu, review detail transaksi, lalu tanda
     tangan EIP-712 dari wallet mereka sendiri → wallet HP menampilkan QR baru berisi
     signature → coordinator scan balik QR itu (webcam atau upload foto)
   → begitu 3 dari 5 tanda tangan terkumpul, tombol **Execute** aktif

## Kenapa QR manual, bukan WalletConnect

Supaya konsisten dengan prinsip proyek ini — tidak bergantung pada infrastruktur
pihak ketiga manapun (bukan Gnosis Safe, bukan WalletConnect relay). Semua transfer
data (transaksi → owner, signature → coordinator) lewat kamera, offline setelah
halaman dimuat. Satu-satunya "dependency" adalah wallet app yang owner sudah pakai
sendiri.

## Struktur

```
web/
  src/
    lib/
      chains.js            daftar chain EVM untuk dashboard
      multisig.js           ABI + bytecode + helper EIP-712
      MultiSigWallet.artifact.json   hasil kompilasi contracts/MultiSigWallet.sol
      WalletContext.jsx      koneksi Wallet A (window.ethereum)
      store.js               localStorage untuk daftar wallet yang sudah di-deploy
    components/
      QRDisplay.jsx           render QR code
      QRScanner.jsx           scan QR (kamera + upload gambar)
      Navbar.jsx
    pages/
      Dashboard.jsx           login + portofolio multi-chain
      CreateMultiSig.jsx      deploy wallet baru (5 owner, 3-of-5)
      SendFunds.jsx           alur kirim dana + kumpulkan tanda tangan
  public/
    signer.html               halaman standalone untuk owner (dibuka di HP)
```

## Catatan keamanan

- `signer.html` HARUS dibuka lewat dApp browser bawaan wallet app (bukan browser
  biasa) supaya `window.ethereum` tersedia dan tanda tangan benar-benar keluar
  dari private key owner, bukan dari halaman yang bisa dipalsukan.
- Coordinator memvalidasi setiap signature yang di-scan: harus cocok persis
  dengan transaksi yang sedang dibuat (to/value/data/nonce/chainId/contract),
  signer harus salah satu owner, dan tidak boleh duplikat — kalau tidak cocok,
  QR ditolak dengan pesan error.
- Simulasi (`staticCall`) selalu dijalankan sebelum kirim transaksi eksekusi
  yang sesungguhnya, supaya signature/nonce yang salah ketahuan sebelum gas
  terpakai.
