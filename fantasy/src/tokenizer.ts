import { Tiktoken } from "js-tiktoken/lite";
import o200k_base from "js-tiktoken/ranks/o200k_base";
import type { BaseMessage } from "@langchain/core/messages";

// Initialize encoder once and reuse
const encoder = new Tiktoken(o200k_base);

export function countTokens(text: string): number {
  if (!text) return 0;
  return encoder.encode(text).length;
}

export function countMessageTokens(messages: BaseMessage[]): number {
  let total = 0;
  // OpenAI format overhead per message: ~4 tokens
  const perMessageOverhead = 4;

  for (const message of messages) {
    total += perMessageOverhead;
    // Add tokens for the role
    total += countTokens(message._getType());
    // Add tokens for the content
    const content = message.content;
    if (typeof content === "string") {
      total += countTokens(content);
    } else if (Array.isArray(content)) {
      // Handle complex content types
      for (const part of content) {
        if (typeof part === "string") {
          total += countTokens(part);
        } else if (part && typeof part === "object") {
          total += countTokens(JSON.stringify(part));
        }
      }
    }
  }

  // Add assistant priming overhead
  total += 2;

  return total;
}

export interface RequestMetrics {
  round: number;
  requestTokens: number;
  responseTokens: number;
  timeToFirstToken: number;
  totalTime: number;
}

export function calculateAverages(metrics: RequestMetrics[]) {
  if (metrics.length === 0) return null;

  const totals = metrics.reduce(
    (acc, m) => ({
      requestTokens: acc.requestTokens + m.requestTokens,
      responseTokens: acc.responseTokens + m.responseTokens,
      timeToFirstToken: acc.timeToFirstToken + m.timeToFirstToken,
      totalTime: acc.totalTime + m.totalTime,
    }),
    { requestTokens: 0, responseTokens: 0, timeToFirstToken: 0, totalTime: 0 }
  );

  const count = metrics.length;

  return {
    totalRequests: count,
    avgRequestTokens: Math.round(totals.requestTokens / count),
    avgResponseTokens: Math.round(totals.responseTokens / count),
    avgTTFT: totals.timeToFirstToken / count,
    avgTotalTime: totals.totalTime / count,
    totalRequestTokens: totals.requestTokens,
    totalResponseTokens: totals.responseTokens,
    totalTime: totals.totalTime,
  };
}

export function formatMetricsSummary(metrics: RequestMetrics[]) {
  const stats = calculateAverages(metrics);
  if (!stats) return "No metrics collected";

  return `
=== REQUEST METRICS SUMMARY ===
Total Requests: ${stats.totalRequests}

Token Usage:
  Total Request Tokens:  ${stats.totalRequestTokens.toLocaleString()}
  Total Response Tokens: ${stats.totalResponseTokens.toLocaleString()}
  Combined Total:        ${(stats.totalRequestTokens + stats.totalResponseTokens).toLocaleString()}
  
  Avg Request Tokens:  ${stats.avgRequestTokens.toLocaleString()}
  Avg Response Tokens: ${stats.avgResponseTokens.toLocaleString()}

Timing:
  Total Time:          ${(stats.totalTime / 1000).toFixed(2)}s
  Avg Total Time:      ${stats.avgTotalTime.toFixed(0)}ms
  Avg TTFT:            ${stats.avgTTFT.toFixed(0)}ms
`;
}
