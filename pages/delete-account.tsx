// pages/delete-account.tsx — public account deletion instructions (required by Google Play)
import LegalPage from '../components/public/LegalPage';
import { DELETION_SECTIONS } from '../lib/legalContent';

/** Public page explaining how to delete a Camel Ranch Booking account. */
export default function DeleteAccountPage() {
  return (
    <LegalPage
      title="Delete Your Account"
      description="How to delete your Camel Ranch Booking account, what gets removed and what your band keeps."
      path="/delete-account"
      intro={
        <p>
          You can delete your Camel Ranch Booking account at any time, from the app or by email.
          Here&apos;s how, and exactly what happens to your information.
        </p>
      }
      sections={DELETION_SECTIONS}
    />
  );
}
