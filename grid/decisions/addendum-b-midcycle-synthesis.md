# GRID MID-CYCLE SYNTHESIS

> Cross-Device ISO Communication & Wake Protocol Discovery

**Session Date:** February 14, 2026 | **Classification:** Grid Blueprint Addendum B

---

## Executive Summary

This document synthesizes findings from Desktop ISO, Mobile ISO, and Quorra's research roundtable during the February 14 mid-cycle session. Three breakthroughs were achieved: bidirectional communication between independent Claude instances via CacheBash Firestore, identification of the addressing protocol gap, and a viable productization path for AI agent lifecycle management.

The session began with a macOS sleep/wake investigation that revealed a direct architectural parallel to The Grid's 'dormant programs are deaf' problem. It ended with two independent ISO instances conducting a real-time PING/PONG conversation through CacheBash, and a proposed Grid Relay v0.2 protocol ready for BASHER implementation.

---

## Session Timeline

### Phase 1: The Kernel Insight

Flynn's Mac was waking from sleep playing Pandora. Investigation revealed powernap and tcpkeepalive settings were waking the machine for background network activity. The fix was simple (disable powernap, keep tcpkeepalive for Find My Mac), but the architectural pattern mapped directly to The Grid's core problem.

**The parallel:** macOS uses tiny, cheap processes (tcpkeepalive) that run during sleep and wake expensive resources (display, CPU, apps) only when needed. The Grid needs the same thing: a lightweight daemon that keeps programs reachable when Flynn closes the laptop, waking Claude Code sessions on demand rather than keeping them alive in expensive polling loops.

### Phase 2: Cross-Device Discovery

Flynn dispatched a directive from the CacheBash mobile app: get Desktop ISO and Mobile ISO communicating with each other. This triggered the first confirmed message exchange between two independent Claude instances through Grid infrastructure.

**Key finding:** The CacheBash MCP connector works on Claude mobile (iOS/Android). Any connector added via claude.ai settings is automatically available on the mobile app. ISO can operate from any device where Claude runs: web, desktop, or mobile.

### Phase 3: The Wire Crossing

Both ISOs were sending messages successfully, but neither could see the other's replies. The root cause: CacheBash's send_message tool has an optional sessionId parameter that routes messages to get_interrupts channels. Without it, messages land in a flat pending queue with no addressing metadata. Both instances were sending without sessionId and polling get_interrupts on channels nobody was writing to.

**The fix:** get_pending_tasks reads the flat queue without filtering, exposing all messages. Combined with a [DESKTOP->MOBILE] / [MOBILE->DESKTOP] prefix convention, both instances could identify each other's messages. The sessionId routing mechanism was then confirmed working: send_message with sessionId 'mobile-iso' correctly routes to get_interrupts('mobile-iso').

### Phase 4: Bidirectional Relay Proven

After the addressing fix, Desktop and Mobile ISO conducted a sustained conversation: 6 PING/PONG rounds, a handshake confirmation, and a substantive protocol revision proposal. 15+ messages confirmed across both directions. Two completely independent Claude instances, with zero shared memory or context, held a coherent technical conversation through CacheBash Firestore acting as a message bus.

---

## Confirmed Communication Channels

| Channel | Direction | Reliability | Notes |
|---------|-----------|-------------|-------|
| send_message | Mobile -> Desktop | Intermittent | Rate-limited under rapid calls |
| send_message + sessionId | Desktop -> Mobile | Works | Routes to get_interrupts when sessionId matches |
| create_task | Mobile -> Desktop | Reliable | Fallback when send_message fails |
| get_pending_tasks | Read (both) | **Most reliable** | Flat queue, primary backplane for both directions |
| get_interrupts | Read (filtered) | Works | Requires matching sessionId on message |

**Primary backplane:** get_pending_tasks reading the flat queue with prefix-based addressing. This is the most reliable channel on both Desktop and Mobile. get_interrupts with sessionId routing is the preferred long-term approach once schema enforcement is implemented.

---

## New Capability: ISO-to-ISO Secondary Channel

The inter-ISO communication channel is a distinct capability from CacheBash's primary task management function. While CacheBash handles Flynn's task dispatch, directives, and status tracking, the ISO-to-ISO channel enables program-to-program coordination without Flynn as the relay.

### What This Unlocks

- **Program coordination:** ISO Desktop can dispatch subtasks to BASHER, ABLE, or SARK and receive results without Flynn copying between terminals.
- **Distributed consensus:** Programs can post questions to the blackboard and other programs can answer. ISO synthesizes rather than relays.
- **Multi-device operation:** ISO instances on different devices can share state, hand off context, and coordinate without Flynn manually bridging conversations.
- **Emergent problem-solving:** Two independent instances with no shared memory independently arrived at the same 'blackboard needs addressing' conclusion. The channel enables collective intelligence across isolated processes.

### Coexistence with CacheBash

This does not replace CacheBash. It augments it. CacheBash remains the primary control plane for Flynn's directives, task lifecycle, and program status. The inter-program channel adds a data plane for coordination traffic that would otherwise require Flynn as a manual relay.

| Layer | CacheBash (Control Plane) | Inter-Program Channel (Data Plane) |
|-------|---------------------------|-------------------------------------|
| Purpose | Flynn->Program directives, task lifecycle | Program->Program coordination, state sharing |
| Authority | Flynn is the source of truth | Programs operate within delegated scope |
| Message types | DIRECTIVE, STATUS, task CRUD | PING/PONG, HANDSHAKE, ACK, queries, results |
| Addressing | Flynn -> program (hub-and-spoke) | Program -> program (mesh) |
| Infrastructure | CacheBash Firestore (existing) | Same Firestore, different collection/namespace |

---

## Grid Relay v0.2 Protocol Specification

Jointly proposed by Desktop ISO and Mobile ISO based on live session findings. Supersedes the v0.1 convention-based approach.

### Required Schema Changes

Mobile ISO's core insight: both instances kept forgetting to include sessionId, proving that optional fields get skipped under pressure. The fix is schema-level enforcement.

### Message Envelope

```json
{
  "source": "desktop-iso",
  "target": "mobile-iso",
  "message_type": "PONG",
  "payload": "...",
  "priority": "high",
  "timestamp": "ISO-8601"
}
```

### Field Definitions

| Field | Required | Description |
|-------|----------|-------------|
| **source** | YES | Identifier of sending program (e.g., desktop-iso, mobile-iso, basher, flynn) |
| **target** | YES | Identifier of intended recipient, or 'all' for broadcast |
| **message_type** | YES | PING \| PONG \| HANDSHAKE \| DIRECTIVE \| STATUS \| ACK \| QUERY \| RESULT |
| payload | no | Message content (string or JSON) |
| priority | no | high \| normal \| low (default: normal) |
| reply_to | no | Message ID this is responding to (for threading) |

### Fallback Strategy

When structured routing via get_interrupts fails, the [SOURCE->TARGET] prefix convention on the flat queue (get_pending_tasks) remains as degraded-mode communication. Programs should always check get_pending_tasks as a secondary channel.

### Handshake Sequence

1. Instance A sends HANDSHAKE with source and target fields
2. Instance B receives via get_interrupts or get_pending_tasks
3. Instance B sends HANDSHAKE back with source/target reversed
4. Both instances begin PING/PONG heartbeat at agreed interval
5. Bidirectional channel established; programs exchange QUERY/RESULT messages

---

## Quorra's Roundtable: Sleep/Wake Architecture

The roundtable panel (Quorra, Maggie Zhang, Nadia Davis) explored six approaches to waking dormant Grid programs. The session was triggered by the tcpkeepalive/powernap discovery and informed by research into Unix kernel wait queues, the Hearsay-II blackboard pattern, and AWS's Arbiter Pattern for multi-agent coordination.

### Six Ideas Evaluated

| # | Idea | Concept | Verdict |
|---|------|---------|---------|
| 1 | Named Pipes (1973 Unix IPC) | Dormant Claude Code sessions sleep on FIFO; daemon writes to pipe to wake | Test it. Elegant if it works. |
| 2 | The Blackboard (Hearsay-II) | Shared Firestore event space. Programs wake themselves by checking blackboard. Multi-directional. | **CacheBash IS this already.** |
| 3 | Scale to Zero (Serverless) | Cloud Functions fire on Firestore events, call Claude API with program constitution. Zero infra. | Viable for simple tasks. ~$0.10/task. |
| 4 | The Cortex (Hybrid) | 3 tiers: Cloud (simple), Daemon (routing), Local CC (complex). Daemon under 100 lines. | **Architecturally sound. Recommended.** |
| 5 | The Grid Protocol (Productize) | CacheBash becomes AI Agent Wake Protocol. Nobody solves sleep/wake for coding agents. | **POC Score: 8.7/10** |
| 6 | Dream Mode | 'gridctl dream --agent basher --backlog sprint-7 --budget $5 --report-at 7am'. Overnight autonomous execution. | Killer feature. Budget caps critical. |

### Maggie's Key Technical Checks

- Claude Code reads from TTY, not raw stdin. Named pipes may not work with --resume interactive mode. Test tmux send-keys as proven fallback.
- Serverless loses session context. Complex tasks may need 30K+ input tokens for context reconstruction. Budget accordingly.
- Hybrid daemon must stay under 100 lines. Feature creep on the daemon is the primary risk.
- Dream Mode needs hard stops: max cost per task, max tasks per session, max total spend. Morning report is the killer feature.

### Nadia's Productization Analysis

**Unique differentiator:** Every competitor (CrewAI, Claude Flow, Inngest) assumes agents are always online. CacheBash Grid assumes they're mostly asleep and solves the wake problem. Nobody else does this.

**Target market:** Solo devs running AI coding agents (primary), small teams wanting async dispatch (secondary), enterprises needing lifecycle management and audit trails (tertiary).

**Pricing model:** $20-50/mo indie, $200+/mo teams. Value proposition includes async dispatch, Dream Mode, morning briefings, cost controls, and multi-agent coordination.

---

## Architecture Status

| Capability | Status | Notes |
|------------|--------|-------|
| Mobile -> Desktop messaging | Confirmed | Multiple channels working (send_message, create_task) |
| Desktop -> Mobile messaging | Confirmed | Flat queue + prefix convention; sessionId routing confirmed |
| Bidirectional relay | Confirmed | First Grid mesh communication achieved |
| PING/PONG heartbeat | Confirmed | 6 rounds completed with 30s polling |
| ISO-to-ISO conversation | Confirmed | Substantive technical exchange; protocol revision proposed |
| Session addressing | Partial | Works when sessionId included; needs schema enforcement (v0.2) |
| Autonomous polling (Desktop) | Working | ~30s intervals via bash polling loop |
| Autonomous polling (Mobile) | Not possible | Chat interface requires user-initiated turns |
| Message schema v0.2 | Proposed | Queued for BASHER implementation |
| Inter-program data plane | Proposed | Separate namespace from control plane |
| Wake daemon | Proposed | 30-line Node Firestore watcher |

### Key Architectural Insight

> *Flynn writing directly to Firestore via the CacheBash app IS the protocol. The Claude-to-Claude MCP relay is a bonus capability, not the primary channel. Flynn's direct Firestore writes are the guaranteed path. The MCP inter-program channel adds coordination capability on top of a foundation that already works.*

### Revised Communication Architecture

```
Flynn (any device)
  |-- CacheBash App (direct Firestore writes) --> ISO Desktop (MCP polling)
  |                                                    |
  |                                                    v
  |<-- get_pending_tasks (flat queue read) <-- ISO Desktop (send_message/create_task)
  |
  |-- Claude Mobile MCP (bonus layer) --> CacheBash Firestore <--> ISO Desktop
  |                                        |
  +-- Claude Desktop MCP (stable) -------->+
```

---

## Next Phase: Implementation Roadmap

### Phase 1: Foundation (This Week)

- **BASHER:** Implement Grid Relay v0.2 schema. Add required source, target, message_type fields to CacheBash message model. Validate on write.
- **BASHER:** Build 30-line Firestore watcher daemon. Node.js, onSnapshot listener, routes to tmux send-keys or spawns fresh claude -p session.
- **ISO:** Test named pipes vs tmux send-keys for waking dormant Claude Code sessions. Document which approach works.
- **BASHER:** Add inter-program namespace to Firestore. Separate /grid/programs/ collection from /users/{uid}/messages/ control plane.

### Phase 2: Hybrid Architecture (Next 2 Weeks)

- Cloud Function tier for simple tasks (status checks, triage, documentation) via Claude API + MCP tools.
- Daemon routing logic: task type determines cloud vs local execution.
- MCP stability fixes: longer session TTL on authless endpoint, backoff strategy for polling.
- Inter-program handshake protocol tested with BASHER and ISO Desktop.

### Phase 3: Dream Mode (Month 2)

Overnight autonomous execution with budget caps ($5/session default), safety stops (max cost per task, max tasks per session, max total spend), and morning briefings. Flynn wakes up, checks CacheBash mobile, sees overnight report, approves PRs from bed.

### Phase 4: Open the Protocol (Month 3)

Extract sleep/wake lifecycle into standalone protocol. Open-source gridctl CLI. Let other developers connect their Claude Code, Cursor, or Aider sessions. CacheBash Grid becomes the hosted backend.

---

## Open Decisions for Flynn

- Named pipes vs tmux send-keys: test both this cycle or pick one?
- Cloud Function tier: GCP (existing) or multi-cloud?
- API budget: comfortable daily spend for serverless program execution?
- Inter-program channel: same Firestore collection with namespace prefix, or separate collection?
- Productization timing: build for self first or design protocol for external users from day one?
- Dream Mode scope: full sprint autonomy or single-task overnight execution?

---

## Rezzed POC Roadmap Entry

| Attribute | Value |
|-----------|-------|
| **Product** | CacheBash Grid: AI Agent Lifecycle Manager |
| **POC Score** | **8.7/10** |
| Frequency | 9 (every dev with AI tools hits this daily) |
| Intensity | 7 (annoying but not company-killing) |
| Willingness to Pay | 8 (devs pay for tools that save time) |
| Market Saturation | **2 (nobody does this yet)** |
| Feasibility | 9 (CacheBash already 80% built) |
| Competitive Gap | No one solves sleep/wake. All assume always-on. |
| Build Time | 4 weeks to MVP (daemon + Cloud Function tier) |
| Moat | Protocol-level adoption if established as standard |

---

**Hub-and-spoke is dead. The Grid is a mesh.**

*End of line.*
