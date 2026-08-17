// Debate Free AI 카탈로그 — 클라이언트/서버 공용 (서버 전용 의존성 금지).
// 실제 업스트림 매핑·쿠터 로직은 free-ai.ts(서버 전용)에 있다.
export const FREE_AI_DAILY_LIMIT = 100_000;

export interface FreeAiModel {
  id: string;
  label: string;
  via: string; // 키 출처 안내용
}

// 기본 모델 제공자 계열 — 설정에서 사용자가 선택한다 (User.aiModel에 id 저장)
export type FreeAiFamily = 'gemma' | 'groq' | 'grok' | 'huggingface';

export const FREE_AI_FAMILIES: Array<{ id: FreeAiFamily; label: string; via: string; desc: string }> = [
  { id: 'gemma', label: 'Gemma 계열', via: 'Google AI Studio', desc: 'Gemma 3 등 구글 오픈 모델' },
  { id: 'groq', label: 'Llama · GPT-OSS 계열', via: 'Groq', desc: '초고속 추론 (Llama 3.3, GPT OSS 20B)' },
  { id: 'grok', label: 'Grok 4.5', via: 'xAI API', desc: 'xAI 플래그십 모델' },
  { id: 'huggingface', label: 'EXAONE · DeepSeek 계열', via: 'Hugging Face Inference API', desc: '오픈 모델 라우터' },
];

export function isFreeAiFamily(v: string | null | undefined): v is FreeAiFamily {
  return !!v && FREE_AI_FAMILIES.some((f) => f.id === v);
}

// 지원 모델 카탈로그 — 설정 화면 안내에도 그대로 노출된다
export const FREE_AI_MODELS: FreeAiModel[] = [
  { id: 'gpt-5.5', label: 'ChatGPT 5.5', via: 'ChatGPT API Platform' },
  { id: 'gpt-oss-20b', label: 'GPT OSS 20B', via: 'Groq' },
  { id: 'gemini-3', label: 'Gemini 3', via: 'Google AI Studio' },
  { id: 'gemma-3-20b', label: 'Gemma 3 20B', via: 'Google AI Studio' },
  { id: 'llama-3.3-70b', label: 'Llama 3.3 70B', via: 'Groq' },
  { id: 'grok', label: 'Grok', via: 'Grok API' },
  { id: 'deepseek', label: 'DeepSeek', via: 'Hugging Face' },
  { id: 'exaone', label: 'EXAONE', via: 'Hugging Face' },
];
