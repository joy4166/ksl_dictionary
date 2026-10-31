import fs from "node:fs";
import path from "node:path";
import { Garu } from "garu-ko";

const DICT_PATH = path.join(process.cwd(), "src", "data", "dictionary.json");
const MODEL_OUT_PATH = path.join(process.cwd(), "src", "data", "ksl-nlp-model.json");

/**
 * [1] 국립국어원 표준국어대사전/한국어기초사전 관용구 뜻풀이 기반
 *     한국수어(KSL) 의역 변환 공식 지식베이스 (Idiom FST Patterns)
 *
 * - headBase: 관용구의 중심 체언/부사 형태소 원형
 * - predBase: 관용구의 서술어(용언) 형태소 원형 (여러 개 가능)
 * - maxDistance: 문장 내 형태소 배열에서 headBase와 predBase 사이의 최대 허용 거리 (부사/보조사 개입 허용)
 * - physicalBlockerWords: 만약 문장 내에 이 단어가 함께 등장하면 관용어가 아닌 '물리적 신체/사물 묘사'로 판정 (False Positive 방지)
 * - kslSequence: 의역된 한국수어 표제어 시퀀스
 * - literalFallbackIds: 사용자가 카드에서 '직역 수어'로 바꾸고 싶을 때 제공할 대안 수어 ID
 */
const OFFICIAL_KSL_IDIOMS = [
  {
    id: "idiom_eye_high",
    idiom: "눈이 높다",
    dictMeaning: "수준이나 기준이 높아 웬만한 것은 마음에 차지 아니하다",
    headBase: "눈",
    predBases: ["높다"],
    maxDistance: 3,
    physicalBlockerWords: ["위치", "하늘", "산"],
    kslSequence: [
      { kslGloss: "기준", targetSignId: "ksl_123", senseHint: "기준, 표준, 눈높이" },
      { kslGloss: "높다", targetSignId: "ksl_124", senseHint: "높다, 수준" },
    ],
    literalFallbackIds: ["ksl_107", "ksl_124"],
    explanation: "관용어 '눈이 높다(선택 기준이 까다롭다)'를 수어 문맥에 맞게 [기준] → [높다]로 의역했습니다.",
  },
  {
    id: "idiom_eye_low",
    idiom: "눈을 낮추다 / 눈이 낮다",
    dictMeaning: "바라는 기준이나 수준을 낮추다",
    headBase: "눈",
    predBases: ["낮다", "낮추다"],
    maxDistance: 3,
    physicalBlockerWords: ["아래", "바닥"],
    kslSequence: [
      { kslGloss: "기준", targetSignId: "ksl_123", senseHint: "기준, 표준, 눈높이" },
      { kslGloss: "낮다", targetSignId: "ksl_125", senseHint: "낮다, 아래로" },
    ],
    literalFallbackIds: ["ksl_107", "ksl_125"],
    explanation: "관용어 '눈이 낮다/낮추다(기준을 낮추다)'를 [기준] → [낮다]로 의역했습니다.",
  },
  {
    id: "idiom_hand_big",
    idiom: "손이 크다",
    dictMeaning: "음식이나 살림을 장만할 때 씀씀이가 넉넉하고 후하다",
    headBase: "손",
    predBases: ["크다"],
    maxDistance: 3,
    physicalBlockerWords: ["장갑", "손가락", "손바닥", "키", "체격", "신체"],
    kslSequence: [
      { kslGloss: "마음", targetSignId: "ksl_129", senseHint: "마음, 정성" },
      { kslGloss: "충분하다", targetSignId: "ksl_141", senseHint: "넉넉하다, 풍족하다" },
      { kslGloss: "베풀다", targetSignId: "ksl_142", senseHint: "나누어 주다, 베풀다" },
    ],
    literalFallbackIds: ["ksl_118", "ksl_126"],
    explanation: "관용어 '손이 크다(씀씀이가 넉넉하고 후하다)'를 [마음] → [충분하다(넉넉하다)] → [베풀다]로 의역했습니다.",
  },
  {
    id: "idiom_hand_lack",
    idiom: "손이 모자라다 / 손이 부족하다",
    dictMeaning: "일할 사람이 부족하다",
    headBase: "손",
    predBases: ["모자라다", "부족하다", "부족", "없다"],
    maxDistance: 3,
    physicalBlockerWords: ["다치다", "병원"],
    kslSequence: [
      { kslGloss: "사람", targetSignId: "ksl_137", senseHint: "일할 사람" },
      { kslGloss: "부족하다", targetSignId: "ksl_140", senseHint: "부족하다, 모자라다" },
    ],
    literalFallbackIds: ["ksl_118", "ksl_140"],
    explanation: "관용어 '손이 모자라다(일할 사람이 부족하다)'를 [사람] → [부족하다]로 의역했습니다.",
  },
  {
    id: "idiom_hand_skilled",
    idiom: "손에 익다",
    dictMeaning: "일이 몸에 배어 능숙해지다",
    headBase: "손",
    predBases: ["익다", "익숙하다", "익숙"],
    maxDistance: 3,
    physicalBlockerWords: ["불", "뜨겁다"],
    kslSequence: [
      { kslGloss: "습관", targetSignId: "ksl_148", senseHint: "익숙하다, 습관" },
      { kslGloss: "잘", targetSignId: "ksl_003", senseHint: "능숙하게 잘하다" },
    ],
    literalFallbackIds: ["ksl_118"],
    explanation: "관용어 '손에 익다(능숙해지다)'를 [습관(익숙하다)] → [잘]로 의역했습니다.",
  },
  {
    id: "idiom_foot_wide",
    idiom: "발이 넓다",
    dictMeaning: "사귀어 아는 사람이 많아 활동 범위가 넓다",
    headBase: "발",
    predBases: ["넓다", "크다"],
    maxDistance: 3,
    physicalBlockerWords: ["신발", "운동화", "양말", "발목", "사이즈", "치수"],
    kslSequence: [
      { kslGloss: "친하다", targetSignId: "ksl_136", senseHint: "사귀다, 친하다" },
      { kslGloss: "사람", targetSignId: "ksl_137", senseHint: "아는 사람, 인맥" },
      { kslGloss: "많이", targetSignId: "ksl_095", senseHint: "많다" },
    ],
    literalFallbackIds: ["ksl_119", "ksl_128"],
    explanation: "관용어 '발이 넓다(인맥이 넓고 아는 사람이 많다)'를 [친하다] → [사람] → [많이(많다)]로 의역했습니다.",
  },
  {
    id: "idiom_mouth_heavy",
    idiom: "입이 무겁다",
    dictMeaning: "남의 비밀이나 말을 함부로 옮기지 아니하다",
    headBase: "입",
    predBases: ["무겁다", "무겁"],
    maxDistance: 3,
    physicalBlockerWords: [],
    kslSequence: [
      { kslGloss: "비밀", targetSignId: "ksl_134", senseHint: "비밀, 말" },
      { kslGloss: "지키다", targetSignId: "ksl_135", senseHint: "굳게 지키다" },
    ],
    literalFallbackIds: ["ksl_120"],
    explanation: "관용어 '입이 무겁다(비밀을 잘 지키다)'를 [비밀] → [지키다]로 의역했습니다.",
  },
  {
    id: "idiom_mouth_light",
    idiom: "입이 가볍다 / 입이 싸다",
    dictMeaning: "남의 말이나 비밀을 지각없이 함부로 말하다",
    headBase: "입",
    predBases: ["가볍다", "싸다"],
    maxDistance: 3,
    physicalBlockerWords: [],
    kslSequence: [
      { kslGloss: "비밀", targetSignId: "ksl_134", senseHint: "비밀" },
      { kslGloss: "말하다", targetSignId: "ksl_044", senseHint: "함부로 말하다" },
    ],
    literalFallbackIds: ["ksl_120", "ksl_044"],
    explanation: "관용어 '입이 가볍다(비밀을 쉽게 말하다)'를 [비밀] → [말하다]로 의역했습니다.",
  },
  {
    id: "idiom_mouth_short",
    idiom: "입이 짧다",
    dictMeaning: "음식을 가려 먹거나 조금밖에 먹지 못하다",
    headBase: "입",
    predBases: ["짧다"],
    maxDistance: 3,
    physicalBlockerWords: [],
    kslSequence: [
      { kslGloss: "밥", targetSignId: "ksl_087", senseHint: "음식, 식사" },
      { kslGloss: "작다", targetSignId: "ksl_127", senseHint: "조금, 적게" },
      { kslGloss: "먹다", targetSignId: "ksl_012", senseHint: "먹다" },
    ],
    literalFallbackIds: ["ksl_120", "ksl_012"],
    explanation: "관용어 '입이 짧다(음식을 조금만 먹다)'를 [밥(음식)] → [작다(조금)] → [먹다]로 의역했습니다.",
  },
  {
    id: "idiom_mind_relieved",
    idiom: "마음이 놓이다 / 한시름 놓다",
    dictMeaning: "걱정이나 불안이 사라져 안심이 되다",
    headBase: "마음",
    predBases: ["놓이다", "놓다", "편하다", "편안하다"],
    maxDistance: 3,
    physicalBlockerWords: [],
    kslSequence: [
      { kslGloss: "안심하다", targetSignId: "ksl_130", senseHint: "마음이 놓이다, 안심하다" },
    ],
    literalFallbackIds: ["ksl_129", "ksl_032"],
    explanation: "관용어 '마음이 놓이다(걱정이 사라져 안심하다)'를 [안심하다]로 의역했습니다.",
  },
  {
    id: "idiom_sireum_relieved",
    idiom: "한시름 놓다",
    dictMeaning: "걱정거리가 해결되어 안심하다",
    headBase: "한시름",
    predBases: ["놓다", "덜다"],
    maxDistance: 3,
    physicalBlockerWords: [],
    kslSequence: [
      { kslGloss: "안심하다", targetSignId: "ksl_130", senseHint: "한시름 놓다, 안심하다" },
    ],
    literalFallbackIds: ["ksl_130"],
    explanation: "관용어 '한시름 놓다'를 [안심하다]로 의역했습니다.",
  },
  {
    id: "idiom_heart_hurt",
    idiom: "마음이 아프다 / 가슴이 아프다",
    dictMeaning: "안타깝거나 슬퍼서 심정이 괴롭다",
    headBase: "마음",
    predBases: ["아프다", "쓰리다", "찢어지다"],
    maxDistance: 3,
    physicalBlockerWords: ["병원", "수술", "약", "내과", "진료"],
    kslSequence: [
      { kslGloss: "마음", targetSignId: "ksl_129", senseHint: "마음, 심정" },
      { kslGloss: "슬프다", targetSignId: "ksl_050", senseHint: "슬프고 속상하다" },
    ],
    literalFallbackIds: ["ksl_129", "ksl_018"],
    explanation: "관용어 '마음이 아프다(속상하고 슬프다)'를 [마음] → [슬프다]로 의역했습니다.",
  },
  {
    id: "idiom_chest_hurt",
    idiom: "가슴이 아프다",
    dictMeaning: "안타깝거나 슬퍼서 마음이 괴롭다",
    headBase: "가슴",
    predBases: ["아프다", "쓰리다", "찢어지다", "먹먹하다"],
    maxDistance: 3,
    physicalBlockerWords: ["병원", "수술", "약", "내과", "진료", "숨", "호흡", "통증"],
    kslSequence: [
      { kslGloss: "마음", targetSignId: "ksl_129", senseHint: "가슴, 마음" },
      { kslGloss: "슬프다", targetSignId: "ksl_050", senseHint: "슬프고 안타깝다" },
    ],
    literalFallbackIds: ["ksl_018"],
    explanation: "관용어 '가슴이 아프다(마음이 슬프고 안타깝다)'를 [마음] → [슬프다]로 의역했습니다.",
  },
  {
    id: "idiom_chest_warm",
    idiom: "가슴이 따뜻하다 / 마음이 따뜻하다",
    dictMeaning: "성품이나 인정이 많고 다정하다",
    headBase: "가슴",
    predBases: ["따뜻하다", "넓다"],
    maxDistance: 3,
    physicalBlockerWords: ["난로", "온도"],
    kslSequence: [
      { kslGloss: "마음", targetSignId: "ksl_129", senseHint: "마음, 성품" },
      { kslGloss: "따뜻하다", targetSignId: "ksl_064", senseHint: "따뜻하다, 다정하다" },
    ],
    literalFallbackIds: ["ksl_129", "ksl_064"],
    explanation: "관용구 '가슴이 따뜻하다'를 [마음] → [따뜻하다]로 변환했습니다.",
  },
  {
    id: "idiom_ear_thin",
    idiom: "귀가 얇다",
    dictMeaning: "남의 말을 쉽게 그대로 믿다",
    headBase: "귀",
    predBases: ["얇다"],
    maxDistance: 3,
    physicalBlockerWords: [],
    kslSequence: [
      { kslGloss: "남(사람)", targetSignId: "ksl_137", senseHint: "다른 사람" },
      { kslGloss: "말하다", targetSignId: "ksl_044", senseHint: "말" },
      { kslGloss: "잘", targetSignId: "ksl_003", senseHint: "쉽게" },
    ],
    literalFallbackIds: ["ksl_121"],
    explanation: "관용어 '귀가 얇다(남의 말을 쉽게 믿다)'를 의역했습니다.",
  },
  {
    id: "idiom_stomach_jealous",
    idiom: "배가 아프다 (질투/부러움)",
    dictMeaning: "남이 잘되는 것을 보고 질투가 나거나 부러워 속이 상하다",
    headBase: "배",
    predBases: ["아프다"],
    maxDistance: 4,
    requireContextWords: ["사촌", "땅", "부자", "성공", "일등", "합격", "부럽다", "잘되다"],
    kslSequence: [
      { kslGloss: "부럽다", targetSignId: "ksl_146", senseHint: "샘나다, 부럽다" },
    ],
    literalFallbackIds: ["ksl_111", "ksl_018"],
    explanation: "속담/관용어 '사촌이 땅을 사면 배가 아프다(남이 잘되어 샘나고 부럽다)'의 문맥을 감지하여 [부럽다(샘나다)]로 의역했습니다.",
  },
  {
    id: "idiom_busy_eyes_nose",
    idiom: "눈코 뜰 새 없다",
    dictMeaning: "정신을 차릴 수 없을 만큼 매우 바쁘다",
    headBase: "눈",
    predBases: ["뜨다"],
    maxDistance: 3,
    requireContextWords: ["코"],
    consumeSpanTerms: ["코", "새", "없다"],
    physicalBlockerWords: [],
    kslSequence: [
      { kslGloss: "많이", targetSignId: "ksl_095", senseHint: "매우, 아주" },
      { kslGloss: "바쁘다", targetSignId: "ksl_139", senseHint: "바쁘다, 분주하다" },
    ],
    literalFallbackIds: ["ksl_107", "ksl_139"],
    explanation: "관용어 '눈코 뜰 새 없다(매우 바쁘다)'를 [많이] → [바쁘다]로 의역했습니다.",
  },
  {
    id: "idiom_liver_fall",
    idiom: "간이 떨어지다 / 가슴이 철렁하다",
    dictMeaning: "매우 깜짝 놀라다",
    headBase: "간",
    predBases: ["떨어지다", "작다", "콩알만"],
    maxDistance: 3,
    physicalBlockerWords: ["병원", "수술", "건강"],
    kslSequence: [
      { kslGloss: "놀라다", targetSignId: "ksl_145", senseHint: "깜짝 놀라다" },
    ],
    literalFallbackIds: ["ksl_145"],
    explanation: "관용어 '간이 떨어지다(깜짝 놀라다)'를 [놀라다]로 의역했습니다.",
  },
  {
    id: "idiom_sweat_effort",
    idiom: "땀을 흘리다",
    dictMeaning: "힘을 들여 열심히 노력하다",
    headBase: "땀",
    predBases: ["흘리다", "나다"],
    maxDistance: 3,
    physicalBlockerWords: ["덥다", "여름", "사우나", "열"],
    kslSequence: [
      { kslGloss: "열심히", targetSignId: "ksl_147", senseHint: "열심히 노력하다" },
    ],
    literalFallbackIds: ["ksl_147"],
    explanation: "관용어 '땀을 흘리다(열심히 노력하다)'를 [열심히]로 의역했습니다.",
  },
  {
    id: "idiom_angry_heat",
    idiom: "열이 받다 / 속이 터지다 / 화가 나다",
    dictMeaning: "몹시 화가 나거나 답답하다",
    headBase: "속",
    predBases: ["터지다", "상하다", "타다"],
    maxDistance: 3,
    physicalBlockerWords: ["배", "소화"],
    kslSequence: [
      { kslGloss: "화나다", targetSignId: "ksl_132", senseHint: "화가 나다, 속상하다" },
    ],
    literalFallbackIds: ["ksl_132", "ksl_050"],
    explanation: "관용어 '속이 터지다/상하다'를 [화나다]로 의역했습니다.",
  },
  {
    id: "idiom_taste_suit",
    idiom: "입에 맞다 / 입맛에 맞다",
    dictMeaning: "음식 맛이 기호에 맞아 맛있다",
    headBase: "입",
    predBases: ["맞다"],
    maxDistance: 3,
    physicalBlockerWords: ["크기", "마스크"],
    kslSequence: [
      { kslGloss: "맛있다", targetSignId: "ksl_011", senseHint: "음식이 입에 맞아 맛있다" },
      { kslGloss: "괜찮다", targetSignId: "ksl_032", senseHint: "좋다, 괜찮다" },
    ],
    literalFallbackIds: ["ksl_120", "ksl_056"],
    explanation: "관용어 '입에 맞다(음식이 맛있다)'를 수어 문맥에 맞게 [맛있다] → [괜찮다]로 의역했습니다.",
  },
  {
    id: "idiom_appetite_none",
    idiom: "입맛이 없다",
    dictMeaning: "음식을 먹고 싶은 생각이 없다",
    headBase: "입맛",
    predBases: ["없다", "아니다"],
    maxDistance: 3,
    physicalBlockerWords: [],
    kslSequence: [
      { kslGloss: "밥", targetSignId: "ksl_087", senseHint: "음식, 식사" },
      { kslGloss: "먹다", targetSignId: "ksl_012", senseHint: "먹다" },
      { kslGloss: "싫다", targetSignId: "ksl_047", senseHint: "먹고 싶지 않다" },
    ],
    literalFallbackIds: ["ksl_059"],
    explanation: "관용어 '입맛이 없다(음식을 먹고 싶지 않다)'를 [밥] → [먹다] → [싫다]로 의역했습니다.",
  },
  {
    id: "idiom_mind_like",
    idiom: "마음에 들다",
    dictMeaning: "대상이 좋게 여겨져 호감이 가다",
    headBase: "마음",
    predBases: ["들다", "드시다"],
    maxDistance: 3,
    physicalBlockerWords: [],
    kslSequence: [
      { kslGloss: "좋아하다", targetSignId: "ksl_046", senseHint: "마음에 들다, 좋아하다" },
    ],
    literalFallbackIds: ["ksl_129"],
    explanation: "관용어 '마음에 들다(좋아하다)'를 [좋아하다]로 의역했습니다.",
  },
  {
    id: "idiom_wait_eagerly",
    idiom: "목이 빠지게 기다리다",
    dictMeaning: "몹시 애타게 오랫동안 기다리다",
    headBase: "목",
    predBases: ["빠지다"],
    maxDistance: 3,
    physicalBlockerWords: ["병원", "뼈", "다치다"],
    kslSequence: [
      { kslGloss: "많이", targetSignId: "ksl_095", senseHint: "간절히, 많이" },
      { kslGloss: "기다리다", targetSignId: "ksl_054", senseHint: "기다리다" },
    ],
    literalFallbackIds: ["ksl_054"],
    explanation: "관용어 '목이 빠지다(애타게 기다리다)'를 [많이] → [기다리다]로 의역했습니다.",
  },
  // ============================================================================
  // [다의어 동사 연어(Collocation) -> KSL 문맥 의역 규칙]
  // ('먹다', '걸리다', '맞다', '끊다' 등 목적어에 따라 수어 동사가 달라지는 구문)
  // ============================================================================
  {
    id: "colloc_mind_decide",
    idiom: "마음을 먹다",
    dictMeaning: "어떤 일을 하기로 결심하거나 다짐하다",
    headBase: "마음",
    predBases: ["먹다", "드시다"],
    maxDistance: 3,
    physicalBlockerWords: [],
    kslSequence: [
      { kslGloss: "마음", targetSignId: "ksl_129", senseHint: "마음, 다짐" },
      { kslGloss: "생각하다", targetSignId: "ksl_079", senseHint: "결심하다, 생각하다" },
    ],
    literalFallbackIds: ["ksl_129", "ksl_012"],
    explanation: "다의어 연어 '마음을 먹다(결심하다)'를 직역(식사)하지 않고 [마음] → [생각하다(결심하다)]로 의역했습니다.",
  },
  {
    id: "colloc_age_grow",
    idiom: "나이를 먹다 / 연세를 드시다",
    dictMeaning: "해가 지나 나이가 많아지다",
    headBase: "나이",
    predBases: ["먹다", "드시다", "들다"],
    maxDistance: 3,
    physicalBlockerWords: [],
    kslSequence: [
      { kslGloss: "어르신", targetSignId: "ksl_085", senseHint: "나이, 연세, 어르신" },
      { kslGloss: "많이", targetSignId: "ksl_095", senseHint: "나이가 많아지다" },
    ],
    literalFallbackIds: ["ksl_085", "ksl_012"],
    explanation: "다의어 연어 '나이를 먹다(연세가 들다)'를 음식 섭취 수어 대신 [어르신(나이)] → [많이]로 의역했습니다.",
  },
  {
    id: "colloc_fear_eat",
    idiom: "겁을 먹다 / 겁이 나다",
    dictMeaning: "무섭거나 두려운 마음이 생기다",
    headBase: "겁",
    predBases: ["먹다", "나다", "집어먹다"],
    maxDistance: 3,
    physicalBlockerWords: [],
    kslSequence: [
      { kslGloss: "놀라다", targetSignId: "ksl_145", senseHint: "무섭다, 두렵다, 놀라다" },
    ],
    literalFallbackIds: ["ksl_145", "ksl_012"],
    explanation: "관용어 '겁을 먹다(두려워하다)'를 [놀라다(두렵다)]로 의역했습니다.",
  },
  {
    id: "colloc_heat_eat",
    idiom: "더위를 먹다",
    dictMeaning: "더운 기운에 지쳐 몸이 아프고 기운이 빠지다",
    headBase: "더위",
    predBases: ["먹다"],
    maxDistance: 3,
    physicalBlockerWords: [],
    kslSequence: [
      { kslGloss: "덥다", targetSignId: "ksl_063", senseHint: "더위, 무덥다" },
      { kslGloss: "아프다", targetSignId: "ksl_018", senseHint: "병이 나다, 아프다" },
    ],
    literalFallbackIds: ["ksl_063", "ksl_012"],
    explanation: "관용어 '더위를 먹다(더위로 몸이 상하다)'를 [덥다] → [아프다]로 의역했습니다.",
  },
  {
    id: "colloc_cold_catch",
    idiom: "감기에 걸리다",
    dictMeaning: "감기 바이러스로 인해 몸이 아프다",
    headBase: "감기",
    predBases: ["걸리다", "들다"],
    maxDistance: 3,
    physicalBlockerWords: [],
    kslSequence: [
      { kslGloss: "춥다", targetSignId: "ksl_062", senseHint: "감기, 오한" },
      { kslGloss: "아프다", targetSignId: "ksl_018", senseHint: "병에 걸리다, 아프다" },
    ],
    literalFallbackIds: ["ksl_018"],
    explanation: "다의어 구문 '감기에 걸리다'를 [춥다(감기)] → [아프다]로 의역했습니다.",
  },
  {
    id: "colloc_disease_catch",
    idiom: "병에 걸리다",
    dictMeaning: "질병이 생겨 몸이 아프다",
    headBase: "병",
    predBases: ["걸리다", "나다"],
    maxDistance: 3,
    physicalBlockerWords: ["유리", "물병", "약병", "깨지다"],
    kslSequence: [
      { kslGloss: "아프다", targetSignId: "ksl_018", senseHint: "질병으로 아프다" },
    ],
    literalFallbackIds: ["ksl_018"],
    explanation: "다의어 구문 '병에 걸리다/병이 나다'를 [아프다]로 의역했습니다.",
  },
  {
    id: "colloc_time_take",
    idiom: "시간이 걸리다",
    dictMeaning: "어떤 일에 시간이 소요되다",
    headBase: "시간",
    predBases: ["걸리다", "들다"],
    maxDistance: 3,
    physicalBlockerWords: [],
    kslSequence: [
      { kslGloss: "시간", targetSignId: "ksl_020", senseHint: "시간" },
      { kslGloss: "많이", targetSignId: "ksl_095", senseHint: "오래 걸리다, 소요되다" },
    ],
    literalFallbackIds: ["ksl_020"],
    explanation: "다의어 구문 '시간이 걸리다(소요되다)'를 [시간] → [많이(오래)]로 의역했습니다.",
  },
  {
    id: "colloc_mind_bother",
    idiom: "마음에 걸리다",
    dictMeaning: "안심이 되지 않고 걱정스럽거나 신경이 쓰이다",
    headBase: "마음",
    predBases: ["걸리다", "쓰이다"],
    maxDistance: 3,
    physicalBlockerWords: [],
    kslSequence: [
      { kslGloss: "걱정하다", targetSignId: "ksl_131", senseHint: "신경 쓰이고 걱정되다" },
    ],
    literalFallbackIds: ["ksl_129", "ksl_131"],
    explanation: "관용어 '마음에 걸리다(걱정되다)'를 [걱정하다]로 의역했습니다.",
  },
  {
    id: "colloc_energy_none",
    idiom: "기운이 없다 / 힘이 없다",
    dictMeaning: "몸이 지치고 피곤하여 기력이 없다",
    headBase: "기운",
    predBases: ["없다", "빠지다", "아니다"],
    maxDistance: 3,
    physicalBlockerWords: [],
    kslSequence: [
      { kslGloss: "피곤하다", targetSignId: "ksl_051", senseHint: "지치고 기운이 없다" },
      { kslGloss: "아프다", targetSignId: "ksl_018", senseHint: "몸 상태가 편찮다" },
    ],
    literalFallbackIds: ["ksl_051", "ksl_059"],
    explanation: "완곡 표현 '기운이 없다(기력이 없고 지치다)'를 [피곤하다] → [아프다]로 의역했습니다.",
  },
  {
    id: "idiom_eye_match_love",
    idiom: "눈이 맞다",
    dictMeaning: "서로 마음이 통하거나 사랑하는 사이가 되다",
    headBase: "눈",
    predBases: ["맞다"],
    maxDistance: 3,
    physicalBlockerWords: ["공", "손", "주먹", "다치다", "병원", "안과"],
    kslSequence: [
      { kslGloss: "함께", targetSignId: "ksl_104", senseHint: "서로, 함께" },
      { kslGloss: "사랑하다", targetSignId: "ksl_048", senseHint: "눈이 맞다, 사랑하다" },
    ],
    literalFallbackIds: ["ksl_107", "ksl_056"],
    explanation: "관용어 '눈이 맞다(서로 호감을 느끼고 사랑하다)'를 [함께] → [사랑하다]로 의역했습니다.",
  },
  {
    id: "idiom_foot_cut",
    idiom: "발을 끊다 / 발길이 끊기다",
    dictMeaning: "오고 가는 관계를 완전히 끊다",
    headBase: "발",
    predBases: ["끊다", "끊기다"],
    maxDistance: 3,
    physicalBlockerWords: ["병원", "수술", "다치다"],
    kslSequence: [
      { kslGloss: "오다", targetSignId: "ksl_041", senseHint: "왕래하다, 방문하다" },
      { kslGloss: "아니다", targetSignId: "ksl_057", senseHint: "오지 않다, 끊다" },
    ],
    literalFallbackIds: ["ksl_119", "ksl_057"],
    explanation: "관용어 '발을 끊다(왕래하지 않다)'를 [오다] → [아니다]로 의역했습니다.",
  },
  {
    id: "idiom_mouth_promise",
    idiom: "입을 맞추다",
    dictMeaning: "여러 사람이 미리 말을 똑같이 맞추어 약속하다",
    headBase: "입",
    predBases: ["맞추다"],
    maxDistance: 3,
    physicalBlockerWords: [],
    kslSequence: [
      { kslGloss: "함께", targetSignId: "ksl_104", senseHint: "함께, 서로" },
      { kslGloss: "약속", targetSignId: "ksl_144", senseHint: "미리 말을 맞추어 약속하다" },
    ],
    literalFallbackIds: ["ksl_120", "ksl_144"],
    explanation: "관용어 '입을 맞추다(말을 맞추어 약속하다)'를 [함께] → [약속]으로 의역했습니다.",
  },
];

/**
 * [2] 동음이의어/다의어 공식 의미 클러스터 및 문맥 연어(Collocation) 가중치 데이터
 * - 국립국어원 한국수어사전의 뜻풀이(meaning) + 수형 설명 + 실제 구어체 공기어(collocations)를 결합하여
 *   Garu 형태소 분석기를 거쳐 TF-IDF 가중치 테이블로 컴파일합니다.
 */
const HOMONYM_SENSE_CLUSTERS = {
  눈: {
    defaultSignId: "ksl_107",
    senses: [
      {
        signId: "ksl_107",
        word: "(신체의)눈",
        label: "신체/시각 기관",
        prior: 5,
        strongCollocations: [
          "뜨다", "감다", "비비다", "아프다", "침침하다", "보이다", "보다",
          "안경", "눈물", "시력", "안과", "얼굴", "마주치다", "깜빡이다",
          "충혈", "부시다", "피곤하다", "크다", "작다", "예쁘다", "초롱초롱",
        ],
        contextKeywords: ["신체", "사람", "안구", "시각", "얼굴", "빛", "물체"],
      },
      {
        signId: "ksl_108",
        word: "눈(이 내리다)",
        label: "날씨/강수 현상",
        prior: 3,
        strongCollocations: [
          "내리다", "오다", "쌓이다", "녹다", "치우다", "쓸다", "미끄럽다",
          "겨울", "춥다", "하늘", "길", "함박눈", "폭설", "첫눈", "눈사람",
          "비", "날씨", "우산", "얼다", "하얗다",
        ],
        contextKeywords: ["대기", "수증기", "기운", "가루", "날씨", "겨울", "강수"],
      },
    ],
  },
  다리: {
    defaultSignId: "ksl_109",
    senses: [
      {
        signId: "ksl_109",
        word: "(신체의)다리",
        label: "신체 부위(하체)",
        prior: 6,
        strongCollocations: [
          "아프다", "다치다", "부러지다", "삐다", "저리다", "붓다", "힘들다",
          "걷다", "뛰다", "서다", "앉다", "주무르다", "마사지", "운동", "체조",
          "무릎", "허리", "발", "근육", "병원", "치료", "산책", "피곤하다", "길다", "짧다",
        ],
        contextKeywords: ["사람", "짐승", "몸통", "신체", "보행", "하체", "정강이"],
      },
      {
        signId: "ksl_110",
        word: "(시설물)다리",
        label: "교량/도로 시설물",
        prior: 2,
        strongCollocations: [
          "건너다", "건너가다", "무너지다", "놓다", "건설하다", "지나다",
          "강", "한강", "개울", "바다", "도로", "길", "차", "버스", "육교",
          "철교", "대교", "교량", "붕괴", "위험하다",
        ],
        contextKeywords: ["구조물", "교량", "시설물", "건너다", "도로", "강"],
      },
    ],
  },
  배: {
    defaultSignId: "ksl_111",
    senses: [
      {
        signId: "ksl_111",
        word: "(신체의)배",
        label: "신체 부위(복부)",
        prior: 6,
        strongCollocations: [
          "아프다", "고프다", "부르다", "배고프다", "배부르다", "고파요", "불러요",
          "소화", "장염", "설사", "배탈", "병원", "약", "화장실", "만지다",
          "따뜻하다", "차갑다", "살", "나오다", "신체", "복부", "위장",
        ],
        contextKeywords: ["가슴", "엉덩이", "복부", "위장", "신체", "통증"],
      },
      {
        signId: "ksl_112",
        word: "(탈것)배",
        label: "선박/해상 교통수단",
        prior: 2,
        strongCollocations: [
          "타다", "내리다", "뜨다", "출발하다", "도착하다", "건너다", "침몰하다",
          "바다", "강", "섬", "제주도", "항구", "선착장", "선박", "유람선",
          "여객선", "어선", "멀미", "파도", "물", "여행",
        ],
        contextKeywords: ["물", "짐", "탈것", "선박", "항해", "바다"],
      },
      {
        signId: "ksl_113",
        word: "(과일)배",
        label: "먹는 과일(배나무 열매)",
        prior: 2,
        strongCollocations: [
          "깎다", "먹다", "드시다", "맛있다", "달다", "시원하다", "즙",
          "과일", "사과", "감", "귤", "간식", "후식", "선물", "상자",
          "껍질", "쪼개다", "나눠먹다", "사다",
        ],
        contextKeywords: ["배나무", "열매", "과실", "과일", "달콤하다", "식사"],
      },
    ],
  },
  밤: {
    defaultSignId: "ksl_114",
    senses: [
      {
        signId: "ksl_114",
        word: "(시간)밤",
        label: "야간/어두운 시간",
        prior: 6,
        strongCollocations: [
          "자다", "주무시다", "잠", "늦다", "어둡다", "깊다", "새우다",
          "어제", "오늘", "내일", "저녁", "새벽", "아침", "하늘", "별", "달",
          "무섭다", "조용하다", "춥다", "시간", "열시", "열한시",
        ],
        contextKeywords: ["해", "날", "시간", "야간", "어두운", "밤중"],
      },
      {
        signId: "ksl_115",
        word: "(열매)밤",
        label: "먹는 밤(견과류 열매)",
        prior: 2,
        strongCollocations: [
          "먹다", "드시다", "굽다", "삶다", "까다", "줍다", "맛있다", "달다",
          "군밤", "알밤", "생밤", "껍질", "송이", "가시", "가을", "산",
          "간식", "고구마", "과일",
        ],
        contextKeywords: ["밤나무", "열매", "견과류", "군밤", "알밤"],
      },
    ],
  },
  보내다: {
    defaultSignId: "ksl_004",
    senses: [
      {
        signId: "ksl_004",
        word: "지내다",
        label: "시간·명절·주말을 보내다(생활하다)",
        prior: 6,
        strongCollocations: [
          "추석", "설날", "명절", "주말", "휴일", "방학", "휴가", "시간",
          "하루", "연말", "새해", "생일", "생신", "연휴", "일주일",
          "잘", "즐겁다", "행복하다", "편안하다", "어떻게",
        ],
        contextKeywords: ["시간", "주말", "명절", "생활하다", "살아가다"],
      },
      {
        signId: "ksl_005",
        word: "보내다",
        label: "편지·물건·소포를 발송하다",
        prior: 3,
        strongCollocations: [
          "편지", "택배", "소포", "선물", "물건", "사진", "영상", "문자",
          "메시지", "이메일", "메일", "카톡", "서류", "문서", "파일", "상자",
          "박스", "짐", "과일", "귤", "사과", "배", "김치", "반찬", "음식",
          "약", "돈", "송금", "우체국", "주소", "집", "고향", "아들", "딸",
          "가족", "친구", "부모님", "선생님", "어르신", "할머니", "할아버지",
          "부치다", "전달하다", "받다", "배달", "배송",
        ],
        contextKeywords: ["편지", "소포", "물건", "발송하다", "부치다"],
      },
    ],
  },
  나가다: {
    defaultSignId: "ksl_101",
    senses: [
      {
        signId: "ksl_100",
        word: "참가하다",
        label: "대회·시합·모임에 출전/참가하다",
        prior: 4,
        strongCollocations: [
          "대회", "경진대회", "시합", "경기", "공모전", "행사", "모임",
          "노래자랑", "발표회", "출전하다", "참여하다", "일등", "상",
        ],
        contextKeywords: ["대회", "모임", "행사", "참가", "출전"],
      },
      {
        signId: "ksl_101",
        word: "나가다",
        label: "밖으로 외출하다/이동하다",
        prior: 5,
        strongCollocations: [
          "밖", "집", "문", "산책", "마당", "거리", "길", "외출하다",
          "잠깐", "바람", "공원", "병원", "시장",
        ],
        contextKeywords: ["안", "밖", "이동", "외출"],
      },
    ],
  },
  차: {
    defaultSignId: "ksl_090",
    senses: [
      {
        signId: "ksl_090",
        word: "차",
        label: "자동차/송영 차량",
        prior: 5,
        strongCollocations: [
          "타다", "내리다", "운전하다", "오다", "가다", "출발하다", "기다리다",
          "길", "도로", "집", "병원", "버스", "택시", "승합차", "송영",
          "안전벨트", "조심하다", "막히다",
        ],
        contextKeywords: ["자동차", "차량", "송영", "승합차", "탈것"],
      },
      {
        signId: "ksl_122",
        word: "(마시는)차",
        label: "마시는 차(음료/다과)",
        prior: 4,
        strongCollocations: [
          "마시다", "드시다", "끓이다", "타다", "따뜻하다", "뜨겁다", "시원하다",
          "물", "커피", "녹차", "보리차", "홍차", "한잔", "컵", "간식", "맛있다", "향",
        ],
        contextKeywords: ["찻잎", "우려내다", "음료", "마시다", "녹차"],
      },
    ],
  },
  말: {
    defaultSignId: "ksl_044",
    senses: [
      {
        signId: "ksl_044",
        word: "말하다",
        label: "사람의 말/언어/이야기",
        prior: 7,
        strongCollocations: [
          "하다", "듣다", "이해하다", "전하다", "나누다", "걸다", "예쁘다",
          "고맙다", "미안하다", "거짓말", "인사", "목소리", "이야기", "대화",
          "천천히", "크게", "무슨",
        ],
        contextKeywords: ["생각", "느낌", "입", "수어", "표현", "말씀", "대화"],
      },
      {
        signId: "ksl_117",
        word: "(동물)말",
        label: "네 발 달린 동물(경주마/승마)",
        prior: 2,
        strongCollocations: [
          "타다", "달리다", "뛰다", "먹이", "당근", "동물", "동물원",
          "목장", "제주도", "승마", "마차", "빠르다", "갈기",
        ],
        contextKeywords: ["짐승", "가축", "동물", "경주마", "조랑말", "승마"],
      },
    ],
  },
  쓰다: {
    defaultSignId: "ksl_154",
    senses: [
      {
        signId: "ksl_154",
        word: "(글을)쓰다",
        label: "글씨·편지·이름을 적다",
        prior: 5,
        strongCollocations: [
          "글", "글씨", "편지", "이름", "성함", "일기", "책", "종이",
          "연필", "볼펜", "적다", "서명", "공책", "칠판", "카드",
        ],
        contextKeywords: ["종이", "글씨", "적다", "문장", "작성", "필기"],
      },
      {
        signId: "ksl_153",
        word: "(모자·안경을)쓰다",
        label: "모자·안경·우산을 착용하다",
        prior: 4,
        strongCollocations: [
          "모자", "안경", "돋보기", "우산", "마스크", "선글라스", "헬멧",
          "머리", "얼굴", "눈", "햇빛", "비", "벗다",
        ],
        contextKeywords: ["모자", "안경", "우산", "머리", "얼굴", "착용"],
      },
      {
        signId: "ksl_155",
        word: "(맛이)쓰다",
        label: "약이나 음식 맛이 쓰다",
        prior: 3,
        strongCollocations: [
          "약", "한약", "가루약", "맛", "입", "입맛", "커피", "나물",
          "먹다", "삼키다", "달다", "시다", "짜다", "물",
        ],
        contextKeywords: ["약", "음식", "맛", "달지", "쓴맛"],
      },
    ],
  },
  타다: {
    defaultSignId: "ksl_091",
    senses: [
      {
        signId: "ksl_091",
        word: "타다",
        label: "자동차·버스·배에 탑승하다",
        prior: 6,
        strongCollocations: [
          "차", "자동차", "버스", "택시", "기차", "지하철", "비행기", "배",
          "엘리베이터", "휠체어", "내리다", "출발", "집", "병원", "송영",
        ],
        contextKeywords: ["자동차", "버스", "탈것", "탑승", "승차"],
      },
      {
        signId: "ksl_116",
        word: "(말을)타다",
        label: "말이나 자전거에 올라타다",
        prior: 2,
        strongCollocations: [
          "말", "동물", "자전거", "오토바이", "목장", "승마", "제주도",
        ],
        contextKeywords: ["말", "자전거", "승마", "올라타다"],
      },
    ],
  },
  바람: {
    defaultSignId: "ksl_106",
    senses: [
      {
        signId: "ksl_106",
        word: "바람",
        label: "부는 바람(날씨/공기)",
        prior: 6,
        strongCollocations: [
          "불다", "추운", "춥다", "차갑다", "시원하다", "세다", "강하다",
          "날씨", "비", "눈", "태풍", "강풍", "창문", "산책", "옷", "바다", "가을", "겨울",
        ],
        contextKeywords: ["기압", "공기", "흐름", "날씨", "강풍", "불다"],
      },
      {
        signId: "ksl_076",
        word: "원하다",
        label: "소원·희망·바라는 마음",
        prior: 3,
        strongCollocations: [
          "이루어지다", "소원", "희망", "마음", "나의", "우리", "건강하다",
          "행복하다", "기도", "간절하다", "바라다", "꿈",
        ],
        contextKeywords: ["소원", "희망", "바라다", "원하다", "기대"],
      },
    ],
  },
  드시다: {
    defaultSignId: "ksl_012",
    senses: [
      {
        signId: "ksl_012",
        word: "먹다",
        label: "식사·음식·간식을 드시다",
        prior: 6,
        strongCollocations: [
          "밥", "식사", "점심", "아침", "저녁", "간식", "과일", "사과", "배", "밤",
          "고기", "떡", "국", "반찬", "맛있다", "많이", "배부르다", "배고프다", "약",
        ],
        contextKeywords: ["음식", "밥", "삼키다", "식사", "진지"],
      },
      {
        signId: "ksl_089",
        word: "마시다",
        label: "물·차·음료를 마시다",
        prior: 4,
        strongCollocations: [
          "물", "차", "커피", "녹차", "보리차", "주스", "우유", "음료",
          "국물", "한잔", "컵", "따뜻하다", "시원하다", "목마르다",
        ],
        contextKeywords: ["물", "차", "음료수", "마시다"],
      },
    ],
  },
  사과: {
    defaultSignId: "ksl_071",
    senses: [
      {
        signId: "ksl_071",
        word: "사과",
        label: "먹는 과일 사과",
        prior: 5,
        strongCollocations: [
          "먹다", "드시다", "깎다", "맛있다", "달다", "과일", "배", "감", "귤",
          "간식", "빨갛다", "상자", "쪼개다", "씻다",
        ],
        contextKeywords: ["사과나무", "열매", "과일", "간식"],
      },
      {
        signId: "ksl_060",
        word: "미안하다",
        label: "잘못을 사과하다(죄송하다)",
        prior: 4,
        strongCollocations: [
          "하다", "드리다", "받다", "잘못", "실수", "용서", "미안하다",
          "죄송하다", "마음", "진심", "화나다", "화해",
        ],
        contextKeywords: ["잘못", "미안하다", "죄송", "사과하다"],
      },
    ],
  },
};

/**
 * Garu로 문장이나 어절에서 순수 내용어 원형(명사, 동사/형용사 원형, 부사)을 추출하는 헬퍼
 */
function extractContentBases(garu, text) {
  const raw = garu.analyze(text);
  const analyzed = Array.isArray(raw) ? raw[0] : raw;
  const bases = new Set();

  for (const t of analyzed.tokens) {
    if (t.pos === "NNG" || t.pos === "NNP" || t.pos === "MAG" || t.pos === "NR") {
      if (t.text.length >= 1) bases.add(t.text);
    } else if (t.pos === "VV" || t.pos === "VA") {
      bases.add(`${t.text}다`);
      bases.add(t.text);
    }
  }
  return Array.from(bases);
}

async function buildModel() {
  const garu = await Garu.load();
  const dictionary = JSON.parse(fs.readFileSync(DICT_PATH, "utf-8"));
  const dictById = new Map(dictionary.map((d) => [d.id, d]));

  console.log("⚙️  Garu 형태소 분석기를 이용해 공식 수어사전 정의문 & 연어 TF-IDF 가중치 모델을 컴파일합니다...");

  // 전체 문서(의미 클러스터)에서의 단어 등장 빈도(DF) 계산
  const docFreq = new Map();
  let totalDocs = 0;

  const tempSenseTokens = new Map();

  for (const [homonymKey, cluster] of Object.entries(HOMONYM_SENSE_CLUSTERS)) {
    for (const sense of cluster.senses) {
      totalDocs++;
      const entry = dictById.get(sense.signId);
      const dictCorpus = entry
        ? `${entry.meaning} ${entry.signDescription} ${(entry.keywords || []).join(" ")} ${(entry.synonyms || []).join(" ")}`
        : "";

      const dictBases = extractContentBases(garu, dictCorpus);
      const strongBases = new Set();
      for (const word of sense.strongCollocations) {
        strongBases.add(word);
        for (const b of extractContentBases(garu, word)) {
          strongBases.add(b);
        }
      }
      const contextBases = new Set();
      for (const word of sense.contextKeywords || []) {
        contextBases.add(word);
        for (const b of extractContentBases(garu, word)) {
          contextBases.add(b);
        }
      }

      const allUniqueInDoc = new Set([...dictBases, ...strongBases, ...contextBases]);
      for (const token of allUniqueInDoc) {
        docFreq.set(token, (docFreq.get(token) || 0) + 1);
      }

      tempSenseTokens.set(`${homonymKey}_${sense.signId}`, {
        dictBases,
        strongBases: Array.from(strongBases),
        contextBases: Array.from(contextBases),
      });
    }
  }

  // 각 동음이의어의 Sense별 TF-IDF + Collocation 가중치 맵 생성
  const compiledHomonyms = {};

  for (const [homonymKey, cluster] of Object.entries(HOMONYM_SENSE_CLUSTERS)) {
    compiledHomonyms[homonymKey] = {
      defaultSignId: cluster.defaultSignId,
      senses: cluster.senses.map((sense) => {
        const tokenData = tempSenseTokens.get(`${homonymKey}_${sense.signId}`);
        const weights = {};

        // 1) 사전 정의문/수형 설명 형태소 (기본 Lesk TF-IDF 점수: 4 ~ 8점)
        for (const token of tokenData.dictBases) {
          if (token === homonymKey || token.length < 1) continue;
          const df = docFreq.get(token) || 1;
          const idf = Math.log((totalDocs + 1) / (df + 0.5)) + 1;
          weights[token] = Math.round(idf * 3.5 * 10) / 10;
        }

        // 2) 핵심 문맥 키워드 (중간 가중치: 12 ~ 18점)
        for (const token of tokenData.contextBases) {
          if (token === homonymKey) continue;
          const df = docFreq.get(token) || 1;
          const idf = Math.log((totalDocs + 1) / (df + 0.5)) + 1;
          weights[token] = Math.max(weights[token] || 0, Math.round((8 + idf * 4) * 10) / 10);
        }

        // 3) 구어체 핵심 공기어/연어 (Strong Collocations: 22 ~ 32점)
        for (const token of tokenData.strongBases) {
          if (token === homonymKey) continue;
          const df = docFreq.get(token) || 1;
          const idf = Math.log((totalDocs + 1) / (df + 0.5)) + 1;
          weights[token] = Math.max(weights[token] || 0, Math.round((18 + idf * 5) * 10) / 10);
        }

        return {
          signId: sense.signId,
          word: sense.word,
          label: sense.label,
          prior: sense.prior,
          weights,
        };
      }),
    };
  }

  // [3] 수어 역검색용 Garu 형태소 기반 수형·동작 원형 인덱스(reverseMotionIndex) 컴파일
  const reverseMotionIndex = {};
  for (const entry of dictionary) {
    // 국립국어원 한국수어사전 공식 수형 설명(signDescription)만 순수하게 인덱싱하여 이전 태그 오매칭 방지
    const motionCorpus = `${entry.signDescription} ${entry.actionSummary}`;
    const bases = new Set(extractContentBases(garu, motionCorpus));

    // 국립국어원 수형 전문 표기(1지=검지, 2지=중지, 4지=새끼손가락, 5지=엄지, 상하, 밖으로 내밀다)를 일상 동작 어휘와 양방향 연결
    if (/(?<![·\d])1지|1·|검지/.test(motionCorpus)) {
      bases.add("검지");
      bases.add("1지");
    }
    if (/1·2지|2지|중지|V자/.test(motionCorpus)) {
      bases.add("V자");
      bases.add("2지");
      bases.add("중지");
    }
    if (/4지|새끼손가락|소지/.test(motionCorpus)) {
      bases.add("새끼손가락");
      bases.add("4지");
    }
    if (/5지|엄지/.test(motionCorpus)) {
      bases.add("엄지");
      bases.add("5지");
    }
    if (/두\s*(손|주먹)|양손/.test(motionCorpus)) {
      bases.add("양손");
    }
    if (/코끝|코에|코\s/.test(motionCorpus)) {
      bases.add("코");
      bases.add("코끝");
    }
    if (/입술|입가|입에|입으로|입\s/.test(motionCorpus)) {
      bases.add("입");
      bases.add("입술");
    }
    if (/뺨|볼/.test(motionCorpus)) {
      bases.add("볼");
      bases.add("뺨");
    }
    if (/손목/.test(motionCorpus)) {
      bases.add("손목");
    }
    if (/손등|팔등/.test(motionCorpus)) {
      bases.add("손등");
    }
    if (/구부리|굽히|접어|접는|구부려/.test(motionCorpus)) {
      bases.add("구부리다");
      bases.add("접다");
    }
    if (/두드리|톡톡|통통|(?<!맞부딪)치며|(?<!맞부딪)친다/.test(motionCorpus)) {
      bases.add("두드리다");
      bases.add("치다");
      bases.add("톡톡");
    }
    if (/비비|비빈|문지르|문질러|닦아/.test(motionCorpus)) {
      bases.add("비비다");
      bases.add("문지르다");
    }
    if (/스치|스쳐|쓸어|그은/.test(motionCorpus)) {
      bases.add("스치다");
      bases.add("쓸다");
    }
    if (/(?<!맞)(댔|대고|대며|대어|댄다|대다|닿게|닿다)/.test(motionCorpus)) {
      bases.add("대다");
    }
    if (/맞대|맞댔|마주|붙이|붙인/.test(motionCorpus)) {
      bases.add("맞대다");
      bases.add("붙이다");
    }
    if (/떼며|떼면서|뗐다|떼고|벌리|벌린/.test(motionCorpus)) {
      bases.add("떼다");
      bases.add("벌리다");
    }
    if (/건다|걸고|걸어/.test(motionCorpus)) {
      bases.add("걸다");
    }
    if (/상하|위아래|올렸다 내|올리고 내/.test(motionCorpus)) {
      bases.add("위아래");
      bases.add("상하");
    }
    if (/좌우|양옆/.test(motionCorpus)) {
      bases.add("좌우");
    }
    // '손바닥이 밖으로 향하게'(수향)는 제외하고, 실제 앞/밖으로 내미는 수동(Movement)만 인덱싱
    if (/밖으로\s*(내밀|내민|밀|내미)|앞으로|내밀|내민/.test(motionCorpus)) {
      bases.add("앞으로");
      bases.add("내밀다");
    }

    reverseMotionIndex[entry.id] = Array.from(bases);
  }

  const finalModel = {
    version: "2.1.0-ksl-nlp",
    generatedAt: new Date().toISOString(),
    stats: {
      totalDictionaryEntries: dictionary.length,
      totalIdioms: OFFICIAL_KSL_IDIOMS.length,
      totalHomonymGroups: Object.keys(compiledHomonyms).length,
      totalHomonymSenses: totalDocs,
    },
    idioms: OFFICIAL_KSL_IDIOMS,
    homonyms: compiledHomonyms,
    reverseMotionIndex,
  };

  fs.writeFileSync(MODEL_OUT_PATH, JSON.stringify(finalModel, null, 2), "utf-8");
  console.log(`✅ ksl-nlp-model.json 컴파일 완료!`);
  console.log(`   - 관용구 FST 패턴: ${finalModel.stats.totalIdioms}종`);
  console.log(`   - 동음이의어 클러스터: ${finalModel.stats.totalHomonymGroups}개 그룹 (${finalModel.stats.totalHomonymSenses}개 세부 의미)`);
}

buildModel();
