import { readFileSync, readdirSync } from "fs";
import { join, parse } from "path";
import { CFIRules, CFISection } from "./types.js";

const SRD_DIR = "./cfi-srd";

// Order matters - core concepts first
const FILE_ORDER = [
  "0001_Characters.md",
  "0002_Culture_and_Races.md",
  "0003_Classes.md",
  "0004_Alignment_and_Passions.md",
  "0005_Skills.md",
  "0006_Money_and_Equipment.md",
  "0007_Game_System.md",
  "0008_Combat.md",
  "0009_Magic.md",
  "0010_Spells.md",
  "Appendix_A_Monsters_And_Treasures.md",
];

export function loadCFIRules(): CFIRules {
  const sections: CFISection[] = [];
  
  for (const filename of FILE_ORDER) {
    try {
      const content = readFileSync(join(SRD_DIR, filename), "utf-8");
      const parsed = parseMarkdown(content, filename);
      sections.push(parsed);
    } catch (error) {
      console.warn(`Could not load ${filename}:`, error);
    }
  }
  
  const toc = generateTOC(sections);
  
  return { sections, toc };
}

function parseMarkdown(content: string, filename: string): CFISection {
  const baseId = parse(filename).name;
  const lines = content.split("\n");
  
  // Extract title from first h1
  const titleMatch = lines.find(l => l.startsWith("# "));
  const title = titleMatch ? titleMatch.replace("# ", "").trim() : filename;
  
  // Extract subsections from h2 and h3 headers
  const subsections: CFISection[] = [];
  let currentH2: CFISection | null = null;
  
  for (const line of lines) {
    if (line.startsWith("## ")) {
      const sectionTitle = line.replace("## ", "").trim();
      const anchor = sectionTitle.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-");
      
      currentH2 = {
        id: `${baseId}#${anchor}`,
        title: sectionTitle,
        content: "",
      };
      subsections.push(currentH2);
    } else if (line.startsWith("### ") && currentH2) {
      // h3 as nested subsection
      const sectionTitle = line.replace("### ", "").trim();
      const anchor = sectionTitle.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-");
      
      currentH2.subsections = currentH2.subsections || [];
      currentH2.subsections.push({
        id: `${baseId}#${anchor}`,
        title: sectionTitle,
        content: "",
      });
    }
  }
  
  return {
    id: baseId,
    title,
    content,
    subsections: subsections.length > 0 ? subsections : undefined,
  };
}

function generateTOC(sections: CFISection[]): string {
  const lines: string[] = ["# CFI Rules Table of Contents\n"];
  
  for (const section of sections) {
    lines.push(`\n## ${section.title}`);
    lines.push(`ID: \`${section.id}\``);
    
    if (section.subsections) {
      for (const sub of section.subsections) {
        lines.push(`  - ${sub.title} (\`${sub.id}\`)`);
        
        if (sub.subsections) {
          for (const subsub of sub.subsections) {
            lines.push(`    - ${subsub.title} (\`${subsub.id}\`)`);
          }
        }
      }
    }
  }
  
  return lines.join("\n");
}

export function getSection(rules: CFIRules, sectionId: string): string | null {
  // Check top-level sections
  for (const section of rules.sections) {
    if (section.id === sectionId) {
      return section.content;
    }
    
    // Check subsections
    if (section.subsections) {
      for (const sub of section.subsections) {
        if (sub.id === sectionId) {
          // Extract content between this header and next same-level header
          return extractSectionContent(section.content, sub.title);
        }
        
        // Check nested subsections
        if (sub.subsections) {
          for (const subsub of sub.subsections) {
            if (subsub.id === sectionId) {
              return extractSectionContent(section.content, subsub.title);
            }
          }
        }
      }
    }
  }
  
  return null;
}

function extractSectionContent(fullContent: string, sectionTitle: string): string {
  const lines = fullContent.split("\n");
  const headerPattern = new RegExp(`^##+\\s+${sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  
  let startIdx = -1;
  let headerLevel = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (headerPattern.test(line)) {
      startIdx = i;
      headerLevel = line.match(/^#+/)?.[0].length || 0;
      break;
    }
  }
  
  if (startIdx === -1) {
    return "Section not found";
  }
  
  // Find end (next header at same or higher level)
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const match = lines[i].match(/^(#+)\s/);
    if (match && match[1].length <= headerLevel) {
      endIdx = i;
      break;
    }
  }
  
  return lines.slice(startIdx, endIdx).join("\n");
}
