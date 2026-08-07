# AI System Architecture

## Arsitektur Overview

```
Chat Input → Intent Classifier → RAG Fetcher → Context Builder → LLM Inference → Response
                              ↘ Wizard Mode → Data Collector → Entity Parser → Generator
                              ↘ Workflow Mode → Step Executor → Action Handler → Result
```

## Model Server (`model_server.py`)

### Spesifikasi

| Item | Detail |
|------|--------|
| Port | 8081 (localhost) |
| Framework | llama-cpp-python (GGUF) |
| Shared Context | 8192 tokens |
| Batch Inference | Ya (multiple requests parallel) |
| Streaming | SSE (Server-Sent Events) |
| Auto-switch Model | Berdasarkan task complexity |

### Model

| Model | Type | RAM | Kegunaan |
|-------|------|-----|----------|
| **Light** (Qwen 2.5 1.5B Q4_K_M) | ~1GB | Chat ringan, intent classification, wizard |
| **Heavy** (Qwen 2.5 7B Q4_K_M) | ~4GB | Complex reasoning, workflow, analisa |
| **Embedder** (gte-Qwen2) | - | RAG embeddings |

### Auto-switch Logic

| Task | Model |
|------|-------|
| Intent classification | Light |
| Simple Q&A (dengan RAG context) | Light |
| Data wizard | Light |
| Workflow execution | Heavy |
| Complex analysis | Heavy |
| Report generation | Heavy |

## RAG Pipeline

### Alur Lengkap

1. **Query Analysis**: Parse user question → extract entities, intent, keywords
2. **Intent Routing**:
   - **Chat**: Percakapan umum
   - **Data Query**: Cari data spesifik (asset, risk, dll)
   - **Wizard**: Multi-step data creation
   - **Workflow**: Execute predefined workflow
3. **Data Fetching**: Query database via API internal untuk data relevan
4. **Knowledge Base Retrieval**: Search `knowledge_base` table + `app_knowledge.md` file
5. **Context Construction**: Gabungkan query + data + knowledge → prompt
6. **LLM Inference**: Generate response dengan context yang kaya
7. **Response Formatting**: Markdown, suggestions, follow-up questions

### Knowledge Base Sources

- **File**: `backend/utils/app_knowledge.md` — dokumentasi lengkap sistem
- **Table**: `knowledge_base` — dokumen tambahan yang bisa di-customize
- **Search Method**: Cosine similarity via embedding model
- **Auto-update**: Ketika ada perubahan data signifikan

## Wizard System

### Alur Wizard

Wizard memungkinkan user membuat data kompleks via NLP multi-step:

1. User: "Buat server baru untuk production"
2. AI: klasifikasi intent → "create_asset_server"
3. AI: tanya field yang diperlukan step-by-step
4. User: jawab setiap pertanyaan
5. AI: validasi input, konfirmasi, lalu create via API internal
6. Response: "Server sudah dibuat dengan ID #123"

### Field per Entity

| Entity | Fields |
|--------|--------|
| **Asset** | name, type, location, spec, IP, OS, purpose, dependencies |
| **Risk** | name, category, likelihood, impact, owner, treatment |
| **Ticket** | title, description, priority, category, assignee |
| **Project** | name, scope, timeline, budget, team, milestones |
| **Contract** | vendor, value, start/end date, terms, sla |

## Workflows

### Definisi

Workflow adalah urutan multi-step yang bisa dieksekusi AI. Didefinisikan di `workflows` table dengan:

- **Trigger**: Manual (user request) atau Scheduled (cron)
- **Steps**: Sequence of actions (create, update, notify, wait, approve)
- **Conditions**: If-then branching
- **Rollback**: Undo steps jika gagal

### Predefined Workflows

| Workflow | Steps |
|----------|-------|
| **Onboarding Server Baru** | create asset → assign location → add to monitoring → notify admin |
| **Incident Response** | create ticket → assign team → log incident → notify stakeholders |
| **Audit Preparation** | check compliance → compile documents → schedule audit → send reminders |
| **Backup Verification** | run restore test → check integrity → generate report → notify if failed |
| **Contract Renewal** | check terms → evaluate vendor → create renewal → get approval → execute |

## Conversation Memory

### Short-term Memory

- In-memory buffer
- Last 10 messages per session

### Long-term Memory

- Table: `ai_memory`
- Important facts extracted dari percakapan
- Format: `{entity: {attribute: value}}`
- Auto-extraction: setelah 3 pertanyaan terkait topik sama

## Audit Trail & Approval

- Semua AI action (create, update, delete) dicatat di `audit_log`
- Destructive actions butuh approval (delete asset, large purchase)
- Approval via notifikasi ke manager
- AI bisa menunggu approval sebelum lanjut

## Intents (Wordlists)

### Kategori Intent

| Kategori | Deskripsi |
|----------|-----------|
| chat | Percakapan umum |
| data_query | Mencari data spesifik |
| create | Membuat data baru |
| update | Mengupdate data |
| delete | Menghapus data |
| wizard | Multi-step data creation |
| workflow | Eksekusi workflow |
| report | Generate report |
| help | Bantuan |

### Custom Wordlist

- Table: `wordlists`
- Intent classification via keyword matching + LLM fallback
- Bisa ditambah via settings
