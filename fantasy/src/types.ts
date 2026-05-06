import { z } from "zod";

export const ConfigSchema = z.object({
  llm: z.object({
    baseUrl: z.string(),
    model: z.string(),
    apiKey: z.string(),
  }),
  judge: z.object({
    baseUrl: z.string(),
    model: z.string(),
    apiKey: z.string(),
  }),
  benchmark: z.object({
    maxRounds: z.number(),
    agentTimeout: z.number(),
    maxRetries: z.number(),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export interface CFISection {
  id: string;
  title: string;
  content: string;
  subsections?: CFISection[];
}

export interface CFIRules {
  sections: CFISection[];
  toc: string;
}

export interface CharacterSheet {
  name: string;
  race: string;
  class: string;
  characteristics: {
    STR: number;
    CON: number;
    SIZ: number;
    DEX: number;
    INT: number;
    POW: number;
    CHA: number;
  };
  attributes: {
    hitPoints: number;
    magicPoints: number;
    luckPoints: number;
    initiativeModifier: number;
  };
  skills: Record<string, number>;
  equipment: string[];
  markdown: string;
}

export interface AgentResponse {
  content: string;
  toolCalls: ToolCall[];
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}
