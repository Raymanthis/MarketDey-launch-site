import type { Metadata } from "next";
import "remixicon/fonts/remixicon.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Marketdey",
  description:
    "Know which markets are on today across Delta State — market days, alerts and landmarks that work offline.",
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
