import { Injectable, Logger } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Session } from '@/auth/entities/session.entity';
import { RefreshVerdict } from '@/auth/auth.types';
import { compareHashedDataHelper } from '@/common/helpers/utils';

/**
 * Cửa sổ ân hạn cho refresh token vừa bị rotate.
 *
 * Trong khoảng này, token ĐỜI TRƯỚC vẫn được chấp nhận vì gần như chắc chắn đó là
 * race lành tính (user F5 nhiều tab → nhiều request song song cùng mang 1 token cũ),
 * KHÔNG phải token bị đánh cắp.
 *
 * Đây là trade-off có ý thức: 10s cũng chính là cửa sổ mà kẻ trộm token cũ còn
 * dùng được. Chọn 10s vì race đa tab qua mạng thật thường lệch < 2s.
 */
export const REFRESH_ROTATION_GRACE_MS = 10_000;

/** Phán quyết của bước xác minh refresh token. KHÔNG bao gồm hành động ghi/xoá. */
export type RotationVerdict =
  | { status: RefreshVerdict.NOT_FOUND }
  | { status: RefreshVerdict.EXPIRED; session: Session }
  | { status: RefreshVerdict.REUSE_DETECTED; session: Session }
  | { status: RefreshVerdict.OK; session: Session; viaGrace: boolean };

/**
 * Tách riêng khỏi AuthService vì 2 lý do:
 *  1. Không có dependency nào ⇒ integration test `new SessionRotationService()` là chạy được,
 *     không phải dựng cả AuthService với 7 dependency (mirror ProductStockService, chính vì
 *     nó không có dep nên checkout-concurrency.int-spec mới viết gọn được).
 *  2. Tách logic bảo mật nhạy cảm ra một chỗ duy nhất, dễ đọc lại và dễ audit.
 */
@Injectable()
export class SessionRotationService {
  private readonly logger = new Logger(SessionRotationService.name);

  constructor(
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
  ) {}

  /**
   * Khoá row session (SELECT ... FOR UPDATE) rồi đối chiếu refresh token gửi lên.
   *
   * BẮT BUỘC gọi bên trong một transaction — khoá chỉ được giữ tới khi transaction
   * kết thúc. Khoá phải bao trọn cả đoạn "đọc → so sánh → ghi" thì mới triệt được
   * TOCTOU (2 request cùng đọc 1 snapshot rồi ghi đè nhau).
   *
   * Khoá BARE ROW — KHÔNG kèm `relations`. `findOne({ relations, lock })` sinh
   * LEFT JOIN và Postgres sẽ ném `0A000: FOR UPDATE cannot be applied to the nullable
   * side of an outer join`. Dùng QueryBuilder lọc thẳng trên cột FK `user_id` để
   * không sinh join nào. Thông tin user load riêng ở tầng trên.
   *
   * HÀM NÀY KHÔNG GHI, KHÔNG XOÁ. Lý do: caller cần `throw` khi phát hiện reuse,
   * mà `throw` bên trong `dataSource.transaction()` sẽ ROLLBACK — lệnh xoá session sẽ
   * bị undo, tưởng đã revoke mà thực ra không. Việc xoá làm SAU khi transaction commit.
   */
  async verifyAndLock(
    sessionId: string,
    userId: string,
    presentedToken: string,
    manager: EntityManager,
    now: Date = new Date(),
  ): Promise<RotationVerdict> {
    const session = await manager
      .createQueryBuilder(Session, 'session')
      .setLock('pessimistic_write')
      .where('session.id = :sessionId', { sessionId })
      .andWhere('session.user_id = :userId', { userId })
      .getOne();

    if (!session) {
      return { status: RefreshVerdict.NOT_FOUND };
    }

    if (session.expires_at && now > session.expires_at) {
      return { status: RefreshVerdict.EXPIRED, session };
    }

    // (1) Khớp token hiện hành → đường đi thường ngày.
    const matchCurrent = await compareHashedDataHelper(
      presentedToken,
      session.refresh_token,
    );
    if (matchCurrent) {
      return { status: RefreshVerdict.OK, session, viaGrace: false };
    }

    // (2) Khớp token ĐỜI TRƯỚC và còn trong grace → race lành tính, KHÔNG phải tấn công.
    //     Nhờ khoá ở trên, 2 request song song bị tuần tự hoá: A rotate trước
    //     (current=T2, previous=T1), B vào sau mang T1 → rơi đúng nhánh này.
    const withinGrace =
      !!session.rotated_at &&
      now.getTime() - session.rotated_at.getTime() <= REFRESH_ROTATION_GRACE_MS;

    // Đời trước NULL (session chưa từng rotate) thì bỏ qua nhánh này luôn — vừa đúng
    // logic, vừa không đưa NULL vào bcrypt.
    if (session.previous_refresh_token && withinGrace) {
      const matchPrevious = await compareHashedDataHelper(
        presentedToken,
        session.previous_refresh_token,
      );
      if (matchPrevious) {
        this.logger.log(
          `[refresh] Race lành tính trên session ${sessionId} — token đời trước còn trong grace ${REFRESH_ROTATION_GRACE_MS}ms`,
        );
        return { status: RefreshVerdict.OK, session, viaGrace: true };
      }
    }

    // (3) Không khớp đời nào, hoặc khớp đời trước nhưng đã QUÁ grace → reuse thật.
    return { status: RefreshVerdict.REUSE_DETECTED, session };
  }

  /**
   * Ghi kết quả rotate. GỌI TRONG CÙNG transaction với verifyAndLock để khoá còn hiệu lực.
   * Dùng `update` (không phải `save`) vì session được load bare row, không có quan hệ `user`
   * — `save` một entity thiếu relation dễ gây tác dụng phụ ngoài ý muốn, `update` thì tường minh.
   */
  async commitRotation(
    session: Session,
    newRefreshTokenHash: string,
    expiresAt: Date,
    manager: EntityManager,
    now: Date = new Date(),
  ): Promise<void> {
    await manager.update(Session, session.id, {
      // Token đang hiện hành bị đẩy xuống thành đời trước.
      previous_refresh_token: session.refresh_token,
      refresh_token: newRefreshTokenHash,
      rotated_at: now,
      expires_at: expiresAt,
    });
  }

  /**
   * Xoá đúng MỘT session. Gọi SAU khi transaction đã commit (xem cảnh báo ở verifyAndLock).
   * Chỉ xoá session/thiết bị bị nghi ngờ, KHÔNG đụng session khác của cùng user —
   * tránh một false-positive đá user ra khỏi mọi thiết bị.
   */
  async revokeSession(sessionId: string, reason: string): Promise<void> {
    const result = await this.sessionRepository.delete(sessionId);
    this.logger.warn(
      `[refresh] Đã revoke session ${sessionId} (lý do: ${reason}, affected=${result.affected})`,
    );
  }
}
