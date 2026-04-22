import type { AppProps } from 'next/app';
import '../styles/globals.css';
import BarBackground from '../components/BarBackground';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <BarBackground />
      <Component {...pageProps} />
    </>
  );
}
