import { Octokit } from 'octokit';
import os from 'os';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import { type SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';
import type { MainModule } from '../main.module.js';

class GithubModule {
  octokit: Octokit;
  git: SimpleGit;
  userName: string;
  mainModule: MainModule;

  constructor(mainModule?: MainModule) {
    if (mainModule) this.mainModule = mainModule;
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    });

    this.git = simpleGit({
      config: [`http.extraHeader=Authorization: Bearer ${process.env.GITHUB_TOKEN}`],
    });
  }

  init() {
    console.log('GitHub module initialized');
  }

  async cloneRepository({
    repository_name,
    repository_url,
  }: {
    repository_name: string;
    repository_url: string;
  }) {
    const homeDir = os.homedir();
    console.log({ repository_name });

    const repositoriesPath = path.join(homeDir, 'lazy-review', 'repositories');
    const repositoryPath = path.join(repositoriesPath, repository_name);

    const progressId = crypto.randomUUID();

    if (this.mainModule)
      this.mainModule.socket.emitProjectCreationLog({
        id: progressId,
        name: 'Cloning repository',
        actionProgress: 'pending',
        message: 'Starting repository clone...',
        type: 'info',
      });

    if (fs.existsSync(repositoryPath)) {
      if (this.mainModule) {
        this.mainModule.socket.emitProjectCreationLog({
          id: progressId,
          name: 'Cloning repository',
          actionProgress: 'pending',
          message: 'Repository already exists locally. Deleting existing folder to overwrite...',
          type: 'warning',
        });
      }
      fs.rmSync(repositoryPath, { recursive: true, force: true });
    }

    const token = process.env.GITHUB_TOKEN || '';

    const gitWithProgress = simpleGit({
      progress: ({ method, stage, progress, processed, total }) => {
        if (this.mainModule) {
          this.mainModule.socket.emitProjectCreationLog({
            id: progressId,
            name: `${method} ${stage}`,
            actionProgress: 'pending',
            message: `Git ${method}: ${stage} - ${progress}% (${processed}/${total} objects)`,
            type: 'action',
          });
        }
      },
    }).outputHandler((command, stdout, stderr) => {
      stderr.on('data', (data) => {
        const text = data.toString('utf8');
        const safeText = token ? text.split(token).join('***') : text;
        if (this.mainModule && safeText.trim()) {
          this.mainModule.socket.emitProjectCreationLog({
            id: crypto.randomUUID(),
            name: 'Processing',
            actionProgress: 'pending',
            message: safeText.trim(),
            type: 'info',
          });
        }
      });
      stdout.on('data', (data) => {
        const text = data.toString('utf8');
        const safeText = token ? text.split(token).join('***') : text;
        if (this.mainModule && safeText.trim()) {
          this.mainModule.socket.emitProjectCreationLog({
            id: crypto.randomUUID(),
            name: 'Processing',
            actionProgress: 'pending',
            message: safeText.trim(),
            type: 'info',
          });
        }
      });
    });

    try {
      const authUrl = repository_url.replace('https://', `https://x-access-token:${token}@`);
      await gitWithProgress.clone(authUrl, repositoryPath, ['--progress', '--verbose']);

      if (this.mainModule) {
        this.mainModule.socket.emitProjectCreationLog({
          id: progressId,
          name: 'Cloning repository',
          actionProgress: 'success',
          message: 'Successfully cloned repository under ' + repositoryPath,
          type: 'info',
        });
      }

      return { message: 'repository cloned successfully', repository_path: repositoryPath };
    } catch (error: any) {
      if (this.mainModule) {
        this.mainModule.socket.emitProjectCreationLog({
          id: progressId,
          name: 'Cloning repository',
          actionProgress: 'error',
          message: 'Failed to clone repository: ' + error.message,
          type: 'error',
        });
      }
      throw error;
    }
  }

  async listRepositories({ page = 1 }: { page?: number } = {}) {
    const { data } = await this.octokit.rest.repos.listForAuthenticatedUser({
      per_page: 100,
      page,
      sort: 'updated',
      direction: 'desc',
    });

    return { data };
  }

  private cachedRepos: any[] | null = null;
  private cacheTimestamp: number | null = null;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private async fetchAllUserRepos() {
    const now = Date.now();
    if (this.cachedRepos && this.cacheTimestamp && now - this.cacheTimestamp < this.CACHE_TTL) {
      return this.cachedRepos;
    }

    let page = 1;
    let allRepos: any[] = [];
    while (true) {
      const { data } = await this.octokit.rest.repos.listForAuthenticatedUser({
        per_page: 100,
        page,
        sort: 'updated',
        direction: 'desc',
      });
      allRepos = allRepos.concat(data);
      if (data.length < 100) {
        break;
      }
      page++;
    }

    this.cachedRepos = allRepos;
    this.cacheTimestamp = Date.now();
    return allRepos;
  }

  async searchRepository({ query, page = 1 }: { query: string; page?: number }) {
    // We still get authenticated user to match the original function structure if needed,
    // but listForAuthenticatedUser inherently gets repos for the logged in user.
    await this.octokit.rest.users.getAuthenticated();

    const allRepos = await this.fetchAllUserRepos();

    const lowerQuery = query.toLowerCase();
    const filteredRepos = allRepos.filter(
      (repo: any) =>
        repo.name.toLowerCase().includes(lowerQuery) ||
        (repo.description && repo.description.toLowerCase().includes(lowerQuery)),
    );

    const perPage = 100;
    const startIndex = (page - 1) * perPage;
    const paginatedRepos = filteredRepos.slice(startIndex, startIndex + perPage);

    return { data: paginatedRepos, total_count: filteredRepos.length };
  }

  async getUserByUser() {
    const { data } = await this.octokit.rest.users.getAuthenticated();
    return { data };
  }

  // Encrypts and sets a repository secret
  async setRepoSecret({
    owner,
    repo,
    secretName,
    secretValue,
  }: {
    owner: string;
    repo: string;
    secretName: string;
    secretValue: string;
  }) {
    try {
      console.log(`Fetching public key for ${owner}/${repo}...`);
      // 1. Get the public key
      const { data: publicKeyData } = await this.octokit.rest.actions.getRepoPublicKey({
        owner,
        repo,
      });

      // 2. Encrypt the secret using tweetnacl
      const messageBytes = naclUtil.decodeUTF8(secretValue);
      const publicKeyBytes = naclUtil.decodeBase64(publicKeyData.key);
      const ephemeralKeyPair = nacl.box.keyPair();

      let nonce: Uint8Array;
      try {
        const hash = crypto
          .createHash('blake2b512')
          .update(Buffer.concat([ephemeralKeyPair.publicKey, publicKeyBytes]))
          .digest();
        nonce = new Uint8Array(hash.slice(0, 24));
      } catch {
        const hash = crypto
          .createHash('sha256')
          .update(Buffer.concat([ephemeralKeyPair.publicKey, publicKeyBytes]))
          .digest();
        nonce = new Uint8Array(hash.slice(0, 24));
      }

      const encrypted = nacl.box(messageBytes, nonce, publicKeyBytes, ephemeralKeyPair.secretKey);
      const sealed = new Uint8Array(ephemeralKeyPair.publicKey.length + encrypted.length);
      sealed.set(ephemeralKeyPair.publicKey);
      sealed.set(encrypted, ephemeralKeyPair.publicKey.length);

      const encryptedValue = naclUtil.encodeBase64(sealed);

      console.log(`Setting repository secret "${secretName}" for ${owner}/${repo}...`);
      // 3. Put the secret
      const response = await this.octokit.rest.actions.createOrUpdateRepoSecret({
        owner,
        repo,
        secret_name: secretName,
        encrypted_value: encryptedValue,
        key_id: publicKeyData.key_id,
      });

      return {
        status: response.status,
        message: `Secret "${secretName}" set successfully`,
      };
    } catch (error: any) {
      console.error(`Failed to set repo secret:`, error);
      throw new Error(`Failed to set secret: ${error.message || error}`);
    }
  }

  async getPullRequests({ owner, repo }: { owner: string; repo: string }) {
    const { data } = await this.octokit.rest.pulls.list({
      owner,
      repo,
      state: 'all',
      sort: 'updated',
      direction: 'desc',
      per_page: 50,
    });
    return { data };
  }

  async getPRDiff({
    owner,
    repo,
    pull_number,
  }: {
    owner: string;
    repo: string;
    pull_number: number;
  }): Promise<string> {
    const response = await this.octokit.rest.pulls.get({
      owner,
      repo,
      pull_number,
      mediaType: { format: 'diff' },
    });
    // Octokit returns the raw diff as a string when format: 'diff' is requested
    return (response.data as unknown as string) || '';
  }

  async getPRCommits({
    owner,
    repo,
    pull_number,
  }: {
    owner: string;
    repo: string;
    pull_number: number;
  }) {
    const { data } = await this.octokit.rest.pulls.listCommits({
      owner,
      repo,
      pull_number,
      per_page: 50,
    });
    return {
      data: data.map((c) => ({
        sha: c.sha.substring(0, 7),
        message: c.commit.message.split('\n')[0], // first line only
        author: c.commit.author?.name || c.commit.author?.email || 'unknown',
        date: c.commit.author?.date || '',
      })),
    };
  }

  async submitPRReview({
    owner,
    repo,
    pull_number,
    body,
    event,
    comments,
  }: {
    owner: string;
    repo: string;
    pull_number: number;
    body: string;
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
    comments?: { path: string; position: number; body: string }[];
  }) {
    const { data } = await this.octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number,
      body,
      event,
      comments: comments || [],
    });
    return { data };
  }
}

export default GithubModule;
