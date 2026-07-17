import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { Notification } from "@/contracts/notification.entity.generated";
import { NotificationType } from "@/contracts/enums.generated";
import { NotificationData } from "@/contracts/notification.data.generated";
import { NotificationOutbox } from "@/entities/notification-outbox.entity";
import {
  NOTIFICATION_CREATED_EVENT,
  NotificationCreatedPayload,
} from "@/contracts/notification-outbound.events";

export interface CreateNotificationDto {
  userId: string;
  type: NotificationType;
  title: string;
  content: string;
  data?: NotificationData;
}

// NS write-only. Mỗi create ghi thêm 1 row notification_outbox CÙNG manager →
// zero dual-write (Phase 6, part_02). Relay publish notification.created từ outbox.
@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(NotificationOutbox)
    private readonly outboxRepo: Repository<NotificationOutbox>,
  ) {}

  async create(
    dto: CreateNotificationDto,
    manager?: EntityManager,
  ): Promise<Notification> {
    const notifRepo = manager
      ? manager.getRepository(Notification)
      : this.notificationRepo;
    const outboxRepo = manager
      ? manager.getRepository(NotificationOutbox)
      : this.outboxRepo;

    const notification = notifRepo.create({
      user_id: dto.userId,
      type: dto.type,
      title: dto.title,
      content: dto.content,
      data: dto.data ?? null,
      is_read: false,
    });
    const saved = await notifRepo.save(notification);

    await outboxRepo.insert({
      event_type: NOTIFICATION_CREATED_EVENT,
      payload: this.toPayload(saved),
    });
    return saved;
  }

  async createForUsers(
    userIds: string[],
    dto: Omit<CreateNotificationDto, "userId">,
    manager?: EntityManager,
  ): Promise<Notification[]> {
    if (userIds.length === 0) return [];
    const notifRepo = manager
      ? manager.getRepository(Notification)
      : this.notificationRepo;
    const outboxRepo = manager
      ? manager.getRepository(NotificationOutbox)
      : this.outboxRepo;

    const rows = userIds.map((userId) =>
      notifRepo.create({
        user_id: userId,
        type: dto.type,
        title: dto.title,
        content: dto.content,
        data: dto.data ?? null,
        is_read: false,
      }),
    );
    const saved = await notifRepo.save(rows);

    await outboxRepo.insert(
      saved.map((n) => ({
        event_type: NOTIFICATION_CREATED_EVENT,
        payload: this.toPayload(n),
      })),
    );
    return saved;
  }

  // Map 1 dòng notification đã lưu → payload WS notification.new (mirror toPayload).
  toWsRow(n: Notification): {
    id: string;
    type: string;
    title: string | null;
    content: string | null;
    data: unknown | null;
    isRead: boolean;
    createdAt: string;
  } {
    return {
      id: n.id,
      type: n.type,
      title: n.title ?? null,
      content: n.content ?? null,
      data: n.data ?? null,
      isRead: n.is_read,
      createdAt:
        n.created_at instanceof Date
          ? n.created_at.toISOString()
          : new Date(n.created_at).toISOString(),
    };
  }

  // Snapshot đưa vào outbox.payload → part_03 upsert notification_read.
  private toPayload(n: Notification): NotificationCreatedPayload {
    return {
      id: n.id,
      userId: n.user_id,
      type: n.type,
      title: n.title ?? null,
      content: n.content ?? null,
      data: n.data ?? null,
      isRead: n.is_read,
      createdAt: n.created_at,
    };
  }
}
