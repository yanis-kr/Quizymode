// Local FAKE OpenAI-compatible LLM vendor for evidence runs (never a real vendor).
// POST <any prefix>/chat/completions -> 4 questions with sourceQuote copied verbatim from the supplied
// <study_guide_section> text, plus 1 extra question with an invented quote (the API must drop it).
// A path whose first segment starts with "fail" always answers HTTP 500, and the control endpoint
// POST /control {"failPrefix":"oai"} makes a prefix fail until {"failPrefix":null}.
// Logs one JSON line per request: time, path, model, status, counts (no headers, no keys).
import http from "http";
import fs from "fs";

const PORT = Number(process.env.PORT ?? 7555);
const LOG = process.argv[2] ?? "fake-llm.log";
let failPrefix = null;
const log = (o) => {
  const line = JSON.stringify({ t: new Date().toISOString(), ...o });
  fs.appendFileSync(LOG, line + "\n");
  console.log(line);
};

function pickSentences(text) {
  const parts = [];
  let page = null;
  let buf = [];
  const flush = () => {
    if (buf.length) parts.push({ page, text: buf.join(" ") });
    buf = [];
  };
  for (const rawLine of text.split(/\r?\n/)) {
    const m = rawLine.match(/^\[(?:p\.|slide) (\d+)\]\s*$/);
    if (m) {
      flush();
      page = Number(m[1]);
      continue;
    }
    if (rawLine.trim() === "") {
      flush();
      continue;
    }
    buf.push(rawLine.trim());
  }
  flush();
  const found = [];
  for (const p of parts) {
    for (const s of p.text.split(/(?<=[.!?])\s+/)) {
      const t = s.replace(/\s+/g, " ").trim();
      if (t.length >= 40 && t.length <= 250 && !found.some((f) => f.sentence === t)) found.push({ page: p.page, sentence: t });
    }
  }
  return found;
}

function buildQuestions(text) {
  const sentences = pickSentences(text);
  const n = sentences.length;
  const count = Math.min(4, n);
  const picks = [];
  for (let i = 0; i < count; i++) picks.push(sentences[Math.floor((i * n) / count)]);
  const qs = picks.map((p, i) => ({
    question: `Which statement does the study guide make that begins "${p.sentence.split(" ").slice(0, 10).join(" ")}" and ends "${p.sentence.split(" ").slice(-4).join(" ")}"?`,
    correctAnswer: p.sentence.length > 180 ? p.sentence.slice(0, 177) + "..." : p.sentence,
    incorrectAnswers: ["The guide says the opposite of this.", "The guide does not cover this topic.", "This only applies in special cases."],
    explanation: `The guide states: ${p.sentence}`.slice(0, 480),
    sourceQuote: p.sentence,
    page: p.page,
  }));
  qs.push({
    question: "Which invented statement does the guide make (hallucinated)?",
    correctAnswer: "A statement the guide never makes",
    incorrectAnswers: ["Another invented option", "A third invented option"],
    explanation: "This question cites a quote that is not in the section text.",
    sourceQuote: "This sentence was invented by the fake vendor and does not appear anywhere in the study guide.",
    page: 1,
  });
  return qs;
}

http
  .createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const url = req.url.split("?")[0];
      if (url === "/control" && req.method === "POST") {
        failPrefix = JSON.parse(body || "{}").failPrefix ?? null;
        log({ control: true, failPrefix });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ failPrefix }));
        return;
      }
      if (!url.endsWith("/chat/completions") || req.method !== "POST") {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const first = url.split("/")[1] ?? "";
      let payload = {};
      try {
        payload = JSON.parse(body);
      } catch {
        /* ignore */
      }
      const model = payload.model ?? null;
      if (first.startsWith("fail") || (failPrefix && first === failPrefix)) {
        log({ path: url, model, status: 500, note: "forced vendor failure" });
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "fake vendor outage" } }));
        return;
      }
      const user = (payload.messages ?? []).find((m) => m.role === "user")?.content ?? "";
      const section = (user.match(/<study_guide_section>\n([\s\S]*?)\n<\/study_guide_section>/) ?? [])[1] ?? "";
      const qs = buildQuestions(section);
      log({ path: url, model, status: 200, sectionChars: section.length, questionsReturned: qs.length, quotesFromText: qs.length - 1, inventedQuotes: 1, pages: qs.map((q) => q.page) });
      const content = JSON.stringify({ questions: qs });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "fake-1",
          object: "chat.completion",
          model,
          choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
          usage: { prompt_tokens: Math.ceil(user.length / 4), completion_tokens: Math.ceil(content.length / 4), total_tokens: Math.ceil((user.length + content.length) / 4) },
        })
      );
    });
  })
  .listen(PORT, "127.0.0.1", () => log({ listening: PORT }));
