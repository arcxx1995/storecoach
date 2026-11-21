import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Store Coach",
  description: "Daily coaching for area managers and salespeople: more bills, bigger baskets, more repeat.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="wrap">{children}</div>
      </body>
    </html>
  );
}
