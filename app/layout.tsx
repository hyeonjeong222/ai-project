import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Onboard AI", template: "%s · Onboard AI" },
  description: "회사 문서를 근거로 답하는 온보딩 AI 워크스페이스",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
