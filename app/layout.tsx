import type { Metadata } from "next";
import { Source_Serif_4, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";

const serif = Source_Serif_4({ subsets: ["latin", "latin-ext"], variable: "--font-serif", weight: ["500", "600", "700"] });
const sans = IBM_Plex_Sans({ subsets: ["latin", "latin-ext"], variable: "--font-sans", weight: ["400", "500", "600"] });
const mono = IBM_Plex_Mono({ subsets: ["latin", "latin-ext"], variable: "--font-mono", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Muflon Core",
  description: "Znalostní síť Rádia Muflon",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body className={`${serif.variable} ${sans.variable} ${mono.variable} font-sans min-h-screen`}>
        <Nav />
        <main className="max-w-6xl mx-auto px-5 py-8">{children}</main>
      </body>
    </html>
  );
}
