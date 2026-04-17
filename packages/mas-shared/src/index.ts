// @mas/shared — MAS monorepo common surface.
// Prefer sub-path imports (`@mas/shared/hooks`, `@mas/shared/contracts`) in
// application code. This barrel is here for convenience and for the rare
// consumer that wants everything; tree-shaking picks what's actually used.

export * from "./contracts";
export * from "./supabase";
export * from "./api";
export * from "./hooks";
export * from "./components";
export * from "./game";
export * from "./miniapp";
export * from "./brand";
