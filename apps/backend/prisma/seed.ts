import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword, generateApiKey } from '../src/common/crypto';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding database...');

  // ── 1. Create owner user ─────────────────────────────────────
  const email = process.env.INITIAL_USER_EMAIL || 'admin@humanproxy.local';
  const password = process.env.INITIAL_USER_PASSWORD || 'changeme';
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      displayName: 'Admin',
      passwordHash,
      role: 'owner',
      mustChangePassword: false,
    },
  });
  console.log(`  ✓ User: ${user.email} (${user.id})`);

  // ── 2. Create a user API key ────────────────────────────────
  const { rawKey, hash, prefix } = generateApiKey();
  await prisma.apiKey.upsert({
    where: { keyHash: hash },
    update: {},
    create: {
      userId: user.id,
      label: 'Default',
      keyHash: hash,
      keyPrefix: prefix,
    },
  });
  console.log(`  ✓ API Key: ${prefix}...`);

  // ── 3. Create agents (chats) ────────────────────────────────
  const agentDefs = [
    {
      name: 'Email Classifier',
      description:
        'Classifies incoming emails and routes them to the correct department.',
    },
    {
      name: 'Code Review Bot',
      description:
        'Reviews pull requests and provides automated feedback on code quality.',
    },
    {
      name: 'Customer Support Agent',
      description:
        'Handles first-line customer support tickets and escalates when needed.',
    },
    {
      name: 'Data Pipeline Monitor',
      description:
        'Monitors ETL pipelines and alerts on failures or data quality issues.',
    },
  ];

  const agents: Array<{ id: string; name: string }> = [];

  for (const def of agentDefs) {
    const agent = await prisma.agent.create({
      data: {
        ownerId: user.id,
        name: def.name,
        description: def.description,
        lastActiveAt: new Date(),
      },
    });
    agents.push({ id: agent.id, name: agent.name });
    console.log(`  ✓ Agent: ${agent.name} (${agent.id})`);
  }

  // ── 4. Create messages ────────────────────────────────────────
  // Agent 0 (Email Classifier) — long conversation
  const emailClassifier = agents[0]!;
  const emailMessages = [
    {
      senderType: 'agent',
      text: "Hello! I'm the Email Classifier agent. I've been configured to sort incoming emails for your team.",
      minutesAgo: 180,
    },
    {
      senderType: 'user',
      text: 'Great. Can you show me how you classify emails?',
      minutesAgo: 178,
    },
    {
      senderType: 'agent',
      text: 'Sure! I use a multi-label classification model. Each email gets categorized into one or more of these categories:\n\n- **Support** — customer issues\n- **Sales** — leads and inquiries\n- **Engineering** — bug reports, feature requests\n- **Billing** — invoices, payment issues\n- **Spam** — unwanted emails\n\nI also extract urgency (low/medium/high/critical) based on the content.',
      minutesAgo: 177,
    },
    {
      senderType: 'user',
      text: "What happens with emails you're not sure about?",
      minutesAgo: 170,
    },
    {
      senderType: 'agent',
      text: "Good question. When my confidence is below 80%, I flag the email for manual review. You'll see a review request here in the chat. Let me show you an example...",
      minutesAgo: 169,
    },
    {
      senderType: 'agent',
      text: 'I just received an email from contact@acme.com with subject "Re: Invoice #4521 and feature request".\n\nThis is tricky because it contains both a **Billing** concern and an **Engineering** feature request. My confidence for the primary category is 72%.\n\nShould I classify this as:\n1. Billing (primary) + Engineering (secondary)\n2. Engineering (primary) + Billing (secondary)',
      minutesAgo: 165,
      status: 'warning',
    },
    {
      senderType: 'user',
      text: 'Go with option 1 — Billing primary, Engineering secondary. Financial matters should take priority.',
      minutesAgo: 160,
    },
    {
      senderType: 'agent',
      text: "Got it! I've updated my routing rules. Emails with billing-related content will now take priority in multi-label scenarios. This will apply to future classifications as well.",
      minutesAgo: 159,
      status: 'success',
    },
    {
      senderType: 'user',
      text: 'How many emails have you processed today?',
      minutesAgo: 120,
    },
    {
      senderType: 'agent',
      text: "Here's today's summary so far:\n\n| Category | Count | Avg Confidence |\n|---|---|---|\n| Support | 24 | 94% |\n| Sales | 18 | 91% |\n| Engineering | 12 | 88% |\n| Billing | 8 | 85% |\n| Spam | 31 | 97% |\n\n**Total: 93 emails processed**, 4 flagged for manual review.",
      minutesAgo: 119,
    },
    {
      senderType: 'user',
      text: "That's solid. Can you alert me if spam volume spikes above 50% of total?",
      minutesAgo: 100,
    },
    {
      senderType: 'agent',
      text: "Done. I've set up an alert threshold: if spam exceeds 50% of total emails in any 1-hour window, I'll send you an immediate notification here.",
      minutesAgo: 99,
      status: 'info',
    },
    {
      senderType: 'agent',
      text: '⚠️ Alert: Spam volume just hit 58% in the last hour (47 out of 81 emails). This is unusual — it looks like a phishing campaign targeting your sales@ address.\n\nShould I:\n1. Auto-quarantine all emails matching this pattern\n2. Just flag them for review',
      minutesAgo: 45,
      status: 'error',
    },
    {
      senderType: 'user',
      text: 'Auto-quarantine them. Better safe than sorry.',
      minutesAgo: 40,
    },
    {
      senderType: 'agent',
      text: "Quarantine activated. I've blocked 23 additional emails matching the phishing pattern. The sender domain has been added to the blocklist.\n\nSpam rate is now back down to 28%. I'll keep monitoring.",
      minutesAgo: 39,
      status: 'success',
    },
    {
      senderType: 'user',
      text: 'Perfect, thank you. Keep me updated if anything changes.',
      minutesAgo: 35,
    },
    {
      senderType: 'agent',
      text: "Will do. Everything looks stable now. I'll send you the end-of-day report at 6pm as usual.",
      minutesAgo: 34,
    },
  ];

  for (const msg of emailMessages) {
    const createdAt = new Date(Date.now() - msg.minutesAgo * 60 * 1000);
    await prisma.message.create({
      data: {
        channelId: emailClassifier.id,
        senderType: msg.senderType,
        senderId: msg.senderType === 'agent' ? emailClassifier.id : user.id,
        text: msg.text,
        status: (msg as Record<string, unknown>).status as string | undefined,
        createdAt,
      },
    });
  }
  console.log(
    `  ✓ ${emailMessages.length} messages for "${emailClassifier.name}"`,
  );

  // Agent 1 (Code Review Bot) — short conversation
  const codeReview = agents[1]!;
  const codeMessages = [
    {
      senderType: 'agent',
      text: "New PR opened: **#142 — Add rate limiting middleware**\nAuthor: @jsmith\nFiles changed: 3 (+87 / -12)\n\nI'll start the review now.",
      minutesAgo: 60,
    },
    {
      senderType: 'agent',
      text: 'Review complete for PR #142:\n\n✅ No security issues found\n⚠️ 1 suggestion: The rate limit config should be loaded from environment variables instead of hardcoded.\n✅ Test coverage looks good (2 new tests added)\n\nOverall: **Approved with minor suggestion**',
      minutesAgo: 55,
      status: 'success',
    },
    {
      senderType: 'user',
      text: 'Merge it, the suggestion can be a follow-up.',
      minutesAgo: 50,
    },
  ];

  for (const msg of codeMessages) {
    const createdAt = new Date(Date.now() - msg.minutesAgo * 60 * 1000);
    await prisma.message.create({
      data: {
        channelId: codeReview.id,
        senderType: msg.senderType,
        senderId: msg.senderType === 'agent' ? codeReview.id : user.id,
        text: msg.text,
        status: (msg as Record<string, unknown>).status as string | undefined,
        createdAt,
      },
    });
  }
  console.log(`  ✓ ${codeMessages.length} messages for "${codeReview.name}"`);

  // Agent 2 (Customer Support) — a few messages
  const support = agents[2]!;
  const supportMessages = [
    {
      senderType: 'agent',
      text: "New ticket #891: Customer reports they can't access their dashboard after password reset.\nPriority: High\nCustomer: Enterprise plan",
      minutesAgo: 90,
    },
    {
      senderType: 'user',
      text: 'Check if their session was invalidated properly. If so, ask them to clear cookies.',
      minutesAgo: 85,
    },
    {
      senderType: 'agent',
      text: 'Session was properly invalidated. I\'ve sent the customer a response with cookie-clearing instructions and a direct login link. Ticket updated to "Waiting for Customer".',
      minutesAgo: 83,
      status: 'info',
    },
  ];

  for (const msg of supportMessages) {
    const createdAt = new Date(Date.now() - msg.minutesAgo * 60 * 1000);
    await prisma.message.create({
      data: {
        channelId: support.id,
        senderType: msg.senderType,
        senderId: msg.senderType === 'agent' ? support.id : user.id,
        text: msg.text,
        status: (msg as Record<string, unknown>).status as string | undefined,
        createdAt,
      },
    });
  }
  console.log(`  ✓ ${supportMessages.length} messages for "${support.name}"`);

  // Agent 3 (Data Pipeline Monitor) — no messages yet (new agent)
  console.log(`  ✓ 0 messages for "${agents[3]!.name}" (new agent)`);

  // ── Summary ────────────────────────────────────────────────────
  console.log('\n🌱 Seed complete!');
  console.log(`  ${agents.length} agents created`);
  console.log(
    `  ${emailMessages.length + codeMessages.length + supportMessages.length} messages created`,
  );
  console.log('\n  Login: admin@humanproxy.local / changeme');
  console.log(`  API Key: ${rawKey}`);
  console.log('\n  Chat IDs:');
  for (const a of agents) {
    console.log(`    ${a.name}: ${a.id}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
