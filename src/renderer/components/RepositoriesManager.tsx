import React, { useState } from 'react';
import type { RepositoryData } from '../../shared/api';

interface RepositoriesManagerProps {
  repos: RepositoryData[];
  addRepo: (path: string) => Promise<{ ok: boolean; name?: string; error?: string }>;
  removeRepo: (id: number) => Promise<void>;
}

export default function RepositoriesManager({ repos, addRepo, removeRepo }: RepositoriesManagerProps) {
  const [repoPathInput, setRepoPathInput] = useState('');
  const [repoError, setRepoError] = useState('');
  const [repoLoading, setRepoLoading] = useState(false);

  const handleAddRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    setRepoError('');
    if (!repoPathInput.trim()) return;

    setRepoLoading(true);
    try {
      const res = await addRepo(repoPathInput.trim());
      if (res.ok) {
        setRepoPathInput('');
      } else {
        setRepoError(res.error || 'Failed to add repository.');
      }
    } catch (err: any) {
      setRepoError(err.message || 'An error occurred.');
    } finally {
      setRepoLoading(false);
    }
  };

  return (
    <div className="repositories-manager" style={{ maxWidth: '680px' }}>
      <h2 className="page-title">Git Repositories</h2>
      <p className="page-subtitle">Add or remove folders containing local git repositories that you want to track.</p>

      <div className="card" style={{ marginBottom: '24px' }}>
        <h3>Add New Repository</h3>
        <p className="description" style={{ marginBottom: '16px' }}>Provide the absolute local folder path to your active work directory.</p>
        
        <form onSubmit={handleAddRepo} className="form-group row" style={{ display: 'flex', gap: '8px' }}>
          <input 
            type="text" 
            placeholder="e.g. /home/username/Projects/my-project"
            value={repoPathInput}
            onChange={(e) => setRepoPathInput(e.target.value)}
            disabled={repoLoading}
            style={{ flexGrow: 1 }}
          />
          <button type="submit" className="btn btn--primary" disabled={repoLoading}>
            {repoLoading ? 'Verifying...' : 'Add Repository'}
          </button>
        </form>
        {repoError && <p className="error-text" style={{ marginTop: '10px' }}>{repoError}</p>}
      </div>

      <div className="card">
        <h3>Monitored Folders</h3>
        
        {repos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#D4D4D4', marginBottom: '12px' }}>
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <p className="dimmed">No repositories configured yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
            {repos.map((repo) => (
              <div key={repo.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--accent-light)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                <div>
                  <div style={{ fontWeight: '700', fontSize: '13px' }}>
                    {repo.name}
                    {repo.activeBranch && (
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--bg-app)', padding: '2px 6px', borderRadius: '10px', marginLeft: '8px', fontWeight: '500' }}>
                        Branch: {repo.activeBranch}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', wordBreak: 'break-all', marginTop: '2px' }}>
                    {repo.path}
                  </span>
                  {repo.lastCommitTime && (
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Last Commit: {repo.lastCommitTime} • Last Scan: {repo.lastScanTime || 'Never'}
                    </div>
                  )}
                  {repo.error && <p className="error-text" style={{ fontSize: '10px', marginTop: '4px' }}>Error: {repo.error}</p>}
                </div>
                <button 
                  className="btn btn--danger btn--sm" 
                  onClick={() => removeRepo(repo.id)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
