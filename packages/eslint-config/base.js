import js from "@eslint/js";
import tseslint from "typescript-eslint";

const baseConfig = tseslint.config(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "generated/**",
      "src/generated/**",
      ".next/**",
      "node_modules/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);

export default baseConfig;
