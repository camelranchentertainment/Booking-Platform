// __tests__/lib/legalContent.test.ts
// The privacy and deletion pages carry disclosures the app stores and
// Google's API review check for; keep them from being dropped by accident.
import {
  PRIVACY_SECTIONS,
  DELETION_SECTIONS,
  LEGAL_CONTACT_EMAIL,
  SERVICE_PROVIDERS,
} from '../../lib/legalContent';

const text = (sections: typeof PRIVACY_SECTIONS) =>
  sections.flatMap(s => [s.heading, ...(s.paragraphs ?? []), ...(s.bullets ?? [])]).join('\n');

describe('privacy policy content', () => {
  const body = text(PRIVACY_SECTIONS);

  it('includes the Google API Limited Use statement', () => {
    expect(body).toMatch(/Google API Services User Data Policy, including the Limited Use requirements/);
  });

  it('gives a contact email and says data is not sold', () => {
    expect(body).toContain(LEGAL_CONTACT_EMAIL);
    expect(body).toMatch(/do not sell/i);
  });

  it('lists every service provider', () => {
    for (const p of SERVICE_PROVIDERS) expect(body).toContain(`${p.name}:`);
  });

  it('has unique section ids for anchor links', () => {
    const ids = [...PRIVACY_SECTIONS, ...DELETION_SECTIONS].map(s => s.id);
    expect(new Set(PRIVACY_SECTIONS.map(s => s.id)).size).toBe(PRIVACY_SECTIONS.length);
    expect(new Set(DELETION_SECTIONS.map(s => s.id)).size).toBe(DELETION_SECTIONS.length);
    expect(ids.every(id => /^[a-z0-9-]+$/.test(id))).toBe(true);
  });
});

describe('account deletion content', () => {
  const body = text(DELETION_SECTIONS);

  it('explains in-app and email deletion, what is deleted and what is kept', () => {
    expect(body).toMatch(/Settings/);
    expect(body).toContain(LEGAL_CONTACT_EMAIL);
    expect(DELETION_SECTIONS.map(s => s.id)).toEqual(
      expect.arrayContaining(['in-app', 'by-email', 'what-is-deleted', 'what-is-kept']),
    );
  });
});
