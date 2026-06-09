import { Module, forwardRef } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@/modules/users/entities/user.entity';
import { Address } from '@/modules/users/entities/address.entity';
import { GeocodingModule } from '@/modules/geocoding/geocoding.module';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  imports: [
    TypeOrmModule.forFeature([User, Address]),
    forwardRef(() => GeocodingModule),
  ],
  exports: [UsersService],
})
export class UsersModule { }
