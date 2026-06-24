import { UserRole, AccountStatus } from '@/constants/enum';

export interface User {
  id: string;

  username: string;

  email: string;

  role: UserRole;

  status: AccountStatus;

  full_name: string | null;

  phone: string | null;

  password_changed_at: string | null;

  created_at: string;

  updated_at: string;
}
