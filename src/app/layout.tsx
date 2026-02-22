import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "UzAir Weekly Dashboard",
  description: "Weekly domestic flights summary (routes + transit hubs)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
