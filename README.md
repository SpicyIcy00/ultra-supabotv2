# BI Dashboard - FastAPI + React

A production-ready Business Intelligence dashboard built with FastAPI (backend) and React (frontend), featuring AI-powered SQL queries using Claude API.

## 🚀 Features

- **FastAPI Backend**: Modern Python async API with SQLAlchemy 2.0
- **React Frontend**: Vite + TypeScript + Tailwind CSS
- **AI-Powered Analytics**: Natural language to SQL queries using Claude API
- **Real-time Updates**: WebSocket support for live data
- **Database**: PostgreSQL with async support
- **Caching**: Redis for performance optimization
- **Type Safety**: Full TypeScript + Pydantic validation

## 📊 Database Schema

- **products**: Product catalog with SKU, pricing, categories
- **stores**: Store locations and information
- **transactions**: Sales transactions
- **transaction_items**: Line items for each transaction
- **inventory**: Stock levels per store/product

## 🛠️ Tech Stack

### Backend
- FastAPI 0.110.0
- SQLAlchemy 2.0 (async)
- PostgreSQL + asyncpg
- Redis
- Anthropic Claude API
- Alembic (migrations)
- Poetry (dependency management)

### Frontend
- React 19
- TypeScript
- Vite
- TanStack Query (React Query)
- Zustand (state management)
- Recharts (data visualization)
- Tailwind CSS
- React Router v6

## 📦 Project Structure

```
bi-dashboard-migration/
├── backend/
│   ├── app/
│   │   ├── api/v1/routes/    # API endpoints
│   │   ├── core/              # Config, database, security
│   │   ├── models/            # SQLAlchemy models
│   │   ├── schemas/           # Pydantic schemas
│   │   ├── services/          # Business logic
│   │   └── utils/             # Helper functions
│   ├── alembic/               # Database migrations
│   ├── tests/                 # Backend tests
│   ├── main.py                # FastAPI app entry
│   ├── pyproject.toml         # Poetry dependencies
│   └── docker-compose.yml     # Local development
│
├── frontend/
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   ├── pages/             # Page components
│   │   ├── hooks/             # Custom React hooks
│   │   ├── services/          # API client
│   │   ├── stores/            # Zustand stores
│   │   ├── types/             # TypeScript types
│   │   └── utils/             # Helper functions
│   └── package.json
│
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 16+
- Redis 7+
- Poetry
- Docker (optional)

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
poetry install
```

3. Create `.env` file:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start database and Redis (using Docker):
```bash
docker-compose up -d postgres redis
```

5. Run migrations:
```bash
poetry run alembic upgrade head
```

6. Start the development server:
```bash
poetry run uvicorn main:app --reload
```

API will be available at `http://localhost:8000`
- Docs: `http://localhost:8000/api/v1/docs`
- ReDoc: `http://localhost:8000/api/v1/redoc`

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start the development server:
```bash
npm run dev
```

Frontend will be available at `http://localhost:5173`

### Using Docker Compose (Full Stack)

```bash
cd backend
docker-compose up
```

## 🧪 Testing

### Backend Tests
```bash
cd backend
poetry run pytest
```

### Frontend Tests
```bash
cd frontend
npm run test
```

## 📝 API Endpoints

### Products
- `GET /api/v1/products` - List products
- `GET /api/v1/products/{id}` - Get product
- `POST /api/v1/products` - Create product
- `PATCH /api/v1/products/{id}` - Update product
- `DELETE /api/v1/products/{id}` - Delete product

### Stores
- `GET /api/v1/stores` - List stores
- `GET /api/v1/stores/{id}` - Get store
- `POST /api/v1/stores` - Create store
- `PATCH /api/v1/stores/{id}` - Update store
- `DELETE /api/v1/stores/{id}` - Delete store

### Analytics
- `GET /api/v1/analytics/sales-metrics` - Get sales metrics
- `GET /api/v1/analytics/product-performance` - Top products
- `GET /api/v1/analytics/store-performance` - Store performance

### AI Queries
- `POST /api/v1/ai/query` - Execute AI-powered SQL query
- `POST /api/v1/ai/query/stream` - Stream AI responses

## 🚢 Deployment

### Backend (Railway)
1. Create new project on Railway
2. Add PostgreSQL and Redis services
3. Deploy from GitHub
4. Set environment variables

### Frontend (Vercel)
1. Import project in Vercel
2. Set build command: `npm run build`
3. Set output directory: `dist`
4. Set environment variables

## 🔐 Environment Variables

### Backend (.env)
```env
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/bidashboard
REDIS_URL=redis://localhost:6379/0
ANTHROPIC_API_KEY=your_key_here
SECRET_KEY=your_secret_key
CORS_ORIGINS=["http://localhost:5173"]
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:8000/api/v1
VITE_ANTHROPIC_API_KEY=your_key_here
```

## 📚 Documentation

- [Migration Plan](./MIGRATION_PLAN.md)
- [API Documentation](http://localhost:8000/api/v1/docs)
- [Database Schema](./docs/schema.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🙋‍♂️ Support

For issues and questions, please use the GitHub Issues page.

---

## 📊 React Dashboard

The React dashboard has been fully implemented and is now available!

### Access the Dashboard
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

### Dashboard Features

✅ **Real-time KPI Cards**
- Total Sales with growth indicators
- Transaction counts and trends
- Average transaction value
- Day-over-day growth percentages

✅ **Interactive Charts** (Recharts)
- Hourly Sales Bar Chart
- Store Performance Horizontal Bars
- Daily Trend Line/Area Chart
- Product Performance Bar Chart

✅ **Smart Filters** (Persisted to localStorage)
- Date range picker in header
- Store selection
- Category filtering
- One-click reset

✅ **Professional Dark Theme**
- Background: #0e1117
- Blue to purple gradients
- Responsive design
- Loading skeletons
- Error boundaries

### Tech Stack

**Frontend:**
- React 19 + TypeScript
- TanStack Query for data fetching
- Zustand for state management
- Recharts for visualizations
- Tailwind CSS for styling
- Axios for API calls

**State Management:**
- Date filters persist to localStorage
- Automatic refetch on window focus
- 5-minute stale time
- Smart caching

### Running the Dashboard

```bash
# Terminal 1: Start Backend
cd backend
poetry run python run_server.py

# Terminal 2: Start Frontend
cd frontend
npm run dev
```

Then open http://localhost:5173 in your browser!

### API Integration

All endpoints are fully integrated and tested:
- ✅ Sales by Hour (with store filtering)
- ✅ Store Performance (top 10 stores)
- ✅ Daily Trend (30 days)
- ✅ KPI Metrics (day-over-day comparison)
- ✅ Product Performance (top products)

### Test Results

Successfully tested with real Supabase data (Oct 13-19, 2025):
- Total Sales: PHP 2,133,681.42
- Total Transactions: 4,090
- Top Store: Opus (33.5% market share)
- Peak Hour: 4 PM

