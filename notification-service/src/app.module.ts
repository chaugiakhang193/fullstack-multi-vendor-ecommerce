import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BrokerModule } from "@/modules/broker/broker.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    BrokerModule,
  ],
})
export class AppModule {}
