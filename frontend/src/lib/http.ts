import { normalizePath } from "./utils"; // Giả sử bạn đã copy hàm normalizePath từ dự án mẫu qua
import { useAuthStore } from "@/store/useAuthStore";

// Custom phần báo lỗi
export class HttpError extends Error {
  status: number;
  payload: any;
  constructor({ status, payload }: { status: number; payload: any }) {
    super("Http Error");
    this.status = status;
    this.payload = payload;
  }
}

export class EntityError extends HttpError {
  constructor({ status, payload }: { status: 422 | 400; payload: any }) {
    super({ status, payload });
  }
}

// Biến môi trường
const BASE_URL = process.env.NEXT_PUBLIC_API_URL;
export const isClient = () => typeof window !== "undefined";

// Cờ chặn gọi refresh nhiều lần
let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;

// Lấy hết của RequestInit NGOẠI TRỪ "method"
type CustomOptions = Omit<RequestInit, "method"> & {
  baseUrl?: string;
  isInternal?: boolean;
};

const request = async <Response>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  options?: CustomOptions,
) => {
  let body: FormData | string | undefined;
  if (options?.body instanceof FormData) {
    body = options.body;
  } else if (options?.body) {
    body = JSON.stringify(options.body);
  }

  // Nếu là kiểu formdate thì cho browser tự ép kiểu, còn không thì code ép kiểu
  const baseHeaders: { [key: string]: string } =
    body instanceof FormData ? {} : { "Content-Type": "application/json" };

  // lấy acccessToken lưu trong ram (nhận được từ backend khi đăng nhập hoặc refresh ở lần trước)
  const accessToken = useAuthStore.getState().accessToken;
  if (accessToken) {
    baseHeaders.Authorization = `Bearer ${accessToken}`;
  }

  // Trước nó và không truyền gì cả thì lấy BASE_URL của server NestJS backend (option.baseUrl = underfined)
  // Ở đây truyền rỗng "" thì lấy địa chỉ NextJS server,
  // Truyền baseURL có giá trị thì nối tiếp với đường dẫn
  // Truyền chuỗi tuyệt đối thì bắt đầu bằng http là được

  const currentBaseUrl =
    options?.baseUrl !== undefined ? options.baseUrl : BASE_URL || "";
  const safeCurrentBaseUrl = currentBaseUrl.trim();

  //Xử lý URL chuẩn bị cho fetch
  const fullUrl = url.startsWith("http")
    ? url.trim()
    : `${safeCurrentBaseUrl}/${normalizePath(url)}`;

  // GỌI API lần đầu (BẮT BUỘC có credentials: 'include' để NestJS nhận HttpOnly Cookie)
  let res = await fetch(fullUrl, {
    ...options,
    headers: { ...baseHeaders, ...options?.headers } as any,
    body,
    method,
    credentials: "include",
  });

  // Các endpoint thuộc luồng xác thực PUBLIC - KHÔNG cần auto-refresh khi gặp 401
  // (các endpoint này chưa/không yêu cầu đăng nhập nên không có token để refresh)
  const AUTH_PUBLIC_ENDPOINTS = [
    "/auth/login",
    "/auth/register",
    "/auth/verify-email",
    "/auth/resend-verification",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/auth/refresh",
  ];
  const isAuthPublicEndpoint = AUTH_PUBLIC_ENDPOINTS.some((endpoint) =>
    url.startsWith(endpoint),
  );

  // REFRESH TOKEN TỰ ĐỘNG (Lỗi 401) - Chỉ áp dụng cho các API cần xác thực
  if (res.status === 401 && isClient() && !isAuthPublicEndpoint) {
    if (!isRefreshing) {
      isRefreshing = true;
      // Trình duyệt tự mang HttpOnly Cookie (RefreshToken) đi xin token mới
      refreshPromise = fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      })
        .then(async (refreshRes) => {
          if (!refreshRes.ok) throw new Error("Refresh failed");
          const refreshData = await refreshRes.json();
          const accessToken = refreshData.data?.access_token;
          const user = refreshData.data?.user;

          if (accessToken && user) {
            // Cập nhật cả User mới nhất và Token mới để tự động đồng bộ Cookie phụ
            useAuthStore.getState().setAuth(user, accessToken);
          } else {
            throw new Error("Invalid refresh response data");
          }
          return accessToken;
        })
        .finally(() => {
          isRefreshing = false;
          refreshPromise = null;
        });
    }

    try {
      //Trường hợp có AccessToken => refresh thành công
      const newAccessToken = await refreshPromise;
      // Gắn token mới và gọi lại API bị lỗi
      const newHeaders = {
        ...baseHeaders,
        ...options?.headers,
        Authorization: `Bearer ${newAccessToken}`,
      };
      res = await fetch(fullUrl, {
        ...options,
        headers: newHeaders as any,
        body,
        method,
        credentials: "include",
      });
    } catch (error) {
      // Refresh thất bại (Cookie hết hạn) -> Đá văng ra login
      useAuthStore.getState().logout();
      if (
        typeof window !== "undefined" &&
        window.location.pathname !== "/login"
      ) {
        window.location.href = "/login";
      }
      throw new HttpError({
        status: 401,
        payload: { message: "Phiên đăng nhập đã hết hạn" },
      });
    }
  }

  // Interceptor frontend, kiểm tra payload trả về và các dạng parse Json
  const payload: Response = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Nếu là lỗi Validation từ NestJS (Class Validator thường trả 400, một số trường hợp là 422)
    if (res.status === 422 || res.status === 400) {
      throw new EntityError({ status: res.status as 422 | 400, payload });
    }
    if (res.status === 401) {
      // Auth public endpoints (login, register, v.v.) -> Trả nguyên message gốc từ backend
      if (isAuthPublicEndpoint) {
        throw new HttpError({ status: 401, payload });
      }
      // Các API khác bị 401 -> thông báo phiên hết hạn
      throw new HttpError({
        status: 401,
        payload: { message: "Phiên đăng nhập đã hết hạn" },
      });
    }
    throw new HttpError({ status: res.status, payload });
  }

  return payload;
};

// Xuất ra object http dễ sử dụng
const http = {
  get<Response>(url: string, options?: Omit<CustomOptions, "body">) {
    return request<Response>("GET", url, options);
  },
  post<Response>(
    url: string,
    body: any,
    options?: Omit<CustomOptions, "body">,
  ) {
    return request<Response>("POST", url, { ...options, body });
  },
  put<Response>(url: string, body: any, options?: Omit<CustomOptions, "body">) {
    return request<Response>("PUT", url, { ...options, body });
  },
  patch<Response>(
    url: string,
    body: any,
    options?: Omit<CustomOptions, "body">,
  ) {
    return request<Response>("PATCH", url, { ...options, body });
  },
  delete<Response>(url: string, options?: Omit<CustomOptions, "body">) {
    return request<Response>("DELETE", url, { ...options });
  },
};

export default http;
