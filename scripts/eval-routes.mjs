import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesPath = path.join(__dirname, "..", "evals", "fixtures", "routes.json");
const baseUrl = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetries(url, init, attempts = 3) {
  let lastResponse = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(url, init);
    if (response.ok) return response;

    lastResponse = response;
    if (!RETRYABLE_STATUSES.has(response.status) || attempt === attempts) {
      return response;
    }

    await wait(800 * attempt);
  }

  return lastResponse;
}

async function readAnalyzeStream(answer) {
  const response = await fetchWithRetries(
    `${baseUrl}/api/analyze`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ answer })
    },
    4
  );

  assert(response.ok && response.body, `/api/analyze returned ${response.status}`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let rawJson = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const eventBlock of events) {
      const lines = eventBlock.split("\n");
      let eventName = "message";
      const dataLines = [];

      for (const line of lines) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }

      const data = dataLines.join("\n");

      if (eventName === "chunk") {
        rawJson += JSON.parse(data).content;
      }

      if (eventName === "error") {
        throw new Error(`analyze stream error: ${JSON.parse(data).error}`);
      }
    }
  }

  return JSON.parse(rawJson);
}

function validateAnalyze(result, expectedMode) {
  assert(result.mode === expectedMode, `expected analyze mode=${expectedMode}, got ${result.mode}`);
  assert(typeof result.main_issue === "string" && result.main_issue.length > 0, "analyze main_issue is empty");
  assert(Array.isArray(result.follow_up_questions) && result.follow_up_questions.length >= 2, "analyze follow_up_questions is invalid");
  assert(Array.isArray(result.actionable_suggestions) && result.actionable_suggestions.length >= 2, "analyze actionable_suggestions is invalid");

  if (result.mode === "ask_followup") {
    assert(result.practice_version === "", "analyze ask_followup should not include practice_version");
  }

  if (result.mode === "generate_practice") {
    assert(typeof result.practice_version === "string" && result.practice_version.length > 0, "analyze generate_practice should include practice_version");
  }
}

async function runMockCase(testCase) {
  const response = await fetchWithRetries(
    `${baseUrl}/api/mock-interview`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "answer",
        history: testCase.history,
        followupCount: testCase.followupCount
      })
    },
    4
  );

  assert(response.ok, `/api/mock-interview returned ${response.status}`);
  const payload = await response.json();

  assert(payload.mode === testCase.expectedMode, `expected mock mode=${testCase.expectedMode}, got ${payload.mode}`);
  assert(typeof payload.interviewer_message === "string", "mock interviewer_message is invalid");
  assert(typeof payload.short_feedback === "string", "mock short_feedback is invalid");

  if (payload.mode === "round_summary") {
    assert(payload.summary && payload.summary.practice_version, "mock round_summary should include summary.practice_version");
  }
}

async function runSessionSmoke() {
  const clientId = `eval-client-${Date.now()}`;
  const session = {
    session_id: `eval-session-${Date.now()}`,
    updated_at: new Date().toISOString(),
    status: "in_progress",
    title: "Eval"
  };

  const postResponse = await fetchWithRetries(`${baseUrl}/api/sessions/mock-interview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: clientId,
      session
    })
  });

  assert(postResponse.ok, `/api/sessions POST returned ${postResponse.status}`);

  const getResponse = await fetchWithRetries(`${baseUrl}/api/sessions/mock-interview?client_id=${clientId}`);
  assert(getResponse.ok, `/api/sessions GET returned ${getResponse.status}`);
  const payload = await getResponse.json();

  assert(Array.isArray(payload.sessions) && payload.sessions.some((item) => item.session_id === session.session_id), "session smoke test did not round-trip the saved session");
}

async function main() {
  const fixtures = JSON.parse(await readFile(fixturesPath, "utf8"));

  console.log(`Running route evals against ${baseUrl}`);

  for (const testCase of fixtures.analyze) {
    const result = await readAnalyzeStream(testCase.answer);
    validateAnalyze(result, testCase.expectedMode);
    console.log(`PASS analyze:${testCase.name}`);
  }

  for (const testCase of fixtures.mockInterview) {
    await runMockCase(testCase);
    console.log(`PASS mock:${testCase.name}`);
  }

  await runSessionSmoke();
  console.log("PASS sessions:round-trip");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
