import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans JP"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        ink: "#14171C",
        muted: "#59606B",
        subtle: "#6B7280",
        ground: "#F4F5F7",
        line: { DEFAULT: "#DDE1E6", soft: "#E6E9ED" },
        field: "#C9CED6",
        accent: { DEFAULT: "#2F4BD6", hover: "#1E35A8" },
        danger: { DEFAULT: "#B42318", line: "#E5B4B4" },
      },
      spacing: {
        gutter: "clamp(16px, 4vw, 40px)",
      },
    },
  },
  plugins: [],
} satisfies Config;
