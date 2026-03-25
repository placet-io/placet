import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { ShareController } from './share.controller';

@Module({
  imports: [FilesModule],
  controllers: [ShareController],
})
export class ShareModule {}
