import type { Metadata } from "next";
import { Fraunces, Noto_Sans_KR } from "next/font/google";
import { Nav } from "@/components/Nav";
import "./globals.css";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const body = Noto_Sans_KR({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "요약봇 | 유튜브 채널·영상 요약",
  description:
    "유튜브 채널 정보를 관리하고, 영상 URL을 구조적으로 요약하며 사건·원인·해결책으로 분리 정리합니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${display.variable} ${body.variable} h-full`}>
      <body className="site-shell antialiased">
        <Nav />
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
