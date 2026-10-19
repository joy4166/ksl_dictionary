import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "나만의 수어 사전 - 농인과 대화를 위한 소통 앱",
    short_name: "나만의 수어사전",
    description:
      "농인과 대화를 위한 소통 앱 - 한국어 문장을 한국수어(KSL) 문법과 맥락에 맞는 수어 단어 조합으로 변환하고, 수어 동작을 역검색할 수 있는 맞춤형 모바일 웹앱",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    lang: "ko",
    categories: ["education", "medical", "utilities", "accessibility"],
    icons: [
      {
        src: "/icons/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
