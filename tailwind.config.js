/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,tsx,ts}'],
  theme: {
    extend: {
      colors: {
        primary: '#6c5ce7',
        sideBg: '#fcfcfd',
      },
    },
  },
  plugins: [],
};
