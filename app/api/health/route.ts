export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      status: "ok",
      service: "interview-studio"
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
