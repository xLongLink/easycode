---
name: views
description: Validate LongLink Solution View quality and SDK component ergonomics, including consistent spacing, presentation, accessible interaction, and unnecessary HTML, CSS, DOM, or component-behavior workarounds. Use for View/component reviews and library coverage assessments, not general cleanup or security audits.
---

# Views

## Task and scope

- DO default to read-only assessment. Change files only when the user explicitly authorizes implementation; implement only approved findings.
- DO validate both Solution View usage and whether the supplied SDK component API makes consistent interfaces practical.
- DO inspect relevant Solution JSX, component implementations, runtime exports, documentation/types, scaffold examples, and existing tests.
- DO distinguish isolated Solution `.jsx` Views from trusted Platform `.tsx` pages. DON'T require Views to import Astryx, AppShell, Tailwind, or another frontend stack.
- DO preserve legitimate business JavaScript: domain calculations, data mapping, conditional actions, local interaction state, workflow callbacks, and scoped API requests.
- DO keep checks advisory and evidence-based. DON'T prohibit a necessary workaround without a supported alternative; report the missing capability and retain the current behavior pending a decision.
- DON'T require full Astryx API parity, remove useful wrappers merely because they adapt APIs, or invent components and props.

## Establish the supported contract

The paths below are relative to the LongLink repository root, not this skill's directory. DO locate the repository root before reading them.

1. DO read applicable `AGENTS.md` files and inspect the working tree.
2. DO establish exposed components from `web/src/views/components.ts` and supplied hooks/functions from `web/src/views/runtime.tsx`.
3. DO inspect relevant implementations in `web/src/components/ui/`, shared behavior such as `web/src/components/Form.tsx`, and the host bridge in `web/src/components/JsxView.tsx` when relevant.
4. DO compare implementation and exports with `sdk/longlink/.static/jsx/frontend.d.ts`, `components.yml`, and `sdk/longlink/cli/docs.py`. DO inspect representative usage in `sdk/longlink/.static/new/src/views/` and any Solution under review.
5. DO follow Astryx discovery in order, running every command from `web/`:

    ```bash
    vp exec astryx build "<interface pattern>"
    vp exec astryx template <suggested-name>
    vp exec astryx component <relevant-name>
    ```

    DO print templates as reference rather than scaffold files during review. DO inspect each relevant component's documented props and behavior. Consult `vp exec astryx docs layout`, its spacing/responsive sections, and token guidance as needed.

6. DO use Astryx as the composition, spacing, accessibility, and reusable-behavior reference. DON'T copy template custom styles or package imports into Views. If discovery documentation differs from the installed implementation, DO report the discrepancy rather than assume an API exists.

## Core checks

### 1. Supported composition and escape hatches

- DO investigate raw HTML, package imports, custom CSS, `style`, `className`, direct browser APIs, and DOM manipulation used to bypass supplied presentation or interaction components.
- DO check the actual export and prop contract before identifying an undocumented component or prop.
- DO distinguish misuse of an available capability from a missing library API. An Astryx capability is not automatically available to a View.
- DO distinguish library-internal markup and styling from View escape hatches. Investigate wrapper overrides tied to Astryx's internal DOM as maintainability risks, not automatic View violations.

### 2. Spacing and presentation ownership

- DO check that containers own padding and child gaps, with aligned content gutters and intentional contrast between tight grouping and section spacing.
- DO check consistent control sizes, semantic appearance variants, appropriate density, and the weakest useful grouping container.
- PREFER supported `Stack`, `Grid`, and `Layout` props and contextual defaults over redundant nested containers or repeated presentation snippets.
- DO investigate repeated dialog dimensions, viewport calculations, field arrangements, and appearance recipes as candidates for library-owned defaults or presets.
- DON'T reject documented numeric sizing props or CSS-valued sizing props categorically. Distinguish necessary region budgets from duplicated implementation policy.
- DO use `Card` appropriately for widgets, galleries, or settings groups rather than wrapping individual dense rows.

### 3. Reusable interaction ownership

DO check whether Views unnecessarily reimplement behavior already supplied by:

- `Button`: asynchronous loading and duplicate-click prevention;
- `Form` and `FormStep`: serialization, validation, submission errors, pending state, persistent step fields, and navigation;
- `Tabs` and `Menu`: selection and navigation;
- `FileViewer`: file preview and download capabilities;
- `useApi`: initial loading, error, and retry boundaries;
- supplied scoped request and navigation functions: Solution operations without host/browser plumbing.

DO verify each behavior in the current implementation before recommending replacement. DON'T treat ordinary hooks, callbacks, conditions, or API requests as workarounds by themselves.

DO assess missing field-layout, table pagination/selection/sorting, and workflow extension APIs only where relevant callers need them. For example, manually assembled table pagination can reveal a library gap; page state and server query construction remain legitimate Solution logic. PREFER a small coherent API over exposing every Astryx plugin.

### 4. Layout, accessibility, and state lifetimes

- DO check bounded scrolling, overflow, dialog sizing, and explicit narrow-width behavior against supported props. DON'T claim responsive adaptation where none is implemented.
- DO check accessible labels, keyboard semantics, focus behavior, non-color status meaning, and consistent semantics for actions versus navigation.
- DO check draft preservation and intentional resets across tabs, menus, dialogs, and form steps; don't substitute hiding for unmounting without tracing the behavior.
- DO verify recommended status and feedback components are actually exposed. DON'T prescribe an unavailable component as the immediate fix.
- DON'T treat hidden or disabled UI as server authorization. Preserve server-owned business rules and validation.

### 5. Contract consistency and ergonomics

- DO trace findings through implementations, runtime exports, generated types/docs, scaffold examples, packaging, and relevant existing tests.
- DO identify discrepancies between instructions and supported APIs, and between shared component behavior and what the View wrapper exposes.
- DO distinguish intentional simplification from an omission forcing concrete consumer workarounds. DON'T add capabilities solely for hypothetical parity.
- DO identify the smallest complete proposed change, including any generated outputs and callers affected by a public API change.

## Actionable findings

For each substantive finding, DO report:

- **Classification:** View misuse, library gap, documentation mismatch, or intentional limitation needing a decision.
- **Evidence:** Exact current file paths and line ranges, concrete caller usage, and the supported contract or relevant Astryx comparison.
- **Impact:** Visual consistency, usability, accessibility, repeated presentation policy, or duplicated interaction mechanics.
- **Recommendation:** The smallest complete change, supported alternative where one exists, affected callers/contracts, and compatibility considerations.
- **Confidence and verification:** What source tracing or existing checks establish and what remains uncertain.

DO rank repeated and user-visible problems first. DO separate observed workarounds from hypothetical coverage opportunities. DON'T invent findings to fill a quota or describe ordinary business JavaScript as a violation. Where no supported alternative exists, DO recommend a library improvement rather than require a broken or less usable View.

## Verification

- During read-only review, DON'T run generators, builds, formatters, setup commands, or other checks that write files. Report checks that would be needed after implementation.
- DO use source inspection and permitted code-level checks. DON'T use browsers or browser automation.
- After authorized implementation, DO follow repository formatting, linting, type checking, and relevant existing-test requirements. DON'T add tests unless requested.
- DO review the final diff for unrelated edits, altered public contracts, and new repeated presentation policy. DO recheck the working tree and report verification results accurately.
- DON'T claim static checks prove visual beauty or responsive rendering; state the limits of code-level assessment.
