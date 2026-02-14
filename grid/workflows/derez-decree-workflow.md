# Rezzed: Derez Decree Workflow Spec v1.0

> *"End of Line."* — MCP

**Date:** 2026-02-13
**Author:** ISO (with Christian)
**Status:** Ready for implementation
**Reference:** Grid Blueprint v1.3

---

## Overview

The **Derez Decree** is the formal process for evaluating whether a product, feature, POC, or approach should be killed, pivoted, or rebuilt. It replaces ad-hoc "should we keep this?" discussions with a structured, evidence-based evaluation.

**Naming etymology:** "Derez" = destroy/delete in Tron. A "Decree" is a formal ruling. The Derez Decree is the Grid's official death warrant — or reprieve.

---

## When to Invoke

ISO invokes the Derez Decree workflow when:

1. A POC has reached its evaluation window deadline
2. A product's metrics have stagnated or declined for 2+ cycles
3. Flynn requests a formal evaluation of any product or feature
4. GRIDBOT flags a product as cost-negative with no growth trajectory
5. A competitor launches something that fundamentally changes our positioning
6. A CASP review returns a REJECT verdict on a major deliverable

**Who can trigger:** ISO (standard), Flynn (override), GRIDBOT (automated flag)

---

## Workflow

```
ISO invokes Derez Decree on [target]
  │
  ├── SARK: Technical Autopsy (Clean-Context)
  │     Input: codebase, test suite, performance data, tech debt inventory
  │     Output: Technical Health Score (0-100) + detailed findings
  │
  ├── CASP: Strategic Assessment (Clean-Context)
  │     Input: product metrics, market data, competitive landscape, roadmap alignment
  │     Output: Strategic Viability Score (0-100) + detailed findings
  │
  └── ISO: Synthesize into Derez Decree
        Input: SARK report + CASP report
        Output: Decree document with verdict
```

### SARK's Technical Autopsy

SARK evaluates in a **fresh context** — no build history, no emotional attachment:

| Dimension | Weight | What SARK Evaluates |
|-----------|--------|---------------------|
| Code Quality | 20% | Test coverage, code complexity, maintainability index, lint score |
| Tech Debt | 20% | Known bugs, workarounds, outdated dependencies, architectural shortcuts |
| Performance | 15% | Response times, error rates, resource utilization, scalability ceiling |
| Maintainability | 15% | Can a new developer (or program) pick this up? Documentation quality? |
| Security Posture | 15% | DUMONT's last review, open vulnerabilities, compliance gaps |
| Reusability | 15% | What components could be extracted to `/libs/` if we derez the product? |

**Output Format:**
```json
{
  "autopsy_id": "uuid",
  "target": "product/feature name",
  "technical_health_score": 62,
  "dimensions": {
    "code_quality": {"score": 75, "findings": ["string"]},
    "tech_debt": {"score": 45, "findings": ["string"]},
    "performance": {"score": 70, "findings": ["string"]},
    "maintainability": {"score": 55, "findings": ["string"]},
    "security_posture": {"score": 80, "findings": ["string"]},
    "reusability": {"score": 50, "salvageable_components": ["string"]}
  },
  "recommendation": "DEREZ | REFRESH | REBUILD",
  "confidence": 78
}
```

### CASP's Strategic Assessment

CASP evaluates in a **fresh context** — market reality, not builder optimism:

| Dimension | Weight | What CASP Evaluates |
|-----------|--------|---------------------|
| Market Fit | 25% | Are users actively using this? Would they pay? Evidence of demand? |
| Revenue Potential | 20% | Current revenue, growth trajectory, monetization clarity |
| Competitive Position | 15% | Are competitors gaining? Is our advantage sustainable? |
| Strategic Alignment | 15% | Does this still align with Rezzed's roadmap and Manifesto? |
| Opportunity Cost | 15% | What else could we build with these resources? |
| User Engagement | 10% | Retention, NPS, support ticket volume, feature usage |

**Output Format:**
```json
{
  "assessment_id": "uuid",
  "target": "product/feature name",
  "strategic_viability_score": 48,
  "dimensions": {
    "market_fit": {"score": 40, "evidence": ["string"]},
    "revenue_potential": {"score": 55, "evidence": ["string"]},
    "competitive_position": {"score": 50, "evidence": ["string"]},
    "strategic_alignment": {"score": 70, "evidence": ["string"]},
    "opportunity_cost": {"score": 35, "evidence": ["string"]},
    "user_engagement": {"score": 30, "evidence": ["string"]}
  },
  "recommendation": "DEREZ | REFRESH | REBUILD",
  "confidence": 72
}
```

---

## Verdict Matrix

ISO combines SARK and CASP scores into a combined score and maps to verdict:

```
Combined Score = (SARK Technical Health × 0.4) + (CASP Strategic Viability × 0.6)

IF combined_score >= 70 → NO ACTION (product is healthy, decree not warranted)
IF combined_score 50-69 → REFRESH (significant pivot — change positioning, features, or target market)
IF combined_score 30-49 → REBUILD (start over with lessons learned, salvage reusable components)
IF combined_score < 30  → DEREZ (kill it, extract salvageable components to /libs/, move to Graveyard)
```

**Override conditions:**
- If CASP strategic score < 20 regardless of technical health → DEREZ (no market = no product)
- If SARK technical score < 20 regardless of strategic viability → REBUILD (too broken to fix)
- Flynn can override any verdict (Flynn-reserved decision)

---

## Derez Decree Document (Final Output)

```json
{
  "decree_id": "uuid",
  "target": "product/feature name",
  "date": "2026-02-13",
  "invoked_by": "ISO | Flynn | GRIDBOT",
  "sark_autopsy": { "...full autopsy..." },
  "casp_assessment": { "...full assessment..." },
  "combined_score": 42,
  "verdict": "DEREZ | REFRESH | REBUILD | NO_ACTION",
  "rationale": "string — plain language summary of why this verdict",
  "salvageable_components": ["list of components to extract before derez"],
  "lessons_learned": ["key takeaways for the Derez Graveyard"],
  "approved_by": "Flynn | ISO (if within autonomy threshold)",
  "executed_by": "RAM (graveyard entry) + BASHER (component extraction)"
}
```

---

## Post-Decree Actions

### On DEREZ:
1. RAM creates Derez Graveyard entry with full decree document
2. BASHER extracts salvageable components to `/libs/` (if any)
3. RAM updates Product Registry (status: `derezzed`)
4. GRIDBOT stops monitoring the product
5. ISO notifies Flynn with summary
6. RAM captures lessons learned for future reference

### On REFRESH:
1. ISO creates a new Flynn's Bridge intake for the refreshed product
2. ALAN reviews architecture for pivot feasibility
3. Original decree archived in Lessons Learned
4. Product Registry updated with new direction

### On REBUILD:
1. RAM creates Derez Graveyard entry for the old version
2. BASHER extracts salvageable components
3. ISO creates a new Flynn's Bridge intake from scratch
4. New product inherits lessons from the old version's decree
5. Product Registry: old version → `derezzed`, new version → `ideation`

---

## Cadence

- **POC Gauntlet deadline** — Automatic Derez Decree when evaluation window expires
- **Quarterly review** — ISO reviews all active products against health metrics; flags candidates
- **On-demand** — Flynn or ISO can invoke at any time
- **Automated** — GRIDBOT flags products with 3+ consecutive months of declining metrics

---

*End of Line.*
