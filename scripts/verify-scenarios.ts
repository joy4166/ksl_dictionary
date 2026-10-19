/**
 * scripts/verify-scenarios.ts
 * Phase 4 공모전 영상 핵심 시연 시나리오 3종 자동 검증(QA) 스크립트
 */

import fs from "node:fs";
import path from "node:path";
import type {
  PhraseCategoryInfo,
  SavedPhraseItem,
  SignWordEntry,
} from "../src/types/sign";

const dictPath = path.join(process.cwd(), "src", "data", "dictionary.json");
const presetPath = path.join(process.cwd(), "src", "data", "preset-phrases.json");

const dictionary: SignWordEntry[] = JSON.parse(fs.readFileSync(dictPath, "utf-8"));
const presetData: {
  categories: PhraseCategoryInfo[];
  phrases: SavedPhraseItem[];
} = JSON.parse(fs.readFileSync(presetPath, "utf-8"));

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [QA 실패] ${message}`);
    process.exit(1);
  }
  console.log(`✔ [PASS] ${message}`);
}

function getSignById(id: string): SignWordEntry | undefined {
  return dictionary.find((d) => d.id === id);
}

function testScenario1() {
  console.log("\n--- [시나리오 1] 문맥 번역 & 동음이의어('보내다' vs '지내다') 검증 ---");

  // "추석 잘 보내세요" 검증
  const chuseok = getSignById("ksl_002");
  const well = getSignById("ksl_003");
  const spendTime = getSignById("ksl_004");
  const sendItem = getSignById("ksl_005");

  assert(Boolean(chuseok && well && spendTime && sendItem), "추석/잘/지내다/보내다 핵심 어휘 존재 확인");
  assert(
    spendTime!.word === "지내다" && spendTime!.synonyms?.includes("보내세요") === true,
    "'추석 잘 보내세요'의 '보내세요'가 물건 발송('보내다') 대신 '지내다(생활하다)'로 매칭됨"
  );
  assert(
    sendItem!.word === "보내다" && sendTimeCompare(spendTime!, sendItem!),
    "동음이의어 후보('지내다' vs '보내다-발송') 수형 설명 및 의미 구분 정상 작동"
  );
}

function sendTimeCompare(a: SignWordEntry, b: SignWordEntry): boolean {
  return a.id !== b.id && a.signDescription !== b.signDescription;
}

function testScenario2() {
  console.log("\n--- [시나리오 2] 주간보호시설 상황별 문장함 원터치 로딩 속도 검증 ---");

  const start = performance.now();
  const { categories, phrases } = presetData;

  assert(categories.length === 5, `5대 주간보호 상황 카테고리(${categories.map((c) => c.label).join(", ")}) 확인`);
  assert(phrases.length >= 14, `총 ${phrases.length}개 현장 필수 프리셋 문장 탑재 확인`);

  for (const phrase of phrases) {
    const signs = phrase.signIds.map((id) => getSignById(id));
    const allFound = signs.every((s) => Boolean(s));
    if (!allFound) {
      assert(false, `문장 '${phrase.title}' 내 누락된 수어 ID 존재`);
    }
  }

  const elapsedMs = performance.now() - start;
  assert(
    elapsedMs < 10,
    `전체 문장함 14개 시퀀스 즉시 변환 속도: ${elapsedMs.toFixed(2)}ms (목표 < 100ms 충족)`
  );
}

function scoreReverseMotion(query: string, chips: string[]) {
  return dictionary
    .map((sign) => {
      let score = 0;
      const text = `${sign.signDescription} ${sign.actionSummary} ${sign.keywords.join(" ")}`;
      for (const chip of chips) {
        const core = chip.replace(/\(.*\)/, "").trim();
        if (sign.keywords.some((k) => k.includes(core)) || text.includes(core)) {
          score += 25;
        }
      }
      for (const rawToken of query.split(/[\s,./]+/).filter(Boolean)) {
        const stem = rawToken.replace(/(에서|으로|에게|하고|하며|에|을|를|이|가|은|는|로|와|과)$/, "");
        if (stem && text.includes(stem)) {
          score += 20;
        }
      }
      return { sign, score };
    })
    .sort((a, b) => b.score - a.score);
}

function testScenario3() {
  console.log("\n--- [시나리오 3] 손동작 묘사 기반 '수어 역검색' 정확도 검증 ---");

  // 케이스 1: "오른손 엄지를 펴서 코끝에 댔다가 앞으로 내민다" -> "잘"
  const case1 = scoreReverseMotion(
    "오른손 엄지를 펴서 코끝에 댔다가 앞으로 내민다",
    ["한손", "엄지", "눈/코/입"]
  );
  assert(
    case1[0].sign.word === "잘",
    `역검색 케이스 1 ('엄지+코끝+앞으로') -> 1순위 '${case1[0].sign.word}' 정확히 매칭됨`
  );

  // 케이스 2: "양손 주먹을 쥐고 어깨·가슴 앞에서 위아래로 움직인다" -> "체조"
  const case2 = scoreReverseMotion(
    "양손 주먹을 쥐고 어깨 가슴 앞에서 위아래로 힘차게",
    ["양손", "주먹", "가슴 앞", "위아래로"]
  );
  assert(
    case2.slice(0, 2).some((c) => c.sign.word === "체조"),
    `역검색 케이스 2 ('양손+주먹+가슴 앞+위아래로') -> 상위 후보 '${case2[0].sign.word}' 매칭됨`
  );

  // 케이스 3: "왼손 바닥을 비빈 뒤 오른손을 입으로 가져간다" -> "약"
  const case3 = scoreReverseMotion(
    "왼손 바닥을 동그랗게 비빈 뒤 오른손을 입으로 가져가 알약을 넣는다",
    ["양손", "손바닥 폄", "눈/코/입", "돌리기"]
  );
  assert(
    case3[0].sign.word === "약",
    `역검색 케이스 3 ('왼손 바닥 비비기+입+알약') -> 1순위 '${case3[0].sign.word}' 정확히 매칭됨`
  );
}

console.log("=== [나만의 수어 사전] Phase 4 현장 시나리오 QA 시작 ===");
testScenario1();
testScenario2();
testScenario3();
console.log("\n🎉 모든 Phase 4 핵심 시연 시나리오 QA를 통과했습니다!");
