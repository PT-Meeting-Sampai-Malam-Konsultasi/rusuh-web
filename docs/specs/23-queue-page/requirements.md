# Requirements Document

## Introduction

The waiting room page (`/queue`), from the HiFi `waiting-room.html`: event poster beside the main column on desktop,
a compact banner above it on phones; app header and tab bar as on Home (the queue tab is current).

## Requirements

### Requirement 1: Waiting

#### Acceptance Criteria

- "Anda antrian ke-" and the number in the registered two-ink print (pink over blue), announced politely
- Progress track with "Saat Anda bergabung", "Sedang dilayani No. …· Nomor Anda No. …" and "Giliran Anda"
- The three notes from the HiFi footer ("Posisi Anda aman", "60 detik untuk masuk", "Tidak menunggu sia-sia")

### Requirement 2: Other states

#### Acceptance Criteria

- Joining: "Mengambil nomor antrian…" with the Turnstile slot (the widget only appears when Cloudflare asks)
- Pre-queue, paused and sold out as in the HiFi; sold out greys the poster and stamps "HABIS"
- No event, not found, elsewhere and error: a message with a link home (error also has "Coba lagi")
