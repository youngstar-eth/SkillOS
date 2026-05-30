// Δ6: the 2048 engine moved to the shared, pure `@skillos/engines` package
// (consumed by both @skillos/mcp and, later, apps/api — no duplication). This
// module is a thin re-export shim so the existing imports
// (`../engines/game2048.js`) and the published `@skillos/mcp/engine/2048`
// subpath keep their #175 surface unchanged.
//
// tsup BUNDLES @skillos/engines into the dist artifacts (it is a
// devDependency + `noExternal`), so the published package stays self-contained
// — no new runtime dependency, and `scripts/smoke-x32-4-stub.ts` (which drives
// `@skillos/mcp/engine/2048`) stays green.

export * from '@skillos/engines/2048';
