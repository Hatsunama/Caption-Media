// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "scripts/*"],
    rules: {
      // Gesture responders intentionally keep the latest callbacks in refs, and
      // expo-video's player is a documented mutable native object.
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
    },
  }
]);
