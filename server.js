const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
const app = express();
app.use(express.json({ limit: "10mb" }));
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const rateLimitMap = new Map();
function checkRateLimit(userId) {
  const now = Date.now();
  const entry = rateLimitMap.get(userId) || { count: 0, windowStart: now };
  if (now - entry.windowStart > 3600000) { entry.count = 0; entry.windowStart = now; }
  if (entry.count >= 20) return false;
  entry.count++;
  rateLimitMap.set(userId, entry);
  return true;
}
app.get("/", (req, res) => res.json({ status: "ChatDAW server online" }));
app.post("/analyze", async (req, res) => {
  const { prompt, userId } = req.body;
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });
  if (!checkRateLimit(userId || req.ip)) return res.status(429).json({ error: "Rate limit exceeded" });
  try {
    const message = await client.messages.create({ model: "claude-sonnet-4-20250514", max_tokens: 1024, messages: [{ role: "user", content: prompt }] });
    res.json({ result: message.content[0]?.text || "No response." });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.listen(process.env.PORT || 3000, () => console.log("ChatDAW online"));
