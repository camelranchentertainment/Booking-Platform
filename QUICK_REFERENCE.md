# Camel Ranch Booking - Quick Reference Card

## 🚀 Getting Started (First Time)

1. **Set up Supabase**
   ```bash
   # 1. Create account at supabase.com
   # 2. Create new project "camel-ranch-booking"
   # 3. Go to SQL Editor, paste contents of database/schema.sql
   # 4. Click "Run"
   # 5. Get API keys from Settings → API
   ```

2. **Set up SerpAPI**
   ```bash
   # 1. Sign up at serpapi.com (100 free searches/month)
   # 2. Copy API key from dashboard
   ```

3. **Configure Environment Variables**
   ```bash
   # Copy .env.local and fill in your keys
   cp .env.local .env.local.mine
   # Edit .env.local with your real keys
   ```

4. **Install and Run**
   ```bash
   npm install
   npm run dev
   # Open http://localhost:3000
   ```

---

## 📋 Common Commands

```bash
# Development
npm run dev              # Start dev server (http://localhost:3000)
npm run build            # Build for production
npm start                # Run production build
npm run lint             # Check code quality

# Database
# All database operations done via Supabase dashboard UI
# or through the app's API routes
```

---

## 🎯 Common Workflows

### Discover New Venues
1. Navigate to "Venue Discovery"
2. Enter city/state (e.g., "Fayetteville, AR")
3. Click "Add Region" (can queue multiple)
4. Click "Start Venue Discovery"
5. System automatically:
   - Searches Google for venues
   - Visits websites
   - Extracts contact info
   - Saves to database
   - Skips duplicates

### Create a Booking
1. Find venue in "Venue Database"
2. Click "Create Booking"
3. Fill in details:
   - Date & time
   - Contact person info
   - Payment terms (flat/door split/percentage)
   - Deposit amount
4. After gig, update with:
   - Actual attendance
   - Final payment
   - Rating & feedback

### Send Email Campaign
1. Go to "Campaigns"
2. Create new campaign
3. Select email template
4. Add venues to campaign
5. Review and send
6. Track opens/responses

---

## 📊 Database Tables Quick Ref

**venues** - All discovered/added venues
- Fields: name, city, state, email, phone, website, booking_contact
- Status: not_contacted, awaiting_response, responded, booked, declined

**bookings** - Confirmed gigs
- Fields: date, time, contact_name, pay_amount, pay_type
- Post-gig: attendance, rating, would_return, feedback

**campaigns** - Email outreach campaigns
- Fields: name, target_regions, email_template
- Stats: contacted, responses, bookings

**email_templates** - Reusable templates
- Variables: {{venue_name}}, {{city}}, {{booking_contact}}, {{season}}

---

## 🔑 Environment Variables

```env
# Required
NEXT_PUBLIC_SUPABASE_URL=        # From Supabase Settings → API
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # From Supabase Settings → API
SERP_API_KEY=                     # From serpapi.com

# For Email (optional, can add later)
MICROSOFT_CLIENT_ID=              # From Azure portal
MICROSOFT_CLIENT_SECRET=          # From Azure portal
MICROSOFT_TENANT_ID=              # From Azure portal
```

---

## 🛠️ Troubleshooting

**No venues found?**
→ Check SerpAPI monthly limit (100 free searches)
→ Try different city names or widen radius

**Supabase errors?**
→ Verify schema.sql was run in SQL Editor
→ Check API keys in .env.local

**Duplicates still appearing?**
→ System matches on name + city (case-insensitive)
→ Slightly different names = separate entries

**Email not sending?**
→ Microsoft Graph API setup required (see SETUP_GUIDE.md)

---

## 📁 Important Files

```
.env.local                        # YOUR API KEYS (never commit!)
database/schema.sql               # Database structure
lib/venueScraperEnhanced.ts      # Web scraping logic
pages/api/venues/discover.ts     # Venue search API
pages/api/bookings.ts            # Booking CRUD API
components/BookingForm.tsx       # Full booking form
SETUP_GUIDE.md                   # Detailed setup instructions
```

---

## 🎸 Venue Search Criteria

The system automatically filters for:
- **Capacity**: 50-500 people
- **Venue Types**: bar, saloon, pub, club, dancehall
- **Must mention**: "live music"
- **Contact Info Extracted**: emails, phones, booking contact names

---

## 💾 Data Backup

**Export Venues:**
```javascript
// In browser console on Venue Database page
const venues = await fetch('/api/venues').then(r => r.json());
console.log(JSON.stringify(venues, null, 2));
// Copy and save to file
```

**Export Bookings:**
```javascript
// In browser console
const bookings = await fetch('/api/bookings').then(r => r.json());
console.log(JSON.stringify(bookings, null, 2));
// Copy and save to file
```

---

## 📞 Support Resources

- **Supabase Docs**: https://supabase.com/docs
- **SerpAPI Docs**: https://serpapi.com/search-api
- **Next.js Docs**: https://nextjs.org/docs
- **Full Setup Guide**: See `SETUP_GUIDE.md`

---

## ⚡ Quick Tips

1. **Search in batches** - Add 3-5 regions at once for efficiency
2. **Regular backups** - Export your data monthly
3. **Track everything** - Fill in booking details immediately after shows
4. **Review duplicates** - Check database weekly for duplicate entries
5. **Update contacts** - When contact info changes, update immediately

---

**Last Updated**: January 2026
**Version**: 1.0
**Built for**: Better Than Nothin' 🎸
