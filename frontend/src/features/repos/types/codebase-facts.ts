export interface CoreModule {
  path: string;
  desc: string;
  responsibilities?: string[];
  depends_on?: string[];
  used_by?: string[];
  evidence?: string[];
}

export interface EntryPoint {
  path: string;
  role: string;
  evidence?: string[];
}

export interface RuntimeComponent {
  name: string;
  responsibility: string;
  communicates_with?: string[];
  evidence?: string[];
}

export interface DataFlowStep {
  component: string;
  action: string;
}

export interface DataFlow {
  name: string;
  trigger?: string;
  steps?: DataFlowStep[];
  evidence?: string[];
}

export interface CommunicationChannel {
  mechanism: string;
  purpose: string;
  important_events_or_routes?: string[];
  evidence?: string[];
}

export interface PersistenceLayer {
  technology: string;
  responsibility: string;
  stores?: string[];
  evidence?: string[];
}

export interface DomainConcept {
  name: string;
  description: string;
  related_modules?: string[];
  evidence?: string[];
}

export interface ArchitecturalInvariant {
  rule: string;
  reason?: string;
  evidence?: string[];
}

export interface RequiredSecret {
  key: string;
  description: string;
}

export interface CodebaseFacts {
  project_name?: string;
  application_type?: string;
  architecture_pattern?: string;
  explanation?: string;

  tech_stack?: string[];

  core_modules?: CoreModule[];

  folder_structure?: string;
  important_details?: string;

  key_conventions?: string[];
  required_secrets?: RequiredSecret[];

  entry_points?: EntryPoint[];
  runtime_components?: RuntimeComponent[];
  data_flows?: DataFlow[];
  communication?: CommunicationChannel[];
  persistence?: PersistenceLayer[];
  domain_concepts?: DomainConcept[];
  architectural_invariants?: ArchitecturalInvariant[];
  known_unknowns?: string[];
}
