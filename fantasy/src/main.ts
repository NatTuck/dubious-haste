import { loadConfig } from "./config.js";
import { loadCFIRules } from "./rules.js";
import { Agent } from "./agent.js";
import { Judge } from "./judge.js";

async function main() {
  console.log("=== CFI Character Creation Benchmark ===\n");

  const config = loadConfig();
  const rules = loadCFIRules();

  console.log(`Loaded ${rules.sections.length} rule sections`);

  const agent = new Agent({
    name: "Agent",
    role: "player",
    config,
    rules,
  });

  const markdown = await agent.runCharacterCreation(config.benchmark.maxRounds);

  // Print metrics summary
  agent.printMetricsSummary();

  console.log("\n=== CHARACTER SHEET ===\n");
  console.log(markdown || "(empty)");

  console.log("\n=== LOGS ===");
  const logs = agent.getLogs();
  logs.forEach(log => console.log(log));

  console.log("\n=== JUDGE EVALUATION ===\n");
  const judge = new Judge({ config });
  const evaluation = await judge.evaluate(logs, markdown);

  console.log(`Result: ${evaluation.passed ? "PASS ✓" : "FAIL ✗"}`);
  console.log(`\nAttribute Rolls: ${evaluation.attributeRollsCorrect.passed ? "OK" : "FAIL"}`);
  console.log(`  ${evaluation.attributeRollsCorrect.details}`);

  console.log(`\nSheet Completeness: ${evaluation.sheetCompleteness.passed ? "OK" : "FAIL"}`);
  console.log(`  Name: ${evaluation.sheetCompleteness.hasName ? "✓" : "✗"}`);
  console.log(`  Class: ${evaluation.sheetCompleteness.hasClass ? "✓" : "✗"}`);
  console.log(`  Attributes: ${evaluation.sheetCompleteness.hasAttributes ? "✓" : "✗"}`);
  console.log(`  Skills: ${evaluation.sheetCompleteness.hasSkills ? "✓" : "✗"}`);
  console.log(`  Equipment: ${evaluation.sheetCompleteness.hasEquipment ? "✓" : "✗"}`);

  console.log(`\n${evaluation.explanation}`);

  process.exit(evaluation.passed ? 0 : 1);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
