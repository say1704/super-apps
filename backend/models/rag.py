"""RAG vector store — potongan (chunk) pengetahuan + embedding untuk retrieval.

Diisi oleh utils/rag_index (auto-ingest dari docs/, app_knowledge.md, manifest modul,
Document Library, dan narasi operasional). Embedding disimpan sebagai BLOB float32 (384-dim,
ternormalisasi dari model-server). Retrieval oleh utils/rag_retrieve.
"""
from .base import Base
from sqlalchemy import Column, Integer, String, Text, DateTime, Index
from datetime import datetime, timezone


class RagChunk(Base):
    __tablename__ = "rag_chunk"
    __table_args__ = (
        Index("ix_rag_source", "source_type", "source_ref"),
        Index("ix_rag_hash", "content_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    source_type = Column(String, nullable=False, index=True)   # docs|knowledge|module|document_library|incident|worklog|risk|...
    source_ref = Column(String, nullable=True)                 # path file / id baris
    title = Column(String, nullable=True)
    module = Column(String, nullable=True)                     # kaitan modul (opsional)
    chunk_index = Column(Integer, default=0)
    text = Column(Text, nullable=False)
    embedding = Column(Text, nullable=True)                    # base64 float32 bytes (384) — lihat rag_index
    token_count = Column(Integer, default=0)
    content_hash = Column(String, nullable=False, index=True)
    owner_role = Column(String, nullable=True, index=True)     # RBAC: NULL = umum/publik-internal
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "source_type": self.source_type,
            "source_ref": self.source_ref,
            "title": self.title,
            "module": self.module,
            "chunk_index": self.chunk_index,
            "text": self.text,
            "token_count": self.token_count,
        }
