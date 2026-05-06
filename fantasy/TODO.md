# CFI Benchmark Development Tasks

## Current Status
Basic single-agent character creation works with:
- ✅ TypeScript project setup with LangChain
- ✅ CFI rules loader (11 SRD sections, ~11K char TOC)
- ✅ Tool system: roll_dice, set_character_info, set_characteristics, read_section
- ✅ Agent can create characters using actual CFI rules
- ✅ Working with local llama.cpp endpoint

---

## Phase 1: Complete Character Generation Benchmark

### 1.1 Fix Tool Schemas (High Priority)
- [ ] Fix Zod optional/nullable warnings in set_character_info schema
- [ ] Ensure all tool schemas work cleanly with OpenAI-compatible endpoints
- [ ] Test all tools independently

### 1.2 Complete Character Sheet Tools (High Priority)
- [ ] Add `calculate_attributes` tool (HP, MP, Luck Points, Initiative from characteristics)
- [ ] Add `set_skills` with proper CFI skill calculations (base + class bonuses)
- [ ] Add `set_equipment` with class-based starting equipment
- [ ] Ensure agent can complete full character without timeouts

### 1.3 Improve read_section (Medium Priority)
- [ ] Return actual section content instead of placeholder
- [ ] Add smart truncation (keep key tables, truncate prose)
- [ ] Add caching so repeated lookups are instant
- [ ] Test with all major section IDs

### 1.4 Session Logging (High Priority)
- [ ] Log every prompt sent to LLM
- [ ] Log every LLM response
- [ ] Log all tool calls with args and results
- [ ] Log final character sheet
- [ ] Save to JSON file with timestamp

### 1.5 Character Validation (Medium Priority)
- [ ] Validate characteristics are in valid ranges
- [ ] Validate skills match class expectations
- [ ] Validate equipment matches class
- [ ] Report validation errors to agent for fixes

### 1.6 Benchmark Runner (High Priority)
- [ ] Run N character creation attempts
- [ ] Track success rate (% that complete)
- [ ] Track average rounds to completion
- [ ] Track tool usage statistics
- [ ] Generate summary report

### 1.7 Judge Evaluation (High Priority)
- [ ] Design rubric for character creation quality
- [ ] Check characteristics follow racial rules
- [ ] Check skills are calculated correctly
- [ ] Check equipment is appropriate
- [ ] Score creativity and coherence
- [ ] Generate pass/fail with reasoning

### 1.8 Test & Iterate (Medium Priority)
- [ ] Test with different models (local, OpenAI, Anthropic)
- [ ] Tune temperature/prompts for reliability
- [ ] Document failure modes
- [ ] Create example successful outputs

---

## Phase 2: Multi-Agent Foundation

### 2.1 Chat Bus (High Priority)
- [ ] Implement shared message queue
- [ ] Tag messages: [Alice], [Bob], [Carol], [Dave]
- [ ] Handle concurrent access safely
- [ ] Support OOC (out of character) markers

### 2.2 Agent Manager (High Priority)
- [ ] Spawn 4 agents with shared chat bus
- [ ] Concurrent poll with Promise.all()
- [ ] Timeout and retry logic per agent
- [ ] Failure detection (3 consecutive timeouts)

### 2.3 Message History Management (High Priority)
- [ ] Prune old messages to fit token budget
- [ ] Keep recent rounds in full detail
- [ ] Summarize older rounds
- [ ] Include agent's own memory (pins)

### 2.4 Pinning System (Medium Priority)
- [ ] Private pins per agent (character sheet, etc.)
- [ ] Shared pins visible to all
- [ ] Pin size limits and truncation
- [ ] Pin persistence across rounds

---

## Phase 3: Full Session (Setup → Combat → Non-Combat)

### 3.1 Phase Management (High Priority)
- [ ] Setup phase (character creation)
- [ ] Combat phase (initiative, actions, special effects)
- [ ] Non-combat phase (skills, exploration)
- [ ] Phase transition detection

### 3.2 GM Tools (High Priority)
- [ ] update_game_state (combat state, HP tracking)
- [ ] announce_initiative
- [ ] announce_phase_transition
- [ ] GM can correct player actions

### 3.3 Combat System (Medium Priority)
- [ ] Initiative rolling (1d10 + modifier)
- [ ] Action Point tracking
- [ ] Turn order management
- [ ] Attack/Defense resolution
- [ ] Special Effects handling

### 3.4 Game State (Medium Priority)
- [ ] Character HP/MP tracking
- [ ] Combat positions
- [ ] Active effects
- [ ] Equipment status

---

## Phase 4: Production Ready

### 4.1 Configuration (Medium Priority)
- [ ] Full config.yaml options
- [ ] Environment variable overrides
- [ ] Model-specific presets
- [ ] Timeout/retry tuning

### 4.2 Error Handling (Medium Priority)
- [ ] Graceful API failures
- [ ] Malformed response recovery
- [ ] Tool execution errors
- [ ] Session abort on critical failure

### 4.3 Testing (Medium Priority)
- [ ] Unit tests for tools
- [ ] Unit tests for rules parser
- [ ] Integration tests with mock LLM
- [ ] End-to-end tests with real LLM

### 4.4 Documentation (Low Priority)
- [ ] README with quickstart
- [ ] API docs for tools
- [ ] Example configs
- [ ] Troubleshooting guide

---

## Immediate Next Steps

1. **Fix tool schema warnings** - Fix the `.partial()` vs `.nullable()` issue
2. **Add session logging** - Capture everything for debugging and evaluation
3. **Complete character sheet** - Add skills, equipment, attributes calculation
4. **Run 5-10 test characters** - See completion rate and common failures
5. **Add basic judge** - Score if characters follow CFI rules

---

## Notes

- Keep token budget under 50K for ~100K context window models
- Local llama.cpp at http://kraken:8080/ for testing
- Focus on reliability before complexity
- Log everything - debugging multi-agent is hard
