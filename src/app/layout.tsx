import type { Metadata } from "next";
import { Space_Grotesk, Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import ThemeProvider from "@/components/ThemeProvider";
import AppShell from "@/components/AppShell";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "tollGate — AI Code Review Co-Pilot",
  description: "Autonomous pull request intelligence powered by LangGraph + Claude",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    /* suppressHydrationWarning: ThemeProvider toggles the 'dark' class on mount */
    <html
      lang="en"
      className={`dark ${spaceGrotesk.variable} ${manrope.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Manrope:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
      </head>
      <body className="bg-base text-fg-1 min-h-screen transition-colors duration-200">
        <Providers>
          <ThemeProvider>
            <AppShell>{children}</AppShell>
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}
