const bcrypt = require('bcrypt');
import { Repository, FindOptionsWhere, ObjectLiteral } from 'typeorm';

import { Logger } from '@nestjs/common';

const saltRounds = 10;
const logger = new Logger('CryptoHelper');

export const hashDataHelper = async (plainData: string) => {
  try {
    return await bcrypt.hash(plainData, saltRounds);
  } catch (error) {
    logger.error(error);
  }
};

export const compareHashedDataHelper = async (
  plainData: string,
  hashedData: string,
) => {
  try {
    return await bcrypt.compare(plainData, hashedData);
  } catch (error) {
    logger.error(error);
  }
};

export const isDataExist = async <T extends ObjectLiteral>(
  repository: Repository<T>,
  condition: FindOptionsWhere<T>,
): Promise<boolean> => {
  const entity = await repository.findOne({
    where: condition,
  });

  return !!entity;
};
