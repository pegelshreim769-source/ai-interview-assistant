export type ResumeStudioStep = "materials" | "facts" | "plan" | "rewrite" | "validate" | "finalize";

export type ResumeStudioInputType = "text" | "file" | "image";

export type ResumeStudioInputMeta = {
  input_type: ResumeStudioInputType;
  original_file_name: string;
  extracted_text: string;
  edited_text: string;
  parse_source: string;
  confirmed: boolean;
};

export type FactCategory =
  | "identity"
  | "contact"
  | "education"
  | "certification"
  | "employer"
  | "role"
  | "date"
  | "experience"
  | "project"
  | "skill"
  | "metric"
  | "publication"
  | "link"
  | "other";

export type FactChangePolicy = "fixed" | "paraphrase" | "selectable" | "optional";

export type FactVerificationStatus = "pending" | "confirmed";

export type FactMetric = {
  raw: string;
  context: string;
};

export type FactDate = {
  raw: string;
  start: string;
  end: string;
};

export type FactLedgerItem = {
  evidence_id: string;
  source: "resume" | "user_confirmation";
  source_excerpt: string;
  fact: string;
  category: FactCategory;
  change_policy: FactChangePolicy;
  fixed: boolean;
  verification_status: FactVerificationStatus;
  date: FactDate | null;
  metrics: FactMetric[];
  experience_id: string;
  experience_title: string;
  risk_note: string;
};

export type EvidenceGap = {
  gap_id: string;
  scope: "fact" | "plan" | "rewrite" | "finalize";
  description: string;
  required_for: string;
  related_evidence_ids: string[];
  resolved: boolean;
};

export type FactLedger = {
  methodology_version: string;
  generated_at: string;
  source_resume_text: string;
  items: FactLedgerItem[];
  evidence_gaps: EvidenceGap[];
};

export type MatchStrength = "strong" | "transferable" | "supporting" | "irrelevant";

export type ResumePlanSignal = {
  signal: string;
  importance: "must" | "important" | "bonus";
  evidence_ids: string[];
  gap: string;
};

export type ResumePlanExperience = {
  experience_id: string;
  title: string;
  match_strength: MatchStrength;
  reason: string;
  evidence_ids: string[];
  selected: boolean;
  order: number;
};

export type ResumePlan = {
  methodology_version: string;
  target_role: string;
  narrative: string;
  target_keywords: string[];
  jd_signals: ResumePlanSignal[];
  experiences: ResumePlanExperience[];
  capability_groups: Array<{
    label: string;
    evidence_ids: string[];
  }>;
  evidence_gaps: EvidenceGap[];
};

export type RewriteDecision = "pending" | "accepted" | "rejected";

export type RewrittenBullet = {
  bullet_id: string;
  label: string;
  text: string;
  evidence_ids: string[];
  decision: RewriteDecision;
};

export type RewrittenExperience = {
  experience_id: string;
  title: string;
  original_text: string;
  scene_summary: string;
  scene_summary_evidence_ids: string[];
  bullets: RewrittenBullet[];
  evidence_gaps: EvidenceGap[];
};

export type ClaimIssueCode =
  | "missing_evidence"
  | "unknown_evidence"
  | "unsupported_metric"
  | "unsupported_claim_term"
  | "fixed_fact_drift"
  | "unconfirmed_evidence";

export type ClaimIssue = {
  issue_id: string;
  code: ClaimIssueCode;
  severity: "error" | "warning";
  claim: string;
  message: string;
  evidence_ids: string[];
};

export type ClaimsValidation = {
  methodology_version: string;
  valid: boolean;
  checked_claims: number;
  issues: ClaimIssue[];
  evidence_gaps: EvidenceGap[];
};

export type FinalResumeLine = {
  text: string;
  evidence_ids: string[];
};

export type FinalResume = {
  methodology_version: string;
  target_title: string;
  summary: FinalResumeLine[];
  capabilities: Array<{
    label: string;
    content: string;
    evidence_ids: string[];
  }>;
  experiences: Array<{
    experience_id: string;
    title: string;
    scene_summary: FinalResumeLine;
    bullets: FinalResumeLine[];
  }>;
  full_text: string;
  evidence_ids: string[];
  validation: ClaimsValidation;
};

export type ResumeStudioSession = {
  session_id: string;
  created_at: string;
  updated_at: string;
  methodology_version: string;
  current_step: ResumeStudioStep;
  resume_text: string;
  jd_text: string;
  resume_input: ResumeStudioInputMeta;
  jd_input: ResumeStudioInputMeta;
  fact_ledger: FactLedger | null;
  resume_plan: ResumePlan | null;
  rewrites: RewrittenExperience[];
  claims_validation: ClaimsValidation | null;
  final_resume: FinalResume | null;
  final_confirmed: boolean;
};

export type ResumeStudioInterviewHandoff = {
  source: "resume_studio";
  created_at: string;
  methodology_version: string;
  resume_text: string;
  jd_text: string;
};

export type BuildFactLedgerRequest = {
  action: "build_fact_ledger";
  resume_text: string;
};

export type BuildResumePlanRequest = {
  action: "build_resume_plan";
  fact_ledger: FactLedger;
  jd_text: string;
};

export type RewriteExperienceRequest = {
  action: "rewrite_experience";
  fact_ledger: FactLedger;
  resume_plan: ResumePlan;
  experience_id: string;
};

export type ValidateResumeClaimsRequest = {
  action: "validate_resume_claims";
  fact_ledger: FactLedger;
  rewrites: RewrittenExperience[];
};

export type FinalizeResumeRequest = {
  action: "finalize_resume";
  fact_ledger: FactLedger;
  resume_plan: ResumePlan;
  rewrites: RewrittenExperience[];
  claims_validation: ClaimsValidation;
};

export type ResumeStudioRequest =
  | BuildFactLedgerRequest
  | BuildResumePlanRequest
  | RewriteExperienceRequest
  | ValidateResumeClaimsRequest
  | FinalizeResumeRequest;
