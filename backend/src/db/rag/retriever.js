import { readJson } from "../db/jsonDb.js";

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function scoreText(queryTokens, candidateText) {
  const candidateTokens = tokenize(candidateText);
  if (!candidateTokens.length) return 0;
  const candidateSet = new Set(candidateTokens);
  let score = 0;
  for (const token of queryTokens) {
    if (candidateSet.has(token)) score += 2;
    if (candidateText.toLowerCase().includes(token)) score += 1;
  }
  return score;
}

export async function retrieveContext({ chatId, userMessage, limit = 6 }) {
  const queryTokens = tokenize(userMessage);

  const products = await readJson("products.json", []);
  const faq = await readJson("faq.json", []);
  const baseKnowledge = await readJson("knowledge.json", []);
  const learnedKnowledge = await readJson("learned_knowledge.json", []);
  const users = await readJson("users.json", []);

  const userProfile = users.find((u) => u.chatId === chatId) || null;

  const candidates = [];

  for (const product of products) {
    const text = JSON.stringify(product);
    candidates.push({
      source: "product",
      text,
      item: product,
      score: scoreText(queryTokens, text)
    });
  }

  for (const item of faq) {
    const text = `${item.question} ${item.answer} ${item.category || ""}`;
    candidates.push({
      source: "faq",
      text,
      item,
      score: scoreText(queryTokens, text)
    });
  }

  for (const item of baseKnowledge) {
    const text = `${item.type || ""} ${item.content || ""}`;
    candidates.push({
      source: "knowledge",
      text,
      item,
      score: scoreText(queryTokens, text)
    });
  }

  for (const item of learnedKnowledge.filter((k) => k.chatId === chatId || k.global === true)) {
    const text = `${item.type || ""} ${item.content || ""}`;
    candidates.push({
      source: "learned_knowledge",
      text,
      item,
      score: scoreText(queryTokens, text) + 1
    });
  }

  const topItems = candidates
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    userProfile,
    items: topItems
  };
}
