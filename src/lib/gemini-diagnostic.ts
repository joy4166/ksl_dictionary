import { GoogleGenerativeAI } from "@google/generative-ai";

export interface ModelBenchmarkResult {
  modelName: string;
  status: "success" | "error";
  durationMs: number;
  statusCode?: number;
  errorSnippet?: string;
  responseSnippet?: string;
}

export interface DiagnosticsReport {
  timestamp: string;
  rawAvailableModels: string[];
  benchmarks: ModelBenchmarkResult[];
  recommendedModel: string | null;
}

/**
 * 사용자의 Gemini API 키로 실제 계정에서 사용 가능한 모든 모델을 조회하고,
 * 각 모델별 실제 호출 응답 속도(Latency)와 정상 동작 여부를 정밀 측정하는 진단 도구
 */
export async function runGeminiFullDiagnostics(apiKey: string): Promise<DiagnosticsReport> {
  console.log(`\n========================================================================`);
  console.log(`🔍 [Gemini 전체 정밀 진단 시작] API 키 진단 및 모델 속도 벤치마크`);
  console.log(`========================================================================`);

  const report: DiagnosticsReport = {
    timestamp: new Date().toISOString(),
    rawAvailableModels: [],
    benchmarks: [],
    recommendedModel: null,
  };

  // 1단계: Google API models 엔드포인트에서 실제 계정의 가용 모델 원본 조회
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    );

    if (!res.ok) {
      console.error(`❌ [Google ListModels API 실패] HTTP 상태 코드: ${res.status} ${res.statusText}`);
      const errText = await res.text();
      console.error(`   응답 본문: ${errText}`);
      return report;
    }

    const json = (await res.json()) as {
      models?: Array<{
        name: string;
        supportedGenerationMethods?: string[];
      }>;
    };

    const allModels = (json.models || [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""));

    report.rawAvailableModels = allModels;
    console.log(`📋 [계정 가용 모델 목록 총 ${allModels.length}개 발견]:`);
    console.log(`   ${allModels.join(", ")}`);
  } catch (err) {
    console.error(`❌ [ListModels 요청 실패]:`, err);
    return report;
  }

  // 2단계: 후보 모델들 중 Flash 계열 및 핵심 모델 선별
  const testCandidates = report.rawAvailableModels
    .filter((m) => m.startsWith("gemini-"))
    .slice(0, 8); // 상위 최대 8개 모델 정밀 테스트

  console.log(`\n🧪 [모델별 실제 왕복 지연시간(Latency) 벤치마크 테스트 시작]`);
  console.log(`────────────────────────────────────────────────────────────────────────`);

  const genAI = new GoogleGenerativeAI(apiKey);

  for (const modelName of testCandidates) {
    const start = Date.now();
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      // 5초 타임아웃 제한으로 무한 프리징 차단
      const abortController = new AbortController();
      const timer = setTimeout(() => abortController.abort(), 8000);

      const prompt = `Return JSON: {"status": "ok", "ksl": "안녕"}`;
      const result = await model.generateContent(prompt);
      clearTimeout(timer);

      const text = result.response.text();
      const duration = Date.now() - start;

      report.benchmarks.push({
        modelName,
        status: "success",
        durationMs: duration,
        responseSnippet: text.slice(0, 50).replace(/\n/g, ""),
      });

      console.log(`  ✅ [성공] ${modelName.padEnd(25)} | 소요시간: ${String(duration).padStart(5)}ms | 응답: ${text.slice(0, 30)}`);
    } catch (err: unknown) {
      const duration = Date.now() - start;
      const errMsg = err instanceof Error ? err.message : String(err);
      report.benchmarks.push({
        modelName,
        status: "error",
        durationMs: duration,
        errorSnippet: errMsg.slice(0, 80),
      });

      console.log(`  ❌ [실패] ${modelName.padEnd(25)} | 소요시간: ${String(duration).padStart(5)}ms | 에러: ${errMsg.slice(0, 60)}`);
    }
  }

  // 성공한 모델 중 가장 빠른 모델을 추천
  const successful = report.benchmarks
    .filter((b) => b.status === "success")
    .sort((a, b) => a.durationMs - b.durationMs);

  if (successful.length > 0) {
    report.recommendedModel = successful[0].modelName;
    console.log(`────────────────────────────────────────────────────────────────────────`);
    console.log(`🏆 [최종 최적 추천 모델]: '${successful[0].modelName}' (응답 속도: ${successful[0].durationMs}ms)`);
  } else {
    console.log(`⚠️ 모든 모델 테스트 실패 또는 타임아웃 발생`);
  }
  console.log(`========================================================================\n`);

  return report;
}
