import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient, Priority, TaskStatus } from "@prisma/client";
import { z } from "zod";

const db = new PrismaClient();
const app = express();
const port = Number(process.env.PORT || 4000);
const origin = process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.use(helmet());
app.use(cors({ origin, credentials:true }));
app.use(express.json({ limit:"100kb" }));
app.use(cookieParser());
app.use(rateLimit({ windowMs: 15*60*1000, limit: 200 }));

const authSchema = z.object({name:z.string().min(1).max(80).optional(),email:z.string().email(),password:z.string().min(8).max(128)});
function sign(id:string){ return jwt.sign({sub:id}, process.env.JWT_SECRET!, {expiresIn:"7d"}); }
function auth(req:express.Request,res:express.Response,next:express.NextFunction){
  try { const token=req.cookies.session; if(!token) return res.status(401).json({error:"Unauthorized"});
    const p=jwt.verify(token,process.env.JWT_SECRET!) as {sub:string}; (req as any).userId=p.sub; next();
  } catch { return res.status(401).json({error:"Invalid session"}); }
}
function owner(req:any){ return req.userId as string; }

app.get("/api/health",(_,res)=>res.json({ok:true}));
app.post("/api/auth/signup",async(req,res)=>{
  const p=authSchema.parse(req.body); if(!p.name) return res.status(400).json({error:"Name required"});
  if(await db.user.findUnique({where:{email:p.email}})) return res.status(409).json({error:"Email already registered"});
  const user=await db.user.create({data:{name:p.name,email:p.email,passwordHash:await bcrypt.hash(p.password,12),preferences:{create:{}}},select:{id:true,name:true,email:true}});
  res.cookie("session",sign(user.id),{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:7*86400000});
  res.json({user});
});
app.post("/api/auth/login",async(req,res)=>{
  const p=authSchema.pick({email:true,password:true}).parse(req.body); const u=await db.user.findUnique({where:{email:p.email}});
  if(!u || !(await bcrypt.compare(p.password,u.passwordHash))) return res.status(401).json({error:"Invalid email or password"});
  res.cookie("session",sign(u.id),{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:7*86400000});
  res.json({user:{id:u.id,name:u.name,email:u.email}});
});
app.post("/api/auth/logout",(req,res)=>{res.clearCookie("session");res.json({ok:true})});
app.get("/api/me",auth,async(req:any,res)=>res.json(await db.user.findUnique({where:{id:owner(req)},select:{id:true,name:true,email:true,preferences:true}})));

app.get("/api/dashboard",auth,async(req:any,res)=>{
  const uid=owner(req); const [tasks,events,reminders,goals,notifications]=await Promise.all([
    db.task.findMany({where:{userId:uid},orderBy:[{status:"asc"},{position:"asc"},{dueAt:"asc"}],take:30}),
    db.event.findMany({where:{userId:uid},orderBy:{startAt:"asc"},take:20}),
    db.reminder.findMany({where:{userId:uid},orderBy:{remindAt:"asc"},take:20}),
    db.goal.findMany({where:{userId:uid},orderBy:{updatedAt:"desc"},take:10}),
    db.notification.findMany({where:{userId:uid,read:false},orderBy:{createdAt:"desc"},take:20})
  ]); res.json({tasks,events,reminders,goals,notifications});
});

app.get("/api/tasks",auth,async(req:any,res)=>res.json(await db.task.findMany({where:{userId:owner(req)},orderBy:{position:"asc"}})));
app.post("/api/tasks",auth,async(req:any,res)=>{
  const s=z.object({title:z.string().min(1).max(200),description:z.string().max(2000).optional(),dueAt:z.coerce.date().optional(),priority:z.nativeEnum(Priority).optional(),category:z.string().max(80).optional()}).parse(req.body);
  res.json(await db.task.create({data:{...s,userId:owner(req)}}));
});
app.patch("/api/tasks/:id",auth,async(req:any,res)=>{
  const s=z.object({title:z.string().min(1).max(200).optional(),description:z.string().max(2000).optional(),dueAt:z.coerce.date().nullable().optional(),priority:z.nativeEnum(Priority).optional(),category:z.string().max(80).optional(),status:z.nativeEnum(TaskStatus).optional(),position:z.number().int().optional()}).parse(req.body);
  const found=await db.task.findFirst({where:{id:req.params.id,userId:owner(req)}}); if(!found) return res.status(404).json({error:"Not found"});
  res.json(await db.task.update({where:{id:found.id},data:s}));
});
app.delete("/api/tasks/:id",auth,async(req:any,res)=>{const r=await db.task.deleteMany({where:{id:req.params.id,userId:owner(req)}});res.json({deleted:r.count})});

app.get("/api/notes",auth,async(req:any,res)=>res.json(await db.note.findMany({where:{userId:owner(req)},orderBy:{updatedAt:"desc"}})));
app.post("/api/notes",auth,async(req:any,res)=>{const s=z.object({title:z.string().min(1),content:z.string(),category:z.string().optional(),pinned:z.boolean().optional()}).parse(req.body);res.json(await db.note.create({data:{...s,userId:owner(req)}}))});
app.patch("/api/notes/:id",auth,async(req:any,res)=>{const s=z.object({title:z.string().optional(),content:z.string().optional(),category:z.string().optional(),pinned:z.boolean().optional()}).parse(req.body);res.json(await db.note.updateMany({where:{id:req.params.id,userId:owner(req)},data:s}))});
app.delete("/api/notes/:id",auth,async(req:any,res)=>res.json(await db.note.deleteMany({where:{id:req.params.id,userId:owner(req)}})));

app.get("/api/goals",auth,async(req:any,res)=>res.json(await db.goal.findMany({where:{userId:owner(req)},orderBy:{updatedAt:"desc"}})));
app.post("/api/goals",auth,async(req:any,res)=>{const s=z.object({title:z.string().min(1),description:z.string().optional(),targetDate:z.coerce.date().optional(),progress:z.number().min(0).max(100).optional()}).parse(req.body);res.json(await db.goal.create({data:{...s,userId:owner(req)}}))});
app.patch("/api/goals/:id",auth,async(req:any,res)=>{const s=z.object({title:z.string().optional(),description:z.string().optional(),targetDate:z.coerce.date().nullable().optional(),progress:z.number().min(0).max(100).optional()}).parse(req.body);res.json(await db.goal.updateMany({where:{id:req.params.id,userId:owner(req)},data:s}))});

app.get("/api/events",auth,async(req:any,res)=>res.json(await db.event.findMany({where:{userId:owner(req)},orderBy:{startAt:"asc"}})));
app.post("/api/events",auth,async(req:any,res)=>{const s=z.object({title:z.string().min(1),description:z.string().optional(),startAt:z.coerce.date(),endAt:z.coerce.date(),reminderAt:z.coerce.date().optional()}).parse(req.body);res.json(await db.event.create({data:{...s,userId:owner(req)}}))});
app.delete("/api/events/:id",auth,async(req:any,res)=>res.json(await db.event.deleteMany({where:{id:req.params.id,userId:owner(req)}})));

app.get("/api/reminders",auth,async(req:any,res)=>res.json(await db.reminder.findMany({where:{userId:owner(req)},orderBy:{remindAt:"asc"}})));
app.post("/api/reminders",auth,async(req:any,res)=>{const s=z.object({title:z.string().min(1),remindAt:z.coerce.date(),recurrence:z.enum(["ONCE","DAILY","WEEKLY","CUSTOM"]).optional()}).parse(req.body);res.json(await db.reminder.create({data:{...s,userId:owner(req)}}))});
app.delete("/api/reminders/:id",auth,async(req:any,res)=>res.json(await db.reminder.deleteMany({where:{id:req.params.id,userId:owner(req)}})));

app.get("/api/conversations",auth,async(req:any,res)=>res.json(await db.conversation.findMany({where:{userId:owner(req)},include:{messages:true},orderBy:{updatedAt:"desc"}})));
app.post("/api/ai/chat",auth,async(req:any,res)=>{
  const body=z.object({conversationId:z.string().optional(),message:z.string().min(1).max(10000)}).parse(req.body); const uid=owner(req);
  if(!process.env.AI_API_KEY) return res.status(503).json({error:"AI is not configured. Set AI_API_KEY on the server."});
  let convo=body.conversationId?await db.conversation.findFirst({where:{id:body.conversationId,userId:uid},include:{messages:true}}):null;
  if(!convo) convo=await db.conversation.create({data:{userId:uid,title:body.message.slice(0,60)},include:{messages:true}});
  await db.message.create({data:{conversationId:convo.id,role:"user",content:body.message}});
  const context=await db.$transaction([
    db.task.findMany({where:{userId:uid,status:{not:"COMPLETED"}},take:20}),
    db.goal.findMany({where:{userId:uid},take:10}),
    db.note.findMany({where:{userId:uid},take:10})
  ]);
  const system=`You are Daily AI Assistant. Be concise, practical, supportive, and never claim an action happened unless the backend performed it. User context: ${JSON.stringify(context)}`;
  const messages=[{role:"system",content:system},...convo.messages.slice(-12).map(m=>({role:m.role,content:m.content})),{role:"user",content:body.message}];
  const r=await fetch(process.env.AI_API_URL!,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${process.env.AI_API_KEY}`},body:JSON.stringify({model:process.env.AI_MODEL||"gpt-4o-mini",messages,temperature:.4})});
  if(!r.ok) return res.status(502).json({error:"AI provider request failed"});
  const j:any=await r.json(); const answer=j.choices?.[0]?.message?.content; if(!answer) return res.status(502).json({error:"AI provider returned no response"});
  await db.message.create({data:{conversationId:convo.id,role:"assistant",content:answer}});
  res.json({conversationId:convo.id,answer});
});

app.get("/api/preferences",auth,async(req:any,res)=>res.json(await db.userPreferences.findUnique({where:{userId:owner(req)}})));
app.patch("/api/preferences",auth,async(req:any,res)=>{const s=z.object({timezone:z.string().optional(),language:z.string().optional(),theme:z.string().optional(),personality:z.string().optional(),studyTimes:z.any().optional(),storedMemory:z.any().optional()}).parse(req.body);res.json(await db.userPreferences.update({where:{userId:owner(req)},data:s}))});

app.get("/api/productivity",auth,async(req:any,res)=>{
  const uid=owner(req); const tasks=await db.task.findMany({where:{userId:uid}}); const sessions=await db.studySession.findMany({where:{userId:uid}});
  const completed=tasks.filter(t=>t.status==="COMPLETED").length; const total=tasks.length;
  res.json({completed,total,remaining:total-completed,completionRate:total?Math.round(completed/total*100):0,studyMinutes:sessions.reduce((a,s)=>a+s.minutes,0),focusSessions:sessions.length});
});

app.use((err:any,_req:any,res:any,_next:any)=>{ if(err instanceof z.ZodError) return res.status(400).json({error:"Invalid input",details:err.issues}); console.error(err); res.status(500).json({error:"Internal server error"});});
app.listen(port,()=>console.log(`API listening on ${port}`));