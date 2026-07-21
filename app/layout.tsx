import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import ConvexClientProvider from "@/components/convex-client-provider";
import { cn } from "@/lib/utils";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RAID Tracker",
  description:
    "Cross-team RAID & dependency tracker — risks, assumptions, issues, and the dependency graph between them.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans", inter.variable)}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ConvexClientProvider>
          <SidebarProvider>
            <AppSidebar />
            <main className="flex-1 p-6">
              <SidebarTrigger className="mb-4" />
              {children}
            </main>
          </SidebarProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
