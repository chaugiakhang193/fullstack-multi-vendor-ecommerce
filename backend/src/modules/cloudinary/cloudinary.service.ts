import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';
import { Readable } from 'stream';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MediaAsset } from './entities/media-asset.entity';
import { AssetType } from '@/modules/enums';

@Injectable()
export class CloudinaryService {
  constructor(
    @InjectRepository(MediaAsset)
    private readonly mediaAssetRepository: Repository<MediaAsset>,
  ) {}

  //upload một file lên Cloudinary, lưu thông tin file vào DB nếu có ownerId và type, trả về kết quả upload
  async uploadFile(
    file: Express.Multer.File,
    folder: string,
    ownerId?: string,
    type?: AssetType,
    shopId?: string,
    uploadedAssetsTracker?: { id: string; public_id: string }[],
  ): Promise<MediaAsset | any> {
    const result: any = await new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          folder: folder,
        },
        (error, result) => {
          if (error) return reject(error);
          if (!result) return reject(new Error('Cloudinary upload failed'));
          resolve(result);
        },
      );

      Readable.from(file.buffer).pipe(upload);
    });

    if (ownerId && type) {
      const newAsset = this.mediaAssetRepository.create({
        public_id: result.public_id,
        url: result.secure_url,
        type: type,
        owner: { id: ownerId } as any,
        shop: shopId ? ({ id: shopId } as any) : null,
      });
      const savedAsset = await this.mediaAssetRepository.save(newAsset);
      if (uploadedAssetsTracker && savedAsset.id && savedAsset.public_id) {
        uploadedAssetsTracker.push({
          id: savedAsset.id,
          public_id: savedAsset.public_id,
        });
      }
      return savedAsset;
    }
    // Trả về kết quả upload thô nếu không có ownerId và type, để linh hoạt sử dụng cho các mục đích khác nhau mà không nhất thiết phải lưu vào DB.
    return result;
  }

  //upload nhiều file lên Cloudinary, lưu thông tin file vào DB nếu có ownerId và type, trả về kết quả upload
  async uploadMultipleFiles(
    files: Express.Multer.File[] | undefined,
    folder: string,
    ownerId?: string,
    type?: AssetType,
    shopId?: string,
    uploadedAssetsTracker?: { id: string; public_id: string }[],
  ): Promise<(MediaAsset | any)[]> {
    if (!files || files.length === 0) return [];

    const uploadPromises = files.map((file) =>
      this.uploadFile(file, folder, ownerId, type, shopId),
    );
    const results = await Promise.all(uploadPromises);

    if (uploadedAssetsTracker && results.length > 0) {
      results.forEach((result) => {
        if (result && result.id && result.public_id) {
          uploadedAssetsTracker.push({
            id: result.id,
            public_id: result.public_id,
          });
        }
      });
    }

    return results;
  }

  // Xóa file trên Cloudinary bằng public_id, trả về kết quả xóa
  async deleteFile(publicId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.destroy(publicId, (error, result) => {
        if (error) return reject(error);
        resolve(result);
      });
    });
  }

  // Xóa một asset cả trên Cloudinary và trong DB, chỉ cho phép xóa nếu asset thuộc về ownerId
  async deleteAsset(assetId: string, ownerId: string): Promise<void> {
    const asset = await this.mediaAssetRepository.findOne({
      where: { id: assetId, owner: { id: ownerId } },
    });
    if (!asset) {
      throw new Error('Không tìm thấy hình ảnh hoặc bạn không có quyền xóa');
    }

    await this.deleteFile(asset.public_id);
    await this.mediaAssetRepository.remove(asset);
  }

  // Tìm một asset theo ID, bao gồm thông tin liên quan đến owner và shop
  async findAssetById(assetId: string): Promise<MediaAsset | null> {
    return await this.mediaAssetRepository.findOne({
      where: { id: assetId },
      relations: ['owner', 'shop'],
    });
  }

  // Tìm một asset theo URL, trả về null nếu không tìm thấy hoặc nếu URL không hợp lệ
  async findAssetByUrl(url: string): Promise<MediaAsset | null> {
    if (!url) return null;
    return await this.mediaAssetRepository.findOne({ where: { url } });
    // Nếu không tìm thấy sẽ trả về null thay vì undefined, giúp tránh lỗi khi truy cập thuộc tính của kết quả trả về.
  }

  async updateAssetShopId(assetId: string, shopId: string): Promise<void> {
    // Sử dụng save với partial object để TypeOM xử lý Rrelation chính xác hơn update()
    await this.mediaAssetRepository.save({
      id: assetId,
      shop: { id: shopId } as any,
    });
  }
}
