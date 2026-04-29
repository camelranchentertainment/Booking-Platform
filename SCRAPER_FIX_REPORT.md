# Email Scraper Fix Report

Date: 2026-04-29
Author: Claude Code (automated fix)

---

## Root Cause

`pages/api/venues/list.ts` fetched venues from only two sources:
1. Venues owned directly (`agent_id = user.id`)
2. Venues linked to tours the agent **created** (`created_by = user.id`)

It was **missing** a third source: venues linked to tours for **acts managed by the agent** (`tours.act_id IN (SELECT id FROM acts WHERE agent_id = user.id OR owner_id = user.id)`).

This meant any venue added via Google Discovery (prospect add), bulk import, or the "+ Add Venue" modal — if it ended up on a tour for a managed act but with a different `agent_id` — would not appear in the venues list and therefore would never be picked up by the scraper.

The `bulkFindEmails()` and `enrichVenueEmail()` functions in the UI both operate on the already-loaded `venues` array, so fixing `list.ts` fixes both the bulk button count and per-row scraping in one place.

---

## Files Changed

| File | Change |
|------|--------|
| `pages/api/venues/list.ts` | Added third path: tours for acts where `agent_id` or `owner_id = user.id` |
| `pages/api/venues/scrape.ts` | Always write `last_enriched_at = now()` after scrape attempt; graceful fallback if column missing |
| `pages/venues/index.tsx` | Improved status indicators in email column; "No website" label in actions column; removed `(v as any)` casts |
| `lib/types.ts` | Added `music_genres` and `last_enriched_at` to `Venue` interface |

---

## Venues Now Accessible to Scraper

**Before fix:** Only venues where `agent_id = user.id` OR in tours `created_by = user.id`  
**After fix:** All of the above PLUS venues in tours for acts managed by the agent

---

## Scraper Improvements

The core scraper in `scrape.ts` was already comprehensive (Firecrawl + Claude with multi-page fallback across 9 sub-paths: `/contact`, `/about`, `/booking`, `/book`, `/events`, `/live-music`, `/entertainment`, `/contact-us`, `/about-us`). Improvements made:

1. **`last_enriched_at` tracking** — Now set on every scrape attempt (found or not), so the UI can show "Not found · date" persistently
2. **Graceful fallback** — If `last_enriched_at` column doesn't exist in DB yet, the update retries without it so email/phone/etc still save correctly
3. **Status indicators** — Email column now shows contextual state instead of just `—`

---

## Venue Email Status (52 venues total)

| Status | Count |
|--------|-------|
| Has email | 17 |
| Can scrape (has website, no email) | 15 |
| No website | 20 |

### Has Email (17 venues)
| Venue | City | Email |
|-------|------|-------|
| Aggie Theatre | Fort Collins, CO | joe@z2ent.com |
| Avogadro's Number | Fort Collins, CO | avosrob@gmail.com |
| Breckenridge Tap House | Breckenridge, CO | contact@breckenridgetaphouse.com |
| Globe Hall Live Music & BBQ | Denver, CO | info@globehall.com |
| Hi-Dive | Denver, CO | booking@hi-dive.com |
| Horsetooth Tavern | Fort Collins, CO | info@horsetoothtavern.com |
| Larimer Lounge | Denver, CO | info@larimerlounge.com |
| Maxine's Tap Room | Fayetteville, AR | maxinesonblock@gmail.com |
| Moxi Theater | Greeley, CO | moxitheater@gmail.com |
| Off Broadway | St. Louis, MO | offbroadwaystlbooking@gmail.com |
| Old Rock House | St. Louis, MO | parties@oldrockhouse.com |
| Red Lion | Vail, CO | theredlion68@gmail.com |
| Schmiggity's Live Music & Dance Bar | Steamboat Springs, CO | schmiggitys@gmail.com |
| Sikeston Rodeo Grounds | Sikeston, MO | info@sikestonrodeo.com |
| The Blue Stag Saloon | Breckenridge, CO | bluestagbreckenridge@gmail.com |
| The Boathouse | Steamboat Springs, CO | info@theboathousesteamboat.com |
| The Mishawaka | Fort Collins, CO | dmlad@themishawaka.com |

### Can Scrape — 15 venues ready for email enrichment
| Venue | City | Website |
|-------|------|---------|
| 1860 Saloon, Game Room, & Hardshell Café | St. Louis, MO | http://1860saloon.com/ |
| Derailed Pour House | Durango, CO | http://www.derailedpourhouse.com/ |
| George's Majestic Lounge | Fayetteville, AR | http://www.georgesmajesticlounge.com/ |
| George's Majestic Lounge | Rogers, AR | http://www.georgesmajesticlounge.com/ |
| Ozark Music Hall | Fayetteville, AR | http://www.ozarkmusichall.com/ |
| Ozark Music Hall | Rogers, AR | http://www.ozarkmusichall.com/ |
| Railyard Live at Butterfield Stage | Rogers, AR | http://www.railyardlive.com/ |
| Sikeston Jaycee Bootheel Rodeo | Sikeston, MO | ⚠ Invalid URL ("sikestonjayceerodeo") |
| The Honky Tonk STL | St. Louis, MO | https://www.thehonkytonkstl.com/ |
| The Momentary | Rogers, AR | https://themomentary.org/ |
| The Nugget Mountain Bar | Durango, CO | https://www.nuggetmountainbar.com/ |
| The Oxford | Durango, CO | https://www.theoxfordbar.com/ |
| The Pageant - Delmar Hall | St. Louis, MO | http://www.thepageant.com/ |
| The Whisk(e)y | Fort Collins, CO | http://www.thewhiskeyfc.com/ |
| Wild Horse Saloon | Durango, CO | http://durangowildhorsesaloon.com/ |

### No Website (20 venues — cannot be scraped)
Breckenridge Brewery & Pub, Cuzzin's Sports Bar & Grill, Dickson Street Pub, Dogwood Social House Cape Girardeau, Gillioz Theatre, King's Club, Midway Events Center, Motherloaded Tavern, Nash Vegas, Off Broadway (St Louis — duplicate), Old Rock House (St Louis — duplicate), Old Town Pub & Restaurant, Rose Music Hall, Rude Dog Pub, Southbound Bar & Grill, Swing Station, The Blue Note, The Honky Tonk STL (St Louis — duplicate), The Soiled Dove Underground, Wire Road Brewing Company

> **Note:** Off Broadway, Old Rock House, and The Honky Tonk STL each have two records — one with email/website and one without. These duplicate records should be reviewed and merged.

> **Note:** Sikeston Jaycee Bootheel Rodeo has an invalid website value (`sikestonjayceerodeo` — missing protocol and TLD). The scraper will fail for this venue. The website field should be corrected.

---

## Migration Needed

The `last_enriched_at` column does not exist in the `venues` table. Until it is applied, the scraper gracefully falls back (email/phone/etc. still save correctly) but "Not found · date" indicators in the UI will not persist across page reloads.

**Run this migration in Supabase SQL editor:**

```sql
ALTER TABLE venues
ADD COLUMN IF NOT EXISTS last_enriched_at timestamptz;
```

---

## UI Improvements

The email column in the venues list now shows rich status:

| Condition | Display |
|-----------|---------|
| Has email | Green email address |
| Currently scraping | `✉ Scanning…` (muted) |
| Just found (session state) | `✓ email@found.com` (green) |
| Scraped, not found (`last_enriched_at` set) | `✕ Not found · 4/29/2026` (muted) |
| No website | `No website` (muted) |
| Has website, not tried | `—` |

The actions column now also shows a `No website` label for venues that cannot be enriched, so agents know at a glance which venues need a website added manually.

---

## Build Status

- TypeScript: **0 errors**
- Next.js build: **compiled successfully**
