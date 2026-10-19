import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "나만의 수어 사전 | 농아인주간보호시설 소통 도우미",
  description:
    "한국어 문장을 한국수어(KSL) 문법과 맥락에 맞는 수어 단어 조합으로 변환하고, 어르신의 수어 동작을 역검색할 수 있는 맞춤형 모바일 웹앱",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "나만의 수어사전",
  },
  icons: {
    icon: "/icons/icon-192.svg",
    apple: "/icons/icon-192.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-slate-100 text-slate-900 antialiased">
        {/* 모바일 뷰포트 고정 컨테이너 (max-w-md mx-auto) */}
        <div className="mx-auto min-h-screen max-w-md bg-white shadow-xl flex flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
