# CivicConnect Deployment Guide

This guide walks you through deploying the full-stack CivicConnect platform permanently and for free using **GitHub**, **Render** (Backend API), and **Vercel** (Frontend).

---

## Pre-requisite: MongoDB Atlas Network Access
Before deploying, make sure your MongoDB database allows connections from cloud servers:
1. Go to [MongoDB Atlas](https://cloud.mongodb.com).
2. In the left sidebar, click **Network Access** (under Security).
3. Check if `0.0.0.0/0` (Allow Access from Anywhere) is listed.
4. If not, click **Add IP Address** -> Select **Allow Access from Anywhere** (`0.0.0.0/0`) -> Click **Confirm**.

---

## Step 1: Push your code to GitHub

1. Create a new repository on [GitHub](https://github.com/new) named `civic-issue-platform`.
2. Link your local project and push your code:
```bash
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/civic-issue-platform.git
git branch -M main
git push -u origin main
```

---

## Step 2: Deploy Backend to Render (Free)

1. Sign up or log in at [Render.com](https://render.com).
2. Click **New +** -> **Web Service**.
3. Choose **Build and deploy from a Git repository** and connect your `civic-issue-platform` repo.
4. Configure the service settings:
   - **Name**: `civicconnect-backend` (or your choice)
   - **Region**: Closest to you (e.g., Singapore or Frankfurt)
   - **Branch**: `main`
   - **Root Directory**: `civicconnect-backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
5. Scroll down to **Environment Variables** and add:
   - `NODE_ENV`: `production`
   - `PORT`: `10000`
   - `MONGODB_URI`: `mongodb+srv://yashshinde_db_user:yash9110shinde@civicconnect.y7twdla.mongodb.net/civicconnect?retryWrites=true&w=majority&appName=CivicConnect`
   - `JWT_SECRET`: `civicconnect_secure_jwt_secret_production_2026`
   - `GOOGLE_CLIENT_ID`: `211200375921-kdrehhhd8vkh5s5bn2a8vmqkrj3ek5lm.apps.googleusercontent.com`
   - `FRONTEND_URL`: `*` (or your Vercel URL once generated in Step 3)
6. Click **Deploy Web Service**.
7. Once deployed, copy your Render backend URL (e.g. `https://civicconnect-backend-xxxx.onrender.com`).

---

## Step 3: Deploy Frontend to Vercel (Free)

1. Sign up or log in at [Vercel.com](https://vercel.com).
2. Click **Add New...** -> **Project**.
3. Import your `civic-issue-platform` repository.
4. Configure the project:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `./` (leave default)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Expand **Environment Variables** and add:
   - **`VITE_API_BASE_URL`**: Your Render backend URL from Step 2 (e.g., `https://civicconnect-backend-xxxx.onrender.com` without trailing slash)
   - **`VITE_GOOGLE_CLIENT_ID`**: `211200375921-kdrehhhd8vkh5s5bn2a8vmqkrj3ek5lm.apps.googleusercontent.com`
6. Click **Deploy**.
7. In about 1 minute, Vercel will give you a live production URL (e.g., `https://civic-issue-platform.vercel.app`)!

---

## Step 4: Final Touch (CORS / Frontend URL)
1. Go back to your [Render Dashboard](https://dashboard.render.com).
2. Open your backend service -> **Environment**.
3. Update `FRONTEND_URL` to your Vercel production URL (e.g. `https://civic-issue-platform.vercel.app`).
4. Save changes.

Your website is now **100% live** and accessible globally!
