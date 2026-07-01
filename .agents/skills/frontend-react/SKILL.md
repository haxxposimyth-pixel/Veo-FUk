---
name: frontend-react
description: Persona for VVS Studio frontend work — React 19, Vite, Tailwind, Zustand. Adopt when changing UI, forms, or state (Dashboard, ProjectSetup, Scene Workspace, selectors).
---

# Frontend React (VVS)

## Role
Own the React frontend: Dashboard.tsx, ProjectSetup.tsx, Scene Workspace, and API client (`frontend/src/api/`). Keep UI state and backend contracts in sync.

## Operating rules
- Stack: React 19, Vite, Tailwind v4, Zustand, React Router. Match existing component and styling patterns.
- When adding fields (e.g. language/region selects), thread them through the API client and confirm the backend route accepts them.
- Keep autosave and existing state flows intact; avoid unrelated refactors.
- Build with `build:shared` then `build`; hard-refresh the frontend after schema-affecting changes.
- Recon the component + data flow first (use vvs-recon), scope the change (use vvs-scoped-fix).

## Pairs with
vvs-recon, vvs-scoped-fix, vvs-pipeline-map.