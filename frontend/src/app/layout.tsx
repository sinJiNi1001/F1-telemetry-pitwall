import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pit Wall Hub",
  description: "F1 Telemetry Analytics",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-slate-950 antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}