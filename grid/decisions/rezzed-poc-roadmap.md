# Rezzed: POC Roadmap

> *"Always capture, never lose ideas. Subtraction happens during review."*

**Last Updated:** 2026-02-13
**Status:** Living document — ideas added automatically as they surface in conversation

---

## How This Works

Every product idea, opportunity, or "what if" that surfaces in conversation gets logged here immediately. No filtering on intake — that's the Derez Graveyard's job later. During roadmap review sessions, Christian and ISO evaluate each idea through the POC Gauntlet and either promote it to active development, keep it in the backlog, or derez it with a documented reason.

### Idea Status Key

| Status | Meaning |
|--------|---------|
| 💡 **Captured** | Raw idea, needs Flynn's Bridge intake |
| 🔬 **Evaluating** | In POC Gauntlet — being tested |
| 🚀 **Active** | Approved, in build pipeline |
| ⏸️ **Backlog** | Valid but not prioritized |
| 💀 **Derezzed** | Tested and killed (moved to Derez Graveyard with reason) |

---

## Active Products (In Development)

### 1. CacheBash
- **Status:** 🚀 Active — Phase 1 priority
- **What:** Task coordination system with Firestore integration for AI agent orchestration
- **Who:** Developers and teams using Claude Code / AI agents for development
- **Where:** Three Bears Data / Rezzed internal use → external product
- **Notes:** Fix interrupt messages + CC consistency first. This is both product AND internal infrastructure.
- **Captured:** Pre-existing

### 2. Problems Finder
- **Status:** 🚀 Active (maturity TBD)
- **What:** Autonomous system for discovering SaaS pain points and building MVP solutions
- **Who:** Entrepreneurs, product teams looking for validated opportunities
- **Where:** Rezzed product pipeline
- **Notes:** One of two products that could power BECK's discovery pipeline once complete
- **Captured:** Pre-existing

---

## POC Backlog (Ideas Awaiting Evaluation)

### 3. White-Label AI Coaching Platform → Moved to #8 (refined with first customer)

### 4. [Product Name TBD — Discovery Pipeline Product #1]
- **Status:** 💡 Captured
- **What:** One of two ideation-stage products Christian mentioned that would power BECK's discovery pipeline
- **Notes:** Details not yet provided. Christian to brief during Phase 3.
- **Captured:** 2026-02-13

### 5. [Product Name TBD — Discovery Pipeline Product #2]
- **Status:** 💡 Captured
- **What:** Second of two ideation-stage products that would power BECK's discovery pipeline
- **Notes:** Details not yet provided. Christian to brief during Phase 3.
- **Captured:** 2026-02-13

### 6. Creator Launch Kit (Working Title)
- **Status:** 💡 Captured
- **What:** End-to-end productized workflow for aspiring content creators — from concept to channel launch. Idea generation, supply/equipment sourcing with affiliate links, scripting, branding (logo, thumbnails, channel art), editorial calendar, growth strategy, analytics setup. All from a single intake transcript/conversation.
- **Inspiration:** Christian's scenario of helping a young man launch a Lego building YouTube channel. The Grid can already do this with existing programs — the product is packaging that workflow for self-serve.
- **Rezzed Advantage:** Flynn's Bridge IS the intake. CASTOR + QUORRA + ALAN + PIXEL + YORI already cover the workstreams. Productize the orchestration.
- **Possible Verticals:**
  - YouTube channel launches (tutorials, reviews, creative content)
  - Podcast launches (similar workflow, different medium)
  - Newsletter/blog launches
  - Small business launch kits (branding + content + marketing in a box)
- **Revenue Model:** Tiered SaaS — free basic plan (idea generation + basic branding), paid tiers for full content calendar, scripting, growth strategy, analytics. Affiliate revenue from supply/equipment links.
- **Competitive Note:** Existing tools (TubeBuddy, VidIQ) focus on SEO/analytics. Nobody packages the full creative-to-launch pipeline as AI-powered service.
- **Captured:** 2026-02-13
- **Next Step:** Flynn's Bridge intake when ready to evaluate

### 7. Balance by Lindsay (Client Project → Product R&D)
- **Status:** 💡 Captured
- **What:** AI-powered holistic health coaching business for mothers and women (fertility, postpartum, hormone balancing, wellness). Six verticals: 1:1 coaching, group coaching, content/media brand, community platform, digital product/app, affiliate partnerships. Full project brief already completed.
- **Strategic Value to Rezzed:** This is the Productization Engine in action. Build it as a client project; extract reusable components into the White-Label AI Coaching Platform. Every piece — intake-to-plan pipeline, tiered community architecture, content calendar generator, freemium gating, payment integration — becomes a shared library.
- **Grid Programs Involved:** Nearly the full roster — ISO (orchestration), ALAN (architecture), BASHER (builds), QUORRA (UX/branding — flower-tier system), GEM (frontend), RINZLER (backend/API), CASTOR (content — 20-week blog series, social, recipes), SAGE (onboarding/docs), PIXEL (affiliate/influencer strategy), YORI (analytics), SARK (testing), DUMONT (security — health data is sensitive)
- **Key Insight:** Flynn's Bridge intake pattern IS the product's core UX. Intake transcript → AI-generated personalized wellness plan. Same architecture works for any coaching vertical.
- **Existing Assets:** Detailed 6-vertical project brief, prior blog content in Lindsey's voice, Facebook presence ("Unbalanced by Lindsay"), domain(s), follow-up questionnaire sent
- **Revenue Model (for Lindsey):** ~$400/month per coaching client, tiered community subscriptions, freemium app with ads on free tier, affiliate revenue from wellness brands (Mudwater, UDWTR, Armra, etc.)
- **Revenue Model (for Rezzed):** Client project fee + extracted reusable components feed White-Label Coaching Platform
- **Captured:** 2026-02-13
- **Next Step:** Christian decides if this enters active pipeline or stays in backlog until CacheBash ships

### 8. White-Label AI Coaching Platform (Refined — was idea #3)
- **Status:** 💡 Captured (upgraded — now has a concrete first customer)
- **What:** Configurable AI coaching engine — same core (LLM + structured intake + personalized plan generation + community + content + analytics) with swappable domain knowledge per vertical. Balance by Lindsay is the first vertical and proof of concept.
- **Inspiration:** [Coach by CareerVillage](https://www.aicareercoach.org/) + Balance by Lindsay project brief
- **Architecture Pattern:** Flynn's Bridge intake → AI plan generation → tiered community → content engine → analytics. Domain knowledge layer swaps per vertical; everything else is shared infrastructure.
- **Validated Verticals (concrete demand exists):**
  - Wellness/health coaching (Balance by Lindsay — first customer EXISTS)
  - Career coaching (CareerVillage model proves market)
  - Content creator coaching (Creator Launch Kit)
- **Speculative Verticals:**
  - Financial coaching / real estate investing education
  - Technical interview prep / enterprise upskilling
  - Life coaching / executive coaching
- **Extraction Path:** Build for Lindsey → extract intake pipeline to `/libs/coaching-intake` → extract plan generator to `/libs/plan-engine` → extract community tier system to `/libs/tiered-community` → package as configurable platform
- **Competitive Note:** Nobody offers the full stack (intake → plan → community → content → analytics) as a white-label for coaches. Existing tools are point solutions (Calendly, Circle, Substack). This is the integrated play.
- **Captured:** 2026-02-13 (refined from idea #3 with Balance by Lindsay as first customer)
- **Next Step:** Ships naturally as byproduct of Balance by Lindsay build — just disciplined extraction via RAM's Extraction Trigger

---

## Derez Graveyard

*Empty — nothing derezzed yet. That's fine. Ideas need to exist before they can be tested.*

---

## Review Cadence

- **Ad-hoc:** Ideas captured as they surface (automatic)
- **Monthly:** Christian + ISO review full roadmap, run POC Gauntlet on Captured items, reprioritize
- **Per Product Ship:** After each product launches, reassess backlog — shipping changes what's possible and what's valuable

---

*End of Line.*
