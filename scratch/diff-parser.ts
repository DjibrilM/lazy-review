function parseDiff(diffString: string) {
  const files: { file: string; diff: string }[] = [];
  const lines = diffString.split('\n');
  let currentFile = '';
  let currentDiff = '';

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      if (currentFile && currentDiff) {
        files.push({ file: currentFile, diff: currentDiff });
      }
      // Extract filename from "diff --git a/filename b/filename"
      const match = line.match(/diff --git a\/(.+?) b\/(.+?)$/);
      if (match) {
        currentFile = match[2];
      } else {
        currentFile = 'unknown';
      }
      currentDiff = line + '\n';
    } else {
      if (currentFile) {
        currentDiff += line + '\n';
      }
    }
  }

  if (currentFile && currentDiff) {
    files.push({ file: currentFile, diff: currentDiff });
  }

  return files;
}

const sampleDiff = `diff --git a/src/main.ts b/src/main.ts
index e69de29..d95f3ad 100644
--- a/src/main.ts
+++ b/src/main.ts
@@ -0,0 +1,2 @@
+console.log('test');
diff --git a/src/utils.ts b/src/utils.ts
index e69de29..d95f3ad 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -0,0 +1,2 @@
+export const add = (a, b) => a + b;
`;

console.log(parseDiff(sampleDiff));
