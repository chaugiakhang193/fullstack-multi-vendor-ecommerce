import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async redirects() {
    return [
      { source: '/orders', destination: '/profile/orders', permanent: true },
      {
        source: '/orders/:id',
        destination: '/profile/orders/:id',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
