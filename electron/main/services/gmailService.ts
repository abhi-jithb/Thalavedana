import { google } from 'googleapis';
import http from 'node:http';
import crypto from 'node:crypto';
import { shell } from 'electron';
import { getSettings, saveSetting, deleteSetting, logToDb } from '../database';

const REDIRECT_PORT = 5999;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;

let oauthServer: http.Server | null = null;
let oauthStateToken: string | null = null;

// Singleton OAuth client instance
let sharedOAuth2Client: any = null;

export function resetOAuth2Client() {
  console.log("OAuth2 client instance reset triggered.");
  sharedOAuth2Client = null;
}

// Invalidate token if required scopes are missing
export function validateTokenScopes(): boolean {
  const settings = getSettings();
  const tokensRaw = settings.gmailTokens;
  if (!tokensRaw) return false;

  try {
    const tokens = JSON.parse(tokensRaw);
    const scopeString = tokens.scope || '';
    const scopes = scopeString.split(' ');

    const hasGmail = scopes.includes('https://www.googleapis.com/auth/gmail.send');
    const hasSheets = scopes.includes('https://www.googleapis.com/auth/spreadsheets');

    if (!hasGmail || !hasSheets) {
      logToDb('WARN', 'GMAIL', `Stored tokens are missing required scopes. Invalidation triggered. Granted scopes: ${scopeString}`);
      console.warn(`Stored tokens are missing required scopes. Invalidation triggered. Granted scopes: ${scopeString}`);
      
      deleteSetting('gmailTokens');
      deleteSetting('gmailUserEmail');
      resetOAuth2Client();
      return false;
    }
    return true;
  } catch (err) {
    return false;
  }
}

// Helper to get configured OAuth client (singleton)
export function getOAuth2Client(): any {
  // Check if scopes changed first
  validateTokenScopes();

  if (sharedOAuth2Client) {
    return sharedOAuth2Client;
  }

  const settings = getSettings();
  const clientId = settings.gmailClientId || '';
  const clientSecret = settings.gmailClientSecret || '';

  if (!clientId || !clientSecret) {
    throw new Error('Gmail Client ID or Client Secret is not configured in settings.');
  }

  sharedOAuth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  // Load existing tokens if they exist
  const tokensRaw = settings.gmailTokens;
  if (tokensRaw) {
    try {
      sharedOAuth2Client.setCredentials(JSON.parse(tokensRaw));
    } catch (err) {
      logToDb('ERROR', 'GMAIL', 'Failed to parse stored Gmail OAuth tokens');
    }
  }

  // Register token event listener to auto-persist refreshed tokens
  sharedOAuth2Client.on('tokens', (newTokens: any) => {
    console.log("OAuth client received auto-refreshed tokens:", newTokens);
    logToDb('INFO', 'GMAIL', 'OAuth client received auto-refreshed tokens.');

    const currentSettings = getSettings();
    if (currentSettings.gmailTokens) {
      try {
        const existing = JSON.parse(currentSettings.gmailTokens);
        const merged = { ...existing, ...newTokens };
        saveSetting('gmailTokens', JSON.stringify(merged));
      } catch (e) {
        saveSetting('gmailTokens', JSON.stringify(newTokens));
      }
    } else {
      saveSetting('gmailTokens', JSON.stringify(newTokens));
    }
  });

  return sharedOAuth2Client;
}

// Ensure the client has fresh, refreshed credentials before a request
export async function getAuthenticatedClient(): Promise<any> {
  const client = getOAuth2Client();
  try {
    const accessTokenObj = await client.getAccessToken();
    console.log("getAuthenticatedClient: Client verified. Access token exists:", !!accessTokenObj.token);
  } catch (err: any) {
    console.error("getAuthenticatedClient: Token refresh failed:", err.message);
    throw new Error(`Google authorization refresh failed: ${err.message}`);
  }
  return client;
}

// Start Gmail OAuth authorization process
export function startGmailAuthFlow(): Promise<{ email: string; tokens: any }> {
  return new Promise((resolve, reject) => {
    try {
      // Shut down previous server if running
      if (oauthServer) {
        oauthServer.close();
        oauthServer = null;
      }

      // Invalidate the old singleton client so we get a completely fresh setup
      resetOAuth2Client();
      const oauth2Client = getOAuth2Client();

      // Generate a secure random token to prevent CSRF attacks
      oauthStateToken = crypto.randomBytes(16).toString('hex');

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline', // Crucial to get a refresh_token
        prompt: 'consent',     // Force consent screen to guarantee refresh token is returned
        state: oauthStateToken, // Pass state token
        scope: [
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/spreadsheets',
        ],
      });

      // Start local server to capture redirect
      oauthServer = http.createServer(async (req, res) => {
        try {
          const urlObj = new URL(req.url || '', `http://localhost:${REDIRECT_PORT}`);
          if (urlObj.pathname === '/oauth2callback') {
            const state = urlObj.searchParams.get('state');
            const code = urlObj.searchParams.get('code');

            // Validate CSRF state token
            if (!state || state !== oauthStateToken) {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end('<h1>Auth Error</h1><p>Security validation failed. Invalid state token (CSRF mismatch).</p>');
              reject(new Error('Invalid state token returned (CSRF check failed)'));
              return;
            }

            if (!code) {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end('<h1>Auth Error</h1><p>No code returned from Google.</p>');
              reject(new Error('No authorization code returned'));
              return;
            }

            // Exchange authorization code for tokens
            const { tokens } = await oauth2Client.getToken(code);
            console.log("OAuth token exchange completed. Tokens object keys:", Object.keys(tokens));
            console.log("OAuth token scope returned:", tokens.scope);
            logToDb('INFO', 'GMAIL', `OAuth token exchange completed. Scope: ${tokens.scope}`);

            oauth2Client.setCredentials(tokens);

            // Fetch user's email address to verify identity
            const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
            const userInfo = await oauth2.userinfo.get();
            const email = userInfo.data.email || '';

            // Store tokens and email in settings
            saveSetting('gmailTokens', JSON.stringify(tokens));
            saveSetting('gmailUserEmail', email);

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: sans-serif; background-color: #07111f; color: #eef4ff; padding: 40px; text-align: center;">
                  <h1 style="color: #57d2c9;">Authentication Successful!</h1>
                  <p>Gmail account <strong>${email}</strong> has been successfully connected to Thalavedana.</p>
                  <p>You can close this tab and return to the application.</p>
                </body>
              </html>
            `);

            logToDb('INFO', 'GMAIL', `Successfully authenticated Gmail account: ${email}`);

            resolve({ email, tokens });
            
            // Clean up server
            setTimeout(() => {
              if (oauthServer) {
                oauthServer.close();
                oauthServer = null;
              }
            }, 1000);
          } else {
            res.writeHead(404);
            res.end('Not Found');
          }
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(`<h1>Auth Failed</h1><p>${err.message}</p>`);
          reject(err);
        }
      });

      oauthServer.on('error', (err: any) => {
        let errMsg = err.message;
        if (err.code === 'EADDRINUSE') {
          errMsg = `Port ${REDIRECT_PORT} is already in use. Please close the conflicting application and try again.`;
        }
        logToDb('ERROR', 'GMAIL', `OAuth server error: ${errMsg}`);
        reject(new Error(errMsg));
      });

      oauthServer.listen(REDIRECT_PORT, () => {
        logToDb('INFO', 'GMAIL', `OAuth callback server listening on port ${REDIRECT_PORT}`);
        shell.openExternal(authUrl);
      });
    } catch (err: any) {
      logToDb('ERROR', 'GMAIL', `Failed to start OAuth flow: ${err.message}`);
      reject(err);
    }
  });
}

// Send Gmail MIME email
export async function sendEmail({
  to,
  cc,
  bcc,
  subject,
  htmlBody,
}: {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  htmlBody: string;
}): Promise<void> {
  const settings = getSettings();
  const gmailTokens = settings.gmailTokens;
  
  if (!gmailTokens) {
    throw new Error('Gmail account is not authenticated. Please run the setup wizard.');
  }

  // Ensure client is authenticated and refreshed
  const oauth2Client = await getAuthenticatedClient();

  // Create Gmail API client
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  // Compile MIME message
  const mimeParts = [
    `To: ${to.join(', ')}`,
    cc && cc.length > 0 ? `Cc: ${cc.join(', ')}` : null,
    bcc && bcc.length > 0 ? `Bcc: ${bcc.join(', ')}` : null,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: 7bit`,
    '',
    htmlBody,
  ].filter(Boolean);

  const mimeMessage = mimeParts.join('\r\n');

  // Base64url encode the message
  const encodedMessage = Buffer.from(mimeMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  try {
    logToDb('INFO', 'GMAIL', `Sending email to ${to.join(', ')} with subject: "${subject}"`);
    
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    // Check if credentials refreshed and update db
    const currentCredentials = oauth2Client.credentials;
    saveSetting('gmailTokens', JSON.stringify(currentCredentials));

    logToDb('INFO', 'GMAIL', `Email sent successfully to: ${to.join(', ')}`);
  } catch (err: any) {
    logToDb('ERROR', 'GMAIL', `Failed to send email: ${err.message}`);
    throw err;
  }
}
