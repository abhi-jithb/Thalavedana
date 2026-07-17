# Context Bridge API Reference

The React renderer process interacts with the Node.js backend through methods exposed on `window.thalavedana`.

## API Definition

### 1. General Info
```typescript
ping: () => Promise<{ ok: boolean; timestamp: string }>
```

### 2. Settings Management
```typescript
getSettings: () => Promise<SettingsData>
saveSetting: (key: keyof SettingsData, value: string) => Promise<void>
```

### 3. Repository Scope
```typescript
getRepositories: () => Promise<RepositoryData[]>
addRepository: (repoPath: string) => Promise<{ ok: boolean; name?: string; error?: string }>
removeRepository: (id: number) => Promise<void>
```

### 4. Reports & Manual Triggering
```typescript
getReports: (limit?: number) => Promise<ReportData[]>
generateReportForDate: (dateStr: string) => Promise<{ ok: boolean; error?: string }>
retryPendingReports: () => Promise<void>
```

### 5. Activity Console
```typescript
getLogs: (limit?: number) => Promise<LogData[]>
clearLogs: () => Promise<void>
```

### 6. Integrations
```typescript
startGmailAuth: () => Promise<{ email: string }>
inspectExcel: (filePath: string) => Promise<{ sheets: string[]; columnsPreview: string[] }>
```

### 7. Orchestration & Event Streaming
```typescript
getPipelineStatus: (dateStr: string) => Promise<PipelineStatus>
onStatusChange: (callback: (status: PipelineStatus) => void) => () => void
```
Returns an unsubscribe cleanup function. Pushes status updates during orchestrator execution.

### 8. Settings Event Subscription
```typescript
onSettingsChange: (callback: (settings: SettingsData) => void) => () => void
```
Returns an unsubscribe cleanup function and pushes settings updates when values change.

### 9. Retry and Approval Actions
```typescript
retryReportStage: (dateStr: string, stage: 'ai' | 'excel' | 'gmail') => Promise<{ ok: boolean; error?: string }>
approveReport: (
	dateStr: string,
	reportContent: string,
	emailSubject: string,
	emailBody: string
) => Promise<{ ok: boolean; error?: string }>
cancelReport: (dateStr: string) => Promise<{ ok: boolean; error?: string }>
```

### 10. Export and Shell Utilities
```typescript
exportReportMarkdown: (dateStr: string, content: string) => Promise<{ ok: boolean; path?: string; error?: string }>
openExternal: (url: string) => Promise<void>
openPath: (pathStr: string) => Promise<void>
```
