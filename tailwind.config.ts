import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        node: {
          contact: "hsl(var(--node-contact))",
          "contact-accent": "hsl(var(--node-contact-accent))",
          text: "hsl(var(--node-text))",
          "text-accent": "hsl(var(--node-text-accent))",
          choice: "hsl(var(--node-choice))",
          "choice-accent": "hsl(var(--node-choice-accent))",
          rating: "hsl(var(--node-rating))",
          "rating-accent": "hsl(var(--node-rating-accent))",
          other: "hsl(var(--node-other))",
          "other-accent": "hsl(var(--node-other-accent))",
          condition: "hsl(var(--node-condition))",
          "condition-accent": "hsl(var(--node-condition-accent))",
          "variable-op": "hsl(var(--node-variable-op))",
          "variable-op-accent": "hsl(var(--node-variable-op-accent))",
          ending: "hsl(var(--node-ending))",
          "ending-accent": "hsl(var(--node-ending-accent))",
          integration: "hsl(var(--node-integration))",
          "integration-accent": "hsl(var(--node-integration-accent))",
          webhook: "hsl(var(--node-webhook))",
          "webhook-accent": "hsl(var(--node-webhook-accent))",
          analytics: "hsl(var(--node-analytics))",
          "analytics-accent": "hsl(var(--node-analytics-accent))",
          whatsapp: "hsl(var(--node-whatsapp))",
          "whatsapp-accent": "hsl(var(--node-whatsapp-accent))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
