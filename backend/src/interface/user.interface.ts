import { UserRole, AccountStatus } from '@/common/enums';

export interface IUser {
  sub: string;
  username: string;
  role: UserRole;
  status: AccountStatus;
  iat?: number;
  exp?: number;
}
