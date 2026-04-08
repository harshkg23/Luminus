/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    "@tailwindcss/postcss": {
      // Next/webpack + some Windows setups: skip Lightning CSS in dev to avoid native
      // `.node` resolution issues; keep optimization for production builds.
      optimize: process.env.NODE_ENV === "production",
    },
  },
};

export default config;
