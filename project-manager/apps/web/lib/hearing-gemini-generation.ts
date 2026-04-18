import type { GenerationConfig } from "@google/generative-ai";

/**
 * ヒアリング（アドバイス / Excel→JSON）共通の生成設定。
 * SDK の GenerationConfig に thinking が未載のため拡張し、REST と同じ payload を送る。
 */
export type HearingGeminiGenerationConfig = GenerationConfig & {
  thinkingConfig?: {
    thinkingLevel?: "HIGH" | "MEDIUM" | "LOW" | "MINIMAL";
  };
};

/** 再現性・JSON 安定性: temperature 0.4。矛盾チェック: thinking HIGH。ツールは未使用。 */
export const HEARING_GEMINI_GENERATION_CONFIG: HearingGeminiGenerationConfig = {
  temperature: 0.4,
  topP: 0.95,
  maxOutputTokens: 16384,
  thinkingConfig: {
    thinkingLevel: "HIGH",
  },
};
