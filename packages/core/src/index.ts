/**
 * @orgloop/core — OrgLoop Runtime Engine
 *
 * Public API exports for library mode.
 */

export type {
	AuditFlag,
	AuditOutput,
	AuditQuery,
	AuditRecord,
	AuditTrailOptions,
} from './audit.js';
// Audit trail
export { AuditTrail, contentHash, generateAuditId } from './audit.js';
export type { BusHandler, EventBus } from './bus.js';
// Event bus
export { FileWalBus, InMemoryBus } from './bus.js';
// Errors
export {
	ConfigError,
	ConnectorError,
	DeliveryError,
	ModuleConflictError,
	ModuleNotFoundError,
	OrgLoopError,
	RuntimeError,
	SchemaError,
	TransformError,
} from './errors.js';
export type { EventHistoryOptions, EventHistoryQuery, EventRecord } from './event-history.js';
// Event history
export { EventHistory } from './event-history.js';
// Event processor (P1a extraction)
export { EventProcessor } from './event-processor.js';
// Handler bundles
export type {
	ApiHandler as BundleApiHandler,
	ApiResponse,
	ControlHandler,
	HandlerBundle,
	WebhookBundleHandler,
} from './handler-bundle.js';
export type {
	ApiHandler,
	ControlHandlerFn,
	RuntimeControl,
} from './http.js';
// HTTP webhook server
export { DEFAULT_HTTP_PORT, WebhookServer } from './http.js';
export type { InboxConfig, InboxManagerOptions } from './inbox.js';
export { InboxManager } from './inbox.js';
export { buildInboxApiBundle, registerInboxApi } from './inbox-api.js';
// Inbox
export type { DrainResult, InboxEntry, InboxStore } from './inbox-store.js';
export { InMemoryInboxStore } from './inbox-store.js';
// Logger manager
export { LoggerManager } from './logger.js';
export type { ChainNode, LoopCheckResult, LoopDetectorOptions } from './loop-detector.js';
// Loop detector
export { LoopDetector } from './loop-detector.js';
export type { MetricsServerOptions } from './metrics.js';
// Prometheus metrics
export { MetricsServer } from './metrics.js';
export type { ModuleConfig, ModuleContext } from './module-instance.js';
// Module system
export { ModuleInstance } from './module-instance.js';
export type { OutputValidationResult, OutputValidatorOptions } from './output-validator.js';
// Output validator
export { OutputValidator } from './output-validator.js';
export type { StripFrontMatterResult } from './prompt.js';
// Prompt utilities
export { stripFrontMatter } from './prompt.js';
export { ModuleRegistry } from './registry.js';
// REST API
export { buildRestApiBundle, registerRestApi } from './rest-api.js';
// Route stats
export type { RouteStats } from './route-stats-store.js';
export { RouteStatsStore } from './route-stats-store.js';
export type { MatchedRoute } from './router.js';
// Router
export { matchRoutes } from './router.js';
export type {
	LoadModuleOptions,
	RuntimeOptions,
	SingleModuleOptions,
	SourceCircuitBreakerOptions,
} from './runtime.js';
// Runtime (single entry point — replaces the legacy OrgLoop wrapper)
export { Runtime } from './runtime.js';
export type { RouteDetail, SourceDetail } from './runtime-accessors.js';
// Runtime control bundle — standalone utility for custom kernel setups
export { buildRuntimeControlBundle } from './runtime-control-bundle.js';
// Scheduler
export { Scheduler } from './scheduler.js';
export type { LoadConfigOptions } from './schema.js';
// Config loading + canonical Ajv authority
export {
	buildConfig,
	compileWithCanonicalAjv,
	getCanonicalAjv,
	loadConfig,
} from './schema.js';
export type { CheckpointStore, EventStore, WalEntry } from './store.js';
// Stores
export {
	FileCheckpointStore,
	FileEventStore,
	InMemoryCheckpointStore,
	InMemoryEventStore,
} from './store.js';
export type { SupervisorOptions, SupervisorStatus } from './supervisor.js';
// Supervisor
export { Supervisor } from './supervisor.js';
export type { TransformPipelineOptions, TransformPipelineResult } from './transform.js';
// Transform pipeline
export { executeTransformPipeline } from './transform.js';
// Validation
export type {
	PluginRegistration,
	ValidateProjectArgs,
	ValidationError as ProjectValidationError,
	ValidationResult,
	ValidationWarning,
} from './validate.js';
export { connectorKey, loggerKey, transformKey, validateProject } from './validate.js';
