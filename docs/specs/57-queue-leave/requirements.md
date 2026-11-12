# Requirements Document

## Introduction

"Keluar dari antrian" (FR-04-W2, rusuh-web#56, PRD W-9 SHOULD): give the number up on purpose, so the place is freed
and the account can queue on another device. HiFi `waiting-room.html?state=leave` and `?state=left`.

## Requirements

### Requirement 1: Service and use case

- `queueService.leaveQueue(eventId, deviceToken, queueToken)` SHALL call `DELETE queue/{eventId}/me` with
  `X-Device-Token` and `X-Queue-Token` (Apidog `leaveQueue`, idempotent 204)
- `leaveQueueUseCase` SHALL free the place on the server, then forget it on this device; `UNAUTHORIZED`, `NOT_FOUND`,
  `MISSED`, `EXPIRED`, `MOVED`, `QUEUE_CLOSED` count as already gone; with no stored tokens it only forgets the place;
  any other failure keeps the place and passes through; a claimed admission is not touched

### Requirement 2: Link and confirm

- While holding a place (`waiting`, `prequeue`, `paused`), the notes row SHALL end with "Di aplikasi, kami kirim
  notifikasi saat giliran Anda dekat." and the "Keluar dari antrian" link
- The link SHALL open "Keluar dari antrian?": number N is given up for good, a later join starts at the back, M people
  ahead now (without a number before the draw: the place is given up); "Tetap antre" is the primary button and takes the
  focus; Escape stays; "Ya, keluar" leaves; a dialog on desktop, a bottom sheet on phones
- Leaving SHALL show the loading overlay in all three mutation paths; a failure closes the sheet and shows the popup,
  and the buyer keeps the place

### Requirement 3: Left

- After leaving, the waiting room SHALL show "Nomor N sudah dilepas.", "Anda keluar dari antrian.", "Tiket EVENT masih
  dijual …", "Antre lagi" (a new number at the back) and "Lihat event lain"; no queue call runs (no polling, stream,
  turn window or claim)
- Analytics: `queue_leave`; "Antre lagi" tracks `queue_rejoin` as after a missed turn

### Requirement 4: Mock

- `DELETE /queue/:eventId/me` SHALL forget the place and answer 204, also when it is already gone; 401 without tokens
