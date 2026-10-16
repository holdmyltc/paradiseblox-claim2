import type { Metadata } from "next";
import { AdminClient } from "@/components/admin-client";

export const metadata: Metadata = {
  title: "Paradise Blox Admin",
  manifest: "/admin-manifest.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "PB Admin", statusBarStyle: "black-translucent" },
};

export default function AdminPage() {
  return <AdminClient />;
}
