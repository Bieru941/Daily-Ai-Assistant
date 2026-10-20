import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const db = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("DemoPassword123!", 12);
  const user = await db.user.upsert({
    where: { email: "demo@example.com" },
    update: {},
    create: { name: "Alex", email: "demo@example.com", passwordHash }
  });
  await db.userPreferences.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id }});
  await db.task.createMany({ data: [
    { userId:user.id, title:"Finish Chemistry assignment", priority:"HIGH", category:"School" },
    { userId:user.id, title:"Review Pre-Calculus", priority:"MEDIUM", category:"Study" },
    { userId:user.id, title:"Work on programming project", priority:"MEDIUM", category:"Programming" }
  ]});
  await db.goal.createMany({ data:[
    { userId:user.id, title:"Improve Mathematics", progress:55 },
    { userId:user.id, title:"Learn Programming", progress:35 }
  ]});
}
main().finally(()=>db.$disconnect());