# Venue Research Prompt — Camel Ranch Booking

Download this file and paste it into any AI assistant (ChatGPT, Claude, Gemini, etc.) to generate a ready-to-import venue list.

---

## STEP 1 — RESEARCH WITH AI

Copy the prompt below, fill in your market details, and paste it into your AI.

---

### PROMPT

> Copy from here ↓

---

I need you to research live music venues in **[CITY, STATE]** for a **[GENRE]** act.  
Focus on venues that regularly book **[touring / local / both]** acts.  
Capacity range I'm targeting: **[e.g., 150–600 cap]**.

For each venue, find as much of the following as possible. If a field is unknown, write `—`.

Return results as a **markdown table** with exactly these column headers (copy them exactly):

```
| # | Venue Name | Address | City | State | Phone | Type | Capacity | Contact Name | Contact Title | Booking Email | Website | Notes |
```

#### Field definitions

| Column | What to put |
|---|---|
| **Venue Name** | Full official name |
| **Address** | Street address only (no city/state) |
| **City** | City name |
| **State** | Two-letter abbreviation |
| **Phone** | Main venue phone |
| **Type** | One of: `bar`, `club`, `theater`, `brewery`, `restaurant`, `event_space`, `arena`, `other` |
| **Capacity** | Single number — standing cap preferred |
| **Contact Name** | Person who handles band bookings |
| **Contact Title** | e.g. `Talent Buyer`, `Booking Manager`, `Owner` |
| **Booking Email** | Direct booking email — most important field |
| **Website** | Full URL with https:// — required for web enrichment later |
| **Notes** | Genre fit, deal structure (door vs guarantee), load-in info, any flags like "possibly closed" |

#### Research tips

- Check the venue's own website `/contact`, `/booking`, `/live-music`, `/about` pages first
- Check Bandsintown and Songkick for recent show listings (confirms still booking)
- Check Google Maps for phone and hours
- Check Facebook / Instagram bio for booking email
- Booking emails often follow patterns: `booking@`, `talent@`, `shows@`, `live@` + domain
- Capacity is often on the About page, their liquor license, or Wikipedia
- If a venue is part of a chain or Live Nation / AEG managed, note it — booking process is different

#### After the table, add a section:

**⚠️ Verify Before Outreach** — list any venues you couldn't confirm are still open or actively booking.

---

> End of prompt ↑

---

## STEP 2 — IMPORT INTO THE PLATFORM

1. Log in to Camel Ranch Booking
2. Go to **Venues** in the left menu
3. Click **⬆ Bulk Import** (top right of the Venues page)
4. Paste the markdown table the AI returned
5. Click **Parse** — the system shows you a preview of all venues
6. Uncheck any you want to skip
7. Click **Import Venues** — done

Venues that already exist in your database will be **updated** with the new info, not duplicated.

---

## STEP 3 — WEB SCRAPE (optional, run per tour)

The platform can scrape each venue's website to pull deeper booking contact info automatically — phone extensions, booking manager names, submission forms, etc.

**Important:** Scraping uses AI tokens and costs money at scale. For that reason, scraping is intentionally triggered **per tour, not in bulk**. Once you've added venues to a tour's outreach pool, you can run the scraper on individual venues directly from the tour detail page.

**For best scrape results, make sure the Website column is filled in.** Venues without a website URL will be skipped.

The scraper looks at:
- `/contact`, `/about`, `/booking`, `/book`, `/events`, `/live-music`, `/entertainment`
- Extracts: booking email, booking contact name & title, phone, capacity, venue type, notes

---

## FIELD REFERENCE

| Field | Where it appears in the platform |
|---|---|
| Venue Name | Venue profile + tour outreach pool |
| Address | Venue modal + booking advance sheet |
| Phone | Clickable tel: link in venue modal |
| Type | Filter in venue list |
| Capacity | "cap 260" chip in tour pool |
| Contact Name | Contacts tab on venue profile; pre-fills email To: field |
| Booking Email | Clickable mailto: with contact name pre-filled |
| Website | Linked in venue modal; used by the web scraper |
| Notes | Shown in tour venue modal |

---

## TIPS FOR ACCURACY

- The AI works best when you give it a **specific genre** — a country act and a metal act book very different venues in the same city
- Run one city/market at a time — results are more accurate than asking for a whole state
- If the AI fills in `—` for Booking Email on most venues, ask it to do a second pass focused only on finding emails for those specific venues
- Cross-check any "possibly closed" venues on Google Maps before adding them to a tour
- Re-run the research every 6–12 months — venues change ownership and booking contacts often

---

*Camel Ranch Booking — camelranchbooking.com*
