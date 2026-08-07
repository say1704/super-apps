from .base import Base
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey
from datetime import datetime, timezone


class PenilaianRisiko(Base):
    __tablename__ = "penilaian_risiko"

    id = Column(Integer, primary_key=True, index=True)
    nama_isu = Column(String)
    proses_bisnis = Column(String)
    nama_asset = Column(String)
    kerentanan = Column(Text)
    ancaman = Column(Text)
    risiko = Column(Text)
    akibat_dampak = Column(Text)
    frekuensi_sebelum = Column(Integer)
    frekuensi_sebelum_desc = Column(Text)
    dampak_sebelum = Column(Integer)
    dampak_sebelum_desc = Column(Text)
    dampak_sebelum_finansial = Column(Text)
    nilai_risiko_dasar = Column(Integer)
    pengendalian_yang_ada = Column(Text)
    pemilihan_kontrol = Column(Text)
    frekuensi_sesudah = Column(Integer)
    frekuensi_sesudah_desc = Column(Text)
    dampak_sesudah = Column(Integer)
    dampak_sesudah_desc = Column(Text)
    dampak_sesudah_finansial = Column(Text)
    nilai_risiko_sisa = Column(Integer)
    pengendalian_tambahan = Column(Text)
    kebutuhan_sumber_daya = Column(Text)
    penanggung_jawab = Column(String)
    target_waktu = Column(String, nullable=True)
    isu_matrix_id = Column(Integer, nullable=True)
    frekuensi_target = Column(Integer)
    frekuensi_target_desc = Column(Text)
    dampak_target = Column(Integer)
    dampak_target_desc = Column(Text)
    dampak_target_finansial = Column(Text)
    nilai_risiko_target = Column(Integer)
    tanggal_peninjauan = Column(Date)
    status_pelaksanaan = Column(String, default="Belum Dimulai")
    owner_role = Column(String(50), nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    deleted_at = Column(DateTime, nullable=True)
    version = Column(Integer, default=0)

class InterestedParty(Base):
    __tablename__ = "interested_parties"

    id = Column(Integer, primary_key=True, index=True)
    interested_party = Column(String)
    needs = Column(Text)
    expectations = Column(Text)
    risk = Column(String)
    opportunity = Column(String)
    owner_role = Column(String(50), nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    deleted_at = Column(DateTime, nullable=True)
    version = Column(Integer, default=0)

class Peluang(Base):
    __tablename__ = "peluang"

    id = Column(Integer, primary_key=True, index=True)
    opportunities = Column(Text)
    manfaat_diharapkan = Column(Text)
    manfaat_diharapkan_value = Column(Integer)
    manfaat_diharapkan_desc = Column(Text)
    manfaat_saat_ini = Column(Text)
    manfaat_saat_ini_value = Column(Integer)
    manfaat_saat_ini_desc = Column(Text)
    kebutuhan_sumber_daya = Column(Text)
    sumber_daya_value = Column(Integer)
    sumber_daya_desc = Column(Text)
    opportunity_grade = Column(String)
    opportunity_grade_label = Column(String)
    action_plan_what = Column(Text)
    action_plan_resources = Column(Text)
    action_plan_who = Column(String)
    action_plan_when = Column(String)
    action_plan_how = Column(Text)
    keterangan = Column(Text)
    owner_role = Column(String(50), nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    deleted_at = Column(DateTime, nullable=True)
    version = Column(Integer, default=0)

class IsuMatrix(Base):
    __tablename__ = "isu_matrix"

    id = Column(Integer, primary_key=True, index=True)
    kategori = Column(String)
    issues = Column(Text)
    risks = Column(Text)
    opportunities = Column(Text)
    owner_role = Column(String(50), nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    deleted_at = Column(DateTime, nullable=True)
    version = Column(Integer, default=0)

class RiskAssessmentForm(Base):
    __tablename__ = "risk_assessment_forms"

    id = Column(Integer, primary_key=True, index=True)
    document_number = Column(String)
    version = Column(String, default="1.0")
    date = Column(Date)
    created_by = Column(String)
    reviewed_by = Column(String)
    approved_by = Column(String)
    classification = Column(String)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class RiskAssessmentLog(Base):
    __tablename__ = "risk_assessment_logs"

    id = Column(Integer, primary_key=True, index=True)
    form_id = Column(Integer, ForeignKey("risk_assessment_forms.id"))
    date = Column(Date)
    prepared_by = Column(String)
    verified_by = Column(String)
    change_description = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class RiskAssessmentItem(Base):
    __tablename__ = "risk_assessment_items"

    id = Column(Integer, primary_key=True, index=True)
    form_id = Column(Integer, ForeignKey("risk_assessment_forms.id"))
    interested_party = Column(String)
    needs = Column(Text)
    expectations = Column(Text)
    risk = Column(Text)
    opportunity = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class OpportunityItem(Base):
    __tablename__ = "opportunity_items"

    id = Column(Integer, primary_key=True, index=True)
    form_id = Column(Integer, ForeignKey("risk_assessment_forms.id"))
    opportunity = Column(Text)
    benefits = Column(Text)
    current_state = Column(Text)
    resources = Column(Text)
    action_plan = Column(Text)
    evaluation_result = Column(Text)
    notes = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class IssueItem(Base):
    __tablename__ = "issue_items"

    id = Column(Integer, primary_key=True, index=True)
    form_id = Column(Integer, ForeignKey("risk_assessment_forms.id"))
    issue = Column(Text)
    risk = Column(Text)
    opportunities = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class ISMSNotes(Base):
    __tablename__ = "isms_notes"

    id = Column(Integer, primary_key=True, index=True)
    form_id = Column(Integer, ForeignKey("risk_assessment_forms.id"))
    notes = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
