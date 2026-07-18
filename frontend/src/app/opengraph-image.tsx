import { ImageResponse } from 'next/og';

// OG image động (1200×630) cho toàn site — hiện khi paste link vào Zalo/Messenger/
// LinkedIn... Render bằng code (next/og), không cần file ảnh thiết kế sẵn.
// Các route con không tự khai opengraph-image sẽ dùng chung ảnh này.

export const alt = 'Giang Kha — Sàn thương mại điện tử Multi-Vendor';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '90px',
        background:
          'linear-gradient(135deg, #4f46e5 0%, #7c3aed 55%, #6d28d9 100%)',
        color: '#ffffff',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 26px',
          border: '2px solid rgba(255,255,255,0.45)',
          borderRadius: '999px',
          fontSize: '26px',
          fontWeight: 700,
          letterSpacing: '2px',
          marginBottom: '28px',
        }}
      >
        SÀN TMĐT MULTI-VENDOR
      </div>

      <div
        style={{
          display: 'flex',
          fontSize: '138px',
          fontWeight: 900,
          letterSpacing: '-5px',
          lineHeight: 1,
        }}
      >
        Giang Kha
      </div>

      <div
        style={{
          display: 'flex',
          fontSize: '44px',
          fontWeight: 500,
          marginTop: '26px',
          opacity: 0.92,
        }}
      >
        Mua sắm thông minh, giá cả tốt nhất
      </div>

      <div
        style={{
          display: 'flex',
          fontSize: '26px',
          fontWeight: 500,
          marginTop: '54px',
          opacity: 0.75,
          letterSpacing: '1px',
        }}
      >
        NestJS · Microservice · CQRS · Next.js
      </div>
    </div>,
    { ...size },
  );
}
