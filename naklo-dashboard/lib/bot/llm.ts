/**
 * Volání Gemini (Google Workspace billing, stejně jako chatbot na webu).
 * Bez GEMINI_API_KEY nebo při chybě vrací null a bot použije pravidla.
 */
const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

export async function gemini(prompt: string, maxTokens = 800): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3, thinkingConfig: { thinkingBudget: 0 } },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
    return text || null;
  } catch {
    return null;
  }
}

export const BRIEF_PROMPT = (facts: string) => `Jsi provozní asistent areálu Wake Surf Náklo (wakesurf, wakeboard, kemp, bistro, eventy).
Z podkladů níže napiš majiteli Radkovi ranní plán dne česky:
- 1 věta, jak na tom firma je dnes,
- 3 až 5 konkrétních kroků, co má udělat sám, seřazené podle důležitosti,
- 1 věta, co hlídat u ostatních lidí.
Buď stručný a věcný, žádné obecné rady, nic si nevymýšlej mimo podklady. Bez nadpisů a bez markdownu kromě číslovaného seznamu.

PODKLADY:
${facts}`;

export const REPLY_PROMPT = (what: string) => `Jsi tým Wake Surf Náklo. Napiš návrh krátké, přátelské odpovědi (max 4 věty, česky, tykání jen pokud tyká i zákazník).
Neslibuj slevy ani termíny, které neznáš; když je potřeba informace, napiš, že se ozveme. Podpis: Tým Wake Surf Náklo.

${what}`;
