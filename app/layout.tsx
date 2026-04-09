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
  title: "AI面试助手",
  description: "为面试回答提供结构化反馈、优化建议与示例答案。"
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
