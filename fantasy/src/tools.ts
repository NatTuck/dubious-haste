import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { CFIRules } from "./types.js";

export interface ToolContext {
  markdown: string;
  logs: string[];
  rules?: CFIRules;
  lastReadSectionId?: string;
}

export function createTools(context: ToolContext) {
  return {
    roll_dice: tool(
      (input) => {
        const result = rollDiceImpl(input.dice_notation);
        const logEntry = `[roll_dice] ${input.purpose}: ${input.dice_notation} = ${result}`;
        context.logs.push(logEntry);
        return result;
      },
      {
        name: "roll_dice",
        description: "Roll dice using standard notation (e.g., '3d6', '1d100', '2d6+6')",
        schema: z.object({
          dice_notation: z.string().describe("Dice notation like '3d6', '1d100', '2d6+6'"),
          purpose: z.string().describe("What you're rolling for"),
        }),
      }
    ),

    add_section: tool(
      (input) => {
        const level = input.level ?? 2;
        const prefix = "#".repeat(level);
        const sectionContent = `${prefix} ${input.heading}\n\n${input.content}\n\n`;
        context.markdown += sectionContent;
        context.logs.push(`[add_section] ${input.heading}`);
        return `Added section: ${input.heading}`;
      },
      {
        name: "add_section",
        description: "Add a heading with content to the character sheet",
        schema: z.object({
          heading: z.string().describe("Section heading"),
          content: z.string().describe("Section content (can be markdown)"),
          level: z.number().min(1).max(6).describe("Heading level (default: 2)"),
        }),
      }
    ),

    update_section: tool(
      (input) => {
        const lines = context.markdown.split("\n");
        let startIdx = -1;
        let headingLevel = 0;

        for (let i = 0; i < lines.length; i++) {
          const match = lines[i].match(/^(#{1,6})\s+(.+)$/);
          if (match && match[2] === input.heading) {
            startIdx = i;
            headingLevel = match[1].length;
            break;
          }
        }

        if (startIdx === -1) {
          return `Section "${input.heading}" not found`;
        }

        let endIdx = lines.length;
        for (let i = startIdx + 1; i < lines.length; i++) {
          const match = lines[i].match(/^(#{1,6})\s+/);
          if (match && match[1].length <= headingLevel) {
            endIdx = i;
            break;
          }
        }

        const newLines = [
          ...lines.slice(0, startIdx + 1),
          "",
          input.content,
          "",
          ...lines.slice(endIdx),
        ];
        context.markdown = newLines.join("\n");
        context.logs.push(`[update_section] ${input.heading}`);
        return `Updated section: ${input.heading}`;
      },
      {
        name: "update_section",
        description: "Replace the content under a heading",
        schema: z.object({
          heading: z.string().describe("Section heading to update"),
          content: z.string().describe("New section content"),
        }),
      }
    ),

    delete_section: tool(
      (input) => {
        const lines = context.markdown.split("\n");
        let startIdx = -1;
        let headingLevel = 0;

        for (let i = 0; i < lines.length; i++) {
          const match = lines[i].match(/^(#{1,6})\s+(.+)$/);
          if (match && match[2] === input.heading) {
            startIdx = i;
            headingLevel = match[1].length;
            break;
          }
        }

        if (startIdx === -1) {
          return `Section "${input.heading}" not found`;
        }

        let endIdx = lines.length;
        for (let i = startIdx + 1; i < lines.length; i++) {
          const match = lines[i].match(/^(#{1,6})\s+/);
          if (match && match[1].length <= headingLevel) {
            endIdx = i;
            break;
          }
        }

        const newLines = [
          ...lines.slice(0, startIdx + 1),
          "",
          ...lines.slice(endIdx),
        ];
        context.markdown = newLines.join("\n");
        context.logs.push(`[delete_section] ${input.heading}`);
        return `Deleted content of section: ${input.heading}`;
      },
      {
        name: "delete_section",
        description: "Delete the content under a heading but keep the heading",
        schema: z.object({
          heading: z.string().describe("Section heading"),
        }),
      }
    ),

    list_sections: tool(
      () => {
        const lines = context.markdown.split("\n");
        const headings: string[] = [];

        for (const line of lines) {
          const match = line.match(/^(#{1,6})\s+(.+)$/);
          if (match) {
            headings.push(`${match[1]} ${match[2]}`);
          }
        }

        context.logs.push(`[list_sections] ${headings.length} headings`);
        return headings.length > 0 ? headings.join("\n") : "(no sections yet)";
      },
      {
        name: "list_sections",
        description: "List all headings in the character sheet",
        schema: z.object({}),
      }
    ),

    read_rules_section: tool(
      async (input) => {
        // Check for duplicate consecutive reads
        if (context.lastReadSectionId === input.section_id) {
          return `Error: You already read section "${input.section_id}" in the previous tool call. Re-reading the same section is not allowed.`;
        }
        
        if (!context.rules) {
          return "Error: Rules not loaded";
        }
        const { getSection } = await import("./rules.js");
        const content = getSection(context.rules, input.section_id);
        
        // Track this read
        context.lastReadSectionId = input.section_id;
        
        if (content) {
          return content;
        }
        return `Section "${input.section_id}" not found`;
      },
      {
        name: "read_rules_section",
        description: "Read a specific section of the CFI rules by ID",
        schema: z.object({
          section_id: z.string().describe("Section ID (e.g., '0003_Classes#fighter')"),
        }),
      }
    ),

    finalize_character: tool(
      () => {
        context.logs.push("[finalize_character]");
        return "Character finalized";
      },
      {
        name: "finalize_character",
        description: "Mark character creation as complete",
        schema: z.object({}),
      }
    ),
  };
}

function rollDiceImpl(notation: string): number {
  const match = notation.match(/(\d+)d(\d+)(?:([+-])(\d+))?/);
  if (!match) {
    throw new Error(`Invalid dice notation: ${notation}`);
  }

  const numDice = parseInt(match[1]);
  const dieSize = parseInt(match[2]);
  const modifier = match[3] ? parseInt(match[3] + match[4]) : 0;

  let total = 0;
  for (let i = 0; i < numDice; i++) {
    total += Math.floor(Math.random() * dieSize) + 1;
  }

  return total + modifier;
}
