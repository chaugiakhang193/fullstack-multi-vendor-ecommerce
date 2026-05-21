import { PartialType } from '@nestjs/swagger';
import { CreateEngagementDto } from './create-engagement.dto';

export class UpdateEngagementDto extends PartialType(CreateEngagementDto) {}
