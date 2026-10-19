import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const lato = localFont({
  src: [
    { path: "../fonts/lato-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/lato-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../fonts/lato-latin-900-normal.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Your Paradise Blox Order",
  description: "Open your order, link your Roblox account and chat with Paradise Blox while we deliver your items.",
  icons: {
    icon: [
      { url: "/pb-icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/pb-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/pb-apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0c0d12",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={lato.variable}>
      <body>{children}</body>
    </html>
  );
}
