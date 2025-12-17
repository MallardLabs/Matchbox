import { Head, Html, Main, NextScript } from "next/document"

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Preconnect to font origins for faster loading */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />

        {/* Preload critical font weights to prevent FOUT */}
        <link
          rel="preload"
          href="https://fonts.gstatic.com/s/ibmplexmono/v19/-F63fjptAgt5VM-kVkqdyU8n5igg1l9kn-s.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />

        {/* Load IBM Plex Mono with display=swap for performance */}
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />

        {/* Theme color for browser chrome */}
        <meta
          name="theme-color"
          content="#fafaf9"
          media="(prefers-color-scheme: light)"
        />
        <meta
          name="theme-color"
          content="#0c0c0c"
          media="(prefers-color-scheme: dark)"
        />

        {/* Prevent flash of wrong theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('matchbox-theme');
                  var theme = stored || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
                  if (theme === 'dark') {
                    document.documentElement.classList.add('dark-mode');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
