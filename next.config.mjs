/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["garu-ko"],
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/garu-ko/**/*"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "sldict.korean.go.kr",
      },
      {
        protocol: "https",
        hostname: "sldict.korean.go.kr",
      },
    ],
  },
};

export default nextConfig;
