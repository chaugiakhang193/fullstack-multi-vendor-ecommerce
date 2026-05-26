import {
  BadRequestException,
  NotFoundException,
  Injectable,
} from '@nestjs/common';
import { UpdateUserDto } from '@/modules/users/dto/update-user.dto';
import { RegisterDto } from '@/auth/dto/register.dto';
import { User } from '@/modules/users/entities/user.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import {
  hashDataHelper,
  compareHashedDataHelper,
  isDataExist,
} from '@/common/helpers/utils';
import { UserRole, AccountStatus } from '@/common/enums';
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  /*  isDataExist = async (field: string, data: any) => {
    const user = await this.usersRepository.findOne({
      where: { [field]: data },
    });
    if (user) return true;
    return false;
  }; */
  async createCustomer(registerDto: RegisterDto) {
    const { username, password, email } = registerDto;

    const isEmailExist = await isDataExist(this.usersRepository, { email });

    if (isEmailExist) {
      throw new BadRequestException(
        'Email này đã được dùng để đăng ký tài khoản khác',
      );
    }

    const isUsernameExist = await isDataExist(this.usersRepository, {
      username,
    });

    if (isUsernameExist) {
      throw new BadRequestException('Tên người dùng này đã được sử dụng');
    }

    const hashedPassword = await hashDataHelper(password);

    const newUser = this.usersRepository.create({
      username: username,
      email: email,
      password: hashedPassword,
    });
    return this.usersRepository.save(newUser);
  }

  async createSeller(registerDto: RegisterDto) {
    const { username, password, email } = registerDto;

    const isEmailExist = await isDataExist(this.usersRepository, { email });
    if (isEmailExist) {
      throw new BadRequestException(
        'Email này đã được dùng để đăng ký tài khoản khác',
      );
    }

    const isUsernameExist = await isDataExist(this.usersRepository, {
      username,
    });
    if (isUsernameExist) {
      throw new BadRequestException('Tên người dùng này đã được sử dụng');
    }

    const hashedPassword = await hashDataHelper(password);

    const newUser = this.usersRepository.create({
      username: username,
      email: email,
      password: hashedPassword,
      role: UserRole.SELLER,
    });
    return this.usersRepository.save(newUser);
  }

  async changeUserPassword(
    userID: string,
    old_password: string,
    new_password: string,
  ) {
    //tìm user dựa trên userID xem có tồn tại không
    const user = await this.usersRepository.findOne({ where: { id: userID } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    // so sánh mật khẩu cũ do User cung cấp với mật khẩu đã hash lưu trong database
    const isMatch = await compareHashedDataHelper(old_password, user.password);
    if (!isMatch) {
      throw new BadRequestException('Mật khẩu cũ không chính xác');
    }

    if (old_password === new_password) {
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại');
    }

    //hash mật khẩu mới rồi cập nhật xuống database
    const hashedNewPassword = await hashDataHelper(new_password);
    user.password = hashedNewPassword;
    user.password_changed_at = new Date();
    await this.usersRepository.save(user);
  }

  async findByUsername(username: string) {
    return this.usersRepository.findOne({ where: { username } });
  }

  async findByEmail(userEmail: string) {
    return this.usersRepository.findOne({ where: { email: userEmail } });
  }

  async findById(userID: string) {
    return this.usersRepository.findOne({ where: { id: userID } });
  }

  findAll(): Promise<User[]> {
    return this.usersRepository.find();
  }

  findOne(id: number) {
    return `This action returns a #${id} user`;
  }

  update(id: number, updateUserDto: UpdateUserDto) {
    return `This action updates a #${id} user`;
  }

  remove(id: number) {
    return `This action removes a #${id} user`;
  }
}
