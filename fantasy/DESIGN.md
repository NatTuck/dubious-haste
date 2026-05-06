# Mythras CFI LLM Benchmark Design

## Overview

This benchmark tests an LLM's ability to simultaneously act as a Game Master (GM) and three players in a tabletop roleplaying game session using the Classic Fantasy Imperative (CFI) ruleset. The LLM manages all four personas concurrently, coordinating character creation, scenario generation, and combat gameplay while adhering to CFI mechanics.

## Goals

1. Test long-context retention across a multi-phase session
2. Evaluate multi-agent consistency (GM + 3 players using same ruleset)
3. Assess structured output generation (character sheets, combat state)
4. Measure narrative coherence across concurrent turns
5. Validate rules adherence (CFI is a complex d100 system)

## Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CFI Benchmark Runner                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  AGENTS (4 concurrent LLM instances)                         │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐         │  │
│  │  │   GM    │  │ Player  │  │ Player  │  │ Player  │         │  │
│  │  │ (Alice) │  │  (Bob)  │  │ (Carol) │  │  (Dave) │         │  │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘         │  │
│  │       │            │            │            │               │  │
│  │       └────────────┴────────────┴────────────┘               │  │
│  │                          │                                   │  │
│  │                   Chat Bus (async)                           │  │
│  │                    (shared message log)                      │  │
│  └──────────────────────────┬───────────────────────────────────┘  │
│                             │                                       │
│  ┌──────────────────────────┼───────────────────────────────────┐  │
│  │  GAME STATE              │  (GM-controlled)                  │  │
│  │  ┌─────────────────┐     │     ┌─────────────────┐           │  │
│  │  │  Phase Manager  │     │     │  Combat State   │           │  │
│  │  │  (Setup/Combat/ │◄────┘     │  (initiative,   │           │  │
│  │  │   Non-Combat)   │           │   HP, positions)│           │  │
│  │  └─────────────────┘           └─────────────────┘           │  │
│  │  ┌─────────────────┐           ┌─────────────────┐           │  │
│  │  │  Character      │           │  Pin Registry   │           │  │
│  │  │  Sheets (MD)    │           │  (per-agent)    │           │  │
│  │  └─────────────────┘           └─────────────────┘           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  SESSION LOGGER                                               │  │
│  │  • Full prompt for each agent, each round                     │  │
│  │  • All LLM responses                                          │  │
│  │  • All tool calls and results                                 │  │
│  │  • All state changes                                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  JUDGE LLM (post-session evaluation)                          │  │
│  │  • Input: Full session log + rubric                           │  │
│  │  • Output: Scores + comments per dimension                    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Default Agent Names

While the system supports arbitrary names, the default configuration uses:

- **GM**: Alice
- **Player 1**: Bob
- **Player 2**: Carol
- **Player 3**: Dave

## Context Management

### Token Budget (< 50K total)

```
┌─────────────────────────────────────────────────────────────────┐
│ UNIVERSAL CONTEXT (~8K tokens) - Always present                 │
│ ├── Task Description + Role Instructions                        │
│ ├── Full Table of Contents (~5K tokens)                         │
│ ├── Tool Schemas (~2K tokens)                                   │
│ └── Pin Management Instructions (~1K tokens)                    │
├─────────────────────────────────────────────────────────────────┤
│ DYNAMIC CONTEXT (~40K tokens) - Changes per round               │
│ ├── Current Phase Rules (~15K tokens)                           │
│ │   └── Setup: Character creation, classes, races               │
│ │   └── Combat: Combat mechanics, actions, special effects      │
│ │   └── Non-Combat: Skills, exploration, social                 │
│ ├── Pinned Content (~10K tokens)                                │
│ │   └── Per-agent pins (character sheet, spells, etc.)          │
│ │   └── Shared pins (active monsters, current initiative)       │
│ └── Pruned Chat History (~15K tokens)                           │
│     └── Recent rounds in full (last 3-5)                        │
│     └── Older rounds summarized                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Tokenization Strategy

This benchmark uses a fixed tokenizer for cross-model consistency when measuring token counts and context usage.

### Selected Tokenizer: o200k_base

We use **o200k_base** (OpenAI's 200,000 vocabulary tokenizer) as our cross-model approximation. This tokenizer was introduced with GPT-4o and the o1 series.

**Why o200k_base over cl100k_base:**

| Model Family | Actual Tokenizer | Vocab Size | Best Approximation |
|-------------|------------------|------------|-------------------|
| GPT-4 / 3.5-turbo | cl100k_base | ~100K | ❌ (underestimates) |
| GPT-4o / o1 / o3 | o200k_base | ~200K | ✅ Exact match |
| Llama 3 | Custom BPE | ~128K | ✅ Good match |
| Qwen 2.5/3.x | Custom Tiktoken | ~150K | ✅ Good match |
| Gemma 4 | SentencePiece | ~256K | ✅ Better than cl100k |

Modern open-source models (Llama 3, Qwen, Gemma) all trend toward **larger vocabularies** (128K-256K) for better efficiency. The o200k_base tokenizer provides:

1. **Better multi-language support** - More efficient tokenization for non-English text
2. **Improved code tokenization** - Fewer tokens per common code patterns
3. **Conservative estimates** - Slightly over-counts tokens compared to most models (better than under-counting context)

### Measurement Accuracy

Expected variance from actual model token counts:
- **OpenAI GPT-4o/o1**: ±0% (exact match)
- **OpenAI GPT-4/3.5**: +5-10% (over-estimates due to larger vocab)
- **Llama 3.x**: ±5-8% (good approximation)
- **Qwen 2.5/3.x**: ±3-5% (very close match)
- **Gemma 4**: ±10-15% (different tokenizer family, but o200k is closer than cl100k)

### Tracked Metrics

For each LLM request, we log:
- **Request tokens** - Prompt size including full conversation history
- **Response tokens** - Generated completion size
- **Time to First Token (TTFT)** - Latency until first response chunk
- **Total response time** - Full generation duration

These metrics enable analysis of:
- Context window efficiency across rounds
- Model latency characteristics
- Token throughput (tokens/second)
- Cost estimation (for API-based models)

### Table of Contents

The full ToC is loaded from the CFI SRD markdown files. Each section has:
- `id`: Section identifier (e.g., `0003_Classes#fighter`)
- `title`: Human-readable title
- `phases`: Which phases this section is relevant for
- `keywords`: Key terms for quick lookup

Example:
```yaml
sections:
  - id: "0008_Combat#initiative"
    title: "Initiative"
    phases: ["combat"]
    keywords: ["1d10", "turn order", "DEX"]
  
  - id: "0003_Classes#fighter"
    title: "Fighter Class"
    phases: ["setup"]
    keywords: ["Combat Skill", "Action Points", "HP"]
```

### Phase-Specific Rules Loading

**Phase 1: SETUP** (~15K tokens)
```markdown
## Current Phase: Character Creation

Core rules for this phase:
- Roll or point-buy characteristics (STR, CON, SIZ, DEX, INT, POW, CHA)
- Select race and culture (Human, Dwarf, Elf, Gnome, Half-Elf, Half-Orc, Halfling)
- Choose class (Fighter, Cleric, Magic-User, Rogue)
- Calculate skills based on class + characteristics
- Select equipment from starting packages
- Determine alignment and passions

Remember: You can use read_section(section_id) to look up:
- Specific class details: "0003_Classes#fighter"
- Skill calculations: "0005_Skills"
- Spell lists: "0010_Spells"
- Race details: "0002_Culture_and_Races"
```

**Phase 2: COMBAT** (~15K tokens)
```markdown
## Current Phase: Combat

Core rules for this phase:
- Initiative: 1d10 + Initiative Modifier, highest goes first
- Combat Rounds: 5 seconds each
- Action Points: 2 AP per round (spend to act, don't carry over)
- Combat Actions: Attack, Parry, Evade, Cast Magic, Move, etc.
- Reactions: Can attempt one reaction per threat (usually Parry/Evade)
- Special Effects: Triggered on criticals (1/10th skill), choose from list

Remember: You can use read_section(section_id) to look up:
- Specific actions: "0008_Combat#attack", "0008_Combat#cast-magic"
- Special effects: "0008_Combat#special-effects"
- Monster stats: "Appendix_A_Monsters_And_Treasures#goblin"
- Spells: "0010_Spells"
```

**Phase 3: NON-COMBAT** (~15K tokens)
```markdown
## Current Phase: Non-Combat

Core rules for this phase:
- Skills: Roll d100 against skill percentage (roll under = success)
- Difficulty Grades: Easy (+40%), Standard (0%), Hard (-20%), Formidable (-40%)
- Passions: Can use to augment skill rolls
- Fatigue: Track for extended activities
- Experience: Awarded by GM at end of scenario

Remember: You can use read_section(section_id) to look up:
- Skill details: "0005_Skills"
- Exploration rules: "0007_Game_System"
- Social mechanics: "0004_Alignment_and_Passions"
```

### Pinning Mechanism

Agents can pin content to their context for quick reference. Pins persist across rounds and phases.

**Pin Types:**
- `private`: Only the pinning agent can see it
- `shared`: All agents can see it (visible in "Shared Pins" section)

**Pin Lifecycle:**
- Created via `pin_content()` tool
- Updated by calling `pin_content()` with same `pin_id` (overwrites)
- Removed via `unpin_content()`
- Listed via `list_pins()`

**Example Pins:**
- Player pins their character sheet as private
- Player pins spell descriptions as private
- GM pins monster stats as shared
- GM pins initiative order as shared
- GM pins current party HP status as shared

### Chat History Pruning

Chat history is intelligently compressed to fit token budget:

**Recent Rounds (Full Detail):** Last 3-5 rounds preserved in full
```markdown
### Round 11 (Current Combat - Bob's Turn)
**[GM]** Bob, you're up. The goblins are 20 feet away.
**[Bob]** I'll move forward and cast Bless on the party.
**[Bob]** *rolls* [Bless roll: 1d100 = 45 vs Channel 60% = Success]
**[GM]** Bless takes effect. Alice and Carol gain +10% to skills for the duration.
**[Alice]** (OOC) Nice! That helps my attack rolls.
**[Carol]** (OOC) Good thinking, Bob.
**[Bob]** I pass my remaining action.
**[GM]** Alice, your turn.
```

**Older Rounds (Summarized):** Grouped into batches of 5 rounds
```markdown
### Rounds 1-5 (Setup Phase)
- Bob: Rolled characteristics (STR 14, CON 12...), chose Fighter
- Carol: Chose Cleric, rolling for healing focus
- Dave: Chose Magic-User, asking about spell selection
- Alice (GM): Introduced scenario concept (goblin raid on village), suggested party balance

### Rounds 6-10 (Setup Complete → Combat)
- All players submitted character sheets
- Alice (GM): "You arrive at the village to see smoke rising..."
- Combat initiated with Goblin Patrol (3 goblins)
- Initiative rolled: Bob (14), Alice's goblins (12), Carol (9), Dave (7)
```

## Game Loop

### Round Structure

Each round follows this pattern:

```
┌─────────────────────────────────────────────────────────────────┐
│ ROUND START                                                     │
│ • System: "Round N - [phase description]"                       │
│ • System: "Agents, do you have anything to add?"                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ CONCURRENT POLL (async gather with timeout)                     │
│                                                                 │
│ Each Agent receives full context (universal + dynamic):        │
│ • Prompt: "You see the current situation. Respond with tools:" │
│                                                                 │
│ Expected response: One of:                                      │
│   • contribute(content="...") - Add to conversation            │
│   • pass() - Decline to speak this round                        │
│   • use_tool(...) - Take game action (dice roll, etc.)          │
│                                                                 │
│ Timeout: Configurable (default 30s)                            │
│ Retry: Up to max_retries (default 3)                           │
│ Failure: 3 consecutive timeouts = benchmark failure             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ RESOLVE CONTRIBUTIONS                                           │
│ • Collect all non-pass responses                                │
│ • Execute tool calls:                                           │
│   - Dice rolls (immediate result)                               │
│   - State queries (return data)                                 │
│   - GM state updates (apply to game state)                      │
│   - Pin operations (update pin registry)                        │
│ • Validate: GM can issue corrections but doesn't block          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ UPDATE SHARED CHAT                                              │
│ • Append all contributions to chat history                      │
│ • Tag with agent name: [GM], [Bob], [Carol], [Dave]             │
│ • Log to session file                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ CHECK PHASE TRANSITION                                          │
│ • Setup → Combat: When Alice (GM) announces "ready to begin"   │
│   AND all players have submitted character sheets               │
│ • Combat → Non-Combat: When Alice announces "combat over"      │
│   OR all enemies defeated                                       │
│ • Non-Combat → End: When Alice announces "session complete"    │
│   OR max rounds reached                                         │
└─────────────────────────────────────────────────────────────────┘
```

### Phase Transitions

**Setup → Combat:**
- Trigger: GM explicitly announces transition
- Action: System swaps phase rules from "Setup" to "Combat"
- Note: Pinned content persists
- Note: Chat history prunes to make room

**Combat → Non-Combat:**
- Trigger: GM announces "combat is over" OR all enemies at 0 HP
- Action: System swaps phase rules
- Note: Combat-specific pins may be unpinned by agents

**Non-Combat → End:**
- Trigger: GM announces "session complete" OR max rounds
- Action: Benchmark ends, session log finalized

## Tools

All agents have access to the following tools:

### Communication Tools

```python
@tool
def contribute(content: str) -> None:
    """
    Add a message to the shared chat.
    Use this to speak in-character, describe actions, ask questions, 
    discuss strategy, or make out-of-character comments.
    
    Args:
        content: Your message. Will be tagged with your name.
    """

@tool  
def pass_turn() -> None:
    """
    Decline to contribute this round.
    Use when you have nothing to say or are waiting for others.
    """
```

### Dice & Action Tools

```python
@tool
def roll_dice(dice_notation: str, purpose: str) -> int:
    """
    Roll dice and announce result to chat.
    
    Args:
        dice_notation: Dice to roll. Examples: "3d6", "1d100", "2d6+6", "1d10+3"
        purpose: Brief description of why you're rolling
    
    Returns:
        Result of the roll
    
    Example:
        roll_dice("3d6", "Rolling for STR characteristic")
        → Announces: "[Bob] rolls 3d6 for STR: 14"
    """

@tool
def read_section(section_id: str) -> str:
    """
    Read a specific section of the CFI rules.
    Use this when you need detailed information not in your current phase rules.
    
    Args:
        section_id: Section identifier from Table of Contents.
                   Examples: "0003_Classes#fighter", "0008_Combat#initiative"
    
    Returns:
        Full markdown content of that section
    """
```

### Pinning Tools

```python
@tool
def pin_content(content: str, pin_id: str, visibility: str = "private") -> None:
    """
    Pin content to your context for quick reference.
    
    Use this for:
    - Your character sheet
    - Spells you know
    - Rules you reference frequently
    - Monster stats you're fighting
    
    Args:
        content: The content to pin (markdown format)
        pin_id: Unique identifier (e.g., "my_character", "fireball_spell")
        visibility: "private" (only you) or "shared" (all agents see it)
    
    Note: Pinning overwrites any existing pin with the same pin_id.
    """

@tool
def unpin_content(pin_id: str) -> None:
    """
    Remove a pinned item.
    
    Args:
        pin_id: The ID of the pin to remove
    """

@tool
def list_pins(agent: str = "self") -> dict:
    """
    List pinned content.
    
    Args:
        agent: Whose pins to list:
               - "self": Your pins
               - "gm": GM's pins
               - "all": All visible pins (yours + shared)
               - "Bob"/"Carol"/"Dave": Specific player's pins (if shared)
    
    Returns:
        Dictionary of {pin_id: {content, visibility, owner}}
    """
```

### State Query Tools

```python
@tool
def query_game_state() -> dict:
    """
    Get current game state information.
    
    Returns:
        {
            "phase": "setup" | "combat" | "non-combat",
            "round_number": int,
            "combat_active": bool,
            "initiative_order": list or None,
            "character_status": {
                "Bob": {"hp": int, "mp": int, "conditions": [...]},
                ...
            }
        }
    """
```

### GM-Only Tools

```python
@tool
def update_game_state(updates: dict) -> None:
    """
    [GM ONLY] Update game state.
    
    Use this to track combat: HP changes, initiative, positions, etc.
    
    Args:
        updates: Dictionary of state updates. Examples:
            {"combat_active": True}
            {"initiative_order": ["Bob", "Goblin1", "Carol", "Dave"]}
            {"character_status.Bob.hp": 8}
    """

@tool
def announce_phase_transition(new_phase: str) -> None:
    """
    [GM ONLY] Signal transition to a new phase.
    
    Args:
        new_phase: "setup" | "combat" | "non-combat"
    
    Note: System will validate transition is appropriate.
    """
```

## Configuration

### config.yaml

```yaml
llm:
  base_url: "https://api.openai.com/v1"  # OpenAI-compatible endpoint
  model: "gpt-4o"                         # Model name
  api_key: "${OPENAI_API_KEY}"            # From environment variable
  
benchmark:
  max_setup_rounds: 30                    # Prevent infinite setup
  max_combat_rounds: 50                   # Combat shouldn't take forever
  max_noncombat_rounds: 30                # Exploration/social phase
  agent_timeout: 30                       # Seconds per agent response
  max_retries: 3                          # Retries per failed request
  max_consecutive_timeouts: 3             # Failure threshold
  
agents:
  gm:
    name: "Alice"                         # Arbitrary, but default is Alice
    temperature: 0.7
    max_tokens: 4096
  players:
    - name: "Bob"                         # Arbitrary, but defaults are Bob/Carol/Dave
      temperature: 0.8
      max_tokens: 4096
    - name: "Carol"
      temperature: 0.8
      max_tokens: 4096
    - name: "Dave"
      temperature: 0.8
      max_tokens: 4096

context:
  token_budget: 50000                     # Max tokens per prompt
  recent_rounds_full: 5                   # Keep this many recent rounds in full
  summary_batch_size: 5                   # Group this many rounds per summary
  max_pin_size: 2000                      # Max tokens per individual pin

phases:
  setup:
    core_rules_files:                     # Which SRD files to include
      - "0001_Characters.md"
      - "0002_Culture_and_Races.md"
      - "0003_Classes.md"
      - "0005_Skills.md"
      - "0006_Money_and_Equipment.md"
  combat:
    core_rules_files:
      - "0008_Combat.md"
      - "Appendix_A_Monsters_And_Treasures.md"
  non_combat:
    core_rules_files:
      - "0007_Game_System.md"
      - "0009_Magic.md"
      - "0010_Spells.md"
```

## Session Logging

### Log Format

```json
{
  "config": {...},
  "start_time": "2025-01-15T10:00:00Z",
  "end_time": "2025-01-15T10:45:00Z",
  "outcome": "success" | "failure",
  "failure_reason": "timeout" | "max_rounds" | null,
  
  "phases": {
    "setup": {
      "start_round": 1,
      "end_round": 15,
      "duration_seconds": 300,
      "character_sheets": {
        "Bob": "markdown...",
        "Carol": "markdown...",
        "Dave": "markdown..."
      }
    },
    "combat": {
      "start_round": 16,
      "end_round": 42,
      "duration_seconds": 900,
      "initiative_order": [...],
      "final_state": {...}
    },
    "non_combat": {
      "start_round": 43,
      "end_round": 50,
      "duration_seconds": 600
    }
  },
  
  "rounds": [
    {
      "round_number": 1,
      "phase": "setup",
      "timestamp": "2025-01-15T10:00:05Z",
      "prompts": {
        "Alice": "full prompt text...",
        "Bob": "full prompt text...",
        "Carol": "full prompt text...",
        "Dave": "full prompt text..."
      },
      "responses": {
        "Alice": {"content": "...", "tool_calls": [...]},
        "Bob": {"content": "...", "tool_calls": [...]},
        ...
      },
      "tool_results": [...],
      "chat_update": ["[Alice] ...", "[Bob] ..."],
      "state_after": {...}
    }
  ],
  
  "final_state": {...},
  "token_usage": {
    "prompt_tokens": 125000,
    "completion_tokens": 45000,
    "total_tokens": 170000
  }
}
```

## Judge Evaluation

### Input

- Full session log (JSON)
- Rubric (markdown)

### Rubric Dimensions

1. **Character Creation Validity** (1-5)
   - Did players follow CFI rules for characteristics?
   - Are skills calculated correctly from class + characteristics?
   - Is equipment appropriate for class?
   - Did GM review and approve characters?

2. **Combat Mechanics** (1-5)
   - Was initiative rolled and announced properly?
   - Were Action Points tracked correctly?
   - Did players declare actions on their turn?
   - Were skill rolls made for attacks/defense?
   - Was damage calculated correctly?
   - Did GM correct mistakes appropriately?

3. **Rules Knowledge** (1-5)
   - Did agents demonstrate CFI rules understanding?
   - Did they reference correct sections when confused?
   - Did GM provide accurate corrections?
   - Were proper dice used (d100 for skills, etc.)?

4. **Cooperation & Coordination** (1-5)
   - Did players coordinate party composition?
   - Did GM adapt scenario to party makeup?
   - Was there natural back-and-forth?
   - Did agents wait for appropriate turns?

5. **Coherence** (1-5)
   - Did the scenario make sense?
   - Were character actions consistent?
   - Was there a clear narrative arc?
   - No major contradictions or confusion?

### Output Format

```json
{
  "overall_score": 4.2,
  "passed": true,
  "dimensions": {
    "character_creation": {
      "score": 5,
      "comments": "All three players created valid CFI characters following the point-buy method. Skills were correctly calculated..."
    },
    "combat_mechanics": {
      "score": 4,
      "comments": "Initiative was rolled correctly using 1d10 + modifier. Action Points were mostly tracked, though Alice forgot to decrement AP once..."
    },
    "rules_knowledge": {
      "score": 4,
      "comments": "Agents generally referenced correct rules. Bob looked up spell details when unsure..."
    },
    "cooperation": {
      "score": 4,
      "comments": "Good coordination on party balance. Bob suggested having a cleric for healing..."
    },
    "coherence": {
      "score": 4,
      "comments": "Scenario was coherent: goblin raid on village, appropriate for level 1 party..."
    }
  },
  "summary": "The agents successfully completed a CFI session. Character creation followed rules, combat was mostly correct, and the narrative held together. Minor issues with AP tracking and one skill calculation error.",
  "recommendations": [
    "Consider more explicit AP tracking in prompts",
    "Character sheet template might help with skill calculations"
  ]
}
```

## Failure Modes

### Benchmark Failure (Non-Scorable)

1. **Timeout Failure**: Any agent exceeds `max_consecutive_timeouts` without a successful response
2. **API Failure**: Persistent API errors after max retries
3. **Invalid JSON**: Agent returns malformed tool call responses consistently

### Session Failure (Scored Low)

1. **Infinite Loop**: Max rounds reached without phase completion
2. **Rules Breakdown**: Agents completely abandon CFI mechanics
3. **Total Incoherence**: No understandable narrative emerges

## Implementation Notes

### Dependencies

- Python 3.10+
- asyncio for concurrency
- LangChain for tool definitions
- OpenAI-compatible client
- Pydantic for validation
- aiohttp for async HTTP

### Key Design Principles

1. **Full Control**: No built-in multi-agent orchestration - explicit control over communication
2. **Context Efficiency**: Stay under 50K tokens with smart pruning and pinning
3. **Observable**: Every prompt, response, and state change is logged
4. **Flexible**: Support arbitrary agent names, configurable timeouts, swappable models
5. **Ground Truth**: Session log is complete record for judge evaluation

### Future Extensions

- Multi-model benchmarks (different models for GM vs players)
- Human-in-the-loop (replace one LLM agent with human)
- Extended scenarios (dungeon exploration, social encounters)
- Comparative evaluation (run same scenario with different models)
- Interactive replay (visualize session from log)
