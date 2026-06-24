import http from '@/lib/http';
import { AccountResType } from '@/schemaValidations/auth/auth.schema';
import { UpdateProfileBodyType } from '@/schemaValidations/users/profile.schema';

const userApiRequest = {
  // Lấy hồ sơ hiện tại (tái dùng /auth/me)
  getMe: () => http.get<AccountResType>('/auth/me'),

  // Cập nhật họ tên / SĐT
  updateProfile: (body: UpdateProfileBodyType) =>
    http.patch<AccountResType>('/users/me', body),

  // Cập nhật avatar (multipart) — body là FormData chứa key "file"
  uploadAvatar: (body: FormData) =>
    http.post<AccountResType>('/users/me/avatar', body),
};

export default userApiRequest;
