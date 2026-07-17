import { useState, useEffect, useCallback } from 'react';
import type { 
  SettingsData, 
  RepositoryData, 
  ReportData, 
  LogData 
} from '../../shared/api';

export function useThalavedana() {
  const [settings, setSettings] = useState<SettingsData>({});
  const [repos, setRepos] = useState<RepositoryData[]>([]);
  const [reports, setReports] = useState<ReportData[]>([]);
  const [logs, setLogs] = useState<LogData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    try {
      const data = await window.thalavedana.getSettings();
      setSettings(data);
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    }
  }, []);

  // Fetch repositories
  const fetchRepos = useCallback(async () => {
    try {
      const data = await window.thalavedana.getRepositories();
      setRepos(data);
    } catch (err) {
      console.error('Failed to fetch repositories:', err);
    }
  }, []);

  // Fetch reports
  const fetchReports = useCallback(async () => {
    try {
      const data = await window.thalavedana.getReports();
      setReports(data);
    } catch (err) {
      console.error('Failed to fetch reports:', err);
    }
  }, []);

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    try {
      const data = await window.thalavedana.getLogs();
      setLogs(data);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    }
  }, []);

  // Initialize
  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([fetchSettings(), fetchRepos(), fetchReports(), fetchLogs()]);
    setIsLoading(false);
  }, [fetchSettings, fetchRepos, fetchReports, fetchLogs]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Polling logs and reports for real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      fetchLogs();
      fetchReports();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchLogs, fetchReports]);

  // Listen to IPC settings updates
  useEffect(() => {
    if (window.thalavedana.onSettingsChange) {
      const unsubscribe = window.thalavedana.onSettingsChange((updatedSettings) => {
        setSettings(updatedSettings);
      });
      return unsubscribe;
    }
    return undefined;
  }, []);

  // Save setting helper
  const saveSetting = async (key: keyof SettingsData, value: string) => {
    await window.thalavedana.saveSetting(key, value);
    await fetchSettings();
  };

  // Add Repository helper
  const addRepo = async (path: string) => {
    const res = await window.thalavedana.addRepository(path);
    if (res.ok) {
      await fetchRepos();
      await fetchLogs();
    }
    return res;
  };

  // Remove Repository helper
  const removeRepo = async (id: number) => {
    await window.thalavedana.removeRepository(id);
    await fetchRepos();
    await fetchLogs();
  };

  // Clear logs helper
  const clearLogs = async () => {
    await window.thalavedana.clearLogs();
    await fetchLogs();
  };

  // Run manually for date
  const generateForDate = async (dateStr: string) => {
    const res = await window.thalavedana.generateReportForDate(dateStr);
    await fetchReports();
    await fetchLogs();
    return res;
  };

  // Retry pending
  const retryPending = async () => {
    await window.thalavedana.retryPendingReports();
    await fetchReports();
    await fetchLogs();
  };

  // Gmail authentication
  const connectGmail = async () => {
    const res = await window.thalavedana.startGmailAuth();
    await fetchSettings();
    await fetchLogs();
    return res;
  };

  return {
    settings,
    repos,
    reports,
    logs,
    isLoading,
    saveSetting,
    addRepo,
    removeRepo,
    clearLogs,
    generateForDate,
    retryPending,
    connectGmail,
    refreshAll,
  };
}
