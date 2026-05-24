// Libraries
import { Repository, FindOptionsWhere, ObjectLiteral } from 'typeorm';
import { Logger } from '@nestjs/common';
const bcrypt = require('bcrypt');

const saltRounds = 10;
const logger = new Logger('CryptoHelper');

/**
 * Helper mã hóa dữ liệu văn bản thuần (ví dụ: mật khẩu) sử dụng bcrypt
 */
export const hashDataHelper = async (plainData: string) => {
  try {
    const dataToHash = plainData;
    const rounds = saltRounds;
    const hashed = await bcrypt.hash(dataToHash, rounds);
    return hashed;
  } catch (error) {
    const errMessage = error;
    logger.error(errMessage);
  }
};

/**
 * Helper đối chiếu dữ liệu văn bản thuần với mã hash đã mã hóa
 */
export const compareHashedDataHelper = async (
  plainData: string,
  hashedData: string,
) => {
  try {
    const rawData = plainData;
    const hash = hashedData;
    const isMatch = await bcrypt.compare(rawData, hash);
    return isMatch;
  } catch (error) {
    const errMessage = error;
    logger.error(errMessage);
  }
};

/**
 * Helper kiểm tra sự tồn tại của bản ghi trong cơ sở dữ liệu dựa theo điều kiện
 */
export const isDataExist = async <T extends ObjectLiteral>(
  repository: Repository<T>,
  condition: FindOptionsWhere<T>,
): Promise<boolean> => {
  const queryCondition = condition;
  const findOptions = {
    where: queryCondition,
  };
  const entity = await repository.findOne(findOptions);

  const existStatus = !!entity;
  return existStatus;
};
