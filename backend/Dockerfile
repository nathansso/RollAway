# Rollaway FastAPI backend (docs/MIGRATION-PLAN.md §2b).
# Build context = REPO ROOT (the service reads the authored KB/instructions
# from agents/ — single source of truth, no copies).
#
# Railway: Root Directory = repo root, Dockerfile Path = backend/Dockerfile.

FROM python:3.12-slim
WORKDIR /srv

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY agents/kb ./agents/kb
COPY agents/instructions ./agents/instructions
COPY agents/menu_rag/menu_kb.*.json ./agents/menu_rag/
COPY agents/menu_rag/menu.demo.json ./agents/menu_rag/

ENV AGENTS_DIR=/srv/agents \
    PYTHONUNBUFFERED=1

EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
