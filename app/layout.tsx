import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Manualmind", template: "%s · Manualmind" },
  description: "회사 문서를 근거로 답하는 온보딩 AI 워크스페이스",
  icons: { icon: "/brand/logo.png", apple: "/brand/logo.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="uiv2">{children}</body>
    </html>
  );
}
