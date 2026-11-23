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

## League Automation (40+ and 35+)
- The topbar ticker (combined across both teams), the "Recent Results" cards, and the league standings tables are pulled automatically every Sunday from ClubVerse (`scripts/update-clubverse.mjs` + `.github/workflows/update-clubverse.yml`), same pattern as North Texans Football Group's site. Each league is configured in the `LEAGUES` array in the script — add a new entry there (url, label, division, shortTag) plus matching `AUTO:MATCHES_<id>`/`AUTO:STANDINGS_<id>`/`AUTO:STANDING_<id>` markers in `index.html` to add another team/division later.
  - 40+ Division — D-Town Winter League 40: https://clubverseapp.com/t/d-town-winter-league-40-2026
  - 35+ Division — DFW Himalaya's Sunday League 35: https://clubverseapp.com/t/dfw-himalayas-fc-sunday-league-35-2026
- The cron (Sunday 1pm CDT) is a guess based on the sibling D-Town 40+ League's schedule — confirm the actual match day/time for both leagues and adjust the cron in the workflow if either is different. If their match days differ from each other, this single weekly run still covers both (it just reflects whatever's latest on ClubVerse at run time for each).
- Opponent crests are pulled automatically from each league's own ClubVerse page (every club has a logo there) — see `buildPageLogoMap()` in the script. The local `TEAM_LOGO` map is only a last-resort fallback.
- If the automation ever fails, it opens a GitHub Issue automatically rather than touching the live site — check Issues if the results look stale. A failure on either league blocks the whole run (both leagues update together or not at all), so a broken 35+ page would also leave 40+ results stale until fixed.
