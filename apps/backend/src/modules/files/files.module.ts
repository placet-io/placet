import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FilesController } from './files.controller';
import { FilesAgentController } from './files-agent.controller';
import { FilesService } from './files.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    EventsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'change-me-in-production'),
      }),
    }),
  ],
  controllers: [FilesController, FilesAgentController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
