import { Head, Html, Main, NextScript } from "next/document"

export default function Document() {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://matchbox.mezo.org"
  const ogImageUrl = `${baseUrl}/og.png`

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

        {/* Open Graph / Social Media */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="MatchBox" />
        <meta
          property="og:title"
          content="Matchbox"
        />
        <meta
          property="og:description"
          content="The powerful veBTC + veMEZO matching platform for Mezo"
        />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:url" content={baseUrl} />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content="Matchbox"
        />
        <meta
          name="twitter:description"
          content="The powerful veBTC + veMEZO matching platform for Mezo"
        />
        <meta name="twitter:image" content={ogImageUrl} />

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
