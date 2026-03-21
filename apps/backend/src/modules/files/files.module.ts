import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesAgentController } from './files-agent.controller';
import { FilesService } from './files.service';

@Module({
  controllers: [FilesController, FilesAgentController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
