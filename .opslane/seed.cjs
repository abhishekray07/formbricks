// Seeds a login-ready account for Opslane Verify cloud checks.
// Mounted read-only at /opslane; run with NODE_PATH=/home/nextjs/node_modules so @prisma/client
// resolves from the production image. The image doesn't ship bcryptjs, so the password hash is
// precomputed: bcrypt(10) of "OpslaneVerify123!".
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const EMAIL = "admin@formbricks.local";
const PASSWORD_HASH = "$2a$10$XJemoxBSkNaynGqgvH5jmOkq3o8qo1lsHquOPUfuKB8CLer/XY5Ty";
const ORGANIZATION_ID = "opslaneorg0000000000000";
const WORKSPACE_ID = "opslanews00000000000000";

const DEFAULT_ATTRIBUTE_KEYS = [
  { name: "Email", key: "email", isUnique: true, type: "default" },
  { name: "First Name", key: "firstName", isUnique: false, type: "default" },
  { name: "Last Name", key: "lastName", isUnique: false, type: "default" },
  { name: "userId", key: "userId", isUnique: true, type: "default" },
  { name: "Language", key: "language", isUnique: false, type: "default" },
];

async function main() {
  const organization = await prisma.organization.upsert({
    where: { id: ORGANIZATION_ID },
    update: {},
    create: { id: ORGANIZATION_ID, name: "Opslane Org" },
  });

  await prisma.organizationBilling.upsert({
    where: { organizationId: organization.id },
    update: {},
    create: {
      organizationId: organization.id,
      limits: { workspaces: 3, monthly: { responses: 1500 } },
      usageCycleAnchor: new Date(),
    },
  });

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { password: PASSWORD_HASH, emailVerified: new Date() },
    create: {
      name: "Opslane Admin",
      email: EMAIL,
      password: PASSWORD_HASH,
      emailVerified: new Date(),
    },
  });

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: organization.id } },
    update: { role: "owner", accepted: true },
    create: { userId: user.id, organizationId: organization.id, role: "owner", accepted: true },
  });

  const workspace = await prisma.workspace.upsert({
    where: { id: WORKSPACE_ID },
    update: {},
    create: { id: WORKSPACE_ID, name: "Opslane Workspace", organizationId: organization.id },
  });

  for (const attr of DEFAULT_ATTRIBUTE_KEYS) {
    await prisma.contactAttributeKey.upsert({
      where: { key_workspaceId: { key: attr.key, workspaceId: workspace.id } },
      update: {},
      create: { ...attr, workspaceId: workspace.id },
    });
  }

  console.log(`Seeded ${EMAIL} (owner of "${organization.name}", workspace ${workspace.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
