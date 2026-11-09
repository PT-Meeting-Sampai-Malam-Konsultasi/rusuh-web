# Requirements Document

## Introduction

The `turn` and `missed` views of the waiting room (FR-08-W1), ported from HiFi `waiting-room.html`.

## Requirements

### Requirement 1: Turn

#### Acceptance Criteria

- SHALL show "Nomor 19.700, silakan masuk.", the shout "Giliran Anda!", the action and the 60 s timer ("untuk masuk"),
  then "Kami pindahkan Anda otomatis. Setelah masuk: 5 menit pilih tiket, 10 menit bayar."
- Signed in: "Pilih tiket sekarang →" (claims now; busy while claiming). Guest: "Masuk untuk lanjut →" link, and
  the line "Masuk dulu untuk memilih tiket. Tempat Anda tetap aman selama waktu ini."

### Requirement 2: Missed

#### Acceptance Criteria

- SHALL show "Waktu 60 detik untuk masuk sudah habis.", "Giliran terlewat.", the copy, and "Antre lagi →"
