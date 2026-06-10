import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import "./globals.css";

const themeInitScript = `
  (() => {
    try {
      const themeStorageKey = "interview-lab-theme";
      const accentStorageKey = "interview-lab-accent";
      const root = document.documentElement;
      const storedTheme = window.localStorage.getItem(themeStorageKey);
      const storedAccent = window.localStorage.getItem(accentStorageKey);
      const preference = storedTheme === "light" || storedTheme === "dark" || storedTheme === "system" ? storedTheme : "system";
      const accent =
        storedAccent === "blue" || storedAccent === "teal" || storedAccent === "amber" || storedAccent === "coral" || storedAccent === "white"
          ? storedAccent
          : "blue";
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.dataset.themePreference = preference;
      root.dataset.theme = preference === "system" ? (isDark ? "dark" : "light") : preference;
      root.dataset.accent = accent;
    } catch {
      document.documentElement.dataset.themePreference = "system";
      document.documentElement.dataset.theme = "light";
      document.documentElement.dataset.accent = "blue";
    }
  })();
`;

export const metadata: Metadata = {
  title: "Interview Studio",
  description: "Interview Studio 帮你在真实面试语境里练习回答、继续追问并讲清楚真实经历。"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        {children}
      </body>
    </html>
  );
}
