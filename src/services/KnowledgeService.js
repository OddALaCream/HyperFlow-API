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

export const KnowledgeService = {
  search(query, process) {
    return {
      chunks: searchKnowledge(query, process).map(({ id, title, content, score }) => ({
        id,
        title,
        content,
        score,
      })),
    };
  },
};
