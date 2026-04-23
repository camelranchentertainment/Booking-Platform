# Venue Research Prompt — Camel Ranch Booking

Download this file and paste it (along with your city/region) into any AI assistant (ChatGPT, Claude, Gemini, etc.) to generate a ready-to-import venue list.

---

## HOW TO USE

1. Copy everything in the **PROMPT** section below
2. Paste it into your AI chat
3. Fill in the blanks (market, genre, etc.)
4. The AI will return a completed table you can hand back to your booking agent or paste into the Supabase import script

---

## PROMPT

> Copy from here ↓

---

I need you to research live music venues in **[CITY, STATE]** for a **[GENRE]** act.  
Focus on venues that regularly book **[touring / local / both]** acts.  
Capacity range I'm targeting: **[e.g., 150–600 cap]**.

For each venue, find as much of the following as possible. If a field is unknown, write `—`.

### Fields needed per venue

| Field | Notes |
|---|---|
| **Venue Name** | Full official name |
| **Address** | Street address including suite/floor if relevant |
| **City** | |
| **State** | Two-letter abbreviation |
| **Zip Code** | If available |
| **Phone** | Main venue phone number |
| **Venue Type** | One of: `bar`, `club`, `theater`, `brewery`, `restaurant`, `event_space`, `arena`, `festival_grounds`, `other` |
| **Capacity** | Approximate standing or seated cap — use a single number |
| **Booking Contact Name** | Person who handles band bookings (not GM, not door staff) |
| **Booking Contact Title** | e.g. "Talent Buyer", "Booking Manager", "Owner" |
| **Booking Email** | Direct booking email if findable |
| **General / Info Email** | Fallback email if no booking-specific one |
| **Website** | Full URL including https:// |
| **Notes** | Anything useful: load-in info, typical deal structure (door vs. guarantee), genre fit, "verify — possibly closed", booking submission process, etc. |

---

### Output format

Return the results as a **markdown table** with one row per venue, using exactly these column headers:

```
| # | Venue Name | Address | City | State | Zip | Phone | Type | Capacity | Contact Name | Contact Title | Booking Email | General Email | Website | Notes |
```

After the table, list any venues you're **uncertain about** (possibly closed, couldn't verify, etc.) in a separate section called `⚠️ Verify Before Outreach`.

---

### Research tips for the AI

- Check the venue's own website first for a booking/contact page
- Check Bandsintown, Songkick, and Pollstar for active show listings (confirms they're still booking)
- Check Google Maps for phone and address
- Check Facebook / Instagram for contact info in the bio
- For booking emails, look for patterns like `booking@`, `talent@`, `shows@`, `live@` + the domain
- Capacity can often be found on the venue's About page, their liquor license filing, or Wikipedia
- Note if a venue is part of a chain or managed by a larger promoter (Live Nation, AEG, etc.) — those have different booking processes

---

### Example of a completed row

| # | Venue Name | Address | City | State | Zip | Phone | Type | Capacity | Contact Name | Contact Title | Booking Email | General Email | Website | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Hi-Dive | 7 S Broadway | Denver | CO | 80209 | (303) 733-0230 | bar | 260 | Curt | Talent Buyer | curt@hi-dive.com | booking@hi-dive.com | https://hi-dive.com | Baker neighborhood rock club since 2003. Accepts unsolicited booking inquiries via email. |

---

> End of prompt ↑

---

## AFTER YOU GET THE RESULTS

Once the AI returns the completed table, you have two options:

### Option A — Email it to your booking agent
Forward the markdown table as-is. They can import it into the platform using the SQL import template.

### Option B — Paste it back into AI to generate the SQL
Paste the completed table back into a new AI chat with this follow-up prompt:

> Using the venue table below, write a PostgreSQL `DO $$ ... $$` block that inserts each venue into a `venues` table and each contact into a `contacts` table. Use this exact structure for each venue:
>
> ```sql
> INSERT INTO venues (agent_id, name, address, city, state, phone, email, venue_type, capacity, website, notes, source, country)
> SELECT v_uid, '[name]', '[address]', '[city]', '[state]', '[phone]', '[email]', '[type]', [capacity], '[website]', '[notes]', 'import', 'US'
> WHERE NOT EXISTS (SELECT 1 FROM venues WHERE agent_id = v_uid AND lower(name) = lower('[name]') AND lower(city) = lower('[city]'));
> ```
>
> Wrap everything in a `DO $$ DECLARE v_uid uuid; BEGIN ... END $$;` block.  
> Set `v_uid` by looking up the agent email: `SELECT id INTO v_uid FROM auth.users WHERE email = '[AGENT EMAIL]' LIMIT 1;`  
> For contacts, use: `INSERT INTO contacts (agent_id, venue_id, first_name, last_name, title, email, status)`  
> [paste your completed venue table here]

---

## FIELD REFERENCE

| Field | Where it goes in the platform |
|---|---|
| Venue Name | Venue profile title |
| Address | Shown in venue modal + booking details |
| Phone | Clickable tel: link in venue modal |
| Type | Filter/sort in venue list |
| Capacity | Shown as "cap 260" chip in tour outreach pool |
| Contact Name | Contacts tab on venue profile; pre-fills email To: field |
| Contact Email | Clickable mailto: link; auto-populates "First Last \<email\>" |
| General Email | Stored as venue primary email |
| Website | Linked in venue modal |
| Notes | Shown in venue modal; visible when clicking venue in tour pool |

---

*Camel Ranch Booking — camelranchbooking.com*
