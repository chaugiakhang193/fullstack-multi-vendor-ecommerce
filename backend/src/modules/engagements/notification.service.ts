// NestJS
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

// TypeORM
import { EntityManager, Repository } from 'typeorm';

// Entities
import { Notification } from '@/modules/engagements/entities/notification.entity';

// Enums
import { NotificationType } from '@/common/enums';

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
}
