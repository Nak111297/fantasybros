import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "FantasyBros",
  description: "Sleeper league analysis and trade ideas",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site">
          <div>
            <Link href="/">FantasyBros</Link>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
