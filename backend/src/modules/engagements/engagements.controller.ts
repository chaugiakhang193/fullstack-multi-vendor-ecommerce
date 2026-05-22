import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { EngagementsService } from './engagements.service';
import { CreateEngagementDto } from './dto/create-engagement.dto';
import { UpdateEngagementDto } from './dto/update-engagement.dto';

@Controller('engagements')
export class EngagementsController {
  constructor(private readonly engagementsService: EngagementsService) {}

  @Post()
  create(@Body() createEngagementDto: CreateEngagementDto) {
    return this.engagementsService.create(createEngagementDto);
  }

  @Get()
  findAll() {
    return this.engagementsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.engagementsService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateEngagementDto: UpdateEngagementDto,
  ) {
    return this.engagementsService.update(+id, updateEngagementDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.engagementsService.remove(+id);
  }
}
