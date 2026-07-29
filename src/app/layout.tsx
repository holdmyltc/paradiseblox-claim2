import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Claim Your ParadiseBlox Order",
  description: "Verify your order, connect your Roblox account and chat with ParadiseBlox during delivery.",
  icons: {
    icon: "/pb-icon-192.png",
    apple: "/pb-apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#f7f8fc",
};

/**
 * Light is the default. We deliberately ignore prefers-color-scheme: a visitor
 * whose phone is in dark mode still lands on the light theme, and only gets
 * dark if they choose it with the toggle.
 */
const themeScript = `
(function(){
  try {
    var saved = localStorage.getItem('claim2_theme');
    document.documentElement.setAttribute('data-theme', saved === 'dark' ? 'dark' : 'light');
  } catch (error) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={outfit.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
