/**
 * scripts/verify-scenarios.ts
 * [나만의 수어 사전] 공식 데이터셋 기반 KSL 관용구 FST + 동음이의어 TF-IDF 문맥 엔진 & 초고속 응답 QA 스크립트
 */

import { translateKoreanToKsl } from "../src/lib/gemini";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [QA 실패] ${message}`);
    process.exit(1);
  }
  console.log(`✔ [PASS] ${message}`);
}

async function runTests() {
  console.log("==========================================================================");
  console.log("🚀 [나만의 수어 사전] 공식 데이터셋 기반 KSL NLP 엔진 & 속도 종합 검증 시작");
  console.log("==========================================================================\n");

  // 1. 관용어(Idiom) 문맥 의역 테스트 (어미 변화 및 부사 개입 포함)
  console.log("--- [검증 1] 한국어 관용구(Idiom FST) 형태소 슬라이딩 윈도우 의역 테스트 ---");

  const idiomCases = [
    {
      sentence: "그 사람은 눈이 너무 높으시네요",
      expectedIds: ["ksl_123", "ksl_124"], // [기준] -> [높다]
      desc: "관용어 '눈이 높다' (부사 '너무' + 높임 어미 개입) -> [기준] + [높다]",
    },
    {
      sentence: "우리 할머니는 손이 정말 크셔서 음식을 많이 하세요",
      expectedIds: ["ksl_129", "ksl_141", "ksl_142"], // [마음] -> [충분하다] -> [베풀다]
      desc: "관용어 '손이 크다' (부사 '정말' + 활용형 '크셔서') -> [마음] + [충분하다] + [베풀다]",
    },
    {
      sentence: "선생님은 발이 넓으시다",
      expectedIds: ["ksl_136", "ksl_137", "ksl_095"], // [친하다] -> [사람] -> [많이]
      desc: "관용어 '발이 넓다' -> [친하다] + [사람] + [많이]",
    },
    {
      sentence: "입이 무거운 사람",
      expectedIds: ["ksl_134", "ksl_135"], // [비밀] -> [지키다]
      desc: "관용어 '입이 무겁다' (관형사형 전성어미 '무거운') -> [비밀] + [지키다]",
    },
    {
      sentence: "이제야 마음이 놓였어요",
      expectedIds: ["ksl_130"], // [안심하다]
      desc: "관용어 '마음이 놓이다' -> [안심하다]",
    },
    {
      sentence: "소식을 듣고 가슴이 너무 아파요",
      expectedIds: ["ksl_129", "ksl_050"], // [마음] -> [슬프다]
      desc: "관용어 '가슴이 아프다' -> [마음] + [슬프다]",
    },
    {
      sentence: "오늘은 정말 눈코 뜰 새 없어요",
      expectedIds: ["ksl_007", "ksl_095", "ksl_139"], // [오늘] -> [많이] -> [바쁘다]
      desc: "관용어 '눈코 뜰 새 없다' (Garu '눈/NNG + 코/NNG + 뜨/VV' 분해 기반 FST 매칭) -> [오늘] + [많이] + [바쁘다]",
    },
  ];

  for (const tc of idiomCases) {
    const res = await translateKoreanToKsl(tc.sentence);
    const actualIds = res.kslSequence.map((s) => s.selectedSign.id);
    const matchedAll = tc.expectedIds.every((id) => actualIds.includes(id));
    assert(
      matchedAll,
      `${tc.desc} | 결과: ${res.glossSummary} (소요시간: ${res.timings?.totalMs}ms)`
    );
  }

  // 2. 관용어 False Positive 방지 (물리적 문맥 차단어 검증)
  console.log("\n--- [검증 2] 물리적 문맥일 때 관용어 오역(False Positive) 차단 검증 ---");
  const physicalHand = await translateKoreanToKsl("장갑이 작아서 손이 크다");
  const physicalIds = physicalHand.kslSequence.map((s) => s.selectedSign.id);
  assert(
    physicalIds.includes("ksl_118") && physicalIds.includes("ksl_126"),
    `'장갑이 작아서 손이 크다' (물리적 신체 손) -> 관용어로 오역하지 않고 [(신체의)손(ksl_118)] + [크다(ksl_126)] 유지됨! (${physicalHand.glossSummary})`
  );

  // 3. 동음이의어(Homonym) Lesk & TF-IDF 문맥 공기어 판별 테스트
  console.log("\n--- [검증 3] 동음이의어 13개 클러스터 TF-IDF 문맥 공기어 자동 판별 테스트 ---");

  const homonymCases = [
    {
      sentence: "어제 밤에 눈이 많이 내렸어요",
      expectedPairs: [
        { id: "ksl_114", word: "(시간)밤" },
        { id: "ksl_108", word: "눈(이 내리다)" },
      ],
      desc: "'밤'(시간 vs 열매) & '눈'(신체 vs 날씨) 동시 판별",
    },
    {
      sentence: "눈이 침침해서 안경을 썼어요",
      expectedPairs: [
        { id: "ksl_107", word: "(신체의)눈" },
        { id: "ksl_153", word: "(모자·안경을)쓰다" },
      ],
      desc: "'눈'(신체) & '쓰다'(착용 vs 글씨 vs 맛) 동시 판별",
    },
    {
      sentence: "종이에 이름을 쓰세요",
      expectedPairs: [{ id: "ksl_154", word: "(글을)쓰다" }],
      desc: "'쓰다'(글씨를 적다) 문맥 판별",
    },
    {
      sentence: "약이 너무 써요",
      expectedPairs: [{ id: "ksl_155", word: "(맛이)쓰다" }],
      desc: "'쓰다'(약 맛이 쓰다) 문맥 판별",
    },
    {
      sentence: "배가 아파서 병원에 갔어요",
      expectedPairs: [{ id: "ksl_111", word: "(신체의)배" }],
      desc: "'배'(신체 복부) 문맥 판별",
    },
    {
      sentence: "바다에서 배를 탔어요",
      expectedPairs: [
        { id: "ksl_112", word: "(탈것)배" },
        { id: "ksl_091", word: "타다" },
      ],
      desc: "'배'(선박) & '타다'(탑승) 문맥 판별",
    },
    {
      sentence: "과일 배가 달고 맛있어요",
      expectedPairs: [{ id: "ksl_113", word: "(과일)배" }],
      desc: "'배'(먹는 과일) 문맥 판별",
    },
    {
      sentence: "다리가 아파서 걷기 힘들어요",
      expectedPairs: [{ id: "ksl_109", word: "(신체의)다리" }],
      desc: "'다리'(신체 하체) 문맥 판별",
    },
    {
      sentence: "강에 있는 다리를 건너요",
      expectedPairs: [{ id: "ksl_110", word: "(시설물)다리" }],
      desc: "'다리'(교량 시설물) 문맥 판별",
    },
    {
      sentence: "추석 잘 보내세요",
      expectedPairs: [{ id: "ksl_004", word: "지내다" }],
      desc: "'보내다'(명절을 지내다) 문맥 판별",
    },
    {
      sentence: "할머니께 편지와 선물을 보내다",
      expectedPairs: [{ id: "ksl_005", word: "보내다" }],
      desc: "'보내다'(우편/물건 발송) 문맥 판별",
    },
    {
      sentence: "따뜻한 차 한잔 마셔요",
      expectedPairs: [{ id: "ksl_122", word: "(마시는)차" }],
      desc: "'차'(마시는 음료) 문맥 판별",
    },
    {
      sentence: "집에 가는 차를 타세요",
      expectedPairs: [{ id: "ksl_090", word: "차" }],
      desc: "'차'(자동차/송영차) 문맥 판별",
    },
    {
      sentence: "저 대회에 나갈 영상을 촬영할건데 할머니랑 찍어도 될까요?",
      expectedPairs: [
        { id: "ksl_099", word: "대회" },
        { id: "ksl_100", word: "참가하다" },
        { id: "ksl_104", word: "함께" },
        { id: "ksl_097", word: "찍다" },
        { id: "ksl_080", word: "가능하다" },
      ],
      desc: "복합절 구어체 ('대회에 나갈'->참가하다, '할머니랑'->함께, '촬영할건데+찍어도'->찍다 1개 압축, '될까요'->가능하다)",
    },
    {
      sentence: "오늘 귤을 보냈어요",
      expectedPairs: [{ id: "ksl_005", word: "보내다" }],
      desc: "'오늘'이 포함되어도 '귤' 문맥을 인식해 '지내다' 오역 없이 '보내다(발송)' 선택",
    },
    {
      sentence: "가지마세요",
      expectedPairs: [
        { id: "ksl_040", word: "가다" },
        { id: "ksl_082", word: "말다" },
      ],
      desc: "띄어쓰기 없는 부정/금지 어절 '가지마세요' -> [가다] + [말다(금지)] 보존",
    },
    {
      sentence: "밥먹었어요",
      expectedPairs: [
        { id: "ksl_087", word: "밥" },
        { id: "ksl_012", word: "먹다" },
      ],
      desc: "띄어쓰기 없는 복합 어절 '밥먹었어요' -> 명사 [밥] + 동사 [먹다] 동시 추출",
    },
    {
      sentence: "오늘 식사 입에 맞으세요?",
      expectedPairs: [
        { id: "ksl_011", word: "맛있다" },
        { id: "ksl_032", word: "괜찮다" },
      ],
      desc: "관용어 '입에 맞다' -> [맛있다] + [괜찮다] 문맥 의역",
    },
    {
      sentence: "마음을 단단히 먹었어요",
      expectedPairs: [
        { id: "ksl_129", word: "마음" },
        { id: "ksl_079", word: "생각하다" },
      ],
      desc: "다의어 동사 '먹다': '마음을 먹다' -> 식사[먹다] 직역 대신 [마음] + [생각하다(결심)] 의역",
    },
    {
      sentence: "겁을 먹지 마세요",
      expectedPairs: [
        { id: "ksl_145", word: "놀라다" },
        { id: "ksl_082", word: "말다" },
      ],
      desc: "다의어 동사 '먹다': '겁을 먹지 마세요' -> [놀라다(두렵다)] + [말다(금지)] 의역",
    },
    {
      sentence: "감기에 걸렸어요",
      expectedPairs: [
        { id: "ksl_062", word: "춥다" },
        { id: "ksl_018", word: "아프다" },
      ],
      desc: "다의어 동사 '걸리다': '감기에 걸리다' -> [춥다] + [아프다] 의역",
    },
    {
      sentence: "시간이 많이 걸렸어요",
      expectedPairs: [
        { id: "ksl_020", word: "시간" },
        { id: "ksl_095", word: "많이" },
      ],
      desc: "다의어 동사 '걸리다': '시간이 걸리다' -> [시간] + [많이(오래)] 의역",
    },
  ];

  let totalMsSum = 0;
  for (const hc of homonymCases) {
    const res = await translateKoreanToKsl(hc.sentence);
    const ms = res.timings?.totalMs || 0;
    totalMsSum += ms;
    const actualIds = res.kslSequence.map((s) => s.selectedSign.id);
    for (const exp of hc.expectedPairs) {
      assert(
        actualIds.includes(exp.id),
        `${hc.desc} -> [${exp.word}(${exp.id})] 정확히 선택됨 | 시퀀스: ${res.glossSummary} (${ms}ms)`
      );
    }
  }

  const avgMs = totalMsSum / homonymCases.length;
  console.log(`\n⏱️  [속도 검증] 14개 핵심 문장 평균 번역 소요 시간: ${avgMs.toFixed(2)}ms (목표 < 100ms 완벽 달성!)`);
  assert(avgMs < 100, `사전으로서의 즉각 응답 속도(${avgMs.toFixed(2)}ms < 100ms) 검증 통과`);

  console.log("\n🎉 모든 관용어 FST · 동음이의어 TF-IDF 문맥 판별 · 초고속 응답 QA를 100% 통과했습니다!");
}

runTests();
