/** @type {import('next').NextConfig} */
module.exports = {
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/game/index.html" }],
      afterFiles: [],
      fallback: [],
    };
  },
};
