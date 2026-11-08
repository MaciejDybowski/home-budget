import vue from "eslint-plugin-vue";
import ts from "typescript-eslint";

export default [
  { ignores: ["dist/**", "dist-demo/**", "dist-site/**", "dist-pages/**", "test-results/**", "node_modules/**", "public/**"] },
  ...ts.configs.recommended,
  ...vue.configs["flat/essential"],
  {
    files: ["**/*.vue"],
    languageOptions: { parserOptions: { parser: ts.parser } },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "vue/multi-word-component-names": "off",
    },
  },
];
