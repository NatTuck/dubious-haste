import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage, AIMessage, AIMessageChunk } from "@langchain/core/messages";
import type { Config } from "./types.js";
import { createTools, type ToolContext } from "./tools.js";
import type { CFIRules } from "./types.js";
import { getSection } from "./rules.js";
import { countMessageTokens, countTokens, type RequestMetrics, formatMetricsSummary } from "./tokenizer.js";

export interface AgentConfig {
  name: string;
  role: "gm" | "player";
  config: Config;
  rules: CFIRules;
}

export class Agent {
  private model: ChatOpenAI;
  private name: string;
  private rules: CFIRules;
  private messages: (SystemMessage | HumanMessage | AIMessage)[] = [];
  private toolContext: ToolContext;
  private metrics: RequestMetrics[] = [];

  constructor(agentConfig: AgentConfig) {
    this.name = agentConfig.name;
    this.rules = agentConfig.rules;

    this.model = new ChatOpenAI({
      modelName: agentConfig.config.llm.model,
      apiKey: agentConfig.config.llm.apiKey,
      configuration: {
        baseURL: agentConfig.config.llm.baseUrl,
      },
      temperature: 0.8,
    });

    this.toolContext = {
      markdown: "",
      logs: [],
      rules: agentConfig.rules,
    };

    this.messages = [new SystemMessage(this.buildSystemPrompt())];
  }

  private buildSystemPrompt(): string {
    return `You are creating a character for Classic Fantasy Imperative (CFI).

## YOUR TASK
Read the CFI rulebook to learn how character creation works, then build a complete markdown character sheet. Call finalize_character() when done.

## CHARACTER GUIDELINES
- Generate generating fresh, Rank 1 character.
- Generate attributes by rolling once for each characteristic in order according
  to the rules.
- Pick a class that will benefit well from your rolled stats.

## TOOLS
- roll_dice(notation, purpose) - Roll dice (e.g., "2d4", "1d20+5")
- add_section(heading, content, level) - Add a section to the sheet
- update_section(heading, content) - Update an existing section
- delete_section(heading) - Delete a section's content
- list_sections() - List all sections in the sheet
- read_rules_section(section_id) - Read CFI rules by section ID
- finalize_character() - Complete character creation

## RULEBOOK TABLE OF CONTENTS
Use read_rules_section(section_id) to read specific sections:
${this.rules.toc}`;
  }

  async runCharacterCreation(maxRounds: number): Promise<string> {
    console.log(`\n=== ${this.name} creating character ===\n`);

    this.messages.push(new HumanMessage(
      "Create a CFI character. Read the rulebook to learn how."
    ));

    const tools = createTools(this.toolContext);
    const toolArray = Object.values(tools);

    let completed = false;

    for (let round = 0; round < maxRounds; round++) {
      const roundNum = round + 1;

      // Count request tokens before streaming
      const requestTokens = countMessageTokens(this.messages);

      // Print pre-round info
      console.log(`Round ${roundNum}: Sending ${requestTokens} tokens`);

      // Stream the response to measure TTFT
      const startTime = performance.now();
      let firstTokenTime: number | null = null;
      let accumulatedChunk: AIMessageChunk | null = null;

      const modelWithTools = this.model.bindTools(toolArray);
      const stream = await modelWithTools.stream(this.messages);

      for await (const chunk of stream) {
        if (firstTokenTime === null) {
          firstTokenTime = performance.now() - startTime;
        }

        const messageChunk = chunk as AIMessageChunk;
        
        if (accumulatedChunk === null) {
          accumulatedChunk = messageChunk;
        } else {
          accumulatedChunk = accumulatedChunk.concat(messageChunk);
        }
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const ttft = firstTokenTime ?? totalTime;

      // Convert accumulated chunk to final AIMessage
      const finalMessage = new AIMessage({
        content: accumulatedChunk?.content ?? "",
        tool_calls: accumulatedChunk?.tool_calls,
        invalid_tool_calls: accumulatedChunk?.invalid_tool_calls,
      });
      this.messages.push(finalMessage);

      // Count response tokens
      const responseText = (accumulatedChunk?.content ?? "") + JSON.stringify(accumulatedChunk?.tool_calls ?? []);
      const responseTokens = countTokens(responseText);

      // Record metrics
      const metric: RequestMetrics = {
        round: roundNum,
        requestTokens,
        responseTokens,
        timeToFirstToken: ttft,
        totalTime,
      };
      this.metrics.push(metric);

      // Print post-round metrics
      console.log(
        `[metrics] resp_tokens: ${responseTokens}, ttft: ${ttft.toFixed(0)}ms, total_time: ${totalTime.toFixed(0)}ms`
      );

      const toolCalls = finalMessage.tool_calls ?? [];

      if (toolCalls && toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          const toolName = toolCall.name as keyof typeof tools;
          const tool = tools[toolName];

          if (tool) {
            try {
              // @ts-ignore
              const result = await tool.invoke(toolCall.args);

              // Console output with round number
              if (toolName === "roll_dice") {
                console.log(`[Round ${roundNum}] [roll_dice] ${toolCall.args.purpose}: ${toolCall.args.dice_notation} = ${result}`);
              } else if (toolName === "add_section" || toolName === "update_section" || toolName === "delete_section") {
                console.log(`[Round ${roundNum}] [${toolName}] ${toolCall.args.heading}`);
              } else if (toolName === "list_sections") {
                console.log(`[Round ${roundNum}] [list_sections]`);
              } else if (toolName === "read_rules_section") {
                // Get section length for logging
                const sectionContent = getSection(this.rules, toolCall.args.section_id);
                const contentLength = sectionContent ? sectionContent.length : 0;
                console.log(`[Round ${roundNum}] [read_rules_section] ${toolCall.args.section_id} (${contentLength} chars)`);
              } else if (toolName === "finalize_character") {
                console.log(`[Round ${roundNum}] [finalize_character]`);
              }

              if (toolName === "finalize_character") {
                completed = true;
              }

              this.messages.push(new HumanMessage(
                `Tool ${toolName} result: ${result}`
              ));
            } catch (error) {
              console.log(`[Round ${roundNum}] [${toolName}] ERROR: ${error}`);
              this.messages.push(new HumanMessage(
                `Tool ${toolName} error: ${error}`
              ));
            }
          }
        }
      } else {
        this.messages.push(new HumanMessage(
          "Use the tools to complete the task."
        ));
      }

      if (completed) {
        console.log(`\nCharacter creation complete (${roundNum} rounds)`);
        break;
      }
    }

    if (!completed) {
      console.log(`\nMax rounds reached without completion`);
    }

    return this.toolContext.markdown;
  }

  getLogs(): string[] {
    return this.toolContext.logs;
  }

  getMarkdown(): string {
    return this.toolContext.markdown;
  }

  getMetrics(): RequestMetrics[] {
    return this.metrics;
  }

  printMetricsSummary(): void {
    console.log(formatMetricsSummary(this.metrics));
  }
}
