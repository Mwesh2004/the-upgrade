# The Upgrade

**The Upgrade** is a modern, dark-themed editorial platform and newsletter explicitly designed for the modern generation. It explores the intersection of mental health, money, relationships, and modern culture through deeply relatable, unfiltered lenses.

## 🚀 Features
- **Dynamic Content Generation:** Comes with an engine to programmatically generate highly unique, styled, and thought-provoking articles across 8 core topics without duplication.
- **Serverless Architecture:** Built to run on Vercel with an Express serverless backend and a fast, static-first frontend.
- **Creator Portal:** A fully functional authentication portal (JWT) and dashboard for superadmins, editors, and moderators to manage issues, subscribers, and activity logs.
- **PostgreSQL Persistence:** The backend seamlessly initializes and connects to Vercel PostgreSQL, automatically migrating seed JSON data to resilient tables.
- **Rich Reading Experience:** Custom-built overlay reader supporting dynamic typography sizing, reading progress tracking, and integrated introspective questions ("One Honest Question to Sit With").

## 🛠️ Tech Stack
- **Frontend:** Vanilla JavaScript, CSS, HTML
- **Build Tool:** Vite
- **Backend:** Node.js, Express
- **Database:** PostgreSQL (`pg` module) & local JSON fallback
- **Auth:** JWT (`jsonwebtoken`), Cookie Parser

## ⚙️ Local Development Setup

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd the-upgrade
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   Create a `.env` file in the root directory:
   ```env
   # Database (Optional for local development; will fallback to JSON if empty)
   POSTGRES_URL=your_postgres_connection_string
   ```

4. **Run the local development environment:**
   This project uses `concurrently` to run both the Vite frontend and Express backend simultaneously.
   ```bash
   npm run dev
   ```

5. **Access the Application:**
   - Frontend: `http://localhost:5173`
   - Backend/API: `http://localhost:3000`

## ☁️ Deployment (Vercel)
This project is configured out-of-the-box for Vercel. 
1. Connect the repository to your Vercel account.
2. In the Vercel dashboard, attach a **Postgres Serverless Database**. This will automatically inject `POSTGRES_URL` into your environment variables.
3. Deploy! The system will automatically detect the database and run its internal schema migrations and initial JSON seeding.

## 👥 Managing Users
The initial "superadmin" user is provisioned automatically. You can access the Creator Portal at `/portal` and use the built-in management interface to add, edit, or delete users and assign specific RBAC permissions (e.g., `metrics:read`, `issues:write`).

---
*Built with ❤️ and designed to break the mold.*
