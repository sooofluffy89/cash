import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CASH · LABULA",
  description: "Společná hotovost LABULA · Cash movements and weekly counts",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs">
      <body className="antialiased">{children}</body>
    </html>
  );
}
