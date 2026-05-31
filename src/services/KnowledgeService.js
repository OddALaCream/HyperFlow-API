import { sop04Chunks } from '../data/sop04Chunks.js';

const normalize = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const tokenize = (value) =>
  normalize(value)
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 2);

const scoreField = (query, tokens, value, weight) => {
  const normalized = normalize(Array.isArray(value) ? value.join(' ') : value);
  let score = 0;

  if (normalized.includes(query)) {
    score += weight * 3;
  }

  for (const token of tokens) {
    if (normalized.includes(token)) {
      score += weight;
    }
  }

  return score;
};

export const searchKnowledge = (query, process) => {
  const normalizedQuery = normalize(query);
  const tokens = tokenize(query);

  if (!tokens.length) {
    return [];
  }

  return sop04Chunks
    .filter((chunk) => !process || chunk.process === process)
    .map((chunk) => ({
      ...chunk,
      score:
        scoreField(normalizedQuery, tokens, chunk.keywords, 4) +
        scoreField(normalizedQuery, tokens, chunk.questions, 3) +
        scoreField(normalizedQuery, tokens, chunk.title, 2) +
        scoreField(normalizedQuery, tokens, chunk.content, 1),
    }))
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
};

const RAG_URL = process.env.RAG_URL || 'http://localhost:8000/rag/query';
// Gemini generation in the RAG takes ~7-8s, so allow a generous timeout
// before falling back to the local keyword search.
const RAG_TIMEOUT_MS = Number(process.env.RAG_TIMEOUT_MS || 30000);

const localSearch = (query, process) => ({
  source: 'local',
  ragAnswer: null,
  chunks: searchKnowledge(query, process).map(({ id, title, content, score }) => ({
    id,
    title,
    content,
    score,
  })),
});

export const KnowledgeService = {
  // Queries the Python RAG microservice (semantic + generated answer) and
  // falls back to the local keyword search if it is unreachable.
  async search(query, process) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RAG_TIMEOUT_MS);

    try {
      const res = await fetch(RAG_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query, top_k: 5 }),
        signal: controller.signal,
      });

      if (!res.ok) {
        return localSearch(query, process);
      }

      const data = await res.json();
      return {
        source: 'rag',
        ragAnswer: data.answer || null,
        chunks: (data.sources || []).map(({ id, title, content, score }) => ({
          id,
          title,
          content,
          score,
        })),
      };
    } catch {
      return localSearch(query, process);
    } finally {
      clearTimeout(timeout);
    }
  },
};
