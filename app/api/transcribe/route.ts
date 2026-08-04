import { withMeteredBetaAccess } from "../../lib/beta-usage/api-guard";
import { handleTranscriptionPost } from "../../lib/server/transcribe-handler";

export const runtime = "nodejs";

export const POST = withMeteredBetaAccess({ endpoint: "transcribe" }, handleTranscriptionPost);
