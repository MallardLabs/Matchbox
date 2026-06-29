import { Head, Html, Main, NextScript } from "next/document"

export default function Document(): JSX.Element {
  return (
    <Html lang="en">
      <Head>
        <link rel="icon" href="/matchbox_icon.png" />
        <link rel="apple-touch-icon" href="/matchbox_icon.png" />
        <meta
          name="theme-color"
          content="#F5F2EA"
          media="(prefers-color-scheme: light)"
        />
        <meta
          name="theme-color"
          content="#11100E"
          media="(prefers-color-scheme: dark)"
        />
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Static theme bootstrap script does not include user input.
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
