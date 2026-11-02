import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";
import { PrismaClient, Priority, TaskStatus } from "@prisma/client";
import { z } from "zod";

const db = new PrismaClient();
const app = express();

app.set("trust proxy", 1);
app.disable("etag");

const port = Number(process.env.PORT || 4000);
const jwtSecret = process.env.JWT_SECRET;
console.log("JWT_SECRET diagnostic:", {
  exists: Boolean(jwtSecret),
  length: jwtSecret?.length ?? 0,
});
const adminEmails = new Set(
  (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error(
    "JWT_SECRET must be configured with at least 32 characters."
  );
}

const allowedOrigins = new Set(
  (process.env.CLIENT_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
type SessionCookieSameSite = "lax" | "strict" | "none";
const sessionCookieSameSite = (process.env.SESSION_COOKIE_SAME_SITE || "lax").toLowerCase();
if (!["lax", "strict", "none"].includes(sessionCookieSameSite)) {
  throw new Error("SESSION_COOKIE_SAME_SITE must be lax, strict, or none.");
}
const typedSessionCookieSameSite = sessionCookieSameSite as SessionCookieSameSite;
const sessionCookieSecure = process.env.NODE_ENV === "production" || sessionCookieSameSite === "none";

const smtpHost = process.env.SMTP_HOST;
const smtpFrom = process.env.SMTP_FROM;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpPort = Number(process.env.SMTP_PORT || 587);

if (Boolean(smtpUser) !== Boolean(smtpPass)) {
  throw new Error("SMTP_USER and SMTP_PASS must either both be set or both be empty.");
}
if (smtpHost && (!smtpFrom || !Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535)) {
  throw new Error("Configure SMTP_FROM and a valid SMTP_PORT when SMTP_HOST is set.");
}

const mailTransport = smtpHost && smtpFrom
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      ...(smtpUser && smtpPass ? { auth: { user: smtpUser, pass: smtpPass } } : {}),
    })
  : null;

// --------------------------------------------------
// MIDDLEWARE — FIXED: Helmet + Dev Mode Compatibility
// --------------------------------------------------
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    ...(process.env.NODE_ENV !== "production" && {
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  })
);

app.use(
  cors({
    origin(requestOrigin, callback) {
      const isDevelopmentFrontend =
        process.env.NODE_ENV !== "production" &&
        requestOrigin !== undefined &&
        (requestOrigin === "capacitor://localhost" ||
          /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(
            requestOrigin
          ) ||
          /^https:\/\/[a-z0-9-]+-\d+\.app\.github\.dev$/i.test(requestOrigin));

      if (
        !requestOrigin ||
        allowedOrigins.has(requestOrigin) ||
        isDevelopmentFrontend
      ) {
        return callback(null, true);
      }
      return callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
  })
);

// Prevent cached API responses
app.use("/api", (_req, res, next) => {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, private"
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 200,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  })
);

// --------------------------------------------------
// AUTHENTICATION HELPERS
// --------------------------------------------------
const authSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(8).max(128),
});
const dummyPasswordHash = bcrypt.hashSync(randomBytes(32).toString("hex"), 12);

function sign(id: string, authVersion: number): string {
  return jwt.sign({ sub: id, authVersion }, jwtSecret!, {
    expiresIn: "7d",
  });
}

function setSessionCookie(
  _req: express.Request,
  res: express.Response,
  token: string
) {
  res.cookie("session", token, {
    httpOnly: true,
    secure: sessionCookieSecure,
    sameSite: typedSessionCookieSameSite,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearSessionCookie(res: express.Response) {
  res.clearCookie("session", {
    httpOnly: true,
    secure: sessionCookieSecure,
    sameSite: typedSessionCookieSameSite,
    path: "/",
  });
}

async function auth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  let payload: jwt.JwtPayload;
  try {
    const token = req.cookies?.session;
    if (!token) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    payload = jwt.verify(token, jwtSecret!) as jwt.JwtPayload;
  } catch {
    clearSessionCookie(res);
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  if (typeof payload.sub !== "string") {
    clearSessionCookie(res);
    return res.status(401).json({ error: "Invalid session" });
  }

  const user = await db.user.findUnique({
    where: { id: payload.sub },
    select: { authVersion: true },
  });
  const authVersion = typeof payload.authVersion === "number" ? payload.authVersion : 0;
  if (!user || user.authVersion !== authVersion) {
    clearSessionCookie(res);
    return res.status(401).json({ error: "Session expired. Please sign in again." });
  }

  (req as any).userId = payload.sub;
  return next();
}

function owner(req: any): string {
  return req.userId as string;
}

async function adminOnly(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const userId = (req as express.Request & { userId?: string }).userId;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user || !adminEmails.has(user.email.trim().toLowerCase())) {
    return res.status(403).json({ error: "Admin access required" });
  }

  return next();
}

// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many password reset requests. Try again later." },
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Try again in 15 minutes." },
});
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many account creation attempts. Try again later." },
});

const passwordResetEmailSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
});
const passwordResetSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit reset code."),
  password: z.string().min(8).max(128),
});

const emailVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many verification requests. Try again later." },
});
const emailVerificationEmailSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
});
const emailVerificationSchema = emailVerificationEmailSchema.extend({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit verification code."),
});

function hashVerificationCode(userId: string, code: string): string {
  return createHmac("sha256", jwtSecret!)
    .update(`${userId}:${code}`)
    .digest("hex");
}

async function sendEmailVerificationCode(user: { id: string; email: string }) {
  if (!mailTransport || !smtpFrom) {
    throw new Error("Email verification is not configured.");
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const codeHash = hashVerificationCode(user.id, code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db.emailVerificationCode.upsert({
    where: { userId: user.id },
    create: { userId: user.id, codeHash, expiresAt },
    update: { codeHash, expiresAt, attempts: 0, createdAt: new Date() },
  });

  try {
    await mailTransport.sendMail({
      from: smtpFrom,
      to: user.email,
      subject: "Verify your Daymate email",
      text: `Your verification code is ${code}. It expires in 10 minutes. If you did not create this account, you can ignore this email.`,
    });
  } catch (error) {
    await db.emailVerificationCode.deleteMany({
      where: { userId: user.id, codeHash },
    });
    throw error;
  }
}

app.post("/api/auth/verify-email", emailVerificationLimiter, async (req, res) => {
  const parsed = emailVerificationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Enter a valid email and 6-digit verification code." });
  }

  const user = await db.user.findFirst({
    where: { email: { equals: parsed.data.email, mode: "insensitive" } },
    select: { id: true, name: true, email: true, emailVerified: true, authVersion: true },
  });
  if (!user || user.emailVerified) {
    return res.status(400).json({ error: "This verification code is invalid or expired." });
  }

  const verification = await db.emailVerificationCode.findUnique({
    where: { userId: user.id },
  });
  const now = new Date();
  if (!verification || verification.expiresAt <= now || verification.attempts >= 5) {
    return res.status(400).json({ error: "This verification code is invalid or expired." });
  }

  const expectedHash = hashVerificationCode(user.id, parsed.data.code);
  const storedHash = Buffer.from(verification.codeHash, "hex");
  const submittedHash = Buffer.from(expectedHash, "hex");
  if (storedHash.length !== submittedHash.length || !timingSafeEqual(storedHash, submittedHash)) {
    await db.emailVerificationCode.updateMany({
      where: { id: verification.id, expiresAt: { gt: now }, attempts: { lt: 5 } },
      data: { attempts: { increment: 1 } },
    });
    return res.status(400).json({ error: "This verification code is invalid or expired." });
  }

  const verified = await db.$transaction(async (tx) => {
    const claimed = await tx.emailVerificationCode.deleteMany({
      where: {
        id: verification.id,
        codeHash: expectedHash,
        expiresAt: { gt: now },
        attempts: { lt: 5 },
      },
    });
    if (claimed.count !== 1) return false;
    await tx.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });
    return true;
  });
  if (!verified) {
    return res.status(400).json({ error: "This verification code is invalid or expired." });
  }

  setSessionCookie(req, res, sign(user.id, user.authVersion));
  return res.json({ user: { id: user.id, name: user.name, email: user.email } });
});

app.post("/api/auth/resend-verification", emailVerificationLimiter, async (req, res) => {
  const parsed = emailVerificationEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (!mailTransport || !smtpFrom) {
    return res.status(503).json({ error: "Email verification is not configured." });
  }

  const user = await db.user.findFirst({
    where: { email: { equals: parsed.data.email, mode: "insensitive" } },
    select: { id: true, email: true, emailVerified: true },
  });
  if (user && !user.emailVerified) {
    try {
      await sendEmailVerificationCode(user);
    } catch (error) {
      console.error("Verification email delivery failed:", error);
      return res.status(502).json({ error: "Unable to send the verification code. Please try again later." });
    }
  }
  return res.json({ message: "If that account needs verification, a new code has been sent." });
});

app.post("/api/auth/forgot-password", passwordResetLimiter, async (req, res) => {
  const parsed = passwordResetEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (!mailTransport || !smtpFrom) {
    return res.status(503).json({ error: "Password reset email is not configured." });
  }

  const user = await db.user.findFirst({
    where: { email: { equals: parsed.data.email, mode: "insensitive" } },
    select: { id: true, email: true },
  });
  if (user) {
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const codeHash = createHmac("sha256", jwtSecret!)
      .update(`${user.id}:${code}`)
      .digest("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.passwordResetToken.upsert({
      where: { userId: user.id },
      create: { userId: user.id, codeHash, expiresAt },
      update: { codeHash, expiresAt, attempts: 0, createdAt: new Date() },
    });

    try {
      await mailTransport.sendMail({
        from: smtpFrom,
        to: user.email,
        subject: "Your Daymate password reset code",
        text: `Your password reset code is ${code}. It expires in 10 minutes. If you did not request a password reset, you can ignore this email.`,
      });
    } catch (error) {
      await db.passwordResetToken.deleteMany({
        where: { userId: user.id, codeHash },
      });
      console.error("Password reset email delivery failed:", error);
    }
  }

  return res.json({
    message: "If an account exists for that email, a password reset code will be sent.",
  });
});

app.post("/api/auth/reset-password", passwordResetLimiter, async (req, res) => {
  const parsed = passwordResetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Enter a valid email, 6-digit reset code, and password between 8 and 128 characters.",
    });
  }

  const user = await db.user.findFirst({
    where: { email: { equals: parsed.data.email, mode: "insensitive" } },
    select: { id: true },
  });
  if (!user) {
    return res.status(400).json({ error: "This reset code is invalid or expired." });
  }

  const codeHash = createHmac("sha256", jwtSecret!)
    .update(`${user.id}:${parsed.data.code}`)
    .digest("hex");
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const now = new Date();
  const reset = await db.$transaction(async (tx) => {
    const resetCode = await tx.passwordResetToken.findUnique({
      where: { userId: user.id },
      select: { id: true, codeHash: true, expiresAt: true, attempts: true },
    });
    if (!resetCode || resetCode.expiresAt <= now || resetCode.attempts >= 5) return false;

    const storedHash = Buffer.from(resetCode.codeHash, "hex");
    const submittedHash = Buffer.from(codeHash, "hex");
    const matches =
      storedHash.length === submittedHash.length &&
      timingSafeEqual(storedHash, submittedHash);
    if (!matches) {
      await tx.passwordResetToken.updateMany({
        where: { id: resetCode.id, expiresAt: { gt: now }, attempts: { lt: 5 } },
        data: { attempts: { increment: 1 } },
      });
      return false;
    }

    const claimed = await tx.passwordResetToken.deleteMany({
      where: {
        id: resetCode.id,
        codeHash,
        expiresAt: { gt: now },
        attempts: { lt: 5 },
      },
    });
    if (claimed.count !== 1) return false;

    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        authVersion: { increment: 1 },
      },
    });
    return true;
  });

  if (!reset) {
    return res.status(400).json({ error: "This reset code is invalid or expired." });
  }
  return res.json({ message: "Password updated. You can now sign in." });
});

// --------------------------------------------------
// SIGNUP
// --------------------------------------------------
app.post("/api/auth/signup", signupLimiter, emailVerificationLimiter, async (req, res) => {
  const parsed = authSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid signup details",
      details: parsed.error.issues,
    });
  }

  const { name, email, password } = parsed.data;
  if (!name) {
    return res.status(400).json({ error: "Name required" });
  }

  if (!mailTransport || !smtpFrom) {
    return res.status(503).json({ error: "Email verification is not configured." });
  }

  const existing = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  if (existing) {
    if (!existing.emailVerified) {
      try {
        await sendEmailVerificationCode(existing);
      } catch (error) {
        console.error("Verification email delivery failed:", error);
        return res.status(502).json({ error: "Unable to send the verification code. Please try again later." });
      }
      return res.json({
        message: "A verification code has been sent to your email.",
      });
    }
    return res.status(409).json({ error: "Email already registered" });
  }

  const user = await db.user.create({
    data: {
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      emailVerified: false,
      preferences: { create: {} },
    },
    select: { id: true, email: true },
  });

  try {
    await sendEmailVerificationCode(user);
  } catch (error) {
    console.error("Verification email delivery failed:", error);
    return res.status(502).json({ error: "Unable to send the verification code. Please try again later." });
  }
  return res.status(201).json({ message: "A verification code has been sent to your email." });
});

// --------------------------------------------------
// LOGIN
// --------------------------------------------------
app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const parsed = authSchema
    .pick({ email: true, password: true })
    .safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid login details",
      details: parsed.error.issues,
    });
  }

  const { email, password } = parsed.data;
  const user = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });

  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? dummyPasswordHash);
  if (!user || !passwordMatches) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  if (!user.emailVerified) {
    return res.status(403).json({ error: "Please verify your email before signing in." });
  }

  setSessionCookie(req, res, sign(user.id, user.authVersion));
  return res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
  });
});

// --------------------------------------------------
// LOGOUT
// --------------------------------------------------
app.post("/api/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  return res.json({ ok: true });
});

// --------------------------------------------------
// CURRENT USER
// --------------------------------------------------
app.get("/api/me", auth, async (req: any, res) => {
  const user = await db.user.findUnique({
    where: { id: owner(req) },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      createdAt: true,
      preferences: true,
    },
  });

  if (!user) {
    clearSessionCookie(res);
    return res.status(401).json({ error: "User no longer exists" });
  }

  return res.status(200).json({
    ...user,
    isAdmin: adminEmails.has(user.email.trim().toLowerCase()),
  });
});

app.patch("/api/account/profile", auth, async (req: any, res) => {
  const parsed = z.object({
    name: z.string().trim().min(1).max(80),
  }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Enter a name between 1 and 80 characters." });
  }

  const user = await db.user.update({
    where: { id: owner(req) },
    data: { name: parsed.data.name },
    select: { id: true, name: true, email: true, emailVerified: true },
  });
  return res.json(user);
});

app.post("/api/account/password", auth, async (req: any, res) => {
  const parsed = z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(8).max(128),
  }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "The new password must be 8–128 characters." });
  }

  const user = await db.user.findUnique({
    where: { id: owner(req) },
    select: { id: true, passwordHash: true, authVersion: true },
  });
  if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
    return res.status(400).json({ error: "Current password is incorrect." });
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12), authVersion: { increment: 1 } },
    select: { authVersion: true },
  });
  setSessionCookie(req, res, sign(user.id, updated.authVersion));
  return res.json({ ok: true });
});

app.get("/api/account/export", auth, async (req: any, res) => {
  const userId = owner(req);
  const data = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      createdAt: true,
      preferences: true,
      tasks: true,
      events: true,
      reminders: true,
      notes: true,
      goals: true,
      conversations: { include: { messages: true } },
      studySessions: true,
      notifications: true,
    },
  });
  if (!data) return res.status(404).json({ error: "Account not found." });
  res.setHeader("Content-Disposition", 'attachment; filename="daily-ai-data.json"');
  return res.json(data);
});

// --------------------------------------------------
// ADMIN
// --------------------------------------------------
app.get("/api/admin/overview", auth, adminOnly, async (_req, res) => {
  const [
    users,
    tasks,
    completedTasks,
    events,
    goals,
    notes,
    conversations,
  ] = await Promise.all([
    db.user.count(),
    db.task.count(),
    db.task.count({ where: { status: TaskStatus.COMPLETED } }),
    db.event.count(),
    db.goal.count(),
    db.note.count(),
    db.conversation.count(),
  ]);

  return res.json({
    users,
    tasks,
    completedTasks,
    events,
    goals,
    notes,
    conversations,
  });
});

app.get("/api/admin/users", auth, adminOnly, async (req, res) => {
  const querySchema = z.object({
    q: z.string().trim().max(100).optional().default(""),
    page: z.coerce.number().int().min(1).max(100_000).optional().default(1),
  });
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid user search",
      details: parsed.error.issues,
    });
  }

  const { q, page } = parsed.data;
  const pageSize = 20;
  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};
  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        _count: {
          select: {
            tasks: true,
            events: true,
            notes: true,
            goals: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return res.json({
    users,
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  });
});

// --------------------------------------------------
// DASHBOARD
// --------------------------------------------------
app.get("/api/dashboard", auth, async (req: any, res) => {
  const uid = owner(req);
  const now = new Date();
  const [tasks, taskCounts, activeGoalCount, events, reminders, goals, notifications] =
    await Promise.all([
      db.task.findMany({
        where: { userId: uid },
        orderBy: [
          { status: "asc" },
          { position: "asc" },
          { dueAt: "asc" },
        ],
        take: 30,
      }),
      db.task.groupBy({
        by: ["status"],
        where: { userId: uid },
        _count: { _all: true },
      }),
      db.goal.count({
        where: { userId: uid, progress: { lt: 100 } },
      }),
      db.event.findMany({
        where: { userId: uid, startAt: { gte: now } },
        orderBy: { startAt: "asc" },
        take: 20,
      }),
      db.reminder.findMany({
        where: { userId: uid, remindAt: { gte: now } },
        orderBy: { remindAt: "asc" },
        take: 20,
      }),
      db.goal.findMany({
        where: { userId: uid },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
      db.notification.findMany({
        where: { userId: uid, read: false },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

  return res.json({
    tasks,
    taskCounts: Object.fromEntries(taskCounts.map(({ status, _count }) => [status, _count._all])),
    activeGoalCount,
    events,
    reminders,
    goals,
    notifications,
  });
});

// --------------------------------------------------
// TASKS
// --------------------------------------------------
app.get("/api/tasks", auth, async (req: any, res) => {
  const tasks = await db.task.findMany({
    where: { userId: owner(req) },
    orderBy: { position: "asc" },
  });
  return res.json(tasks);
});

app.post("/api/tasks", auth, async (req: any, res) => {
  const schema = z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(2000).optional(),
    dueAt: z.coerce.date().optional(),
    priority: z.nativeEnum(Priority).optional(),
    category: z.string().max(80).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid task details",
      details: parsed.error.issues,
    });
  }

  const task = await db.task.create({
    data: {
      ...parsed.data,
      userId: owner(req),
    },
  });

  return res.status(201).json(task);
});

app.patch("/api/tasks/:id", auth, async (req: any, res) => {
  const schema = z.object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    dueAt: z.coerce.date().nullable().optional(),
    priority: z.nativeEnum(Priority).optional(),
    category: z.string().max(80).optional(),
    status: z.nativeEnum(TaskStatus).optional(),
    position: z.number().int().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid task update",
      details: parsed.error.issues,
    });
  }

  const found = await db.task.findFirst({
    where: {
      id: req.params.id,
      userId: owner(req),
    },
  });

  if (!found) {
    return res.status(404).json({ error: "Task not found" });
  }

  const task = await db.$transaction(async (tx) => {
    const updatedTask = await tx.task.update({
      where: { id: found.id },
      data: parsed.data,
    });
    if (found.status !== TaskStatus.COMPLETED && updatedTask.status === TaskStatus.COMPLETED) {
      const preferences = await tx.userPreferences.findUnique({
        where: { userId: owner(req) },
        select: { notificationPreferences: true },
      });
      const notificationSettings = z.object({ inApp: z.boolean() }).safeParse(preferences?.notificationPreferences);
      if (!notificationSettings.success || notificationSettings.data.inApp) {
        await tx.notification.create({
          data: {
            userId: owner(req),
            title: "Task completed",
            body: `"${updatedTask.title}" was marked complete.`,
          },
        });
      }
    }
    return updatedTask;
  });

  return res.json(task);
});

app.delete("/api/tasks/:id", auth, async (req: any, res) => {
  const result = await db.task.deleteMany({
    where: {
      id: req.params.id,
      userId: owner(req),
    },
  });
  return res.json({ deleted: result.count });
});

// --------------------------------------------------
// NOTES
// --------------------------------------------------
app.get("/api/notes", auth, async (req: any, res) => {
  const notes = await db.note.findMany({
    where: { userId: owner(req) },
    orderBy: { updatedAt: "desc" },
  });
  return res.json(notes);
});

app.post("/api/notes", auth, async (req: any, res) => {
  const schema = z.object({
    title: z.string().trim().min(1).max(200),
    content: z.string(),
    category: z.string().optional(),
    pinned: z.boolean().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid note details",
      details: parsed.error.issues,
    });
  }

  const note = await db.note.create({
    data: {
      ...parsed.data,
      userId: owner(req),
    },
  });

  return res.status(201).json(note);
});

app.patch("/api/notes/:id", auth, async (req: any, res) => {
  const schema = z.object({
    title: z.string().optional(),
    content: z.string().optional(),
    category: z.string().optional(),
    pinned: z.boolean().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid note update",
      details: parsed.error.issues,
    });
  }

  const result = await db.note.updateMany({
    where: {
      id: req.params.id,
      userId: owner(req),
    },
    data: parsed.data,
  });

  if (result.count === 0) {
    return res.status(404).json({ error: "Note not found" });
  }

  return res.json({ updated: result.count });
});

app.delete("/api/notes/:id", auth, async (req: any, res) => {
  const result = await db.note.deleteMany({
    where: {
      id: req.params.id,
      userId: owner(req),
    },
  });
  return res.json({ deleted: result.count });
});

// --------------------------------------------------
// GOALS
// --------------------------------------------------
app.get("/api/goals", auth, async (req: any, res) => {
  const goals = await db.goal.findMany({
    where: { userId: owner(req) },
    orderBy: { updatedAt: "desc" },
  });
  return res.json(goals);
});

app.post("/api/goals", auth, async (req: any, res) => {
  const schema = z.object({
    title: z.string().trim().min(1),
    description: z.string().optional(),
    targetDate: z.coerce.date().optional(),
    progress: z.number().min(0).max(100).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid goal details",
      details: parsed.error.issues,
    });
  }

  const goal = await db.goal.create({
    data: {
      ...parsed.data,
      userId: owner(req),
    },
  });

  return res.status(201).json(goal);
});

app.patch("/api/goals/:id", auth, async (req: any, res) => {
  const schema = z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    targetDate: z.coerce.date().nullable().optional(),
    progress: z.number().min(0).max(100).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid goal update",
      details: parsed.error.issues,
    });
  }

  const result = await db.goal.updateMany({
    where: {
      id: req.params.id,
      userId: owner(req),
    },
    data: parsed.data,
  });

  if (result.count === 0) {
    return res.status(404).json({ error: "Goal not found" });
  }

  return res.json({ updated: result.count });
});

app.delete("/api/goals/:id", auth, async (req: any, res) => {
  const result = await db.goal.deleteMany({
    where: {
      id: req.params.id,
      userId: owner(req),
    },
  });

  if (result.count === 0) {
    return res.status(404).json({ error: "Goal not found" });
  }

  return res.json({ deleted: result.count });
});

// --------------------------------------------------
// EVENTS
// --------------------------------------------------
app.get("/api/events", auth, async (req: any, res) => {
  const events = await db.event.findMany({
    where: { userId: owner(req) },
    orderBy: { startAt: "asc" },
  });
  return res.json(events);
});

app.post("/api/events", auth, async (req: any, res) => {
  const schema = z.object({
    title: z.string().trim().min(1),
    description: z.string().optional(),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    reminderAt: z.coerce.date().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid event details",
      details: parsed.error.issues,
    });
  }

  if (parsed.data.endAt <= parsed.data.startAt) {
    return res.status(400).json({
      error: "Event end time must be after its start time",
    });
  }
  if (parsed.data.reminderAt && parsed.data.reminderAt >= parsed.data.startAt) {
    return res.status(400).json({
      error: "Event reminder must be scheduled before the event starts",
    });
  }

  const event = await db.event.create({
    data: {
      ...parsed.data,
      userId: owner(req),
    },
  });

  return res.status(201).json(event);
});

app.patch("/api/events/:id", auth, async (req: any, res) => {
  const schema = z.object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
    reminderAt: z.coerce.date().nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid event update", details: parsed.error.issues });
  }

  const existing = await db.event.findFirst({
    where: { id: req.params.id, userId: owner(req) },
  });
  if (!existing) return res.status(404).json({ error: "Event not found" });

  const startAt = parsed.data.startAt ?? existing.startAt;
  const endAt = parsed.data.endAt ?? existing.endAt;
  const reminderAt = parsed.data.reminderAt === undefined
    ? existing.reminderAt
    : parsed.data.reminderAt;
  if (endAt <= startAt) {
    return res.status(400).json({ error: "Event end time must be after the start time" });
  }
  if (reminderAt && reminderAt >= startAt) {
    return res.status(400).json({ error: "Event reminder must be scheduled before the event starts" });
  }

  const event = await db.event.update({
    where: { id: existing.id },
    data: parsed.data,
  });
  return res.json(event);
});

app.delete("/api/events/:id", auth, async (req: any, res) => {
  const result = await db.event.deleteMany({
    where: {
      id: req.params.id,
      userId: owner(req),
    },
  });
  return res.json({ deleted: result.count });
});

// --------------------------------------------------
// REMINDERS
// --------------------------------------------------
app.get("/api/reminders", auth, async (req: any, res) => {
  const reminders = await db.reminder.findMany({
    where: { userId: owner(req) },
    orderBy: { remindAt: "asc" },
  });
  return res.json(reminders);
});

app.post("/api/reminders", auth, async (req: any, res) => {
  const schema = z.object({
    title: z.string().trim().min(1),
    remindAt: z.coerce.date(),
    recurrence: z
      .enum(["ONCE", "DAILY", "WEEKLY", "CUSTOM"])
      .optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid reminder details",
      details: parsed.error.issues,
    });
  }

  const reminder = await db.reminder.create({
    data: {
      ...parsed.data,
      userId: owner(req),
    },
  });

  return res.status(201).json(reminder);
});

app.delete("/api/reminders/:id", auth, async (req: any, res) => {
  const result = await db.reminder.deleteMany({
    where: {
      id: req.params.id,
      userId: owner(req),
    },
  });
  return res.json({ deleted: result.count });
});

// --------------------------------------------------
// CONVERSATIONS
// --------------------------------------------------
app.get("/api/conversations", auth, async (req: any, res) => {
  const conversations = await db.conversation.findMany({
    where: { userId: owner(req) },
    include: { messages: true },
    orderBy: { updatedAt: "desc" },
  });
  return res.json(conversations);
});

app.delete("/api/conversations", auth, async (req: any, res) => {
  const result = await db.conversation.deleteMany({
    where: { userId: owner(req) },
  });
  return res.json({ deleted: result.count });
});

app.get("/api/notifications", auth, async (req: any, res) => {
  const notifications = await db.notification.findMany({
    where: { userId: owner(req) },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return res.json(notifications);
});

app.patch("/api/notifications/:id", auth, async (req: any, res) => {
  const parsed = z.object({ read: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid notification update." });
  const result = await db.notification.updateMany({
    where: { id: req.params.id, userId: owner(req) },
    data: { read: parsed.data.read },
  });
  return res.json({ updated: result.count });
});

app.delete("/api/notifications", auth, async (req: any, res) => {
  const result = await db.notification.deleteMany({ where: { userId: owner(req) } });
  return res.json({ deleted: result.count });
});

app.post("/api/notifications/test", auth, async (req: any, res) => {
  const preferences = await db.userPreferences.findUnique({
    where: { userId: owner(req) },
    select: { notificationPreferences: true },
  });
  const settings = z.object({ inApp: z.boolean() }).safeParse(preferences?.notificationPreferences);
  if (settings.success && !settings.data.inApp) {
    return res.status(409).json({ error: "In-app notifications are turned off in your preferences." });
  }
  const notification = await db.notification.create({
    data: { userId: owner(req), title: "Test notification", body: "In-app notifications are working." },
  });
  return res.status(201).json(notification);
});

app.post("/api/feedback", auth, async (req, res) => {
  const parsed = z.object({
    message: z.string().trim().min(10).max(4000),
    category: z.enum(["feedback", "bug"]).default("feedback"),
  }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Please enter a message between 10 and 4,000 characters." });
  }
  const supportEmail = process.env.SUPPORT_EMAIL?.trim();
  const recipients = [...new Set([
    ...adminEmails,
    ...(supportEmail ? [supportEmail] : []),
  ])];
  if (!mailTransport || recipients.length === 0) {
    return res.status(503).json({
      error: "Feedback delivery is not configured. Set SMTP_HOST, SMTP_FROM, and ADMIN_EMAILS or SUPPORT_EMAIL on the server.",
    });
  }
  const user = await db.user.findUnique({ where: { id: owner(req) }, select: { name: true, email: true } });
  if (!user) return res.status(404).json({ error: "Account not found." });
  await mailTransport.sendMail({
    from: smtpFrom,
    to: recipients,
    replyTo: user.email,
    subject: `Daymate ${parsed.data.category} from ${user.name}`,
    text: `From: ${user.name} <${user.email}>\nType: ${parsed.data.category}\n\n${parsed.data.message}`,
  });
  return res.status(202).json({ ok: true });
});

// --------------------------------------------------
// AI CHAT
// --------------------------------------------------
app.post("/api/ai/chat", auth, async (req: any, res) => {
  const attachmentSchema = z.object({
    name: z.string().trim().min(1).max(120).refine(
      (name) => /\.(txt|md|csv|json)$/i.test(name),
      "Only text, Markdown, CSV, and JSON files are supported"
    ),
    content: z.string().max(16 * 1024).refine(
      (content) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(content),
      "Attached files must contain plain text"
    ),
  });
  const schema = z.object({
    conversationId: z.string().optional(),
    message: z.string().trim().max(10000),
    attachments: z.array(attachmentSchema).max(3).default([]),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid chat message",
      details: parsed.error.issues,
    });
  }

  const { conversationId, attachments } = parsed.data;
  const message = parsed.data.message;
  if (!message && attachments.length === 0) {
    return res.status(400).json({ error: "Enter a message or attach a file." });
  }

  const attachmentBytes = attachments.reduce(
    (total, attachment) => total + Buffer.byteLength(attachment.content, "utf8"),
    0
  );
  if (attachmentBytes > 24 * 1024) {
    return res.status(400).json({
      error: "Attached file contents must total 24 KB or less.",
    });
  }

  const userMessage = [
    message || "Please review the attached file(s).",
    ...attachments.map(
      ({ name, content }) => `\n\n--- Attached text file: ${name} ---\n${content}`
    ),
  ].join("");
  const uid = owner(req);

  if (!process.env.AI_API_KEY || !process.env.AI_API_URL) {
    return res.status(503).json({
      error: "AI is not configured. Set AI_API_KEY and AI_API_URL.",
    });
  }

  let convo = conversationId
    ? await db.conversation.findFirst({
        where: {
          id: conversationId,
          userId: uid,
        },
        include: { messages: true },
      })
    : null;

  if (!convo) {
    convo = await db.conversation.create({
      data: {
        userId: uid,
        title: (message || `Review ${attachments[0].name}`).slice(0, 60),
      },
      include: { messages: true },
    });
  }

  await db.$transaction([
    db.message.create({
      data: {
        conversationId: convo.id,
        role: "user",
        content: userMessage,
      },
    }),
    db.conversation.update({
      where: { id: convo.id },
      data: { updatedAt: new Date() },
    }),
  ]);

  const [tasks, goals, notes, preferences] = await db.$transaction([
    db.task.findMany({
      where: {
        userId: uid,
        status: { not: "COMPLETED" },
      },
      take: 20,
    }),
    db.goal.findMany({
      where: { userId: uid },
      take: 10,
    }),
    db.note.findMany({
      where: { userId: uid },
      take: 10,
    }),
    db.userPreferences.findUnique({
      where: { userId: uid },
      select: {
        personality: true,
        responseStyle: true,
        language: true,
        customInstructions: true,
      },
    }),
  ]);

  const personalityInstructions: Record<string, string> = {
    friendly: "Use a warm, casual, and approachable tone.",
    professional: "Use a clear, formal, and results-focused tone.",
    casual: "Use natural, relaxed, conversational language.",
    concise: "Be brief and prioritize the most useful answer.",
    detailed: "Explain thoroughly with useful context and examples.",
    motivational: "Be encouraging and connect advice to the user's goals.",
    study_tutor: "Teach step by step and help the user understand concepts.",
    productivity_coach: "Focus on organizing tasks, priorities, and routines.",
  };
  const personality =
    personalityInstructions[preferences?.personality ?? "friendly"] ??
    personalityInstructions.friendly;
  const responseStyles: Record<string, string> = {
    short: "Keep responses short and focused.",
    balanced: "Use a balanced level of detail.",
    detailed: "Provide a thorough response with relevant context.",
  };
  const responseStyle = responseStyles[preferences?.responseStyle ?? "balanced"] ??
    responseStyles.balanced;
  const preferredLanguage = preferences?.language && preferences.language !== "en"
    ? `Respond in the user's preferred language (language code: ${preferences.language}).`
    : "";
  const customInstructions = preferences?.customInstructions?.trim()
    ? `Additional user preferences: ${preferences.customInstructions.trim().slice(0, 2000)}`
    : "";
  const system = `You are Daymate, a personal AI assistant. ${personality} ${responseStyle} ${preferredLanguage} ${customInstructions} Never claim an action happened unless the backend performed it. User context: ${JSON.stringify({ tasks, goals, notes })}`;

  const messages = [
    { role: "system", content: system },
    ...convo.messages.slice(-12).map((item) => ({
      role: item.role,
      content: item.content,
    })),
    { role: "user", content: userMessage },
  ];

  const response = await fetch(process.env.AI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || "gpt-4o-mini",
      messages,
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    console.error("AI provider returned status:", response.status);
    return res.status(502).json({
      error: "AI provider request failed",
    });
  }

  const result: any = await response.json();
  const answer = result.choices?.[0]?.message?.content;

  if (typeof answer !== "string" || !answer.trim()) {
    return res.status(502).json({
      error: "AI provider returned no response",
    });
  }

  await db.message.create({
    data: {
      conversationId: convo.id,
      role: "assistant",
      content: answer,
    },
  });

  return res.json({
    conversationId: convo.id,
    answer,
  });
});

// --------------------------------------------------
// USER PREFERENCES
// --------------------------------------------------
app.get("/api/preferences", auth, async (req: any, res) => {
  const userId = owner(req);
  const preferences = await db.userPreferences.findUnique({
    where: { userId },
  });

  if (preferences) {
    return res.json(preferences);
  }

  return res.json({
    userId,
    timezone: "Asia/Manila",
    language: "en",
    theme: "dark",
    personality: "friendly",
    responseStyle: "balanced",
    customInstructions: "",
    startupPage: "Dashboard",
    notificationPreferences: {
      inApp: true,
      quietHoursEnabled: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
    },
  });
});

app.patch("/api/preferences", auth, async (req: any, res) => {
  const schema = z.object({
    timezone: z.string().optional(),
    language: z.string().optional(),
    theme: z.enum(["system", "light", "dark", "amoled"]).optional(),
    personality: z.enum(["friendly", "professional", "casual", "concise", "detailed"]).optional(),
    responseStyle: z.enum(["short", "balanced", "detailed"]).optional(),
    customInstructions: z.string().max(2000).optional(),
    startupPage: z.enum(["Dashboard", "AI Assistant", "Tasks", "Calendar", "Reminders", "Notes", "Goals", "Study Mode", "Productivity", "Settings"]).optional(),
    notificationPreferences: z.object({
      inApp: z.boolean(),
      quietHoursEnabled: z.boolean(),
      quietHoursStart: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
      quietHoursEnd: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    }).optional(),
    studyTimes: z.any().optional(),
    storedMemory: z.any().optional(),
    uiCustomization: z.object({
      themeMode: z.enum(["system", "light", "dark", "amoled"]),
      accent: z.enum(["electric-blue", "purple", "emerald", "sunset", "rose", "cyan", "custom"]),
      customAccent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      density: z.enum(["comfortable", "compact", "spacious"]),
      fontSize: z.enum(["small", "medium", "large"]),
      cornerStyle: z.enum(["rounded", "moderate", "square"]),
      navigation: z.enum(["sidebar", "bottom", "top"]),
      visualStyle: z.enum(["minimal", "modern", "glass"]),
      animationEnabled: z.boolean(),
      animationIntensity: z.enum(["off", "subtle", "smooth"]),
      backgroundAnimation: z.boolean(),
      background: z.enum(["soft", "plain", "gradient", "warm", "mint", "lavender"]),
      dashboardLayout: z.enum(["balanced", "focus"]),
      visibleWidgets: z.array(z.enum(["progress", "schedule", "goals", "tasks", "reminders"])).max(5),
      widgetOrder: z.array(z.enum(["progress", "schedule", "goals", "tasks", "reminders"])).max(5),
      greeting: z.string().max(80),
      highContrast: z.boolean(),
      interfaceScale: z.number().int().min(85).max(115),
    }).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid preferences",
      details: parsed.error.issues,
    });
  }

  const preferences = await db.userPreferences.upsert({
    where: { userId: owner(req) },
    update: parsed.data,
    create: {
      userId: owner(req),
      ...parsed.data,
    },
  });

  return res.json(preferences);
});

// --------------------------------------------------
// STUDY SESSIONS
// --------------------------------------------------
app.post("/api/study-sessions", auth, async (req: any, res) => {
  const schema = z.object({
    subject: z.string().trim().min(1).max(100),
    minutes: z.number().int().min(1).max(1440),
  });
  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid study session",
      details: parsed.error.issues,
    });
  }

  const session = await db.studySession.create({
    data: {
      ...parsed.data,
      userId: owner(req),
    },
  });

  return res.status(201).json(session);
});

// --------------------------------------------------
// PRODUCTIVITY
// --------------------------------------------------
app.get("/api/productivity", auth, async (req: any, res) => {
  const uid = owner(req);
  const weekStart = new Date();
  weekStart.setUTCHours(0, 0, 0, 0);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);

  const [tasks, sessions, weeklyTasks] = await Promise.all([
    db.task.findMany({
      where: { userId: uid },
      select: { status: true },
    }),
    db.studySession.findMany({
      where: { userId: uid },
      select: { minutes: true },
    }),
    db.task.findMany({
      where: {
        userId: uid,
        status: "COMPLETED",
        updatedAt: { gte: weekStart },
      },
      select: { updatedAt: true },
    }),
  ]);

  const completed = tasks.filter(
    (task) => task.status === "COMPLETED"
  ).length;
  const total = tasks.length;
  const weeklyCompleted = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setUTCDate(date.getUTCDate() + index);
    const dateKey = date.toISOString().slice(0, 10);

    return {
      day: new Intl.DateTimeFormat("en", {
        weekday: "short",
        timeZone: "UTC",
      }).format(date),
      completed: weeklyTasks.filter(
        (task) => task.updatedAt.toISOString().slice(0, 10) === dateKey
      ).length,
    };
  });

  return res.json({
    completed,
    total,
    remaining: total - completed,
    completionRate: total ? Math.round((completed / total) * 100) : 0,
    studyMinutes: sessions.reduce(
      (sum, session) => sum + session.minutes,
      0
    ),
    focusSessions: sessions.length,
    weeklyCompleted,
  });
});

// --------------------------------------------------
// ERROR HANDLING
// --------------------------------------------------
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    if (res.headersSent) return;

    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: "Invalid input",
        details: err.issues,
      });
    }

    if (err?.message === "Origin not allowed by CORS") {
      return res.status(403).json({
        error: "Frontend origin is not allowed by the server",
      });
    }

    console.error("API error:", err);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
);

// --------------------------------------------------
// START SERVER
// --------------------------------------------------
const server = app.listen(port, "0.0.0.0", () => {
  console.log(`✅ API listening on port ${port}`);
  console.log(`✅ NODE_ENV = ${process.env.NODE_ENV || "not set"}`);
});

async function shutdown() {
  server.close(async () => {
    await db.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);