# ADR 0003: Vite React TypeScript frontend

## Status

Accepted for MVP.

## Decision

Build the target UI with Vite, React, and TypeScript. Port source UI behavior away from Next.js assumptions.

## Consequences

- Remove `next/link`, `next/navigation`, route handlers, and `"use client"` assumptions during the frontend port.
- Components should call typed command wrappers rather than raw `invoke(...)` directly.
- Browser-only development mocks may exist, but they should be fixture-backed and Tauri remains the authoritative integration path.
