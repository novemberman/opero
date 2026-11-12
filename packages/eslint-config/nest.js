import baseConfig from "./base.js";

const nestConfig = [
  ...baseConfig,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
];

export default nestConfig;
