import createClient from 'openapi-fetch';
import type { paths } from './api-schema';

// Khởi tạo client gọi API với các Type được sinh tự động từ Backend
export const client = createClient<paths>({
  baseUrl: 'http://localhost:8080/api/v1', // Đã bao gồm prefix api/v1
});

// Bạn có thể thêm các middleware (interceptors) ở đây nếu cần (ví dụ gắn Bearer Token)
// client.use({
//   onRequest({ request }) {
//     const token = localStorage.getItem("access_token");
//     if (token) {
//       request.headers.set("Authorization", `Bearer ${token}`);
//     }
//     return request;
//   },
// });
