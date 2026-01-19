# Camel Ranch Booking Platform - Complete Setup Guide

## Overview
This is a Next.js application for discovering live music venues, tracking bookings, managing campaigns, and automating outreach for Better Than Nothin' band.

## Core Features
✅ **Automated Venue Discovery** - Web scraping + search APIs
✅ **Contact Extraction** - Emails, phones, booking contacts
✅ **Duplicate Prevention** - Smart database deduplication
✅ **Campaign Management** - Kanban-style booking boards
✅ **Email Automation** - Template-based outreach
✅ **Comprehensive Booking Tracking** - Pay, time, contacts, feedback
✅ **Database Storage** - PostgreSQL via Supabase

---

## Prerequisites

### Required Accounts
1. **Supabase** (free tier) - https://supabase.com
2. **SerpAPI** (100 free searches/month) - https://serpapi.com
3. **Microsoft Azure** (for Outlook integration) - https://portal.azure.com
4. **Vercel** (for deployment, optional) - https://vercel.com

### Required Software
- Node.js 18+ 
- npm or yarn
- Git

---

## Setup Instructions

### Step 1: Clone and Install

```bash
cd camel-ranch-booking
npm install
```

### Step 2: Supabase Database Setup

1. **Create Supabase Project**
   - Go to https://supabase.com
   - Click "New Project"
   - Name it "camel-ranch-booking"
   - Set a strong database password
   - Wait for provisioning (~2 minutes)

2. **Run Database Schema**
   - In Supabase dashboard, go to "SQL Editor"
   - Open `/database/schema.sql` from this project
   - Copy the entire contents
   - Paste into SQL Editor
   - Click "Run"
   - Verify tables were created in "Table Editor"

3. **Get API Keys**
   - In Supabase dashboard → Settings → API
   - Copy "Project URL" → This is `NEXT_PUBLIC_SUPABASE_URL`
   - Copy "anon public" key → This is `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Step 3: SerpAPI Setup

1. **Get API Key**
   - Go to https://serpapi.com
   - Sign up (free tier gives 100 searches/month)
   - Dashboard → API Key
   - Copy your API key → This is `SERP_API_KEY`

### Step 4: Microsoft Graph API Setup (for Email)

1. **Register Application**
   - Go to https://portal.azure.com
   - Navigate to "Microsoft Entra ID" (formerly Azure AD)
   - Click "App registrations" → "New registration"
   - Name: "Camel Ranch Booking"
   - Supported account types: "Personal Microsoft accounts only"
   - Redirect URI: `http://localhost:3000/api/auth/callback`
   - Click "Register"

2. **Get Client Credentials**
   - Copy "Application (client) ID" → `MICROSOFT_CLIENT_ID`
   - Copy "Directory (tenant) ID" → `MICROSOFT_TENANT_ID`
   - Go to "Certificates & secrets"
   - Click "New client secret"
   - Description: "Development"
   - Expires: 24 months
   - Copy the VALUE (not ID) → `MICROSOFT_CLIENT_SECRET`

3. **Configure API Permissions**
   - Go to "API permissions"
   - Click "Add a permission"
   - Choose "Microsoft Graph"
   - Choose "Delegated permissions"
   - Add these permissions:
     - `Mail.Send`
     - `Mail.ReadWrite`
     - `User.Read`
   - Click "Grant admin consent"

### Step 5: Environment Variables

1. **Create `.env.local` file** in project root:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# SerpAPI
SERP_API_KEY=your-serpapi-key

# Microsoft Graph
MICROSOFT_CLIENT_ID=your-client-id
MICROSOFT_CLIENT_SECRET=your-client-secret
MICROSOFT_TENANT_ID=your-tenant-id
MICROSOFT_REDIRECT_URI=http://localhost:3000/api/auth/callback

NODE_ENV=development
PORT=3000
```

### Step 6: Run Development Server

```bash
npm run dev
```

Open http://localhost:3000

---

## Usage Guide

### 1. Discovering Venues

1. Go to "Venue Discovery" page
2. Enter cities and states to search (e.g., "Fayetteville, AR")
3. Set search radius (default 25 miles)
4. Click "Add Region" (can add multiple)
5. Click "Start Venue Discovery"
6. Wait for automated search (scrapes web, extracts contacts)
7. View results: new venues vs duplicates

**What Happens Behind the Scenes:**
- Searches Google for live music venues in region
- Filters by venue type (bar, saloon, pub, club, dancehall)
- Visits venue websites to extract:
  - Email addresses
  - Phone numbers
  - Booking contact names
- Checks for duplicates before adding to database
- Saves all data to Supabase

### 2. Managing Venues

1. Go to "Venue Database" page
2. View all discovered venues
3. Filter by:
   - Contact status (not_contacted, awaiting_response, booked, etc.)
   - City/State
   - Venue type
4. Click venue to:
   - Update contact information
   - Add notes
   - Change status
   - Create booking

### 3. Creating Campaigns

1. Go to "Campaigns" page
2. Click "New Campaign"
3. Name your campaign (e.g., "Spring 2025 Tour")
4. Select email template
5. Add target regions
6. Add venues to campaign
7. Send bulk emails (uses your Outlook account)

### 4. Tracking Bookings

When you book a gig:

1. Click "Create Booking" on venue
2. Fill in:
   - **Date & Time**: When you're playing
   - **Contact Info**: Who booked you (name, title, email, phone)
   - **Payment Details**:
     - Pay type (flat fee, door split, percentage, tips, free)
     - Amount
     - Deposit info
   - **Post-Performance** (fill after gig):
     - Actual attendance
     - Final payment received
     - Performance rating (1-5 stars)
     - Would return? (Yes/No)
     - Venue feedback
     - Internal notes
     - Comments

All data is stored and can be:
- Filtered by date range
- Exported to CSV
- Analyzed for trends

### 5. Email Automation

1. Create email templates with variables:
   - `{{venue_name}}`
   - `{{city}}`
   - `{{booking_contact}}`
   - `{{season}}`
2. Assign template to campaign
3. Send emails to all campaign venues
4. Track opens, clicks, responses

---

## Database Schema

### Tables

**venues** - All discovered venues
- Basic info: name, address, city, state, phone
- Contact: email, secondary emails, booking contact
- Metadata: venue type, capacity, live music status
- Tracking: contact status, last contacted, notes

**bookings** - Actual gigs
- Performance: date, start time, end time, duration
- Contact: name, title, phone, email
- Payment: amount, type, percentage, deposit, final payment
- Feedback: attendance, rating, would return, notes

**campaigns** - Outreach campaigns
- Info: name, description, status, target regions
- Stats: total venues, contacted, responses, bookings

**email_templates** - Reusable email templates
- Template: subject, body, variables

**email_logs** - Email tracking
- Tracking: sent, opened, clicked, responded
- Response: type, notes

**search_regions** - Search history
- Region: city, state, radius
- Stats: venues found, last searched

**search_queue** - Background search processing
- Status: pending, in_progress, completed, failed

---

## API Routes

### Venues
- `POST /api/venues/discover` - Search for venues in region
- `GET /api/venues` - List all venues (with filters)
- `PUT /api/venues/[id]` - Update venue
- `DELETE /api/venues/[id]` - Delete venue

### Bookings
- `GET /api/bookings` - List all bookings
- `POST /api/bookings` - Create new booking
- `PUT /api/bookings` - Update booking
- `DELETE /api/bookings` - Delete booking

### Campaigns
- `GET /api/campaigns` - List campaigns
- `POST /api/campaigns` - Create campaign
- `PUT /api/campaigns/[id]` - Update campaign

### Emails
- `POST /api/emails/send` - Send emails via Outlook

---

## Deployment to Vercel

### Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/yourusername/camel-ranch-booking.git
git push -u origin main
```

### Step 2: Deploy on Vercel

1. Go to https://vercel.com
2. Click "New Project"
3. Import your GitHub repository
4. Add environment variables:
   - All vars from `.env.local`
5. Update Microsoft redirect URI to:
   - `https://your-app.vercel.app/api/auth/callback`
6. Deploy!

---

## Troubleshooting

### Issue: "SERP_API_KEY not configured"
**Fix:** Add `SERP_API_KEY` to `.env.local` and restart dev server

### Issue: Supabase connection error
**Fix:** 
1. Check `NEXT_PUBLIC_SUPABASE_URL` is correct
2. Check `NEXT_PUBLIC_SUPABASE_ANON_KEY` is correct
3. Verify database schema was run in Supabase SQL Editor

### Issue: Email sending fails
**Fix:**
1. Verify Microsoft app registration
2. Check all Microsoft environment variables
3. Grant admin consent for API permissions
4. Try logging in/out of Microsoft account

### Issue: No venues found in search
**Fix:**
1. Check SerpAPI monthly limit (100 free searches)
2. Try different city names
3. Verify search parameters (50-500 capacity, venue types)

### Issue: Duplicate venues still appearing
**Fix:** Database uses name + city matching. Venues with slightly different names will be added as separate entries.

---

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL (Supabase)
- **Styling**: Tailwind CSS
- **Web Scraping**: Cheerio, Axios
- **Search API**: SerpAPI
- **Email**: Microsoft Graph API
- **Deployment**: Vercel
- **Type Safety**: TypeScript

---

## File Structure

```
camel-ranch-booking/
├── app/                    # Next.js app directory (if migrating)
├── components/             # React components
│   ├── VenueSearch.tsx    # Venue discovery interface
│   ├── VenueDatabase.tsx  # Venue management
│   ├── CampaignBoard.tsx  # Campaign kanban
│   └── BookingForm.tsx    # Comprehensive booking form
├── database/
│   └── schema.sql         # PostgreSQL schema
├── lib/
│   ├── supabase.ts        # Database client
│   ├── venueScraperEnhanced.ts  # Web scraping logic
│   └── email.ts           # Email integration (to be added)
├── pages/
│   ├── api/               # API routes
│   │   ├── venues/
│   │   │   └── discover.ts
│   │   ├── bookings.ts
│   │   └── emails/
│   └── index.tsx          # Home page
├── types/
│   └── database.ts        # TypeScript types
├── .env.local             # Environment variables (don't commit!)
└── package.json

```

---

## Next Steps / Enhancements

### Immediate
- [ ] Test venue discovery with real searches
- [ ] Set up email templates
- [ ] Import existing venues from old system

### Short Term
- [ ] Add booking calendar view
- [ ] Create payment tracking dashboard
- [ ] Build analytics (venues by region, average pay, etc.)
- [ ] Add export to CSV/Excel

### Long Term
- [ ] Mobile app (React Native)
- [ ] Automated follow-up emails
- [ ] Integration with booking.com, BandsInTown
- [ ] Route optimization for tours
- [ ] Contract generation (PDF)

---

## Support

For questions or issues:
1. Check this README
2. Review code comments
3. Check Supabase logs (Database → Logs)
4. Check Vercel logs (if deployed)
5. Review browser console for errors

---

## License

Private project for Better Than Nothin' band booking management.

---

**Created for Scott & Better Than Nothin'**
*Bringing Ozark Country to venues across the region* 🎸
