import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KSL 번역 - 농인과 대화를 위한 소통 앱",
    short_name: "KSL 번역",
    description:
      "KSL 번역 (농인과 대화를 위한 소통 앱) - 한국어 문장을 한국수어(KSL) 문법과 맥락에 맞는 수어 단어 조합으로 변환하고, 수어 동작을 역검색할 수 있는 맞춤형 모바일 웹앱",
    start_url: "/",
    display: "standalone",
    background_color: "#fafaf9",
    theme_color: "#047857",
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
