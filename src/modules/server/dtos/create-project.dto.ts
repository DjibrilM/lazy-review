interface CreateProjectDto {
  repository_name: string;
  repository_url: string;
  environment_secrets?: Record<string, string>;
  ai_provider_id: string;
  ai_model?: string;
}
export type { CreateProjectDto };
