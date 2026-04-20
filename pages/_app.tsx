import type { AppProps } from 'next/app';
import '../styles/globals.css';
import SplineBackground from '../components/SplineBackground';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <SplineBackground />
      <Component {...pageProps} />
    </>
  );
}
