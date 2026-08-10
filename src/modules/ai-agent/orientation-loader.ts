import * as path from 'path';
import * as fs from 'fs/promises';

export async function preLoadOrientationFiles(
  absoluteRoot: string,
  indexingVersion: number,
  progress: (msg: string) => void,
  embedAndSaveFact: (content: string, filePath: string, metadata?: any) => any,
): Promise<string[]> {
  progress('📖 Identifying orientation files (README, package.json, entry points)...');
  const orientationFileContents: string[] = [];

  try {
    const resolvedPath = path.join(absoluteRoot, 'README.md');
    const stat = await fs.stat(resolvedPath);
    if (stat.isFile()) {
      progress('📄 Pre-loading: README.md');
      const readmeContent = await fs.readFile(resolvedPath, 'utf-8');
      const truncatedReadme =
        readmeContent.length > 2500
          ? readmeContent.substring(0, 2500) + '\n...[TRUNCATED FOR BREVITY]...'
          : readmeContent;

      orientationFileContents.push(`\n--- README.md ---\n${truncatedReadme}`);
      embedAndSaveFact(readmeContent, 'README.md', {
        source: 'orientation_file',
        version: indexingVersion,
      });
    }
  } catch {
    // ignore if README doesn't exist
  }

  const autoReadCandidates = [
    'package.json',
    'requirements.txt',
    'Pipfile',
    'setup.py',
    'pom.xml',
    'build.gradle',
    'Gemfile',
    'prisma/schema.prisma',
    'schema.graphql',
    'docker-compose.yml',
    'pyproject.toml',
    'Cargo.toml',
    'go.mod',
    '.env.example',
    'src/main.ts',
    'src/index.ts',
    'src/app.ts',
    'src/server.ts',
    'src/App.tsx',
  ];

  const readCandidate = async (candidate: string) => {
    try {
      const resolved = path.join(absoluteRoot, candidate);
      const stat = await fs.stat(resolved);
      if (stat.isFile() && stat.size < 80 * 1024) {
        progress(`📄 Pre-loading: ${candidate}`);
        const content = await fs.readFile(resolved, 'utf-8');
        const truncated =
          content.length > 2500
            ? content.substring(0, 2500) + '\n...[TRUNCATED FOR BREVITY]...'
            : content;

        orientationFileContents.push(`\n--- ${candidate} ---\n${truncated}`);
        embedAndSaveFact(content, candidate, {
          source: 'orientation_file',
          version: indexingVersion,
        });
      }
    } catch {
      // ignore if file doesn't exist
    }
  };

  await Promise.allSettled(autoReadCandidates.map((c) => readCandidate(c)));
  return orientationFileContents;
}
