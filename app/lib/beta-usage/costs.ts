export const BETA_AI_ENDPOINTS = {
  analyze: { path: "/api/analyze", units: 1, expensive: false, streaming: true },
  mock_interview: { path: "/api/mock-interview", units: 1, expensive: false, streaming: false },
  custom_interview: { path: "/api/custom-interview", units: 2, expensive: true, streaming: false },
  custom_interview_extract: {
    path: "/api/custom-interview/extract",
    units: 2,
    expensive: true,
    streaming: false
  },
  resume_studio: { path: "/api/resume-studio", units: 2, expensive: true, streaming: false },
  resume_studio_extract: {
    path: "/api/resume-studio/extract",
    units: 2,
    expensive: true,
    streaming: false
  },
  transcribe: { path: "/api/transcribe", units: 2, expensive: true, streaming: false },
  mock_interview_transcribe: {
    path: "/api/mock-interview/transcribe",
    units: 2,
    expensive: true,
    streaming: false
  }
} as const;

export type BetaAiEndpoint = keyof typeof BETA_AI_ENDPOINTS;
export type BetaAiEndpointPolicy = (typeof BETA_AI_ENDPOINTS)[BetaAiEndpoint];

export function getBetaAiEndpointPolicy(endpoint: BetaAiEndpoint): BetaAiEndpointPolicy {
  return BETA_AI_ENDPOINTS[endpoint];
}
