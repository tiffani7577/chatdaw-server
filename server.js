const express = require("express");
const cors = require("cors");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(cors());
app.use(express.json());

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── In-memory license store (replace with a DB later) ─────────
// Format: { "LICENSE-KEY": { credits: 500, used: 0 } }
const licenses = {};

// ── Generate a license key ────────────────────────────────────
function generateLicense() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const seg = () =>
    Array.from({ length: 4 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  return `CDAW-${seg()}-${seg()}-${seg()}`;
}

// ── Admin: create a new license (call this after Gumroad sale) ─
app.post("/admin/create-license", (req, res) => {
  const { adminKey, credits } = req.body;
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const license = generateLicense();
  licenses[license] = { credits: credits || 500, used: 0 };
  console.log(`Created license: ${license}`);
  res.json({ license, credits: licenses[license].credits });
});

// ── Check license status ──────────────────────────────────────
app.post("/check-license", (req, res) => {
  const { licenseKey } = req.body;
  if (!licenseKey) return res.status(400).json({ error: "No license key provided" });

  const license = licenses[licenseKey];
  if (!license) return res.status(404).json({ error: "Invalid license key" });

  const remaining = license.credits - license.used;
  res.json({ valid: true, remaining, used: license.used });
});

// ── Main AI endpoint ──────────────────────────────────────────
app.post("/analyze", async (req, res) => {
  const { licenseKey, actionType, bpm, key, section, lyrics } = req.body;

  // Validate license
  if (!licenseKey) return res.status(400).json({ error: "No license key" });
  const license = licenses[licenseKey];
  if (!license) return res.status(401).json({ error: "Invalid license key. Purchase ChatDAW at studiomind.io" });

  const remaining = license.credits - license.used;
  if (remaining <= 0) {
    return res.status(402).json({ error: "No credits remaining. Visit studiomind.io to top up." });
  }

  // Build prompt based on action
  const context = `Key: ${key || "Unknown"}\nBPM: ${bpm || "Unknown"}\nSection: ${section || "Verse"}`;

  const prompts = {
    chords: `You are an expert music producer and harmony coach working inside a DAW plugin.
${context}

Suggest 3 chord progressions for the ${section || "current section"}.
1) A solid standard option
2) One with modal borrowing
3) One unexpected substitution that still works

Format: short, punchy, producer-ready. Use chord symbols. No long explanations. Max 6 lines total.`,

    exotic: `You are a world music theory expert working inside a DAW plugin.
${context}

Make this section more harmonically exotic. Give exactly:
- 1 modal idea (name the mode, one sentence)
- 1 world scale suggestion (Arabic, Hijaz, Phrygian etc) with specific note
- 1 chord swap reharmonization
- 1 tension note to add and where

Be specific with note names. Short punchy format. Max 8 lines.`,

    lyric: `You are a professional songwriter and topline writer working inside a DAW plugin.
${context}
Current lyrics: ${lyrics || "(none provided)"}

Rewrite or improve these lyrics 3 ways:
1) More emotional and vulnerable
2) More poetic and abstract  
3) More commercial and hooky

Keep each version to 2-4 lines max. Label each one.`,

    effect: `You are a mix engineer and sound designer working inside a DAW plugin.
${context}

Suggest a specific effect chain for this section.
List 4-5 effects in signal chain order.
For each: effect type, one key setting, why it works here.
Short format. No fluff.`,

    arrangement: `You are a professional music producer and arranger working inside a DAW plugin.
${context}

Give one sharp arrangement idea for the ${section || "current section"}.
Include:
- What to add
- What to remove or pull back
- One specific energy move
- Bar count suggestion

Format like a producer texting notes. Short and direct.`,

    analyze: `You are an AI co-producer doing a full session analysis inside a DAW plugin.
${context}
${lyrics ? `Lyrics: ${lyrics}` : ""}

Give a SESSION REPORT with exactly these 4 sections:

ARRANGEMENT
One sharp observation about structure.

HARMONY  
One specific suggestion to improve the chord movement.

ENERGY
One note about the energy level for this section relative to a full song.

NEXT MOVE
One specific action the producer should take right now.

Keep each section to 1-2 sentences. Be direct. Sound like Max Martin not a textbook.`,
  };

  const prompt = prompts[actionType];
  if (!prompt) return res.status(400).json({ error: "Invalid action type" });

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });

    // Deduct one credit
    license.used += 1;

    const text = message.content[0]?.text || "No response received.";
    const creditsRemaining = license.credits - license.used;

    res.json({ result: text, creditsRemaining });
  } catch (err) {
    console.error("Claude API error:", err);
    res.status(500).json({ error: "AI request failed. Please try again." });
  }
});

// ── Health check ──────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ChatDAW server running", licenses: Object.keys(licenses).length });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ChatDAW server running on port ${PORT}`));
