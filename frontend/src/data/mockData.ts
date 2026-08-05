export interface Project {
  id: number | string;
  name: string;
  url: string;
  framework: string;
  lastDeploy: string;
  branch: string;
  status: string;
  path: string;
  provider: string;
}

export const mockProjects: Project[] = [
  {
    id: 1,
    name: 'acme-store',
    url: 'acme-store.agent.app',
    framework: 'Next.js',
    lastDeploy: '10m ago',
    branch: 'main',
    status: 'Ready',
    path: '~/Projects/acme-store',
    provider: 'AWS ECS',
  },
  {
    id: 2,
    name: 'ai-backend-api',
    url: 'api.acmeco.com',
    framework: 'Python/FastAPI',
    lastDeploy: '2h ago',
    branch: 'main',
    status: 'Ready',
    path: '~/Work/ai-api',
    provider: 'AWS EC2',
  },
];

export interface Repository {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  updatedAt: string;
  language: string;
}

export const mockRepositories: Repository[] = [
  {
    id: 101,
    name: 'frontend-app',
    fullName: 'acme-corp/frontend-app',
    private: true,
    updatedAt: '2h ago',
    language: 'TypeScript',
  },
  {
    id: 102,
    name: 'backend-api',
    fullName: 'acme-corp/backend-api',
    private: true,
    updatedAt: '1d ago',
    language: 'Go',
  },
  {
    id: 103,
    name: 'marketing-site',
    fullName: 'acme-corp/marketing-site',
    private: false,
    updatedAt: '3d ago',
    language: 'Next.js',
  },
  {
    id: 104,
    name: 'auth-service',
    fullName: 'acme-corp/auth-service',
    private: true,
    updatedAt: '1w ago',
    language: 'Rust',
  },
];
