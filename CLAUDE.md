# CLAUDE.md

## Project Overview
- **Stack**: Svelte 5 + TypeScript + Vite
- **Styling**: Tailwind CSS + DaisyUI
- **Visualization**: D3.js
- **State Management**: Svelte Stores (`src/stores`)

## Commands
- **Dev Server**: `bun run dev`
- **Build**: `bun run build`
- **Preview**: `bun run preview`
- **Type Check**: `bun run check`

## Directory Structure
- `src/components/`: UI components
- `src/stores/`: Svelte stores for state management
- `src/services/`: Data fetching and logic
- `src/types/`: TypeScript type definitions
- `src/lib/`: Shared libraries/utilities

## Coding Standards
- Use TypeScript for all logic (`.ts` and `<script lang="ts">`).
- Use Tailwind CSS for styling.
- Prefer functional components and Svelte 5 syntax.
- Ensure type safety; define interfaces/types in `src/types`.
