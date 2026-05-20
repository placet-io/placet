import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module';
import { ManagementClient } from './management-client.service';
import { DailyUsageService } from './daily-usage.service';
import { ManageHealthController } from './controllers/health.controller';
import { ManageSessionsController } from './controllers/sessions.controller';
import { ManageAuditController } from './controllers/audit.controller';
import { ManageUsageController } from './controllers/usage.controller';
import { ManageDailyUsageController } from './controllers/daily-usage.controller';
import { ManageCredentialsController } from './controllers/credentials.controller';
import { ManageCronController } from './controllers/cron.controller';
import { ManageMcpController } from './controllers/mcp.controller';
import { ManageWorkspaceController } from './controllers/workspace.controller';
import { ManageSkillsController } from './controllers/skills.controller';
import { ManageScriptsController } from './controllers/scripts.controller';
import { ManageChannelsController } from './controllers/channels.controller';
import { ManageCommandsController } from './controllers/commands.controller';
import { ManageAgentCardController } from './controllers/agent-card.controller';
import { ManageA2aPeersController } from './controllers/a2a-peers.controller';
import { ManageSettingsController } from './controllers/settings.controller';
import { ManagePolicyController } from './controllers/policy.controller';
import {
  LegacyManageImprovementController,
  ManageVersionsController,
} from './controllers/versions.controller';

@Module({
  imports: [AgentsModule],
  controllers: [
    ManageHealthController,
    ManageSessionsController,
    ManageAuditController,
    ManageUsageController,
    ManageDailyUsageController,
    ManageCredentialsController,
    ManageCronController,
    ManageMcpController,
    ManageWorkspaceController,
    ManageSkillsController,
    ManageScriptsController,
    ManageChannelsController,
    ManageCommandsController,
    ManageAgentCardController,
    ManageA2aPeersController,
    ManageSettingsController,
    ManagePolicyController,
    ManageVersionsController,
    LegacyManageImprovementController,
  ],
  providers: [ManagementClient, DailyUsageService],
})
export class AgentManagementModule {}
