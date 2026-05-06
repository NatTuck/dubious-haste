import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { Config } from "./types.js";

export interface JudgeConfig {
  config: Config;
}

export interface EvaluationResult {
  passed: boolean;
  attributeRollsCorrect: {
    passed: boolean;
    details: string;
  };
  sheetCompleteness: {
    passed: boolean;
    hasName: boolean;
    hasClass: boolean;
    hasAttributes: boolean;
    hasSkills: boolean;
    hasEquipment: boolean;
    details: string;
  };
  explanation: string;
}

export class Judge {
  private model: ChatOpenAI;

  constructor(judgeConfig: JudgeConfig) {
    const judgeLLM = judgeConfig.config.judge;

    this.model = new ChatOpenAI({
      modelName: judgeLLM.model,
      apiKey: judgeLLM.apiKey,
      configuration: {
        baseURL: judgeLLM.baseUrl,
      },
      temperature: 0.3,
    });
  }

  async evaluate(logs: string[], markdown: string): Promise<EvaluationResult> {
    const attributeRollCheck = this.checkAttributeRolls(logs);
    const completenessCheck = this.checkCompleteness(markdown);
    const llmEvaluation = await this.getLLMEvaluation(logs, markdown, attributeRollCheck, completenessCheck);

    const passed = attributeRollCheck.passed && completenessCheck.passed;

    return {
      passed,
      attributeRollsCorrect: attributeRollCheck,
      sheetCompleteness: completenessCheck,
      explanation: llmEvaluation,
    };
  }

  private checkAttributeRolls(logs: string[]): { passed: boolean; details: string } {
    // Parse new format: [roll_dice] purpose: notation = result
    const rolls: Array<{ notation: string; result: number; purpose: string }> = [];

    for (const log of logs) {
      const match = log.match(/^\[roll_dice\] (.+?): (\d+d\d+(?:[+-]\d+)?) = (\d+)$/);
      if (match) {
        rolls.push({
          purpose: match[1],
          notation: match[2],
          result: parseInt(match[3]),
        });
      }
    }

    if (rolls.length === 0) {
      return {
        passed: false,
        details: "No dice rolls found. Characteristics should be rolled using 3d6 or 2d6+6.",
      };
    }

    const characteristicRolls = rolls.filter((r) =>
      /STR|CON|DEX|POW|CHA|SIZ|INT/i.test(r.purpose)
    );

    const issues: string[] = [];

    for (const roll of characteristicRolls) {
      const purpose = roll.purpose.toUpperCase();
      const isSizeOrInt = purpose.includes("SIZ") || purpose.includes("INT");
      const expectedNotation = isSizeOrInt ? "2d6+6" : "3d6";

      if (roll.notation !== expectedNotation) {
        issues.push(`${purpose}: expected ${expectedNotation}, got ${roll.notation}`);
      }

      const minVal = isSizeOrInt ? 8 : 3;
      const maxVal = isSizeOrInt ? 18 : 18;
      if (roll.result < minVal || roll.result > maxVal) {
        issues.push(`${purpose}: result ${roll.result} outside range [${minVal}-${maxVal}]`);
      }
    }

    const passed = issues.length === 0 && characteristicRolls.length >= 7;

    return {
      passed,
      details: passed
        ? `${characteristicRolls.length} characteristics rolled correctly`
        : issues.join("; "),
    };
  }

  private checkCompleteness(markdown: string): {
    passed: boolean;
    hasName: boolean;
    hasClass: boolean;
    hasAttributes: boolean;
    hasSkills: boolean;
    hasEquipment: boolean;
    details: string;
  } {
    const text = markdown.toLowerCase();

    const hasName = /(?:name|character|called)[\s:]*[a-z]+/i.test(markdown) ||
      /#\s*.+\n/.test(markdown);

    const hasClass = /\b(?:fighter|cleric|magic-user|rogue|mage|wizard|thief)\b/i.test(text);

    const hasAttributes = /\b(?:str|con|siz|dex|int|pow|cha|strength|constitution|size|dexterity|intelligence|power|charisma)\b/i.test(text);

    const hasSkills = /\b(?:skill|skills|combat|athletics|stealth|magic|spell)\b/i.test(text);

    const hasEquipment = /\b(?:equipment|gear|items|weapon|armor|inventory)\b/i.test(text);

    const allPresent = hasName && hasClass && hasAttributes && hasSkills && hasEquipment;

    const missing: string[] = [];
    if (!hasName) missing.push("name");
    if (!hasClass) missing.push("class");
    if (!hasAttributes) missing.push("attributes");
    if (!hasSkills) missing.push("skills");
    if (!hasEquipment) missing.push("equipment");

    return {
      passed: allPresent,
      hasName,
      hasClass,
      hasAttributes,
      hasSkills,
      hasEquipment,
      details: allPresent
        ? "All required sections present"
        : `Missing: ${missing.join(", ")}`,
    };
  }

  private async getLLMEvaluation(
    logs: string[],
    markdown: string,
    attributeCheck: { passed: boolean; details: string },
    completenessCheck: { passed: boolean; details: string }
  ): Promise<string> {
    const messages = [
      new SystemMessage(`Evaluate a CFI character creation attempt.

CFI Rules:
- STR/CON/DEX/POW/CHA: roll 3d6 (3-18)
- SIZ/INT: roll 2d6+6 (8-18)
- Character sheet needs: name, race, class, characteristics, skills, equipment

Provide a 2-4 sentence evaluation summarizing:
1. Whether attribute rolls followed CFI rules
2. Whether the character sheet is complete
3. Any notable observations`),
      new HumanMessage(`LOGS:
${logs.join("\n") || "(none)"}

CHARACTER SHEET:
${markdown || "(empty)"}

CHECKS:
- Attribute rolls: ${attributeCheck.passed ? "PASS" : "FAIL"} - ${attributeCheck.details}
- Completeness: ${completenessCheck.passed ? "PASS" : "FAIL"} - ${completenessCheck.details}

Evaluation:`),
    ];

    try {
      const response = await this.model.invoke(messages);
      return response.content as string;
    } catch (error) {
      return `Evaluation error: ${error}`;
    }
  }
}
