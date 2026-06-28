// NestJS core
import {
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { UpdateUserDto } from '@/modules/users/dto/update-user.dto';
import { UpdateProfileDto } from '@/modules/users/dto/update-profile.dto';
import { RegisterDto } from '@/auth/dto/register.dto';
import { User } from '@/modules/users/entities/user.entity';
import { Address } from '@/modules/users/entities/address.entity';
import { CreateAddressDto } from '@/modules/users/dto/create-address.dto';
import { UpdateAddressDto } from '@/modules/users/dto/update-address.dto';
import { GeocodingService } from '@/modules/geocoding/geocoding.service';
import { Repository, DataSource, Brackets } from 'typeorm';
import { paginate } from '@/common/helpers/pagination.helper';
import { AdminUserQueryDto } from '@/modules/users/dto/admin-user-query.dto';
import { UpdateUserStatusDto } from '@/modules/users/dto/update-user-status.dto';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import {
  hashDataHelper,
  compareHashedDataHelper,
  isDataExist,
} from '@/common/helpers/utils';
import { UserRole, AssetType, AccountStatus } from '@/common/enums';
import { USER_LIMITS } from '@/common/constants/user.constant';
import { CLOUDINARY_FOLDER } from '@/common/constants/upload.constant';
import { CloudinaryService } from '@/modules/cloudinary/cloudinary.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Address)
    private addressRepository: Repository<Address>,
    private readonly geocodingService: GeocodingService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly cloudinaryService: CloudinaryService,
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
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :id', { id: userID })
      .getOne();
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    if (!user.password) {
      throw new BadRequestException(
        'Tài khoản này đăng nhập bằng Google và chưa có mật khẩu. Vui lòng dùng chức năng "Tạo mật khẩu".',
      );
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

  // Tìm user theo id hoặc ném 404 — helper dùng chung cho các luồng hồ sơ/avatar.
  // Mirror findOwnedAddressOrFail: tách findCriteria + cờ tường minh + message có tên.
  private async findUserOrFail(userId: string): Promise<User> {
    const findCriteria = { where: { id: userId } };
    const user = await this.usersRepository.findOne(findCriteria);
    const isUserMissing = !user;
    if (isUserMissing) {
      const notFoundMsg = 'Không tìm thấy người dùng';
      throw new NotFoundException(notFoundMsg);
    }
    return user;
  }

  // Lấy hồ sơ đầy đủ của user (password đã select:false nên không lộ)
  async getProfile(userId: string): Promise<User> {
    return this.findUserOrFail(userId);
  }

  // Cập nhật thông tin cơ bản: chỉ ghi đè field thực sự được gửi lên
  // (giữ check !== undefined inline để TS narrow đúng kiểu string)
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    const user = await this.findUserOrFail(userId);

    if (dto.full_name !== undefined) {
      user.full_name = dto.full_name;
    }
    if (dto.phone !== undefined) {
      user.phone = dto.phone;
    }

    await this.usersRepository.save(user);
    return this.getProfile(userId);
  }

  // Đổi ảnh đại diện: upload ảnh mới → trỏ avatar_url → dọn ảnh cũ.
  // Mirror shops.service.replaceShopAsset; rollback ảnh mới nếu lỗi giữa chừng.
  async updateAvatar(userId: string, file: Express.Multer.File): Promise<User> {
    const isFileMissing = !file;
    if (isFileMissing) {
      throw new BadRequestException('Vui lòng chọn ảnh đại diện');
    }

    const user = await this.findUserOrFail(userId);
    const oldAvatarUrl = user.avatar_url;

    // Giữ tham chiếu asset mới để rollback nếu các bước sau thất bại
    let newAvatarAsset: any = null;
    try {
      // 1. Upload ảnh mới lên Cloudinary (đồng thời ghi 1 dòng media_assets)
      newAvatarAsset = await this.cloudinaryService.uploadFile(
        file,
        CLOUDINARY_FOLDER.USER_AVATARS,
        userId,
        AssetType.USER_AVATAR,
      );

      // 2. Trỏ avatar_url của user sang URL ảnh mới
      const avatarUpdateFields = { avatar_url: newAvatarAsset.url };
      await this.usersRepository.update(userId, avatarUpdateFields);

      // 3. Dọn ảnh cũ (nếu có) khỏi Cloudinary + media_assets
      await this.removeOldAvatarAsset(oldAvatarUrl, userId);

      return this.getProfile(userId);
    } catch (error) {
      await this.rollbackNewAvatarAsset(newAvatarAsset, userId);
      throw new InternalServerErrorException(
        'Có lỗi xảy ra khi cập nhật ảnh đại diện',
      );
    }
  }

  // Dọn asset avatar cũ theo URL (no-op nếu user chưa từng có avatar)
  private async removeOldAvatarAsset(
    oldAvatarUrl: string,
    userId: string,
  ): Promise<void> {
    const hasOldAvatar = !!oldAvatarUrl;
    if (!hasOldAvatar) {
      return;
    }
    const oldAsset = await this.cloudinaryService.findAssetByUrl(oldAvatarUrl);
    const isOldAssetMissing = !oldAsset;
    if (isOldAssetMissing) {
      return;
    }
    await this.cloudinaryService
      .deleteAsset(oldAsset.id, userId)
      .catch((e) => this.logger.error('Xóa avatar cũ thất bại', e));
  }

  // Rollback ảnh vừa upload khi luồng updateAvatar lỗi giữa chừng (tránh rác Cloudinary)
  private async rollbackNewAvatarAsset(
    newAvatarAsset: any,
    userId: string,
  ): Promise<void> {
    const hasNewAsset = !!newAvatarAsset?.id;
    if (!hasNewAsset) {
      return;
    }
    await this.cloudinaryService
      .deleteAsset(newAvatarAsset.id, userId)
      .catch((e) => this.logger.error('Rollback avatar thất bại', e));
  }

  // ADMIN: danh sách user toàn sàn — lọc role/status/search + phân trang.
  // password đã select:false nên không lộ khi getManyAndCount.
  async findAllForAdmin(query: AdminUserQueryDto) {
    const { role, status, search, sort, order } = query;
    const qb = this.usersRepository.createQueryBuilder('user');

    if (role) {
      qb.andWhere('user.role = :role', { role });
    }
    if (status) {
      qb.andWhere('user.status = :status', { status });
    }
    if (search) {
      qb.setParameter('search', `%${search}%`);
      qb.andWhere(
        new Brackets((b) => {
          b.where('user.username ILIKE :search').orWhere(
            'user.email ILIKE :search',
          );
        }),
      );
    }

    // Chống SQL injection ở cột sort: chỉ cho phép whitelist
    const allowedSortFields = ['created_at', 'username', 'email'];
    const isSortAllowed = sort && allowedSortFields.includes(sort);
    const sortField = isSortAllowed ? sort : 'created_at';
    qb.orderBy(`user.${sortField}`, order);

    return paginate<User>(qb, query);
  }

  // ADMIN: ban/unban/suspend 1 user.
  // Hiệu lực ban dựa tech-debt B (#115): route ghi seller/admin đọc lại status/role
  // từ DB; JWT cũ của user bị ban có thể còn hạn tới TTL với route ĐỌC (chấp nhận cho MVP).
  async updateUserStatus(
    adminId: string,
    targetId: string,
    dto: UpdateUserStatusDto,
  ): Promise<User> {
    const isSelf = adminId === targetId;
    if (isSelf) {
      throw new BadRequestException(
        'Không thể tự đổi trạng thái của chính mình',
      );
    }

    const target = await this.findUserOrFail(targetId);

    const isTargetAdmin = target.role === UserRole.ADMIN;
    if (isTargetAdmin) {
      throw new ForbiddenException(
        'Không thể thay đổi trạng thái của tài khoản admin khác',
      );
    }

    target.status = dto.status;
    await this.usersRepository.save(target);
    return this.getProfile(targetId);
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
    // Dùng ?? null để đồng nhất kiểu với Address entity (string | null), tránh lỗi TS
    let finalLat: string | null = lat ?? null;
    let finalLng: string | null = lng ?? null;

    const hasLat = lat !== undefined && lat !== null && lat !== '';
    const hasLng = lng !== undefined && lng !== null && lng !== '';

    if ((hasLat && !hasLng) || (!hasLat && hasLng)) {
      throw new BadRequestException(
        'Vĩ độ (lat) và kinh độ (lng) phải được cung cấp đi kèm cả cặp',
      );
    }

    // Nếu cả hai tọa độ đều trống, thử geocoding ngoài transaction.
    // Geocode fail → ném lỗi rõ ràng, không lưu địa chỉ thiếu tọa độ
    // để tránh phí ship bị tính sai mà user không hay biết.
    if (!hasLat && !hasLng) {
      const geocodeResult = await this.geocodingService.geocode(address_line);
      const isSuccess = geocodeResult.success;
      if (
        isSuccess &&
        geocodeResult.lat !== null &&
        geocodeResult.lng !== null
      ) {
        finalLat = geocodeResult.lat.toString();
        finalLng = geocodeResult.lng.toString();
      } else {
        throw new BadRequestException(
          'Không thể tự động xác định tọa độ cho địa chỉ này. Vui lòng nhập địa chỉ chi tiết hơn hoặc chọn từ gợi ý.',
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
      throw new BadRequestException(
        'Vĩ độ (lat) và kinh độ (lng) phải được cung cấp đi kèm cả cặp',
      );
    }

    // Kế thừa tọa độ cũ nếu request không gửi lat/lng mới
    let finalLat: string | null = lat !== undefined ? lat : address.lat;
    let finalLng: string | null = lng !== undefined ? lng : address.lng;

    // Nếu cập nhật address_line mà không truyền cặp lat/lng, thử geocoding ngoài transaction
    const hasAddressLineUpdate =
      address_line !== undefined &&
      address_line !== null &&
      address_line !== '';
    const isNewCoordsProvided = hasLat && hasLng;

    if (hasAddressLineUpdate && !isNewCoordsProvided) {
      if (address_line !== address.address_line) {
        const geocodeResult = await this.geocodingService.geocode(address_line);
        const isSuccess = geocodeResult.success;
        if (
          isSuccess &&
          geocodeResult.lat !== null &&
          geocodeResult.lng !== null
        ) {
          finalLat = geocodeResult.lat.toString();
          finalLng = geocodeResult.lng.toString();
        } else {
          throw new BadRequestException(
            'Không thể tự động xác định tọa độ cho địa chỉ mới. Vui lòng nhập địa chỉ chi tiết hơn hoặc chọn từ gợi ý.',
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
      const shouldBeDefault =
        is_default !== undefined ? is_default : address.is_default;

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
        const remainingAddress = await manager.findOne(
          Address,
          nextDefaultCriteria,
        );

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

  async countAll(): Promise<number> {
    return this.usersRepository.count();
  }

  async countByRole(role: UserRole): Promise<number> {
    return this.usersRepository.count({ where: { role } });
  }

  /** Lấy id của tất cả user role ADMIN (phục vụ fan-out notification trong OutboxWorker). */
  async findAdminIds(): Promise<string[]> {
    const admins = await this.usersRepository.find({
      where: { role: UserRole.ADMIN },
      select: { id: true },
    });
    return admins.map((admin) => admin.id);
  }

  /** Tìm user theo Google ID (claim sub). Trả null nếu chưa có ai link. */
  async findByGoogleId(googleId: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { google_id: googleId } });
  }

  /** Sinh username duy nhất từ phần local của email + hậu tố ngẫu nhiên khi trùng. */
  private async generateUniqueUsername(email: string): Promise<string> {
    const base =
      email
        .split('@')[0]
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '')
        .slice(0, 20) || 'user';

    // thử base trước, sau đó base + 4 ký tự ngẫu nhiên, tối đa 5 lần
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate =
        attempt === 0
          ? base
          : `${base}_${Math.random().toString(36).slice(2, 6)}`;
      const exists = await isDataExist(this.usersRepository, {
        username: candidate,
      });
      if (!exists) return candidate;
    }
    // fallback cực hiếm: gắn timestamp
    return `${base}_${Date.now().toString(36)}`;
  }

  /**
   * Tạo user mới từ Google (email mới tinh, chưa tồn tại trong hệ thống).
   * Account vào thẳng ACTIVE (email đã được Google verify), password = null.
   */
  async createGoogleUser(params: {
    email: string;
    googleId: string;
    fullName?: string | null;
    avatarUrl?: string | null;
  }): Promise<User> {
    const { email, googleId, fullName, avatarUrl } = params;
    const username = await this.generateUniqueUsername(email);

    const newUser = new User();
    newUser.username = username;
    newUser.email = email;
    newUser.password = null;
    newUser.google_id = googleId;
    newUser.status = AccountStatus.ACTIVE;
    if (fullName) newUser.full_name = fullName;
    if (avatarUrl) newUser.avatar_url = avatarUrl;
    return this.usersRepository.save(newUser);
  }

  /**
   * Liên kết Google vào 1 user đã tồn tại (tìm theo email).
   * - takeoverPending=true (account PENDING_VERIFICATION, password untrusted):
   *   huỷ password cũ + kích hoạt ACTIVE.
   * - prefill full_name/avatar nếu user chưa có.
   */
  async linkGoogleAccount(
    user: User,
    params: {
      googleId: string;
      fullName?: string | null;
      avatarUrl?: string | null;
      takeoverPending: boolean;
    },
  ): Promise<User> {
    const { googleId, fullName, avatarUrl, takeoverPending } = params;

    user.google_id = googleId;
    if (takeoverPending) {
      user.password = null; // untrusted (account chưa từng verify email)
      user.password_changed_at = new Date();
      // Takeover = Google thay khâu verify email → set status role-aware HỆT
      // verifyEmailAndActivateUser: SELLER phải đi tiếp luồng tạo shop → admin duyệt
      // (NEW_SELLER), KHÔNG nhảy thẳng ACTIVE (sẽ bypass kiểm duyệt seller).
      user.status =
        user.role === UserRole.SELLER
          ? AccountStatus.NEW_SELLER
          : AccountStatus.ACTIVE;
    }
    if (!user.full_name && fullName) user.full_name = fullName;
    if (!user.avatar_url && avatarUrl) user.avatar_url = avatarUrl;

    return this.usersRepository.save(user);
  }

  /**
   * Đặt mật khẩu LẦN ĐẦU cho account chưa có mật khẩu (vd: tạo từ Google).
   * Nếu account đã có mật khẩu → chặn (phải dùng change-password).
   */
  async setUserPassword(userId: string, newPassword: string): Promise<void> {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :id', { id: userId })
      .getOne();
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    if (user.password) {
      throw new BadRequestException(
        'Tài khoản đã có mật khẩu. Vui lòng dùng chức năng đổi mật khẩu.',
      );
    }
    user.password = await hashDataHelper(newPassword);
    user.password_changed_at = new Date();
    await this.usersRepository.save(user);
  }

  /** Account có mật khẩu local hay không (để FE quyết định hiện "Tạo mật khẩu" vs "Đổi mật khẩu"). */
  async userHasPassword(userId: string): Promise<boolean> {
    const row = await this.usersRepository
      .createQueryBuilder('user')
      .select('user.id')
      .addSelect('user.password')
      .where('user.id = :id', { id: userId })
      .getOne();
    return !!row?.password;
  }
}
