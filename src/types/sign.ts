export type PhraseCategoryId =
  | "greeting"
  | "meal"
  | "health"
  | "program"
  | "farewell"
  | "custom";

export interface PhraseCategoryInfo {
  id: PhraseCategoryId;
  label: string;
  iconName: string;
  description: string;
}

/**
 * 수어 사전 개별 단어 엔트리 (로컬 캐시 DB 및 국립국어원 오픈 API 정규화 포맷)
 */
export interface SignWordEntry {
  /** 고유 식별자 (예: "ksl_greeting_01") */
  id: string;
  /** 대표 한국어 표제어 (예: "지내다") */
  word: string;
  /** 동음이의어 구분 번호 (1, 2, ...) */
  senseIndex: number;
  /** 한국어 상세 의미/문맥 설명 (예: "생활하다, 세월이나 시간을 보내다") */
  meaning: string;
  /** 어휘 분류 (인사, 식사, 건강, 시간, 감정, 일상 등) */
  category: string;
  /** 국립국어원 한국수어사전 수형 설명 원문 */
  signDescription: string;
  /** 현장에서 1초 만에 보고 따라 하는 핵심 손동작 1줄 요약 */
  actionSummary: string;
  /** 손 모양/위치 아이콘 또는 시각 가이드 이모지/심볼 */
  handShapeHint?: string;
  /** 수형 사진/일러스트 URL 배열 */
  imageUrls: string[];
  /** 국립국어원 수어 동영상 URL (.mp4) */
  videoUrl: string;
  /** 역검색 및 유의어 매칭용 키워드 배열 (부위, 손모양, 동작, 유의어) */
  keywords: string[];
  /** 함께 검색될 수 있는 유의어/관련 표현 목록 */
  synonyms?: string[];
}

/**
 * 문장 번역 결과 내 개별 수어 토큰
 */
export interface TranslatedSignToken {
  /** 원문 한국어 문장에서 대응되는 어절/부분 (예: "보내세요") */
  originalPart: string;
  /** 변환된 한국수어(KSL) 표제어 (예: "지내다") */
  kslGloss: string;
  /** 문맥에 맞게 최종 선택된 수어 단어 엔트리 */
  selectedSign: SignWordEntry;
  /** 동음이의어나 유의어 후보 목록 (사용자가 수동으로 교체 가능) */
  alternativeSigns: SignWordEntry[];
  /** AI가 이 수어를 선택한 문맥적 이유 (예: "'명절을 보내다'는 물건 발송이 아닌 '생활하다/지내다' 수어를 사용합니다") */
  selectionReason?: string;
}

export interface TokenTimingDetail {
  token: string;
  source: "local" | "live_crawler" | "fallback";
  durationMs: number;
}

export interface TranslationTimings {
  totalMs: number;
  stage1GeminiMs: number;
  stage2DictionaryMs: number;
  stage3DisambiguationMs: number;
  modelUsed?: string;
  tokenDetails?: TokenTimingDetail[];
}

/**
 * 2단계 AI 문맥 번역 API 최종 응답 패킷
 */
export interface TranslationResult {
  /** 사용자가 입력한 원본 한국어 문장 */
  inputSentence: string;
  /** 한국수어(KSL) 문법 어순으로 재배열된 수어 단어 시퀀스 */
  kslSequence: TranslatedSignToken[];
  /** 수어 필수 요소인 비수지 기호(표정, 눈썹, 고개짓) 한 줄 가이드 */
  nonManualTip: string;
  /** 전체 문장 수어 어순 요약 문자열 (예: "[추석] → [잘] → [지내다]") */
  glossSummary: string;
  /** 한국어 원문이 한국수어(KSL) 문법·어휘로 변환된 핵심 문맥 해설 (1줄 요약) */
  contextExplanation?: string;
  /** 실제 사용된 번역 엔진 ('gemini': Gemini AI 2단계 파이프라인, 'rule': 내장 KSL 문법 엔진) */
  engineUsed?: "gemini" | "rule";
  /** 문맥 변환 처리 구간별 소요 시간 성능 로그 메타데이터 */
  timings?: TranslationTimings;
}

/**
 * 주간보호시설 상황별 즐겨찾기 문장함 아이템
 */
export interface SavedPhraseItem {
  id: string;
  categoryId: PhraseCategoryId;
  title: string;
  nonManualTip: string;
  /** 수어 시퀀스를 구성하는 SignWordEntry ID 배열 또는 직접 내장된 토큰 */
  signIds: string[];
  /** 커스텀 추가된 문장의 경우 전체 번역 결과 캐시 */
  cachedResult?: TranslationResult;
  isPreset?: boolean;
  createdAt: string;
}

/**
 * 손동작 묘사 기반 '수어 역검색' 결과 후보 아이템
 */
export interface ReverseSearchCandidate {
  sign: SignWordEntry;
  /** 매칭 점수 (0 ~ 100) */
  score: number;
  /** 사용자 묘사와 일치하는 핵심 동작 포인트 설명 */
  matchReason: string;
  /** 매칭된 키워드 태그 */
  matchedKeywords: string[];
}
