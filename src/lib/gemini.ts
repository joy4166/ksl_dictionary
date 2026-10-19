import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import {
  getAllDictionaryEntries,
  getSignById,
  searchHybridDictionary,
  searchReverseByMotionLocal,
} from "@/lib/ksl-dictionary";
import {
  ReverseSearchCandidate,
  SignWordEntry,
  TranslatedSignToken,
  TranslationResult,
} from "@/types/sign";

const MODEL_CANDIDATES = [
  "gemini-flash-latest",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
];

let cachedWorkingModel: string | null = null;

function resolveGeminiApiKey(customApiKey?: string): string | null {
  const apiKey = customApiKey?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === "your_gemini_api_key_here" || apiKey === "") {
    return null;
  }
  return apiKey;
}

function getGeminiClient(customApiKey?: string): GoogleGenerativeAI | null {
  const apiKey = resolveGeminiApiKey(customApiKey);
  if (!apiKey) return null;
  return new GoogleGenerativeAI(apiKey);
}

/**
 * 사용자의 API 키로 접근 가능한 실제 Gemini 모델 목록을 Google API에서 동적 조회
 */
async function fetchAvailableGeminiModels(apiKey: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
        apiKey
      )}`
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      models?: Array<{
        name?: string;
        supportedGenerationMethods?: string[];
      }>;
    };
    if (!data.models) return [];
    const usable = data.models
      .filter((m) =>
        m.supportedGenerationMethods?.includes("generateContent")
      )
      .map((m) => (m.name || "").replace(/^models\//, ""))
      .filter((name) => name.startsWith("gemini-"));

    // flash 계열 모델을 최우선 정렬
    return usable.sort((a, b) => {
      const aFlash = a.includes("flash") ? 1 : 0;
      const bFlash = b.includes("flash") ? 1 : 0;
      return bFlash - aFlash;
    });
  } catch {
    return [];
  }
}

/**
 * 신규/기존 API 키 환경에 따라 지원 모델명이 다를 때(404 에러 시 에러 메시지 내 추천 모델 및 ListModels API 동적 탐색)
 * 자동으로 호환 모델을 찾아 JSON 응답을 생성하는 래퍼
 */
async function generateJsonWithGemini<T>(
  genAI: GoogleGenerativeAI,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  responseSchema: any,
  prompt: string,
  customApiKey?: string
): Promise<T> {
  const queue = cachedWorkingModel
    ? [
        cachedWorkingModel,
        ...MODEL_CANDIDATES.filter((m) => m !== cachedWorkingModel),
      ]
    : [...MODEL_CANDIDATES];

  const tried = new Set<string>();
  let discoveredFromApi = false;
  let lastError: unknown = null;

  while (queue.length > 0) {
    const modelName = queue.shift()!;
    if (tried.has(modelName)) continue;
    tried.add(modelName);

    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema,
        },
      });
      const result = await model.generateContent(prompt);
      const parsed = JSON.parse(result.response.text()) as T;
      cachedWorkingModel = modelName;
      return parsed;
    } catch (err) {
      lastError = err;
      const errMsg = err instanceof Error ? err.message : String(err);

      // 1) 에러 메시지 내 모든 "models/xxx" 추출하여 아직 안 써본 추천 모델 즉시 추가
      const matches = [...errMsg.matchAll(/models\/([a-zA-Z0-9._-]+)/g)];
      for (const m of matches) {
        const candidate = m[1];
        if (candidate && !tried.has(candidate)) {
          queue.unshift(candidate);
        }
      }

      // 2) 여전히 큐가 비어 가거나 404가 발생하면 ListModels 엔드포인트에서 활성 모델을 동적으로 조회
      if (!discoveredFromApi && errMsg.includes("404")) {
        discoveredFromApi = true;
        const apiKey = resolveGeminiApiKey(customApiKey);
        if (apiKey) {
          const available = await fetchAvailableGeminiModels(apiKey);
          for (const avail of available) {
            if (!tried.has(avail)) {
              queue.push(avail);
            }
          }
        }
      }
    }
  }

  throw lastError;
}

interface DecomposedToken {
  originalPart: string;
  kslGloss: string;
  synonyms: string[];
  selectionReason?: string;
  role?: "time" | "normal" | "negation" | "question" | "tense";
}

interface Stage1Output {
  tokens: DecomposedToken[];
  nonManualTip: string;
  contextExplanation?: string;
}

/**
 * 한국어 불규칙 활용 및 높임말/일상 표현 사전 매핑 테이블
 */
const IRREGULAR_AND_IDIOM_MAP: Array<{
  pattern: RegExp;
  kslGloss: string;
  synonyms: string[];
  role?: DecomposedToken["role"];
  selectionReason?: string;
}> = [
  // 인사 / 감사 / 사과
  {
    pattern: /^(안녕|안녕하세요|안녕하십니까|안녕히|반가워요|반갑습니다)$/,
    kslGloss: "안녕하세요",
    synonyms: ["안녕", "인사", "반갑다"],
  },
  {
    pattern: /^(고마워|고마워요|고맙습니다|고마웠어요|고맙다|감사|감사합니다|감사해요|감사드려요)$/,
    kslGloss: "고맙다",
    synonyms: ["감사", "감사합니다"],
  },
  {
    pattern: /^(미안|미안해|미안해요|미안합니다|죄송|죄송해요|죄송합니다|실례합니다)$/,
    kslGloss: "미안하다",
    synonyms: ["죄송", "사과"],
  },

  // 시간 / 명절 / 요일 (KSL 문장 맨 앞 배치)
  {
    pattern: /^어제(는|도|부터|까지)?$|^어저께(는|도)?$/,
    kslGloss: "어제",
    synonyms: ["어저께", "작일"],
    role: "time",
  },
  {
    pattern: /^그저께(는|도)?$|^그제$/,
    kslGloss: "그저께",
    synonyms: ["그제"],
    role: "time",
  },
  {
    pattern: /^오늘(은|도|부터|까지)?$|^금일$/,
    kslGloss: "오늘",
    synonyms: ["금일", "지금"],
    role: "time",
  },
  {
    pattern: /^내일(은|도|부터|까지)?$/,
    kslGloss: "내일",
    synonyms: ["명일", "다음 날"],
    role: "time",
  },
  {
    pattern: /^모레(는|도)?$|^내일모레$/,
    kslGloss: "모레",
    synonyms: ["내일모레"],
    role: "time",
  },
  {
    pattern: /^아침(에|에는|도|밥|식사)?$|^오전(에)?$/,
    kslGloss: "아침",
    synonyms: ["오전"],
    role: "time",
  },
  {
    pattern: /^점심(에|에는|도|밥|식사)?$|^낮(에)?$/,
    kslGloss: "점심",
    synonyms: ["식사", "밥"],
    role: "time",
  },
  {
    pattern: /^저녁(에|에는|도|밥|식사)?$|^오후(에)?$/,
    kslGloss: "저녁",
    synonyms: ["오후"],
    role: "time",
  },
  {
    pattern: /^주말(에|에는|도|을)?$|^휴일(에|도|을)?$|^연휴(에|도|를)?$/,
    kslGloss: "주말",
    synonyms: ["휴일", "연휴"],
    role: "time",
  },
  {
    pattern: /^추석(에|에는|도|을|명절)?$|^한가위(에|도|를)?$/,
    kslGloss: "추석",
    synonyms: ["한가위", "명절"],
    role: "time",
  },
  {
    pattern: /^설날(에|에는|도|을)?$|^구정(에)?$|^새해(에|도|복)?$/,
    kslGloss: "설날",
    synonyms: ["새해", "구정", "명절"],
    role: "time",
  },
  {
    pattern: /^잠시(만)?$|^잠깐(만)?$|^조금(만)?$|^이따가$/,
    kslGloss: "잠시",
    synonyms: ["잠깐", "조금"],
    role: "time",
  },

  // 높임말 용언 변환 (주무시다, 드시다, 편찮으시다, 계시다, 말씀하다, 뵙다)
  {
    pattern: /^주무(시다|세요|셨어요|셨나요|셨습니까|실|시겠어요)|^자(다|요|자|고|러)|^잤(어요|나요)|^잠(을|은|이|도)?$/,
    kslGloss: "자다",
    synonyms: ["주무시다", "잠", "취침"],
    selectionReason: "높임말 '주무시다/잠'은 한국수어 기본형 '자다' 수어로 표현합니다.",
  },
  {
    pattern: /^편찮(으시다|으신|으세요|으셨어요|은)|^아프(다|세요|셨어요|지)|^아파(요|서)?|^아팠(어요|나요)|^아픈(데)?|^통증(이|은)?$/,
    kslGloss: "아프다",
    synonyms: ["편찮다", "통증", "병"],
    selectionReason: "'편찮으시다/아파요'는 한국수어 기본형 '아프다'에 걱정하는 표정을 더해 표현합니다.",
  },
  {
    pattern: /^계(시다|세요|셨어요|신가요)|^있(다|어요|으세요|습니까|나요|는)$/,
    kslGloss: "있다",
    synonyms: ["계시다", "존재"],
  },
  {
    pattern: /^없(다|어요|으세요|습니까|나요|는)$/,
    kslGloss: "없다",
    synonyms: ["안 계시다"],
  },
  {
    pattern: /^말씀(을|도|하시다|하세요|하셨어요)?|^말(을|하다|해요|하세요|했어요)|^이야기(하다|해요|하세요)?$/,
    kslGloss: "말하다",
    synonyms: ["말씀", "이야기", "대화"],
  },
  {
    pattern: /^봬요$|^뵙(다|겠습니다|어요)|^만나(다|요|세요|셨어요|자|서)$/,
    kslGloss: "만나다",
    synonyms: ["봬요", "뵙다", "상봉"],
  },
  {
    pattern: /^드릴(까요|게요)|^드리(다|고|면)|^드려요|^주(다|세요|셨어요|시겠어요)|^줘요$/,
    kslGloss: "드리다",
    synonyms: ["주다", "바치다"],
  },

  // 불규칙 형용사/동사 (춥다, 덥다, 따뜻하다, 배고프다, 배부르다, 기쁘다, 슬프다, 피곤하다, 맛있다)
  {
    pattern: /^춥(다|고|지|네요)|^추워(요|서)?|^추우(세요|신가요)|^추웠(어요|나요)|^추운(데)?|^쌀쌀(하다|해요)?$/,
    kslGloss: "춥다",
    synonyms: ["추위", "차갑다"],
  },
  {
    pattern: /^덥(다|고|지|네요)|^더워(요|서)?|^더우(세요|신가요)|^더웠(어요|나요)|^더운(데)?$/,
    kslGloss: "덥다",
    synonyms: ["더위", "뜨겁다"],
  },
  {
    pattern: /^따뜻(하다|해요|하게|한|하네요)|^포근(하다|해요)?$/,
    kslGloss: "따뜻하다",
    synonyms: ["온기", "포근하다"],
  },
  {
    pattern: /^배고프(다|세요|신가요|지)|^배고파(요|서)?|^배고팠(어요|나요)|^시장(하다|하세요|하시죠)|^출출(하다|하세요)?$/,
    kslGloss: "배고프다",
    synonyms: ["시장하다", "출출하다", "고프다"],
  },
  {
    pattern: /^배부르(다|세요|신가요|지)|^배불러(요|서)?|^배불렀(어요|나요)|^든든(하다|해요|하세요)?$/,
    kslGloss: "배부르다",
    synonyms: ["포만감", "든든하다"],
  },
  {
    pattern: /^기쁘(다|고|네요)|^기뻐(요|서)?|^기쁜|^즐겁(다|게)|^즐거워(요)?|^행복(하다|해요|하세요|한)?|^신나(다|요)?$/,
    kslGloss: "기쁘다",
    synonyms: ["즐겁다", "행복", "신나다"],
  },
  {
    pattern: /^슬프(다|고|네요)|^슬퍼(요|서)?|^슬픈|^속상(하다|해요|하세요)?|^우울(하다|해요)?$/,
    kslGloss: "슬프다",
    synonyms: ["속상하다", "눈물", "우울"],
  },
  {
    pattern: /^피곤(하다|해요|하세요|하셨죠|한)?|^힘들(다|어요|으세요|었죠)|^고단(하다|하세요)?|^지치(다|셨죠)?$/,
    kslGloss: "피곤하다",
    synonyms: ["피곤", "피로", "힘들다"],
  },
  {
    pattern: /^맛있(다|게|어요|으세요|었나요|네요|는)$/,
    kslGloss: "맛있다",
    synonyms: ["맛", "별미"],
  },
  {
    pattern: /^괜찮(다|아요|으세요|으신가요|습니다|은)$/,
    kslGloss: "괜찮다",
    synonyms: ["좋다", "문제없다"],
  },
  {
    pattern: /^좋아(하다|해요|하세요|하시는)|^호감$/,
    kslGloss: "좋아하다",
    synonyms: ["좋다", "선호"],
  },
  {
    pattern: /^좋(다|아요|으세요|았어요|은|네요)|^잘$/,
    kslGloss: "잘",
    synonyms: ["좋다", "훌륭하다"],
  },
  {
    pattern: /^싫(다|어요|으세요|은)|^싫어(하다|해요|하세요)$/,
    kslGloss: "싫다",
    synonyms: ["거절", "불호"],
  },
  {
    pattern: /^사랑(하다|해요|합니다|하는|을)?$/,
    kslGloss: "사랑하다",
    synonyms: ["사랑", "애정"],
  },
  {
    pattern: /^생신(을|도|이)?$|^생일(을|도|이)?$/,
    kslGloss: "생일",
    synonyms: ["생신", "탄신일"],
    selectionReason: "높임말 '생신'은 한국수어 표제어 '생일' 수어로 표현합니다.",
  },
  {
    pattern: /^축하(하다|해요|합니다|드려요|드립니다|해)$/,
    kslGloss: "축하하다",
    synonyms: ["축하", "경축"],
  },

  // 일상 핵심 동사
  {
    pattern: /^가(다|요|세요|셨어요|자|고|서|면)|^갔(어요|나요)|^갑(니다|시다)$/,
    kslGloss: "가다",
    synonyms: ["이동하다", "출발"],
  },
  {
    pattern: /^오(다|세요|셨어요|시나요|자|고|면)|^와(요|서)?|^왔(어요|나요)|^옵(니다)$/,
    kslGloss: "오다",
    synonyms: ["도착하다"],
  },
  {
    pattern: /^들어가(다|세요|셨어요|요)|^돌아가(다|세요|요)|^귀가(하다|하세요)?$/,
    kslGloss: "돌아가다",
    synonyms: ["귀가", "들어가다"],
    selectionReason: "귀가 인사의 '들어가세요'는 집으로 돌아간다는 뜻의 '돌아가다' 수어를 사용합니다.",
  },
  {
    pattern: /^보(다|세요|셨어요|고|면|자)|^봐(요|서)?|^봤(어요|나요)|^봅(니다|시다)$/,
    kslGloss: "보다",
    synonyms: ["시청하다", "구경"],
  },
  {
    pattern: /^듣(다|고)|^들어(요|보세요)|^들으(세요|셨어요)|^들었(어요|나요)$/,
    kslGloss: "듣다",
    synonyms: ["청취", "귀"],
  },
  {
    pattern: /^앉(다|아|아요|으세요|으셨어요|았어요|자)$/,
    kslGloss: "앉다",
    synonyms: ["착석"],
  },
  {
    pattern: /^쉬(다|어요|세요|셨어요|자|고)$/,
    kslGloss: "쉬다",
    synonyms: ["휴식"],
  },
  {
    pattern: /^기다리(다|고)|^기다려(요|주세요)$/,
    kslGloss: "기다리다",
    synonyms: ["대기"],
  },
  {
    pattern: /^도와(주다|줘요|주세요|드릴까요|드려요)|^돕(다|고)|^도움(을)?$/,
    kslGloss: "도와주다",
    synonyms: ["돕다", "도움"],
  },
  {
    pattern: /^시작(하다|해요|하세요|합니다|했어요|할까요|을)?$/,
    kslGloss: "시작하다",
    synonyms: ["시작", "출발"],
  },
  {
    pattern: /^조심(하다|해요|하세요|히)$/,
    kslGloss: "조심하다",
    synonyms: ["조심", "주의"],
  },
  {
    pattern: /^천천히$|^느리(게|다)$/,
    kslGloss: "천천히",
    synonyms: ["느리게"],
  },
  {
    pattern: /^수어(로|를|는)?$|^수화(로|를|는)?$/,
    kslGloss: "수어",
    synonyms: ["수화"],
  },

  // 의문사 (KSL 문법상 문장 끝으로 이동)
  {
    pattern: /^어디(가|에|에서|로|서|요)?$/,
    kslGloss: "어디",
    synonyms: ["어느 곳"],
    role: "question",
  },
  {
    pattern: /^어떠(세요|신가요|셨어요)|^어때(요)?|^어떻(다|게)|^어찌$/,
    kslGloss: "어떻다",
    synonyms: ["어떻게", "어찌"],
    role: "question",
  },
  {
    pattern: /^무엇(을|이)?$|^뭐(예요|야|를|가|하러)?$|^무슨$/,
    kslGloss: "무엇",
    synonyms: ["뭐"],
    role: "question",
  },
  {
    pattern: /^언제(요|부터|까지)?$/,
    kslGloss: "언제",
    synonyms: ["어느 때"],
    role: "question",
  },
  {
    pattern: /^누구(예요|세요|를|와|랑)?$|^누가$/,
    kslGloss: "누구",
    synonyms: ["어느 분"],
    role: "question",
  },
  {
    pattern: /^왜(요)?$/,
    kslGloss: "왜",
    synonyms: ["어째서", "이유"],
    role: "question",
  },

  // 긍정 / 부정 (부정은 KSL 문법상 문장 끝으로 이동)
  {
    pattern: /^네$|^예$|^맞(다|아요|습니다)$/,
    kslGloss: "맞다",
    synonyms: ["네", "긍정"],
  },
  {
    pattern: /^아니(다|요|오|에요)|^안$|^않(다|아요|으세요|았어요)$/,
    kslGloss: "아니다",
    synonyms: ["아니오", "부정"],
    role: "negation",
  },
  {
    pattern: /^못$|^못해(요)?$|^못하(다|세요|셨어요|겠어요)$|^불가능(하다|해요)?$/,
    kslGloss: "못하다",
    synonyms: ["불가능", "안되다"],
    role: "negation",
    selectionReason: "능력·상황상 할 수 없음을 뜻하는 부정 표현 '못하다'는 서술어 뒤에 배치합니다.",
  },
  {
    pattern: /^마(세요|십시오|요)$|^말(다|아요|자)$|^안돼(요)?$/,
    kslGloss: "말다",
    synonyms: ["금지", "하지마"],
    role: "negation",
    selectionReason: "'~지 마세요'와 같은 금지·만류 표현은 한국수어에서 서술어 뒤에 '말다(금지)' 수어를 배치합니다.",
  },
  {
    pattern: /^(가능(하다|해요|하세요|할까요|한가요)?|될까요|되나요|돼요|될까|괜찮을까요)$/,
    kslGloss: "가능하다",
    synonyms: ["괜찮다", "할수있다", "되다"],
    selectionReason: "허락·가능 여부를 묻는 '될까요?/가능한가요?'는 한국수어 '가능하다(괜찮다)' 수어로 표현합니다.",
  },
  {
    pattern: /^(저(는|도)?|제(가)?|나(는|도)?|내(가)?)$/,
    kslGloss: "나",
    synonyms: ["저", "본인"],
    selectionReason: "1인칭 대명사 '저/제가/나'는 한국수어 기본형 '나' 수어로 표현합니다.",
  },
  {
    pattern: /^촬영(하다|해요|하세요|할건데요?|할텐데요?|하려고요?|할까요|할래요|했어요|합시다|을|이)?$|^찍(다|어요|으세요|어도|을까요|을래요|을건데요?|자|고)$/,
    kslGloss: "찍다",
    synonyms: ["촬영하다", "사진", "영상"],
    selectionReason: "한자어 '촬영하다/촬영할건데'와 '찍어도'는 직관적인 기본 동작 수어 '찍다'로 변환합니다.",
  },
  {
    pattern: /^(같이|함께|다같이|더불어)$/,
    kslGloss: "함께",
    synonyms: ["같이", "다같이"],
  },
  {
    pattern: /^참가(하다|해요|할|하는)?$|^참여(하다|해요|할)?$|^출전(하다|해요|할)?$|^참석(하다|해요|할)?$/,
    kslGloss: "참가하다",
    synonyms: ["참여하다", "출전하다"],
  },
];

/**
 * 일반 한국어 어절(명사+조사, 동사/형용사+어미, 복합 연결어미·양태 어미)에서
 * 국립국어원 한국수어사전 표제어(기본형)와 검색 후보군을 추출하는 한국어 형태소·화용 분석기
 */
function analyzeGeneralKoreanWord(rawWord: string): {
  kslGloss: string;
  synonyms: string[];
  role?: DecomposedToken["role"];
  selectionReason?: string;
} | null {
  // 순수 의존명사/형식 어절 제외
  if (/^(것|거|곳|수|줄|지|후|데|바|건데|텐데)$/.test(rawWord)) {
    return null;
  }

  // 1) '~하고 싶다 / ~고 싶어요 / ~고 싶으세요'의 '싶어요/싶다' -> '원하다'
  if (/^싶(다|어요|으세요|은데|습니다|으신가요|네요)$/.test(rawWord)) {
    return {
      kslGloss: "원하다",
      synonyms: ["바라다", "희망", "하고싶다"],
      selectionReason: "'~고 싶다/싶으세요'와 같은 희망·의향 표현은 한국수어 '원하다' 수어로 변환합니다.",
    };
  }

  // 2) '~하다' 파생 용언 활용형 처리 (배경절 '~할건데/~할텐데/~하는데', 허락형 '~해도', 의향형 '~하실래요/~할까요' 포함)
  const hadaMatch = rawWord.match(
    /^([가-힣]{1,})(하시다|하세요|하셨어요|하셨나요|하실래요|하실래|하실까요|하시겠어요|하시나요|하실건데요?|하실|합니다|합니까|해요|했나요|했어요|했다|하고|하지|하게|할건데요?|할텐데요?|할까요|할래요|할래|하려고요?|하는데요?|해도|하다|한|할)$/
  );
  if (hadaMatch) {
    const stem = hadaMatch[1];
    // 쉬운 기본 수어(Easy-KSL) 치환 우선 적용
    if (stem === "촬영") {
      return {
        kslGloss: "찍다",
        synonyms: ["촬영하다", "사진", "영상"],
        selectionReason: `'${rawWord}'는 농아인 어르신이 이해하기 쉬운 기본 동작 수어 '찍다'로 변환합니다.`,
      };
    }
    if (stem === "참석" || stem === "참여" || stem === "출전" || stem === "참가") {
      return {
        kslGloss: "참가하다",
        synonyms: ["참여하다", "참가"],
      };
    }
    return {
      kslGloss: `${stem}하다`,
      synonyms: [stem, `${stem}하다`],
    };
  }

  // 3) 일반 용언 어미 제거 후 기본형('-다') 복원 시도
  // 배경절 어미(-을건데/-ㄹ건데/-는데), 양보·허락 어미(-아도/-어도), 의향·관형 어미(-(으)실래요/-(으)실/-(으)ㄹ) 완벽 지원
  const verbEndings = [
    /(으셨어요|으셨나요|으셨습니까|으시겠어요|으실래요|으실래|으실까요|으실건데요?|으세요|으신가요|으실|으신)$/,
    /(셨어요|셨나요|셨습니까|시겠어요|실래요|실래|실까요|실건데요?|세요|신가요|실)$/,
    /(을건데요?|ㄹ건데요?|을텐데요?|ㄹ텐데요?|을래요|을래|을까요|ㄹ래요|ㄹ까요|겠어요|겠습니까|겠나요)$/,
    /(았어요|었어요|았나요|었나요|았습니다|었습니다|았다|었다|아도|어도|여도)$/,
    /(습니다|습니까|ㅂ니다|ㅂ니까|네요|군요|구먼요|지요|죠|어요|아요|여요|는데|은데)$/,
    /(고|지|게|며|면서|자|러|려고|니까|아서|어서|면|으면)$/,
  ];

  for (const regex of verbEndings) {
    if (regex.test(rawWord) && rawWord.length >= 2) {
      const stem = rawWord.replace(regex, "");
      if (stem.length >= 1) {
        const candidates: string[] = [`${stem}다`, stem];
        if (stem === "드") {
          return {
            kslGloss: "먹다",
            synonyms: ["드시다", "식사", "밥", "마시다"],
            selectionReason: `높임·의향 표현 '${rawWord}'의 기본형을 추출하여 한국수어 표준 표제어 '먹다'로 변환했습니다.`,
          };
        }
        if (stem === "찍") {
          return {
            kslGloss: "찍다",
            synonyms: ["촬영하다", "사진", "영상"],
          };
        }
        if (stem === "되" || stem === "될") {
          return {
            kslGloss: "가능하다",
            synonyms: ["괜찮다", "되다"],
            selectionReason: `허락·가능 여부를 묻는 '${rawWord}'는 한국수어 '가능하다(괜찮다)' 수어로 변환합니다.`,
          };
        }
        if (stem === "걸") {
          return {
            kslGloss: "걷다",
            synonyms: ["산책", "보행"],
          };
        }
        if (stem === "들") {
          return {
            kslGloss: "듣다",
            synonyms: ["들리다", "청취"],
          };
        }
        if (stem === "물") {
          return {
            kslGloss: "묻다",
            synonyms: ["질문하다", "여쭙다"],
          };
        }
        if (stem === "마" && /마(실|시|셔|셨)/.test(rawWord)) {
          return {
            kslGloss: "마시다",
            synonyms: ["음료", "물", "먹다"],
          };
        }
        if (stem === "주무") {
          return {
            kslGloss: "자다",
            synonyms: ["주무시다", "잠"],
          };
        }
        if (stem.endsWith("셔")) {
          candidates.unshift(`${stem.slice(0, -1)}시다`);
        } else if (stem.endsWith("려")) {
          candidates.unshift(`${stem.slice(0, -1)}리다`);
        } else if (stem.endsWith("워")) {
          candidates.unshift(`${stem.slice(0, -1)}우다`, `${stem.slice(0, -1)}다`);
        } else if (stem.endsWith("해")) {
          candidates.unshift(`${stem.slice(0, -1)}하다`, stem.slice(0, -1));
        } else if (/실래|실까|시겠|셨|세요|실$/.test(rawWord)) {
          candidates.unshift(`${stem}다`, `${stem}시다`);
        }
        return {
          kslGloss: candidates[0],
          synonyms: Array.from(new Set(candidates)),
        };
      }
    }
  }

  // 4) 체언(명사/대명사) + 조사 제거
  const PROTECTED_WORDS = new Set([
    "어제",
    "그제",
    "모레",
    "오늘",
    "내일",
    "지금",
    "아침",
    "점심",
    "저녁",
    "주말",
    "추석",
    "설날",
    "기분",
    "시간",
    "체조",
    "산책",
    "여기",
    "거기",
    "저기",
    "어디",
    "언제",
    "누구",
    "무엇",
    "화장실",
    "병원",
    "가족",
    "생일",
    "노래",
    "사과",
    "포도",
    "우유",
    "커피",
    "버스",
    "지하철",
    "어르신",
    "선생님",
    "간식",
    "할머니",
    "할아버지",
    "대회",
    "영상",
    "사진",
  ]);

  if (PROTECTED_WORDS.has(rawWord)) {
    return { kslGloss: rawWord, synonyms: [rawWord] };
  }

  let stripped = rawWord.replace(
    /(에서부터|으로부터|에게서|한테서|에게는|한테는|에서는|으로는|이라도|까지도|마저도|조차도|처럼|보다|마다|부터|까지|에서|으로|에게|한테|하고|이랑|께서|에는|에도|만은|만이)$/,
    ""
  );

  if (stripped === rawWord && rawWord.length >= 2) {
    const candidateStem = rawWord.replace(
      /(은|는|이|가|을|를|에|로|와|과|도|만|의|랑|께|요)$/,
      ""
    );
    if (candidateStem.length >= 1) {
      stripped = candidateStem;
    }
  }

  if (!stripped) return null;

  return {
    kslGloss: stripped,
    synonyms: [stripped, rawWord, `${stripped}하다`],
  };
}

/**
 * 한국수어(KSL) 절(Clause)·구문 덩어리(Chunk) 분석 및 핵심 의미 압축 엔진
 * - 1단계 (구문 덩어리 매핑):
 *      - '대회에 나갈' -> [대회] + [참가하다] ('나갈'이 '매진'으로 오매칭되는 문제 원천 차단)
 *      - '할머니랑 / 선생님과' -> [할머니] + [함께] (공동격 조사 '~랑/와/과' 의미 보존)
 *      - '~찍어도 될까요? / ~해도 괜찮을까요?' -> [찍다] + [가능하다] (허락·가능 구문 매핑)
 * - 2단계 (쉬운 기본 수어 치환 & 절간 중복 서술어 압축):
 *      - '촬영할건데'와 '찍어도'처럼 앞절(배경 설명)과 뒷절(본절)에서 중복되는 서술어를 단일 기본 수어 '[찍다]'로 통합('촬영할건데 · 찍어도 → 찍다')
 * - 3단계 (KSL 문법 어순 재배치):
 *      - [시간] -> [주어/배경절/목적어/동반자(명사+함께)/핵심동사] -> [가능/부정/완료] -> [의문사]
 */
export function decomposeSentenceKslEngine(sentence: string): Stage1Output {
  const clean = sentence.trim();
  const isQuestion =
    clean.includes("?") ||
    /(까요|나요|래요|어요\?|세요\?|습니까|신가요|어떠세요|어때요|어디|무엇|뭐|언제|누구|왜)/.test(
      clean
    );
  const isPastTense =
    /(셨어요|셨습니까|셨나요|했어요|했나요|았어요|었어요|았나요|었나요|드셨|주무셨|오셨|가셨|봤어요|보셨)/.test(
      clean
    );
  const isTimeSpendContext =
    /(추석|명절|한가위|설날|주말|휴일|연휴|오늘|어제|내일|하루|시간|세월|방학|휴가|생일|생신)/.test(
      clean
    );
  const isMedicineContext = /(약|알약|물약|진통제|소화제|복약)/.test(clean);
  const isBeverageContext = /(물|차|녹차|홍차|보리차|커피|우유|주스|음료|음료수|국물)/.test(
    clean
  );
  const isParticipationContext = /(대회|경진대회|시합|경기|공모전|모임|행사)/.test(
    clean
  );
  const isAbilityContext = /(수\s*있(어요|으세요|나요|습니까)|가능(해요|하세요|할까요))/.test(
    clean
  );

  // 띄어쓰기가 붙어있는 구문(예: "찍어도될까요", "촬영할건데") 정규화 전처리
  const preNormalized = clean
    .replace(/(할|실|을)\s*(건데요?|텐데요?)/g, "$1건데")
    .replace(/([가-힣]+)(아도|어도|여도|해도)\s*(될까요|되나요|돼요|될까|괜찮을까요)/g, "$1$2 $3");

  const rawWords = preNormalized
    .replace(/[?!.,~"']/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const timeTokens: DecomposedToken[] = [];
  const normalTokens: DecomposedToken[] = [];
  const modalityEndTokens: DecomposedToken[] = [];
  const negationTokens: DecomposedToken[] = [];
  const questionTokens: DecomposedToken[] = [];
  const explanationNotes: string[] = [];

  for (let idx = 0; idx < rawWords.length; idx++) {
    const rawWord = rawWords[idx];
    const nextWord = rawWords[idx + 1] || "";

    // [구문 덩어리 1] '(대회/행사/모임)에 나갈/나가는/나가다' -> [대회] + [참가하다]
    if (
      /^(대회|경진대회|시합|경기|공모전|행사|모임)(에|에서|을|를)?$/.test(rawWord) &&
      /^나(갈|가다|가는|가요|갑니다)|^출전|^참가/.test(nextWord)
    ) {
      const nounBase = rawWord.replace(/(에|에서|을|를)$/, "");
      normalTokens.push({
        originalPart: rawWord,
        kslGloss: nounBase === "경진대회" || nounBase === "시합" || nounBase === "공모전" ? "대회" : nounBase,
        synonyms: [nounBase, "대회"],
      });
      normalTokens.push({
        originalPart: `${rawWord} ${nextWord}`,
        kslGloss: "참가하다",
        synonyms: ["참여하다", "출전하다"],
        selectionReason: `'${rawWord} ${nextWord}'은(는) 밖으로 외출하거나 매진되는 것이 아니라 행사에 참여한다는 의미이므로 '참가하다' 수어로 번역합니다.`,
      });
      explanationNotes.push(`'${rawWord} ${nextWord}'(구문) → '대회 + 참가하다'`);
      idx++; // nextWord 소비 완료
      continue;
    }

    // 단독 '나갈/나가다/나가는' 처리 (문장에 대회/행사 문맥이 있으면 '참가하다', 아니면 '나가다')
    if (/^나(갈|가다|가는|가요|갑니다|가실래요|갈까요)$/.test(rawWord)) {
      if (isParticipationContext) {
        normalTokens.push({
          originalPart: rawWord,
          kslGloss: "참가하다",
          synonyms: ["참여하다", "출전하다", "나가다"],
          selectionReason: `대회·행사 문맥의 '${rawWord}'은(는) '참가하다' 수어로 표현합니다.`,
        });
        explanationNotes.push(`'${rawWord}'(대회 문맥) → '참가하다'`);
      } else {
        normalTokens.push({
          originalPart: rawWord,
          kslGloss: "나가다",
          synonyms: ["외출하다", "이동하다"],
          selectionReason: `'${rawWord}'의 기본형인 '나가다(외출하다)' 수어로 변환했습니다.`,
        });
      }
      continue;
    }

    // [구문 덩어리 2] 공동격 조사 '~이랑/~랑/~와/~과' (예: '할머니랑', '선생님과', '어르신들이랑') -> [대상] + [함께]
    const comitativeMatch = rawWord.match(
      /^([가-힣]{2,}?)(이랑|랑|와|과)$/
    );
    if (comitativeMatch && !/^(어제|오늘|내일|주말|추석|설날)$/.test(comitativeMatch[1])) {
      const targetNoun = comitativeMatch[1].replace(/들$/, "");
      normalTokens.push({
        originalPart: rawWord,
        kslGloss: targetNoun,
        synonyms: [targetNoun],
      });
      normalTokens.push({
        originalPart: `${rawWord}(~와 함께)`,
        kslGloss: "함께",
        synonyms: ["같이", "다같이"],
        selectionReason: `'${rawWord}'의 조사 '${comitativeMatch[2]}'는 한국수어에서 대상 뒤에 '함께(같이)' 수어를 덧붙여 표현합니다.`,
      });
      explanationNotes.push(`'${rawWord}' → '${targetNoun} + 함께'`);
      // 바로 뒤에 '같이/함께'가 또 나오면 중복 건너뛰기
      if (/^(같이|함께|다같이)$/.test(nextWord)) {
        idx++;
      }
      continue;
    }

    // [구문 덩어리 3] 허락·가능 질문 구문 ('~아도/어도/해도 될까요?/되나요?/돼요?/괜찮을까요?')
    if (
      /(아도|어도|여도|해도)$/.test(rawWord) &&
      /^(될까요|되나요|돼요|될까|괜찮을까요|괜찮나요|괜찮아요)$/.test(nextWord)
    ) {
      const analyzedVerb = analyzeGeneralKoreanWord(rawWord);
      if (analyzedVerb) {
        normalTokens.push({
          originalPart: rawWord,
          kslGloss: analyzedVerb.kslGloss,
          synonyms: analyzedVerb.synonyms,
          selectionReason: analyzedVerb.selectionReason,
        });
      }
      modalityEndTokens.push({
        originalPart: `${rawWord} ${nextWord}`,
        kslGloss: "가능하다",
        synonyms: ["괜찮다", "되다"],
        selectionReason: `'${rawWord} ${nextWord}'는 상대방의 허락·가능 여부를 묻는 표현이므로 동작 수어 뒤에 '가능하다(괜찮다)' 수어를 배치합니다.`,
      });
      explanationNotes.push(`'${rawWord} ${nextWord}'(허락/가능 구문) → '${analyzedVerb?.kslGloss || rawWord} + 가능하다'`);
      idx++; // nextWord 소비 완료
      continue;
    }

    // A. '보내다/보내세요/보내셨어요/보내실래요' 동음이의어 문맥 분기
    if (/^보내(세요|셨어요|실래요|실까요|다|자|고|요|셨나요|시길)$/.test(rawWord)) {
      if (isTimeSpendContext) {
        normalTokens.push({
          originalPart: rawWord,
          kslGloss: "지내다",
          synonyms: ["생활하다", "보내다"],
          selectionReason:
            "시간·명절을 '보내다'는 물건 발송('보내다')이 아닌 '지내다/생활하다' 수어를 사용합니다.",
        });
        explanationNotes.push(`'${rawWord}'(시간 경과) → '지내다'`);
      } else {
        normalTokens.push({
          originalPart: rawWord,
          kslGloss: "보내다",
          synonyms: ["발송하다", "지내다"],
          selectionReason:
            "편지나 물건을 다른 곳으로 발송하는 의미의 '보내다' 수어입니다. (시간/명절을 보낼 때는 '지내다' 사용)",
        });
        explanationNotes.push(`'${rawWord}'(물건 발송) → '보내다'`);
      }
      continue;
    }

    // B. '드시다/드실래요/먹다/마실래요' 3중 문맥 분기 (약 복용 vs 음료 마시기 vs 음식 섭취)
    if (
      /^(드셨어요|드셨나요|드셨습니까|드세요|드시다|드실|드실래요|드실래|드실까요|드시겠어요|드시나요|잡수셨어요|잡수세요|잡수시다|먹다|먹어요|먹었어요|먹었나요|먹을래요|먹을래|먹을까요|먹자|먹고|먹지)$/.test(
        rawWord
      )
    ) {
      if (isMedicineContext) {
        if (!rawWords.some((w) => /^약/.test(w))) {
          normalTokens.push({
            originalPart: rawWord,
            kslGloss: "약",
            synonyms: ["복약"],
          });
        }
        explanationNotes.push(`'약 + ${rawWord}' → '약'(복용 동작 포함)`);
        continue;
      }

      if (isBeverageContext) {
        normalTokens.push({
          originalPart: rawWord,
          kslGloss: "마시다",
          synonyms: ["먹다", "음료", "드시다"],
          selectionReason: `물·차·커피 등 음료를 '${rawWord}'라고 표현할 때는 밥을 먹는 수어('먹다') 대신 컵을 기울여 마시는 '마시다' 수어를 사용합니다.`,
        });
        explanationNotes.push(`'${rawWord}'(음료 문맥) → '마시다'`);
        continue;
      }

      normalTokens.push({
        originalPart: rawWord,
        kslGloss: "먹다",
        synonyms: ["식사", "드시다", "밥"],
        selectionReason: `높임·의향 표현 '${rawWord}'는 한국수어 기본형 표제어인 '먹다' 수어로 변환하여 표현합니다.`,
      });
      explanationNotes.push(`'${rawWord}'(높임/활용형) → '먹다'`);
      continue;
    }

    // C. '마시다/마실래요/마셔요' 처리
    if (/^마(시다|셔요|셨어요|셨나요|실래요|실까요|시겠어요|시자)$/.test(rawWord)) {
      normalTokens.push({
        originalPart: rawWord,
        kslGloss: "마시다",
        synonyms: ["음료", "물", "먹다"],
        selectionReason: `'${rawWord}'의 기본형인 '마시다' 수어로 변환했습니다.`,
      });
      continue;
    }

    // D. '약' 어절 처리
    if (/^약(을|은|이|도)?$/.test(rawWord)) {
      normalTokens.push({
        originalPart: rawWord,
        kslGloss: "약",
        synonyms: ["복약", "알약"],
        selectionReason:
          "한국수어에서 '약'은 왼손 바닥을 비빈 뒤 입에 넣는 동작으로 '약을 먹다(복용하다)'의 의미를 함께 담고 있습니다.",
      });
      continue;
    }

    // E. '~할 수 있으세요?'에서 '있으세요/있어요'가 능력 문맥일 때 '가능하다'로 변환
    if (isAbilityContext && /^있(어요|으세요|나요|습니까)$/.test(rawWord)) {
      modalityEndTokens.push({
        originalPart: rawWord,
        kslGloss: "가능하다",
        synonyms: ["괜찮다", "되다", "있다"],
        selectionReason:
          "'~할 수 있으세요?'의 가능·능력 여부는 존재('있다')가 아닌 '가능하다' 수어로 표현합니다.",
      });
      explanationNotes.push(`'수 ${rawWord}'(능력/가능) → '가능하다'`);
      continue;
    }

    // F. '앉아 주세요 / 도와 주세요 / 기다려 주세요'에서 보조용언 '주세요' 중복 방지
    if (
      /^주(세요|셨어요)$/.test(rawWord) &&
      normalTokens.length > 0 &&
      /(앉다|도와주다|기다리다|말하다|보다|오다)/.test(
        normalTokens[normalTokens.length - 1].kslGloss
      )
    ) {
      continue;
    }

    // G. 사전 정의된 불규칙 활용 및 관용 패턴 매칭
    let matchedRule = false;
    for (const rule of IRREGULAR_AND_IDIOM_MAP) {
      if (rule.pattern.test(rawWord)) {
        const tok: DecomposedToken = {
          originalPart: rawWord,
          kslGloss: rule.kslGloss,
          synonyms: rule.synonyms,
          selectionReason: rule.selectionReason,
          role: rule.role || "normal",
        };
        if (tok.role === "time") timeTokens.push(tok);
        else if (tok.role === "negation") negationTokens.push(tok);
        else if (tok.role === "question") {
          questionTokens.push(tok);
          explanationNotes.push(`의문사 '${rawWord}' → '${rule.kslGloss}'(문미 배치)`);
        } else if (tok.kslGloss === "가능하다") {
          modalityEndTokens.push(tok);
          explanationNotes.push(`'${rawWord}' → '가능하다'`);
        } else {
          normalTokens.push(tok);
          if (rawWord !== rule.kslGloss && /(촬영|찍|저|제가)/.test(rawWord)) {
            explanationNotes.push(`'${rawWord}' → '${rule.kslGloss}'`);
          }
        }
        matchedRule = true;
        break;
      }
    }
    if (matchedRule) continue;

    // H. 일반 한국어 형태소 분석 (조사 제거 및 어간/기본형 복원)
    const analyzed = analyzeGeneralKoreanWord(rawWord);
    if (analyzed) {
      if (analyzed.kslGloss === "가능하다") {
        modalityEndTokens.push({
          originalPart: rawWord,
          kslGloss: analyzed.kslGloss,
          synonyms: analyzed.synonyms,
          selectionReason: analyzed.selectionReason,
        });
      } else {
        normalTokens.push({
          originalPart: rawWord,
          kslGloss: analyzed.kslGloss,
          synonyms: analyzed.synonyms,
          selectionReason: analyzed.selectionReason,
        });
      }
    }
  }

  // KSL 문법 어순 조합: [시간] -> [일반(주어/목적어/동반자/핵심동사)] -> [가능/양태(가능하다)] -> [부정] -> [과거 완료(끝)] -> [의문사]
  const orderedTokens: DecomposedToken[] = [
    ...timeTokens,
    ...normalTokens,
    ...modalityEndTokens,
    ...negationTokens,
  ];

  // 과거 시제 표지 '끝' 추가 (단어 단독 검색이 아닌 문장 형태이고 과거형 어미가 쓰인 경우)
  if (
    isPastTense &&
    rawWords.length >= 2 &&
    !orderedTokens.some((t) => t.kslGloss === "끝")
  ) {
    orderedTokens.push({
      originalPart: "(과거/완료)",
      kslGloss: "끝",
      synonyms: ["완료", "마치다"],
      selectionReason:
        "한국수어(KSL) 문법에서는 과거 시제('~셨어요/했어요')를 서술어 뒤에 '끝(완료)' 수어를 덧붙여 표현합니다.",
    });
    explanationNotes.push("과거 시제 → '끝(완료)' 추가");
  }

  // 의문사는 KSL 어순에 따라 문장 맨 끝에 배치
  orderedTokens.push(...questionTokens);

  // [절 간 중복 서술어 의미 압축 (Semantic Deduplication)]
  // 예: 앞절 '촬영할건데'(찍다)와 뒷절 '찍어도'(찍다)가 모두 있으면 뒤쪽 서술어 위치로 통합하고 originalPart를 '촬영할건데 · 찍어도'로 병합
  const dedupedTokens: DecomposedToken[] = [];
  for (let i = 0; i < orderedTokens.length; i++) {
    const current = orderedTokens[i];
    const laterIdx = orderedTokens.findIndex(
      (later, idx) => idx > i && later.kslGloss === current.kslGloss
    );
    if (laterIdx !== -1) {
      const laterToken = orderedTokens[laterIdx];
      if (!laterToken.originalPart.includes(current.originalPart)) {
        laterToken.originalPart = `${current.originalPart} · ${laterToken.originalPart}`;
        laterToken.selectionReason = `'${current.originalPart}'와(과) '${laterToken.originalPart.split(" · ").pop()}'은(는) 동일한 핵심 수어 동작이므로 한국수어 문법에 맞게 '${laterToken.kslGloss}' 수어 하나로 압축했습니다.`;
        explanationNotes.push(`중복 서술어 압축('${laterToken.originalPart}' → '${laterToken.kslGloss}')`);
      }
    } else {
      dedupedTokens.push(current);
    }
  }

  // 만약 모든 토큰이 비어있다면 입력 전체를 단일 키워드로 처리
  if (dedupedTokens.length === 0 && clean) {
    dedupedTokens.push({
      originalPart: clean,
      kslGloss: clean,
      synonyms: [clean],
    });
  }

  // 문맥 맞춤형 비수지 기호(표정·고개짓) 팁 생성
  let nonManualTip =
    "어르신과 따뜻하게 눈을 맞추고 밝은 미소로 고개를 살짝 끄덕이며 천천히 표현하세요.";
  if (
    clean.includes("추석") ||
    clean.includes("설날") ||
    clean.includes("생일") ||
    clean.includes("생신") ||
    clean.includes("축하")
  ) {
    nonManualTip =
      "환하게 웃으며 따뜻한 축하와 덕담을 건네듯 고개를 부드럽게 끄덕이며 표현하세요.";
  } else if (
    clean.includes("편찮") ||
    clean.includes("아프") ||
    clean.includes("아파") ||
    clean.includes("병원")
  ) {
    nonManualTip =
      "눈썹을 살짝 모으고 걱정스럽고 세심한 표정으로 어르신의 몸 상태를 살피며 표현하세요.";
  } else if (clean.includes("미안") || clean.includes("죄송")) {
    nonManualTip =
      "미안해하는 진심 어린 표정으로 눈썹을 살짝 내리고 고개를 조금 숙이며 표현하세요.";
  } else if (isQuestion) {
    nonManualTip =
      "문장 마지막 수어 동작에서 눈썹을 살짝 올리고 고개를 앞으로 살짝 기울여 정중하게 여쭙는 표정을 지으세요.";
  }

  const glossFlow = dedupedTokens.map((t) => `[${t.kslGloss}]`).join(" → ");
  const uniqueNotes = Array.from(new Set(explanationNotes));
  const contextExplanation =
    uniqueNotes.length > 0
      ? `구문·절 의미 압축(${uniqueNotes.join(", ")})을 거쳐 한국수어 어순 ${glossFlow}으로 변환했습니다.`
      : `한국어 조사·어미를 제거하고 한국수어(KSL) 표준 문법 어순 ${glossFlow}으로 재배열했습니다.`;

  return {
    tokens: dedupedTokens,
    nonManualTip,
    contextExplanation,
  };
}

/**
 * [기능 ①] 업스케일링된 3계층 AI 문맥 번역 & 구문·절 의미 압축 파이프라인
 * - Layer 1: Gemini AI (ListModels 동적 모델 탐색 복구) + 절 단위 핵심 의미 압축 & Easy-KSL 쉬운 수어 치환
 * - Layer 2: 다단계 표제어 정규화(동음이의어 함정 차단, 한자어->기본수어 별칭 확장) + 하이브리드 사전(로컬 105종 + 국립국어원 실시간 크롤러) 조회
 * - Layer 3: 동음이의어·문맥 후보군 Gemini 2차 검증 및 수동 교체 지원
 */
export async function translateKoreanToKsl(
  sentence: string,
  customApiKey?: string
): Promise<TranslationResult> {
  const trimmed = sentence.trim();
  const genAI = getGeminiClient(customApiKey);

  let stage1: Stage1Output | null = null;

  // --- [Step 1] Gemini AI 기반 절(Clause) 의미 압축 및 Easy-KSL 변환 ---
  if (genAI) {
    try {
      const dictionaryWords = getAllDictionaryEntries()
        .map((e) => e.word)
        .join(", ");

      const stage1Schema = {
        type: SchemaType.OBJECT,
        properties: {
          tokens: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                originalPart: { type: SchemaType.STRING },
                kslGloss: { type: SchemaType.STRING },
                synonyms: {
                  type: SchemaType.ARRAY,
                  items: { type: SchemaType.STRING },
                },
                selectionReason: { type: SchemaType.STRING },
              },
              required: ["originalPart", "kslGloss", "synonyms"],
            },
          },
          nonManualTip: { type: SchemaType.STRING },
          contextExplanation: { type: SchemaType.STRING },
        },
        required: ["tokens", "nonManualTip", "contextExplanation"],
      };

      const prompt = `당신은 농아인주간보호시설 어르신들과 소통하는 한국수어(KSL) 수석 통역사입니다.
입력된 한국어 문장을 단순 단어 나열이 아니라 **절(Clause)과 구문(Chunk) 단위로 의미를 파악하여 농아인 어르신이 가장 직관적으로 이해할 수 있는 쉬운 기본 한국수어(KSL) 어순으로 압축 번역**하세요.

[핵심 번역 및 구문 압축 규칙]
1. 쉬운 기본 수어 최우선 치환 (Easy-KSL Paraphrasing):
   - 한자어·복합 용언은 반드시 직관적인 일상 기본 수어 표제어(단일 단어)로 바꾸세요.
   - "촬영하다 / 촬영할건데 / 찍어도" -> kslGloss: "찍다" (synonyms: ["촬영하다", "사진"])
   - "대회에 나갈 / 행사에 나갈" -> [대회] + [참가하다] ('나갈'을 절대 그대로 쓰지 마세요! '참가하다'로 변환)
   - "~아/어도 될까요? / ~해도 괜찮을까요? / ~할 수 있으세요?" -> 핵심 동사 + kslGloss: "가능하다" (synonyms: ["괜찮다"])
   - "할머니랑 / 선생님과 / 어르신이랑" -> [대상 명사(예: 할머니)] + [함께] (공동격 조사 '~랑/와/과'는 '함께' 수어로 살려주세요)
   - "저 / 제가 / 저는" -> kslGloss: "나"
   - "드실래요? / 드세요" -> 일반 식사면 "먹다", 차/물/음료면 "마시다", 약이면 "약"
   - "주무셨어요" -> "자다", "편찮으시다" -> "아프다", "들어가세요(귀가)" -> "돌아가다"

2. 절(Clause) 간 중복 서술어 의미 압축 (가장 중요!):
   - 복합 문장에서 앞절(배경 설명)과 뒷절(본절)에 같은 의미의 동사가 반복되면(예: "영상을 촬영할건데 할머니랑 찍어도 될까요?"에서 '촬영할건데'와 '찍어도'), 수어 토큰을 두 번 중복 생성하지 말고 문장 뒤쪽 서술어 위치에 "{ originalPart: '촬영할건데 · 찍어도', kslGloss: '찍다' }" 하나로 통합하세요!
   - 예시: "저 대회에 나갈 영상을 촬영할건데 할머니랑 찍어도 될까요?"
     -> [나] -> [대회] -> [참가하다] -> [영상] -> [할머니] -> [함께] -> [찍다(originalPart: '촬영할건데 · 찍어도')] -> [가능하다(originalPart: '찍어도 될까요')]

3. 한국수어(KSL) 어순 재배치 규칙:
   - [시간 어휘(어제, 오늘, 내일, 주말, 추석 등)] -> [주어/배경/목적어/동반자(명사+함께)/핵심 동사] -> [가능/부정(가능하다, 아니다, 못하다, 말다)] -> [과거 완료(끝)] -> [의문사(무엇, 어디, 언제, 누구, 왜, 어떻다)]
   - kslGloss에는 괄호나 부연 설명 없이 순수 표제어 1개만 적으세요.

4. 로컬 핵심 수어 표제어 목록 (이 목록에 있는 표제어를 최우선으로 kslGloss에 사용하세요):
   [${dictionaryWords}]

5. nonManualTip에는 비수지 기호(표정, 눈썹, 고개짓, 시선) 가이드를 1문장으로 작성하고, contextExplanation에는 어떤 구문/절이 어떻게 압축·변환되었는지 1문장으로 명쾌하게 해설하세요.

입력: "${trimmed}"`;

      const parsed = await generateJsonWithGemini<Stage1Output>(
        genAI,
        stage1Schema,
        prompt,
        customApiKey
      );
      if (parsed && Array.isArray(parsed.tokens) && parsed.tokens.length > 0) {
        stage1 = parsed;
      }
    } catch (err) {
      console.warn(
        "[Gemini Step 1 Fallback] 내장 KSL 절·구문 압축 엔진으로 전환합니다:",
        err
      );
    }
  }

  const usedGemini = Boolean(stage1);
  if (!stage1) {
    stage1 = decomposeSentenceKslEngine(trimmed);
  }

  // --- [Step 2] 다단계 표제어 정규화 + 하이브리드 사전(로컬 96종 + 국립국어원 실시간 크롤러) 조회 ---
  const kslSequence: TranslatedSignToken[] = await Promise.all(
    stage1.tokens.map(async (token) => {
      // Gemini가 만약 "먹다(드시다)"처럼 괄호를 포함해 반환하더라도 대표 표제어 정제
      const cleanPrimaryGloss =
        token.kslGloss
          .split(/[(),/·|]+/)[0]
          .replace(/[\[\]"'?!.~]/g, "")
          .trim() || token.kslGloss;

      const queryTerms = Array.from(
        new Set([
          cleanPrimaryGloss,
          token.kslGloss,
          ...(token.synonyms || []),
          token.originalPart,
        ])
      ).filter(Boolean);

      const candidates = await searchHybridDictionary(queryTerms);

      if (candidates.length === 0) {
        const fallbackEntry: SignWordEntry = {
          id: `fallback_${cleanPrimaryGloss}`,
          word: cleanPrimaryGloss,
          senseIndex: 1,
          meaning: `${token.originalPart} (${cleanPrimaryGloss})`,
          category: "일상",
          signDescription: `'${cleanPrimaryGloss}' 표현입니다. 어르신께 입모양(구화)과 자연스러운 제스처로 천천히 전달해 주세요.`,
          actionSummary: `입모양으로 '${cleanPrimaryGloss}'을(를) 분명하게 보여주며 표현하기`,
          handShapeHint: "👐",
          imageUrls: ["/fallback-sign.svg"],
          videoUrl: "",
          keywords: [cleanPrimaryGloss],
        };
        return {
          originalPart: token.originalPart,
          kslGloss: cleanPrimaryGloss,
          selectedSign: fallbackEntry,
          alternativeSigns: [],
          selectionReason: token.selectionReason,
        };
      }

      // 동음이의어/유의어 비교 후보 보장 ('지내다' vs '보내다', '먹다' vs '마시다' vs '밥', '사과(과일)' vs '미안하다')
      const enrichedCandidates = [...candidates];
      if (
        cleanPrimaryGloss === "지내다" ||
        cleanPrimaryGloss === "보내다" ||
        token.originalPart.includes("보내")
      ) {
        const spendSign = getSignById("ksl_004");
        const sendSign = getSignById("ksl_005");
        if (spendSign && !enrichedCandidates.some((c) => c.id === spendSign.id)) {
          enrichedCandidates.unshift(spendSign);
        }
        if (sendSign && !enrichedCandidates.some((c) => c.id === sendSign.id)) {
          enrichedCandidates.push(sendSign);
        }
      } else if (
        cleanPrimaryGloss === "먹다" ||
        cleanPrimaryGloss === "마시다" ||
        /^(드실|드세요|드셨|드시|먹)/.test(token.originalPart)
      ) {
        const eatSign = getSignById("ksl_012");
        const drinkSign = getSignById("ksl_089");
        const mealSign = getSignById("ksl_087");
        for (const extra of [eatSign, drinkSign, mealSign]) {
          if (extra && !enrichedCandidates.some((c) => c.id === extra.id)) {
            enrichedCandidates.push(extra);
          }
        }
      } else if (
        cleanPrimaryGloss === "사과" ||
        token.originalPart.startsWith("사과")
      ) {
        const appleSign = getSignById("ksl_071");
        const apologySign = getSignById("ksl_060");
        if (appleSign && !enrichedCandidates.some((c) => c.id === appleSign.id)) {
          enrichedCandidates.unshift(appleSign);
        }
        if (
          apologySign &&
          !enrichedCandidates.some((c) => c.id === apologySign.id)
        ) {
          enrichedCandidates.push(apologySign);
        }
      } else if (cleanPrimaryGloss === "가능하다" || cleanPrimaryGloss === "괜찮다") {
        const possibleSign = getSignById("ksl_080");
        const okaySign = getSignById("ksl_028");
        for (const extra of [possibleSign, okaySign]) {
          if (extra && !enrichedCandidates.some((c) => c.id === extra.id)) {
            enrichedCandidates.push(extra);
          }
        }
      } else if (cleanPrimaryGloss === "참가하다" || cleanPrimaryGloss === "나가다") {
        const joinSign = getSignById("ksl_100");
        const goOutSign = getSignById("ksl_101");
        for (const extra of [joinSign, goOutSign]) {
          if (extra && !enrichedCandidates.some((c) => c.id === extra.id)) {
            enrichedCandidates.push(extra);
          }
        }
      } else if (cleanPrimaryGloss === "찍다") {
        const shootSign = getSignById("ksl_097");
        const photoSign = getSignById("ksl_105");
        for (const extra of [shootSign, photoSign]) {
          if (extra && !enrichedCandidates.some((c) => c.id === extra.id)) {
            enrichedCandidates.push(extra);
          }
        }
      }

      const exactMatch =
        enrichedCandidates.find((c) => c.word === cleanPrimaryGloss) ||
        enrichedCandidates[0];
      const alternatives = enrichedCandidates.filter(
        (c) => c.id !== exactMatch.id
      );

      return {
        originalPart: token.originalPart,
        kslGloss: exactMatch.word,
        selectedSign: exactMatch,
        alternativeSigns: alternatives,
        selectionReason: token.selectionReason,
      };
    })
  );

  // --- [Step 2-B] Gemini AI 동음이의어 정밀 문맥 검증 (후보가 2개 이상이고 아직 selectionReason이 없는 토큰이 있을 때) ---
  if (genAI && usedGemini) {
    const ambiguousIndices = kslSequence
      .map((tok, idx) =>
        tok.alternativeSigns.length > 0 && !tok.selectionReason ? idx : -1
      )
      .filter((idx) => idx >= 0);

    if (ambiguousIndices.length > 0) {
      try {
        const step2Schema = {
          type: SchemaType.OBJECT,
          properties: {
            selections: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  tokenIndex: { type: SchemaType.NUMBER },
                  selectedSignId: { type: SchemaType.STRING },
                  selectionReason: { type: SchemaType.STRING },
                },
                required: ["tokenIndex", "selectedSignId", "selectionReason"],
              },
            },
          },
          required: ["selections"],
        };

        const payload = ambiguousIndices.map((idx) => {
          const t = kslSequence[idx];
          const allOptions = [t.selectedSign, ...t.alternativeSigns].map(
            (s) => ({
              id: s.id,
              word: s.word,
              meaning: s.meaning,
              signDescription: s.signDescription,
            })
          );
          return {
            tokenIndex: idx,
            originalPart: t.originalPart,
            candidates: allOptions,
          };
        });

        const step2Prompt = `전체 입력 문장: "${trimmed}"
아래 단어들에 대해 국립국어원 한국수어사전에서 여러 동음이의어/유의어 후보가 검색되었습니다.
각 후보의 한국어 의미(meaning)와 수형 설명(signDescription)을 읽고, 전체 문장의 맥락에 가장 자연스럽게 부합하는 수어 ID(selectedSignId) 1개를 선택하고 이유(selectionReason)를 1문장으로 작성하세요.

${JSON.stringify(payload)}`;

        const parsedStep2 = await generateJsonWithGemini<{
          selections: Array<{
            tokenIndex: number;
            selectedSignId: string;
            selectionReason: string;
          }>;
        }>(genAI, step2Schema, step2Prompt, customApiKey);

        for (const sel of parsedStep2.selections || []) {
          const targetToken = kslSequence[sel.tokenIndex];
          if (!targetToken) continue;
          const allSigns = [
            targetToken.selectedSign,
            ...targetToken.alternativeSigns,
          ];
          const chosen = allSigns.find((s) => s.id === sel.selectedSignId);
          if (chosen) {
            targetToken.selectedSign = chosen;
            targetToken.kslGloss = chosen.word;
            targetToken.alternativeSigns = allSigns.filter(
              (s) => s.id !== chosen.id
            );
            targetToken.selectionReason = sel.selectionReason;
          }
        }
      } catch (err) {
        console.warn("[Gemini Step 2 Disambiguation Warning]:", err);
      }
    }
  }

  const glossSummary = kslSequence
    .map((item) => `[${item.selectedSign.word}]`)
    .join(" → ");

  return {
    inputSentence: trimmed,
    kslSequence,
    nonManualTip: stage1.nonManualTip,
    glossSummary,
    contextExplanation: stage1.contextExplanation,
    engineUsed: usedGemini ? "gemini" : "rule",
  };
}

/**
 * [기능 ④] 손동작 묘사 기반 '수어 역검색' 2단계 하이브리드 파이프라인
 */
export async function searchReverseSignByMotion(
  descriptionQuery: string,
  selectedChips: string[] = [],
  customApiKey?: string
): Promise<ReverseSearchCandidate[]> {
  const localCandidates = searchReverseByMotionLocal(
    descriptionQuery,
    selectedChips
  );
  const genAI = getGeminiClient(customApiKey);

  const hasUserQuery =
    descriptionQuery.trim().length > 0 || selectedChips.length > 0;

  if (!hasUserQuery || !genAI) {
    return localCandidates;
  }

  try {
    const poolMap = new Map<string, SignWordEntry>();
    for (const c of localCandidates) {
      poolMap.set(c.sign.id, c.sign);
    }
    for (const entry of getAllDictionaryEntries()) {
      if (poolMap.size >= 30) break;
      poolMap.set(entry.id, entry);
    }

    const candidatePool = Array.from(poolMap.values()).map((s) => ({
      id: s.id,
      word: s.word,
      meaning: s.meaning,
      signDescription: s.signDescription,
      actionSummary: s.actionSummary,
      keywords: s.keywords,
    }));

    const reverseSchema = {
      type: SchemaType.OBJECT,
      properties: {
        matches: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              id: { type: SchemaType.STRING },
              score: { type: SchemaType.NUMBER },
              matchReason: { type: SchemaType.STRING },
              matchedKeywords: {
                type: SchemaType.ARRAY,
                items: { type: SchemaType.STRING },
              },
            },
            required: ["id", "score", "matchReason", "matchedKeywords"],
          },
        },
      },
      required: ["matches"],
    };

    const prompt = `사용자가 농아인 어르신이 표현하신 수어 손동작을 눈으로 보고 묘사했습니다.
아래 수어 사전 후보들의 수형 설명(signDescription)과 대조하여, 사용자의 묘사와 가장 동작이 일치하는 상위 5개 수어를 찾아 점수(0~99)순으로 반환하세요.

[사용자 입력]
- 동작 묘사 텍스트: "${descriptionQuery.trim() || "(칩 선택만 있음)"}"
- 선택한 부위/손모양 태그: [${selectedChips.join(", ")}]

[수어 사전 후보 목록]
${JSON.stringify(candidatePool)}

matchReason에는 사용자의 어떤 묘사가 해당 수어의 어떤 수형 동작과 일치하는지 1문장으로 명확히 설명하세요.`;

    const parsed = await generateJsonWithGemini<{
      matches: Array<{
        id: string;
        score: number;
        matchReason: string;
        matchedKeywords: string[];
      }>;
    }>(genAI, reverseSchema, prompt, customApiKey);

    if (parsed?.matches?.length) {
      const reranked: ReverseSearchCandidate[] = [];
      for (const m of parsed.matches) {
        const sign = getSignById(m.id);
        if (sign) {
          reranked.push({
            sign,
            score: Math.min(99, Math.max(10, Math.round(m.score))),
            matchReason: m.matchReason,
            matchedKeywords:
              m.matchedKeywords?.length > 0
                ? m.matchedKeywords
                : sign.keywords.slice(0, 3),
          });
        }
      }
      if (reranked.length > 0) {
        return reranked.sort((a, b) => b.score - a.score);
      }
    }
  } catch (err) {
    console.warn("[Gemini Reverse Search Fallback] 로컬 매칭 결과를 반환합니다:", err);
  }

  return localCandidates;
}
