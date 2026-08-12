import { ConfigService } from '@nestjs/config';
import { VnpayService } from './vnpay.service';

describe('VnpayService', () => {
  const secret = 'TESTSECRET1234567890';
  const mockConfig: Record<string, string> = {
    VNP_TMN_CODE: 'TESTTMN',
    VNP_HASH_SECRET: secret,
    VNP_PAY_URL: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    VNP_RETURN_URL: 'http://localhost:8080/api/v1/payments/vnpay/return',
  };

  const configService = {
    get: (key: string) => mockConfig[key],
  } as unknown as ConfigService;

  const service = new VnpayService(configService);

  it('isEnabled true khi đủ config', () => {
    const enabled = service.isEnabled();
    expect(enabled).toBe(true);
  });

  it('build URL rồi verify chữ ký chính nó = true', () => {
    const buildParams = {
      txnRef: 'ORD1-123',
      amount: 150000,
      orderInfo: 'Thanh toan don hang ORD1',
      ipAddr: '127.0.0.1',
      expireAt: new Date(Date.now() + 15 * 60 * 1000),
    };
    const url = service.buildPaymentUrl(buildParams);
    const parsedUrl = new URL(url);
    const query = Object.fromEntries(parsedUrl.searchParams.entries());

    const isSignatureValid = service.verifySignature(query);
    expect(isSignatureValid).toBe(true);
    expect(query['vnp_Amount']).toBe('15000000'); // 150000 * 100
  });

  it('đổi 1 tham số → verify fail (chống giả mạo)', () => {
    const buildParams = {
      txnRef: 'ORD1-123',
      amount: 150000,
      orderInfo: 'x',
      ipAddr: '127.0.0.1',
      expireAt: new Date(Date.now() + 15 * 60 * 1000),
    };
    const url = service.buildPaymentUrl(buildParams);
    const parsedUrl = new URL(url);
    const query = Object.fromEntries(parsedUrl.searchParams.entries());

    query['vnp_Amount'] = '100'; // giả mạo số tiền
    const isSignatureValid = service.verifySignature(query);
    expect(isSignatureValid).toBe(false);
  });
});
