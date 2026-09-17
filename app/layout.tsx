import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Snapdown — Download video dengan mudah",
  description: "Platform sederhana untuk mengunduh video dari Facebook, Instagram, dan TikTok.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
