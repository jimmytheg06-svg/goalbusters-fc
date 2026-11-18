# Site Backlog

Tracked items from ongoing site work. Nothing here gets fixed until it's explicitly prioritized.

## Content (stale)
- "Annual Club Picnic — Dates TBD" news card has been unresolved since it was added — get a real date or remove it.

## Cleanup
- Unused image files in the repo root (`crest.png`, `dtown-cup-2026.jpg`, `team-40plus.jfif`, ~1MB total) — live site pulls everything from Cloudinary instead, safe to delete.

## Goalbuster Cup 2026
- "Register Interest" currently scrolls to the generic contact form (name/email/"I want to..." dropdown + free-text message). Consider a dedicated registration form with team name, division (Open/35+/40+), and roster size for structured signups instead of free text.
- No confirmed team/sponsor list yet — add one near the flyer once teams/sponsors beyond Urban InfraConstruction are confirmed.
- Google Analytics tag is already on the page but nothing tracks clicks on "Register Interest" / "Sponsor Inquiries" — add event tracking to measure actual interest before the tournament.

## Later (post-tournament)
- Move the Goalbuster Cup section back down (e.g. after Team) once the tournament has passed and it's no longer the priority push.

## 40+ League Automation
- The topbar ticker, "Recent Results" cards, and league standings table are now pulled automatically every Sunday from ClubVerse (`scripts/update-clubverse.mjs` + `.github/workflows/update-clubverse.yml`), same pattern as North Texans Football Group's site. Source: https://clubverseapp.com/t/d-town-winter-league-40-2026
- The cron (Sunday 1pm CDT) is a guess based on the sibling D-Town 40+ League's schedule — confirm the actual match day/time for the Winter League and adjust the cron in the workflow if it's different.
- If the automation ever fails, it opens a GitHub Issue automatically rather than touching the live site — check Issues if the results look stale.
