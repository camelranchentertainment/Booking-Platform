// pages/privacy.tsx — public Privacy Policy (linked from app store listings and the site footer)
import LegalPage from '../components/public/LegalPage';
import { PRIVACY_SECTIONS } from '../lib/legalContent';

/** Public Privacy Policy page. */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      description="How Camel Ranch Booking collects, uses and protects your band's information, on the web and in the iPhone and Android apps."
      path="/privacy"
      intro={
        <p>
          This explains what information Camel Ranch Booking collects, how it&apos;s used, and the choices you
          have. It covers the website and the iPhone and Android apps. The short version: we use your
          information only to run the service for your band, and we never sell it or use it for ads.
        </p>
      }
      sections={PRIVACY_SECTIONS}
    />
  );
}
