import { handleRedeemRequest } from "../../../lib/beta-access/redeem-handler";
import { guardInvitationAttempt } from "../../../lib/beta-usage/api-guard";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = await guardInvitationAttempt(request);
  if (limited) return limited;

  return handleRedeemRequest(request);
}
