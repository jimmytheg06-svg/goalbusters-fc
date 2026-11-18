// Pulls GoalBuster FC's 40+ team schedule/results/standings from our public
// D-Town Winter League 40 page on ClubVerse and writes them into the marked
// <!-- AUTO:...:START/END --> regions of index.html.
//
// ClubVerse renders match/standings data via a live Firestore listener, not
// in the initial HTML, so this needs a real browser (Playwright) rather than
// a plain HTTP fetch. Run with: node scripts/update-clubverse.mjs
//
// Fails loudly (non-zero exit) if the page structure doesn't match what we
// expect, rather than silently writing bad data — see assert() below.

import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const INDEX_HTML = path.join(ROOT, "index.html");

const TOURNAMENT_URL = "https://clubverseapp.com/t/d-town-winter-league-40-2026";
const OUR_DISPLAY_NAME = "GoalBuster FC";
const OUR_SHORT_TAG = "GB 40+";

// ClubVerse registration may carry the club's pre-rebrand name ("Goal
// Busters FC") or any spacing/casing variant of "GoalBuster FC" — match
// loosely on normalized text rather than a single exact string.
function normalize(s) {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}
function isUs(team) {
  return normalize(team).includes("goalbuster");
}

// Known opponent crests already hosted in this repo. Extend this as more
// opponents' logos are added — anything not listed here falls back to
// initials, which is safe. "D-Town FC White/Blue" and "Euless United" are
// the same real-world clubs that play in the sibling D-Town 40+ League, so
// these reuse North Texans Football Group's existing crest art.
const TEAM_LOGO = {
  "D-Town FC White": "crest-dtown-fc.png",
  "D-Town FC Blue": "crest-dtown-fc.png",
  "Euless United": "crest-euless-united.png",
};

function displayName(team) {
  if (isUs(team)) return OUR_DISPLAY_NAME;
  return team.replace(/\s+FC$/, "");
}

function initials(team) {
  return team
    .split(/\s+/)
    .filter((w) => !/^(FC|the)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function monoBadge(team) {
  if (isUs(team)) {
    return `<img src="https://res.cloudinary.com/dlm10vyhl/image/upload/v1779228594/GBlogo_clean_eyyjwe.png" alt="" loading="lazy" decoding="async" />`;
  }
  const logo = TEAM_LOGO[team];
  if (logo) {
    return `<img src="${logo}" alt="" loading="lazy" decoding="async" />`;
  }
  return initials(team);
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ClubVerse update aborted: ${message}`);
  }
}

// --- Text extraction -------------------------------------------------

async function getTournamentText(page) {
  // Not "networkidle": ClubVerse holds a long-polling Firestore connection
  // open indefinitely, so the network never actually goes idle.
  await page.goto(`${TOURNAMENT_URL}#matches`, { waitUntil: "domcontentloaded" });

  // Data loads via a live Firestore listener; wait for it to actually
  // populate rather than trusting networkidle alone.
  await page.waitForFunction(
    () => document.body.innerText.includes("MATCHES"),
    { timeout: 20000 }
  );

  const main = page.locator("main").first();

  if (process.env.DEBUG_IMAGES) {
    const imgInfo = await main.evaluate((el) =>
      Array.from(el.querySelectorAll("img")).map((img) => ({
        src: img.src,
        alt: img.alt,
        nearbyText: img.closest("div")?.textContent?.trim().slice(0, 60),
      }))
    );
    console.log("DEBUG images found on page:", JSON.stringify(imgInfo, null, 2));
  }

  // The fixture widget defaults to an "Upcoming" filter, which is also
  // where standings/player-stats/teams live (unaffected by the filter).
  const defaultText = await main.innerText();
  assert(/goalbuster/i.test(defaultText), 'no team matching "GoalBuster" found on page');

  // Completed results only appear after switching that filter — clicking
  // "Completed" specifically (rather than "All") has proven the more
  // reliable target in testing on the sibling D-Town 40+ League page.
  let completedText = "";
  try {
    const completedTab = page.locator("button", { hasText: "Completed" }).first();
    await completedTab.scrollIntoViewIfNeeded({ timeout: 10000 });
    await completedTab.click({ timeout: 10000 });
    await page.waitForTimeout(1200);
    completedText = await main.innerText();
  } catch (err) {
    console.warn('Could not switch to the "Completed" fixtures filter — completed results will be skipped.', err.message);
  }

  return { defaultText, completedText };
}

function splitLines(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

// --- Fixtures ----------------------------------------------------------

function parseFixtures(lines) {
  const fixtures = [];
  let currentDate = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const dateMatch = line.match(/^[A-Z]+,\s+([A-Z]{3})\s+(\d{1,2}),\s+(\d{4})$/);
    if (dateMatch) {
      currentDate = { month: dateMatch[1], day: Number(dateMatch[2]), year: Number(dateMatch[3]) };
      continue;
    }
    if (!currentDate) continue;

    // Completed: "FT" / TeamA / "12 - 3" / TeamB
    if (line === "FT" && lines[i + 1] && lines[i + 2] && lines[i + 3]) {
      const scoreMatch = lines[i + 2].match(/^(\d+)\s*-\s*(\d+)$/);
      if (scoreMatch) {
        fixtures.push({
          date: { ...currentDate },
          status: "completed",
          teamA: lines[i + 1],
          scoreA: Number(scoreMatch[1]),
          scoreB: Number(scoreMatch[2]),
          teamB: lines[i + 3],
        });
        i += 3;
        continue;
      }
    }

    // Upcoming: "7:00 AM" / TeamA / "vs" / TeamB
    const timeMatch = line.match(/^(\d{1,2}:\d{2}\s*(AM|PM))$/i);
    if (timeMatch && lines[i + 1] && lines[i + 2] === "vs" && lines[i + 3]) {
      fixtures.push({
        date: { ...currentDate },
        status: "upcoming",
        time: timeMatch[1].replace(/\s+/, " ").toUpperCase(),
        teamA: lines[i + 1],
        teamB: lines[i + 3],
      });
      i += 3;
      continue;
    }
  }

  return fixtures;
}

function fixtureDateValue(f) {
  const months = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
  return new Date(f.date.year, months[f.date.month], f.date.day).getTime();
}

function fixtureDateShort(f) {
  const month = f.date.month[0] + f.date.month.slice(1).toLowerCase();
  return `${month} ${f.date.day}`;
}

// --- Standings -----------------------------------------------------------

function parseStandingsTable(lines) {
  const idx = lines.indexOf("Standings");
  assert(idx !== -1, '"Standings" section not found');
  // The header row keeps its cells tab-joined on one line by innerText
  // (e.g. "#\tTEAM\tPL\t...\tPTS"), so match by substring, not equality.
  const headerIdx = lines.findIndex((l, i) => i > idx && l.includes("PTS"));
  assert(headerIdx !== -1, "standings header row not found");

  const rows = [];
  for (let i = headerIdx + 1; i < lines.length - 2; i++) {
    if (lines[i] === "Knockout Bracket" || lines[i] === "Advances to knockout bracket") break;
    // pattern: "1" (rank) / TeamName / "PL W D L GF GA GD PTS" (tab-joined)
    if (/^\d+$/.test(lines[i]) && lines[i + 1] && lines[i + 2]) {
      const stats = lines[i + 2].match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([+-]?\d+)\s+(\d+)$/);
      if (stats) {
        rows.push({
          rank: Number(lines[i]),
          team: lines[i + 1],
          pl: Number(stats[1]),
          w: Number(stats[2]),
          d: Number(stats[3]),
          l: Number(stats[4]),
          gf: Number(stats[5]),
          ga: Number(stats[6]),
          gd: stats[7],
          pts: Number(stats[8]),
        });
        i += 2;
      }
    }
  }
  assert(rows.length > 0, "no standings rows parsed");
  return rows;
}

// --- HTML generation -------------------------------------------------

function renderTicker({ completed, next }) {
  const recent = completed.slice(-6);

  const resultItem = (r) => {
    const won = r.us > r.them;
    const drew = r.us === r.them;
    const cls = won ? "score-win" : drew ? "score-draw" : "score-loss";
    const letter = won ? "W" : drew ? "D" : "L";
    return `<span><span class="score-team">${OUR_SHORT_TAG}</span> <span class="score-badge ${cls}">${letter}</span> ${r.us}–${r.them} ${displayName(r.opponent)}</span><span class="score-sep">|</span>`;
  };

  let items;
  if (recent.length) {
    items = recent.map(resultItem);
  } else if (next) {
    items = [
      `<span><span class="score-team">${OUR_SHORT_TAG}</span> <strong>Next:</strong>&nbsp;vs ${displayName(next.opponent)} &middot; ${fixtureDateShort(next.fixture)}, ${next.time}</span><span class="score-sep">|</span>`,
    ];
  } else {
    items = [
      `<span><span class="score-team">${OUR_SHORT_TAG}</span> D-Town Winter League 40 — schedule coming soon</span><span class="score-sep">|</span>`,
    ];
  }

  // CSS marquee loops via translateX(-50%), so the content must repeat
  // twice back-to-back for a seamless scroll.
  const once = items.join("\n    ");
  return `${once}\n    ${once}`;
}

function resultSide(team) {
  return `<div class="result-side">
              <div class="result-crest">${monoBadge(team)}</div>
              <div class="result-team">${displayName(team)}</div>
            </div>`;
}

function renderMatches({ last, next }) {
  const cards = [];

  if (last) {
    const won = last.us > last.them;
    const drew = last.us === last.them;
    const statusCls = won ? "" : drew ? " result-status--draw" : " result-status--loss";
    const statusLabel = won ? "✓ Win" : drew ? "– Draw" : "✗ Loss";
    cards.push(`<div class="result-card reveal">
          <div class="result-date">Last Result · ${fixtureDateShort(last.fixture)}</div>
          <div class="result-matchup">
            ${resultSide(OUR_DISPLAY_NAME)}
            <div class="result-score">${last.us}–${last.them}</div>
            ${resultSide(last.opponent)}
          </div>
          <div class="result-status${statusCls}">${statusLabel}</div>
        </div>`);
  }

  if (next) {
    cards.push(`<div class="result-card reveal">
          <div class="result-date">Next Match · ${fixtureDateShort(next.fixture)}, ${next.time}</div>
          <div class="result-matchup">
            ${resultSide(OUR_DISPLAY_NAME)}
            <div class="result-vs">VS</div>
            ${resultSide(next.opponent)}
          </div>
          <div class="result-status result-status--upcoming">Upcoming</div>
        </div>`);
  }

  if (!cards.length) {
    cards.push(`<div class="result-card reveal">
          <div class="result-date">D-Town Winter League 40</div>
          <div class="result-matchup">
            <div class="result-team">Schedule not yet released</div>
          </div>
          <div class="result-status result-status--upcoming">Check back soon</div>
        </div>`);
  }

  return cards.join("\n        ");
}

function renderStandingsTable(rows) {
  const trs = rows
    .map((r) => {
      const us = isUs(r.team);
      const rowCls = us ? ' class="standings-row--us"' : "";
      return `                <tr${rowCls}>
                  <td>${r.rank}</td>
                  <td>${displayName(r.team)}</td>
                  <td>${r.pl}</td>
                  <td>${r.w}</td>
                  <td>${r.d}</td>
                  <td>${r.l}</td>
                  <td>${r.gf}</td>
                  <td>${r.ga}</td>
                  <td>${r.gd}</td>
                  <td>${r.pts}</td>
                </tr>`;
    })
    .join("\n");
  return `<div class="standings-wrap reveal">
          <h3>D-Town Winter League 40 — Standings</h3>
          <div class="standings-scroll">
            <table class="standings-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Team</th>
                  <th>PL</th>
                  <th>W</th>
                  <th>D</th>
                  <th>L</th>
                  <th>GF</th>
                  <th>GA</th>
                  <th>GD</th>
                  <th>Pts</th>
                </tr>
              </thead>
              <tbody>
${trs}
              </tbody>
            </table>
          </div>
        </div>`;
}

function replaceMarked(html, marker, replacement) {
  const re = new RegExp(`(<!-- AUTO:${marker}:START -->)([\\s\\S]*?)(<!-- AUTO:${marker}:END -->)`);
  assert(re.test(html), `marker AUTO:${marker} not found in index.html`);
  return html.replace(re, `$1\n        ${replacement}\n        $3`);
}

// Same as replaceMarked, but for markers sitting inline mid-sentence (e.g.
// STANDING) — no surrounding newlines, which HTML would otherwise collapse
// into a stray space before any punctuation right after the marker.
function replaceMarkedInline(html, marker, replacement) {
  const re = new RegExp(`(<!-- AUTO:${marker}:START -->)([\\s\\S]*?)(<!-- AUTO:${marker}:END -->)`);
  assert(re.test(html), `marker AUTO:${marker} not found in index.html`);
  return html.replace(re, `$1${replacement}$3`);
}

// --- Main ------------------------------------------------------------

async function main() {
  const browser = await chromium.launch();
  // ClubVerse renders match times client-side from a stored UTC instant
  // using the browser's local timezone. Pin it to Central time so scraped
  // times match what fans see, regardless of the CI runner's OS timezone
  // (GitHub Actions runners default to UTC, which would shift times by
  // several hours — this exact bug was caught and fixed on the sibling
  // D-Town 40+ League scraper).
  const context = await browser.newContext({ timezoneId: "America/Chicago" });
  const page = await context.newPage();
  let defaultText, completedText;
  try {
    ({ defaultText, completedText } = await getTournamentText(page));
  } finally {
    await browser.close();
  }

  const lines = splitLines(defaultText);
  const allFixtures = [...parseFixtures(lines), ...(completedText ? parseFixtures(splitLines(completedText)) : [])];
  assert(allFixtures.length > 0, "no fixtures parsed from the page");

  const ourFixtures = allFixtures
    .filter((f) => isUs(f.teamA) || isUs(f.teamB))
    .map((f) => {
      const weAreA = isUs(f.teamA);
      const opponent = weAreA ? f.teamB : f.teamA;
      if (f.status === "completed") {
        return {
          status: "completed",
          fixture: f,
          opponent,
          us: weAreA ? f.scoreA : f.scoreB,
          them: weAreA ? f.scoreB : f.scoreA,
        };
      }
      return { status: "upcoming", fixture: f, opponent, time: f.time };
    });

  assert(ourFixtures.length > 0, 'no fixtures found for a team matching "GoalBuster"');

  const completed = ourFixtures.filter((f) => f.status === "completed").sort((a, b) => fixtureDateValue(a.fixture) - fixtureDateValue(b.fixture));
  const upcoming = ourFixtures.filter((f) => f.status === "upcoming").sort((a, b) => fixtureDateValue(a.fixture) - fixtureDateValue(b.fixture));

  const last = completed.length ? completed[completed.length - 1] : null;
  const next = upcoming.length ? upcoming[0] : null;

  const standingsRows = parseStandingsTable(lines).sort((a, b) => a.rank - b.rank);
  const ourStanding = standingsRows.find((r) => isUs(r.team));
  const standingText = ourStanding ? `${ordinal(ourStanding.rank)} in the 40+ Division` : "building our 2026 record";

  let html = await readFile(INDEX_HTML, "utf8");
  html = replaceMarked(html, "TICKER", renderTicker({ completed, next }));
  html = replaceMarkedInline(html, "STANDING", standingText);
  html = replaceMarked(html, "MATCHES", renderMatches({ last, next }));
  html = replaceMarked(html, "STANDINGS", renderStandingsTable(standingsRows));

  await writeFile(INDEX_HTML, html, "utf8");

  console.log("ClubVerse update applied:");
  console.log("  Last:", last ? `${last.us}-${last.them} vs ${last.opponent}` : "(none)");
  console.log("  Next:", next ? `vs ${next.opponent} (${next.time})` : "(none)");
  console.log("  Standing:", standingText);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
