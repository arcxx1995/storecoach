import type { Metadata } from "next";
import { Figtree, Rufina } from "next/font/google";
import { Motion } from "./motion";
import { NavButtons } from "./navbuttons";
import { Sidebar } from "./sidebar";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const rufina = Rufina({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "Store Coach · Manyavar",
  description: "Daily coaching for area managers and salespeople: more bills, bigger baskets, more repeat.",
  icons: { icon: "/manyavar-logo.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${figtree.variable} ${rufina.variable}`}>
      <body>
        <Motion />
        <div className="shell">
          <Sidebar />
          <main className="wrap"><NavButtons />{children}</main>
        </div>
      </body>
    </html>
  );
}
