# Milestone 7 UX review

Verified locally on 2026-10-22 using the actual in-app Chromium browser, the Vite
frontend, Express API, and PostgreSQL. These are viewport checks, not physical-device
or exhaustive assistive-technology certification.

## Changes

- Role-aware navigation, a primary booking/availability link, and a keyboard skip
  link lead to real page sections without introducing a router or more pages.
- Responsive time-button grid, wrapping navigation, mobile form spacing, visible
  focus styles, and 44px minimum control heights preserve the existing visual style.
- Password visibility control, email keyboard hints, and local working-hours
  validation improve forms while retaining authoritative backend validation.
- Availability load errors are separate from submission feedback. A conflict clears
  the selection and refreshes slots without hiding valid alternatives behind its
  error message. Uncertain outcomes direct customers to My bookings.
- Cancellation asks for an inline confirmation. Focus moves to confirmation, returns
  to the original action after Keep appointment, and goes to the dashboard heading
  after cancellation. Status uses explicit text as well as color.
- Consultant refresh preserves the in-memory hours draft while updating metadata and
  availability. It no longer remounts the whole editor after cancellation.
- Network/malformed responses have useful messages. HTTP error status and aborts
  remain intact; CSRF preparation failure never proceeds to the mutation.

## Executed browser checks

| Journey/check                                                                                 | Result                                                                                                      |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Customer registration at 390px, show/hide password, invalid login then correct login          | Passed; pending, error and success feedback visible                                                         |
| Empty availability and empty customer dashboard                                               | Passed; useful empty states and refresh controls                                                            |
| Select 29 October, 09:00, then have an independently authenticated consultant block that time | Passed; real 409 message, selection cleared, 09:30 remained selectable without another manual refresh       |
| Book 09:30 after conflict                                                                     | Passed; confirmation SS-000001, dashboard updated, heading focused                                          |
| Download confirmed PDF through UI                                                             | Passed; actual file saved and parsed with PDF.js                                                            |
| Cancel prompt, Keep appointment, then confirmed customer cancellation                         | Passed; correct focus transitions, canceled history retained                                                |
| Download canceled PDF through UI                                                              | Passed; actual saved file parsed as CANCELED with no CONFIRMED status                                       |
| Rebook canceled time                                                                          | Passed; SS-000002, historical SS-000001 remained canceled                                                   |
| Consultant login and cancel SS-000002 while Monday was enabled in an unsaved draft            | Passed; draft remained checked after metadata/availability refresh                                          |
| Invalid Thursday end time, then restore and save existing Thursday 09:00–10:00                | Passed; local alert and aria-invalid, invalid field focused, successful save feedback                       |
| Consultant unblock, block, and unblock 09:00                                                  | Passed; list refreshed, blocked slot disappeared, both times returned after unblock                         |
| Temporarily stop API, request availability, restart API and retry without a page reload       | Passed; readable error and enabled retry, alert cleared after successful retry                              |
| Keyboard Shift+Tab to skip link, Enter to schedule                                            | Passed; focus reached schedule target                                                                       |
| DOM audit of navigation anchors and input/select labels                                       | Passed; no broken fragment targets or unlabeled form controls                                               |
| Widths 320, 390, 820 and 1280px                                                               | Passed; no horizontal page overflow; mobile form/time selection and desktop confirmation visually inspected |

Browser warnings/errors were absent after the normal final page load. Intentional
conflict/outage requests were failure tests, not successful HTTP responses. The API
was restored after outage checks. Temporary viewport overrides were reset and the
browser was signed out at completion.

## Regression checks and evidence

- `npm test`: 14 passed, 0 failed, 4 DB suites explicitly skipped. Includes three new
  client-request tests. Focused client tests passed again after the lint correction.
- `npm run test:db`: 53 passed, 0 failed, 0 skipped against real PostgreSQL; existing
  authorization, booking/block/cancellation races, history, and PDF checks retained.
- Lint and production build passed. An intermediate lint failure required retaining
  the original error as `cause` when presenting a friendly message; corrected.
- Ignored screenshots: `.local/m7-desktop.png`, `.local/m7-desktop-confirmation.png`,
  `.local/m7-mobile-confirmation.png`, and `.local/m7-mobile-conflict.png`.
- Actual browser PDFs were saved in the local Downloads directory and verified using
  ignored `.local/m7-check-downloads.mjs`. No application PDF-storage feature added.

## Fixture state and limits

Only synthetic local data was used. One new QA customer remains; its credentials are
in ignored `.local/m7-browser.env`. Two browser-created bookings remain canceled for
history verification. Final count: zero confirmed bookings, zero blocks. Original
Thursday 09:00–10:00 hours remain. Existing accounts/history were not deleted.

Not verified: physical mobile devices, screen-reader matrix, deployed HTTPS, Node 24,
or exhaustive WCAG conformance. Other browser tabs still require manual refresh.
PDFs remain dated snapshots, font coverage is finite, and offset pages can shift.
Final delivery/deployment work belongs to Milestone 8.
