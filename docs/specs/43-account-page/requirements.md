# Requirements Document

## Introduction

The `/account` screen (NFR-07-W3), ported from HiFi `account.html` within the agreed scope.

## Requirements

### Requirement 1

- Route `src/app/account/page.tsx` (metadata "Akun") and `error.tsx`
- Header (nav, account tab current); the name as the hero (Display XL) with the e-mail under it
- Section "1 Data diri": Nama row with "Ubah"; the edit form (TextField + Simpan + Batal)
- Section "2 Masuk": Email row with "✓ Terverifikasi"; "Cara masuk": "Kode 6 digit ke email ini. Tanpa kata sandi."
- "Keluar" (secondary button)
- Side card "NIK diisi saat memesan": NIK per ticket on the order page, 1 NIK = 1 ticket per event, matched to the KTP
  at the gate; stored encrypted, shown in part
- Loading skeleton; error message with "Coba lagi"
