import type { CodebaseFacts } from '../types/codebase-facts';

export function markdownSection(title: string, content: string) {
  if (!content.trim()) return '';

  return `## ${title}\n\n${content}\n\n`;
}

export function formatEvidence(evidence?: string[]) {
  if (!evidence?.length) return '';

  return `\n\n**Evidence:** ${evidence.map((item) => `\`${item}\``).join(', ')}`;
}

export function buildMarkdown(facts: CodebaseFacts) {
  const sections: string[] = [];

  sections.push(`# ${facts.project_name || 'Project'}\n`);

  // Overview
  const overview: string[] = [];

  if (facts.application_type) {
    overview.push(`- **Application type:** ${facts.application_type}`);
  }

  if (facts.architecture_pattern) {
    overview.push(`- **Architecture:** ${facts.architecture_pattern}`);
  }

  if (facts.explanation) {
    overview.push('', facts.explanation);
  }

  sections.push(markdownSection('Overview', overview.join('\n')));

  // Runtime architecture
  if (facts.runtime_components?.length) {
    const content = facts.runtime_components
      .map((component) => {
        const lines = [`### ${component.name}`, '', component.responsibility];

        if (component.communicates_with?.length) {
          lines.push('', `**Communicates with:** ${component.communicates_with.join(', ')}`);
        }

        lines.push(formatEvidence(component.evidence));

        return lines.join('\n');
      })
      .join('\n\n');

    sections.push(markdownSection('Runtime Architecture', content));
  }

  // Entry points
  if (facts.entry_points?.length) {
    sections.push(
      markdownSection(
        'Entry Points',
        facts.entry_points
          .map((entry) => `### \`${entry.path}\`\n\n${entry.role}${formatEvidence(entry.evidence)}`)
          .join('\n\n'),
      ),
    );
  }

  // Data flows
  if (facts.data_flows?.length) {
    const content = facts.data_flows
      .map((flow) => {
        const lines = [`### ${flow.name}`, ''];

        if (flow.trigger) {
          lines.push(`**Trigger:** ${flow.trigger}`, '');
        }

        if (flow.steps?.length) {
          lines.push(
            ...flow.steps.map(
              (step, index) => `${index + 1}. **${step.component}** — ${step.action}`,
            ),
          );
        }

        lines.push(formatEvidence(flow.evidence));

        return lines.join('\n');
      })
      .join('\n\n');

    sections.push(markdownSection('Application Flows', content));
  }

  // Technology
  if (facts.tech_stack?.length) {
    sections.push(
      markdownSection('Technology Stack', facts.tech_stack.map((tech) => `- ${tech}`).join('\n')),
    );
  }

  // Core modules
  if (facts.core_modules?.length) {
    const content = facts.core_modules
      .map((module) => {
        const lines = [`### \`${module.path}\``, '', module.desc];

        if (module.responsibilities?.length) {
          lines.push(
            '',
            '**Responsibilities**',
            '',
            ...module.responsibilities.map((item) => `- ${item}`),
          );
        }

        if (module.depends_on?.length) {
          lines.push('', `**Depends on:** ${module.depends_on.join(', ')}`);
        }

        if (module.used_by?.length) {
          lines.push('', `**Used by:** ${module.used_by.join(', ')}`);
        }

        lines.push(formatEvidence(module.evidence));

        return lines.join('\n');
      })
      .join('\n\n');

    sections.push(markdownSection('Core Modules', content));
  }

  // Persistence
  if (facts.persistence?.length) {
    const content = facts.persistence
      .map((layer) => {
        const lines = [`### ${layer.technology}`, '', layer.responsibility];

        if (layer.stores?.length) {
          lines.push('', '**Stores**', '', ...layer.stores.map((item) => `- ${item}`));
        }

        lines.push(formatEvidence(layer.evidence));

        return lines.join('\n');
      })
      .join('\n\n');

    sections.push(markdownSection('Persistence', content));
  }

  // Communication
  if (facts.communication?.length) {
    const content = facts.communication
      .map((channel) => {
        const lines = [`### ${channel.mechanism}`, '', channel.purpose];

        if (channel.important_events_or_routes?.length) {
          lines.push(
            '',
            '**Important events / routes**',
            '',
            ...channel.important_events_or_routes.map((item) => `- \`${item}\``),
          );
        }

        lines.push(formatEvidence(channel.evidence));

        return lines.join('\n');
      })
      .join('\n\n');

    sections.push(markdownSection('Communication', content));
  }

  // Domain concepts
  if (facts.domain_concepts?.length) {
    const content = facts.domain_concepts
      .map((concept) => {
        const lines = [`### ${concept.name}`, '', concept.description];

        if (concept.related_modules?.length) {
          lines.push(
            '',
            `**Related modules:** ${concept.related_modules.map((module) => `\`${module}\``).join(', ')}`,
          );
        }

        lines.push(formatEvidence(concept.evidence));

        return lines.join('\n');
      })
      .join('\n\n');

    sections.push(markdownSection('Domain Concepts', content));
  }

  // Architectural constraints
  if (facts.architectural_invariants?.length) {
    const content = facts.architectural_invariants
      .map((invariant) => {
        const lines = [`- **${invariant.rule}**`];

        if (invariant.reason) {
          lines.push(`  - ${invariant.reason}`);
        }

        if (invariant.evidence?.length) {
          lines.push(`  - Evidence: ${invariant.evidence.map((item) => `\`${item}\``).join(', ')}`);
        }

        return lines.join('\n');
      })
      .join('\n');

    sections.push(markdownSection('Architectural Invariants', content));
  }

  // Folder structure
  if (facts.folder_structure) {
    sections.push(markdownSection('Project Structure', facts.folder_structure));
  }

  // Important details
  if (facts.important_details) {
    sections.push(markdownSection('Important Implementation Details', facts.important_details));
  }

  // Conventions
  if (facts.key_conventions?.length) {
    sections.push(
      markdownSection(
        'Key Conventions',
        facts.key_conventions.map((convention) => `- ${convention}`).join('\n'),
      ),
    );
  }

  // Environment
  if (facts.required_secrets?.length) {
    sections.push(
      markdownSection(
        'Environment Variables',
        facts.required_secrets
          .map((secret) => `- **${secret.key}** — ${secret.description}`)
          .join('\n'),
      ),
    );
  }

  // Unknowns
  if (facts.known_unknowns?.length) {
    sections.push(
      markdownSection(
        'Unresolved Questions',
        facts.known_unknowns.map((unknown) => `- ${unknown}`).join('\n'),
      ),
    );
  }

  return sections.filter(Boolean).join('\n');
}
