# Developer Guide

## Quick Overview

Full-stack job search application with React, Django REST, PostgreSQL, all containerized with Docker.

**Tech Stack:**
- Frontend: React 18 + TypeScript + Vite
- Backend: Django 5.0 + Django REST Framework
- Database: PostgreSQL 15
- DevOps: Docker + Docker Compose

---

## Prerequisites (One-Time Install)

1. **Docker Desktop**: https://www.docker.com/products/docker-desktop/
2. **Git**: https://git-scm.com/
3. **VS Code** (recommended): https://code.visualstudio.com/

**You DON'T need:** Python, Node.js, PostgreSQL, or any packages. Docker handles everything.

---
### First-Time Setup (5 minutes)

```bash
# 1. Clone the repository
git clone <repository-url>
cd everify-job-search

# 2. Start Docker Desktop application
# Wait until you see "Docker Desktop is running"

# 3. Build containers (takes 2-3 minutes first time)
docker compose build

# 4. Start all services
docker compose up -d

# 5. Create database tables
docker compose exec backend python manage.py migrate

# 6. Create admin user
docker compose exec backend python manage.py createsuperuser
# Enter username, email (optional), and password

# 7. Verify everything works
# Open browser and visit:
# - Frontend: http://localhost:5173
# - Backend API: http://localhost:8000/swagger/
# - Admin Panel: http://localhost:8000/admin/

```

**✅ You're ready to code!**

---

## Daily Workflow

```bash
# Start working
docker compose up -d

# Code normally in VS Code
# - Edit frontend/src/ → Browser auto-refreshes
# - Edit backend/api/ → Django auto-reloads

# View logs (if needed)
docker compose logs -f

# Stop working
docker compose down
```

---

## Project Structure

```
everify-job-search/
├── docker-compose.yml
├── frontend/               # React + TypeScript
│   ├── src/
│   │   ├── App.tsx
│   │   ├── api/client.ts  # Axios + JWT
│   │   └── components/
│   └── Dockerfile
└── backend/               # Django REST
    ├── api/
    │   ├── models.py      # Database models
    │   ├── views.py       # API endpoints
    │   ├── serializers.py # Data formatting
    │   └── urls.py        # API routes
    ├── config/
    │   ├── settings.py    # Django config
    │   └── urls.py        # Main routing
    └── Dockerfile
```

---

## Common Tasks

### Add New Database Model

```python
# 1. Edit backend/api/models.py
class Job(models.Model):
    title = models.CharField(max_length=200)
    company = models.CharField(max_length=200)

# 2. Create and apply migration
docker compose exec backend python manage.py makemigrations
docker compose exec backend python manage.py migrate
```

### Add New API Endpoint

```python
# 1. Create serializer (backend/api/serializers.py)
class JobSerializer(serializers.ModelSerializer):
    class Meta:
        model = Job
        fields = '__all__'

# 2. Create view (backend/api/views.py)
class JobViewSet(viewsets.ModelViewSet):
    queryset = Job.objects.all()
    serializer_class = JobSerializer

# 3. Add route (backend/api/urls.py)
router.register(r'jobs', JobViewSet)

# 4. Test at http://localhost:8000/swagger/
```

### Add New React Component

```typescript
// frontend/src/components/JobList.tsx
import { useEffect, useState } from 'react';
import apiClient from '../api/client';

function JobList() {
  const [jobs, setJobs] = useState([]);
  
  useEffect(() => {
    apiClient.get('/jobs/').then(res => setJobs(res.data));
  }, []);
  
  return (
    <div>
      {jobs.map(job => <div key={job.id}>{job.title}</div>)}
    </div>
  );
}
```

### Add Dependencies

```bash
# Python package
# 1. Add to backend/requirements.txt
# 2. Rebuild
docker compose build backend
docker compose up -d

# npm package
docker compose exec frontend npm install <package>
docker compose build frontend
docker compose up -d
```

---

## Docker Commands

```bash
# Start/stop
docker compose up -d              # Start all
docker compose down               # Stop all
docker compose restart backend    # Restart one service

# Logs
docker compose logs -f            # All logs
docker compose logs -f backend    # Backend only

# Database
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py makemigrations
docker compose exec backend python manage.py shell

# Build
docker compose build              # Rebuild all
docker compose build backend      # Rebuild one
```

---

## Troubleshooting

### Changes not showing?
```bash
docker compose restart backend  # or frontend
```

### Port already in use?
```bash
docker compose down
# Or change ports in docker-compose.yml
```

### Complete reset (⚠️ deletes all data)
```bash
docker compose down -v
docker compose build
docker compose up -d
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py createsuperuser
```

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health/` | GET | Health check |
| `/api/token/` | POST | Get JWT token |
| `/api/token/refresh/` | POST | Refresh token |
| `/swagger/` | GET | API docs |
| `/admin/` | GET | Admin panel |

Test all endpoints at: http://localhost:8000/swagger/

---

## Access URLs

- **Frontend**: http://localhost:5173
- **API Docs**: http://localhost:8000/swagger/
- **Admin Panel**: http://localhost:8000/admin/
- **Database**: localhost:5432 (use pgAdmin/DBeaver)

---

## FAQ

**Q: Need to install Python/Node?**  
A: No! Docker has everything.

**Q: Can I use my editor normally?**  
A: Yes! Edit files, changes sync automatically.

**Q: What if my teammate uses Windows?**  
A: Docker ensures identical environments.

**Q: How to access database?**  
A: Use pgAdmin/DBeaver: `localhost:5432`, user/db: `jobtracker`, password: `jobtracker_password`

---

## Resources

- Django: https://docs.djangoproject.com/
- Django REST: https://www.django-rest-framework.org/
- React: https://react.dev/
- Docker: https://docs.docker.com/

---

**Happy Coding! 🚀**