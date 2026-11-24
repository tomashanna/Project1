import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
  ]),
  {
    rules: {
      // Pages fetch data in effects (load → setState). That is flagged by the
      // React Compiler rule; tracked for migration to a data-fetching layer
      // (SWR/React Query). Keep visible as warnings until then.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
