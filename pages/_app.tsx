import type { AppProps } from 'next/app';
import '../styles/globals.css';
import { AuthProvider } from '../contexts/AuthContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import ImpersonationBanner from '../components/ImpersonationBanner';
import MetaPixelTracker from '../components/MetaPixelTracker';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ErrorBoundary>
      <MetaPixelTracker />
      <ImpersonationBanner />
      <AuthProvider>
        <Component {...pageProps} />
      </AuthProvider>
    </ErrorBoundary>
  );
}
