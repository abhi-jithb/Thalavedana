import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './createWindow';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';
import { initDatabase } from './database';
import { startScheduler, startupRecovery } from './services/schedulerService';

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
}

app.setName('Thalavedana');

app.whenReady().then(() => {
  initDatabase();
  registerIpcHandlers();
  createMainWindow();

  // Start scheduler services
  startupRecovery().catch((err) => console.error('Startup recovery failed:', err));
  startScheduler();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});