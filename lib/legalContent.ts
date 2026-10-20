// lib/legalContent.ts
//
// Text for the public Privacy Policy (/privacy) and Account Deletion
// (/delete-account) pages. Kept as data, separate from the page markup, so
// it can be reviewed in one place and unit-tested for the disclosures the
// app stores (Google Play, Apple App Store) and Google's API review require.
//
// When the platform starts using a new outside service or collecting a new
// kind of data, update SERVICE_PROVIDERS / the sections below and bump
// LEGAL_EFFECTIVE_DATE.

export const LEGAL_EFFECTIVE_DATE = 'October 20, 2026';
export const LEGAL_CONTACT_EMAIL = 'booking@camelranchbooking.com';
export const LEGAL_OPERATOR = 'Camel Ranch Entertainment';

/** A heading plus paragraphs and/or bullet items. */
export interface LegalSection {
  id: string;
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

/** Outside services that process data for the platform. */
export const SERVICE_PROVIDERS: ReadonlyArray<{ name: string; purpose: string }> = [
  { name: 'Supabase', purpose: 'database, sign-in and file storage' },
  { name: 'Vercel', purpose: 'website and app hosting' },
  { name: 'Stripe', purpose: 'subscription payments (we never see or store your full card number)' },
  { name: 'Resend', purpose: 'sending booking emails and account notices' },
  { name: 'Anthropic', purpose: 'the AI booking assistant, which reads the band information needed to answer you' },
  { name: 'Google', purpose: 'Gmail, Google Calendar and Google Maps features you choose to use' },
  { name: 'Firecrawl', purpose: 'reading public venue websites when you research venues' },
  { name: 'Sentry', purpose: 'error reports so we can fix bugs' },
];

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    id: 'who-we-are',
    heading: 'Who we are',
    paragraphs: [
      `Camel Ranch Booking (camelranchbooking.com and the Camel Ranch Booking iPhone and Android apps) is run by ${LEGAL_OPERATOR} in Arkansas, USA. It helps bands, their members and booking agents manage shows, tours, venues, email and band money.`,
      `Questions about this policy or your data: ${LEGAL_CONTACT_EMAIL}.`,
    ],
  },
  {
    id: 'what-we-collect',
    heading: 'What we collect',
    bullets: [
      'Account details: your name, email address, password (stored only as a secure hash by our sign-in provider) and your role in the band.',
      'Band and booking information you or your bandmates enter: shows, tours, venues, venue contacts, notes, set times, band members, photos, logos and other media.',
      'Money records for the band: show fees, deposits, payments received, expenses and member pay.',
      'Email and calendar information if you connect Gmail, Google Calendar or another email account (see "Google user data" below).',
      'Billing details handled by Stripe. We keep your subscription status, not your card number.',
      'Messages you send to the AI booking assistant and its replies, so the conversation can continue.',
      'Basic technical information: browser or device type and error reports, used to keep the service working.',
    ],
  },
  {
    id: 'how-we-use',
    heading: 'How we use it',
    bullets: [
      'To run the service: show your band its calendar, shows, money and email in one place.',
      'To send email you ask us to send, such as booking pitches and confirmations to venues.',
      'To keep Google Calendar in sync when you turn that on.',
      'To answer you through the AI booking assistant. It only acts on your band\'s data, and changes it proposes wait for your approval.',
      'To bill subscriptions, prevent abuse and fix problems.',
    ],
    paragraphs: [
      'We do not sell your data, share it for advertising, or use it to show you ads. There are no ad trackers in the website or the apps.',
    ],
  },
  {
    id: 'google-user-data',
    heading: 'Google user data',
    paragraphs: [
      'If you connect a Google account, we ask for permission to read Gmail messages, create Gmail drafts, and read and update Google Calendar events. We use this only to show and track booking conversations with venues, draft and send the booking emails you approve, and keep your show calendar in sync.',
      'Camel Ranch Booking\'s use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. We do not use Google user data for advertising, we do not sell it, and people do not read it except with your permission, for security, or where the law requires it.',
      'Connection tokens are stored encrypted on our servers and are never sent to your browser. You can disconnect at any time in Settings or from your Google account\'s security page.',
    ],
  },
  {
    id: 'who-sees-it',
    heading: 'Who can see your information',
    bullets: [
      'Your band: band admins see the band\'s full records. Band members see the schedule and show details, not the band\'s money.',
      'A booking agent your band works with sees the bands and shows they manage.',
      'Venues and contacts see only the emails you send them.',
      'Service providers that run parts of the platform for us, listed below. They may only use the data to provide their service to us.',
      'Authorities, if the law requires it.',
    ],
  },
  {
    id: 'service-providers',
    heading: 'Service providers',
    bullets: SERVICE_PROVIDERS.map(p => `${p.name}: ${p.purpose}.`),
  },
  {
    id: 'security',
    heading: 'How we protect it',
    paragraphs: [
      'Data is encrypted in transit (HTTPS) and at rest. Each band\'s records are walled off from other bands at the database level, and email connection secrets are encrypted. No system is perfectly secure, so please use a strong password and tell us right away if you think your account has been misused.',
    ],
  },
  {
    id: 'retention',
    heading: 'How long we keep it',
    paragraphs: [
      'We keep your information while your account is open. When you delete your account, we remove your login and personal profile. A band\'s past shows and money records (payments, deposits and expenses) belong to the band and are kept for its financial history and tax records, without your login attached. Backups roll off within 30 days.',
    ],
  },
  {
    id: 'your-choices',
    heading: 'Your choices',
    bullets: [
      'See and change your information in the app at any time.',
      'Disconnect Gmail or Google Calendar in Settings.',
      'Ask us for a copy of your data or to correct it by emailing us.',
      'Delete your account in the app or by email. See the Account Deletion page for how.',
    ],
  },
  {
    id: 'children',
    heading: 'Children',
    paragraphs: [
      'Camel Ranch Booking is for adults running bands and booking. It is not meant for anyone under 18, and we do not knowingly collect information from children.',
    ],
  },
  {
    id: 'changes',
    heading: 'Changes to this policy',
    paragraphs: [
      'If we make important changes, we\'ll update the date at the top of this page and let account holders know by email or in the app.',
    ],
  },
];

export const DELETION_SECTIONS: LegalSection[] = [
  {
    id: 'in-app',
    heading: 'Delete your account on the website',
    bullets: [
      'Sign in at camelranchbooking.com.',
      'Open Settings and scroll down to "Danger Zone".',
      'Type DELETE to confirm and tap Delete Account. You\'ll be signed out and your login is removed.',
      'Booking agents, and anyone who can\'t sign in, can use the email option below.',
    ],
  },
  {
    id: 'by-email',
    heading: 'Or ask us by email',
    paragraphs: [
      `Email ${LEGAL_CONTACT_EMAIL} from the address on your account with the subject "Delete my account". We'll confirm and complete it within 30 days. You don't need to be able to sign in.`,
    ],
  },
  {
    id: 'what-is-deleted',
    heading: 'What gets deleted',
    bullets: [
      'Your login, name, email address and profile.',
      'Your connected email and calendar settings and stored connection tokens.',
      'Your notifications, private notes and AI assistant conversations.',
    ],
  },
  {
    id: 'what-is-kept',
    heading: 'What the band keeps',
    paragraphs: [
      'Shows, tours, venues and money records (payments, deposits, expenses and member pay) belong to the band, not to one person. They stay with the band for its financial history and tax records, with your login no longer attached. If you are the band\'s only admin and want the whole band removed, email us and we\'ll help.',
      'Backups that contain your data roll off within 30 days.',
    ],
  },
];
