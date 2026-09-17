import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        muted: "#68738a",
        line: "#e8ebf0",
        cream: "#fbfcfe",
        coral: "#ff6157",
        "coral-dark": "#e94b44",
        sky: "#eef7ff",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Arial", "sans-serif"],
      },
      boxShadow: {
        card: "0 20px 50px rgba(31, 48, 82, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
