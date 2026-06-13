// NestJS
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

// TypeORM
import { EntityManager, Repository } from 'typeorm';

// Entities
import { Notification } from '@/modules/engagements/entities/notification.entity';

// Enums
import { NotificationType } from '@/common/enums';

// Pagination + DTO
import { paginate } from '@/common/helpers/pagination.helper';
import { PaginatedResponseDto } from '@/common/dto/paginated-response.dto';
import { NotificationQueryDto } from '@/modules/engagements/dto/notification-query.dto';

export interface CreateNotificationDto {
  userId: string;
  type: NotificationType;
  title: string;
  content: string;
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
  ) {}

  // Nhận manager tuỳ chọn để OutboxWorker gộp INSERT vào transaction của nó — atomic thực sự.
  // Khi không truyền manager (gọi độc lập), dùng default repo với auto-commit.
  async create(
    dto: CreateNotificationDto,
    manager?: EntityManager,
  ): Promise<Notification> {
    const repo = manager
      ? manager.getRepository(Notification)
      : this.notificationRepo;

    const notificationData = {
      user: { id: dto.userId },
      type: dto.type,
      title: dto.title,
      content: dto.content,
    };
    const notification = repo.create(notificationData);
    return repo.save(notification);
  }

  /** Danh sách notification của user (phân trang + lọc is_read), mới nhất trước. */
  async getNotifications(
    userId: string,
    query: NotificationQueryDto,
  ): Promise<PaginatedResponseDto<Notification>> {
    const qb = this.notificationRepo
      .createQueryBuilder('n')
      .where('n.user_id = :userId', { userId })
      .orderBy('n.created_at', 'DESC');

    if (query.is_read !== undefined) {
      qb.andWhere('n.is_read = :isRead', { isRead: query.is_read });
    }
    return paginate(qb, query);
  }

  /** Đánh dấu 1 notification đã đọc (chặn IDOR). */
  async markAsRead(
    userId: string,
    notificationId: string,
  ): Promise<Notification> {
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId, user: { id: userId } },
    });
    if (!notification) {
      throw new NotFoundException('Không tìm thấy thông báo');
    }
    notification.is_read = true;
    return this.notificationRepo.save(notification);
  }

  /** Đánh dấu tất cả notification chưa đọc của user là đã đọc. */
  async markAllAsRead(userId: string): Promise<{ updated: number }> {
    const result = await this.notificationRepo.update(
      { user: { id: userId }, is_read: false },
      { is_read: true },
    );
    return { updated: result.affected ?? 0 };
  }
}
