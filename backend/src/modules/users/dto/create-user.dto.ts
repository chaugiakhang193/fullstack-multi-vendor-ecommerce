import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsEnum,
  IsOptional,
  IsPhoneNumber,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, AccountStatus } from '@/common/enums';

export class CreateUserDto {
  @ApiProperty({ example: 'nguyenvana', description: 'Tên đăng nhập' })
  @IsNotEmpty({ message: 'username không được để trống' })
  @IsString({ message: 'username không được là một dãy số' })
  username: string;

  @ApiProperty({
    example: 'nguyenvana@gmail.com',
    description: 'Địa chỉ email',
  })
  @IsNotEmpty({ message: 'email không được để trống' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123', description: 'Mật khẩu' })
  @IsNotEmpty({ message: 'password không được để trống' })
  password: string;

  @ApiProperty({
    enum: UserRole,
    example: UserRole.CUSTOMER,
    description: 'Vai trò người dùng',
  })
  @IsEnum(UserRole, { message: 'role không hợp lệ' })
  role: UserRole;

  @ApiProperty({
    enum: AccountStatus,
    example: AccountStatus.ACTIVE,
    description: 'Trạng thái tài khoản',
  })
  @IsEnum(AccountStatus, { message: 'account status không hợp lệ' })
  status: AccountStatus;

  @ApiPropertyOptional({
    example: 'Nguyễn Văn A',
    description: 'Họ và tên đầy đủ',
  })
  @IsOptional()
  @IsString({ message: 'full_name phải là một chuỗi' })
  full_name: string;

  @ApiPropertyOptional({ example: '0987654321', description: 'Số điện thoại' })
  @IsOptional()
  @IsPhoneNumber()
  phone: string;
}
