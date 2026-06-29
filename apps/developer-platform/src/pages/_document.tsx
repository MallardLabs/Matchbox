import { Head, Html, Main, NextScript } from "next/document"

export default function Document(): JSX.Element {
  return (
    <Html lang="en">
      <Head>
        <meta name="theme-color" content="#F5F2EA" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
