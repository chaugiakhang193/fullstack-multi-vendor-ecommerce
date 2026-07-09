// NestJS
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";

// TypeORM
import { EntityManager, Repository } from "typeorm";

// Contracts (generated)
import { Notification } from "@/contracts/notification.entity.generated";
import { NotificationType } from "@/contracts/enums.generated";
import { NotificationData } from "@/contracts/notification.data.generated";

export interface CreateNotificationDto {
  userId: string;
  type: NotificationType;
  title: string;
  content: string;
  data?: NotificationData;
}

// NS write-only: chỉ ghi bảng notifications (SHARED Supabase), KHÔNG WS
// (WS = Phase 5, chưa có gateway ở NS). Nhận manager tuỳ chọn để consumer gộp
// INSERT vào transaction dedupe — atomic thực sự (P4-4).
@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
  ) {}

  async create(
    dto: CreateNotificationDto,
    manager?: EntityManager,
  ): Promise<Notification> {
    const repo = manager
      ? manager.getRepository(Notification)
      : this.notificationRepo;

    const notification = repo.create({
      user_id: dto.userId,
      type: dto.type,
      title: dto.title,
      content: dto.content,
      data: dto.data ?? null,
    });
    return repo.save(notification);
  }

  /** Tạo cùng một notification cho NHIỀU user (bulk). Dùng cho fan-out admin. */
  async createForUsers(
    userIds: string[],
    dto: Omit<CreateNotificationDto, "userId">,
    manager?: EntityManager,
  ): Promise<void> {
    if (userIds.length === 0) return;
    const repo = manager
      ? manager.getRepository(Notification)
      : this.notificationRepo;
    const rows = userIds.map((userId) =>
      repo.create({
        user_id: userId,
        type: dto.type,
        title: dto.title,
        content: dto.content,
        data: dto.data ?? null,
      }),
    );
    await repo.save(rows);
  }
}
