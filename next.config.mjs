/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["*.app.github.dev", "localhost:3000", "localhost:3001"],
    },
  },
};

export default nextConfig;
