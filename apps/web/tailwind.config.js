/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Core dark palette — professional developer tool aesthetic
        surface: {
          0: '#06060a',   // Deepest background
          1: '#0a0a0f',   // Page background
          2: '#111118',   // Card background
          3: '#1a1a24',   // Elevated surface
          4: '#222233',   // Hover state
          5: '#2a2a3d',   // Active state
        },
        border: {
          DEFAULT: '#1e1e2e',
          subtle: '#161622',
          strong: '#2a2a3d',
          accent: '#3b82f620',
        },
        accent: {
          DEFAULT: '#3b82f6',
          hover: '#2563eb',
          muted: '#3b82f620',
          text: '#60a5fa',
        },
        // Status colors — restrained, not cartoonish
        status: {
          healthy: '#22c55e',
          warning: '#eab308',
          critical: '#ef4444',
          investigating: '#8b5cf6',
          info: '#06b6d4',
        },
        // Severity badge colors
        severity: {
          critical: { bg: '#ef44441a', text: '#fca5a5', border: '#ef444440' },
          high: { bg: '#f973161a', text: '#fdba74', border: '#f9731640' },
          medium: { bg: '#eab3081a', text: '#fde047', border: '#eab30840' },
          low: { bg: '#22c55e1a', text: '#86efac', border: '#22c55e40' },
        },
        text: {
          primary: '#e4e4ed',
          secondary: '#9ca3b0',
          tertiary: '#6b7280',
          muted: '#8290a3',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'shimmer': 'linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent)',
      },
    },
  },
  plugins: [],
};
