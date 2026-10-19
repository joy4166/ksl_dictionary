/** @type {import('next').NextConfig} */
const nextConfig = {
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
