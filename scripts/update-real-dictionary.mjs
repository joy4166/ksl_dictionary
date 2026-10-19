import fs from "node:fs";
import path from "node:path";

const DICT_PATH = path.join(process.cwd(), "src", "data", "dictionary.json");

/**
 * 국립국어원 한국수어사전(sldict.korean.go.kr)에서 키워드로 검색하여
 * 실제 동영상(.mp4), 실제 수형 사진(.jpg), 실제 수형 설명을 가져옵니다.
 */
async function scrapeSldictWord(searchKeyword, preferredSenseMatch = null) {
  const searchUrl = `https://sldict.korean.go.kr/front/search/searchAllList.do?searchKeyword=${encodeURIComponent(
    searchKeyword
  )}`;
  const res = await fetch(searchUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
  const html = await res.text();

  // 일상용어(CTE) 검색 결과 블록 파싱
  const blocks = html.split("<!--01_list-->").slice(1);
  const candidates = [];

  for (const block of blocks) {
    const fnMatch = block.match(
      /fnSearchContentsView\s*\(\s*'(\d+)'\s*,\s*'([A-Z]+)'/
    );
    const thumbMatch = block.match(
      /src=["'](http[^"']+MOV[^"']+_215X161\.jpg)["']/
    );
    const titMatch = block.match(
      /<span class="tit">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/
    );
    const infoMatch = block.match(/<cite>\s*<span[^>]*>([\s\S]*?)<\/span>/);

    if (fnMatch && thumbMatch && titMatch) {
      const originNo = fnMatch[1];
      const topCategory = fnMatch[2];
      // 일상용어(CTE)를 우선하되 없으면 전문용어도 허용
      const thumbUrl = thumbMatch[1].replace(/^http:\/\//, "https://");
      const videoUrl = thumbUrl.replace("_215X161.jpg", "_700X466.mp4");
      const rawTitle = titMatch[1]
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      const rawDef = infoMatch
        ? infoMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
        : "";

      candidates.push({
        originNo,
        topCategory,
        thumbUrl,
        videoUrl,
        rawTitle,
        rawDef,
      });
    }
  }

  if (candidates.length === 0) return null;

  //日常수어(CTE) 우선 정렬
  const cteCandidates = candidates.filter((c) => c.topCategory === "CTE");
  const pool = cteCandidates.length > 0 ? cteCandidates : candidates;

  // preferredSenseMatch가 있으면 제목이나 뜻에 해당 키워드가 포함된 항목 우선 선택
  let chosen = pool[0];
  if (preferredSenseMatch) {
    const matched = pool.find(
      (c) =>
        c.rawTitle.includes(preferredSenseMatch) ||
        c.rawDef.includes(preferredSenseMatch)
    );
    if (matched) chosen = matched;
  } else {
    // 검색어와 정확히 일치하거나 시작하는 항목 우선
    const exact = pool.find((c) => {
      const words = c.rawTitle.split(",").map((w) => w.trim());
      return words.includes(searchKeyword);
    });
    if (exact) chosen = exact;
  }

  // 상세 페이지(signContentsView.do)에서 수형 사진 및 수형 설명 추출
  const detailUrl = `https://sldict.korean.go.kr/front/sign/signContentsView.do?origin_no=${chosen.originNo}&top_category=${chosen.topCategory}`;
  const dRes = await fetch(detailUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
  const dHtml = await dRes.text();

  const descMatch = dHtml.match(/수형 설명<\/dt>\s*<dd>([\s\S]*?)<\/dd>/);
  const signDescription = descMatch
    ? descMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
    : "";

  const imgMatches = [
    ...dHtml.matchAll(/src=["'](http[^"']+IMG[^"']+_700X466\.jpg)["']/g),
  ].map((m) => m[1].replace(/^http:\/\//, "https://"));

  const corrMatch = dHtml.match(
    /한국어 대응표현<\/span>\s*<\/dt>\s*<dd>([\s\S]*?)<\/dd>/
  );
  const koreanEquivalents = corrMatch
    ? corrMatch[1]
        .replace(/<[^>]+>/g, "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : chosen.rawTitle
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

  return {
    originNo: chosen.originNo,
    videoUrl: chosen.videoUrl,
    thumbUrl: chosen.thumbUrl,
    imageUrls: imgMatches.length > 0 ? imgMatches : [chosen.thumbUrl],
    signDescription,
    koreanEquivalents,
    rawDef: chosen.rawDef,
  };
}

// 추가할 기초 및 현장 필수 수어 단어 목록
const EXTRA_ESSENTIAL_WORDS = [
  {
    id: "ksl_036",
    word: "어제",
    searchQuery: "어제",
    senseIndex: 1,
    meaning: "오늘의 바로 하루 전날 (어저께)",
    category: "시간/명절",
    handShapeHint: "☝️+🔙",
    keywords: ["오른손", "한손", "검지(1지)", "주먹", "어깨", "뒤로", "과거", "어저께"],
    synonyms: ["어저께", "작일", "어제는"],
  },
  {
    id: "ksl_037",
    word: "아침",
    searchQuery: "아침",
    senseIndex: 1,
    meaning: "날이 새면서부터 오전까지의 시간 (아침 식사)",
    category: "시간/명절",
    handShapeHint: "🌅+☝️",
    keywords: ["오른손", "검지(1지)", "팔", "위로", "해", "오전"],
    synonyms: ["오전", "아침밥", "굿모닝"],
  },
  {
    id: "ksl_038",
    word: "저녁",
    searchQuery: "저녁",
    senseIndex: 1,
    meaning: "해가 질 무렵부터 밤이 되기 전까지의 시간 (저녁 식사)",
    category: "시간/명절",
    handShapeHint: "🌇+✋",
    keywords: ["양손", "손바닥 폄", "아래로", "해", "오후", "저녁밥"],
    synonyms: ["오후", "저녁밥", "석식"],
  },
  {
    id: "ksl_039",
    word: "자다",
    searchQuery: "자다",
    senseIndex: 1,
    meaning: "잠을 자다, 주무시다, 취침하다",
    category: "일상/동작",
    handShapeHint: "😴+🤚",
    keywords: ["오른손", "한손", "볼/턱", "눈/코/입", "잠", "주무시다"],
    synonyms: ["주무시다", "주무셨어요", "잠자다", "잠", "취침"],
  },
  {
    id: "ksl_040",
    word: "가다",
    searchQuery: "가다",
    senseIndex: 1,
    meaning: "한 곳에서 다른 곳으로 이동하다 ('가세요', '갑니다')",
    category: "일상/동작",
    handShapeHint: "👉+🚶",
    keywords: ["오른손", "한손", "앞으로", "이동", "출발"],
    synonyms: ["가세요", "갑니다", "이동하다", "출발하다"],
  },
  {
    id: "ksl_041",
    word: "오다",
    searchQuery: "오다",
    senseIndex: 1,
    meaning: "다른 곳에서 이쪽으로 이동해 오다 ('오세요', '오셨어요')",
    category: "일상/동작",
    handShapeHint: "👈+🚶",
    keywords: ["오른손", "한손", "검지(1지)", "가슴 앞", "도착"],
    synonyms: ["오세요", "오셨어요", "와요", "도착하다"],
  },
  {
    id: "ksl_042",
    word: "보다",
    searchQuery: "보다",
    senseIndex: 1,
    meaning: "눈으로 대상을 바라보거나 시청하다",
    category: "일상/동작",
    handShapeHint: "👀+✌️",
    keywords: ["오른손", "눈/코/입", "검지(1지)", "앞으로", "구경하다", "시청하다"],
    synonyms: ["봐요", "보셨어요", "구경하다", "시청하다", "쳐다보다"],
  },
  {
    id: "ksl_043",
    word: "듣다",
    searchQuery: "듣다",
    senseIndex: 1,
    meaning: "소리를 귀로 듣다",
    category: "일상/동작",
    handShapeHint: "👂+☝️",
    keywords: ["오른손", "검지(1지)", "귀", "소리"],
    synonyms: ["들리다", "경청하다"],
  },
  {
    id: "ksl_044",
    word: "말하다",
    searchQuery: "말하다",
    senseIndex: 1,
    meaning: "생각이나 느낌을 입이나 수어로 표현하다 ('말씀하다')",
    category: "일상/동작",
    handShapeHint: "🗣️+✋",
    keywords: ["오른손", "눈/코/입", "앞으로", "대화", "말씀"],
    synonyms: ["말씀", "말씀하세요", "이야기하다", "대화하다"],
  },
  {
    id: "ksl_045",
    word: "수어",
    searchQuery: "수화",
    senseIndex: 1,
    meaning: "손짓과 표정으로 뜻을 전달하는 한국수어 (수화)",
    category: "일상/동작",
    handShapeHint: "👐+💬",
    keywords: ["양손", "검지(1지)", "가슴 앞", "돌리기", "위아래로", "수화"],
    synonyms: ["수화", "한국수어", "손말"],
  },
  {
    id: "ksl_046",
    word: "좋아하다",
    searchQuery: "좋아하다",
    senseIndex: 1,
    meaning: "마음에 들거나 기쁘게 여기다",
    category: "감정/상태",
    handShapeHint: "🥰+🤏",
    keywords: ["오른손", "볼/턱", "엄지", "검지(1지)", "기쁘다", "호감"],
    synonyms: ["마음에 들다", "즐기다", "선호하다"],
  },
  {
    id: "ksl_047",
    word: "싫다",
    searchQuery: "싫다",
    senseIndex: 1,
    meaning: "마음에 들지 아니하다, 거절하다 ('싫어하다')",
    category: "감정/상태",
    handShapeHint: "🙅+✋",
    keywords: ["오른손", "가슴 앞", "볼/턱", "거절", "별로"],
    synonyms: ["싫어하다", "싫어요", "별로다"],
  },
  {
    id: "ksl_048",
    word: "사랑하다",
    searchQuery: "사랑",
    senseIndex: 1,
    meaning: "아끼고 소중히 여기는 따뜻한 마음",
    category: "감정/상태",
    handShapeHint: "❤️+🤲",
    keywords: ["양손", "손바닥 폄", "돌리기", "가슴 앞", "아끼다"],
    synonyms: ["사랑해요", "사랑합니다", "애정"],
  },
  {
    id: "ksl_049",
    word: "기쁘다",
    searchQuery: "기쁘다",
    senseIndex: 1,
    meaning: "마음이 즐겁고 행복하다 ('즐겁다', '신나다')",
    category: "감정/상태",
    handShapeHint: "😄+👐",
    keywords: ["양손", "가슴 앞", "위아래로", "즐겁다", "행복하다"],
    synonyms: ["즐겁다", "행복하다", "신나다", "기분 좋다"],
  },
  {
    id: "ksl_050",
    word: "슬프다",
    searchQuery: "슬프다",
    senseIndex: 1,
    meaning: "마음이 아프고 괴롭다 ('속상하다', '우울하다')",
    category: "감정/상태",
    handShapeHint: "😢+💧",
    keywords: ["오른손", "눈/코/입", "아래로", "눈물", "속상하다"],
    synonyms: ["속상하다", "우울하다", "눈물나다"],
  },
  {
    id: "ksl_051",
    word: "피곤하다",
    searchQuery: "피곤하다",
    senseIndex: 1,
    meaning: "몸이나 마음이 지치고 힘들다 ('고단하다', '힘들다')",
    category: "감정/상태",
    handShapeHint: "😫+👊",
    keywords: ["양손", "주먹", "두드리기", "어깨", "팔", "힘들다"],
    synonyms: ["힘들다", "고단하다", "지치다", "노곤하다"],
  },
  {
    id: "ksl_052",
    word: "배고프다",
    searchQuery: "배고프다",
    senseIndex: 1,
    meaning: "배가 비어 음식을 먹고 싶다 ('출출하다')",
    category: "식사/간식",
    handShapeHint: "🍽️+배",
    keywords: ["양손", "배", "손바닥 폄", "허기", "출출하다"],
    synonyms: ["시장하다", "출출하다", "배고파요"],
  },
  {
    id: "ksl_053",
    word: "도와주다",
    searchQuery: "돕다",
    senseIndex: 1,
    meaning: "남을 거들어 주거나 보살피다 ('도와드릴까요?', '도움')",
    category: "일상/동작",
    handShapeHint: "🤝+✋",
    keywords: ["양손", "엄지", "손바닥 폄", "밀다", "가슴 앞", "도움"],
    synonyms: ["돕다", "도와드릴까요", "도움", "거들다"],
  },
  {
    id: "ksl_054",
    word: "기다리다",
    searchQuery: "기다리다",
    senseIndex: 1,
    meaning: "어떤 사람이나 때가 오기를 기다리다 ('잠시만 기다려 주세요')",
    category: "일상/동작",
    handShapeHint: "⏳+🤚",
    keywords: ["오른손", "볼/턱", "구부리다", "대기하다"],
    synonyms: ["기다려 주세요", "대기하다"],
  },
  {
    id: "ksl_055",
    word: "천천히",
    searchQuery: "천천히",
    senseIndex: 1,
    meaning: "급하지 않게 여유를 가지고 느리게",
    category: "일상/부사",
    handShapeHint: "🐢+👐",
    keywords: ["양손", "손바닥 폄", "좌우로", "아래로", "느리게", "천천히"],
    synonyms: ["느리게", "조금씩", "급하지 않게"],
  },
  {
    id: "ksl_056",
    word: "맞다",
    searchQuery: "맞다",
    senseIndex: 1,
    meaning: "틀림없이 그러하다, 긍정의 대답 ('네', '예', '맞아요')",
    category: "일상/동작",
    handShapeHint: "⭕+👍",
    keywords: ["오른손", "주먹", "검지(1지)", "위아래로", "긍정", "네"],
    synonyms: ["네", "예", "맞아요", "그렇다"],
  },
  {
    id: "ksl_057",
    word: "아니다",
    searchQuery: "아니다",
    senseIndex: 1,
    meaning: "그렇지 않다, 부정의 대답 ('아니오', '안 돼요')",
    category: "일상/동작",
    handShapeHint: "❌+✋",
    keywords: ["오른손", "검지(1지)", "좌우로", "흔들다", "부정", "아니오"],
    synonyms: ["아니오", "아니요", "안", "않다"],
  },
  {
    id: "ksl_058",
    word: "있다",
    searchQuery: "있다",
    senseIndex: 1,
    meaning: "존재하거나 가지고 있다 ('계시다', '있으세요?')",
    category: "일상/동작",
    handShapeHint: "✋+⬇️",
    keywords: ["오른손", "손바닥 폄", "가슴 앞", "아래로", "계시다", "보유"],
    synonyms: ["계시다", "계세요", "있어요", "있으세요"],
  },
  {
    id: "ksl_059",
    word: "없다",
    searchQuery: "없다",
    senseIndex: 1,
    meaning: "존재하지 않거나 가지고 있지 않다 ('안 계시다', '없어요')",
    category: "일상/동작",
    handShapeHint: "🤷+👐",
    keywords: ["양손", "손바닥 폄", "눈/코/입", "불다", "비어있다"],
    synonyms: ["없어요", "없으세요", "안 계시다"],
  },
  {
    id: "ksl_060",
    word: "미안하다",
    searchQuery: "미안하다",
    senseIndex: 1,
    meaning: "남에게 잘못하여 마음이 편치 못하고 부끄럽다 ('죄송합니다')",
    category: "인사/안부",
    handShapeHint: "🙏+🙇",
    keywords: ["오른손", "엄지", "검지(1지)", "머리카락/이마", "죄송합니다", "사과"],
    synonyms: ["죄송합니다", "죄송해요", "미안해요", "실례합니다"],
  },
  {
    id: "ksl_061",
    word: "병원",
    searchQuery: "병원",
    senseIndex: 1,
    meaning: "아픈 사람을 진찰하고 치료하는 곳 (의원, 보건소)",
    category: "복약/건강",
    handShapeHint: "🏥+➕",
    keywords: ["양손", "검지(1지)", "십자가", "가슴 앞", "진료", "치료"],
    synonyms: ["의원", "보건소", "진료소"],
  },
  {
    id: "ksl_062",
    word: "춥다",
    searchQuery: "춥다",
    senseIndex: 1,
    meaning: "기온이 낮아 몸이 시리고 떨리다 ('추우세요?', '쌀쌀하다')",
    category: "복약/건강",
    handShapeHint: "🥶+✊",
    keywords: ["양손", "주먹", "가슴 앞", "떨다", "추위", "서늘하다"],
    synonyms: ["추우세요", "쌀쌀하다", "차갑다", "추워요"],
  },
  {
    id: "ksl_063",
    word: "덥다",
    searchQuery: "덥다",
    senseIndex: 1,
    meaning: "기온이 높아 몸에 열기가 느껴지다 ('더우세요?')",
    category: "복약/건강",
    handShapeHint: "🥵+👋",
    keywords: ["오른손", "손바닥 폄", "볼/턱", "부채질", "좌우로", "더위"],
    synonyms: ["더우세요", "더워요", "무덥다"],
  },
  {
    id: "ksl_064",
    word: "따뜻하다",
    searchQuery: "따뜻하다",
    senseIndex: 1,
    meaning: "춥지도 덥지도 않고 알맞게 온기가 있다",
    category: "복약/건강",
    handShapeHint: "☀️+🤲",
    keywords: ["양손", "가슴 앞", "돌리기", "온기", "포근하다"],
    synonyms: ["포근하다", "훈훈하다", "따스하다"],
  },
  {
    id: "ksl_065",
    word: "집",
    searchQuery: "집",
    senseIndex: 1,
    meaning: "사람이 살기 위해 지은 건물, 가정 ('댁')",
    category: "귀가/송영",
    handShapeHint: "🏠+👐",
    keywords: ["양손", "손바닥 폄", "가슴 앞", "지붕", "가정", "댁"],
    synonyms: ["댁", "가정", "자택"],
  },
  {
    id: "ksl_066",
    word: "가족",
    searchQuery: "가족",
    senseIndex: 1,
    meaning: "부부, 부모, 자녀 등 한집안을 이루는 식구",
    category: "인사/안부",
    handShapeHint: "👨‍👩‍👧+🏠",
    keywords: ["양손", "가슴 앞", "식구", "집안"],
    synonyms: ["식구", "집안"],
  },
  {
    id: "ksl_067",
    word: "생일",
    searchQuery: "생일",
    senseIndex: 1,
    meaning: "세상에 태어난 날 ('생신')",
    category: "인사/안부",
    handShapeHint: "🎂+🎉",
    keywords: ["양손", "배", "가슴 앞", "출생", "생신"],
    synonyms: ["생신", "탄신일"],
  },
  {
    id: "ksl_068",
    word: "축하하다",
    searchQuery: "축하",
    senseIndex: 1,
    meaning: "기쁜 일을 함께 기뻐하며 복을 빌다 ('축하드려요')",
    category: "인사/안부",
    handShapeHint: "🎉+👐",
    keywords: ["양손", "주먹", "위아래로", "손바닥 폄", "기념", "박수"],
    synonyms: ["축하합니다", "축하드려요", "경축"],
  },
  {
    id: "ksl_069",
    word: "설날",
    searchQuery: "설날",
    senseIndex: 1,
    meaning: "음력 정월 초하룻날 명절 (새해 첫날)",
    category: "시간/명절",
    handShapeHint: "🙇+🌅",
    keywords: ["양손", "절", "새해", "구정", "명절"],
    synonyms: ["구정", "새해", "설"],
  },
  {
    id: "ksl_070",
    word: "노래",
    searchQuery: "노래",
    senseIndex: 1,
    meaning: "가락에 맞추어 부르는 노래 (노래교실 프로그램)",
    category: "프로그램",
    handShapeHint: "🎵+👋",
    keywords: ["양손", "눈/코/입", "좌우로", "음악", "부르다"],
    synonyms: ["노래하다", "음악", "노래교실"],
  },
  {
    id: "ksl_071",
    word: "사과",
    searchQuery: "사과",
    senseIndex: 1,
    meaning: "사과나무의 열매 (먹는 과일 사과)",
    category: "식사/간식",
    handShapeHint: "🍎+✊",
    keywords: ["오른손", "주먹", "볼/턱", "과일", "간식"],
    synonyms: ["과일 사과", "풋사과"],
  },
  {
    id: "ksl_072",
    word: "무엇",
    searchQuery: "무엇",
    senseIndex: 1,
    meaning: "모르는 사실이나 사물을 가리키는 의문 대명사 ('뭐', '무슨')",
    category: "일상/동작",
    handShapeHint: "☝️+❓",
    keywords: ["오른손", "한손", "검지(1지)", "좌우로", "질문", "뭐", "무슨"],
    synonyms: ["뭐", "무슨", "무엇을", "뭔가요"],
  },
  {
    id: "ksl_073",
    word: "언제",
    searchQuery: "언제",
    senseIndex: 1,
    meaning: "어느 때, 몇 시 ('언제 오세요?')",
    category: "시간/명절",
    handShapeHint: "⌚+❓",
    keywords: ["양손", "검지(1지)", "손가락", "때", "시간"],
    synonyms: ["어느 때", "몇 시"],
  },
  {
    id: "ksl_074",
    word: "누구",
    searchQuery: "누구",
    senseIndex: 1,
    meaning: "모르는 사람을 가리키는 대명사 ('누가', '어느 분')",
    category: "인사/안부",
    handShapeHint: "👤+❓",
    keywords: ["오른손", "검지(1지)", "볼/턱", "사람", "누가"],
    synonyms: ["누가", "어느 분"],
  },
  {
    id: "ksl_075",
    word: "왜",
    searchQuery: "왜",
    senseIndex: 1,
    meaning: "어째서, 무슨 이유로",
    category: "일상/동작",
    handShapeHint: "🤔+❓",
    keywords: ["오른손", "검지(1지)", "머리카락/이마", "이유", "어째서"],
    synonyms: ["어째서", "이유", "왜요"],
  },
  {
    id: "ksl_076",
    word: "원하다",
    searchQuery: "원하다",
    senseIndex: 1,
    meaning: "무엇을 바라거나 하고 싶어 하다 ('~고 싶어요', '~실래요?')",
    category: "감정/상태",
    handShapeHint: "🤲+✨",
    keywords: ["오른손", "볼/턱", "목", "바라다", "희망하다", "싶다"],
    synonyms: ["바라다", "희망하다", "싶다", "싶어요"],
  },
  {
    id: "ksl_077",
    word: "알다",
    searchQuery: "알다",
    senseIndex: 1,
    meaning: "내용이나 사실을 이해하고 깨닫다 ('아세요?', '알겠어요')",
    category: "감정/상태",
    handShapeHint: "💡+🤚",
    keywords: ["오른손", "손바닥 폄", "가슴 앞", "위아래로", "이해하다"],
    synonyms: ["아세요", "알겠어요", "이해하다", "깨닫다"],
  },
  {
    id: "ksl_078",
    word: "모르다",
    searchQuery: "모르다",
    senseIndex: 1,
    meaning: "내용이나 사실을 알지 못하다 ('몰라요', '모르겠어요')",
    category: "감정/상태",
    handShapeHint: "❓+🤚",
    keywords: ["오른손", "가슴 앞", "앞으로", "몰라요"],
    synonyms: ["몰라요", "모르세요", "모르겠어요"],
  },
  {
    id: "ksl_079",
    word: "생각하다",
    searchQuery: "생각",
    senseIndex: 1,
    meaning: "마음속으로 헤아리거나 궁리하다 ('생각', '고민하다')",
    category: "감정/상태",
    handShapeHint: "🤔+☝️",
    keywords: ["오른손", "검지(1지)", "머리카락/이마", "사고", "고민"],
    synonyms: ["생각", "고민하다", "기억하다"],
  },
  {
    id: "ksl_080",
    word: "가능하다",
    searchQuery: "가능",
    senseIndex: 1,
    meaning: "할 수 있다, 괜찮다 ('수 있다')",
    category: "일상/동작",
    handShapeHint: "🙆+👍",
    keywords: ["양손", "가슴 앞", "할 수 있다"],
    synonyms: ["할 수 있다", "가능", "되다"],
  },
  {
    id: "ksl_081",
    word: "못하다",
    searchQuery: "불가능",
    senseIndex: 1,
    meaning: "할 수 없다, 불가능하다 ('못 해요')",
    category: "일상/동작",
    handShapeHint: "🙅+✋",
    keywords: ["양손", "가슴 앞", "불가능", "못"],
    synonyms: ["할 수 없다", "불가능하다", "못"],
  },
  {
    id: "ksl_082",
    word: "말다",
    searchQuery: "금지",
    senseIndex: 1,
    meaning: "하지 못하게 말리거나 금지하다 ('~지 마세요', '안 돼요')",
    category: "일상/동작",
    handShapeHint: "🚫+✋",
    keywords: ["오른손", "손바닥 폄", "가슴 앞", "금지", "마세요"],
    synonyms: ["마세요", "하지 마세요", "금지", "안 돼요"],
  },
  {
    id: "ksl_083",
    word: "나",
    searchQuery: "나",
    senseIndex: 1,
    meaning: "말하는 사람 자신을 가리키는 말 ('저', '제가', '내')",
    category: "인사/안부",
    handShapeHint: "👈+🙋",
    keywords: ["오른손", "검지(1지)", "코", "가슴 앞", "자신", "저"],
    synonyms: ["저", "제가", "나는", "저는", "내", "제"],
  },
  {
    id: "ksl_084",
    word: "우리",
    searchQuery: "우리",
    senseIndex: 1,
    meaning: "나와 너, 함께 모인 사람들 ('같이', '다 같이')",
    category: "인사/안부",
    handShapeHint: "👥+🔄",
    keywords: ["오른손", "손바닥 폄", "돌리기", "가슴 앞", "함께", "같이"],
    synonyms: ["저희", "같이", "함께", "다 같이"],
  },
  {
    id: "ksl_085",
    word: "어르신",
    searchQuery: "노인",
    senseIndex: 1,
    meaning: "나이가 많으신 분을 높여 부르는 말 ('할아버지', '할머니')",
    category: "인사/안부",
    handShapeHint: "🧓+🙇",
    keywords: ["양손", "볼/턱", "수염", "지팡이", "노인", "할아버지", "할머니"],
    synonyms: ["노인", "할아버지", "할머니", "어른"],
  },
  {
    id: "ksl_086",
    word: "선생님",
    searchQuery: "선생",
    senseIndex: 1,
    meaning: "가르치거나 돌보아 주는 사람 ('선생님', '복지사')",
    category: "인사/안부",
    handShapeHint: "👩‍🏫+✋",
    keywords: ["양손", "가슴 앞", "교사", "선생"],
    synonyms: ["선생", "교사", "복지사님"],
  },
  {
    id: "ksl_087",
    word: "밥",
    searchQuery: "밥",
    senseIndex: 1,
    meaning: "쌀을 지어 만든 음식, 끼니 ('진지', '식사')",
    category: "식사/간식",
    handShapeHint: "🍚+🥣",
    keywords: ["양손", "입", "가슴 앞", "식사", "진지"],
    synonyms: ["진지", "끼니", "쌀밥"],
  },
  {
    id: "ksl_088",
    word: "간식",
    searchQuery: "과자",
    senseIndex: 1,
    meaning: "끼니 사이에 먹는 과자나 다과 ('새참', '다과')",
    category: "식사/간식",
    handShapeHint: "🍪+😋",
    keywords: ["오른손", "볼/턱", "입", "과자", "다과"],
    synonyms: ["과자", "다과", "새참", "주전부리"],
  },
  {
    id: "ksl_089",
    word: "마시다",
    searchQuery: "마시다",
    senseIndex: 1,
    meaning: "물이나 차, 음료수를 입에 넣어 삼키다",
    category: "식사/간식",
    handShapeHint: "🥤+👄",
    keywords: ["오른손", "주먹", "엄지", "입", "음료"],
    synonyms: ["마셔요", "마시세요", "음수"],
  },
  {
    id: "ksl_090",
    word: "차",
    searchQuery: "자동차",
    senseIndex: 1,
    meaning: "사람을 실어 나르는 자동차 (송영 차량, 승합차)",
    category: "귀가/송영",
    handShapeHint: "🚐+✊",
    keywords: ["양손", "주먹", "가슴 앞", "운전", "핸들", "자동차"],
    synonyms: ["자동차", "차량", "송영차", "승합차"],
  },
  {
    id: "ksl_091",
    word: "타다",
    searchQuery: "승차",
    senseIndex: 1,
    meaning: "자동차나 버스 등의 탈것에 오르다 ('탑승하다', '타세요')",
    category: "귀가/송영",
    handShapeHint: "🚐+⬆️",
    keywords: ["양손", "검지(1지)", "손바닥 폄", "올라타다", "승차"],
    synonyms: ["탑승하다", "승차하다", "타세요", "타고"],
  },
  {
    id: "ksl_092",
    word: "내리다",
    searchQuery: "하차",
    senseIndex: 1,
    meaning: "타고 있던 자동차나 버스에서 밖으로 나오다 ('하차하다', '내리세요')",
    category: "귀가/송영",
    handShapeHint: "🚐+⬇️",
    keywords: ["양손", "검지(1지)", "손바닥 폄", "아래로", "하차"],
    synonyms: ["하차하다", "내리세요"],
  },
  {
    id: "ksl_093",
    word: "옷",
    searchQuery: "옷",
    senseIndex: 1,
    meaning: "몸에 입는 의복이나 외투 ('입다')",
    category: "일상/동작",
    handShapeHint: "🧥+👐",
    keywords: ["양손", "가슴 앞", "위아래로", "스치기", "의복", "외투"],
    synonyms: ["의복", "외투", "옷 입다", "입다"],
  },
  {
    id: "ksl_094",
    word: "산책",
    searchQuery: "산책",
    senseIndex: 1,
    meaning: "기분을 전환하거나 건강을 위해 천천히 걷는 일 ('걷다', '나들이')",
    category: "프로그램",
    handShapeHint: "🚶+🌳",
    keywords: ["양손", "검지(1지)", "앞으로", "걷다", "산보"],
    synonyms: ["산보", "나들이", "걷기", "산책하다"],
  },
  {
    id: "ksl_095",
    word: "많이",
    searchQuery: "많다",
    senseIndex: 1,
    meaning: "수나 양, 정도가 넉넉하고 넘치게 ('많다', '듬뿍')",
    category: "일상/부사",
    handShapeHint: "👐+✨",
    keywords: ["양손", "손바닥 폄", "위로", "가슴 앞", "풍부하다"],
    synonyms: ["많다", "듬뿍", "가득", "매우", "너무"],
  },
  {
    id: "ksl_096",
    word: "편지",
    searchQuery: "편지",
    senseIndex: 1,
    meaning: "안부나 소식을 적어 보내는 글 ('우편', '소식')",
    category: "일상/동작",
    handShapeHint: "✉️+✋",
    keywords: ["양손", "검지(1지)", "입", "손바닥 폄", "우편"],
    synonyms: ["서신", "우편", "엽서"],
  },
  {
    id: "ksl_097",
    word: "찍다",
    searchQuery: "촬영",
    senseIndex: 1,
    meaning: "카메라나 휴대전화로 사진이나 영상을 촬영하다 ('촬영하다', '사진 찍다')",
    category: "프로그램",
    handShapeHint: "📷+☝️",
    keywords: ["양손", "검지(1지)", "눈/코/입", "사진", "촬영", "카메라"],
    synonyms: ["촬영하다", "촬영", "사진찍다", "찍어도", "촬영할건데"],
  },
  {
    id: "ksl_098",
    word: "영상",
    searchQuery: "동영상",
    senseIndex: 1,
    meaning: "움직이는 화면이나 비디오, 영화, 동영상",
    category: "프로그램",
    handShapeHint: "🎬+👐",
    keywords: ["양손", "손바닥 폄", "가슴 앞", "흔들기", "동영상", "비디오", "영화"],
    synonyms: ["동영상", "비디오", "영화", "화면"],
  },
  {
    id: "ksl_099",
    word: "대회",
    searchQuery: "대회",
    senseIndex: 1,
    meaning: "실력을 겨루거나 모이는 큰 모임이나 경진대회, 경기",
    category: "프로그램",
    handShapeHint: "🏆+👐",
    keywords: ["양손", "가슴 앞", "경진대회", "경기", "시합"],
    synonyms: ["경진대회", "시합", "경기", "공모전"],
  },
  {
    id: "ksl_100",
    word: "참가하다",
    searchQuery: "참가",
    senseIndex: 1,
    meaning: "대회나 모임, 행사 등에 나가 함께하다 ('참여하다', '대회에 나가다', '출전하다')",
    category: "프로그램",
    handShapeHint: "🙋+🤝",
    keywords: ["양손", "검지(1지)", "가슴 앞", "참여", "출전"],
    synonyms: ["참여하다", "참가", "참여", "출전하다", "참석하다"],
  },
  {
    id: "ksl_101",
    word: "나가다",
    searchQuery: "외출",
    senseIndex: 1,
    meaning: "안에서 밖으로 이동하여 나가다 ('외출하다')",
    category: "일상/동작",
    handShapeHint: "🚪+👉",
    keywords: ["양손", "앞으로", "외출", "밖으로"],
    synonyms: ["외출하다", "나오다", "출타하다"],
  },
  {
    id: "ksl_102",
    word: "할머니",
    searchQuery: "할머니",
    senseIndex: 1,
    meaning: "여자 어르신을 친근하게 부르는 말 (조모)",
    category: "가족/호칭",
    handShapeHint: "👵+🤚",
    keywords: ["오른손", "볼/턱", "주먹", "어르신", "조모"],
    synonyms: ["어르신", "조모", "외할머니", "친할머니"],
  },
  {
    id: "ksl_103",
    word: "할아버지",
    searchQuery: "할아버지",
    senseIndex: 1,
    meaning: "남자 어르신을 친근하게 부르는 말 (조부)",
    category: "가족/호칭",
    handShapeHint: "👴+🤚",
    keywords: ["오른손", "볼/턱", "어르신", "조부"],
    synonyms: ["조부", "외할아버지", "친할아버지"],
  },
  {
    id: "ksl_104",
    word: "함께",
    searchQuery: "함께",
    senseIndex: 1,
    meaning: "둘 이상의 사람이 같이, 다 함께 ('~랑', '~와/과 같이')",
    category: "일상/부사",
    handShapeHint: "🤝+👐",
    keywords: ["양손", "가슴 앞", "모으기", "같이", "다같이"],
    synonyms: ["같이", "다같이", "더불어", "함께하다"],
  },
  {
    id: "ksl_105",
    word: "사진",
    searchQuery: "사진",
    senseIndex: 1,
    meaning: "카메라로 찍은 사진이나 모습",
    category: "프로그램",
    handShapeHint: "🖼️+📷",
    keywords: ["양손", "눈/코/입", "가슴 앞", "촬영", "카메라"],
    synonyms: ["촬영", "카메라"],
  },
];

// 기존 어휘 중 국립국어원 표제어 검색 키워드 매핑
const SEARCH_QUERY_OVERRIDES = {
  안녕하세요: { query: "안녕", match: "안녕" },
  지내다: { query: "생활", match: "생활" },
  보내다: { query: "발송", match: "보내다" },
  주말: { query: "휴일", match: "휴일" },
  어떻다: { query: "어떻게", match: "어떻게" },
  조심하다: { query: "조심", match: "조심" },
  좋아하다: { query: "좋다", match: "좋다" },
  피곤하다: { query: "피곤", match: "피곤" },
  체조: { query: "운동", match: "운동" },
  드리다: { query: "드리다", match: "드리다" },
  돌아가다: { query: "돌아가다", match: "돌아가다" },
  사과: { query: "사과", match: "능금" },
};

async function main() {
  const existing = JSON.parse(fs.readFileSync(DICT_PATH, "utf-8"));
  const allTargetEntries = [...existing];

  for (const extra of EXTRA_ESSENTIAL_WORDS) {
    if (!allTargetEntries.some((e) => e.word === extra.word)) {
      allTargetEntries.push({
        id: extra.id,
        word: extra.word,
        senseIndex: extra.senseIndex,
        meaning: extra.meaning,
        category: extra.category,
        signDescription: "",
        actionSummary: "",
        handShapeHint: extra.handShapeHint,
        imageUrls: [],
        videoUrl: "",
        keywords: extra.keywords,
        synonyms: extra.synonyms,
        _searchQuery: extra.searchQuery,
      });
    }
  }

  console.log(`총 ${allTargetEntries.length}개 수어 어휘의 실제 국립국어원 영상/이미지 URL을 동기화합니다...`);

  let updatedCount = 0;
  for (const entry of allTargetEntries) {
    if (entry.word === "미안하다") {
      entry.synonyms = ["죄송합니다", "죄송해요", "미안해요", "실례합니다", "죄송하다", "사과하다", "사과드려요"];
    }
    if (entry.word === "체조") {
      entry.synonyms = ["운동", "스트레칭", "건강체조", "운동하다", "체조하다"];
    }
    if (entry.word === "어떻다") {
      entry.synonyms = ["어떠세요", "어때요", "어떻게", "어찌"];
    }
    if (
      entry.videoUrl &&
      entry.imageUrls?.some((u) => u.includes("sldict.korean.go.kr")) &&
      !SEARCH_QUERY_OVERRIDES[entry.word]
    ) {
      updatedCount++;
      continue;
    }
    const override = SEARCH_QUERY_OVERRIDES[entry.word];
    const query = entry._searchQuery || override?.query || entry.word;
    const matchHint = override?.match || null;
    delete entry._searchQuery;

    try {
      const scraped = await scrapeSldictWord(query, matchHint);
      if (scraped && scraped.videoUrl) {
        entry.videoUrl = scraped.videoUrl;
        entry.imageUrls = scraped.imageUrls;
        if (scraped.signDescription) {
          entry.signDescription = scraped.signDescription;
          if (!entry.actionSummary) {
            entry.actionSummary = scraped.signDescription;
          }
        }
        if (entry.word !== "체조" && entry.word !== "미안하다" && entry.word !== "어떻다") {
          const mergedSyns = new Set([
            ...(entry.synonyms || []),
            ...(scraped.koreanEquivalents || []),
          ]);
          mergedSyns.delete(entry.word);
          entry.synonyms = Array.from(mergedSyns);
        }
        updatedCount++;
        process.stdout.write(`✔ [${entry.word}] `);
      } else {
        console.warn(`\n! [${entry.word}] 검색 결과 없음`);
      }
    } catch (err) {
      console.warn(`\n! [${entry.word}] 수집 오류:`, err.message);
    }
  }

  fs.writeFileSync(DICT_PATH, JSON.stringify(allTargetEntries, null, 2), "utf-8");
  console.log(`\n\n=== 완료: 총 ${updatedCount}/${allTargetEntries.length}개 수어의 실제 국립국어원 MP4/JPG 동기화 성공 ===`);
}

main();
