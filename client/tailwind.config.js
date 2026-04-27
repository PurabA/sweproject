/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Source Sans 3"', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      colors: {
        clinical: {
          50: '#f0f7fc',
          100: '#e0eef8',
          200: '#b9d4ed',
          300: '#8eb8e0',
          400: '#5c93ca',
          500: '#3d78b8',
          600: '#2d5f9a',
          700: '#1e4a7d',
          800: '#163d68',
          900: '#0f2942',
        },
      },
      boxShadow: {
        soft: '0 1px 3px 0 rgb(15 41 66 / 0.06), 0 1px 2px -1px rgb(15 41 66 / 0.06)',
      },
    },
  },
  plugins: [],
};
