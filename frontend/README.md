# Frontend

Responsive Netflix-inspired single-page app built with React + TypeScript and Vite.

## Features

- **Header/navigation** with brand, links, and a search box (`components/Header.tsx`)
- **Hero/banner** for the featured title (`components/Hero.tsx`)
- **Category rows** of horizontally scrollable content (`components/CategoryRow.tsx`)
- **Content cards** with hover scale + keyboard support (`components/ContentCard.tsx`)
- **Search UI** with dedicated results page (`pages/SearchPage.tsx`)
- **Details page** with backdrop, tags, and metadata (`pages/DetailsPage.tsx`)
- **Loading states** (spinner + skeletons) and **error states** with retry
  (`components/States.tsx`)
- **Mobile responsiveness** via responsive CSS (`styles.css`)

## Architecture

```
src/
├── api/client.ts     typed fetch client + ApiError (base URL from env)
├── hooks/useAsync.ts generic async/loading/error hook with AbortController
├── types.ts          shared Content/Category types (mirror backend contract)
├── components/        Header, Hero, CategoryRow, ContentCard, States
├── pages/             HomePage, SearchPage, DetailsPage
├── App.tsx            router
└── main.tsx           entrypoint
```

## Prerequisites

- Node.js >= 18 and npm
- The backend running (default `http://localhost:4000`)

## Setup & run (local)

```bash
cd frontend
cp .env.example .env         # optional; defaults to the Vite proxy at /api/v1
npm install
npm run dev                  # http://localhost:5173
```

The dev server proxies `/api` → `http://localhost:4000` (see `vite.config.ts`), so
run the backend first.

Build:

```bash
npm run build
npm run preview
```
