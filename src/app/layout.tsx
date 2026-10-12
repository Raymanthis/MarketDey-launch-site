import type { Metadata } from "next";
import "remixicon/fonts/remixicon.css";
import "./globals.css";

export const metadata: Metadata = {
  // absolute og:image / twitter:image URLs; every public domain serves the same files
  metadataBase: new URL("https://www.marketdey.com"),
  title: "Marketdey",
  twitter: { card: "summary_large_image" },
  description:
    "Which market dey today? Marketdey knows. Shop the market or dodge its traffic: market days, alerts and landmark directions across Nigeria, even offline.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preload"
          href="/fonts/lato-900-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/lato-400-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
