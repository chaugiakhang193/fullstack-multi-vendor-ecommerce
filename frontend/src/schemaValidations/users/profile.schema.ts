import z from "zod";

// Body cho PATCH /users/me — sửa thông tin hồ sơ cá nhân (full_name, phone).
// Mirror backend users/dto/update-profile.dto.ts. Cho phép chuỗi rỗng để xóa SĐT.
export const UpdateProfileBody = z.object({
  full_name: z
    .string()
    .max(50, "Họ tên không được vượt quá 50 ký tự")
    .trim()
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .regex(/^$|^(0|\+84)[0-9]{9,10}$/, "Số điện thoại không hợp lệ")
    .optional()
    .or(z.literal("")),
});

export type UpdateProfileBodyType = z.TypeOf<typeof UpdateProfileBody>;
