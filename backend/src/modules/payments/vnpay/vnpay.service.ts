import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Đóng gói toàn bộ phần mật mã của VNPay: sắp xếp tham số, ký HMAC-SHA512,
 * dựng URL thanh toán, và xác minh chữ ký ở IPN/Return.
 *
 * Cố ý KHÔNG dùng thư viện `qs`: tự nối `key=value&...` sau khi đã encode từng phần
 * (tương đương qs.stringify({encode:false})) để không thêm dependency và để hành vi
 * encode nằm hoàn toàn trong tầm kiểm soát — chữ ký sai một byte là verify fail.
 */
@Injectable()
export class VnpayService {
  private readonly logger = new Logger(VnpayService.name);

  constructor(private readonly config: ConfigService) {}

  /** Có đủ cấu hình để bật VNPAY không. Thiếu → checkout chỉ còn COD. */
  isEnabled(): boolean {
    const tmnCodeKey = 'VNP_TMN_CODE';
    const hashSecretKey = 'VNP_HASH_SECRET';
    const tmnCode = this.config.get<string>(tmnCodeKey);
    const hashSecret = this.config.get<string>(hashSecretKey);
    return Boolean(tmnCode && hashSecret);
  }

  /**
   * Dựng URL redirect sang cổng VNPay.
   * @param amount  số tiền VND (chưa nhân 100) — hàm tự nhân 100 theo spec VNPay.
   */
  buildPaymentUrl(params: {
    txnRef: string;
    amount: number;
    orderInfo: string;
    ipAddr: string;
  }): string {
    const tmnCodeKey = 'VNP_TMN_CODE';
    const secretKey = 'VNP_HASH_SECRET';
    const payUrlKey = 'VNP_PAY_URL';
    const returnUrlKey = 'VNP_RETURN_URL';

    const tmnCode = this.config.get<string>(tmnCodeKey)!;
    const secret = this.config.get<string>(secretKey)!;
    const payUrl = this.config.get<string>(payUrlKey)!;
    const returnUrl = this.config.get<string>(returnUrlKey)!;

    const now = new Date();
    const createDate = this.formatVnpDate(now);
    // Hết hạn 15 phút — trùng với cửa sổ "giữ kho tạm"
    const expireMs = 15 * 60 * 1000;
    const expireDate = this.formatVnpDate(new Date(now.getTime() + expireMs));

    const calculatedAmount = Math.round(params.amount * 100);
    const amountStr = String(calculatedAmount);

    const data: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: tmnCode,
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: params.txnRef,
      vnp_OrderInfo: params.orderInfo,
      vnp_OrderType: 'other',
      vnp_Amount: amountStr,
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: params.ipAddr,
      vnp_CreateDate: createDate,
      vnp_ExpireDate: expireDate,
    };

    const sorted = this.sortAndEncode(data);
    const signData = this.buildQuery(sorted);
    const secureHash = this.sign(secret, signData);

    const finalUrl = `${payUrl}?${signData}&vnp_SecureHash=${secureHash}`;
    return finalUrl;
  }

  /**
   * Xác minh chữ ký của query VNPay gửi về (IPN hoặc Return).
   * Tách vnp_SecureHash (+ vnp_SecureHashType) ra, ký lại phần còn lại, so timing-safe.
   */
  verifySignature(query: Record<string, string>): boolean {
    const secretKey = 'VNP_HASH_SECRET';
    const secret = this.config.get<string>(secretKey);
    if (!secret) return false;

    const secureHashKey = 'vnp_SecureHash';
    const received = query[secureHashKey];
    if (!received) return false;

    const rest: Record<string, string> = {};
    for (const key of Object.keys(query)) {
      if (key === 'vnp_SecureHash' || key === 'vnp_SecureHashType') continue;
      rest[key] = query[key];
    }

    const sorted = this.sortAndEncode(rest);
    const signData = this.buildQuery(sorted);
    const expected = this.sign(secret, signData);

    const isValid = this.timingSafeEqualHex(received, expected);
    return isValid;
  }

  // --- helpers ---

  /** Sắp key theo alpha SAU KHI encode, và encode value (thay %20 -> + như sample VNPay). */
  private sortAndEncode(obj: Record<string, string>): Record<string, string> {
    const encodedKeys = Object.keys(obj).map((k) => encodeURIComponent(k));
    encodedKeys.sort();
    const out: Record<string, string> = {};
    for (const ek of encodedKeys) {
      const rawKey = decodeURIComponent(ek);
      const encodedValue = encodeURIComponent(obj[rawKey]).replace(/%20/g, '+');
      out[ek] = encodedValue;
    }
    return out;
  }

  /** Nối 'key=value&...' — value đã encode nên KHÔNG encode lại (giống qs {encode:false}). */
  private buildQuery(sorted: Record<string, string>): string {
    const queryString = Object.keys(sorted)
      .map((k) => `${k}=${sorted[k]}`)
      .join('&');
    return queryString;
  }

  private sign(secret: string, signData: string): string {
    const algorithm = 'sha512';
    const encoding = 'utf-8';
    const outputFormat = 'hex';

    const hmac = crypto.createHmac(algorithm, secret);
    const buffer = Buffer.from(signData, encoding);
    const hash = hmac.update(buffer).digest(outputFormat);
    return hash;
  }

  private timingSafeEqualHex(a: string, b: string): boolean {
    // timingSafeEqual đòi 2 buffer cùng độ dài; hex chữ ký luôn 128 ký tự, nhưng
    // vẫn guard để input dị dạng không ném lỗi mà trả false.
    if (a.length !== b.length) return false;
    try {
      const encoding = 'hex';
      const bufA = Buffer.from(a, encoding);
      const bufB = Buffer.from(b, encoding);
      const isMatch = crypto.timingSafeEqual(bufA, bufB);
      return isMatch;
    } catch (error) {
      this.logger.error(`[VnpayService.timingSafeEqualHex] Error:`, error);
      return false;
    }
  }

  /** yyyyMMddHHmmss theo giờ VN (GMT+7). Tự cộng offset để không phụ thuộc tz máy chủ. */
  private formatVnpDate(date: Date): string {
    const offsetMs = 7 * 60 * 60 * 1000;
    const gmt7 = new Date(date.getTime() + offsetMs);
    const p = (n: number) => String(n).padStart(2, '0');
    const formattedDate =
      `${gmt7.getUTCFullYear()}${p(gmt7.getUTCMonth() + 1)}${p(gmt7.getUTCDate())}` +
      `${p(gmt7.getUTCHours())}${p(gmt7.getUTCMinutes())}${p(gmt7.getUTCSeconds())}`;
    return formattedDate;
  }
}
