import baseConfig from "@opero/eslint-config/base";

export default [
  ...baseConfig,
  {
    ignores: ["generated/**"],
  },
];
