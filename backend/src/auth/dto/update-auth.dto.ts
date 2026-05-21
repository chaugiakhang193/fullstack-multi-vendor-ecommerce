import { PartialType } from '@nestjs/swagger';
import { RegisterDto } from './register.dto';

export class UpdateAuthDto extends PartialType(RegisterDto) {}
