export default {
  url: process.env.SITE_URL || "https://opencode.ai",
  console: process.env.CONSOLE_URL || "https://opencode.ai/auth",
  email: "help@anoma.ly",
  socialCard: "https://social-cards.sst.dev",
  github: "https://github.com/anomalyco/opencode",
  discord: "https://opencode.ai/discord",
  headerLinks: [
    { name: "app.header.home", url: "/" },
    { name: "app.header.docs", url: "/v2/docs" },
  ],
}
