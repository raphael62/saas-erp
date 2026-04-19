import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "MasterBooks ERP",
  description: "Multi-tenant ERP for modern businesses",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={geist.variable} suppressHydrationWarning>
      <body
        className={cn(
          "min-h-dvh min-h-screen bg-background font-sans antialiased",
          geist.className
        )}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
