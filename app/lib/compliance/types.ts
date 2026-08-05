export type PublicComplianceConfig = {
  operatorName: string;
  contactEmail: string;
  policyVersion: string;
  policyEffectiveDate: string;
  policyUpdatedDate: string;
  aiProviderName: string;
  chatModelName: string;
  asrProviderName: string;
  asrModelName: string;
  modelFilingInfo: string;
  complaintResponseDays: number | null;
  configured: boolean;
};

export type ComplianceCheckResult = {
  ok: boolean;
  errors: string[];
};
