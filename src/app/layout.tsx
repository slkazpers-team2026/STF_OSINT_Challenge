import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "OSINT CTF Platform",
  description: "Cyber Security and Open Source Investigation Unit - CTF Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col min-h-screen bg-gray-900 text-white`}>
        <AuthProvider>
          <Navbar />
          <main className="flex-grow flex flex-col">
            {children}
          </main>
          <footer className="bg-black text-gray-400 font-mono py-6 text-center text-sm border-t border-gray-800 shrink-0">
            Cyber Security and Open Source Investigation Unit - Special Task Force - Sri Lanka
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}