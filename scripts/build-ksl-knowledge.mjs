import fs from "node:fs";
import path from "node:path";

const DICT_PATH = path.join(process.cwd(), "src", "data", "dictionary.json");

/**
 * originNo가 지정된 경우 해당 상세 페이지에서 직접 MP4/JPG/수형설명을 가져오고,
 * 없는 경우 signList.do(CTE) 및 searchAllList.do에서 검색합니다.
 */
async function fetchByOriginOrSearch(target) {
  let originNo = target.originNo || null;
  let topCategory = "CTE";
  let videoUrl = "";
  let thumbUrl = "";
  let rawTitle = target.word;
  let rawDef = target.meaning || "";

  const searchKeyword = target.searchQuery || target.word;
  const listUrl = `https://sldict.korean.go.kr/front/sign/signList.do?top_category=CTE&searchKeyword=${encodeURIComponent(
    searchKeyword
  )}`;
  const res = await fetch(listUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
  const html = await res.text();
  const blocks = html.split("<!--01_list-->").slice(1);
  const candidates = [];

  for (const block of blocks) {
    const fnMatch = block.match(/fnSearchContentsView\s*\(\s*'(\d+)'/);
    const thumbMatch = block.match(
      /src=["'](http[^"']+MOV[^"']+_215X161\.jpg)["']/
    );
    const titMatch = block.match(
      /<span class="tit">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/
    );
    if (fnMatch && thumbMatch && titMatch) {
      const oNo = fnMatch[1];
      const tUrl = thumbMatch[1].replace(/^http:\/\//, "https://");
      const vUrl = tUrl.replace("_215X161.jpg", "_700X466.mp4");
      const rTitle = titMatch[1]
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      candidates.push({
        originNo: oNo,
        topCategory: "CTE",
        thumbUrl: tUrl,
        videoUrl: vUrl,
        rawTitle: rTitle,
      });
    }
  }

  let chosen = null;
  if (originNo) {
    chosen = candidates.find((c) => c.originNo === String(originNo));
  }
  if (!chosen && target.preferredSenseMatch) {
    const kws = Array.isArray(target.preferredSenseMatch)
      ? target.preferredSenseMatch
      : [target.preferredSenseMatch];
    chosen = candidates.find((c) =>
      kws.some((kw) => c.rawTitle.includes(kw))
    );
  }
  if (!chosen && candidates.length > 0) {
    const exact = candidates.find((c) =>
      c.rawTitle
        .split(",")
        .map((w) => w.trim())
        .includes(searchKeyword)
    );
    chosen = exact || candidates[0];
  }

  // 만약 CTE signList에서 못 찾았으면 searchAllList.do 폴백
  if (!chosen) {
    const allUrl = `https://sldict.korean.go.kr/front/search/searchAllList.do?searchKeyword=${encodeURIComponent(
      searchKeyword
    )}`;
    const allRes = await fetch(allUrl);
    const allHtml = await allRes.text();
    const allBlocks = allHtml.split("<!--01_list-->").slice(1);
    for (const block of allBlocks) {
      const fnMatch = block.match(
        /fnSearchContentsView\s*\(\s*'(\d+)'\s*,\s*'([A-Z]+)'/
      );
      const thumbMatch = block.match(
        /src=["'](http[^"']+MOV[^"']+_215X161\.jpg)["']/
      );
      const titMatch = block.match(
        /<span class="tit">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/
      );
      if (fnMatch && thumbMatch && titMatch) {
        chosen = {
          originNo: fnMatch[1],
          topCategory: fnMatch[2],
          thumbUrl: thumbMatch[1].replace(/^http:\/\//, "https://"),
          videoUrl: thumbMatch[1]
            .replace(/^http:\/\//, "https://")
            .replace("_215X161.jpg", "_700X466.mp4"),
          rawTitle: titMatch[1]
            .replace(/<[^>]+>/g, "")
            .replace(/\s+/g, " ")
            .trim(),
        };
        break;
      }
    }
  }

  if (!chosen) return null;

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
  };
}

const PRECISE_TARGETS = [
  {
    id: "ksl_111",
    word: "(신체의)배",
    searchQuery: "복부",
    originNo: "7847",
    senseIndex: 1,
    meaning: "사람이나 동물의 가슴과 엉덩이 사이의 부위 (복부, 위장, '배가 아프다')",
    category: "신체/건강",
    handShapeHint: "🤰+✋",
    keywords: ["배", "복부", "신체", "위장", "소화", "배탈", "아프다", "배고프다", "배부르다"],
    synonyms: ["배", "복부", "신체배"],
  },
  {
    id: "ksl_112",
    word: "(탈것)배",
    searchQuery: "선박",
    senseIndex: 2,
    meaning: "물 위로 사람이나 짐을 싣고 다니는 탈것 (선박, 유람선, 여객선)",
    category: "시설/장소",
    handShapeHint: "🚢+👐",
    keywords: ["배", "선박", "바다", "항구", "타다", "물", "항해", "배편"],
    synonyms: ["배", "선박", "여객선", "유람선"],
  },
  {
    id: "ksl_113",
    word: "(과일)배",
    searchQuery: "과일",
    originNo: "7845",
    senseIndex: 3,
    meaning: "배나무의 열매로 깎아 먹는 달콤한 과일 (나주배, 과일 배)",
    category: "식사/간식",
    handShapeHint: "🍐+🔪",
    keywords: ["배", "과일", "열매", "깎다", "먹다", "달다", "간식", "사과"],
    synonyms: ["배", "과일배"],
  },
  {
    id: "ksl_114",
    word: "(시간)밤",
    searchQuery: "밤",
    originNo: "11241",
    senseIndex: 1,
    meaning: "해가 진 뒤부터 날이 새기 전까지의 어두운 시간 (야간, 밤잠)",
    category: "시간/명절",
    handShapeHint: "🌙+👐",
    keywords: ["밤", "야간", "저녁", "어둡다", "자다", "잠", "새벽", "오늘밤", "어제밤"],
    synonyms: ["밤", "야간", "밤중", "한밤중"],
  },
  {
    id: "ksl_115",
    word: "(열매)밤",
    searchQuery: "밤",
    originNo: "8489",
    senseIndex: 2,
    meaning: "밤나무의 열매로 구워 먹거나 삶아 먹는 견과류 (군밤, 알밤)",
    category: "식사/간식",
    handShapeHint: "🌰+✊",
    keywords: ["밤", "열매", "군밤", "알밤", "먹다", "구워", "삶다", "간식"],
    synonyms: ["밤", "알밤", "군밤"],
  },
  {
    id: "ksl_116",
    word: "(말을)타다",
    searchQuery: "승마",
    originNo: "6134",
    senseIndex: 2,
    meaning: "말이나 자전거 등에 올라타다 ('말을 타다', '승마')",
    category: "프로그램",
    handShapeHint: "🐎+✌️",
    keywords: ["말", "타다", "승마", "올라타다"],
    synonyms: ["타다", "승마하다"],
  },
  {
    id: "ksl_117",
    word: "(동물)말",
    searchQuery: "말",
    originNo: "6134",
    senseIndex: 2,
    meaning: "사람이 타거나 짐을 끄는 네 발 달린 동물 (경주마, 조랑말)",
    category: "자연/날씨",
    handShapeHint: "🐴+✌️",
    keywords: ["말", "동물", "타다", "달리다", "승마", "당근"],
    synonyms: ["말", "동물말", "경주마"],
  },
  {
    id: "ksl_118",
    word: "(신체의)손",
    searchQuery: "손",
    senseIndex: 1,
    meaning: "사람의 팔목 끝에 달린 신체 부위 ('손을 씻다', '손을 잡다')",
    category: "신체/건강",
    handShapeHint: "✋+🤚",
    keywords: ["손", "신체", "손바닥", "손가락", "씻다", "잡다"],
    synonyms: ["손", "양손", "손바닥"],
  },
  {
    id: "ksl_119",
    word: "(신체의)발",
    searchQuery: "발",
    originNo: "10270",
    senseIndex: 1,
    meaning: "사람이나 동물의 다리 끝에 달린 신체 부위 ('발이 아프다', '발걸음')",
    category: "신체/건강",
    handShapeHint: "🦶+✋",
    keywords: ["발", "신체", "발목", "발바닥", "신발", "걷다", "발걸음"],
    synonyms: ["발", "양발", "발걸음"],
  },
  {
    id: "ksl_120",
    word: "(신체의)입",
    searchQuery: "입술",
    originNo: "8962",
    senseIndex: 1,
    meaning: "음식을 먹고 소리를 내는 신체 기관 ('입을 벌리다', '입술')",
    category: "신체/건강",
    handShapeHint: "👄+☝️",
    keywords: ["입", "신체", "입술", "치아", "벌리다"],
    synonyms: ["입", "구강", "입술"],
  },
  {
    id: "ksl_121",
    word: "(신체의)귀",
    searchQuery: "귀",
    senseIndex: 1,
    meaning: "소리를 듣는 감각 기관 ('귀가 밝다', '귀가 아프다')",
    category: "신체/건강",
    handShapeHint: "👂+🤏",
    keywords: ["귀", "신체", "듣다", "소리", "청각"],
    synonyms: ["귀", "양귀"],
  },
  {
    id: "ksl_122",
    word: "(마시는)차",
    searchQuery: "녹차",
    senseIndex: 2,
    meaning: "찻잎이나 열매 등을 우려내어 마시는 음료 (녹차, 보리차, 커피, 한방차)",
    category: "식사/간식",
    handShapeHint: "🍵+🤏",
    keywords: ["차", "마시다", "음료", "따뜻하다", "녹차", "커피", "한잔"],
    synonyms: ["차", "녹차", "홍차", "다과"],
  },
  {
    id: "ksl_153",
    word: "(모자·안경을)쓰다",
    searchQuery: "모자",
    originNo: "8317",
    senseIndex: 1,
    meaning: "모자나 안경 등을 머리나 얼굴에 착용하다 ('모자를 쓰다', '안경을 쓰다')",
    category: "일상/동작",
    handShapeHint: "🧢+👐",
    keywords: ["쓰다", "착용하다", "모자", "안경"],
    synonyms: ["쓰다", "착용하다", "(모자를)쓰다"],
  },
  {
    id: "ksl_154",
    word: "(글을)쓰다",
    searchQuery: "적다",
    originNo: "24704",
    senseIndex: 2,
    meaning: "종이 위에 글씨를 적거나 문장을 작성하다 ('글을 쓰다', '적다', '필기하다')",
    category: "프로그램",
    handShapeHint: "✍️+✋",
    keywords: ["쓰다", "글씨", "적다", "편지", "이름", "서명", "필기"],
    synonyms: ["쓰다", "적다", "작성하다", "기록하다", "필기"],
  },
  {
    id: "ksl_155",
    word: "(맛이)쓰다",
    searchQuery: "쓰다",
    originNo: "6085",
    senseIndex: 3,
    meaning: "약이나 음식의 맛이 달지 않고 쓰다 ('약이 쓰다', '쓴맛')",
    category: "식사/간식",
    handShapeHint: "😖+👅",
    keywords: ["쓰다", "맛", "약", "입맛", "쓴맛"],
    synonyms: ["쓰다", "쓴맛", "씁쓸하다"],
  },
  {
    id: "ksl_156",
    word: "음식",
    searchQuery: "음식",
    senseIndex: 1,
    meaning: "사람이 먹을 수 있도록 만든 밥이나 요리 ('식사', '요리')",
    category: "식사/간식",
    handShapeHint: "🍲+👐",
    keywords: ["음식", "요리", "먹다", "식사"],
    synonyms: ["음식", "요리", "먹거리"],
  },
  {
    id: "ksl_157",
    word: "종이",
    searchQuery: "종이",
    senseIndex: 1,
    meaning: "글씨를 쓰거나 그림을 그리는 종이",
    category: "프로그램",
    handShapeHint: "📄+👐",
    keywords: ["종이", "글씨", "쓰다"],
    synonyms: ["종이", "용지"],
  },
  {
    id: "ksl_158",
    word: "이름",
    searchQuery: "이름",
    senseIndex: 1,
    meaning: "사람이나 사물을 부르는 명칭 ('성함', '성명')",
    category: "인사/안부",
    handShapeHint: "📛+👍",
    keywords: ["이름", "성함", "명찰", "가슴"],
    synonyms: ["이름", "성함", "성명"],
  },
  {
    id: "ksl_159",
    word: "바다",
    searchQuery: "바다",
    senseIndex: 1,
    meaning: "지구 위에서 짠물이 괴어 있는 넓고 큰 곳",
    category: "자연/날씨",
    handShapeHint: "🌊+👐",
    keywords: ["바다", "물", "파도", "배"],
    synonyms: ["바다", "해양", "바닷가"],
  },
  {
    id: "ksl_160",
    word: "강",
    searchQuery: "강",
    senseIndex: 1,
    meaning: "넓고 길게 흐르는 큰 물줄기 ('한강', '하천')",
    category: "자연/날씨",
    handShapeHint: "🏞️+👐",
    keywords: ["강", "물", "흐르다", "다리", "한강"],
    synonyms: ["강", "하천", "강물", "한강"],
  },
  {
    id: "ksl_161",
    word: "건너다",
    searchQuery: "건너다",
    senseIndex: 1,
    meaning: "강이나 다리, 길을 이쪽에서 저쪽으로 가로질러 가다 ('건너가다')",
    category: "일상/동작",
    handShapeHint: "🚶+🌉",
    keywords: ["건너다", "다리", "길", "횡단"],
    synonyms: ["건너다", "건너가다", "횡단하다"],
  },
  {
    id: "ksl_162",
    word: "과일",
    searchQuery: "과일",
    originNo: "5943",
    senseIndex: 1,
    meaning: "나무나 풀에 열리는 먹을 수 있는 열매 ('과실', '청과')",
    category: "식사/간식",
    handShapeHint: "🍎+🍐",
    keywords: ["과일", "열매", "사과", "배", "간식"],
    synonyms: ["과일", "과실", "청과"],
  },
  {
    id: "ksl_163",
    word: "달다",
    searchQuery: "달다",
    senseIndex: 1,
    meaning: "꿀이나 설탕, 과일처럼 맛이 달콤하다 ('달콤하다')",
    category: "식사/간식",
    handShapeHint: "🍬+😋",
    keywords: ["달다", "달콤하다", "맛", "설탕", "과일"],
    synonyms: ["달다", "달콤하다", "단맛"],
  },
  {
    id: "ksl_164",
    word: "미끄럽다",
    searchQuery: "미끄럽다",
    senseIndex: 1,
    meaning: "바닥이나 길이 매끄러워 미끄러지기 쉽다 ('미끄러지다')",
    category: "자연/날씨",
    handShapeHint: "🧊+👐",
    keywords: ["미끄럽다", "미끄러지다", "얼음", "눈", "길"],
    synonyms: ["미끄럽다", "미끄러지다", "빙판"],
  },
  {
    id: "ksl_165",
    word: "장갑",
    searchQuery: "장갑",
    senseIndex: 1,
    meaning: "손을 보호하거나 추위를 막기 위해 손에 끼는 물건",
    category: "일상/동작",
    handShapeHint: "🧤+✋",
    keywords: ["장갑", "손", "끼다", "겨울"],
    synonyms: ["장갑", "손장갑"],
  },
];

async function main() {
  const existing = JSON.parse(fs.readFileSync(DICT_PATH, "utf-8"));
  const dictMap = new Map(existing.map((e) => [e.id, e]));

  for (const target of PRECISE_TARGETS) {
    const scraped = await fetchByOriginOrSearch(target);
    if (scraped && scraped.videoUrl) {
      const mergedSyns = Array.from(
        new Set([...(target.synonyms || []), ...(scraped.koreanEquivalents || [])])
      );
      dictMap.set(target.id, {
        id: target.id,
        word: target.word,
        senseIndex: target.senseIndex,
        meaning: target.meaning,
        category: target.category,
        signDescription: scraped.signDescription,
        actionSummary: scraped.signDescription,
        handShapeHint: target.handShapeHint,
        imageUrls: scraped.imageUrls,
        videoUrl: scraped.videoUrl,
        keywords: target.keywords,
        synonyms: mergedSyns,
      });
      console.log(`✔ 정밀 보정 완료: [${target.id}] ${target.word} -> origin=${scraped.originNo} | ${scraped.signDescription.slice(0, 40)}...`);
    }
  }

  const finalDict = Array.from(dictMap.values());
  fs.writeFileSync(DICT_PATH, JSON.stringify(finalDict, null, 2), "utf-8");
  console.log(`\n✅ dictionary.json 정밀 검증 완료! (총 ${finalDict.length}개)`);
}

main();
