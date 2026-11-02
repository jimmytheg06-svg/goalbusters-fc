# Site Backlog

Tracked items from ongoing site work. Nothing here gets fixed until it's explicitly prioritized.

## Content (stale)
- Recent Results section still only shows Week 1–3 (unchanged since June) — refresh with current results.
- Scores ticker at the top of the page loops the same old Week 1–3 results — same fix as above.
- "Annual Club Picnic — Dates TBD" news card has been unresolved since it was added — get a real date or remove it.

## Cleanup
- Unused image files in the repo root (`crest.png`, `dtown-cup-2026.jpg`, `team-40plus.jfif`, ~1MB total) — live site pulls everything from Cloudinary instead, safe to delete.
- Pre-existing bug in the photo gallery lightbox: the click-outside-to-close handler binds to `#lightbox` before that element exists in the DOM, so it silently fails. One-line fix (move the script after the element, or wrap in DOMContentLoaded).

## Goalbuster Cup 2026
- "Register Interest" currently scrolls to the generic contact form (name/email/"I want to..." dropdown + free-text message). Consider a dedicated registration form with team name, division (Open/35+/40+), and roster size for structured signups instead of free text.
- No confirmed team/sponsor list yet — add one near the flyer once teams/sponsors beyond Urban InfraConstruction are confirmed.
- Google Analytics tag is already on the page but nothing tracks clicks on "Register Interest" / "Sponsor Inquiries" — add event tracking to measure actual interest before the tournament.

## Later (post-tournament)
- Move the Goalbuster Cup section back down (e.g. after Team) once the tournament has passed and it's no longer the priority push.
