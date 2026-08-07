"""Shared Pydantic schemas for all API routers — backward compatible re-exports"""

from .base import OrmModel

from .auth import (
    Token, UserCreate, UserResponse, UserUpdate, ModuleAccess, UserWithModules,
    RefreshTokenRequest, RefreshTokenResponse,
    PasswordResetRequest, PasswordResetConfirm,
    RoleCreate, RoleUpdate,
    OtpSendResponse, OtpLoginRequest, LoginResponse,
    UserRegister, UserApprovalRequest,
    SessionResponse, SessionListResponse,
)

from .dashboard import (
    DashboardStatsResponse, TaskItemResponse, TodayOverviewResponse,
    WeekCategoryResponse, WeekOverviewResponse, TaskBreakdownResponse,
    PriorityBreakdownResponse, EnhancedDashboardResponse, ActivityItemResponse,
    InfrastructureStatusResponse, TodayFocusResponse, PriorityMatrixResponse,
)

from .tasks import (
    TaskStatsResponse, SprintResponse, TaskResponse, TaskByIdsResponse,
    TaskListPaginatedResponse,
    TaskWorklogsResponse, TaskWorklogLinkResponse, TaskCreateResponse,
    TaskDeleteResponse, TaskBulkResponse, SprintListPaginatedResponse,
    SprintDeleteResponse,
)

from .assets import (
    AssetStatsResponse, AssetResponse, AssetListResponse,
    AssetListPaginatedResponse, AssetStatsFullResponse, AssetNextCodeResponse,
    AssetCategoriesResponse, AssetCreateResponse, AssetUpdateResponse,
    AssetDeleteResponse, AssetPasswordDecryptResponse, AssetBulkResponse,
)

from .worklog import (
    WorklogStatsResponse, ChecklistItemResponse, WorklogResponse,
    WorklogListPaginatedResponse, ChecklistListResponse,
)

from .documents import (
    CategoryCreate, CategoryUpdate, DocumentResponse, CategoryResponse,
    DocumentListPaginatedResponse, DocumentStatsResponse, DocumentVersionResponse,
    DocumentActionResponse, DocumentBulkDeleteResponse, DocumentTemplateResponse,
    DocumentCategoryListResponse,
)

from .settings import (
    UserListResponse, RoleResponse, RoleListResponse, BackupScheduleCreate,
    BackupScheduleResponse, SmtpTestResponse, AdminUiResponse,
    SettingsBackupResponse, SettingsRestoreResponse,
    SettingsListPaginatedResponse, BackupScheduleListResponse,
)

from .incident import IncidentResponse, IncidentListPaginatedResponse

from .vulnerability import VulnerabilityResponse, VulnerabilityListPaginatedResponse

from .risk import (
    RiskStatsResponse, RiskAssessmentResponse, RiskAssessmentListPaginatedResponse,
    RiskItemResponse, RiskItemListPaginatedResponse, InterestedPartyResponse,
    InterestedPartyListPaginatedResponse, PeluangResponse, PeluangListPaginatedResponse,
    IsuMatrixResponse, IsuMatrixListPaginatedResponse, RiskStatsFullResponse,
)

from .quality import (
    QualityObjectiveResponse, QualityObjectiveListPaginatedResponse,
    QualityStatsResponse, QualityEntryResponse, QualityEntryListPaginatedResponse,
    QualityReportResponse, QualityReportObjective, QualityReportMonthData,
    QualityReportSummary,
)

from .notifications import (
    NotificationResponse, UnreadCountResponse, OnlineUserResponse,
    OnlineUserListResponse, NotificationListPaginatedResponse, MarkAllReadResponse,
)

from .health import (
    HealthDetailResponse, HealthResponse, HealthLiveResponse, HealthReadyResponse,
)

from .backup_analytics import (
    BackupStatsResponse, AnomalyResponse, BackupDailyReportResponse,
    BackupServerResponse, BackupServerListResponse, BackupServerDetailResponse,
    BackupTimelineResponse, BackupAlertResponse, BackupHeatmapResponse,
    BackupConsistencyResponse, BackupPeriodSummaryResponse,
    BackupMonthlyAggregationResponse, BackupTopServersResponse,
    BackupStatusDistributionResponse, BackupDailyTrendResponse,
)

from .backup_analytics_ml import (
    MLPredictionResponse, MLPredictionAllResponse, MLAnomalyAllResponse,
    MLSeasonalityResponse, MLModelInfoResponse, MLHealthScoreResponse,
    MLHealthScoreAllResponse, MLTrendResponse, MLFailureRiskResponse,
    MLFailureRiskAllResponse, MLClusterResponse, MLForecastResponse,
    MLEnhancedPredictAllResponse,
)

from .capacity_planning import (
    CapacityResponse, ProjectionResponse, CapacityServerResponse,
    CapacityServerListResponse, CapacityServerDetailResponse,
    CapacityHistoryResponse, CapacityPartitionResponse,
    CapacityPartitionListResponse, CapacityProjectionDetailResponse,
)

from .activity_logs import ActivityLogResponse, ActivityLogListPaginatedResponse

from .log_maintenance import LogMaintenanceResponse, LogMaintenanceListPaginatedResponse

from .log_compression import LogCompressionResponse, LogCompressionListPaginatedResponse

from .monthly_server import MonthlyCheckResponse, MonthlyCheckListPaginatedResponse

from .irmc import (
    IRMCCheckResponse, IRMCListPaginatedResponse, IrmcFolderResponse,
    IrmcFolderListPaginatedResponse, IrmcFolderCreate, IrmcFolderUpdate,
    IrmcFolderChecksResponse,
)

from .forms import FormUploadResponse, FormListPaginatedResponse, FormFolderResponse, FormFolderTreeResponse, FormFolderCreate, FormFolderUpdate, FormTypeResponse, FormTypeCreate, FormTypeUpdate

from .configurations import (
    ConfigurationItemResponse, ConfigurationListPaginatedResponse,
    ConfigurationStatsResponse, ConfigurationHistoryResponse,
    ConfigurationHistoryListResponse,
)

from .common import (
    PaginationInfo, MessageResponse, BulkOperationResponse,
    PasswordResetResponse, UserModulesResponse, UserListPaginatedResponse,
    RoleListPaginatedResponse, AllModulesResponse, VersionResponse,
)

__all__ = [
    "OrmModel",
    "Token", "UserCreate", "UserResponse", "UserUpdate", "ModuleAccess", "UserWithModules",
    "RefreshTokenRequest", "RefreshTokenResponse",
    "PasswordResetRequest", "PasswordResetConfirm",
    "RoleCreate", "RoleUpdate",
    "OtpSendResponse", "OtpLoginRequest", "LoginResponse",
    "UserRegister", "UserApprovalRequest",
    "SessionResponse", "SessionListResponse",
    "DashboardStatsResponse", "TaskItemResponse", "TodayOverviewResponse",
    "WeekCategoryResponse", "WeekOverviewResponse", "TaskBreakdownResponse",
    "PriorityBreakdownResponse", "EnhancedDashboardResponse", "ActivityItemResponse",
    "InfrastructureStatusResponse", "TodayFocusResponse", "PriorityMatrixResponse",
    "TaskStatsResponse", "SprintResponse", "TaskResponse", "TaskByIdsResponse", "TaskListPaginatedResponse",
    "TaskWorklogsResponse", "TaskWorklogLinkResponse", "TaskCreateResponse",
    "TaskDeleteResponse", "TaskBulkResponse", "SprintListPaginatedResponse",
    "SprintDeleteResponse",
    "AssetStatsResponse", "AssetResponse", "AssetListResponse",
    "AssetListPaginatedResponse", "AssetStatsFullResponse", "AssetNextCodeResponse",
    "AssetCategoriesResponse", "AssetCreateResponse", "AssetUpdateResponse",
    "AssetDeleteResponse", "AssetPasswordDecryptResponse", "AssetBulkResponse",
    "WorklogStatsResponse", "ChecklistItemResponse", "WorklogResponse",
    "WorklogListPaginatedResponse", "ChecklistListResponse",
    "CategoryCreate", "CategoryUpdate", "DocumentResponse", "CategoryResponse",
    "DocumentListPaginatedResponse", "DocumentStatsResponse", "DocumentVersionResponse",
    "DocumentActionResponse", "DocumentBulkDeleteResponse", "DocumentTemplateResponse",
    "DocumentCategoryListResponse",
    "UserListResponse", "RoleResponse", "RoleListResponse", "BackupScheduleCreate",
    "BackupScheduleResponse", "SmtpTestResponse", "AdminUiResponse",
    "SettingsBackupResponse", "SettingsRestoreResponse",
    "SettingsListPaginatedResponse", "BackupScheduleListResponse",
    "IncidentResponse", "IncidentListPaginatedResponse",
    "VulnerabilityResponse", "VulnerabilityListPaginatedResponse",
    "RiskStatsResponse", "RiskAssessmentResponse", "RiskAssessmentListPaginatedResponse",
    "RiskItemResponse", "RiskItemListPaginatedResponse", "InterestedPartyResponse",
    "InterestedPartyListPaginatedResponse", "PeluangResponse", "PeluangListPaginatedResponse",
    "IsuMatrixResponse", "IsuMatrixListPaginatedResponse", "RiskStatsFullResponse",
    "QualityObjectiveResponse", "QualityObjectiveListPaginatedResponse",
    "QualityStatsResponse", "QualityEntryResponse", "QualityEntryListPaginatedResponse",
    "QualityReportResponse", "QualityReportObjective", "QualityReportMonthData",
    "QualityReportSummary",
    "NotificationResponse", "UnreadCountResponse", "OnlineUserResponse",
    "OnlineUserListResponse", "NotificationListPaginatedResponse", "MarkAllReadResponse",
    "HealthDetailResponse", "HealthResponse", "HealthLiveResponse", "HealthReadyResponse",
    "BackupStatsResponse", "AnomalyResponse", "BackupDailyReportResponse",
    "BackupServerResponse", "BackupServerListResponse", "BackupServerDetailResponse",
    "BackupTimelineResponse", "BackupAlertResponse", "BackupHeatmapResponse",
    "BackupConsistencyResponse", "BackupPeriodSummaryResponse",
    "BackupMonthlyAggregationResponse", "BackupTopServersResponse",
    "BackupStatusDistributionResponse", "BackupDailyTrendResponse",
    "MLPredictionResponse", "MLPredictionAllResponse", "MLAnomalyAllResponse",
    "MLSeasonalityResponse", "MLModelInfoResponse", "MLHealthScoreResponse",
    "MLHealthScoreAllResponse", "MLTrendResponse", "MLFailureRiskResponse",
    "MLFailureRiskAllResponse", "MLClusterResponse", "MLForecastResponse",
    "MLEnhancedPredictAllResponse",
    "CapacityResponse", "ProjectionResponse", "CapacityServerResponse",
    "CapacityServerListResponse", "CapacityServerDetailResponse",
    "CapacityHistoryResponse", "CapacityPartitionResponse",
    "CapacityPartitionListResponse", "CapacityProjectionDetailResponse",
    "ActivityLogResponse", "ActivityLogListPaginatedResponse",
    "LogMaintenanceResponse", "LogMaintenanceListPaginatedResponse",
    "LogCompressionResponse", "LogCompressionListPaginatedResponse",
    "MonthlyCheckResponse", "MonthlyCheckListPaginatedResponse",
    "IRMCCheckResponse", "IRMCListPaginatedResponse", "IrmcFolderResponse",
    "IrmcFolderListPaginatedResponse", "IrmcFolderCreate", "IrmcFolderUpdate",
    "IrmcFolderChecksResponse",
    "FormUploadResponse", "FormListPaginatedResponse", "FormFolderResponse", "FormFolderTreeResponse", "FormFolderCreate", "FormFolderUpdate", "FormTypeResponse", "FormTypeCreate", "FormTypeUpdate",
    "ConfigurationItemResponse", "ConfigurationListPaginatedResponse",
    "ConfigurationStatsResponse", "ConfigurationHistoryResponse",
    "ConfigurationHistoryListResponse",
    "PaginationInfo", "MessageResponse", "BulkOperationResponse",
    "PasswordResetResponse", "UserModulesResponse", "UserListPaginatedResponse",
    "RoleListPaginatedResponse", "AllModulesResponse", "VersionResponse",
]
