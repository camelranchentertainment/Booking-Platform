import type { AppProps } from 'next/app';
import '../styles/globals.css';
import { AuthProvider } from '../contexts/AuthContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import ImpersonationBanner from '../components/ImpersonationBanner';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ErrorBoundary>
      <ImpersonationBanner />
      <AuthProvider>
        <Component {...pageProps} />
      </AuthProvider>
    </ErrorBoundary>
  );
}
