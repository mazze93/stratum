# SPEC.md — Stratum

*A macOS-native cognitive workbench for AI-augmented engineering.*

Status: **Draft, ratified for implementation.**
Owner: TBD
Version: 0.1.0
Last review: session start

---

## 1. Vision

Stratum is a calm, spatial, deeply intentional macOS application that operationalizes the cognitive architecture defined in `cognitive-architecture-paper.md`. It is not a chat interface. It is a workbench — a place where the human, multiple AI agents, a layered memory store, and the artifacts of engineering work coexist in inspectable form.

Stratum's existence is justified if and only if it materially reduces the cognitive cost of AI-augmented engineering work. It is not a research artifact. It is a tool engineers reach for and keep open.

## 2. Product Philosophy

1. **The user is a peer, not an operator.** The system reveals its state, its routing, and its confidence. The user is never asked to trust a black box.
2. **Calm is a feature.** The default state is quiet. Surfaces appear when relevant and recede when not. Motion is restrained. Notifications are precious.
3. **Specs are sacred.** The path of least resistance is to write a spec, ratify it, and execute against it. Direct execution without spec is possible but visibly second-class.
4. **Memory is plural and visible.** The memory hierarchy is a first-class surface, not an internal detail. The user can see, edit, and audit what the system remembers.
5. **Local-first.** Stratum runs without a network. Cloud is opt-in for specific operations (e.g., remote LLM inference, sync across devices). Sensitive memory never leaves the device by default.
6. **The agent is not a person.** Stratum does not anthropomorphize agents. They are named by role, displayed as roles, and never asked to "feel."

## 3. Architecture

### 3.1 Components

| Component | Responsibility | Tech |
|---|---|---|
| **Stratum.app** | macOS-native shell; UI; user input/output | Swift 6 / SwiftUI |
| **Stratum CLI (`stra`)** | Headless workbench; CI-runnable | Swift CLI; Rust optional for hot paths |
| **Stratum Web Console** | Read-only remote inspection of a running workbench | SvelteKit, static |
| **Stratum Core** | Orchestrator, agent runtime, memory layer | Swift package, embedded in app and CLI |
| **Stratum Sandbox** | Isolated execution for agent-produced code | OrbStack / native container runtime |
| **Stratum Telemetry** | Local observability, audit log, replay store | SQLite + structured logs |

### 3.2 Process Topology

- One **Workbench process** per project (macOS app or `stra serve`).
- The Workbench hosts the Orchestrator, the memory layer, and agent dispatch.
- Agent invocations are isolated — separate processes for executor-class agents that touch the filesystem; in-process for read-only agents.
- The Sandbox is a separate container/VM per project.

### 3.3 Communication

- Internal: Swift actors over an in-process message bus.
- Cross-process: gRPC over Unix domain sockets.
- External (LLM): typed adapters for swappable backends (cloud, local Ollama, on-device via Core ML).

## 4. UX Principles

These follow from §7 of the whitepaper, operationalized for Stratum specifically.

1. **The Atrium is home.** The default screen is the project's Atrium — a spatial layout showing active spec, open tickets, pending arbitrations, and a quiet feed of recent agent activity. It is the cognitive topology surface.
2. **One conversation surface per task.** A single conversation maps to a single ticket or a single planning session. Long sessions are forced to checkpoint into Tessera.
3. **Specs render as documents, not chat.** When a Planner produces a spec, it appears as a `spec.md` in the project, not as a chat message.
4. **The Inspector is always one keystroke away.** `⌘I` opens the Inspector — context loaded, prompt rendered, memory tier query log, agent confidence, recent decisions.
5. **Arbitration is modal.** When the system requires arbitration, the surface is unambiguous: a sheet that cannot be dismissed without a decision.
6. **No emoji in agent output.** Agents are roles, not personalities.
7. **Typography carries the hierarchy.** No icons substitute for headings; no headings substitute for prose; no prose substitutes for structured records.

## 5. System Constraints

| Constraint | Value | Rationale |
|---|---|---|
| Cold start (open app, ready to type) | < 800ms on M-series | Calm requires immediacy |
| First token latency (default model) | < 1200ms | Below the threshold for "thinking" perception |
| Token streaming budget | 60+ tokens/sec sustained | Below this users perceive friction |
| Max in-process memory | 1.5 GB resident steady state | Avoid forcing power-mode |
| Sandbox spin-up | < 3s for warm pool | Implementers should keep a warm sandbox |
| Local-only operation | Fully functional offline with local models | Sovereignty default |
| Sensitive memory egress | Off by default; per-tier opt-in | Trust default |

## 6. Technical Stack

- **App:** Swift 6.0, SwiftUI, Combine where appropriate (Swift Concurrency preferred).
- **CLI:** Swift Argument Parser; same Core package as the app.
- **Web Console:** SvelteKit 2, static build, served from the workbench.
- **Memory store:** SQLite with FTS5; sqlite-vec for embeddings; LiteLite migrations.
- **LLM adapters:**
  - Cloud: Anthropic, OpenAI, OpenRouter (via OpenAI-compatible).
  - Local: Ollama, llama.cpp.
  - On-device: Core ML for small classifier/embedding models.
- **Sandbox:** OrbStack first-class; raw Docker supported; full-disk-access daemon for native exec optional.
- **Telemetry:** Local-only by default. OTel exporter optional, off by default.
- **Build:** SwiftPM workspace; CMake for any native deps; Bazel reserved for future scale.

## 7. State Management

### 7.1 State Object

The canonical state of a project is a single serializable structure:

```swift
struct ProjectState: Codable, Identifiable {
    let id: UUID
    var activeSpec: SpecRef?
    var openTickets: [TicketRef]
    var pendingArbitrations: [ArbitrationRef]
    var sessionDigest: SessionDigest
    var memoryTiers: MemoryTierMap
    var preferences: UserPreferences
    var foreclosed: [ForeclosedOption]
}
```

### 7.2 Update Discipline

- State mutates only via explicit reducer functions.
- Each mutation is recorded in the audit log.
- The UI subscribes to state via a unidirectional flow (state → render).
- Time travel is supported in development; replay is supported in production.

### 7.3 Transcript ≠ State

Transcripts are written but never read for state determination. When state and transcript disagree, state wins. This is enforced at type level — agents that produce state-bearing artifacts return them as structured types, not as prose to be parsed.

## 8. Agent Orchestration

### 8.1 Agent Definition

```swift
protocol Agent {
    var role: AgentRole { get }
    var contextBudget: Int { get }
    var toolAllowlist: Set<ToolID> { get }
    var inputSchema: Schema { get }
    var outputSchema: Schema { get }
    var escalationRules: [EscalationRule] { get }

    func invoke(_ input: AgentInput,
                context: ContextPacket) async throws -> AgentOutput
}
```

### 8.2 Routing

The Orchestrator routes work according to a typed workflow definition. Workflows are declared in `workflows/*.workflow.yaml` and validated at load time.

Example:

```yaml
name: standard-implement
entry: ux-interpreter
nodes:
  - id: ux-interpreter
    on_complete: planner
  - id: planner
    on_complete: { type: user_ratification, next: spec-compiler }
  - id: spec-compiler
    on_pass: architect
    on_fail: planner
  - id: architect
    on_complete: executor
  - id: executor
    on_complete: verifier
  - id: verifier
    on_pass: historian
    on_fail: { type: arbitration, route: critic }
  - id: critic
    on_complete: arbitration-resolution
  - id: historian
    on_complete: done
```

### 8.3 Concurrency

- Multiple agents may run concurrently if they operate on disjoint memory and disjoint files.
- The Orchestrator enforces this via a lock manager.
- Read-only agents are unrestricted; writers are serialized per resource.

## 9. Memory Subsystem

### 9.1 Tiers (per whitepaper §6)

Implemented as SQLite tables with explicit schemas:

- `working_memory`: transient, in-memory only.
- `session_memory`: SQLite; rolling.
- `episodic_memory`: SQLite; event graph.
- `semantic_memory`: SQLite + sqlite-vec; embedded.
- `preference_memory`: SQLite; small; user-editable.
- `archive`: SQLite; cold.

### 9.2 Retrieval API

```swift
public struct MemoryQuery {
    var tiers: Set<Tier>
    var semantic: String?
    var filters: [Filter]
    var maxResults: Int
    var weighting: RelevanceWeights
}

public protocol MemoryStore {
    func query(_ q: MemoryQuery) async throws -> [MemoryEntry]
    func write(_ entry: MemoryEntry, to: Tier) async throws
    func evict(_ id: UUID, from: Tier) async throws
    func promote(_ id: UUID, from: Tier, to: Tier) async throws
}
```

### 9.3 Curator Discipline

The Memory Curator agent is the only writer authorized to promote entries from session/episodic memory to semantic. Other agents propose; the curator promotes.

### 9.4 Tessera Storage

Tessera are stored as canonical files under `.stratum/tessera/<session-id>.yaml`. They are human-readable, editable, and version-controllable.

## 10. Security Model

| Surface | Default | Notes |
|---|---|---|
| Filesystem | Sandboxed; user-grant per project | Per-app entitlements |
| Network from agents | Off by default; per-tool allowlist | Researcher needs web; Executor does not |
| LLM calls | Cloud requires explicit project-level opt-in | Local-only is the default |
| Secrets | Keychain-only; never in memory store | API keys, tokens |
| Telemetry | Local-only; export requires consent | OTel exporter opt-in |
| Sandbox escape | Mitigated by container; explicit FS bind mounts only | No `--privileged` |
| Cryptography | libsodium for any custom crypto needs | No hand-rolled crypto |
| Database queries | Parameterized only | No string concatenation into SQL |
| Untrusted content in UI | Sanitizer pipeline; no `innerHTML` analog | `Text(...)` in SwiftUI by default |

## 11. Local-First Considerations

- Stratum is fully functional with **no network access** if local models are configured.
- A workbench may be moved between machines by copying the project directory (which contains `.stratum/`).
- Sync across devices is opt-in, encrypted end-to-end, and uses a user-chosen provider (iCloud Drive, Syncthing, custom).
- Cloud LLM use is explicit per project, never global.

## 12. Synchronization Model

When sync is enabled:

- Conflict resolution is **last-writer-wins per record**, with the option to escalate to user arbitration for high-value records (semantic memory, ratified specs).
- Telemetry never syncs.
- The keychain never syncs through Stratum; users configure keys per device.
- A `sync-status` panel shows pending changes, conflicts, and last-sync time.

## 13. Accessibility

WCAG 2.1 AA mandatory. Specifics:

- All controls keyboard-reachable; visible focus indicators.
- Contrast ≥ 4.5:1 for normal text, ≥ 3:1 for large.
- Dynamic Type support across all surfaces.
- VoiceOver labels on every interactive element; agent role announced when activity begins.
- `prefers-reduced-motion` respected (the Atrium's ambient motion disables to static).
- Touch targets ≥ 44×44 pt on iPad companion.
- Error states announced via accessibility notification.

## 14. Observability

### 14.1 What Stratum Records (Locally)

- Every agent invocation: role, input hash, prompt version, output hash, latency, tool calls, token counts.
- Every state transition: before, after, cause.
- Every arbitration: agents involved, contention, resolution, user input if any.
- Every Tessera generation: parent session, contents hash, generation cost.

### 14.2 Inspector Surface

The Inspector (`⌘I`) is the primary observability surface. It shows:

- Current agent and its loaded context.
- The rendered prompt (after compilation).
- The memory query log for this invocation.
- Token counts and cost estimate.
- Streaming token feed with timing.
- A "diff vs previous run" view when reruns occur.

### 14.3 Replay

A run can be replayed locally — deterministic for routing, replayed-with-recorded-output for model calls. The replay store sits next to the audit log.

## 15. Failure Handling

| Failure | System Response |
|---|---|
| LLM call timeout | Retry with backoff; surface to user after 2nd failure |
| LLM call refusal/safety | Surface to user with model explanation; no silent fallback |
| Sandbox failure | Halt executor; preserve work; offer rebuild |
| Memory tier corruption | Quarantine tier; fall back to last good snapshot; alert user |
| Disagreement between Critic and Verifier | Auto-escalate to arbitration |
| Agent infinite loop | Hard timeout per agent invocation; recorded as anomaly |
| Tessera generation failure | Block session close; surface as blocking arbitration |

## 16. Testing Philosophy

1. **Test prompts as artifacts.** Each prompt has a regression suite of representative inputs and recorded outputs.
2. **Test orchestration determinism.** Routing is deterministic given memory state; tests verify this.
3. **Test memory invariants.** Tier promotion, decay, and conflict resolution have property-based tests.
4. **Test sandbox isolation.** Adversarial executor scripts attempt escape; tests verify containment.
5. **Test UI flows on accessibility tooling.** VoiceOver, keyboard-only, reduced motion are CI gates.
6. **Snapshot test the Inspector.** Inspector output for a fixed scenario must match the snapshot.

## 17. API Contracts

### 17.1 LLM Adapter

```swift
protocol LLMAdapter {
    var capabilities: AdapterCapabilities { get }

    func complete(_ request: LLMRequest) async throws -> LLMResponse
    func stream(_ request: LLMRequest) -> AsyncThrowingStream<LLMChunk, Error>
}
```

Adapters are swappable per-project. Capabilities (tool use, vision, streaming) are declared; the Orchestrator refuses to dispatch to incapable adapters.

### 17.2 Tool Catalog

```swift
protocol Tool {
    var id: ToolID { get }
    var schema: ToolSchema { get }
    var requiredPermissions: Set<Permission> { get }

    func invoke(_ args: ToolArguments) async throws -> ToolResult
}
```

Tools are registered at workbench startup and gated by per-agent allowlists.

### 17.3 Workflow Schema

YAML, validated against a JSON Schema. Workflows are versioned; the Orchestrator records workflow version on every routing decision.

## 18. Plugin Architecture

Stratum supports two plugin surfaces:

1. **Agent plugins:** Implement the `Agent` protocol; ship as Swift packages. Discovered at startup via `.stratum/plugins/agents/`.
2. **Tool plugins:** Implement `Tool`; ship as Swift packages or external binaries with a JSON-RPC manifest.

Plugins are sandboxed by default. Agent plugins inherit a restrictive entitlement set; tool plugins declare their permissions in a signed manifest. The user reviews and grants permissions at install time.

## 19. Future Extensibility

The following are designed-for but unimplemented:

- **MCP server bridge:** Stratum can speak Model Context Protocol as a server and as a client. The protocol is on the v1.1 roadmap and gated behind a feature flag.
- **Multi-user sessions:** Two engineers in the same Atrium. Requires conflict-resolution UX beyond the v1 scope.
- **Mobile companion:** iPad/iPhone read-and-arbitrate client. Same Core package; different UI shell.
- **Self-organizing roles:** Roles proposed by the system and ratified by the user. Out of scope for v1; tracked as research.
- **External cognitive bus:** Stratum exposing its memory as an MCP server consumable by other tools. Designed-for; gated until trust model matures.

---

## Acceptance Criteria for v1.0

1. A user can install Stratum, create a project, write a spec, ratify it, and have agents implement against it end-to-end without leaving the app.
2. All operations work fully offline with a local model adapter configured.
3. The Inspector shows complete context, prompt, and memory query trace for every agent invocation.
4. Tessera generation occurs automatically at session close and is human-readable.
5. The accessibility CI gate passes — no regressions from baseline.
6. Cold start ≤ 800ms, first-token latency ≤ 1200ms on representative hardware (M2 Pro or better).
7. Sandbox is verifiably isolated against a defined adversarial test suite.
8. No agent can call out to the network without an explicit allowlist for its role.
