import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { AgentsAgentController } from './agents-agent.controller';
import { AgentStatusController } from './agent-status.controller';
import { AgentsService } from './agents.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [AgentsController, AgentsAgentController, AgentStatusController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
