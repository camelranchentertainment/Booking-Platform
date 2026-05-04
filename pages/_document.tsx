import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Favicon */}
        <link rel="icon" href="/images/logo-square.png" type="image/png" />
        <link rel="apple-touch-icon" href="/images/logo-square.png" />

        {/* Site description shown in Google search results */}
        <meta name="description" content="Camel Ranch Booking — professional music booking platform for country and Americana artists." />

        {/* Open Graph — controls the preview card when sharing a link on Facebook, iMessage, etc. */}
        <meta property="og:site_name" content="Camel Ranch Booking" />
        <meta property="og:type"      content="website" />
        <meta property="og:title"     content="Camel Ranch Booking" />
        <meta property="og:description" content="Professional music booking platform for country and Americana artists." />
        <meta property="og:image"     content="https://camelranchbooking.com/images/logo-banner.png" />

        {/* Twitter / X card */}
        <meta name="twitter:card"        content="summary_large_image" />
        <meta name="twitter:title"       content="Camel Ranch Booking" />
        <meta name="twitter:description" content="Professional music booking platform for country and Americana artists." />
        <meta name="twitter:image"       content="https://camelranchbooking.com/images/logo-banner.png" />
      </Head>
      <body>
        {/* Runs before React hydrates — prevents flash of wrong theme */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('theme');document.documentElement.setAttribute('data-theme',t||'dark');}catch(e){}` }} />
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
