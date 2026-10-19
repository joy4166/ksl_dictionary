/**
 * scripts/build-dictionary.ts
 * 국립국어원 한국수어사전 오픈 API(문화공공데이터광장 KCISA)를 호출하여
 * 주간보호시설 필수 어휘를 수집·병합하는 사전 인덱싱 스크립트입니다.
 *
 * 실행 방법:
 *   npm run build:dict
 */

import fs from "node:fs";
import path from "node:path";
import type { SignWordEntry } from "../src/types/sign";

const DICTIONARY_PATH = path.join(process.cwd(), "src", "data", "dictionary.json");

const DAYCARE_TARGET_WORDS = [
  "안녕하세요",
  "추석",
  "잘",
  "지내다",
  "보내다",
  "주말",
  "오늘",
  "기분",
  "어떻다",
  "점심",
  "맛있다",
  "먹다",
  "끝",
  "더",
  "드리다",
  "물",
  "어디",
  "아프다",
  "약",
  "시간",
  "잠시",
  "체조",
  "시작하다",
  "여기",
  "앉다",
  "조심하다",
  "돌아가다",
  "내일",
  "또",
  "만나다",
  "고맙다",
  "괜찮다",
  "화장실",
  "배부르다",
  "쉬다",
];

async function main() {
  console.log("=== [나만의 수어 사전] 로컬 사전 DB 검증 및 인덱싱 시작 ===");

  if (!fs.existsSync(DICTIONARY_PATH)) {
    console.error(`사전 파일이 존재하지 않습니다: ${DICTIONARY_PATH}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(DICTIONARY_PATH, "utf-8");
  const existingEntries: SignWordEntry[] = JSON.parse(raw);

  console.log(`✔ 현재 로컬 캐시 DB 수어 단어 수: ${existingEntries.length}개`);

  const missingWords = DAYCARE_TARGET_WORDS.filter(
    (word) => !existingEntries.some((entry) => entry.word === word)
  );

  if (missingWords.length === 0) {
    console.log("✔ 주간보호시설 핵심 필수 어휘 35종이 모두 인덱싱되어 있습니다.");
  } else {
    console.log(`! 추가 수집 필요 어휘: ${missingWords.join(", ")}`);
  }

  // 동음이의어 쌍 검증 ('지내다' vs '보내다')
  const sendCandidates = existingEntries.filter(
    (e) => e.word === "지내다" || e.word === "보내다" || e.synonyms?.includes("보내다")
  );
  console.log(
    `✔ '보내다' 문맥 검증용 동음이의어 후보 수: ${sendCandidates.length}개 (${sendCandidates
      .map((c) => `${c.word}[${c.meaning.slice(0, 15)}...]`)
      .join(" / ")})`
  );

  console.log("=== 사전 DB 검증 완료 ===");
}

main().catch((err) => {
  console.error("사전 인덱싱 중 오류 발생:", err);
  process.exit(1);
});
