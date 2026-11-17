import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "HealthAccess: care within reach",
  description:
    "Find suitable care nearby and choose exactly which health information you share. Works on the web, SMS and USSD.",
};

export const viewport: Viewport = {
  themeColor: "#f3f7f4",
};

/*
 * Runs before first paint. Shows the landing preloader only on "/", once per session, never under reduced motion.
 * Failsafe: if the client bundle never arrives, the curtain lifts anyway after 2.5s.
 * sessionStorage holds only a "seen intro" flag (no health data).
 */
const preloadGate = `(function(){try{var d=document.documentElement;var rm=matchMedia('(prefers-reduced-motion: reduce)').matches;var seen=false;try{seen=sessionStorage.getItem('ha-intro')==='1'}catch(e){}
if(location.pathname==='/'&&!rm&&!seen){d.classList.add('ha-preload');setTimeout(function(){d.classList.add('ha-preload-done');d.setAttribute('data-intro','play')},2500)}else if(!rm){d.setAttribute('data-intro','play')}}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: preloadGate }} />
      </head>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[10000] focus:rounded-lg focus:bg-paper focus:px-4 focus:py-2 focus:text-ink"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
