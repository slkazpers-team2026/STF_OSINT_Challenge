/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    const cspHeader = `
      default-src 'self';
      script-src 'self' 'unsafe-eval' 'unsafe-inline' https://apis.google.com https://www.gstatic.com;
      style-src 'self' 'unsafe-inline';
      img-src 'self' data: https://*.googleusercontent.com;
      font-src 'self' data:;
      connect-src 'self' https://*.googleapis.com https://securetoken.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com;
      frame-src 'self' https://osint-ctf-platform.firebaseapp.com;
    `;
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: cspHeader.replace(/\s{2,}/g, ' ').trim(),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
