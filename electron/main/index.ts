import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron';
import { createMainWindow } from './createWindow';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';
import { initDatabase, getSettings } from './database';
import { startScheduler, startupRecovery } from './services/schedulerService';

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
}

app.setName('Thalavedana');

let tray: Tray | null = null;
let isQuitting = false;

function createTray(win: BrowserWindow) {
  if (tray) return;

  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAN0lEQVQ4T2NkoBAwUqifAWQAMxBzGP5jGP4P9vifOfwPE6AoIBjR4EAwogEEAI2iFgEe8D0UDwAAS3sWAR7wPRQAAAAASUVORK5CYII='
  );
  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Thalavedana',
      click: () => {
        win.show();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Thalavedana - Automation Active');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });
}

app.on('before-quit', () => {
  isQuitting = true;
});

app.whenReady().then(() => {
  initDatabase();
  registerIpcHandlers();
  const mainWindow = createMainWindow();

  // Create tray icon
  createTray(mainWindow);

  // Intercept window close to minimize to tray if configured
  mainWindow.on('close', (event) => {
    const settings = getSettings();
    if (!isQuitting && settings.minimizeToTray === 'true') {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Start scheduler services
  startupRecovery().catch((err) => console.error('Startup recovery failed:', err));
  startScheduler();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const win = createMainWindow();
      createTray(win);
    } else {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  const settings = getSettings();
  const minToTray = settings.minimizeToTray === 'true';
  if (process.platform !== 'darwin' && !minToTray) {
    app.quit();
  }
});