import { normalizePath } from "./utils";
import { useAuthStore } from "@/store/useAuthStore";
import { AUTH_API_ENDPOINTS } from "@/constants/routes";

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
  timeout?: number;
};

// Định nghĩa và export hàm helper dùng chung để parse thông báo lỗi
export function getErrorMessage(error: any): string {
  if (error instanceof HttpError) {
    const status = error.status;
    const rateLimitCode = 429;
    const timeoutCode = 408;

    if (status === rateLimitCode) {
      const rateLimitMsg = "Bạn đang thao tác quá nhanh. Vui lòng đợi một lát và thử lại!";
      return rateLimitMsg;
    }
    if (status === timeoutCode) {
      const timeoutMsg = "Kết nối mạng quá hạn (Timeout). Vui lòng kiểm tra lại đường truyền!";
      return timeoutMsg;
    }

    const payload = error.payload;
    if (payload) {
      if (typeof payload.message === "string") {
        const msgStr = payload.message;
        return msgStr;
      }
      if (Array.isArray(payload.message)) {
        const delimiter = ", ";
        const msgArrStr = payload.message.join(delimiter);
        return msgArrStr;
      }
      if (payload.error && typeof payload.error === "string") {
        const errStr = payload.error;
        return errStr;
      }
    }
  }
  const defaultErrMessage = error?.message || "Đã có lỗi xảy ra. Vui lòng thử lại!";
  return defaultErrMessage;
}

const request = async <Response>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  options?: CustomOptions,
) => {
  let body: FormData | string | undefined;
  if (options?.body instanceof FormData) {
    body = options.body;
  } else if (options?.body) {
    const stringifiedBody = JSON.stringify(options.body);
    body = stringifiedBody;
  }

  // Nếu là kiểu formdate thì cho browser tự ép kiểu, còn không thì code ép kiểu
  const baseHeaders: { [key: string]: string } =
    body instanceof FormData ? {} : { "Content-Type": "application/json" };

  // lấy acccessToken lưu trong ram (nhận được từ backend khi đăng nhập hoặc refresh ở lần trước)
  const authState = useAuthStore.getState();
  const accessToken = authState.accessToken;
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
  const urlPath = normalizePath(url);
  const fullUrl = url.startsWith("http")
    ? url.trim()
    : `${safeCurrentBaseUrl}/${urlPath}`;

  // Cơ chế Timeout sử dụng AbortController
  const defaultTimeout = 15000;
  const timeoutMs = options?.timeout ?? defaultTimeout;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  // GỌI API lần đầu (BẮT BUỘC có credentials: 'include' để NestJS nhận HttpOnly Cookie)
  let res: globalThis.Response;
  try {
    const fetchHeaders = { ...baseHeaders, ...options?.headers } as any;
    res = await fetch(fullUrl, {
      ...options,
      headers: fetchHeaders,
      body,
      method,
      credentials: "include",
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error.name === "AbortError") {
      const errStatus = 408;
      const errPayload = { message: "Kết nối mạng quá hạn (Timeout). Vui lòng kiểm tra lại đường truyền!" };
      throw new HttpError({
        status: errStatus,
        payload: errPayload,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  // Các endpoint thuộc luồng xác thực PUBLIC - KHÔNG cần auto-refresh khi gặp 401
  // (các endpoint này chưa/không yêu cầu đăng nhập nên không có token để refresh)
  const isAuthPublicEndpoint = AUTH_API_ENDPOINTS.some((endpoint) => {
    const hasPrefix = url.startsWith(endpoint);
    return hasPrefix;
  });

  // REFRESH TOKEN TỰ ĐỘNG (Lỗi 401) - Chỉ áp dụng cho các API cần xác thực
  if (res.status === 401 && isClient() && !isAuthPublicEndpoint) {
    if (!isRefreshing) {
      isRefreshing = true;
      // Trình duyệt tự mang HttpOnly Cookie (RefreshToken) đi xin token mới
      const refreshUrl = `${BASE_URL}/auth/refresh`;
      const refreshHeaders = { "Content-Type": "application/json" };
      refreshPromise = fetch(refreshUrl, {
        method: "POST",
        headers: refreshHeaders,
        credentials: "include",
      })
        .then(async (refreshRes) => {
          // Xử lý 403 (Session hết hạn - bình thường)
          if (refreshRes.status === 403) {
            const expErr = new Error("SESSION_EXPIRED");
            throw expErr;
          }

          // Xử lý 401 (Token không hợp lệ - nguy hiểm)
          if (refreshRes.status === 401) {
            const invErr = new Error("INVALID_TOKEN");
            throw invErr;
          }

          if (!refreshRes.ok) {
            const failErr = new Error("Refresh failed");
            throw failErr;
          }

          const refreshData = await refreshRes.json();
          const accessToken = refreshData.data?.access_token;
          const user = refreshData.data?.user;

          if (accessToken && user) {
            // Cập nhật cả User mới nhất và Token mới để tự động đồng bộ Cookie phụ
            const authStateStore = useAuthStore.getState();
            authStateStore.setAuth(user, accessToken);
          } else {
            const invResErr = new Error("Invalid refresh response data");
            throw invResErr;
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

      const retryController = new AbortController();
      const retryTimeoutId = setTimeout(() => {
        retryController.abort();
      }, timeoutMs);

      try {
        res = await fetch(fullUrl, {
          ...options,
          headers: newHeaders as any,
          body,
          method,
          credentials: "include",
          signal: retryController.signal,
        });
      } catch (error: any) {
        if (error.name === "AbortError") {
          const errStatus = 408;
          const errPayload = { message: "Kết nối mạng quá hạn (Timeout). Vui lòng kiểm tra lại đường truyền!" };
          throw new HttpError({
            status: errStatus,
            payload: errPayload,
          });
        }
        throw error;
      } finally {
        clearTimeout(retryTimeoutId);
      }
    } catch (error: any) {
      // Phân biệt loại lỗi
      const errorMessage = error?.message || "";

      // Refresh thất bại -> Đá văng ra login
      const logoutStore = useAuthStore.getState();
      logoutStore.logout();

      const currentPath = window.location.pathname;
      const isAuthPage = typeof window !== "undefined" && ["/login", "/register"].includes(currentPath);
      if (typeof window !== "undefined" && !isAuthPage) {
        const fullPath = window.location.pathname + window.location.search;
        const redirectPath = encodeURIComponent(fullPath);

        // Hiển thị cảnh báo bảo mật nếu token không hợp lệ
        if (errorMessage === "INVALID_TOKEN") {
          // Lưu flag vào sessionStorage để AppProvider hiển thị toast
          const sessionFlag = "auth_security_warning";
          sessionStorage.setItem(sessionFlag, "true");
        }

        const loginRedirectUrl = `/login?redirect=${redirectPath}`;
        window.location.href = loginRedirectUrl;
      }

      const isExpired = errorMessage === "SESSION_EXPIRED";
      const userErrMessage = isExpired ? "Phiên đăng nhập đã hết hạn" : "Phiên đăng nhập không hợp lệ";
      const errStatus = 401;
      const errPayload = { message: userErrMessage };
      throw new HttpError({
        status: errStatus,
        payload: errPayload,
      });
    }
  }

  // Interceptor frontend, kiểm tra payload trả về và các dạng parse Json
  const payload: Response = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errorStatus = res.status;
    // Nếu là lỗi Validation từ NestJS (Class Validator thường trả 400, một số trường hợp là 422)
    if (res.status === 422 || res.status === 400) {
      const formErrStatus = res.status as 422 | 400;
      throw new EntityError({ status: formErrStatus, payload });
    }
    if (res.status === 401) {
      // Auth public endpoints (login, register, v.v.) -> Trả nguyên message gốc từ backend
      if (isAuthPublicEndpoint) {
        throw new HttpError({ status: errorStatus, payload });
      }
      // Các API khác bị 401 -> thông báo phiên hết hạn
      const expiredPayload = { message: "Phiên đăng nhập đã hết hạn" };
      throw new HttpError({
        status: errorStatus,
        payload: expiredPayload,
      });
    }
    throw new HttpError({ status: errorStatus, payload });
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
    const reqOptions = { ...options, body };
    return request<Response>("POST", url, reqOptions);
  },
  put<Response>(url: string, body: any, options?: Omit<CustomOptions, "body">) {
    const reqOptions = { ...options, body };
    return request<Response>("PUT", url, reqOptions);
  },
  patch<Response>(
    url: string,
    body: any,
    options?: Omit<CustomOptions, "body">,
  ) {
    const reqOptions = { ...options, body };
    return request<Response>("PATCH", url, reqOptions);
  },
  delete<Response>(url: string, options?: Omit<CustomOptions, "body">) {
    return request<Response>("DELETE", url, { ...options });
  },
};

export default http;
