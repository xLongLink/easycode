import config from "./vite-lint.config.mjs"

export default {
  lint: {
    ...config.lint,
    rules: {
      "anti-slop/no-array-filter-map": "error",
      "anti-slop/no-reduce-accumulator-copy": "error",
    },
  },
}
