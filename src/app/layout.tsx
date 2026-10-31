import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KSL 번역 | 농인과 대화를 위한 소통 앱",
  description:
    "KSL 번역 (농인과 대화를 위한 소통 앱) - 한국어 문장을 한국수어(KSL) 문법과 맥락에 맞는 수어 단어 조합으로 변환하고, 수어 동작을 역검색할 수 있는 맞춤형 모바일 웹앱",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "KSL 번역",
  },
  icons: {
    icon: "/icons/icon-192.svg",
    apple: "/icons/icon-192.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#047857",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-stone-200/70 text-stone-900 antialiased">
        {/* 모바일·태블릿·데스크톱 반응형 컨테이너 (눈이 편안한 웜 스톤 캔버스 + 1px 보더) */}
        <div className="mx-auto min-h-screen w-full max-w-md sm:max-w-lg md:max-w-2xl lg:max-w-3xl bg-stone-50 border-x border-stone-200 flex flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
