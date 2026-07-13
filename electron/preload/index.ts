import { contextBridge, ipcRenderer } from 'electron';
import type { ThalavedanaApi } from '../../src/shared/api';

const api: ThalavedanaApi = {
  ping: () => ipcRenderer.invoke('app:ping'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSetting: (key, value) => ipcRenderer.invoke('settings:save', key, value),
  getRepositories: () => ipcRenderer.invoke('repositories:list'),
  addRepository: (repoPath) => ipcRenderer.invoke('repositories:add', repoPath),
  removeRepository: (id) => ipcRenderer.invoke('repositories:remove', id),
  getReports: (limit) => ipcRenderer.invoke('reports:list', limit),
  generateReportForDate: (dateStr) => ipcRenderer.invoke('reports:generate-for-date', dateStr),
  retryPendingReports: () => ipcRenderer.invoke('reports:retry'),
  getLogs: (limit) => ipcRenderer.invoke('logs:get', limit),
  clearLogs: () => ipcRenderer.invoke('logs:clear'),
  startGmailAuth: () => ipcRenderer.invoke('gmail:start-auth'),
  inspectExcel: (filePath) => ipcRenderer.invoke('excel:inspect', filePath),
  
  getPipelineStatus: (dateStr) => ipcRenderer.invoke('orchestrator:get-status', dateStr),
  onStatusChange: (callback) => {
    const listener = (_event: any, status: any) => callback(status);
    ipcRenderer.on('orchestrator:status-change', listener);
    return () => {
      ipcRenderer.removeListener('orchestrator:status-change', listener);
    };
  }
};

contextBridge.exposeInMainWorld('thalavedana', api);
