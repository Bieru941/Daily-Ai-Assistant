# Daily AI Assistant

A production-oriented full-stack starter for an AI-powered personal productivity assistant.

## Stack
- React + TypeScript + Vite
- Tailwind CSS
- Node.js + Express
- PostgreSQL + Prisma
- JWT-based HTTP-only cookie sessions
- OpenAI-compatible backend AI endpoint
- Recharts
- Lucide React

## Quick start

### 1. Requirements
- Node.js 20+
- PostgreSQL 15+

### 2. Install
```bash
npm install
npm install --prefix client
```

### 3. Environment
Copy `.env.example` to `.env` and set values.

### 4. Database
```bash
npx prisma generate
npx prisma migrate dev --name init
npm run seed
```

### 5. Run
```bash
npm run dev
```
Frontend: http://localhost:5173
API: http://localhost:4000

The AI key is server-side only. If it is missing, the UI reports that AI is unavailable rather than faking a response.
