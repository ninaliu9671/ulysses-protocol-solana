import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./components/providers";

export const metadata: Metadata = {
  title: "Ulysses Protocol — Turn Discipline Into Yield",
  description: "Stake SOL and commit to your trading rules. Break them and get slashed. Hold firm and earn yield.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
