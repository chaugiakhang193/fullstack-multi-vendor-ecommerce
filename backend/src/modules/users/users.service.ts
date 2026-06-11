import {
  BadRequestException,
  NotFoundException,
  Injectable,
} from '@nestjs/common';
import { UpdateUserDto } from '@/modules/users/dto/update-user.dto';
import { RegisterDto } from '@/auth/dto/register.dto';
import { User } from '@/modules/users/entities/user.entity';
import { Address } from '@/modules/users/entities/address.entity';
import { CreateAddressDto } from '@/modules/users/dto/create-address.dto';
import { UpdateAddressDto } from '@/modules/users/dto/update-address.dto';
import { GeocodingService } from '@/modules/geocoding/geocoding.service';
import { Repository, DataSource } from 'typeorm';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import {
  hashDataHelper,
  compareHashedDataHelper,
  isDataExist,
} from '@/common/helpers/utils';
import { UserRole } from '@/common/enums';
import { USER_LIMITS } from '@/common/constants/user.constant';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Address)
    private addressRepository: Repository<Address>,
    private readonly geocodingService: GeocodingService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) { }

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
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :id', { id: userID })
      .getOne();
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
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.username = :username', { username })
      .getOne();
    return user;
  }

  async findByEmail(userEmail: string) {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email: userEmail })
      .getOne();
    return user;
  }

  async findById(userID: string) {
    return this.usersRepository.findOne({ where: { id: userID } });
  }

  async addAddress(userId: string, dto: CreateAddressDto): Promise<Address> {
    const { address_line, lat, lng, recipient_name, phone, is_default } = dto;

    // 1. Kiểm tra giới hạn địa chỉ sử dụng duy nhất 1 query count
    const countCriteria = { where: { user: { id: userId } } };
    const count = await this.addressRepository.count(countCriteria);

    if (count >= USER_LIMITS.MAX_ADDRESSES) {
      throw new BadRequestException(
        `Bạn chỉ được lưu tối đa ${USER_LIMITS.MAX_ADDRESSES} địa chỉ`,
      );
    }

    // 2. Validate cặp tọa độ
    let finalLat = lat;
    let finalLng = lng;

    const hasLat = lat !== undefined && lat !== null && lat !== '';
    const hasLng = lng !== undefined && lng !== null && lng !== '';

    if ((hasLat && !hasLng) || (!hasLat && hasLng)) {
      throw new BadRequestException('Vĩ độ (lat) và kinh độ (lng) phải được cung cấp đi kèm cả cặp');
    }

    // Nếu cả hai tọa độ đều trống, thực hiện geocoding ngoài transaction
    if (!hasLat && !hasLng) {
      const geocodeResult = await this.geocodingService.geocode(address_line);
      const isSuccess = geocodeResult.success;
      if (isSuccess && geocodeResult.lat !== null && geocodeResult.lng !== null) {
        finalLat = geocodeResult.lat.toString();
        finalLng = geocodeResult.lng.toString();
      } else {
        throw new BadRequestException(
          'Không thể tự động xác định tọa độ cho địa chỉ này. Vui lòng cung cấp tọa độ hoặc nhập địa chỉ chi tiết hơn.',
        );
      }
    }

    // 3. Thực thi lưu trữ trong transaction sử dụng manager
    return await this.dataSource.transaction(async (manager) => {
      let shouldBeDefault = is_default ?? false;
      if (count === 0) {
        shouldBeDefault = true;
      }

      // Nếu địa chỉ mới là mặc định, unset toàn bộ địa chỉ cũ của user
      if (shouldBeDefault) {
        const updateCriteria = { user: { id: userId } };
        const updateFields = { is_default: false };
        await manager.update(Address, updateCriteria, updateFields);
      }

      const addressData = {
        address_line,
        lat: finalLat,
        lng: finalLng,
        recipient_name,
        phone,
        is_default: shouldBeDefault,
        user: { id: userId },
      };
      const newAddress = manager.create(Address, addressData);
      const savedAddress = await manager.save(Address, newAddress);

      delete (savedAddress as any).user;
      return savedAddress;
    });
  }

  async getAddresses(userId: string): Promise<Address[]> {
    const findCriteria = {
      where: { user: { id: userId } },
      order: {
        is_default: 'DESC' as const,
        created_at: 'DESC' as const,
      },
    };
    const addresses = await this.addressRepository.find(findCriteria);
    return addresses;
  }

  async updateAddress(
    userId: string,
    addressId: string,
    dto: UpdateAddressDto,
  ): Promise<Address> {
    const { address_line, lat, lng, recipient_name, phone, is_default } = dto;

    // 1. Tìm địa chỉ bằng where để chống IDOR và ném 404
    const address = await this.findOwnedAddressOrFail(userId, addressId);

    // 2. Validate cặp tọa độ
    const hasLat = lat !== undefined && lat !== null && lat !== '';
    const hasLng = lng !== undefined && lng !== null && lng !== '';

    if ((hasLat && !hasLng) || (!hasLat && hasLng)) {
      throw new BadRequestException('Vĩ độ (lat) và kinh độ (lng) phải được cung cấp đi kèm cả cặp');
    }

    let finalLat = lat !== undefined ? lat : address.lat;
    let finalLng = lng !== undefined ? lng : address.lng;

    // Nếu cập nhật address_line mà không truyền cặp lat/lng, gọi geocoding ngoài transaction
    const hasAddressLineUpdate = address_line !== undefined && address_line !== null && address_line !== '';
    const isNewCoordsProvided = hasLat && hasLng;

    if (hasAddressLineUpdate && !isNewCoordsProvided) {
      if (address_line !== address.address_line) {
        const geocodeResult = await this.geocodingService.geocode(address_line);
        const isSuccess = geocodeResult.success;
        if (isSuccess && geocodeResult.lat !== null && geocodeResult.lng !== null) {
          finalLat = geocodeResult.lat.toString();
          finalLng = geocodeResult.lng.toString();
        } else {
          throw new BadRequestException(
            'Không thể tự động xác định tọa độ cho địa chỉ mới. Vui lòng cung cấp tọa độ hoặc nhập địa chỉ chi tiết hơn.',
          );
        }
      }
    }

    // 3. Kiểm tra logic is_default
    if (is_default === false && address.is_default) {
      throw new BadRequestException(
        'Không thể bỏ chọn địa chỉ mặc định trực tiếp. Vui lòng đặt địa chỉ khác làm mặc định thay thế.',
      );
    }

    // 4. Thực thi trong Transaction sử dụng manager
    return await this.dataSource.transaction(async (manager) => {
      const shouldBeDefault = is_default !== undefined ? is_default : address.is_default;

      if (is_default === true) {
        const updateCriteria = { user: { id: userId } };
        const updateFields = { is_default: false };
        await manager.update(Address, updateCriteria, updateFields);
      }

      if (address_line !== undefined) address.address_line = address_line;
      address.lat = finalLat;
      address.lng = finalLng;
      if (recipient_name !== undefined) address.recipient_name = recipient_name;
      if (phone !== undefined) address.phone = phone;
      address.is_default = shouldBeDefault;

      const savedAddress = await manager.save(Address, address);
      delete (savedAddress as any).user;
      return savedAddress;
    });
  }

  async deleteAddress(userId: string, addressId: string): Promise<void> {
    const address = await this.findOwnedAddressOrFail(userId, addressId);
    const wasDefault = address.is_default;

    await this.dataSource.transaction(async (manager) => {
      const deleteCriteria = { id: addressId };
      await manager.delete(Address, deleteCriteria);

      // Nếu xóa địa chỉ mặc định, tự động tìm địa chỉ còn lại mới nhất để promote lên làm mặc định
      if (wasDefault) {
        const nextDefaultCriteria = {
          where: { user: { id: userId } },
          order: { created_at: 'DESC' as const },
        };
        const remainingAddress = await manager.findOne(Address, nextDefaultCriteria);

        if (remainingAddress) {
          remainingAddress.is_default = true;
          await manager.save(Address, remainingAddress);
        }
      }
    });
  }

  /**
   * Tìm địa chỉ thuộc sở hữu của user — phục vụ luồng Checkout snapshot.
   *
   * Trả về thẳng Address kèm chống IDOR ở tầng where: nếu user_id không khớp,
   * findOne trả null và ném 404 thay vì lộ thông tin tồn tại của bản ghi.
   * Không cần transaction vì đây là đọc thuần.
   */
  async findOwnedAddressOrFail(
    userId: string,
    addressId: string,
  ): Promise<Address> {
    const findCriteria = {
      where: { id: addressId, user: { id: userId } },
    };
    const address = await this.addressRepository.findOne(findCriteria);
    const isAddressMissing = !address;
    if (isAddressMissing) {
      const notFoundMsg = 'Không tìm thấy địa chỉ giao hàng';
      throw new NotFoundException(notFoundMsg);
    }
    return address;
  }

  async setDefaultAddress(userId: string, addressId: string): Promise<Address> {
    const address = await this.findOwnedAddressOrFail(userId, addressId);

    return await this.dataSource.transaction(async (manager) => {
      const updateCriteria = { user: { id: userId }, is_default: true };
      const updateFields = { is_default: false };
      await manager.update(Address, updateCriteria, updateFields);

      address.is_default = true;
      const savedAddress = await manager.save(Address, address);
      delete (savedAddress as any).user;
      return savedAddress;
    });
  }
}
