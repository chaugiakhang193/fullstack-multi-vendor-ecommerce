import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Category } from '@/modules/products/entities/category.entity';
import { CreateCategoryDto } from '@/modules/products/dto/create-category.dto';
import { UpdateCategoryDto } from '@/modules/products/dto/update-category.dto';
import slugify from 'slugify';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
  ) {}

  async create(createCategoryDto: CreateCategoryDto) {
    const { parentId, ...data } = createCategoryDto;

    const newCategory = this.categoriesRepository.create(data);

    // Tự động tạo slug từ name
    newCategory.slug = this.generateSlug(data.name);
    const newCategorySlug = newCategory.slug;
    const isExist = await this.categoriesRepository.findOne({
      where: { slug: newCategorySlug },
    });
    if (isExist) {
      throw new ConflictException(
        'Tên danh mục hoặc Slug đã tồn tại trên hệ thống!',
      );
    }

    // Nếu có id parent cha thì kiểm tra xem có tồn tại không,
    // nếu có thì gán vào newCategory.parent, nếu không thì throw error
    // Nếu không nhập parentid thì có nghĩa nó thư mục gốc - không có cha
    if (parentId) {
      const parent = await this.categoriesRepository.findOne({
        where: { id: parentId },
        relations: ['parent'],
      });

      if (!parent) {
        throw new NotFoundException('Không tìm thấy danh mục cha');
      }
      if (parent.parent !== null) {
        throw new BadRequestException(
          'Hệ thống chỉ hỗ trợ 2 cấp. Danh mục bạn chọn đã là danh mục con, không thể thêm con cho nó nữa.',
        );
      }
      newCategory.parent = parent;
    } else {
      // Nếu không có parentId, xác định đây là danh mục gốc
      newCategory.parent = null;
    }

    return await this.categoriesRepository.save(newCategory);
  }

  async findAll() {
    return await this.categoriesRepository.find({
      relations: ['parent', 'children'],
      order: { display_order: 'ASC' },
    });
  }

  async findOneById(id: string) {
    const category = await this.categoriesRepository.findOne({
      where: { id: id },
      relations: ['parent', 'children'],
    });
    if (!category) throw new NotFoundException('Không tìm thấy danh mục');
    return category;
  }

  async updateById(id: string, updateCategoryDto: UpdateCategoryDto) {
    const category = await this.findOneById(id);
    const { parentId, ...data } = updateCategoryDto;

    Object.assign(category, data);
    // Nếu người dùng đổi tên, tự động cập nhật lại Slug
    if (data.name) {
      category.slug = this.generateSlug(data.name);
    }
    if (parentId !== undefined) {
      if (parentId === null) {
        category.parent = null;
      } else {
        if (parentId === id)
          throw new BadRequestException('Danh mục cha không được là chính nó');

        const parent = await this.categoriesRepository.findOne({
          where: { id: parentId },
          relations: ['parent'],
        });

        if (!parent) throw new NotFoundException('Không tìm thấy danh mục cha');

        // Không cho phép chọn cha là một danh mục con (Ngăn cấp 3)
        if (parent.parent !== null) {
          throw new BadRequestException(
            'Hệ thống chỉ hỗ trợ 2 cấp. Không thể chọn danh mục con làm danh mục cha.',
          );
        }

        // Bản thân danh mục này đang có con, nếu hạ nó xuống làm con của thằng khác -> Sẽ tạo thành 3 cấp
        if (category.children && category.children.length > 0) {
          throw new BadRequestException(
            'Danh mục này đang chứa các danh mục con. Không thể hạ cấp nó xuống làm danh mục con.',
          );
        }

        category.parent = parent;
      }
    }

    return await this.categoriesRepository.save(category);
  }

  async removeById(id: string) {
    const category = await this.findOneById(id);
    return await this.categoriesRepository.remove(category);
  }

  async validateLeafCategory(id: string): Promise<Category> {
    const category = await this.categoriesRepository.findOne({
      where: { id: id },
      relations: ['parent', 'children'],
    });

    if (!category) {
      throw new NotFoundException('Danh mục không tồn tại');
    }

    // Phải là danh mục con (phải có cha)
    if (!category.parent) {
      throw new BadRequestException(
        'Vui lòng chọn danh mục con cụ thể thay vì danh mục gốc.',
      );
    }

    // Phải là cấp cuối cùng (không được phép có con)
    if (category.children && category.children.length > 0) {
      throw new BadRequestException(
        'Danh mục được chọn chưa phải là cấp cuối cùng. Vui lòng kiểm tra lại.',
      );
    }

    return category;
  }

  async validateRootCategory(id: string): Promise<Category> {
    const category = await this.categoriesRepository.findOne({
      where: { id: id },
      relations: ['parent'],
    });

    if (!category) {
      throw new NotFoundException('Danh mục không tồn tại');
    }

    // Danh mục gốc thì bắt buộc không được có cha
    if (category.parent !== null) {
      throw new BadRequestException('Danh mục được chọn phải là danh mục gốc.');
    }

    return category;
  }

  async validateRootCategories(ids: string[]): Promise<Category[]> {
    if (!ids || ids.length === 0) return [];

    const categories = await this.categoriesRepository.find({
      where: { id: In(ids) },
      relations: ['parent'],
    });

    if (categories.length !== ids.length) {
      throw new BadRequestException('Một hoặc nhiều danh mục không tồn tại');
    }

    const nonRootCategories = categories.filter((c) => c.parent !== null);
    if (nonRootCategories.length > 0) {
      throw new BadRequestException(
        'Chỉ được phép chọn danh mục gốc (không có danh mục cha)',
      );
    }

    return categories;
  }

  // Tạo slug tự động dựa trên name category, sử dụng slutify,
  // Tốt cho SEO và dễ dàng tạo URL khi truy cập danh mục
  private generateSlug(name: string): string {
    return slugify(name, { lower: true, locale: 'vi' });
  }
}
