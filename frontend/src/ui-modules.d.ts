// The shadcn/ui primitives under components/ui are untyped .jsx (framework-agnostic
// generated boilerplate). Vite/esbuild transpiles them at build time; for type
// checking they are treated as opaque modules so their loose forwardRef inference
// does not fight strict TS in the app code that consumes them.
declare module "@/components/ui/*";
